"use client";

import { useEffect, useState } from "react";
import type { Todo, TodoTag } from "../types";

const TAG_STYLES: Record<TodoTag, string> = {
  urgent: "bg-red-100 text-red-700",
  important: "bg-orange-100 text-orange-700",
  "follow-up": "bg-purple-100 text-purple-700",
  meeting: "bg-blue-100 text-blue-700",
  payment: "bg-emerald-100 text-emerald-700",
  review: "bg-yellow-100 text-yellow-700",
  "waiting-on": "bg-sky-100 text-sky-700",
  bug: "bg-rose-100 text-rose-700",
};

interface Props {
  date: string;       // YYYY-MM-DD
  refreshKey?: number; // increment to force a re-fetch (e.g. after agent run)
}

export function TodoPanel({ date, refreshKey }: Props) {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/todos/${date}`)
      .then(r => r.ok ? r.json() : [])
      .then(setTodos)
      .finally(() => setLoading(false));
  }, [date, refreshKey]);

  async function toggleDone(todo: Todo) {
    const nextStatus = todo.status === "done" ? "pending" : "done";
    // Optimistic update
    setTodos(prev => prev.map(t => t.id === todo.id ? { ...t, status: nextStatus } : t));
    await fetch(`/api/todos/item/${todo.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });
  }

  async function skipTodo(todo: Todo) {
    setTodos(prev => prev.map(t => t.id === todo.id ? { ...t, status: "skipped" } : t));
    await fetch(`/api/todos/item/${todo.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "skipped" }),
    });
  }

  async function deleteTodo(id: string) {
    setTodos(prev => prev.filter(t => t.id !== id));
    await fetch(`/api/todos/item/${id}`, { method: "DELETE" });
  }

  const visible = todos.filter(t => t.status !== "skipped");
  const skipped = todos.filter(t => t.status === "skipped");
  const doneCount = todos.filter(t => t.status === "done").length;

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-gray-400">
        <span className="w-4 h-4 border-2 border-gray-200 border-t-gray-400 rounded-full animate-spin" />
        Loading todos...
      </div>
    );
  }

  if (todos.length === 0) {
    return (
      <p className="text-sm text-gray-400 py-3 text-center">
        No todos for this day
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Progress line */}
      {todos.length > 0 && (
        <p className="text-xs text-gray-400 mb-1">
          {doneCount} / {todos.length} done
        </p>
      )}

      {/* Active todos */}
      {visible.map(todo => (
        <div
          key={todo.id}
          className={`bg-white rounded-xl border shadow-sm p-4 flex flex-col gap-2 transition-opacity ${
            todo.status === "done" ? "opacity-60" : "opacity-100"
          } ${todo.carried_from_date ? "border-amber-200 bg-amber-50/40" : "border-gray-200"}`}
        >
          <div className="flex items-start gap-3">
            {/* Checkbox */}
            <button
              onClick={() => toggleDone(todo)}
              className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                todo.status === "done"
                  ? "bg-indigo-600 border-indigo-600"
                  : "border-gray-300 hover:border-indigo-400"
              }`}
            >
              {todo.status === "done" && (
                <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>

            <div className="flex-1 min-w-0">
              {/* Title */}
              <p className={`text-sm font-medium leading-snug ${todo.status === "done" ? "line-through text-gray-400" : "text-gray-900"}`}>
                {todo.title}
              </p>

              {/* Description */}
              {todo.description && (
                <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{todo.description}</p>
              )}

              {/* Due hint + carried-over */}
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                {todo.due_hint && (
                  <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                    {todo.due_hint}
                  </span>
                )}
                {todo.carried_from_date && (
                  <span className="text-xs text-amber-600 font-medium">
                    Carried from {todo.carried_from_date}
                    {todo.carry_count > 1 ? ` (×${todo.carry_count})` : ""}
                  </span>
                )}
              </div>

              {/* Tags */}
              {todo.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {todo.tags.map(tag => (
                    <span
                      key={tag}
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${TAG_STYLES[tag as TodoTag] ?? "bg-gray-100 text-gray-600"}`}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex-shrink-0 flex items-center gap-1 ml-1">
              <button
                onClick={() => skipTodo(todo)}
                title="Skip"
                className="text-xs text-gray-400 hover:text-gray-600 px-1.5 py-1 rounded hover:bg-gray-100 transition-colors"
              >
                Skip
              </button>
              <button
                onClick={() => deleteTodo(todo.id)}
                title="Delete"
                className="text-gray-300 hover:text-red-400 p-1 rounded hover:bg-red-50 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      ))}

      {/* Skipped todos (collapsed) */}
      {skipped.length > 0 && (
        <details className="mt-1">
          <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-500 select-none">
            {skipped.length} skipped
          </summary>
          <div className="flex flex-col gap-1.5 mt-2">
            {skipped.map(todo => (
              <div
                key={todo.id}
                className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg border border-gray-100"
              >
                <span className="flex-1 text-xs text-gray-400 line-through truncate">{todo.title}</span>
                <button
                  onClick={() => {
                    setTodos(prev => prev.map(t => t.id === todo.id ? { ...t, status: "pending" } : t));
                    fetch(`/api/todos/item/${todo.id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ status: "pending" }),
                    });
                  }}
                  className="text-xs text-indigo-400 hover:text-indigo-600"
                >
                  Restore
                </button>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
