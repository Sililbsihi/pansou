"use client";
/**
 * 卡片操作区：复制链接 + 失效反馈
 * 失效反馈写入 reports 表，累计 3 人反馈自动将资源标记为失效
 */
import { useState } from "react";

export default function CardActions({ id, url, demo }: { id: number; url: string; demo: boolean }) {
  const [copied, setCopied] = useState(false);
  const [reported, setReported] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }

  async function report() {
    if (reported) return;
    setReported(true); // 先置位防止连点
    try {
      if (!demo) await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
    } catch {}
  }

  return (
    <div className="flex items-center gap-3 text-xs">
      <button type="button" onClick={copy} className="text-slate-400 transition-colors hover:text-primary-600">
        {copied ? "已复制 ✓" : "复制链接"}
      </button>
      <button type="button" onClick={report} className="text-slate-400 transition-colors hover:text-red-500">
        {reported ? "已反馈 ✓" : "报失效"}
      </button>
    </div>
  );
}
