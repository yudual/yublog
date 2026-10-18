import type { Metadata } from "next";
import Link from "next/link";
import { BookMarked, ArrowRight, PenLine } from "lucide-react";
import ChannelHeader from "@/components/channel/ChannelHeader";
import PostList from "@/components/PostList";
import CollectionStrip from "@/components/CollectionStrip";
import Footer from "@/components/Footer";
import FloatingActions from "@/components/FloatingActions";
import DesktopFooter from "@/components/DesktopFooter";
import EditPostModal from "@/components/EditPostModal";
import DesktopDecorations from "@/components/DesktopDecorations";
import { fetchPostsPage } from "@/lib/server-data";

export const revalidate = 10;

export const metadata: Metadata = {
  title: "文章 - 个人博客",
  description: "深度博文、技术思考与随笔写作",
};

async function getArticles() {
  try {
    const result = await fetchPostsPage("page=1&limit=10&type=article");
    const data = result.data.filter((p) => p.category !== "项目");
    return { ...result, data };
  } catch {
    return { data: [], hasMore: false, total: 0, error: true };
  }
}

export default async function ArticlesPage() {
  const articlesData = await getArticles();

  return (
    <div id="scroll-root" className="relative min-h-screen flex flex-col overflow-x-clip bg-wechat-white md:bg-wechat-bg transition-colors">
      <DesktopDecorations />

      {/* 栏目头部 */}
      <ChannelHeader
        title="文章"
        subtitle="深度长文、技术思考与随笔写作"
        icon={<PenLine className="h-4.5 w-4.5 text-blue-500 dark:text-blue-400" />}
        count={articlesData.total}
        maxWidth="max-w-5xl xl:max-w-6xl 2xl:max-w-7xl"
        rightAction={
          <Link
            href="/collections"
            className="group/col inline-flex items-center gap-1.5 rounded-xl border border-neutral-200/80 dark:border-neutral-700/80 bg-white/90 dark:bg-neutral-800/90 px-3.5 py-1.5 text-xs font-semibold text-neutral-700 dark:text-neutral-200 hover:border-neutral-300 dark:hover:border-neutral-600 hover:text-blue-600 dark:hover:text-blue-400 backdrop-blur-md shadow-2xs hover:shadow-xs active:scale-[0.97] transition-all"
          >
            <BookMarked className="h-3.5 w-3.5 text-blue-500 group-hover/col:scale-110 transition-transform" />
            <span>系列专栏</span>
            <ArrowRight className="h-3 w-3 text-neutral-400 group-hover/col:text-blue-600 dark:group-hover/col:text-blue-400 group-hover/col:translate-x-0.5 transition-all" />
          </Link>
        }
      />

      {/* 博客化文章列表主体 */}
      <div className="relative mx-auto w-full flex-1 flex flex-col max-w-5xl xl:max-w-6xl 2xl:max-w-7xl px-4 sm:px-6 lg:px-8 pb-12">
        <main className="relative w-full flex-1 flex flex-col">
          <PostList
            initialPosts={articlesData.data}
            initialHasMore={articlesData.hasMore}
            initialPage={1}
            initialError={articlesData.error}
            type="article"
          />
          {/* 系列合辑入口置于列表末尾：不打断文章流，同时保持合辑始终可达 */}
          <CollectionStrip />
        </main>
      </div>

      <Footer />
      <FloatingActions />
      <DesktopFooter />
      <EditPostModal />
    </div>
  );
}
