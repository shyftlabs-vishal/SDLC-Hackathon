"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import type { TicketStatus } from "@/lib/types";
import { cn, statusLabel, statusStyles, TICKET_STATUSES } from "@/lib/utils";

export function StatusBadge({
  status,
  className,
}: {
  status: TicketStatus | string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
        statusStyles(status),
        className,
      )}
    >
      {statusLabel(status)}
    </span>
  );
}

export function StatusSelect({
  value,
  onChange,
  disabled,
}: {
  value: TicketStatus;
  onChange: (status: TicketStatus) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide transition-[filter]",
          statusStyles(value),
          disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:brightness-95",
        )}
      >
        {statusLabel(value)}
        <ChevronDown
          className={cn("h-3.5 w-3.5 opacity-70 transition-transform", open && "rotate-180")}
        />
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-1.5 min-w-[200px] rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1.5 shadow-lg">
          {TICKET_STATUSES.map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => {
                onChange(status);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-[var(--hover)]"
            >
              {value === status ? (
                <Check className="h-3.5 w-3.5 shrink-0 text-[var(--muted)]" />
              ) : (
                <span className="w-3.5 shrink-0" />
              )}
              <StatusBadge status={status} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
