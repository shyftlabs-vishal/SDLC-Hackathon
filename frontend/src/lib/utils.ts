import { clsx, type ClassValue } from "clsx";
import type { TicketStatus } from "./types";

export const TICKET_STATUSES: TicketStatus[] = [
  "backlog",
  "in_progress",
  "in_review",
  "done",
  "blocked",
];

const STATUS_CONFIG: Record<TicketStatus, { label: string; pill: string; bar: string }> = {
  backlog: {
    label: "Backlog",
    pill: "bg-[#DFE1E6] text-[#42526E] border border-[#C1C7D0]",
    bar: "bg-[#42526E]",
  },
  in_progress: {
    label: "In Progress",
    pill: "bg-[#DEEBFF] text-[#0052CC] border border-[#B3D4FF]",
    bar: "bg-[#0052CC]",
  },
  in_review: {
    label: "In Review",
    pill: "bg-[#EAE6FF] text-[#403294] border border-[#C0B6F2]",
    bar: "bg-[#6554C0]",
  },
  done: {
    label: "Done",
    pill: "bg-[#E3FCEF] text-[#216E4E] border border-[#ABF5D1]",
    bar: "bg-[#36B37E]",
  },
  blocked: {
    label: "Blocked",
    pill: "bg-[#FFEBE6] text-[#BF2600] border border-[#FFBDAD]",
    bar: "bg-[#DE350B]",
  },
};

export function statusLabel(status: string): string {
  return STATUS_CONFIG[status as TicketStatus]?.label ?? status.replace(/_/g, " ");
}

export function statusBarColor(status: TicketStatus): string {
  return STATUS_CONFIG[status].bar;
}

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(iso);
}

export function alignmentColor(score: number | null): string {
  if (score === null) return "text-[var(--muted)]";
  if (score >= 80) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 60) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

export function alignmentBg(score: number | null): string {
  if (score === null) {
    return "border border-[var(--border)] bg-[var(--surface-muted)] text-[var(--muted)]";
  }
  if (score >= 80) {
    return "border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300";
  }
  if (score >= 60) {
    return "border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300";
  }
  return "border border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/50 dark:text-red-300";
}

export function checklistStatusStyles(status: string): string {
  switch (status) {
    case "pass":
      return "border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-800/80 dark:bg-emerald-950/45 dark:text-emerald-100";
    case "warn":
      return "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-800/80 dark:bg-amber-950/45 dark:text-amber-100";
    default:
      return "border-red-200 bg-red-50 text-red-950 dark:border-red-800/80 dark:bg-red-950/45 dark:text-red-100";
  }
}

export function checklistDetailStyles(status: string): string {
  switch (status) {
    case "pass":
      return "text-emerald-800 dark:text-emerald-200/85";
    case "warn":
      return "text-amber-800 dark:text-amber-200/85";
    default:
      return "text-red-800 dark:text-red-200/85";
  }
}

export function severityStyles(severity: string): string {
  switch (severity) {
    case "critical":
      return "bg-red-100 text-red-800 border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-800";
    case "high":
      return "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-950/50 dark:text-orange-300 dark:border-orange-800";
    case "medium":
      return "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800";
    case "low":
      return "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800";
    default:
      return "bg-slate-100 text-slate-700 border-slate-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700";
  }
}

export function priorityStyles(priority: string): string {
  switch (priority) {
    case "critical":
      return "bg-red-100 text-red-700";
    case "high":
      return "bg-orange-100 text-orange-700";
    case "medium":
      return "bg-amber-100 text-amber-700";
    default:
      return "bg-slate-100 text-slate-600";
  }
}

export function statusStyles(status: string): string {
  return STATUS_CONFIG[status as TicketStatus]?.pill ?? STATUS_CONFIG.backlog.pill;
}

export function typeStyles(type: string): string {
  switch (type) {
    case "feature":
      return "bg-indigo-100 text-indigo-700";
    case "bug":
      return "bg-red-100 text-red-700";
    case "spike":
      return "bg-purple-100 text-purple-700";
    default:
      return "bg-slate-100 text-slate-600";
  }
}
