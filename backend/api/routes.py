import uuid
from typing import Any

from fastapi import APIRouter, BackgroundTasks, HTTPException
from langchain_core.messages import AIMessage
from langgraph.types import Command
from pydantic import BaseModel, ValidationError
from json_repair import repair_json
from agent.graph import build_agent, build_draft_agent
from agent.prompts import EmailAnalysisResult

router = APIRouter()

# In-memory session store.
# Keyed by thread_id → holds status, tokens, interrupt payload, and final result.
# In production, replace with Redis.
_sessions: dict[str, dict[str, Any]] = {}


# ─── Pydantic models ──────────────────────────────────────────────────────────

class RunRequest(BaseModel):
    access_token: str
    refresh_token: str | None = None


class DraftRequest(BaseModel):
    access_token: str
    refresh_token: str | None = None
    # The specific email to draft a reply for
    email_id: str
    gmail_thread_id: str       # Gmail thread ID (to attach draft to same thread)
    subject: str
    sender: str
    sender_email: str
    date: str
    body: str


class ResumeRequest(BaseModel):
    thread_id: str
    decision: str  # "yes" | "no"


# ─── Background workers ───────────────────────────────────────────────────────

def _run_graph(thread_id: str) -> None:
    """
    Run the agent graph from the beginning (Phase 1: classify emails).
    Called in a BackgroundTask so the HTTP response returns immediately.
    """
    session = _sessions[thread_id]
    graph = build_agent(session["access_token"], session["refresh_token"])
    _sessions[thread_id]["graph"] = graph

    config = {"configurable": {"thread_id": thread_id}}
    _sessions[thread_id]["config"] = config

    try:
        invoke_result = graph.invoke(
            {"messages": [{"role": "user", "content": "Process my latest emails now."}]},
            config=config,
        )
        raw = invoke_result.get("messages", [])[-1].content
        result = repair_json(raw)
        print(result)
        _sessions[thread_id]["status"] = "done"
        _sessions[thread_id]["result"] = result

    except Exception as e:
        _sessions[thread_id]["status"] = "error"
        _sessions[thread_id]["error"] = str(e)


def _run_draft_graph(thread_id: str) -> None:
    """
    Run the draft agent for a single email (Phase 2: draft + HITL approval).
    Called in a BackgroundTask so the HTTP response returns immediately.
    """
    try:
        session = _sessions[thread_id]
        graph = build_draft_agent(session["access_token"], session["refresh_token"])
        _sessions[thread_id]["graph"] = graph

        config = {"configurable": {"thread_id": thread_id}}
        _sessions[thread_id]["config"] = config

        message = (
            f"Please write a professional draft reply for this email and ask for my approval.\n\n"
            f"Subject: {session['subject']}\n"
            f"From: {session['sender']} <{session['sender_email']}>\n"
            f"Date: {session['date']}\n"
            f"Email ID: {session['email_id']}\n"
            f"Thread ID: {session['gmail_thread_id']}\n\n"
            f"Email Body:\n{session['body']}"
        )

        invoke_result = graph.invoke(
            {"messages": [{"role": "user", "content": message}]},
            config=config,
        )
        _check_for_interrupt(thread_id, graph, config, invoke_result)
    except Exception as e:
        print(f"[draft] error in _run_draft_graph: {e}")
        _sessions[thread_id]["status"] = "error"
        _sessions[thread_id]["error"] = str(e)


def _resume_graph(thread_id: str, decision: str) -> None:
    """
    Resume the agent graph after a human-in-the-loop decision.
    Called in a BackgroundTask.
    """
    session = _sessions[thread_id]
    graph = session["graph"]
    config = session["config"]

    _sessions[thread_id]["status"] = "running"
    _sessions[thread_id]["interrupt"] = None

    try:
        invoke_result = graph.invoke(Command(resume=decision), config=config)
        msgs = invoke_result.get("messages", []) if invoke_result else []
        for m in msgs[-3:]:
            print(f"[resume] msg type={type(m).__name__} content={str(getattr(m,'content',''))[:200]}")
        _check_for_interrupt(thread_id, graph, config, invoke_result)
    except Exception as e:
        print(f"[resume] exception: {e}")
        _sessions[thread_id]["status"] = "error"
        _sessions[thread_id]["error"] = str(e)


def _check_for_interrupt(
    thread_id: str,
    graph: Any,
    config: dict,
    invoke_result: dict | None = None,
) -> None:
    """
    After graph.invoke() returns, inspect the state to determine whether
    the graph finished normally or hit an interrupt() call inside a tool.

    `invoke_result` is the dict returned by graph.invoke(); we use it to get
    the final messages directly so we don't have to re-fetch them from state.
    """
    state = graph.get_state(config)

    # `state.next` is the canonical LangGraph signal:
    #   - empty tuple  → graph finished normally
    #   - non-empty    → graph is paused at an interrupt
    if state.next:
        # Collect interrupt payloads from pending tasks
        interrupt_values = []
        for task in state.tasks:
            for intr in getattr(task, "interrupts", []):
                interrupt_values.append(intr.value)
        _sessions[thread_id]["status"] = "interrupted"
        _sessions[thread_id]["interrupt"] = interrupt_values[0] if interrupt_values else None
    else:
        # Graph finished — prefer messages from invoke_result (already in memory)
        # and fall back to state.values if invoke_result is missing or incomplete.
        messages = (
            (invoke_result or {}).get("messages")
            or state.values.get("messages", [])
        )
        result = _parse_final_result(messages)
        _sessions[thread_id]["status"] = "done"
        _sessions[thread_id]["result"] = result


