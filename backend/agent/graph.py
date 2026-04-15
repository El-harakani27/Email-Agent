import os
import sqlite3
from langchain.agents import create_agent
from langchain_groq import ChatGroq
from langgraph.checkpoint.sqlite import SqliteSaver

from agent.tools import create_email_tools, create_draft_tools
from agent.prompts import SYSTEM_PROMPT, DRAFT_SYSTEM_PROMPT
from gmail.client import GmailClient
from dotenv import load_dotenv

load_dotenv()

os.environ["LANGSMITH_API_KEY"] = os.getenv("LANGSMITH_API_KEY", "")
os.environ["LANGSMITH_TRACING"] = os.getenv("LANGSMITH_TRACING", "")
os.environ["LANGSMITH_ENDPOINT"] = os.getenv("LANGSMITH_ENDPOINT", "")
os.environ["LANGSMITH_PROJECT"] = os.getenv("LANGSMITH_PROJECT", "Email Assistant")

# Create a single persistent SQLite connection at module level.
# SqliteSaver.from_conn_string() in v3+ returns a context manager, so we
# pass a raw connection directly to avoid the '_GeneratorContextManager' error.
_db_conn = sqlite3.connect("./agent_state.db", check_same_thread=False)
_checkpointer = SqliteSaver(_db_conn)


def build_agent(access_token: str, refresh_token: str | None = None):
    """
    Build the Phase 1 agent: fetches + classifies emails, outputs JSON.
    No drafting — the user triggers drafts manually per email.
    """
    gmail_client = GmailClient(
        access_token=access_token,
        refresh_token=refresh_token,
    )

    tools = create_email_tools(gmail_client)

    model = ChatGroq(
        model="openai/gpt-oss-120b",
        api_key=os.getenv("GROQ_API_KEY"),
        temperature=0.2,
    )

    graph = create_agent(
        model=model,
        tools=tools,
        system_prompt=SYSTEM_PROMPT,
        checkpointer=_checkpointer,
    )

    return graph


def build_draft_agent(access_token: str, refresh_token: str | None = None):
    """
    Build the Phase 2 agent: writes a draft reply for one email, asks HITL approval.
    Only has request_draft_approval and save_email_draft tools (no fetch tool).
    """
    gmail_client = GmailClient(
        access_token=access_token,
        refresh_token=refresh_token,
    )

    tools = create_draft_tools(gmail_client)

    model = ChatGroq(
        model="openai/gpt-oss-120b",
        api_key=os.getenv("GROQ_API_KEY"),
        temperature=0.2,
    )

    graph = create_agent(
        model=model,
        tools=tools,
        system_prompt=DRAFT_SYSTEM_PROMPT,
        checkpointer=_checkpointer,
    )

    return graph
