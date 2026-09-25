-- =====================================================================
-- 盘搜 · Supabase 数据库初始化脚本
-- 使用方法：Supabase 控制台 → SQL Editor → 粘贴全部内容 → Run
-- 幂等设计：可重复执行，不会破坏已有数据
-- =====================================================================

-- 0. 启用 pg_trgm 扩展（中文模糊搜索加速）
create extension if not exists pg_trgm;

-- =====================================================================
-- 1. 资源主表
-- =====================================================================
create table if not exists resources (
  id              bigint generated always as identity primary key,
  title           text not null,                        -- 资源标题
  description     text,                                 -- 简介/来源备注
  category        text not null default 'other',        -- tv/movie/tvshow/anime/novel/comic/book/other
  pan_type        text not null,                        -- baidu/quark/xunlei/lanzou/other
  share_url       text not null,                        -- 分享链接（唯一，用于去重）
  extract_code    text,                                 -- 提取码
  file_size       bigint,                               -- 文件大小（字节），未知为空
  status          text not null default 'active',       -- active 有效 / invalid 失效
  source          text,                                 -- 数据来源
  last_checked_at timestamptz,                          -- 上次有效性检测时间
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- 分享链接唯一：同一条链接只收录一次
-- 唯一索引必须是裸列（不能用 lower() 表达式），否则 ON CONFLICT (share_url) 无法匹配
create unique index if not exists resources_share_url_idx on resources (share_url);

-- 中文模糊搜索加速（标题+简介 合并表达式上的 trigram 索引）
create index if not exists resources_search_trgm_idx
  on resources using gin ((title || ' ' || coalesce(description, '')) gin_trgm_ops);

-- 常用筛选组合索引
create index if not exists resources_updated_idx on resources (updated_at desc);
create index if not exists resources_status_idx on resources (status);
create index if not exists resources_category_idx on resources (category);
create index if not exists resources_pan_idx on resources (pan_type);
create index if not exists resources_check_idx on resources (last_checked_at asc nulls first);

-- =====================================================================
-- 2. 搜索记录表（用于生成首页热搜榜）
-- =====================================================================
create table if not exists search_logs (
  id         bigint generated always as identity primary key,
  keyword    text not null,
  created_at timestamptz not null default now()
);

create index if not exists search_logs_kw_idx on search_logs (keyword, created_at desc);

-- =====================================================================
-- 3. 失效反馈表（访客反馈资源已失效）
-- =====================================================================
create table if not exists reports (
  id          bigint generated always as identity primary key,
  resource_id bigint not null references resources (id) on delete cascade,
  created_at  timestamptz not null default now()
);

create index if not exists reports_resource_idx on reports (resource_id);

-- =====================================================================
-- 4. 同步日志表（每日定时任务的运行记录）
-- =====================================================================
create table if not exists sync_logs (
  id             bigint generated always as identity primary key,
  inserted       int,          -- 本次新收录条数
  fetched        int,          -- 本次抓取到条数
  rechecked      int,          -- 本次复检条数
  marked_invalid int,          -- 本次标记失效条数
  message        text,         -- 错误/说明信息
  duration_ms    bigint,       -- 任务耗时（毫秒）
  created_at     timestamptz not null default now()
);

-- =====================================================================
-- 4.5 即时抓取任务表（网页“全网立即搜索”按钮的限流与记录）
--     匿名完全不可读写（RLS 全拒绝）；仅服务端 service_role 读写
-- =====================================================================
create table if not exists fetch_jobs (
  id         bigint generated always as identity primary key,
  keyword    text not null,     -- 规范化后的抓取关键词
  ip_hash    text,              -- 访客 IP 的加盐哈希（不存原始 IP）
  created_at timestamptz not null default now()
);
create index if not exists fetch_jobs_kw_idx on fetch_jobs (keyword, created_at desc);
create index if not exists fetch_jobs_ip_idx on fetch_jobs (ip_hash, created_at desc);
create index if not exists fetch_jobs_created_idx on fetch_jobs (created_at desc);

-- =====================================================================
-- 5. RLS 行级安全（【安全铁律】每张表默认拒绝，只放行明确允许的操作）
--    匿名访客：只能读 resources；只能写 search_logs / reports
--    写 resources / 读统计：只走服务端 service_role（自动绕过 RLS）
-- =====================================================================
alter table resources  enable row level security;
alter table search_logs enable row level security;
alter table reports    enable row level security;
alter table sync_logs  enable row level security;
alter table fetch_jobs enable row level security;

-- 任何人可浏览资源
drop policy if exists "任何人可读资源" on resources;
create policy "任何人可读资源" on resources
  for select using (true);

-- 任何人可记录搜索词（只写，不可读不可改）
drop policy if exists "任何人可记录搜索词" on search_logs;
create policy "任何人可记录搜索词" on search_logs
  for insert with check (char_length(keyword) between 1 and 50);

-- 任何人可反馈失效（只写，不可读不可改）
drop policy if exists "任何人可反馈失效" on reports;
create policy "任何人可反馈失效" on reports
  for insert with check (true);

-- sync_logs 不创建任何匿名策略：访客完全不可见，仅服务端可写

-- =====================================================================
-- 6. 搜索函数：分词 + AND 语义 + 筛选 + 排序 + 分页
--    前端通过 supabase.rpc('search_resources', {...}) 调用
-- =====================================================================
create or replace function search_resources(
  p_query    text   default '',      -- 关键词（空格分词，全部命中才算匹配）
  p_category text   default null,    -- 资源类型
  p_pan      text   default null,    -- 网盘类型
  p_status   text   default null,    -- active/invalid，null=全部
  p_days     int    default 0,       -- 最近 N 天，0=全部
  p_min_size bigint default null,    -- 最小字节数
  p_max_size bigint default null,    -- 最大字节数
  p_sort     text   default 'time',  -- time/size_desc/size_asc
  p_page     int    default 1,
  p_per      int    default 20
)
returns table (rows json, total bigint)
language sql
stable
as $$
  with q as (
    -- 关键词分词，每个词生成 %词% 模式
    select '%' || btrim(t) || '%' as pat
    from unnest(string_to_array(btrim(coalesce(p_query, '')), ' ')) as t
    where btrim(t) <> ''
  ),
  filtered as (
    select r.*
    from resources r
    where
      -- 多关键词 AND 语义：标题+简介合并字段必须包含全部分词
      ((select count(*) from q) = 0
        or (r.title || ' ' || coalesce(r.description, '')) ilike all (array(select pat from q)))
      and (p_category is null or r.category = p_category)
      and (p_pan is null or r.pan_type = p_pan)
      and (p_status is null or p_status = 'all' or r.status = p_status)
      and (p_days is null or p_days <= 0 or r.updated_at >= now() - (p_days || ' days')::interval)
      and (p_min_size is null or r.file_size >= p_min_size)
      and (p_max_size is null or r.file_size <= p_max_size)
  )
  select
    coalesce(json_agg(paged.row_data), '[]'::json) as rows,
    coalesce(max(paged.cnt), 0)::bigint            as total
  from (
    select row_to_json(f) as row_data, count(*) over () as cnt
    from filtered f
    order by
      case when p_sort = 'time'      then f.updated_at end desc nulls last,
      case when p_sort = 'size_desc' then f.file_size  end desc nulls last,
      case when p_sort = 'size_asc'  then f.file_size  end asc  nulls last,
      f.updated_at desc
    limit greatest(p_per, 1)
    offset (greatest(p_page, 1) - 1) * greatest(p_per, 1)
  ) paged;
$$;

-- =====================================================================
-- 7. 热搜词函数：近 7 天搜索次数 Top N（首页热搜榜）
--    SECURITY DEFINER：匿名用户可通过 rpc 调用，绕过 search_logs 的读限制
-- =====================================================================
create or replace function get_hot_keywords(p_limit int default 10)
returns table (keyword text, cnt bigint)
language sql
stable
security definer
set search_path = public
as $$
  select s.keyword, count(*)::bigint as cnt
  from search_logs s
  where s.created_at >= now() - interval '7 days'
  group by s.keyword
  order by cnt desc, max(s.created_at) desc
  limit greatest(p_limit, 1);
$$;

-- =====================================================================
-- 完成。验证方式：在 SQL Editor 执行
-- select * from search_resources(p_query => '三体', p_per => 5);
-- =====================================================================
