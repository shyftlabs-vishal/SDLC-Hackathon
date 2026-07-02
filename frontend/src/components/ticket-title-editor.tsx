"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, Pencil, X } from "lucide-react";
import { api } from "@/lib/api";

type Props = {
  ticketId: string;
  title: string;
  disabled?: boolean;
  onSaved: (newTitle: string) => void;
  onError: (message: string) => void;
};

export function TicketTitleEditor({
  ticketId,
  title,
  disabled,
  onSaved,
  onError,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [displayTitle, setDisplayTitle] = useState(title);
  const [draft, setDraft] = useState(title);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDisplayTitle(title);
    if (!editing) setDraft(title);
  }, [title, editing]);

  function startEdit() {
    setDraft(displayTitle);
    setEditing(true);
  }

  function cancelEdit() {
    setDraft(displayTitle);
    setEditing(false);
  }

  async function saveTitle() {
    const trimmed = draft.trim();
    if (!trimmed) {
      onError("Ticket name cannot be empty");
      return;
    }
    if (trimmed === displayTitle) {
      setEditing(false);
      return;
    }

    setSaving(true);
    try {
      const updated = await api.updateTicket(ticketId, { title: trimmed });
      if (updated.title.trim() !== trimmed) {
        throw new Error(
          "Server did not save the new name. Restart the backend and try again.",
        );
      }
      setDisplayTitle(updated.title);
      setDraft(updated.title);
      setEditing(false);
      onSaved(updated.title);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Failed to update ticket name");
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void saveTitle();
            if (e.key === "Escape") cancelEdit();
          }}
          disabled={saving}
          autoFocus
          maxLength={255}
          className="min-w-0 flex-1 rounded-lg border border-[var(--border-strong)] bg-[var(--input-bg)] px-3 py-1.5 text-sm font-medium theme-heading outline-none focus:ring-2 focus:ring-[var(--ring)]"
        />
        <button
          type="button"
          onClick={() => void saveTitle()}
          disabled={saving}
          title="Save name"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent)] text-[var(--accent-fg)] transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        </button>
        <button
          type="button"
          onClick={cancelEdit}
          disabled={saving}
          title="Cancel"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] theme-body transition-colors hover:bg-[var(--hover)] disabled:opacity-50"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 items-start gap-1.5">
      <h3 className="font-medium theme-heading">{displayTitle}</h3>
      <button
        type="button"
        onClick={startEdit}
        disabled={disabled || saving}
        title="Edit ticket name"
        className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--muted)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--accent)] disabled:opacity-50"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
