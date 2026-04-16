"use client";

import { useState, useRef, useCallback } from "react";
import type {
  AgentStatus,
  AgentResult,
  DraftInterrupt,
  DraftStatus,
  EmailAnalysis,
} from "../types";

const POLL_INTERVAL_MS = 2000;

interface AgentState {
  status: AgentStatus;
  threadId: string | null;
  result: AgentResult | null;
  interrupt: DraftInterrupt | null;
  error: string | null;
  // Draft flow (Phase 2)
  draftStatus: DraftStatus;
  draftThreadId: string | null;
  draftInterrupt: DraftInterrupt | null;
  draftingEmailId: string | null;   // which email card is showing a spinner
  savedDraftIds: Set<string>;       // email IDs whose draft was saved successfully
}

export function useAgent() {
  const [state, setState] = useState<AgentState>({
    status: "idle",
    threadId: null,
    result: null,
    interrupt: null,
    error: null,
    draftStatus: "idle",
    draftThreadId: null,
    draftInterrupt: null,
    draftingEmailId: null,
    savedDraftIds: new Set(),
  });

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const draftPollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Main agent polling ────────────────────────────────────────────────────

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const pollStatus = useCallback(
    async (threadId: string) => {
      try {
        const res = await fetch(`/api/agent/status/${threadId}`);
        const data = await res.json();

        if (data.status === "interrupted") {
          stopPolling();
          setState((prev) => ({
            ...prev,
            status: "interrupted",
            interrupt: data.interrupt as DraftInterrupt,
          }));
        } else if (data.status === "done") {
          stopPolling();
          const resultRes = await fetch(`/api/agent/result/${threadId}`);
          const resultData = await resultRes.json();
          console.log("[useAgent] raw result from backend:", resultData.result);
          // result may arrive as a JSON string (when the backend skips parsing)
          const parsed: AgentResult =
            typeof resultData.result === "string"
              ? JSON.parse(resultData.result)
              : resultData.result;
          console.log("[useAgent] parsed result:", parsed);
          setState((prev) => ({
            ...prev,
            status: "done",
            result: parsed,
            interrupt: null,
          }));
        } else if (data.status === "error") {
          stopPolling();
          setState((prev) => ({
            ...prev,
            status: "error",
            error: data.error ?? "Unknown error",
          }));
        }
        // if "running" → keep polling
      } catch {
        stopPolling();
        setState((prev) => ({
          ...prev,
          status: "error",
          error: "Failed to reach the backend",
        }));
      }
    },
    [stopPolling]
  );

  const startPolling = useCallback(
    (threadId: string) => {
      stopPolling();
      pollingRef.current = setInterval(() => pollStatus(threadId), POLL_INTERVAL_MS);
    },
    [pollStatus, stopPolling]
  );

  // ── Draft agent polling ───────────────────────────────────────────────────

  const stopDraftPolling = useCallback(() => {
    if (draftPollingRef.current) {
      clearInterval(draftPollingRef.current);
      draftPollingRef.current = null;
    }
  }, []);

  const pollDraftStatus = useCallback(
    async (draftThreadId: string, emailId: string) => {
      try {
        const res = await fetch(`/api/agent/status/${draftThreadId}`);
        const data = await res.json();

        if (data.status === "interrupted") {
          stopDraftPolling();
          setState((prev) => ({
            ...prev,
            draftStatus: "interrupted",
            draftInterrupt: data.interrupt as DraftInterrupt,
            draftingEmailId: null,
          }));
        } else if (data.status === "done") {
          stopDraftPolling();
          // Check if the agent saved a draft (result will tell us, but we
          // optimistically mark it as saved since the agent only reaches "done"
          // after the full approval flow completes)
          setState((prev) => ({
            ...prev,
            draftStatus: "done",
            draftInterrupt: null,
            draftThreadId: null,
            draftingEmailId: null,
            savedDraftIds: new Set([...prev.savedDraftIds, emailId]),
          }));
        } else if (data.status === "error") {
          stopDraftPolling();
          setState((prev) => ({
            ...prev,
            draftStatus: "error",
            draftingEmailId: null,
          }));
        }
        // if "running" → keep polling
      } catch {
        stopDraftPolling();
        setState((prev) => ({
          ...prev,
          draftStatus: "error",
          draftingEmailId: null,
        }));
      }
    },
    [stopDraftPolling]
  );

  const startDraftPolling = useCallback(
    (draftThreadId: string, emailId: string) => {
      stopDraftPolling();
      draftPollingRef.current = setInterval(
        () => pollDraftStatus(draftThreadId, emailId),
        POLL_INTERVAL_MS
      );
    },
    [pollDraftStatus, stopDraftPolling]
  );

  // ── Public actions ────────────────────────────────────────────────────────

  /** Kick off the Phase 1 agent run (fetch + classify) for a specific date */
  const runAgent = useCallback(async (targetDate?: string) => {
    setState((prev) => ({
      ...prev,
      status: "running",
      threadId: null,
      result: null,
      interrupt: null,
      error: null,
    }));

    try {
      const res = await fetch("/api/agent/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_date: targetDate }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error ?? "Failed to start agent");

      setState((prev) => ({ ...prev, threadId: data.thread_id }));
      startPolling(data.thread_id);
    } catch (err) {
      setState((prev) => ({
        ...prev,
        status: "error",
        error: err instanceof Error ? err.message : "Unknown error",
      }));
    }
  }, [startPolling]);

  /** Kick off Phase 2: draft a reply for one specific email */
  const draftEmail = useCallback(
    async (email: EmailAnalysis) => {
      // Only one draft at a time
      if (state.draftStatus === "running" || state.draftStatus === "interrupted") return;

      setState((prev) => ({
        ...prev,
        draftStatus: "running",
        draftThreadId: null,
        draftInterrupt: null,
        draftingEmailId: email.id,
      }));

      try {
        const res = await fetch("/api/agent/draft", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email_id: email.id,
            gmail_thread_id: email.thread_id,
            subject: email.subject,
            sender: email.sender,
            sender_email: email.sender_email,
            date: email.date,
            body: email.body,
          }),
        });
        const data = await res.json();

        if (!res.ok) throw new Error(data.error ?? "Failed to start draft agent");

        setState((prev) => ({ ...prev, draftThreadId: data.thread_id }));
        startDraftPolling(data.thread_id, email.id);
      } catch (err) {
        setState((prev) => ({
          ...prev,
          draftStatus: "error",
          draftingEmailId: null,
          error: err instanceof Error ? err.message : "Draft failed",
        }));
      }
    },
    [state.draftStatus, startDraftPolling]
  );

  /** Send the user's draft decision.
   *  Pass "no" to skip, or the (possibly edited) draft content string to approve. */
  const sendDraftDecision = useCallback(
    async (value: string) => {
      if (!state.draftThreadId) return;

      const emailId = state.draftInterrupt?.email_id ?? null;

      setState((prev) => ({
        ...prev,
        draftStatus: "running",
        draftInterrupt: null,
        draftingEmailId: emailId,
      }));

      try {
        const res = await fetch("/api/agent/resume", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ thread_id: state.draftThreadId, decision: value }),
        });

        if (!res.ok) throw new Error("Failed to resume draft agent");

        if (emailId) startDraftPolling(state.draftThreadId, emailId);
      } catch (err) {
        setState((prev) => ({
          ...prev,
          draftStatus: "error",
          draftingEmailId: null,
          error: err instanceof Error ? err.message : "Resume failed",
        }));
      }
    },
    [state.draftThreadId, state.draftInterrupt, startDraftPolling]
  );

  /** Reset everything back to idle */
  const reset = useCallback(() => {
    stopPolling();
    stopDraftPolling();
    setState({
      status: "idle",
      threadId: null,
      result: null,
      interrupt: null,
      error: null,
      draftStatus: "idle",
      draftThreadId: null,
      draftInterrupt: null,
      draftingEmailId: null,
      savedDraftIds: new Set(),
    });
  }, [stopPolling, stopDraftPolling]);

  return { ...state, runAgent, draftEmail, sendDraftDecision, reset };
}
