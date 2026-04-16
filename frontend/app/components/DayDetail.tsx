"use client";

import { useEffect, useState } from "react";
import { EmailCard } from "./EmailCard";
import type { EmailAnalysis } from "../types";

interface Snapshot {
  date: string;
  emails: EmailAnalysis[];
}

interface Props {
  date: string;
  onDraftClick: (email: EmailAnalysis) => void;
  draftingEmailId: string | null;
  savedDraftIds: Set<string>;
}

export function DayDetail({ date, onDraftClick, draftingEmailId, savedDraftIds }: Props) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setSnapshot(null);
    fetch(`/api/snapshots/${date}`)
      .then(r => r.ok ? r.json() : null)
      .then(setSnapshot)
      .finally(() => setLoading(false));
  }, [date]);

  if (loading) {
    return (
      <div className="flex items-center gap-3 py-16 justify-center">
        <div className="w-5 h-5 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
        <span className="text-sm text-gray-400">Loading emails...</span>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="text-center py-16 border-2 border-dashed border-gray-100 rounded-2xl">
        <div className="text-4xl mb-3">📭</div>
        <p className="text-sm font-medium text-gray-500">No data for this day</p>
        <p className="text-xs text-gray-400 mt-1">Run the agent to analyze emails</p>
      </div>
    );
  }

  if (snapshot.emails.length === 0) {
    return (
      <div className="text-center py-16 border-2 border-dashed border-gray-100 rounded-2xl">
        <div className="text-4xl mb-3">📬</div>
        <p className="text-sm font-medium text-gray-500">No emails found for this day</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {snapshot.emails.map((email, i) => (
        <EmailCard
          key={email.id}
          email={email}
          index={i}
          onDraftClick={email.has_task ? () => onDraftClick(email) : undefined}
          isDrafting={draftingEmailId === email.id}
          draftSaved={savedDraftIds.has(email.id)}
        />
      ))}
    </div>
  );
}
