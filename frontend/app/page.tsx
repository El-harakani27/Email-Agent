"use client";

import { useEffect, useState } from "react";
import { UserButton } from "@clerk/nextjs";
import { ConnectButton } from "./components/ConnectButton";
import { DraftModal } from "./components/DraftModal";
import { Calendar } from "./components/Calendar";
import { DayDetail } from "./components/DayDetail";
import { TodoPanel } from "./components/TodoPanel";
import { useAgent } from "./hooks/useAgent";

type Tab = "emails" | "todos";

function todayYMD(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDate(ymd: string): string {
  const [year, month, day] = ymd.split("-").map(Number);
  const d = new Date(year, month - 1, day);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

export default function Home() {
  const [connected, setConnected] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [activeDates, setActiveDates] = useState<Set<string>>(new Set());
  const [selectedDate, setSelectedDate] = useState<string>(todayYMD());
  const [activeTab, setActiveTab] = useState<Tab>("emails");
  const [refreshKey, setRefreshKey] = useState(0);

  const {
    status, error,
    draftStatus, draftInterrupt, draftingEmailId, savedDraftIds,
    runAgent, draftEmail, sendDraftDecision, reset,
  } = useAgent();

  // Check Gmail connection status
  useEffect(() => {
    fetch("/api/auth/status")
      .then(r => r.json())
      .then(d => setConnected(d.connected))
      .finally(() => setCheckingAuth(false));
  }, []);

  // Load snapshot dates for calendar highlights
  useEffect(() => {
    fetch("/api/snapshots")
      .then(r => r.json())
      .then(({ snapshots }) => {
        if (Array.isArray(snapshots)) {
          setActiveDates(new Set(snapshots.map((s: { date: string }) => s.date)));
        }
      })
      .catch(() => {});
  }, []);

  // After agent finishes, refresh active dates + content
  useEffect(() => {
    if (status === "done") {
      fetch("/api/snapshots")
        .then(r => r.json())
        .then(({ snapshots }) => {
          if (Array.isArray(snapshots)) {
            setActiveDates(new Set(snapshots.map((s: { date: string }) => s.date)));
          }
        });
      setRefreshKey(k => k + 1);
    }
  }, [status]);

  async function handleDisconnect() {
    await fetch("/api/auth/status", { method: "DELETE" });
    setConnected(false);
    reset();
  }

  const isRunning = status === "running";
  const showDraftModal = draftStatus === "interrupted" && draftInterrupt != null;
  const isDraftDeciding = draftStatus === "running" && draftInterrupt == null && draftingEmailId != null;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">

      {/* ── Top header ── */}
      <header className="bg-white border-b border-gray-200 px-6 py-3.5 flex-shrink-0">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900 leading-none">Email Flow</h1>
            <p className="text-xs text-gray-400 mt-0.5">AI-powered email assistant</p>
          </div>
          <div className="flex items-center gap-3">
            {!checkingAuth && (
              <ConnectButton connected={connected} onDisconnect={handleDisconnect} />
            )}
            <UserButton />
          </div>
        </div>
      </header>

      {/* ── Not connected ── */}
      {!checkingAuth && !connected && (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center max-w-md">
            <div className="text-5xl mb-5">📬</div>
            <h2 className="text-xl font-semibold text-gray-800 mb-2">
              Connect your Gmail to get started
            </h2>
            <p className="text-sm text-gray-500 mb-6">
              The AI agent will analyze your emails, classify them, extract tasks,
              and help you draft replies.
            </p>
            <a
              href="/api/auth/google"
              className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition-colors"
            >
              Connect Gmail
            </a>
          </div>
        </div>
      )}

      {/* ── Main layout ── */}
      {connected && (
        <div className="flex-1 flex overflow-hidden max-w-7xl w-full mx-auto">

          {/* ── Sidebar ── */}
          <aside className="w-72 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col gap-5 p-5 overflow-y-auto">
            <Calendar
              activeDates={activeDates}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
            />

            {/* Run Agent */}
            <button
              onClick={() => runAgent(selectedDate)}
              disabled={isRunning}
              className="w-full py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {isRunning ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Analyzing...
                </>
              ) : (
                "Run Agent"
              )}
            </button>

            {/* Error */}
            {status === "error" && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3.5 text-sm text-red-700">
                <p className="font-semibold text-xs mb-0.5">Something went wrong</p>
                <p className="text-xs text-red-600 leading-relaxed">{error}</p>
                <button onClick={reset} className="mt-2 text-xs underline text-red-500">
                  Try again
                </button>
              </div>
            )}
          </aside>

          {/* ── Content area ── */}
          <main className="flex-1 overflow-y-auto">
            <div className="p-6 max-w-3xl">

              {/* Day header */}
              <div className="mb-5">
                <h2 className="text-lg font-semibold text-gray-900">{formatDate(selectedDate)}</h2>
                <p className="text-xs text-gray-400 mt-0.5">{selectedDate}</p>
              </div>

              {/* Tabs */}
              <div className="flex gap-1 border-b border-gray-200 mb-5">
                {(["emails", "todos"] as Tab[]).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-4 py-2 text-sm font-medium capitalize rounded-t-lg transition-colors ${
                      activeTab === tab
                        ? "text-indigo-600 border-b-2 border-indigo-600 bg-white -mb-px"
                        : "text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              {activeTab === "emails" ? (
                <DayDetail
                  key={`${selectedDate}-${refreshKey}`}
                  date={selectedDate}
                  onDraftClick={draftEmail}
                  draftingEmailId={draftingEmailId}
                  savedDraftIds={savedDraftIds}
                />
              ) : (
                <TodoPanel
                  key={`${selectedDate}-todos-${refreshKey}`}
                  date={selectedDate}
                  refreshKey={refreshKey}
                />
              )}
            </div>
          </main>

        </div>
      )}

      {/* ── HITL Draft Modal ── */}
      {showDraftModal && (
        <DraftModal
          interrupt={draftInterrupt!}
          onDecision={sendDraftDecision}
          isLoading={isDraftDeciding}
        />
      )}
    </div>
  );
}
