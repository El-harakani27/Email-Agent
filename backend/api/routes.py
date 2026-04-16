import uuid
from datetime import date
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from langchain_core.messages import AIMessage
from langgraph.types import Command
from pydantic import BaseModel, ValidationError
from sqlalchemy.orm import Session
from json_repair import repair_json
from agent.graph import build_agent, build_draft_agent
from agent.prompts import EmailAnalysisResult
from db.database import get_db
from db.models import DailySnapshot

router = APIRouter()

# In-memory session store.
# Keyed by thread_id → holds status, tokens, interrupt payload, and final result.
# In production, replace with Redis.
_sessions: dict[str, dict[str, Any]] = {}


# ─── Pydantic models ──────────────────────────────────────────────────────────

class RunRequest(BaseModel):
    clerk_user_id: str
    access_token: str
    refresh_token: str | None = None
    target_date: str | None = None      # YYYY-MM-DD, defaults to today if None


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

def _save_snapshot(clerk_user_id: str, result: dict, snapshot_date: date | None = None) -> None:
    """
    Persist the agent result to daily_snapshots for this user and the target date.
    Uses upsert logic: if a snapshot already exists for that date, update it.
    """
    from db.database import SessionLocal
    db = SessionLocal()
    try:
        target = snapshot_date or date.today()
        snapshot = db.query(DailySnapshot).filter(
            DailySnapshot.user_id == clerk_user_id,
            DailySnapshot.snapshot_date == target,
        ).first()

        emails = result.get("emails", [])

        if snapshot:
            snapshot.emails = emails
            snapshot.agent_result = result
        else:
            snapshot = DailySnapshot(
                user_id=clerk_user_id,
                snapshot_date=target,
                emails=emails,
                agent_result=result,
            )
            db.add(snapshot)

        db.commit()
        print(f"[snapshot] saved for user={clerk_user_id} date={target} emails={len(emails)}")
    except Exception as e:
        print(f"[snapshot] error saving: {e}")
        db.rollback()
    finally:
        db.close()


def _run_todo_agent(clerk_user_id: str, emails: list, target_date) -> None:
    """
    Extract todos from the classified emails for a given day and save them to the DB.
    Replaces any agent-generated todos for that (user, date) pair so re-runs are safe.
    Carried-over todos (carried_from_date IS NOT NULL) are never deleted.
    """
    import uuid as _uuid
    from agent.todo_agent import extract_todos
    from db.database import SessionLocal
    from db.models import Todo

    db = SessionLocal()
    try:
        todo_items = extract_todos(emails, target_date)

        # Delete previous agent-generated todos for this user+date (re-run safe).
        # We keep carried-over todos (those have carried_from_date set).
        db.query(Todo).filter(
            Todo.user_id == clerk_user_id,
            Todo.date == target_date,
            Todo.carried_from_date == None,  # noqa: E711
        ).delete(synchronize_session=False)

        for item in todo_items:
            todo = Todo(
                id=_uuid.uuid4(),
                user_id=clerk_user_id,
                date=target_date,
                title=item.title,
                description=item.description,
                source_email_id=item.source_email_id,
                tags=item.tags,
                due_hint=item.due_hint,
                status="pending",
            )
            db.add(todo)

        db.commit()
        print(f"[todos] saved {len(todo_items)} todos for user={clerk_user_id} date={target_date}")
    except Exception as e:
        print(f"[todos] error: {e}")
        db.rollback()
    finally:
        db.close()


def _run_graph(thread_id: str) -> None:
    """
    Run the agent graph from the beginning (Phase 1: classify emails).
    Called in a BackgroundTask so the HTTP response returns immediately.
    """
    import json
    from datetime import date as _date, datetime as _datetime

    session = _sessions[thread_id]

    # Resolve target date — use provided date or fall back to today
    target_date_str = session.get("target_date")
    if target_date_str:
        target_date = _datetime.strptime(target_date_str, "%Y-%m-%d").date()
    else:
        target_date = _date.today()

    graph = build_agent(session["access_token"], session["refresh_token"], target_date=target_date)
    _sessions[thread_id]["graph"] = graph

    config = {"configurable": {"thread_id": thread_id}}
    _sessions[thread_id]["config"] = config

    date_label = target_date.strftime("%B %d, %Y")

    try:
        invoke_result = graph.invoke(
            {"messages": [{"role": "user", "content": f"Fetch and analyze all my emails for {date_label}."}]},
            config=config,
        )
        raw = invoke_result.get("messages", [])[-1].content
        result = repair_json(raw)
        print(result)
        _sessions[thread_id]["status"] = "done"
        _sessions[thread_id]["result"] = result

        # Persist result to daily_snapshots for the target date (not always today)
        clerk_user_id = session.get("clerk_user_id")
        if clerk_user_id:
            try:
                result_dict = json.loads(result) if isinstance(result, str) else result
                _save_snapshot(clerk_user_id, result_dict, snapshot_date=target_date)
                _run_todo_agent(clerk_user_id, result_dict.get("emails", []), target_date)
            except Exception as e:
                print(f"[snapshot] failed to parse result: {e}")

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
        "clerk_user_id": req.clerk_user_id,
        "access_token": req.access_token,
        "refresh_token": req.refresh_token,
        "target_date": req.target_date,
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


@router.get("/snapshots/{clerk_user_id}")
def get_snapshots(clerk_user_id: str, db: Session = Depends(get_db)):
    """
    Return all daily snapshots for a user, newest first.
    Used by the email calendar UI.
    """
    snapshots = (
        db.query(DailySnapshot)
        .filter(DailySnapshot.user_id == clerk_user_id)
        .order_by(DailySnapshot.snapshot_date.desc())
        .all()
    )
    return [
        {
            "date": s.snapshot_date.isoformat(),
            "emails": s.emails,
            "agent_result": s.agent_result,
        }
        for s in snapshots
    ]


@router.get("/snapshots/{clerk_user_id}/{snapshot_date}")
def get_snapshot_by_date(clerk_user_id: str, snapshot_date: str, db: Session = Depends(get_db)):
    """
    Return a single snapshot for a user on a specific date (YYYY-MM-DD).
    """
    snapshot = db.query(DailySnapshot).filter(
        DailySnapshot.user_id == clerk_user_id,
        DailySnapshot.snapshot_date == snapshot_date,
    ).first()

    if not snapshot:
        raise HTTPException(status_code=404, detail="No snapshot for this date")

    return {
        "date": snapshot.snapshot_date.isoformat(),
        "emails": snapshot.emails,
        "agent_result": snapshot.agent_result,
    }