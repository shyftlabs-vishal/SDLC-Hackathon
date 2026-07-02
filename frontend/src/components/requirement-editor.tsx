"use client";

import { useCallback, useRef, useState } from "react";
import { AlertTriangle, FileText, Loader2, Upload, X } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

const ACCEPTED_EXTENSIONS = [".txt", ".md", ".pdf", ".docx"];
const ACCEPT_ATTR = ACCEPTED_EXTENSIONS.join(",");
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

function isAcceptedFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext));
}

interface RequirementEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minHeight?: string;
  disabled?: boolean;
  onError?: (message: string | null) => void;
  className?: string;
}

export function RequirementEditor({
  value,
  onChange,
  placeholder = "Paste or edit your requirement...",
  minHeight = "160px",
  disabled = false,
  onError,
  className,
}: RequirementEditorProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);

  const handleFile = useCallback(
    async (file: File) => {
      onError?.(null);

      if (!isAcceptedFile(file)) {
        onError?.("Unsupported file type. Use PDF, DOCX, TXT, or MD (max 10 MB).");
        return;
      }
      if (file.size > MAX_FILE_SIZE_BYTES) {
        onError?.("File is too large. Maximum size is 10 MB.");
        return;
      }

      setUploading(true);
      try {
        const result = await api.extractDocumentText(file);
        onChange(result.text);
        setUploadedFile(result.filename);
        setTruncated(result.truncated);
      } catch (err) {
        onError?.(err instanceof Error ? err.message : "Could not read file");
        setUploadedFile(null);
        setTruncated(false);
      } finally {
        setUploading(false);
      }
    },
    [onChange, onError],
  );

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
    e.target.value = "";
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragActive(false);
    if (disabled || uploading) return;
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  }

  function clearUpload() {
    setUploadedFile(null);
    setTruncated(false);
    onChange("");
    onError?.(null);
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled && !uploading) setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={onDrop}
        className={cn(
          "relative rounded-xl border border-dashed p-4 transition-colors",
          dragActive
            ? "border-indigo-400 bg-indigo-50/50 dark:border-indigo-500 dark:bg-indigo-950/30"
            : "border-[var(--border)] bg-[var(--surface-muted)]",
          disabled && "pointer-events-none opacity-60",
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT_ATTR}
          className="hidden"
          onChange={onInputChange}
          disabled={disabled || uploading}
        />
        <div className="flex flex-col items-center gap-2 text-center sm:flex-row sm:text-left">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-300">
            {uploading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Upload className="h-5 w-5" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium theme-body">
              {uploading ? "Extracting text from document…" : "Upload a requirement document"}
            </p>
            <p className="mt-0.5 text-xs text-[var(--muted)]">
              PDF, DOCX, TXT, or MD · max 10 MB · text is extracted for preview only (not stored)
            </p>
          </div>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={disabled || uploading}
            className="shrink-0 rounded-lg border border-indigo-200 bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-indigo-700 transition-colors hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-indigo-800 dark:text-indigo-300 dark:hover:bg-indigo-950/40"
          >
            Choose file
          </button>
        </div>
      </div>

      {uploadedFile && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2">
          <FileText className="h-4 w-4 shrink-0 text-indigo-500" />
          <span className="min-w-0 flex-1 truncate text-sm theme-body">{uploadedFile}</span>
          <span className="text-xs text-[var(--muted)]">{value.length.toLocaleString()} chars</span>
          <button
            type="button"
            onClick={clearUpload}
            className="rounded p-1 text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--foreground)]"
            aria-label="Clear uploaded document"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {truncated && (
        <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Document was long — preview is trimmed to 50,000 characters. Edit below before generating tickets.
        </p>
      )}

      <textarea
        className="theme-input w-full resize-y rounded-lg border p-3 font-mono text-sm"
        style={{ minHeight }}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setUploadedFile(null);
          setTruncated(false);
        }}
        placeholder={placeholder}
        disabled={disabled || uploading}
      />
      <p className="text-xs text-[var(--muted)]">
        Type your requirement or upload a document, review the extracted text, then generate tickets.
      </p>
    </div>
  );
}
