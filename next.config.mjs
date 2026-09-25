/** @type {import('next').NextConfig} */
const nextConfig = {
  // 静态资源不做图片优化（本项目不加载外部图片，减少构建依赖）
  images: { unoptimized: true },
};

export default nextConfig;
