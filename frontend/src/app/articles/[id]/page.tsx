import { notFound, redirect } from "next/navigation";
import { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import DesktopDecorations from "@/components/DesktopDecorations";
import ArticleTOC from "@/components/ArticleTOC";
import FloatingActions from "@/components/FloatingActions";
import Footer from "@/components/Footer";
import DesktopFooter from "@/components/DesktopFooter";
import EditPostModal from "@/components/EditPostModal";
import ArticleReader from "@/components/article/ArticleReader";
import CollectionReader from "@/components/article/CollectionReader";
import ProfileFadeIn from "@/components/profile/ProfileFadeIn";
import type { Post } from "@/lib/types";
import { getApiUrl } from "@/lib/api-fetch";
import { stripMarkdownAndHtml } from "@/lib/frontmatter";
import { extractCleanPostId } from "@/lib/share";

const API_URL = getApiUrl();

export const revalidate = 10;

async function getPost(id: string): Promise<Post | null> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/posts/${id}`, {
      next: { revalidate: 10, tags: ["posts"] },
    });
  } catch (err) {
    throw new Error(`网络请求失败: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`获取文章失败 (${res.status}): ${res.statusText}`);
  }
  return res.json();
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id: rawId } = await params;
  const cleanId = extractCleanPostId(rawId);
  try {
    const post = await getPost(cleanId);
    if (!post) return { title: "文章详情" };
    const cleanSummary = stripMarkdownAndHtml(post.excerpt || post.content || "");
    const title = post.type === "collection"
      ? `《${post.title || "合辑"}》系列专栏 - 个人博客`
      : `${post.title || "文章详情"} - 个人博客`;
    const description = cleanSummary.slice(0, 150) || (post.type === "collection" ? "查看系列专栏合辑详情" : "文章详情");
    // 未配置封面时分享卡退化为 summary 型，不带空图链接
    const imageUrl = typeof post.cover === "string" && post.cover.trim() ? post.cover.trim() : undefined;
    return {
      title,
      description,
      openGraph: {
        title,
        description,
        type: "article",
        ...(imageUrl ? { images: [{ url: imageUrl }] } : {}),
      },
      twitter: {
        card: imageUrl ? "summary_large_image" : "summary",
        title,
        description,
        ...(imageUrl ? { images: [imageUrl] } : {}),
      },
    };
  } catch {
    return { title: "文章详情" };
  }
}

export default async function ArticleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
  const cleanId = extractCleanPostId(rawId);
  const post = await getPost(cleanId);
  if (!post) notFound();
  if (post.status === "draft") notFound();

  // 若带有多余粘连文字/标点，重定向到纯净链接
  if (rawId !== cleanId) {
    redirect(`/articles/${post.shortId || post.id}`);
  }

  // 跨频道路由守卫 (Cross-Channel Route Guard)
  if (post.category === "项目" || post.type === "project") {
    redirect(`/projects/${post.shortId || post.id}`);
  }
  if (post.type !== "article" && post.type !== "collection") {
    redirect(`/moments/${post.shortId || post.id}`);
  }

  const isCollection = post.type === "collection";

  return (
    <div id="scroll-root" className="relative min-h-screen flex flex-col overflow-x-clip bg-wechat-white md:bg-wechat-bg transition-colors">
      <DesktopDecorations />

      {/* 居中自适应博客阅读容器与右侧目录 */}
      <div className="relative mx-auto w-full flex-1 max-w-[1440px] xl:max-w-[1600px] 2xl:max-w-[1720px] px-3 sm:px-6 lg:px-8 pt-18 sm:pt-24 pb-12 flex justify-center items-start gap-8 xl:gap-10">
        <div className="w-full flex-1 min-w-0 max-w-[980px] xl:max-w-[1100px] 2xl:max-w-[1200px] flex flex-col">
          {/* 返回文章列表 */}
          <div className="mb-4 sm:mb-6 flex items-center justify-between">
            <Link
              href="/articles"
              className="inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm font-medium text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white bg-white/70 hover:bg-white dark:bg-neutral-900/60 dark:hover:bg-neutral-800 border border-black/5 dark:border-white/10 backdrop-blur-md shadow-xs transition-all duration-150"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>{isCollection ? "返回文章与专栏列表" : "返回文章列表"}</span>
            </Link>
          </div>

          <main className="relative flex min-h-[calc(100vh-10rem)] w-full flex-col overflow-hidden rounded-2xl sm:rounded-3xl bg-wechat-white p-4 sm:p-8 md:p-10 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.08)] dark:shadow-[0_8px_40px_-12px_rgba(0,0,0,0.3)] border border-neutral-200/60 dark:border-neutral-800/80">
            <ProfileFadeIn>
              <div className="flex-1">
                {isCollection ? (
                  <CollectionReader post={post} />
                ) : (
                  <ArticleReader post={post} />
                )}
              </div>
              <div className="mt-auto pt-16">
                <Footer />
              </div>
            </ProfileFadeIn>
          </main>
        </div>

        {/* 桌面端右侧章节目录 (>= 1024px 显示，sticky稳固吸顶跟随滚动) */}
        <ArticleTOC
          className="hidden lg:block sticky top-24 z-20 w-64 xl:w-72 2xl:w-80 shrink-0 self-start"
          hideWhenEmpty
        />
      </div>

      <FloatingActions />
      <DesktopFooter />
      <EditPostModal />
    </div>
  );
}
