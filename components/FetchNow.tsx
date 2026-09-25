"use client";
/**
 * 即时抓取按钮（两种形态）：
 *  - mode="empty"  搜索无结果时的大按钮：全网立即搜索该关键词
 *  - mode="refresh" 有结果但可能不是最新时的小按钮：强制抓取该词最新资源
 * 点击后调用 /api/fetch（服务端限流），完成后自动刷新页面显示新资源
 */
import { useState } from "react";

export default function FetchNow({ keyword, mode }: { keyword: string; mode: "empty" | "refresh" }) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");

  async function run() {
    if (state === "loading") return;
    setState("loading");
    setMsg("正在全网搜索最新资源，约 10~30 秒，请勿关闭页面…");
    try {
      const res = await fetch("/api/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword }),
      });
      const j = await res.json();
      if (res.ok && j.ok) {
        setState("done");
        setMsg(j.message ?? "抓取完成");
        setTimeout(() => window.location.reload(), 1800); // 稍作停留让用户看到结果，再刷新页面
      } else {
        setState("error");
        setMsg(j.error || "抓取失败，请稍后再试");
      }
    } catch {
      setState("error");
      setMsg("网络异常，请稍后再试");
    }
  }

  if (mode === "empty") {
    return (
      <div className="mt-5 flex flex-col items-center gap-2">
        <button
          type="button"
          onClick={run}
          disabled={state === "loading"}
          className="rounded-xl bg-primary-600 px-6 py-3 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-700 disabled:cursor-wait disabled:opacity-70"
        >
          {state === "loading" ? "⏳ 正在全网搜索…" : `🧲 全网立即搜索「${keyword}」`}
        </button>
        {msg ? (
          <p className={`text-xs ${state === "error" ? "text-red-500" : "text-slate-500 dark:text-slate-400"}`}>{msg}</p>
        ) : (
          <p className="text-xs text-slate-400">没有也没关系，点上面按钮立刻去全网找一圈</p>
        )}
      </div>
    );
  }

  return (
    <div className="text-right">
      <button
        type="button"
        onClick={run}
        disabled={state === "loading"}
        className="text-xs font-medium text-slate-400 transition-colors hover:text-primary-600 disabled:cursor-wait disabled:opacity-60 dark:hover:text-primary-400"
      >
        {state === "loading" ? "⏳ 正在全网搜索最新资源…" : "🔄 刚更新的集数没收到？强制抓取最新"}
      </button>
      {msg ? <p className={`mt-1 text-xs ${state === "error" ? "text-red-500" : "text-slate-500 dark:text-slate-400"}`}>{msg}</p> : null}
    </div>
  );
}