def _extract_text(content) -> str | None:
    """
    Normalize LangChain message content to a plain string.
    Handles both the legacy str format and the newer list-of-blocks format:
      [{"type": "text", "text": "..."}, ...]
    """
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = [
            block.get("text", "")
            for block in content
            if isinstance(block, dict) and block.get("type") == "text"
        ]
        joined = "".join(parts)
        return joined if joined else None
    return None


def _parse_final_result(messages: list) -> dict:
    """
    Extract and validate the structured JSON from the agent's last AI message.
    Only inspects AIMessage instances (skips ToolMessage, HumanMessage, etc.).
    Parses into EmailAnalysisResult for schema validation, then returns as a dict.
    """
    for msg in reversed(messages):
        if not isinstance(msg, AIMessage):
            continue
        text = _extract_text(getattr(msg, "content", None))
        if not text:
            continue
        clean = text.strip()
        # Skip messages that are clearly not JSON
        if not clean.startswith("{"):
            continue
        # Strip markdown code fences if present
        if clean.startswith("```"):
            lines = clean.split("\n")
            clean = "\n".join(lines[1:-1])
        try:
            result = EmailAnalysisResult.model_validate_json(clean)
            return result.model_dump()
        except (ValidationError, ValueError):
            continue
    return {"emails": [], "raw": str(messages[-1].content) if messages else ""}


# ─── Routes ───────────────────────────────────────────────────────────────────

@router.post("/agent/run")
async def run_agent(req: RunRequest, background_tasks: BackgroundTasks):
    """
    Start a new agent run for the authenticated user (Phase 1: classify emails).
    Returns a thread_id immediately; client should poll /agent/status/{thread_id}.
    """
    thread_id = str(uuid.uuid4())

    _sessions[thread_id] = {
        "status": "running",
        "access_token": req.access_token,
        "refresh_token": req.refresh_token,
        "interrupt": None,
        "result": None,
        "error": None,
        "graph": None,
        "config": None,
    }

    background_tasks.add_task(_run_graph, thread_id)

    return {"thread_id": thread_id, "status": "running"}


@router.post("/agent/draft")
async def draft_email(req: DraftRequest, background_tasks: BackgroundTasks):
    """
    Start a draft agent run for a single email (Phase 2: draft + HITL approval).
    Returns a thread_id immediately; client should poll /agent/status/{thread_id}.
    """
    thread_id = str(uuid.uuid4())

    _sessions[thread_id] = {
        "status": "running",
        "access_token": req.access_token,
        "refresh_token": req.refresh_token,
        "email_id": req.email_id,
        "gmail_thread_id": req.gmail_thread_id,
        "subject": req.subject,
        "sender": req.sender,
        "sender_email": req.sender_email,
        "date": req.date,
        "body": req.body,
        "interrupt": None,
        "result": None,
        "error": None,
        "graph": None,
        "config": None,
    }

    background_tasks.add_task(_run_draft_graph, thread_id)

    return {"thread_id": thread_id, "status": "running"}


@router.get("/agent/status/{thread_id}")
async def get_status(thread_id: str):
    """
    Poll the current status of an agent run.

    Returns one of:
      - { status: "running" }
      - { status: "interrupted", interrupt: { type, email_id, subject, draft_content, ... } }
      - { status: "done" }
      - { status: "error", error: "..." }
    """
    session = _sessions.get(thread_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    return {
        "status": session["status"],
        "interrupt": session.get("interrupt"),
        "error": session.get("error"),
    }


@router.post("/agent/resume")
async def resume_agent(req: ResumeRequest, background_tasks: BackgroundTasks):
    """
    Resume an interrupted agent run with the human's decision ("yes" or "no").
    Returns immediately; client should continue polling /agent/status/{thread_id}.
    """
    session = _sessions.get(req.thread_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    print(f"[resume] thread={req.thread_id} status={session['status']} decision_len={len(req.decision)}")

    if session["status"] != "interrupted":
        raise HTTPException(
            status_code=400,
            detail=f"Session is not interrupted (current status: {session['status']})",
        )

    if not req.decision:
        raise HTTPException(status_code=400, detail="Decision must not be empty")

    background_tasks.add_task(_resume_graph, req.thread_id, req.decision)

    return {"status": "running"}


@router.get("/agent/result/{thread_id}")
async def get_result(thread_id: str):
    """
    Retrieve the final structured result once the agent has finished.
    """
    session = _sessions.get(thread_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if session["status"] != "done":
        raise HTTPException(
            status_code=400,
            detail=f"Agent has not finished yet (status: {session['status']})",
        )

    return {"status": "done", "result": session["result"]}