/**
 * 演示模式数据：未配置 Supabase / 数据源时，用这批示例数据渲染全站，
 * 保证网站部署后立即可预览。接入真实数据后自动不再使用。
 */
import type { Resource } from "./types";

/** 生成相对当前时间 N 小时前的 ISO 时间，让演示数据的时间看起来新鲜 */
function hoursAgo(h: number): string {
  return new Date(Date.now() - h * 3600_000).toISOString();
}

type Seed = [title: string, category: Resource["category"], pan: Resource["pan_type"], sizeGB: number | null, status: Resource["status"], hours: number];

const seeds: Seed[] = [
  ["庆余年 第二季 4K 全36集", "tv", "quark", 86.4, "active", 2],
  ["流浪地球2 4K HDR 国语中字", "movie", "baidu", 32.1, "active", 5],
  ["三体 电视剧全集 1080P", "tv", "baidu", 45.8, "active", 8],
  ["哈利波特全系列 1-8部 蓝光原盘", "movie", "quark", 412.6, "active", 12],
  ["三体 全三部 刘慈欣 epub+mobi", "novel", "lanzou", 0.012, "active", 16],
  ["海贼王漫画 1-1112话 高清汉化", "comic", "baidu", 18.9, "active", 20],
  ["斗破苍穹 年番 更新至第152集", "anime", "quark", 128.4, "active", 26],
  ["沙丘2 Dune Part Two 2160P", "movie", "xunlei", 54.2, "active", 30],
  ["明朝那些事儿 全9册 PDF", "book", "lanzou", 0.28, "active", 36],
  ["狂飙 全39集 4K", "tv", "quark", 96.3, "active", 44],
  ["鬼灭之刃 柱训练篇 全集", "anime", "baidu", 15.7, "invalid", 50],
  ["凡人修仙传 年番 更新至第130集", "anime", "quark", 102.5, "active", 58],
  ["周处除三害 4K 国语", "movie", "xunlei", 22.8, "active", 64],
  ["诡秘之主 全3卷 epub", "novel", "lanzou", null, "active", 70],
  ["漫长的季节 全12集 1080P", "tv", "baidu", 28.6, "active", 78],
  ["进击的巨人 最终季 完整版", "anime", "quark", 88.9, "invalid", 84],
  ["人类简史 三部曲 epub+mobi", "book", "lanzou", 0.045, "active", 92],
  ["封神第一部 4K 蓝光原盘", "movie", "baidu", 78.2, "active", 100],
  ["大奉打更人 更新至第40集", "tv", "quark", 52.4, "active", 112],
  ["指环王三部曲 4K REMUX", "movie", "xunlei", 286.5, "active", 120],
  ["雪中悍刀行 全50集", "tv", "baidu", 64.1, "active", 132],
  ["一人之下 漫画 1-700话", "comic", "lanzou", 2.6, "active", 144],
  ["奔跑吧 第十二季 更新中", "tvshow", "quark", 45.2, "active", 156],
  ["盗墓笔记 全系列 txt+epub", "novel", "lanzou", 0.08, "active", 168],
  ["哥斯拉大战金刚2 4K 中字", "movie", "baidu", 41.7, "invalid", 180],
  ["遮天 年番 更新至第120集", "anime", "quark", 98.3, "active", 192],
  ["长安三万里 4K 国语", "movie", "xunlei", 36.9, "active", 204],
  ["与凤行 全39集 1080P", "tv", "baidu", 33.5, "active", 216],
  ["穷查理宝典 PDF 精排版", "book", "lanzou", 0.02, "active", 228],
  ["火影忍者 全720集+剧场版", "anime", "quark", 356.8, "active", 240],
  ["隐秘的角落 全12集 4K", "tv", "baidu", 29.4, "active", 252],
  ["角斗士2 4K 中字", "movie", "xunlei", 48.6, "active", 264],
  ["镖人 漫画 1-450话", "comic", "lanzou", 1.8, "active", 276],
  ["脱口秀大会 全五季合集", "tvshow", "quark", 128.7, "active", 288],
  ["克苏鲁神话 全集 epub", "novel", "lanzou", 0.03, "active", 300],
  ["异形夺命舰 4K HDR", "movie", "baidu", 52.3, "active", 312],
];

export const DEMO_RESOURCES: Resource[] = seeds.map(([title, category, pan, sizeGB, status, hours], i) => ({
  id: i + 1,
  title,
  description: null,
  category,
  pan_type: pan,
  share_url: "https://pan.example.com/s/demo" + (i + 1),
  extract_code: pan === "baidu" ? "demo" : null,
  file_size: sizeGB ? Math.round(sizeGB * (1024 ** 3)) : null,
  status,
  source: "演示数据",
  last_checked_at: hoursAgo(Math.max(1, Math.round(hours / 4))),
  created_at: hoursAgo(hours),
  updated_at: hoursAgo(hours),
}));
