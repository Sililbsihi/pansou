/** @type {import('next').NextConfig} */
const nextConfig = {
  // 静态资源不做图片优化（本项目不加载外部图片，减少构建依赖）
  images: { unoptimized: true },
  // 搜索页/首页数据实时变化：禁用中间层与浏览器缓存，防止看到旧页面
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
