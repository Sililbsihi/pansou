/**
 * 榜单页板块定义与精选榜单：
 * - 视频 5 板块：TMDB 热门榜（lib/tmdb.ts）
 * - 漫画/小说/广播剧：TMDB 不覆盖，用精选榜单打底（网盘生态常见热门+经典），
 *   后续可叠加站内搜索热度。
 */

export interface SectionDef {
  key: string;
  name: string;
  source: "tmdb" | "curated";
  video?: boolean; // 是否有海报图
  curated?: string[]; // 精选标题（按热度降序）
}

export const SECTIONS: SectionDef[] = [
  { key: "tv", name: "电视剧", source: "tmdb", video: true },
  { key: "movie", name: "电影", source: "tmdb", video: true },
  { key: "kr", name: "韩剧", source: "tmdb", video: true },
  { key: "us", name: "美剧", source: "tmdb", video: true },
  { key: "uk", name: "英剧", source: "tmdb", video: true },
  {
    key: "manhua",
    name: "漫画",
    source: "curated",
    curated: [
      "斗破苍穹", "一人之下", "海贼王", "咒术回战", "间谍过家家",
      "鬼灭之刃", "进击的巨人", "葬送的芙莉莲", "我推的孩子", "排球少年",
      "辉夜大小姐想让我告白", "一拳超人", "镇魂街", "狐妖小红娘", "镖人",
    ],
  },
  {
    key: "novel",
    name: "小说",
    source: "curated",
    curated: [
      "诡秘之主", "庆余年", "三体", "凡人修仙传", "遮天",
      "完美世界", "盗墓笔记", "鬼吹灯", "明朝那些事儿", "大奉打更人",
      "宿命之环", "雪中悍刀行", "剑来", "斗罗大陆", "全职高手",
    ],
  },
  {
    key: "radio",
    name: "广播剧",
    source: "curated",
    curated: [
      "魔道祖师", "天官赐福", "伪装学渣", "撒野", "默读",
      "镇魂", "破云", "杀破狼", "残次品", "全球高考",
      "判官", "某某", "小蘑菇", "二哈和他的白猫师尊", "提灯映桃花",
    ],
  },
];

/** 精选榜单 → 跳转链接 */
export function curatedItems(sec: SectionDef) {
  return (sec.curated ?? []).map((title) => ({
    title,
    href: `/search?q=${encodeURIComponent(title)}`,
  }));
}
