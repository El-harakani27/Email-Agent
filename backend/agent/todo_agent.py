import os
import json
from datetime import date
from pydantic import BaseModel, Field
from langchain_groq import ChatGroq
from dotenv import load_dotenv

load_dotenv()

VALID_TAGS = ["urgent", "important", "follow-up", "meeting", "payment", "review", "waiting-on", "bug"]

TODO_SYSTEM_PROMPT = f"""You are a productivity assistant. Your job is to extract all actionable todos from a list of classified emails.

## Valid Tags
Only use tags from this exact list: {', '.join(VALID_TAGS)}
Assign 1–3 tags per todo based on context.

## Your Rules
- Analyze EVERY email — including those marked has_task: false. They may contain implicit tasks.
- Create one todo per distinct action item.
- Deduplicate: if the same task is implied by multiple emails, create only one todo (use the most recent email's ID as source_email_id).
- Keep titles concise and actionable — start with a verb: "Reply to...", "Schedule...", "Review...", "Submit...", "Approve..."
- description: 1–2 sentences of context from the email so the user knows why this todo exists.
- due_hint: extract natural language hints from the email body like "today", "by Friday", "end of month". Set to null if nothing is mentioned.
- If there are truly no actionable tasks across all emails, return an empty todos list.
"""


class TodoItem(BaseModel):
    title: str
    description: str
    source_email_id: str
    tags: list[str] = Field(default_factory=list)
    due_hint: str | None = None


class TodoListResult(BaseModel):
    todos: list[TodoItem]


def extract_todos(emails: list[dict], target_date: date) -> list[TodoItem]:
    """
    Call the LLM with structured output to extract todos from classified emails.
    Always runs even if no emails have has_task=True — the LLM may find implicit tasks.
    Returns a (possibly empty) list of TodoItem objects.
    """
    model = ChatGroq(
        model="openai/gpt-oss-120b",
        api_key=os.getenv("GROQ_API_KEY"),
        temperature=0.1,
    )

    structured_llm = model.with_structured_output(TodoListResult)

    emails_json = json.dumps(emails, indent=2, ensure_ascii=False)
    date_str = target_date.strftime("%B %d, %Y")

    messages = [
        {"role": "system", "content": TODO_SYSTEM_PROMPT},
        {
            "role": "user",
            "content": (
                f"Here are the classified emails for {date_str}.\n"
                f"Extract all actionable todos:\n\n{emails_json}"
            ),
        },
    ]

    result: TodoListResult = structured_llm.invoke(messages)
    return result.todos
