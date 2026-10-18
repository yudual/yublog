import type { Metadata } from "next";
import { FolderGit2 } from "lucide-react";
import ChannelHeader from "@/components/channel/ChannelHeader";
import PostList from "@/components/PostList";
import Footer from "@/components/Footer";
import FloatingActions from "@/components/FloatingActions";
import DesktopFooter from "@/components/DesktopFooter";
import EditPostModal from "@/components/EditPostModal";
import DesktopDecorations from "@/components/DesktopDecorations";
import { fetchPostsPage } from "@/lib/server-data";

export const revalidate = 10;

export const metadata: Metadata = {
  title: "项目 - 个人作品",
  description: "代码作品、独立产品与折腾成果",
};

async function getProjectPosts() {
  try {
    const result = await fetchPostsPage(`page=1&limit=10&category=${encodeURIComponent("项目")}`);
    const data = result.data.filter((p) => p.category === "项目");
    return { ...result, data };
  } catch {
    return { data: [], hasMore: false, total: 0, error: true };
  }
}

export default async function ProjectsPage() {
  const projectData = await getProjectPosts();

  return (
    <div id="scroll-root" className="relative min-h-screen flex flex-col overflow-x-hidden bg-wechat-white md:bg-wechat-bg transition-colors">
      <DesktopDecorations />

      <ChannelHeader
        title="项目"
        subtitle="独立开发、代码作品与折腾成果"
        icon={<FolderGit2 className="h-4.5 w-4.5 text-emerald-500 dark:text-emerald-400" />}
        count={projectData.total}
        maxWidth="max-w-6xl xl:max-w-7xl"
      />

      <div className="relative mx-auto w-full flex-1 flex flex-col max-w-6xl xl:max-w-7xl px-3 sm:px-6 pb-12">
        <main className="relative w-full flex-1 flex flex-col">
          {/* 空状态由 PostList 统一渲染：「暂未发布项目内容」，引导说明：「发动态时选择分类为「项目」即可在此展现」 */}
          <PostList
            initialPosts={projectData.data}
            initialHasMore={projectData.hasMore}
            initialPage={1}
            initialError={projectData.error}
            category="项目"
            layout="projects"
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
