"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";

type Props = {
  projectId: string;
  onError?: (message: string | null) => void;
  className?: string;
};

export function ExportReportButton({ projectId, onError, className }: Props) {
  const [loading, setLoading] = useState(false);

  async function handleExport() {
    setLoading(true);
    onError?.(null);
    try {
      const { markdown, filename } = await api.getProjectReport(projectId);
      const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      onError?.(e instanceof Error ? e.message : "Failed to export report");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      variant="secondary"
      className={className}
      loading={loading}
      onClick={handleExport}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Download className="h-4 w-4" />
      )}
      Export report
    </Button>
  );
}
