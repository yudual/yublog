import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Metadata } from "next";
import { ArrowLeft, ExternalLink, FolderGit2, Calendar } from "lucide-react";
import DesktopDecorations from "@/components/DesktopDecorations";
import FloatingActions from "@/components/FloatingActions";
import Footer from "@/components/Footer";
import DesktopFooter from "@/components/DesktopFooter";
import EditPostModal from "@/components/EditPostModal";
import ProfileFadeIn from "@/components/profile/ProfileFadeIn";
import type { Post } from "@/lib/types";
import { formatArticleTime } from "@/lib/time-format";
import { getApiUrl } from "@/lib/api-fetch";
import ArticleEmbedContent from "@/components/article/ArticleEmbedContent";
import { stripMarkdownAndHtml } from "@/lib/frontmatter";
import { extractCleanPostId } from "@/lib/share";
import { toSafeHttpUrl } from "@/lib/web-url";

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
    throw new Error(`获取项目失败 (${res.status}): ${res.statusText}`);
  }
  return res.json();
}

function toPlainText(value: string) {
  return stripMarkdownAndHtml(value);
}

function getProjectTitle(post: Post, plainText: string) {
  if (post.title?.trim()) return post.title.trim();
  if (post.linkCard?.title?.trim()) {
    const linkedTitle = post.linkCard.title.trim();
    const colonIndex = linkedTitle.indexOf(":");
    return colonIndex > 0 ? linkedTitle.slice(0, colonIndex).trim() : linkedTitle;
  }
  const quotedTitle = plainText.match(/[「“"]([^」”"]+)[」”"]/);
  if (quotedTitle?.[1]) return quotedTitle[1].trim();
  return plainText.split(/\n+/).find(Boolean)?.trim() || "未命名项目";
}

function getProjectDescription(post: Post, plainText: string) {
  if (post.excerpt?.trim()) return toPlainText(post.excerpt);
  const lines = plainText.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  return lines.length > 1 ? lines.slice(1).join(" ") : lines.join(" ");
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
    if (!post) return { title: "项目详情" };
    const plainText = toPlainText(post.content || "");
    const title = getProjectTitle(post, plainText);
    const description = getProjectDescription(post, plainText);
    return {
      title: `${title} - 项目详情 - 个人作品`,
      description: description || "代码作品、独立产品与折腾成果",
    };
  } catch {
    return { title: "项目详情" };
  }
}

export default async function ProjectDetailPage({
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
    redirect(`/projects/${post.shortId || post.id}`);
  }

  // 跨频道路由守卫 (Cross-Channel Route Guard)
  const isProject = post.category === "项目" || post.type === "project";
  if (!isProject) {
    if (post.type === "article") {
      redirect(`/articles/${post.shortId || post.id}`);
    }
    redirect(`/moments/${post.shortId || post.id}`);
  }

  const plainText = toPlainText(post.content || "");
  const title = getProjectTitle(post, plainText);
  const cleanContent = (post.content || "").replace(/<!--[\s\S]*?-->/g, "").trim();
  const hasH1 = /^\s*#\s+/m.test(cleanContent);
  const linkCardUrl = toSafeHttpUrl(post.linkCard?.url);
  const repostUrl = toSafeHttpUrl(post.repostUrl);

  return (
    <div id="scroll-root" className="relative min-h-screen flex flex-col overflow-x-hidden bg-wechat-white md:bg-wechat-bg transition-colors">
      <DesktopDecorations />

      <div className="relative mx-auto w-full flex-1 max-w-4xl min-w-0 px-3 sm:px-6 pt-18 sm:pt-24 pb-12">
        {/* 返回项目列表 */}
        <div className="mb-6 sm:mb-8">
          <Link
            href="/projects"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-500 transition-colors hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>返回项目列表</span>
          </Link>
        </div>

        <main className="relative flex min-h-[calc(100vh-10rem)] w-full flex-col overflow-hidden rounded-2xl sm:rounded-3xl bg-wechat-white p-6 sm:p-10 md:p-12 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.08)] dark:shadow-[0_8px_40px_-12px_rgba(0,0,0,0.3)] border border-neutral-200/60 dark:border-neutral-800/80">
          <ProfileFadeIn>
            <div className="flex-1">
              {/* 若正文开头未自带 # 一级大标题，则补充显示项目主标题与发布时间 */}
              {!hasH1 && (
                <header className="mb-8 border-b border-neutral-200/60 pb-6 dark:border-neutral-800/80">
                  <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight text-neutral-900 dark:text-white">
                    {post.title || title}
                  </h1>
                  <div className="mt-3 flex items-center gap-2 text-xs text-neutral-400 dark:text-neutral-500 font-mono">
                    <Calendar className="h-3.5 w-3.5" />
                    <time dateTime={post.createdAt}>{formatArticleTime(post.createdAt)}</time>
                  </div>
                </header>
              )}

              {/* 正式项目介绍内容（由 Markdown 直接驱动） */}
              {cleanContent ? (
                <ArticleEmbedContent
                  content={cleanContent}
                  postId={post.id}
                  className="rich-content text-[15px] sm:text-[16px] leading-relaxed text-neutral-700 dark:text-neutral-300 space-y-4"
                />
              ) : (
                <p className="text-sm text-neutral-400">暂无项目详细介绍</p>
              )}

              {/* 外部体验与源码链接（若设置了独立外链） */}
              {(linkCardUrl || repostUrl) && (
                <div className="mt-12 flex flex-wrap items-center gap-3 pt-6 border-t border-neutral-200/60 dark:border-neutral-800/80">
                  {linkCardUrl && (
                    <a
                      href={linkCardUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-neutral-900 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-emerald-200 cursor-pointer"
                    >
                      <ExternalLink className="h-4 w-4" />
                      <span>{post.linkCard?.siteName || "访问体验 / 在线演示"}</span>
                    </a>
                  )}
                  {repostUrl && (
                    <a
                      href={repostUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-neutral-200/80 bg-white px-4 text-sm font-medium text-neutral-800 transition hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800/90 dark:text-neutral-200 dark:hover:bg-neutral-700 cursor-pointer"
                    >
                      <FolderGit2 className="h-4 w-4" />
                      <span>开源仓库源码</span>
                    </a>
                  )}
                </div>
              )}
            </div>

            <div className="mt-auto pt-16">
              <Footer />
            </div>
          </ProfileFadeIn>
        </main>
      </div>

      <FloatingActions />
      <DesktopFooter />
      <EditPostModal />
    </div>
  );
}
