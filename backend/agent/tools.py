import json
from datetime import date
from langchain_core.tools import tool
from langgraph.types import interrupt
from gmail.client import GmailClient


def create_email_tools(gmail_client: GmailClient, target_date: date | None = None) -> list:
    """
    Phase 1 tools: fetch + classify only. No drafting.
    target_date: the day to fetch emails for (defaults to today).
    """
    fetch_date = target_date or date.today()

    @tool
    def fetch_todays_emails() -> str:
        """
        Fetch all emails received on the target date from the user's Gmail inbox (up to 10).
        Returns a JSON list of emails with id, thread_id, subject, sender,
        sender_email, date, body, and snippet.
        Always call this tool first before any analysis.
        """
        emails = gmail_client.fetch_emails_for_date(target_date=fetch_date, max_results=10)
        return json.dumps({
            "date": fetch_date.isoformat(),
            "count": len(emails),
            "emails": emails,
        }, ensure_ascii=False)

    return [fetch_todays_emails]


def create_draft_tools(gmail_client: GmailClient) -> list:
    """
    Phase 2 tools: request approval + save draft.
    Used by the draft agent when the user clicks 'Draft Reply' on an email card.
    """

    @tool
    def request_draft_approval(
        email_id: str,
        thread_id: str,
        subject: str,
        sender_email: str,
        draft_content: str,
    ) -> str:
        """
        Show the human a draft reply and ask for approval before saving it.
        This tool PAUSES execution and waits for the user to respond 'yes' or 'no'.

        Args:
            email_id: The Gmail message ID of the email being replied to.
            thread_id: The Gmail thread ID (needed to save the draft in the same thread).
            subject: The subject of the original email.
            sender_email: The email address of the sender (will be the 'To' of the draft).
            draft_content: The full text of the draft reply you have written.
        """
        decision: str = interrupt({
            "type": "draft_approval",
            "email_id": email_id,
            "thread_id": thread_id,
            "subject": subject,
            "sender_email": sender_email,
            "draft_content": draft_content,
        })
        # decision is "no" (skip) or the content to save (original or user-edited)
        if decision == "no":
            return json.dumps({"approved": False})
        content = draft_content if decision == "yes" else decision
        return json.dumps({
            "approved": True,
            "thread_id": thread_id,
            "sender_email": sender_email,
            "subject": subject,
            "draft_content": content,
        })

    @tool
    def save_email_draft(
        thread_id: str,
        sender_email: str,
        subject: str,
        draft_content: str,
    ) -> str:
        """
        Save a draft reply to Gmail Drafts. Only call this after the human
        has approved the draft via request_draft_approval (response was 'yes').

        Args:
            thread_id: The Gmail thread ID to attach the draft to.
            sender_email: The recipient email address for the draft.
            subject: The subject line of the original email.
            draft_content: The body of the draft reply to save.
        """
        print(f"[save_draft] thread_id={thread_id} to={sender_email} subject={subject}")
        draft_id = gmail_client.create_draft(
            thread_id=thread_id,
            to=sender_email,
            subject=subject,
            body=draft_content,
        )
        print(f"[save_draft] saved → draft_id={draft_id}")
        return json.dumps({"success": True, "draft_id": draft_id})

    return [request_draft_approval, save_email_draft]
