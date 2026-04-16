import uuid
from datetime import datetime, date
from sqlalchemy import (
    Column, String, Text, Date, DateTime,
    Integer, ForeignKey, UniqueConstraint, func
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from db.database import Base


class User(Base):
    """
    One row per app user.
    id is the Clerk user_id (e.g. user_2abc123) — no auto-increment needed.
    """
    __tablename__ = "users"

    id = Column(String, primary_key=True)          # Clerk user_id
    email = Column(String, unique=True, nullable=False)
    created_at = Column(DateTime, server_default=func.now())

    gmail_token = relationship("GmailToken", back_populates="user", uselist=False, cascade="all, delete-orphan")
    snapshots = relationship("DailySnapshot", back_populates="user", cascade="all, delete-orphan")
    todos = relationship("Todo", back_populates="user", cascade="all, delete-orphan")
    notifications = relationship("Notification", back_populates="user", cascade="all, delete-orphan")


class GmailToken(Base):
    """
    Stores Gmail OAuth tokens for a user.
    Tokens are encrypted before being saved (see db/crypto.py).
    """
    __tablename__ = "gmail_tokens"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    access_token = Column(Text, nullable=False)     # stored encrypted
    refresh_token = Column(Text)                    # stored encrypted
    expires_at = Column(DateTime)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    user = relationship("User", back_populates="gmail_token")


class DailySnapshot(Base):
    """
    One row per user per day — what the agent fetched and analyzed that day.
    """
    __tablename__ = "daily_snapshots"
    __table_args__ = (UniqueConstraint("user_id", "snapshot_date"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    snapshot_date = Column(Date, nullable=False)
    emails = Column(JSONB, nullable=False, default=list)        # raw emails fetched
    agent_result = Column(JSONB)                                # agent classification output
    created_at = Column(DateTime, server_default=func.now())

    user = relationship("User", back_populates="snapshots")


class Todo(Base):
    """
    A task for a user on a specific day.
    Can be extracted from an email or created manually.
    Carries over to the next day if not completed.
    """
    __tablename__ = "todos"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    date = Column(Date, nullable=False)                         # which day this todo belongs to
    title = Column(String, nullable=False)
    description = Column(Text)
    source_email_id = Column(String)                            # Gmail message ID if from an email
    status = Column(String, nullable=False, default="pending")  # pending | done | skipped
    tags = Column(JSONB, nullable=False, default=list)          # ['urgent', 'important', 'follow-up', ...]
    due_hint = Column(String)                                    # natural language hint: "today", "by Friday", etc.
    carried_from_date = Column(Date)                            # original date if carried over
    carry_count = Column(Integer, nullable=False, default=0)    # how many times carried over
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    user = relationship("User", back_populates="todos")
    notifications = relationship("Notification", back_populates="todo", cascade="all, delete-orphan")


class Notification(Base):
    """
    Tracks notifications sent to a user about a todo (carry-over alerts, reminders).
    """
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    todo_id = Column(UUID(as_uuid=True), ForeignKey("todos.id", ondelete="CASCADE"), nullable=False)
    type = Column(String, nullable=False)                       # carry_over | reminder
    sent_at = Column(DateTime, server_default=func.now())
    read_at = Column(DateTime)                                  # null = unread

    user = relationship("User", back_populates="notifications")
    todo = relationship("Todo", back_populates="notifications")
