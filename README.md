# Email Flow

An AI-powered email assistant that fetches, classifies, and drafts replies to your Gmail emails — with human-in-the-loop approval before anything is saved.

## Features

- Fetches your 4 latest Gmail emails
- Classifies each by priority (High / Medium / Low) and type (Meeting Request, Action Required, etc.)
- Extracts action items and summaries
- Drafts professional replies on demand
- Human-in-the-loop review: edit the draft before saving to Gmail Drafts

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, React, Tailwind CSS |
| Backend | FastAPI, Python |
| AI Agent | LangGraph, LangChain, Groq (openai/gpt-oss-120b) |
| Email | Gmail API (Google OAuth 2.0) |
| Observability | LangSmith (optional) |

## Project Structure

```
Email-flow/
├── backend/
│   ├── agent/
│   │   ├── graph.py        # LangGraph agent builders (Phase 1 + Phase 2)
│   │   ├── prompts.py      # System prompts + Pydantic output schemas
│   │   └── tools.py        # Gmail tools + HITL interrupt tool
│   ├── api/
│   │   └── routes.py       # FastAPI routes (run / draft / status / resume / result)
│   ├── gmail/
│   │   └── client.py       # Gmail API wrapper (fetch + create draft)
│   ├── main.py             # FastAPI app entry point
│   ├── requirements.txt
│   └── .env.example
└── frontend/
    ├── app/
    │   ├── api/            # Next.js proxy routes (auth + agent)
    │   ├── components/     # EmailCard, DraftModal, ConnectButton
    │   ├── hooks/
    │   │   └── useAgent.ts # Polling logic for agent status
    │   ├── types/          # TypeScript types
    │   └── page.tsx        # Main page
    ├── package.json
    └── .env.local.example
```

## Setup

### Prerequisites

- Python 3.11+
- Node.js 18+
- A [Groq API key](https://console.groq.com)
- A Google Cloud project with the Gmail API enabled and OAuth 2.0 credentials

### 1. Clone the repo

```bash
git clone https://github.com/El-harakani27/Email-Agent.git
cd Email-Agent
```

### 2. Backend

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
```

Start the backend:
```bash
uvicorn main:app --reload --port 8000
```

### 3. Frontend

```bash
cd frontend
npm install

cp .env.local.example .env.local
# Fill in your keys in .env.local
```

**`frontend/.env.local`**
```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/callback
BACKEND_URL=http://localhost:8000
```

Start the frontend:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## How It Works

### Phase 1 — Classify

1. Click **Run Agent**
2. The agent fetches your 4 latest emails via the Gmail API
3. Each email is classified by priority, type, and whether it needs a reply
4. Results are displayed as cards

### Phase 2 — Draft (Human-in-the-Loop)

1. Click **Draft Reply** on any email card
2. The draft agent writes a professional reply
3. A modal appears with the draft — **you can edit it freely**
4. Click **Save Draft** to save to Gmail Drafts, or **Skip** to discard

## Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a project → Enable the **Gmail API**
3. Create **OAuth 2.0 credentials** (Web application)
4. Add `http://localhost:3000/api/auth/callback` as an authorized redirect URI
5. Copy the Client ID and Client Secret to both `.env` files