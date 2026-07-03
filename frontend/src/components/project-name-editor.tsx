"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, Pencil, X } from "lucide-react";
import { api } from "@/lib/api";

type Props = {
  projectId: string;
  name: string;
  disabled?: boolean;
  onSaved: (name: string) => void;
  onError?: (message: string) => void;
};

export function ProjectNameEditor({
  projectId,
  name,
  disabled,
  onSaved,
  onError,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(name);
  }, [name, editing]);

  function startEdit(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDraft(name);
    setEditing(true);
  }

  function cancelEdit(e?: React.MouseEvent) {
    e?.preventDefault();
    e?.stopPropagation();
    setDraft(name);
    setEditing(false);
  }

  async function saveName(e?: React.MouseEvent) {
    e?.preventDefault();
    e?.stopPropagation();

    const trimmed = draft.trim();
    if (!trimmed) {
      onError?.("Project name cannot be empty");
      return;
    }
    if (trimmed === name) {
      setEditing(false);
      return;
    }

    setSaving(true);
    try {
      const updated = await api.updateProject(projectId, { name: trimmed });
      setEditing(false);
      onSaved(updated.name);
    } catch (err) {
      onError?.(err instanceof Error ? err.message : "Failed to update project name");
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div
        className="flex min-w-0 flex-1 items-center gap-2"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") void saveName();
            if (e.key === "Escape") cancelEdit();
          }}
          onClick={(e) => e.stopPropagation()}
          disabled={saving}
          autoFocus
          maxLength={200}
          className="min-w-0 flex-1 rounded-lg border border-[var(--border-strong)] bg-[var(--input-bg)] px-2.5 py-1.5 text-[15px] font-semibold theme-heading outline-none focus:ring-2 focus:ring-[var(--ring)]"
        />
        <button
          type="button"
          onClick={(e) => void saveName(e)}
          disabled={saving}
          title="Save name"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--accent)] text-[var(--accent-fg)] disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        </button>
        <button
          type="button"
          onClick={cancelEdit}
          disabled={saving}
          title="Cancel"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] hover:bg-[var(--hover)] disabled:opacity-50"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 items-start gap-1.5">
      <h3 className="min-w-0 flex-1 break-words text-[15px] font-semibold theme-heading">
        {name}
      </h3>
      <button
        type="button"
        onClick={startEdit}
        disabled={disabled || saving}
        title="Edit project name"
        className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--muted)] opacity-70 transition-colors hover:bg-[var(--hover)] hover:text-[var(--accent)] disabled:opacity-50 sm:opacity-0 sm:group-hover:opacity-100"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
