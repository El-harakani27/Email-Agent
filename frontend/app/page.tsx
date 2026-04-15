"use client";

import { useEffect, useState } from "react";
import { ConnectButton } from "./components/ConnectButton";
import { EmailCard } from "./components/EmailCard";
import { DraftModal } from "./components/DraftModal";
import { useAgent } from "./hooks/useAgent";

export default function Home() {
  const [connected, setConnected] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const {
    status, result, error,
    draftStatus, draftInterrupt, draftingEmailId, savedDraftIds,
    runAgent, draftEmail, sendDraftDecision, reset,
  } = useAgent();

  // Check auth status on mount (reads httpOnly cookie server-side)
  useEffect(() => {
    fetch("/api/auth/status")
      .then((r) => r.json())
      .then((d) => setConnected(d.connected))
      .finally(() => setCheckingAuth(false));
  }, []);

  async function handleDisconnect() {
    await fetch("/api/auth/status", { method: "DELETE" });
    setConnected(false);
    reset();
  }

  const isRunning = status === "running";
  const isDone = status === "done";

  // DraftModal is shown when the draft agent hits a HITL interrupt
  const showDraftModal = draftStatus === "interrupted" && draftInterrupt != null;
  // While the user is in the modal deciding, the confirm button shows a spinner
  const isDraftDeciding = draftStatus === "running" && draftInterrupt == null && draftingEmailId != null;

  return (
    <main className="max-w-3xl mx-auto px-4 py-12 flex flex-col gap-8">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Email Flow</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            AI-powered email analysis with human-in-the-loop drafts
          </p>
        </div>

        {!checkingAuth && (
          <ConnectButton connected={connected} onDisconnect={handleDisconnect} />
        )}
      </div>

      {/* Not connected state */}
      {!checkingAuth && !connected && (
        <div className="text-center py-20 border-2 border-dashed border-gray-200 rounded-2xl">
          <div className="text-4xl mb-4">📬</div>
          <h2 className="text-lg font-semibold text-gray-700 mb-2">
            Connect your Gmail to get started
          </h2>
          <p className="text-sm text-gray-500 mb-6 max-w-sm mx-auto">
            The AI agent will analyze your latest 4 emails, assign priorities
            and types, extract tasks, and help you draft replies.
          </p>
          <a
            href="/api/auth/google"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Connect Gmail
          </a>
        </div>
      )}

      {/* Connected — run agent button */}
      {connected && status === "idle" && (
        <div className="text-center py-16 bg-white border border-gray-200 rounded-2xl shadow-sm">
          <div className="text-4xl mb-4">🤖</div>
          <h2 className="text-lg font-semibold text-gray-700 mb-2">
            Ready to analyze your inbox
          </h2>
          <p className="text-sm text-gray-500 mb-6">
            The agent will fetch your 4 latest emails, classify them, and
            extract action items.
          </p>
          <button
            onClick={runAgent}
            className="px-6 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Run Agent
          </button>
        </div>
      )}

      {/* Running state */}
      {isRunning && (
        <div className="flex flex-col items-center gap-4 py-16">
          <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
          <p className="text-sm text-gray-500">
            Agent is processing your emails...
          </p>
        </div>
      )}

      {/* Error state */}
      {status === "error" && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-5 flex items-start gap-3">
          <span className="text-red-500 text-xl">⚠️</span>
          <div>
            <p className="font-semibold text-red-700 text-sm">Something went wrong</p>
            <p className="text-red-600 text-sm mt-0.5">{error}</p>
            <button
              onClick={reset}
              className="mt-3 text-xs text-red-600 underline hover:text-red-800"
            >
              Try again
            </button>
          </div>
        </div>
      )}

      {/* Results — email cards */}
      {isDone && result && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-700">
              {result.emails.length} emails analyzed
            </h2>
            <button
              onClick={() => { reset(); }}
              className="text-sm text-indigo-600 hover:text-indigo-800 underline"
            >
              Run again
            </button>
          </div>

          {result.emails.map((email, i) => (
            <EmailCard
              key={email.id}
              email={email}
              index={i}
              onDraftClick={email.has_task ? () => draftEmail(email) : undefined}
              isDrafting={draftingEmailId === email.id}
              draftSaved={savedDraftIds.has(email.id)}
            />
          ))}
        </div>
      )}

      {/* HITL Draft Modal — shown when draft agent pauses for approval */}
      {showDraftModal && (
        <DraftModal
          interrupt={draftInterrupt!}
          onDecision={sendDraftDecision}
          isLoading={isDraftDeciding}
        />
      )}
    </main>
  );
}
