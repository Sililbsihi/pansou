/** 站点顶栏：Logo + 导航 + 深色切换 */
import Link from "next/link";
import ThemeToggle from "./ThemeToggle";

const SITE_NAME = process.env.SITE_NAME || "盘搜";

export default function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary-600 text-white">盘</span>
          <span className="text-lg font-bold text-slate-900 dark:text-slate-50">{SITE_NAME}</span>
        </Link>
        <nav className="flex items-center gap-1 sm:gap-3">
          <Link href="/" className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white">
            首页
          </Link>
          <Link href="/about" className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white">
            关于
          </Link>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
