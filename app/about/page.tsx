/** 关于页：功能说明、数据来源、免责声明 */
const SITE_NAME = process.env.SITE_NAME || "盘搜";

export const metadata = {
  title: "关于本站",
};

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white">关于 {SITE_NAME}</h1>

      <div className="mt-6 space-y-6 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
        <section>
          <h2 className="mb-2 text-lg font-semibold text-slate-900 dark:text-white">这是什么网站</h2>
          <p>
            {SITE_NAME}是一个免费网盘资源搜索引擎，聚合全网公开分享的网盘链接，覆盖百度网盘、夸克网盘、迅雷网盘、蓝奏云等主流网盘，
            帮你快速找到电视剧、电影、综艺、动漫、小说、漫画、书籍等资源。
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-slate-900 dark:text-white">主要功能</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>关键词搜索：支持影视 / 小说 / 漫画 / 书籍等多类资源</li>
            <li>多维筛选：按资源类型、网盘类型、有效性、更新时间、文件大小组合筛选</li>
            <li>失效标注：每条资源标注「有效 / 已失效」状态，每日自动检测更新</li>
            <li>失效反馈：多人反馈失效的资源会被自动标记</li>
            <li>每日更新：定时任务自动抓取新资源并复检存量链接</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-slate-900 dark:text-white">数据从哪来</h2>
          <p>
            资源链接来自互联网上用户主动公开分享的网盘链接，通过聚合搜索接口抓取并索引。
            本站不存储、不上传任何资源文件本身，所有内容均保存在对应的第三方网盘平台。
          </p>
        </section>

        <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950">
          <h2 className="mb-2 text-lg font-semibold text-amber-800 dark:text-amber-300">免责声明</h2>
          <p className="text-amber-700 dark:text-amber-200/90">
            本站仅提供公开分享链接的搜索与索引服务，不提供任何资源的下载、存储与传播。
            链接内容由第三方网盘用户上传与分享，其合法性由分享者负责。如有侵权，请通过对应网盘平台的官方渠道举报处理，本站将在确认后移除相关索引。
          </p>
        </section>
      </div>
    </div>
  );
}
