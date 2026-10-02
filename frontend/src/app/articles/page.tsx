import type { Metadata } from "next";
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
        icon="✍️"
        count={articlesData.total}
        maxWidth="max-w-5xl xl:max-w-6xl 2xl:max-w-7xl"
      />

      {/* 博客化文章列表主体 */}
      <div className="relative mx-auto w-full flex-1 flex flex-col max-w-5xl xl:max-w-6xl 2xl:max-w-7xl px-4 sm:px-6 lg:px-8 pb-12">
        <main className="relative w-full flex-1 flex flex-col">
          {/* 系列合辑稳定入口：合辑卡片在信息流会沉底，这里保证始终可达 */}
          <CollectionStrip />
          <PostList
            initialPosts={articlesData.data}
            initialHasMore={articlesData.hasMore}
            initialPage={1}
            initialError={articlesData.error}
            type="article"
          />
        </main>
      </div>

      <Footer />
      <FloatingActions />
      <DesktopFooter />
      <EditPostModal />
    </div>
  );
}
