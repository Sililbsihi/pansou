"use client";
/**
 * 即时抓取（两种形态）：
 *  - mode="empty"  搜索无结果时：挂载后自动全网实时搜索该关键词，无需点击
 *  - mode="refresh" 有结果但可能不是最新时的小按钮：手动点击强制抓取最新
 * 完成后自动刷新页面显示新资源；失败时显示具体原因
 */
import { useEffect, useRef, useState } from "react";

export default function FetchNow({ keyword, mode }: { keyword: string; mode: "empty" | "refresh" }) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");
  const autoRan = useRef(false); // 防止 React 严格模式/重复渲染导致多次自动触发

  async function run() {
    if (state === "loading") return;
    setState("loading");
    setMsg("正在全网实时搜索最新资源，首次约 15~45 秒（含唤醒数据源），请勿关闭页面…");
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
        // 无论是否有新增都刷新页面：让搜索结果反映数据库当前状态
        setTimeout(() => window.location.reload(), 1800);
      } else {
        setState("error");
        setMsg(j.error || "抓取失败，请稍后再试");
      }
    } catch {
      setState("error");
      setMsg("网络异常，请稍后再试");
    }
  }

  // 搜索无结果时自动触发一次实时搜索
  useEffect(() => {
    if (mode === "empty" && !autoRan.current) {
      autoRan.current = true;
      void run();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (mode === "empty") {
    return (
      <div className="mt-5 flex flex-col items-center gap-2">
        <button
          type="button"
          onClick={run}
          disabled={state === "loading"}
          className="rounded-xl bg-primary-600 px-6 py-3 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-700 disabled:cursor-wait disabled:opacity-70"
        >
          {state === "loading" ? "⏳ 正在全网实时搜索…" : `🧲 全网立即搜索「${keyword}」`}
        </button>
        {msg ? (
          <p className={`max-w-md text-center text-xs leading-relaxed ${state === "error" ? "text-red-500" : "text-slate-500 dark:text-slate-400"}`}>
            {msg}
          </p>
        ) : (
          <p className="text-xs text-slate-400">正在自动为你去全网找一圈，也可以点击按钮重试</p>
        )}
        {state === "error" ? (
          <button type="button" onClick={run} className="text-xs text-primary-600 hover:underline dark:text-primary-400">
            重试
          </button>
        ) : null}
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
        {state === "loading" ? "⏳ 正在全网搜索最新资源…" : "⚡ 实时搜全网 · 立即拿最新"}
      </button>
      {msg ? <p className={`mt-1 text-xs ${state === "error" ? "text-red-500" : "text-slate-500 dark:text-slate-400"}`}>{msg}</p> : null}
    </div>
  );
}
