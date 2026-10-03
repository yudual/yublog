import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import DesktopDecorations from "@/components/DesktopDecorations";
import FloatingActions from "@/components/FloatingActions";
import Footer from "@/components/Footer";
import DesktopFooter from "@/components/DesktopFooter";
import EditPostModal from "@/components/EditPostModal";
import PostDetail from "@/components/post-detail/PostDetail";
import ProfileFadeIn from "@/components/profile/ProfileFadeIn";
import type { Post } from "@/lib/types";
import { getApiUrl } from "@/lib/api-fetch";
import { extractCleanPostId } from "@/lib/share";
import { toSafeImageUrl } from "@/lib/web-url";

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
    throw new Error(`获取动态失败 (${res.status}): ${res.statusText}`);
  }
  return res.json();
}

/** 根据动态内容生成浏览器标签标题 */
function getPostTitle(post: Post): string {
  // 系列合辑
  if (post.type === "collection") {
    return post.title ? `《${post.title}》系列合辑` : "系列合辑详情";
  }
  // 音频：显示歌曲名
  if (post.music) {
    return post.music.name || "音乐动态";
  }
  // 网站：显示网站名
  if (post.linkCard) {
    return post.linkCard.siteName || post.linkCard.title || "分享的网站";
  }
  // 视频：显示视频标题
  if (post.video) {
    return post.video.title || "视频动态";
  }
  // 单纯图片（无文字）：显示"图片"
  if (post.images && post.images.length > 0 && !post.content) {
    return "图片";
  }
  // 文本：显示文本内容（去 HTML 标签后截断）
  if (post.content) {
    const text = post.content
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();
    return text.length > 30 ? text.slice(0, 30) + "…" : text || "动态详情";
  }
  return post.title || "动态详情";
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
    if (!post) return { title: "动态详情" };
    const title = getPostTitle(post);
    const plainText = (post.title || post.excerpt || post.content || "")
      .replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    const description = post.excerpt || (plainText
      ? (plainText.length > 80 ? plainText.slice(0, 80) + "…" : plainText)
      : "查看动态详情与讨论");
    const firstImg = post.images?.[0];
    const imageRaw =
      (typeof firstImg === "string" ? firstImg : firstImg?.src) ||
      (typeof post.music?.cover === "string" ? post.music.cover : "") ||
      post.cover ||
      undefined;
    const imageUrl = toSafeImageUrl(imageRaw) || undefined;

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
    return { title: "动态详情" };
  }
}

export default async function PostDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
  const cleanId = extractCleanPostId(rawId);
  const post = await getPost(cleanId);
  if (!post) notFound();
  if (post.status === "draft") notFound();

  // 跨频道路由守卫 (Cross-Channel Route Guard)
  if (post.category === "项目" || post.type === "project") {
    redirect(`/projects/${post.shortId || post.id}`);
  }
  if (post.type === "article" || post.type === "collection") {
    redirect(`/articles/${post.shortId || post.id}`);
  }

  // 若带有多余粘连文字/标点，重定向到纯净动态链接
  if (rawId !== cleanId) {
    redirect(`/moments/${post.shortId || post.id}`);
  }

  return (
    <div id="scroll-root" className="relative min-h-screen flex flex-col overflow-x-hidden bg-wechat-white md:bg-wechat-bg transition-colors">
      <DesktopDecorations />

      <div className="relative mx-auto w-full flex-1 max-w-[640px] md:max-w-2xl lg:max-w-3xl px-3 sm:px-4 pt-20 sm:pt-24 pb-12">
        {/* 返回动态列表 */}
        <div className="mb-4 sm:mb-6">
          <Link
            href="/moments"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-500 transition-colors hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>返回动态列表</span>
          </Link>
        </div>

        <main className="relative flex min-h-[calc(100vh-10rem)] w-full flex-col overflow-hidden rounded-3xl bg-wechat-white p-4 sm:p-6 md:p-8 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.08)] dark:shadow-[0_8px_40px_-12px_rgba(0,0,0,0.3)] border border-neutral-200/60 dark:border-neutral-800/80">
          <ProfileFadeIn>
            <div className="flex-1">
              <PostDetail post={post} />
            </div>
            <Footer />
          </ProfileFadeIn>
        </main>
      </div>

      <FloatingActions />
      <DesktopFooter />
      <EditPostModal />
    </div>
  );
}
