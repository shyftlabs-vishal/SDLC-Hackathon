"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

interface ThemeToggleProps {
  className?: string;
  variant?: "sidebar" | "icon";
}

export function ThemeToggle({ className, variant = "sidebar" }: ThemeToggleProps) {
  const { resolvedTheme, toggleTheme } = useTheme();
  // `resolvedTheme` is deterministically "light" on both the server render and
  // the first client render (state defaults to light; the real theme is applied
  // after mount). Rendering from it — rather than gating DOM structure on
  // `mounted` — keeps server and first-client markup identical, avoiding a
  // hydration mismatch. The icon simply swaps after the mount effect runs.
  const isDark = resolvedTheme === "dark";

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={toggleTheme}
        aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
        title={isDark ? "Light mode" : "Dark mode"}
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--body)] transition-colors",
          "hover:border-[var(--border-strong)] hover:bg-[var(--hover)]",
          className,
        )}
      >
        {isDark ? (
          <Sun className="h-4 w-4 text-amber-400" />
        ) : (
          <Moon className="h-4 w-4 text-indigo-500" />
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Light mode" : "Dark mode"}
      className={cn(
        "flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
        "border-[var(--sidebar-border)] bg-white/[0.04] text-slate-200 hover:bg-white/[0.08]",
        className,
      )}
    >
      <span className="flex items-center gap-2">
        {isDark ? (
          <Sun className="h-4 w-4 text-amber-300" />
        ) : (
          <Moon className="h-4 w-4 text-blue-300" />
        )}
        {isDark ? "Light mode" : "Dark mode"}
      </span>
      <span className="rounded-md bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-[var(--sidebar-muted)]">
        {isDark ? "Dark" : "Light"}
      </span>
    </button>
  );
}
