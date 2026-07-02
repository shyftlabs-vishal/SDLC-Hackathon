"use client";

import { useState } from "react";
import { MessageSquare, Send } from "lucide-react";
import { api } from "@/lib/api";
import type { ProjectChatResult } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";

const QUICK_PROMPTS = [
  "What's blocked right now?",
  "Can we ship this week?",
  "Summarize progress from git activity",
  "What should the team focus on today?",
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

  return (
    <Card>
      <CardHeader
        title="Ask the project"
        description="AI answers using your spec, tickets, git, and drift data"
        action={<MessageSquare className="h-5 w-5 text-indigo-500" />}
      />
      <CardBody className="space-y-3">
        {!compact && history.length === 0 && (
          <div className="flex flex-wrap gap-2">
            {QUICK_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => ask(prompt)}
                disabled={loading}
                className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
              >
                {prompt}
              </button>
            ))}
          </div>
        )}

        {history.length > 0 && (
          <div
            className={`space-y-3 overflow-y-auto rounded-lg bg-slate-50 p-3 ${
              compact ? "max-h-48" : "max-h-72"
            }`}
          >
            {history.map((msg, i) => (
              <div key={i} className={`text-sm ${msg.role === "user" ? "text-right" : ""}`}>
                {msg.role === "user" ? (
                  <span className="inline-block rounded-lg bg-indigo-600 px-3 py-2 text-white">
                    {msg.content as string}
                  </span>
                ) : (
                  <div className="rounded-lg border border-[var(--border)] bg-white p-3 text-left">
                    <p className="whitespace-pre-wrap">{(msg.content as ProjectChatResult).answer}</p>
                    {(msg.content as ProjectChatResult).suggested_actions.length > 0 && (
                      <ul className="mt-2 space-y-1 text-xs text-indigo-700">
                        {(msg.content as ProjectChatResult).suggested_actions.map((a) => (
                          <li key={a}>→ {a}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            className="flex-1 rounded-lg border border-[var(--border)] px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            placeholder="Ask anything about this project…"
            value={chatQ}
            onChange={(e) => setChatQ(e.target.value)}
            disabled={loading}
          />
          <Button type="submit" loading={loading} disabled={!chatQ.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
