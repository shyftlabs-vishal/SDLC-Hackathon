"use client";

import { useState } from "react";
import { MessageSquare, Send, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import type { ProjectChatResult } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";

const SUGGESTED_QUESTIONS = [
  "What's blocked right now?",
  "Can we ship this week?",
  "Summarize progress from git activity",
  "What should the team focus on today?",
  "Are there any open drift alerts?",
  "Which tickets are highest priority?",
];

interface ProjectChatProps {
  projectId: string;
  compact?: boolean;
  onError?: (msg: string) => void;
}

export function ProjectChat({ projectId, compact, onError }: ProjectChatProps) {
  const [chatQ, setChatQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<
    { role: "user" | "ai"; content: ProjectChatResult | string }[]
  >([]);

  async function ask(question: string) {
    if (!question.trim()) return;
    const q = question.trim();
    setChatQ("");
    setHistory((h) => [...h, { role: "user", content: q }]);
    setLoading(true);
    try {
      const answer = await api.askProject(projectId, q);
      setHistory((h) => [...h, { role: "ai", content: answer }]);
    } catch (err) {
      onError?.(err instanceof Error ? err.message : "Chat failed");
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    ask(chatQ);
  }

  const prompts = compact ? SUGGESTED_QUESTIONS.slice(0, 4) : SUGGESTED_QUESTIONS;

  return (
    <Card>
      <CardHeader
        title="Ask the project"
        description="AI answers using your spec, tickets, git, and drift data"
        action={<MessageSquare className="h-5 w-5 text-indigo-500 dark:text-indigo-400" />}
      />
      <CardBody className="space-y-4">
        {history.length === 0 && (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-4">
            <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              <Sparkles className="h-3.5 w-3.5 text-indigo-500 dark:text-indigo-400" />
              Suggested questions
            </p>
            <div className="flex flex-wrap gap-2">
              {prompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => ask(prompt)}
                  disabled={loading}
                  className={cn(
                    "rounded-full border border-indigo-200/80 bg-[var(--surface)] px-3.5 py-1.5 text-left text-[13px] leading-snug text-indigo-800 transition-colors",
                    "hover:border-indigo-300 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50",
                    "dark:border-indigo-800/80 dark:text-indigo-200 dark:hover:border-indigo-700 dark:hover:bg-indigo-950/40",
                  )}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {history.length > 0 && (
          <div
            className={cn(
              "space-y-3 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-3",
              compact ? "max-h-52" : "max-h-80",
            )}
          >
            {history.map((msg, i) => (
              <div key={i} className={cn("text-sm", msg.role === "user" ? "text-right" : "")}>
                {msg.role === "user" ? (
                  <span className="inline-block max-w-[90%] rounded-xl rounded-br-sm bg-indigo-600 px-3.5 py-2 text-left text-[13px] leading-relaxed text-white dark:bg-indigo-500">
                    {msg.content as string}
                  </span>
                ) : (
                  <div className="rounded-xl rounded-bl-sm border border-[var(--border)] bg-[var(--surface)] p-3.5 text-left">
                    <p className="whitespace-pre-wrap text-[14px] leading-relaxed theme-body">
                      {(msg.content as ProjectChatResult).answer}
                    </p>
                    {(msg.content as ProjectChatResult).suggested_actions.length > 0 && (
                      <ul className="mt-3 space-y-1 border-t border-[var(--border)] pt-3 text-xs text-indigo-700 dark:text-indigo-300">
                        {(msg.content as ProjectChatResult).suggested_actions.map((a) => (
                          <li key={a}>→ {a}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            ))}
            {loading && (
              <p className="text-xs text-[var(--muted)]">Thinking…</p>
            )}
          </div>
        )}

        {history.length > 0 && !loading && (
          <div className="flex flex-wrap gap-2">
            {SUGGESTED_QUESTIONS.slice(0, 3).map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => ask(prompt)}
                className="rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-1 text-xs text-[var(--muted)] transition-colors hover:border-indigo-300 hover:text-indigo-700 dark:hover:border-indigo-700 dark:hover:text-indigo-300"
              >
                {prompt}
              </button>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            className="theme-input flex-1 rounded-xl border px-4 py-2.5 text-[14px]"
            placeholder="Ask anything about this project…"
            value={chatQ}
            onChange={(e) => setChatQ(e.target.value)}
            disabled={loading}
          />
          <Button type="submit" loading={loading} disabled={!chatQ.trim()} className="rounded-xl px-4">
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
