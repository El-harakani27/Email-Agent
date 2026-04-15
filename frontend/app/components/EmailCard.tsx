"use client";

import type { EmailAnalysis, Priority } from "../types";

const PRIORITY_STYLES: Record<Priority, string> = {
  High: "bg-red-100 text-red-700 border-red-200",
  Medium: "bg-yellow-100 text-yellow-700 border-yellow-200",
  Low: "bg-gray-100 text-gray-500 border-gray-200",
};

const PRIORITY_DOT: Record<Priority, string> = {
  High: "bg-red-500",
  Medium: "bg-yellow-400",
  Low: "bg-gray-400",
};

const TYPE_STYLES: Record<string, string> = {
  "Meeting Request": "bg-blue-50 text-blue-700",
  "Action Required": "bg-orange-50 text-orange-700",
  "Follow-up": "bg-purple-50 text-purple-700",
  "Invoice / Payment": "bg-emerald-50 text-emerald-700",
  "Newsletter / Promo": "bg-gray-50 text-gray-500",
  "Support / Bug Report": "bg-rose-50 text-rose-700",
  "Information / FYI": "bg-sky-50 text-sky-700",
  "Urgent Alert": "bg-red-50 text-red-700",
};

interface Props {
  email: EmailAnalysis;
  index: number;
  /** Called when the user clicks "Draft Reply". Only provided for emails with has_task. */
  onDraftClick?: () => void;
  /** True while the draft agent is generating a reply for this specific email. */
  isDrafting?: boolean;
  /** True if a draft was already saved for this email in the current session. */
  draftSaved?: boolean;
}

export function EmailCard({
  email,
  index,
  onDraftClick,
  isDrafting = false,
  draftSaved = false,
}: Props) {
  const showDraftButton = email.has_task && !draftSaved && !isDrafting;
  const effectiveDraftSaved = draftSaved || email.draft_saved;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex flex-col gap-3">
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-400 mb-0.5">#{index + 1}</p>
          <h3 className="font-semibold text-gray-900 text-sm leading-snug truncate">
            {email.subject}
          </h3>
          <p className="text-xs text-gray-500 mt-0.5 truncate">
            {email.sender}
          </p>
        </div>

        {/* Priority badge */}
        <span
          className={`flex-shrink-0 inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full border ${PRIORITY_STYLES[email.priority]}`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${PRIORITY_DOT[email.priority]}`} />
          {email.priority}
        </span>
      </div>

      {/* Type tag */}
      <span
        className={`self-start text-xs font-medium px-2 py-0.5 rounded-md ${TYPE_STYLES[email.type] ?? "bg-gray-50 text-gray-600"}`}
      >
        {email.type}
      </span>

      {/* Summary */}
      <p className="text-sm text-gray-600 leading-relaxed">{email.summary}</p>

      {/* Action items */}
      {email.action_items.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
            Action Items
          </p>
          <ul className="space-y-1">
            {email.action_items.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                <span className="mt-1 w-1.5 h-1.5 rounded-full bg-indigo-400 flex-shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Footer: draft saved indicator OR draft reply button */}
      {effectiveDraftSaved ? (
        <div className="flex items-center gap-2 text-xs text-emerald-600 font-medium mt-1">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Draft saved to Gmail
        </div>
      ) : isDrafting ? (
        <div className="flex items-center gap-2 text-xs text-indigo-500 font-medium mt-1">
          <span className="w-3.5 h-3.5 border-2 border-indigo-200 border-t-indigo-500 rounded-full animate-spin" />
          Generating draft...
        </div>
      ) : showDraftButton ? (
        <button
          onClick={onDraftClick}
          className="self-start mt-1 inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors border border-indigo-200"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          Draft Reply
        </button>
      ) : null}
    </div>
  );
}
