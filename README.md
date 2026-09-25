# 盘搜 PanSou Search — 网盘资源搜索引擎

聚合全网公开分享的网盘资源链接，支持搜索与多维筛选，标注失效状态，每日自动更新。

- **技术栈**：Next.js 14 + Tailwind CSS + Supabase（Postgres + RLS）
- **数据源**：[fish2018/PanSou](https://github.com/fish2018/pansou) 聚合搜索 API（开源可自部署）
- **部署**：Vercel（免费 xxx.vercel.app 域名 + 每日定时任务）

## 功能

- 🔍 关键词搜索（中文模糊匹配，pg_trgm 加速）
- 🎛 多维筛选：资源类型 / 网盘类型 / 有效状态 / 更新时间 / 文件大小 / 排序
- ✅ 失效标注：夸克、蓝奏云高精度检测；百度、迅雷尽力检测；误杀保护（判断不了不改状态）
- 👥 失效反馈：访客匿名反馈，累计 3 次自动标记失效
- 🔥 热搜榜：记录真实搜索词，近 7 天 Top 10 展示，并反哺每日抓取
- 🌙 深色模式 + 移动端适配 + SEO（服务端渲染 / JSON-LD / robots）

## 目录结构

```
app/                  页面与接口（App Router）
  page.tsx            首页：搜索框 + 热搜 + 最新收录
  search/page.tsx     搜索结果页（筛选 + 分页）
  about/page.tsx      关于与免责声明
  api/cron/sync       每日任务：抓取新资源 + 复检失效状态
  api/report          失效反馈
  api/admin/import    管理端批量导入（ADMIN_TOKEN）
components/           UI 组件
lib/                  搜索逻辑 / 数据源适配 / 失效检测 / 演示数据
database/schema.sql   Supabase 建表 + RLS + 搜索函数（粘贴到 SQL Editor 执行）
```

## 本地运行

```bash
npm install
cp .env.example .env.local   # 填入环境变量（见下）
npm run dev                  # http://localhost:3000
```

> 未配置任何环境变量时，网站以「演示模式」运行（内置示例数据），可先看效果。

## 环境变量

| 变量 | 必填 | 说明 |
|---|---|---|
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` | 是 | Supabase 项目设置 → API |
| `SUPABASE_SERVICE_ROLE_KEY` | 是 | 同上【绝密，仅服务端】 |
| `SOURCE_API_URL` | 推荐 | PanSou 服务地址，如 `http://IP:8888`；自部署一行：`docker run -d --name pansou -p 8888:8888 ghcr.io/fish2018/pansou:latest` |
| `SOURCE_API_TOKEN` | 否 | 数据源开启认证时填写 |
| `CRON_SECRET` | 是 | 随机字符串，保护定时任务接口 |
| `ADMIN_TOKEN` | 是 | 随机字符串，保护管理接口 |
| `NEXT_PUBLIC_SITE_URL` | 部署后 | `https://你的项目.vercel.app` |
| `SITE_NAME` | 否 | 站点名称，默认「盘搜」 |

## 上线步骤（概览）

1. Supabase 建项目 → SQL Editor 执行 `database/schema.sql`
2. 代码推 GitHub → Vercel 导入仓库
3. Vercel 环境变量填入上表内容 → Deploy
4. 部署完成后手动访问一次 `https://你的域名/api/cron/sync`（带 `x-cron-secret` 头）验证抓取

详细逐步操作见对话交付说明。
