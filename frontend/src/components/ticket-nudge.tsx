"use client";

import { useState } from "react";
import { Bell, CheckCircle2, Loader2, Mail } from "lucide-react";
import { api } from "@/lib/api";
import type { Ticket } from "@/lib/types";
import { Button } from "@/components/ui/button";

export function TicketNudge({
  ticket,
  onError,
  onSuccess,
}: {
  ticket: Ticket;
  onError?: (message: string) => void;
  onSuccess?: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!ticket.jira_issue_key) return null;

  async function handleSend(useAssignee = false) {
    setLoading(true);
    setSuccessMsg(null);
    const trimmedEmail = email.trim();
    try {
      const result = await api.nudgeJiraTicket(ticket.id, {
        recipient_email: useAssignee ? undefined : trimmedEmail || undefined,
        recipient_account_id: useAssignee
          ? ticket.jira_assignee_account_id ?? undefined
          : trimmedEmail
            ? undefined
            : ticket.jira_assignee_account_id ?? undefined,
        message: message.trim(),
      });
      setOpen(false);
      setMessage("");
      const msg = `Nudged ${result.recipient_name} on ${result.issue_key} — JIRA will email them.`;
      setSuccessMsg(msg);
      onSuccess?.(msg);
    } catch (e) {
      onError?.(e instanceof Error ? e.message : "Failed to send JIRA nudge");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-3 border-t border-[var(--border)] pt-3">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 hover:text-blue-800"
        >
          <Bell className="h-3.5 w-3.5" />
          Nudge via JIRA
        </button>
      ) : (
        <div className="space-y-2 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-3">
          <div className="flex items-center gap-2 text-xs font-medium theme-body">
            <Mail className="h-3.5 w-3.5" />
            Send a JIRA nudge — posts an @mention comment and emails them
          </div>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Recipient Atlassian email"
            className="theme-input w-full rounded-lg border px-3 py-2 text-sm"
          />
          {ticket.assignee && ticket.jira_assignee_account_id && (
            <button
              type="button"
              onClick={() => handleSend(true)}
              disabled={loading}
              className="text-xs text-blue-700 hover:underline disabled:opacity-50"
            >
              Or nudge assignee: {ticket.assignee}
            </button>
          )}
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            placeholder="Your message (e.g. Can you review this today?)"
            className="theme-input w-full resize-y rounded-lg border px-3 py-2 text-sm"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              className="text-xs"
              loading={loading}
              disabled={!email.trim() && !ticket.jira_assignee_account_id}
              onClick={() => handleSend(false)}
            >
              Send in JIRA
            </Button>
            <Button variant="ghost" className="text-xs" disabled={loading} onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      {successMsg && (
        <p className="mt-2 inline-flex items-center gap-1 text-xs text-emerald-700">
          <CheckCircle2 className="h-3.5 w-3.5" />
          {successMsg}
        </p>
      )}
    </div>
  );
}
