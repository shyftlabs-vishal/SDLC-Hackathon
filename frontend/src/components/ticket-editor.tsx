"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Check, CheckCircle2, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { api } from "@/lib/api";
import type { Ticket } from "@/lib/types";

type EditableFields = Pick<
  Ticket,
  "title" | "description" | "acceptance_criteria"
>;

type Props = {
  ticket: Ticket;
  disabled?: boolean;
  meta?: ReactNode;
  onSaved: (updated: EditableFields) => void;
  onError: (message: string) => void;
};

type Draft = {
  title: string;
  description: string;
  criteria: string[];
};

function toDraft(ticket: Ticket): Draft {
  return {
    title: ticket.title,
    description: ticket.description,
    criteria:
      ticket.acceptance_criteria.length > 0 ? [...ticket.acceptance_criteria] : [""],
  };
}

function normalizeCriteria(items: string[]): string[] {
  return items.map((item) => item.trim()).filter(Boolean);
}

function criteriaEqual(a: string[], b: string[]): boolean {
  const left = normalizeCriteria(a);
  const right = normalizeCriteria(b);
  if (left.length !== right.length) return false;
  return left.every((item, index) => item === right[index]);
}

export function TicketEditor({ ticket, disabled, meta, onSaved, onError }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => toDraft(ticket));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editing || saving) return;
    setDraft(toDraft(ticket));
  }, [ticket, editing, saving]);

  function startEdit() {
    setDraft(toDraft(ticket));
    setEditing(true);
  }

  function cancelEdit() {
    setDraft(toDraft(ticket));
    setEditing(false);
  }

  function updateCriterion(index: number, value: string) {
    setDraft((current) => ({
      ...current,
      criteria: current.criteria.map((item, i) => (i === index ? value : item)),
    }));
  }

  function addCriterion() {
    setDraft((current) => ({ ...current, criteria: [...current.criteria, ""] }));
  }

  function removeCriterion(index: number) {
    setDraft((current) => ({
      ...current,
      criteria:
        current.criteria.length === 1
          ? [""]
          : current.criteria.filter((_, i) => i !== index),
    }));
  }

  async function saveTicket() {
    const trimmedTitle = draft.title.trim();
    const trimmedDescription = draft.description.trim();
    const acceptanceCriteria = normalizeCriteria(draft.criteria);

    if (!trimmedTitle) {
      onError("Ticket name cannot be empty");
      return;
    }
    if (!trimmedDescription) {
      onError("Description cannot be empty");
      return;
    }

    const unchanged =
      trimmedTitle === ticket.title &&
      trimmedDescription === ticket.description &&
      criteriaEqual(acceptanceCriteria, ticket.acceptance_criteria);

    if (unchanged) {
      setEditing(false);
      return;
    }

    const payload: {
      title?: string;
      description?: string;
      acceptance_criteria?: string[];
    } = {};

    if (trimmedTitle !== ticket.title) payload.title = trimmedTitle;
    if (trimmedDescription !== ticket.description) payload.description = trimmedDescription;
    if (!criteriaEqual(acceptanceCriteria, ticket.acceptance_criteria)) {
      payload.acceptance_criteria = acceptanceCriteria;
    }

    if (Object.keys(payload).length === 0) {
      setEditing(false);
      return;
    }

    setSaving(true);
    try {
      const updated = await api.updateTicket(ticket.id, payload);

      const saved = {
        title: updated.title,
        description: updated.description,
        acceptance_criteria: updated.acceptance_criteria,
      };

      setEditing(false);
      onSaved(saved);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Failed to update ticket");
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
            Ticket name
          </label>
          <input
            type="text"
            value={draft.title}
            onChange={(e) => setDraft((current) => ({ ...current, title: e.target.value }))}
            disabled={saving}
            maxLength={255}
            className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--input-bg)] px-3 py-2 text-sm font-medium theme-heading outline-none focus:ring-2 focus:ring-[var(--ring)]"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
            Description
          </label>
          <textarea
            value={draft.description}
            onChange={(e) =>
              setDraft((current) => ({ ...current, description: e.target.value }))
            }
            disabled={saving}
            rows={4}
            maxLength={10000}
            className="w-full resize-y rounded-lg border border-[var(--border-strong)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--muted)] outline-none focus:ring-2 focus:ring-[var(--ring)]"
          />
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <label className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
              Acceptance criteria
            </label>
            <button
              type="button"
              onClick={addCriterion}
              disabled={saving}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-[var(--accent)] transition-colors hover:bg-[var(--hover)] disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" />
              Add item
            </button>
          </div>
          <div className="space-y-2">
            {draft.criteria.map((criterion, index) => (
              <div key={index} className="flex items-start gap-2">
                <CheckCircle2 className="mt-2.5 h-3.5 w-3.5 shrink-0 text-[var(--muted)]" />
                <input
                  type="text"
                  value={criterion}
                  onChange={(e) => updateCriterion(index, e.target.value)}
                  disabled={saving}
                  placeholder="Describe an acceptance criterion"
                  maxLength={500}
                  className="min-w-0 flex-1 rounded-lg border border-[var(--border-strong)] bg-[var(--input-bg)] px-3 py-2 text-sm theme-body outline-none focus:ring-2 focus:ring-[var(--ring)]"
                />
                <button
                  type="button"
                  onClick={() => removeCriterion(index)}
                  disabled={saving}
                  title="Remove item"
                  className="mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--muted)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--hover)] hover:text-rose-500 disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void saveTicket()}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-fg)] transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            Save changes
          </button>
          <button
            type="button"
            onClick={cancelEdit}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-medium theme-body transition-colors hover:bg-[var(--hover)] disabled:opacity-50"
          >
            <X className="h-4 w-4" />
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex min-w-0 items-start gap-2">
        <h3 className="min-w-0 flex-1 font-medium theme-heading">{ticket.title}</h3>
        <button
          type="button"
          onClick={startEdit}
          disabled={disabled || saving}
          title="Edit ticket"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium text-[var(--muted)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--hover)] hover:text-[var(--accent)] disabled:opacity-50"
        >
          <Pencil className="h-3.5 w-3.5" />
          Edit
        </button>
      </div>
      {meta ? <div className="flex flex-wrap items-center gap-2">{meta}</div> : null}
      <p className="text-sm leading-relaxed text-[var(--muted)]">{ticket.description}</p>
      {ticket.acceptance_criteria.length > 0 && (
        <ul className="space-y-1 text-sm theme-body">
          {ticket.acceptance_criteria.map((criterion, index) => (
            <li key={`${index}-${criterion}`} className="flex gap-2">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--muted)]" />
              {criterion}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
