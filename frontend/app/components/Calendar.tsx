"use client";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

interface Props {
  activeDates: Set<string>;   // YYYY-MM-DD dates that have snapshots
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
}

function toYMD(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function getCalendarDays(year: number, month: number): (number | null)[] {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  // Monday-first offset (Sunday = 6, Monday = 0)
  const offset = (firstDay + 6) % 7;
  const days: (number | null)[] = Array(offset).fill(null);
  for (let d = 1; d <= daysInMonth; d++) days.push(d);
  return days;
}

export function Calendar({ activeDates, selectedDate, onSelectDate }: Props) {
  const today = new Date();
  const todayYMD = toYMD(today.getFullYear(), today.getMonth(), today.getDate());

  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const days = getCalendarDays(viewYear, viewMonth);

  function prevMonth() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  }

  function nextMonth() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
      {/* Month navigation */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={prevMonth}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
        >
          ‹
        </button>
        <span className="text-sm font-semibold text-gray-800">
          {MONTHS[viewMonth]} {viewYear}
        </span>
        <button
          onClick={nextMonth}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
        >
          ›
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {DAYS.map(d => (
          <div key={d} className="text-center text-xs text-gray-400 font-medium py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-y-1">
        {days.map((day, i) => {
          if (!day) return <div key={`empty-${i}`} />;

          const ymd = toYMD(viewYear, viewMonth, day);
          const isToday = ymd === todayYMD;
          const isSelected = ymd === selectedDate;
          const hasData = activeDates.has(ymd);

          return (
            <button
              key={ymd}
              onClick={() => onSelectDate(ymd)}
              className={[
                "relative flex flex-col items-center justify-center h-9 w-full rounded-lg text-sm transition-colors",
                isSelected
                  ? "bg-indigo-600 text-white font-semibold"
                  : isToday
                  ? "bg-indigo-50 text-indigo-700 font-semibold"
                  : "hover:bg-gray-100 text-gray-700",
              ].join(" ")}
            >
              {day}
              {hasData && (
                <span
                  className={[
                    "absolute bottom-1 w-1 h-1 rounded-full",
                    isSelected ? "bg-white" : "bg-indigo-400",
                  ].join(" ")}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// useState import — needed since this is a client component
import { useState } from "react";
