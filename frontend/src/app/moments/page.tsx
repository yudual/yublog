import type { Metadata } from "next";
import ChannelHeader from "@/components/channel/ChannelHeader";
import PostList from "@/components/PostList";
import Footer from "@/components/Footer";
import FloatingActions from "@/components/FloatingActions";
import DesktopFooter from "@/components/DesktopFooter";
import EditPostModal from "@/components/EditPostModal";
import DesktopDecorations from "@/components/DesktopDecorations";
import { MomentsLeftSidebar, MomentsRightSidebar } from "@/components/moments/MomentsSidebar";
import { fetchOwner, fetchPostsPage, fetchSiteSettings } from "@/lib/server-data";
import type { Post } from "@/lib/types";

export const revalidate = 10;

export const metadata: Metadata = {
  title: "岁岁念 - 生活随笔与日常",
  description: "日记、连载小说、动漫心得、日常吐槽与生活光芒",
};

async function getMoments(category?: string) {
  const catQuery = category ? `&category=${encodeURIComponent(category)}` : "";
  const result = await fetchPostsPage(`page=1&limit=10&type=moment${catQuery}`);
  const data = result.data.filter((p) => p.category !== "项目" && p.type !== "project");
  return { ...result, data };
}

async function getRecentArticles(): Promise<Post[]> {
  const result = await fetchPostsPage("page=1&limit=5&type=article");
  return result.data.filter((p) => p.category !== "项目");
}

export default async function MomentsPage({
  searchParams,
}: {
  searchParams?: Promise<{ category?: string | string[] }>;
}) {
  const sp = searchParams ? await searchParams : {};
  const rawCat = Array.isArray(sp.category) ? sp.category[0] : sp.category;
  const activeCategory = typeof rawCat === "string" ? rawCat.trim() : "";

  const [momentsData, owner, recentArticles, settings] = await Promise.all([
    getMoments(activeCategory),
    fetchOwner(),
    getRecentArticles(),
    fetchSiteSettings(),
  ]);

  return (
    <div id="scroll-root" className="relative min-h-screen flex flex-col overflow-x-clip bg-wechat-white md:bg-wechat-bg transition-colors">
      <DesktopDecorations />

      <ChannelHeader
        title={activeCategory ? `岁岁念 · #${activeCategory}` : "岁岁念"}
        subtitle="日记、故事小说、动漫心得、日常吐槽与生活光芒"
        icon="🍃"
        count={momentsData.total}
        maxWidth="max-w-[1400px] xl:max-w-[1560px] 2xl:max-w-[1680px]"
      />

      <div className="relative mx-auto w-full flex-1 flex flex-col max-w-[1400px] xl:max-w-[1560px] 2xl:max-w-[1680px] px-4 sm:px-6 lg:px-8 pb-12">
        <div className="flex justify-center items-start gap-6 xl:gap-8 flex-1">
          {/* 桌面端左侧：个人信息与频道卡片 */}
          <MomentsLeftSidebar
            owner={owner}
            siteSettings={settings}
            momentsCount={momentsData.total}
            activeCategory={activeCategory}
          />

          {/* 中间动态流主体 */}
          <main className="relative flex-1 max-w-[760px] xl:max-w-[880px] 2xl:max-w-[980px] min-w-0 w-full overflow-hidden rounded-3xl bg-wechat-white shadow-[0_8px_40px_-12px_rgba(0,0,0,0.08)] dark:shadow-[0_8px_40px_-12px_rgba(0,0,0,0.3)] border border-neutral-200/60 dark:border-neutral-800/80">
            <PostList
              key={activeCategory || "all"}
              initialPosts={momentsData.data}
              initialHasMore={momentsData.hasMore}
              initialPage={1}
              initialError={momentsData.error}
              type="moment"
              category={activeCategory}
            />
          </main>

          {/* 桌面宽屏端右侧：最新博文与站点信息卡片 */}
          <MomentsRightSidebar
            siteSettings={settings}
            recentArticles={recentArticles}
          />
        </div>
      </div>

      <Footer />
      <FloatingActions />
      <DesktopFooter />
      <EditPostModal />
    </div>
  );
}
