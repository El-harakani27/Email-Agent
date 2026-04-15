"use client";

import { useState } from "react";
import type { DraftInterrupt } from "../types";

interface Props {
  interrupt: DraftInterrupt;
  /** "no" to skip; any other string is the (possibly edited) content to save */
  onDecision: (value: string) => void;
  isLoading: boolean;
}

export function DraftModal({ interrupt, onDecision, isLoading }: Props) {
  const [content, setContent] = useState(interrupt.draft_content);

  return (
    /* Backdrop */
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg flex flex-col gap-5 p-6">

        {/* Title */}
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-1">
            Human-in-the-loop
          </p>
          <h2 className="text-lg font-bold text-gray-900">
            Review &amp; save draft reply
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Re: <span className="font-medium text-gray-700">{interrupt.subject}</span>
          </p>
          <p className="text-xs text-gray-400">
            To: {interrupt.sender_email}
          </p>
        </div>

        {/* Editable draft */}
        <div className="flex flex-col gap-1">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
            Draft Reply <span className="normal-case font-normal text-gray-400">(edit before saving)</span>
          </p>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            disabled={isLoading}
            rows={8}
            className="w-full rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700 leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-300 disabled:opacity-50"
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3 justify-end">
          <button
            onClick={() => onDecision("no")}
            disabled={isLoading}
            className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Skip
          </button>
          <button
            onClick={() => onDecision(content)}
            disabled={isLoading || !content.trim()}
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {isLoading ? (
              <>
                <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Save Draft
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}