import type { Metadata } from "next";
import "./globals.css";
import Header from "@/components/Header";

const SITE_NAME = process.env.SITE_NAME || "盘搜";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} - 免费网盘资源搜索 | 百度网盘/夸克/迅雷/蓝奏云`,
    template: `%s | ${SITE_NAME}`,
  },
  description:
    "免费网盘资源搜索引擎，聚合百度网盘、夸克网盘、迅雷网盘、蓝奏云资源，支持按资源类型、更新时间、文件大小筛选，标注资源是否失效，每日更新。",
  keywords: ["网盘搜索", "网盘资源", "百度网盘", "夸克网盘", "迅雷网盘", "蓝奏云", "影视资源", "小说资源", "漫画资源"],
  robots: { index: true, follow: true },
  openGraph: {
    siteName: SITE_NAME,
    locale: "zh_CN",
    type: "website",
  },
};

/** 深色模式初始化脚本：在首帧渲染前设置 class，避免闪烁 */
const themeScript = `(function(){try{var t=localStorage.getItem('theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;if(d)document.documentElement.classList.add('dark');}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1">{children}</main>
        <footer className="border-t border-slate-200 py-6 dark:border-slate-800">
          <div className="mx-auto max-w-6xl px-4 text-center text-xs leading-relaxed text-slate-400">
            <p>
              本站仅提供网盘公开分享链接的搜索与索引服务，所有资源内容均由第三方网盘用户提供，与本站无关。
            </p>
            <p className="mt-1">
              {SITE_NAME} · 数据每日更新 · 如有侵权请联系对应网盘平台处理
            </p>
            {/* 部署版本水印：页脚显示当前构建对应的提交号，用于确认线上运行的代码版本 */}
            <p className="mt-2 select-all font-mono text-[10px] text-slate-300 dark:text-slate-600">
              build {process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local"}
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
