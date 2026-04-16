# Email Flow

An AI-powered email assistant that fetches, classifies, extracts todos, and drafts replies for your Gmail — with a daily calendar view and human-in-the-loop approval before anything is saved.

## Features

- **Email classification** — fetches emails for any selected day and classifies each by priority (High / Medium / Low), type (Meeting Request, Action Required, etc.), and whether it needs a reply
- **Todo extraction** — a dedicated AI agent automatically reads the classified emails and extracts actionable todos (with tags, due hints, and deduplication)
- **Daily calendar** — browse any past day's emails and todos; days with agent data are highlighted
- **Draft replies** — click "Draft Reply" on any email; the agent writes a professional reply and shows it for your approval before saving to Gmail Drafts
- **Human-in-the-loop** — edit the draft freely before saving; skip to discard without saving anything
- **Multi-user** — each user authenticates via Clerk and connects their own Gmail; all data is isolated per user
- **Persistent storage** — snapshots, todos, and tokens are stored in PostgreSQL

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14, React, Tailwind CSS, Clerk |
| Backend | FastAPI, Python |
| AI Agents | LangGraph, LangChain, Groq (openai/gpt-oss-120b) |
| Database | PostgreSQL 16 (Docker), SQLAlchemy, Alembic |
| Email | Gmail API (Google OAuth 2.0) |
| Auth | Clerk |
| Observability | LangSmith (optional) |

## Project Structure

```
Email-flow/
├── docker-compose.yml          # PostgreSQL container
├── backend/
│   ├── agent/
│   │   ├── graph.py            # LangGraph agent builders (Phase 1 + Phase 2)
│   │   ├── prompts.py          # System prompts + Pydantic output schemas
│   │   ├── tools.py            # Gmail tools + HITL interrupt tool
│   │   └── todo_agent.py       # Structured LLM call for todo extraction (Phase 3)
│   ├── api/
│   │   ├── routes.py           # Agent routes (run / draft / status / resume / result / snapshots)
│   │   ├── todos.py            # Todo CRUD (GET by date, PATCH, DELETE)
│   │   └── users.py            # User + Gmail token management
│   ├── db/
│   │   ├── database.py         # SQLAlchemy engine + session + Base
│   │   └── models.py           # User, GmailToken, DailySnapshot, Todo, Notification
│   ├── alembic/                # Database migrations
│   ├── gmail/
│   │   └── client.py           # Gmail API wrapper (fetch by date + create draft)
│   ├── main.py                 # FastAPI app entry point
│   ├── requirements.txt
│   └── .env.example
└── frontend/
    ├── app/
    │   ├── api/
    │   │   ├── agent/          # Proxy routes: run, draft, status, resume, result
    │   │   ├── auth/           # Google OAuth callback + status
    │   │   ├── snapshots/      # Proxy to FastAPI snapshot endpoints
    │   │   └── todos/          # Proxy to FastAPI todo endpoints
    │   ├── components/
    │   │   ├── Calendar.tsx    # Month grid with active-day highlights
    │   │   ├── ConnectButton.tsx
    │   │   ├── DayDetail.tsx   # Email list for a selected day
    │   │   ├── DraftModal.tsx  # HITL draft approval modal
    │   │   ├── EmailCard.tsx   # Single email card with draft button
    │   │   └── TodoPanel.tsx   # Todo list with checkbox, skip, delete, tags
    │   ├── hooks/
    │   │   └── useAgent.ts     # Agent + draft polling logic
    │   ├── types/              # TypeScript types (EmailAnalysis, Todo, etc.)
    │   └── page.tsx            # Main layout: sidebar + Emails/Todos tabs
    ├── package.json
    └── .env.local.example
```

## Setup

### Prerequisites

- Python 3.11+
- Node.js 18+
- Docker (for PostgreSQL)
- A [Groq API key](https://console.groq.com)
- A [Clerk](https://clerk.com) account
- A Google Cloud project with the Gmail API enabled and OAuth 2.0 credentials

### 1. Clone the repo

```bash
git clone https://github.com/El-harakani27/Email-Agent.git
cd Email-flow
```

### 2. Start the database

```bash
docker compose up -d
```

This starts a PostgreSQL 16 container on port 5432.

### 3. Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env
# Fill in your keys in .env
```

**`backend/.env`**
```
GROQ_API_KEY=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/callback
FRONTEND_URL=http://localhost:3000
DATABASE_URL=postgresql://emailflow_user:emailflow_pass@localhost:5432/emailflow

# Optional — LangSmith tracing
LANGSMITH_API_KEY=...
LANGSMITH_TRACING=true
LANGSMITH_ENDPOINT=https://api.smith.langchain.com
LANGSMITH_PROJECT=Email Assistant
```

Run database migrations:
```bash
alembic upgrade head
```

Start the backend:
```bash
uvicorn main:app --reload --port 8000
```

### 4. Frontend

```bash
cd frontend
npm install

cp .env.local.example .env.local
# Fill in your keys in .env.local
```

**`frontend/.env.local`**
```
# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
CLERK_SECRET_KEY=sk_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/

# Google OAuth
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/callback

# Backend
BACKEND_URL=http://localhost:8000
```

Start the frontend:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## How It Works

### Phase 1 — Classify emails

1. Select a day on the calendar and click **Run Agent**
2. The agent fetches all emails for that day via the Gmail API (up to 10)
3. Each email is classified by priority, type, summary, and action items
4. Results are saved to the database and displayed under the **Emails** tab

### Phase 2 — Extract todos (automatic)

After Phase 1 finishes, a second AI agent automatically:
1. Reads the classified emails for that day
2. Extracts actionable todos with titles, descriptions, tags, and due hints
3. Deduplicates tasks that appear in multiple emails
4. Saves todos to the database — visible immediately under the **Todos** tab

### Phase 3 — Draft replies (Human-in-the-Loop)

1. Click **Draft Reply** on any email card
2. The draft agent writes a professional reply (under 150 words)
3. A modal appears with the draft — **you can edit it freely**
4. Click **Save Draft** to save to Gmail Drafts, or **Skip** to discard

### Todo management

- Check the circle to mark a todo **done** (or click again to revert)
- Click **Skip** to hide a todo without deleting it
- Click **×** to permanently delete a todo
- Skipped todos are collapsed at the bottom and can be restored

## Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a project → Enable the **Gmail API**
3. Create **OAuth 2.0 credentials** (Web application)
4. Add `http://localhost:3000/api/auth/callback` as an authorized redirect URI
5. Under **OAuth consent screen → Test users**, add the Gmail account you want to test with
6. Copy the Client ID and Secret into both `.env` files

## Clerk Setup

1. Create a project at [clerk.com](https://clerk.com)
2. Copy the Publishable Key and Secret Key into `frontend/.env.local`
3. Set the allowed redirect URLs in the Clerk dashboard to `http://localhost:3000`
