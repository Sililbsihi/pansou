import type { MetadataRoute } from "next";

/** robots.txt：允许所有搜索引擎抓取 */
export default function robots(): MetadataRoute.Robots {
  const site = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/"] },
    sitemap: `${site}/sitemap.xml`,
  };
}
