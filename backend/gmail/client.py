import base64
import re
from datetime import date, timedelta
from email.mime.text import MIMEText

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
import os


class GmailClient:
    def __init__(self, access_token: str, refresh_token: str | None = None):
        self.creds = Credentials(
            token=access_token,
            refresh_token=refresh_token,
            token_uri="https://oauth2.googleapis.com/token",
            client_id=os.getenv("GOOGLE_CLIENT_ID"),
            client_secret=os.getenv("GOOGLE_CLIENT_SECRET"),
        )
        self.service = build("gmail", "v1", credentials=self.creds)

    def fetch_emails_for_date(self, target_date: date | None = None, max_results: int = 10) -> list[dict]:
        """
        Fetch emails received on a specific date (defaults to today).
        Uses Gmail's search query: after:YYYY/MM/DD before:YYYY/MM/DD+1
        """
        if target_date is None:
            target_date = date.today()

        after = target_date.strftime("%Y/%m/%d")
        before = (target_date + timedelta(days=1)).strftime("%Y/%m/%d")
        query = f"after:{after} before:{before}"

        results = (
            self.service.users()
            .messages()
            .list(userId="me", maxResults=max_results, labelIds=["INBOX"], q=query)
            .execute()
        )

        messages = results.get("messages", [])
        emails = []

        for msg in messages:
            detail = (
                self.service.users()
                .messages()
                .get(userId="me", id=msg["id"], format="full")
                .execute()
            )

            headers = {
                h["name"]: h["value"]
                for h in detail["payload"]["headers"]
            }

            emails.append({
                "id": msg["id"],
                "thread_id": detail["threadId"],
                "subject": headers.get("Subject", "(no subject)"),
                "sender": headers.get("From", "Unknown"),
                "sender_email": self._extract_email(headers.get("From", "")),
                "date": headers.get("Date", ""),
                "body": self._extract_body(detail["payload"])[:500],
                "snippet": detail.get("snippet", ""),
            })

        return emails

    def fetch_latest_emails(self, n: int = 4) -> list[dict]:
        results = (
            self.service.users()
            .messages()
            .list(userId="me", maxResults=n, labelIds=["INBOX"])
            .execute()
        )

        messages = results.get("messages", [])
        emails = []

        for msg in messages:
            detail = (
                self.service.users()
                .messages()
                .get(userId="me", id=msg["id"], format="full")
                .execute()
            )

            headers = {
                h["name"]: h["value"]
                for h in detail["payload"]["headers"]
            }

            emails.append({
                "id": msg["id"],
                "thread_id": detail["threadId"],
                "subject": headers.get("Subject", "(no subject)"),
                "sender": headers.get("From", "Unknown"),
                "sender_email": self._extract_email(headers.get("From", "")),
                "date": headers.get("Date", ""),
                "body": self._extract_body(detail["payload"])[:500],
                "snippet": detail.get("snippet", ""),
            })

        return emails

    def create_draft(
        self,
        thread_id: str,
        to: str,
        subject: str,
        body: str,
    ) -> str:
        message = MIMEText(body)
        message["To"] = to
        message["Subject"] = f"Re: {subject}"

        raw = base64.urlsafe_b64encode(message.as_bytes()).decode("utf-8")

        draft = (
            self.service.users()
            .drafts()
            .create(
                userId="me",
                body={"message": {"raw": raw, "threadId": thread_id}},
            )
            .execute()
        )

        return draft["id"]

    def _extract_body(self, payload: dict) -> str:
        if "parts" in payload:
            for part in payload["parts"]:
                if part["mimeType"] == "text/plain":
                    data = part["body"].get("data", "")
                    if data:
                        return base64.urlsafe_b64decode(data).decode(
                            "utf-8", errors="ignore"
                        )
            # Fallback: use first part with data, stripping HTML tags if needed
            for part in payload["parts"]:
                data = part["body"].get("data", "")
                if data:
                    text = base64.urlsafe_b64decode(data).decode(
                        "utf-8", errors="ignore"
                    )
                    if part["mimeType"] == "text/html":
                        text = self._strip_html(text)
                    return text

        data = payload.get("body", {}).get("data", "")
        if data:
            return base64.urlsafe_b64decode(data).decode("utf-8", errors="ignore")

        return ""

    def _strip_html(self, html: str) -> str:
        """Remove HTML tags and collapse whitespace for plain-text extraction."""
        text = re.sub(r"<[^>]+>", " ", html)
        text = re.sub(r"&[a-zA-Z]+;", " ", text)   # basic HTML entities
        text = re.sub(r"\s+", " ", text)
        return text.strip()

    def _extract_email(self, from_header: str) -> str:
        # Parse "Name <email@domain.com>" → "email@domain.com"
        if "<" in from_header and ">" in from_header:
            return from_header.split("<")[1].rstrip(">").strip()
        return from_header.strip()
