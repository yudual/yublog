import DesktopDecorations from "@/components/DesktopDecorations";
import PostList from "@/components/PostList";
import FloatingActions from "@/components/FloatingActions";
import Footer from "@/components/Footer";
import DesktopFooter from "@/components/DesktopFooter";
import AdminNotifications from "@/components/AdminNotifications";
import EditPostModal from "@/components/EditPostModal";
import ProfileScrollRestoration from "@/components/profile/ProfileScrollRestoration";
import HeroSection from "@/components/home/HeroSection";
import { fetchOwner, fetchPostsPage, fetchSiteSettings } from "@/lib/server-data";

const PAGE_SIZE = 10;

// ISR：10 秒重新验证（后端写操作后会触发按需重验证，10秒仅作安全网）
export const revalidate = 10;

export default async function Home() {
  const [owner, postsData, settings] = await Promise.all([
    fetchOwner(),
    fetchPostsPage(`page=1&limit=${PAGE_SIZE}`),
    fetchSiteSettings(),
  ]);

  // 首页桌面端单层壁纸配置（当前已遵从用户要求关闭壁纸，展示纯净渐变星尘）
  let homepageBg = "";
  if (typeof settings?.decorationImage === "string" && settings.decorationImage.trim()) {
    homepageBg = settings.decorationImage.trim();
  } else if (settings?.backgroundImages) {
    try {
      const parsed = typeof settings.backgroundImages === "string" ? JSON.parse(settings.backgroundImages) : settings.backgroundImages;
      if (Array.isArray(parsed) && typeof parsed[0] === "string" && parsed[0].trim()) {
        homepageBg = parsed[0].trim();
      }
    } catch {}
  }
  if (!homepageBg && typeof owner?.cover === "string" && owner.cover.trim()) {
    homepageBg = owner.cover.trim();
  }

  return (
    <div id="scroll-root" className="relative min-h-screen flex flex-col overflow-x-clip bg-[#faf9f6] dark:bg-[#0a0a0d] text-neutral-900 dark:text-neutral-100 transition-colors">
      {/* 空间纵深分布的微光极光弥散层 (Absolute Spatial Aurora Layers) */}
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden="true">
        {/* 顶部主星云 - 蓝紫极光 (跟随 Hero) */}
        <div className="absolute -top-36 -left-24 h-[520px] w-[520px] sm:h-[720px] sm:w-[720px] rounded-full bg-gradient-to-br from-indigo-400/[0.115] via-purple-400/[0.095] to-transparent dark:from-indigo-600/[0.16] dark:via-purple-700/[0.12] to-transparent blur-[160px]" />
        {/* 顶部副星云 - 暖杏落日 (跟随 Hero) */}
        <div className="absolute -top-24 -right-24 h-[480px] w-[480px] sm:h-[680px] sm:w-[680px] rounded-full bg-gradient-to-bl from-amber-300/[0.115] via-rose-300/[0.095] to-transparent dark:from-amber-500/[0.14] dark:via-rose-600/[0.11] to-transparent blur-[160px]" />
        {/* 中部地平过渡星云 - 青碧冷星光 (位于 Hero 底部与动态流交接处) */}
        <div className="absolute top-[620px] sm:top-[680px] left-1/2 -translate-x-1/2 h-[420px] w-[90%] max-w-4xl rounded-full bg-gradient-to-r from-teal-300/[0.08] via-cyan-300/[0.07] to-transparent dark:from-cyan-600/[0.12] dark:via-teal-700/[0.09] to-transparent blur-[150px]" />
        {/* 动态流中深空星云 - 薰衣草微光 (随着滚动探索逐渐显现) */}
        <div className="absolute top-[1350px] -right-36 h-[460px] w-[460px] sm:h-[650px] sm:w-[650px] rounded-full bg-gradient-to-l from-purple-300/[0.08] via-pink-300/[0.07] to-transparent dark:from-purple-800/[0.12] dark:via-pink-800/[0.09] to-transparent blur-[150px]" />
        {/* 底部深空回响星云 */}
        <div className="absolute bottom-[200px] -left-36 h-[420px] w-[420px] sm:h-[600px] sm:w-[600px] rounded-full bg-gradient-to-tr from-indigo-300/[0.07] via-purple-300/[0.06] to-transparent dark:from-indigo-900/[0.12] dark:via-purple-950/[0.09] to-transparent blur-[150px]" />
      </div>

      {/* 3. 首页 Hero 区域 */}
      <div className="relative z-10 w-full">
        <HeroSection
          owner={owner}
          siteSettings={settings}
          postsCount={postsData.total ?? postsData.data.length}
        />
      </div>

      {/* 4. 博客动态流区域 (Observatory Stream Panel) */}
      <div id="moments-section" className="relative z-10 mx-auto w-full flex-1 flex flex-col max-w-4xl xl:max-w-5xl 2xl:max-w-6xl px-3 sm:px-6 lg:px-8 pt-0 sm:pt-4 pb-14 scroll-mt-20">
        <main className="relative w-full flex-1 overflow-hidden rounded-3xl backdrop-blur-xl bg-white/85 dark:bg-[#15161d]/85 shadow-[0_16px_50px_-16px_rgba(0,0,0,0.06)] dark:shadow-[0_20px_60px_-16px_rgba(0,0,0,0.45)] border border-neutral-200/80 dark:border-white/[0.08] transition-all before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-amber-400/40 dark:before:via-amber-300/30 before:to-transparent">
          {/* 四角光学微对焦十字标 */}
          <span className="pointer-events-none absolute top-2 left-2 text-[9px] leading-none text-neutral-400/60 dark:text-neutral-500/60 font-mono">+</span>
          <span className="pointer-events-none absolute top-2 right-2 text-[9px] leading-none text-neutral-400/60 dark:text-neutral-500/60 font-mono">+</span>
          <span className="pointer-events-none absolute bottom-2 left-2 text-[9px] leading-none text-neutral-400/60 dark:text-neutral-500/60 font-mono">+</span>
          <span className="pointer-events-none absolute bottom-2 right-2 text-[9px] leading-none text-neutral-400/60 dark:text-neutral-500/60 font-mono">+</span>

          {/* 动态卡片顶部导航栏 (清爽克制) */}
          <div className="flex items-center justify-between border-b border-black/[0.05] dark:border-white/[0.06] px-5 sm:px-6 py-3.5 bg-neutral-50/70 dark:bg-neutral-800/40 backdrop-blur-md">
            <div className="flex items-center gap-2.5">
              <span className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
                博客动态 · 岁岁念与随笔
              </span>
              <span className="rounded-full border border-neutral-200/80 dark:border-neutral-800 bg-white/80 dark:bg-neutral-800/80 px-2 py-0.5 text-[11px] font-medium text-neutral-600 dark:text-neutral-400">
                {postsData.total ?? postsData.data.length} 篇
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
              </span>
              <span className="hidden sm:inline">实时更新</span>
            </div>
          </div>

          <div className="pt-2">
            <AdminNotifications />
          </div>

          <PostList
            initialPosts={postsData.data}
            initialHasMore={postsData.hasMore}
            initialPage={1}
            initialError={postsData.error}
          />
        </main>
      </div>

      {/* 5. 全局底部 */}
      <div className="relative z-10 w-full">
        <Footer />
      </div>

      {/* 悬浮操作与弹窗 */}
      <FloatingActions />
      <DesktopFooter />
      <EditPostModal />
      <ProfileScrollRestoration storageKey="home-scroll-y" waitForFadeIn={false} />
    </div>
  );
}
