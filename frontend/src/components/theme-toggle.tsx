"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

interface ThemeToggleProps {
  className?: string;
  variant?: "sidebar" | "icon";
}

export function ThemeToggle({ className, variant = "sidebar" }: ThemeToggleProps) {
  const { toggleTheme } = useTheme();

  // Both icons are always rendered so the server and client produce identical
  // markup (no `mounted`/state branching) — this makes a hydration mismatch
  // impossible. Which icon is visible is decided purely by CSS via the `.dark`
  // class on <html>, which the blocking script in layout.tsx sets before paint.
  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={toggleTheme}
        aria-label="Toggle color mode"
        title="Toggle color mode"
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--body)] transition-colors",
          "hover:border-[var(--border-strong)] hover:bg-[var(--hover)]",
          className,
        )}
      >
        <Moon className="h-4 w-4 text-indigo-500 dark:hidden" />
        <Sun className="hidden h-4 w-4 text-amber-400 dark:block" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label="Toggle color mode"
      title="Toggle color mode"
      className={cn(
        "flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
        "border-[var(--sidebar-border)] bg-white/[0.04] text-slate-200 hover:bg-white/[0.08]",
        className,
      )}
    >
      <span className="flex items-center gap-2">
        <Moon className="h-4 w-4 text-blue-300 dark:hidden" />
        <Sun className="hidden h-4 w-4 text-amber-300 dark:block" />
        <span className="dark:hidden">Dark mode</span>
        <span className="hidden dark:block">Light mode</span>
      </span>
      <span className="rounded-md bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-[var(--sidebar-muted)]">
        <span className="dark:hidden">Light</span>
        <span className="hidden dark:block">Dark</span>
      </span>
    </button>
  );
}
