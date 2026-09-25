/**
 * 筛选条：服务端渲染的 Link 组，所有筛选条件通过 URL 参数传递（可分享、可回退）
 * 参数：q 关键词 / cat 类型 / pan 网盘 / st 状态 / d 天数 / sz 大小 / sort 排序
 */
import Link from "next/link";
import { CATEGORIES, PAN_TYPES, SIZE_FILTERS, TIME_FILTERS, SORT_OPTIONS } from "@/lib/meta";

export interface FilterState {
  q: string;
  cat: string;
  pan: string;
  st: string;
  d: string;
  sz: string;
  sort: string;
}

/** 从 URL searchParams 解析筛选状态 */
export function parseFilters(sp: Record<string, string | string[] | undefined>): FilterState {
  const get = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  return {
    q: get("q"),
    cat: get("cat"),
    pan: get("pan"),
    st: get("st"),
    d: get("d"),
    sz: get("sz"),
    sort: get("sort") || "time",
  };
}

/** 在当前筛选基础上修改一项后生成 URL（空值字段不写入 URL，即"清除该项"） */
export function buildFilterUrl(base: FilterState, patch: Partial<FilterState>): string {
  const merged = { ...base, ...patch };
  const sp = new URLSearchParams();
  if (merged.q) sp.set("q", merged.q);
  if (merged.cat) sp.set("cat", merged.cat);
  if (merged.pan) sp.set("pan", merged.pan);
  if (merged.st) sp.set("st", merged.st);
  if (merged.d && merged.d !== "0") sp.set("d", merged.d);
  if (merged.sz) sp.set("sz", merged.sz);
  if (merged.sort && merged.sort !== "time") sp.set("sort", merged.sort);
  const qs = sp.toString();
  return "/search" + (qs ? `?${qs}` : "");
}

/** 一组筛选链（组名 + 选项列表），点击选项 = 把该字段设为选项值，点"全部" = 清除 */
function Group({ label, field, current, options, base }: {
  label: string;
  field: "cat" | "pan" | "st" | "d" | "sz" | "sort";
  current: string;
  options: readonly { value: string; label: string }[];
  base: FilterState;
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-1 w-14 shrink-0 text-xs font-medium text-slate-400">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const active = current === o.value;
          return (
            <Link
              key={o.value || "all"}
              href={buildFilterUrl(base, { [field]: o.value })}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                active
                  ? "bg-primary-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              }`}
            >
              {o.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export default function FilterBar({ filters }: { filters: FilterState }) {
  const clearable =
    filters.cat || filters.pan || (filters.st && filters.st !== "all") || (filters.d && filters.d !== "0") || filters.sz;

  return (
    <div className="space-y-2.5 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
      <Group label="类型" field="cat" current={filters.cat} options={[{ value: "", label: "全部" }, ...CATEGORIES]} base={filters} />
      <Group label="网盘" field="pan" current={filters.pan} options={[{ value: "", label: "全部" }, ...PAN_TYPES.filter((p) => p.value !== "other")]} base={filters} />
      <Group label="状态" field="st" current={filters.st === "all" ? "" : filters.st} options={[{ value: "", label: "全部" }, { value: "active", label: "仅有效" }, { value: "invalid", label: "仅失效" }]} base={filters} />
      <Group label="时间" field="d" current={filters.d || "0"} options={TIME_FILTERS} base={filters} />
      <Group label="大小" field="sz" current={filters.sz} options={SIZE_FILTERS} base={filters} />
      <Group label="排序" field="sort" current={filters.sort} options={SORT_OPTIONS} base={filters} />

      {/* 清空全部筛选（保留关键词） */}
      {clearable ? (
        <div className="pt-1">
          <Link
            href={buildFilterUrl(filters, { cat: "", pan: "", st: "", d: "", sz: "", sort: "time" })}
            className="text-xs font-medium text-red-400 hover:text-red-500"
          >
            ✕ 清空筛选
          </Link>
        </div>
      ) : null}
    </div>
  );
}
