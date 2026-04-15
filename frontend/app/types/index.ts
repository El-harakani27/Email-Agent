export type Priority = "High" | "Medium" | "Low";

export type EmailType =
  | "Meeting Request"
  | "Action Required"
  | "Follow-up"
  | "Invoice / Payment"
  | "Newsletter / Promo"
  | "Support / Bug Report"
  | "Information / FYI"
  | "Urgent Alert";

export interface EmailAnalysis {
  id: string;
  thread_id: string;       // Gmail thread ID — used when requesting a draft
  subject: string;
  sender: string;
  sender_email: string;
  date: string;
  body: string;            // Email body (truncated) — passed to the draft agent
  priority: Priority;
  type: EmailType;
  has_task: boolean;
  summary: string;
  action_items: string[];
  draft_saved: boolean;
}

export interface AgentResult {
  emails: EmailAnalysis[];
}

/** Payload sent by the backend when the agent hits a draft_approval interrupt */
export interface DraftInterrupt {
  type: "draft_approval";
  email_id: string;
  thread_id: string;
  subject: string;
  sender_email: string;
  draft_content: string;
}

export type AgentStatus = "idle" | "running" | "interrupted" | "done" | "error";
export type DraftStatus = "idle" | "running" | "interrupted" | "done" | "error";
