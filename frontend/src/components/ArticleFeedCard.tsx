"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Calendar, Eye, Clock, ArrowRight, Folder, Pin, Heart, MessageSquare } from "lucide-react";
import type { Comment, Post } from "@/lib/types";
import { formatExactDateTime } from "@/lib/time-format";
import { resolveAvatarFromHash } from "@/lib/avatar";
import { stripMarkdownAndHtml } from "@/lib/frontmatter";
import { calculateReadingTime } from "@/lib/reading-time";
import { resolveCoverImage } from "@/lib/post-image";
import { getCurrentUser } from "@/lib/auth";
import { apiFetch, PUBLIC_API_URL } from "@/lib/api-fetch";
import { toast } from "@/lib/toast";
import { notifyContentUpdated } from "@/lib/content-sync";
import { sharePost } from "@/lib/share";
import ActionMenu from "./ActionMenu";
import InteractionBubble from "./InteractionBubble";
import CommentSection from "./CommentSection";
import SafeImage from "./ui/SafeImage";

const API_URL = PUBLIC_API_URL;

interface ArticleFeedCardProps {
  post: Post;
  index?: number;
  variant?: "standalone" | "feed";
}

const ARTICLE_TYPE_BADGES: Record<string, { label: string; className: string }> = {
  original: {
    label: "原创",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60",
  },
  repost: {
    label: "转载",
    className: "bg-amber-50 text-amber-700 border-amber-200/80 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60",
  },
  ai: {
    label: "AI创作",
    className: "bg-purple-50 text-purple-700 border-purple-200/80 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800/60",
  },
};

export default function ArticleFeedCard({ post, index, variant = "standalone" }: ArticleFeedCardProps) {
  const router = useRouter();
  const detailUrl = `/articles/${post.shortId || post.id}`;
  const coverUrl = resolveCoverImage(post.cover, post.content);

  // 提取纯净正文摘要（自动消除 Frontmatter、HTML 标签与 Markdown 标记）
  let plainText = post.content ? stripMarkdownAndHtml(post.content) : "";
  if (post.title && plainText.startsWith(post.title.trim())) {
    plainText = plainText.slice(post.title.trim().length).trim();
  }

  const rawExcerpt = post.excerpt?.trim();
  const cleanExcerpt = rawExcerpt ? stripMarkdownAndHtml(rawExcerpt) : "";
  const isJunkExcerpt = !cleanExcerpt || /^---\s*(?:title|category|tags|articleType):/i.test(rawExcerpt || "");
  const excerpt = (!isJunkExcerpt && cleanExcerpt !== post.title?.trim() ? cleanExcerpt : "") || (plainText ? plainText.slice(0, 160) + (plainText.length > 160 ? "…" : "") : "");

  // 估算阅读时间
  const readMinutes = useMemo(() => calculateReadingTime(post.content || ""), [post.content]);

  const typeBadge = ARTICLE_TYPE_BADGES[post.articleType || "original"] || ARTICLE_TYPE_BADGES.original;
  const exactDateTime = formatExactDateTime(post.createdAt);
  const authorName = post.author?.nickname || "博主";

  // 朋友圈流模式 (variant === "feed") 互动状态
  const [likes, setLikes] = useState<Array<{ name: string; email?: string }>>(post.likes || []);
  const [liked, setLiked] = useState(!!post.meLiked);
  const [liking, setLiking] = useState(false);

  const [comments, setComments] = useState<Comment[]>(post.comments || []);
  const [showComments, setShowComments] = useState(false);
  const [replyTo, setReplyTo] = useState<string | undefined>(undefined);

  const [pinned, setPinned] = useState(!!post.pinned);
  const [isAdmin, setIsAdmin] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [deleted, setDeleted] = useState(false);

  useEffect(() => {
    const user = getCurrentUser();
    if (user?.isLoggedIn) {
      setIsAdmin(true);
      const sameOwner = post.author?.isOwner === true;
      const sameNickname = post.author?.nickname && user.nickname && post.author.nickname === user.nickname;
      setCanEdit(!!(sameOwner || sameNickname));
    }
  }, [post.author?.isOwner, post.author?.nickname]);

  useEffect(() => {
    setLiked(!!post.meLiked);
  }, [post.id, post.meLiked]);

  useEffect(() => {
    setLikes(post.likes || []);
  }, [post.likes]);

  useEffect(() => {
    setComments(post.comments || []);
  }, [post.comments]);

  useEffect(() => {
    setPinned(!!post.pinned);
  }, [post.pinned]);

  // 点赞/取消赞
  const handleLike = async () => {
    if (liking) return;
    setLiking(true);
    const prevLiked = liked;
    setLiked(!prevLiked);

    const user = getCurrentUser();
    const name = user?.nickname || (typeof window !== "undefined" && localStorage.getItem("visitor_name")) || "访客";
    const email = user?.email || (typeof window !== "undefined" && localStorage.getItem("visitor_email")) || "";

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (user?.isLoggedIn && user.token) {
        headers.Authorization = `Bearer ${user.token}`;
      }
      const res = await fetch(`${API_URL}/posts/${post.id}/likes`, {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify({ name, email }),
      });
      if (res.status === 403) {
        setLiked(prevLiked);
        const data = await res.json().catch(() => ({}));
        if (data?.message) toast.error(data.message);
        return;
      }
      if (!res.ok) {
        setLiked(prevLiked);
        return;
      }
      const data = await res.json();
      setLiked(data.liked);
      if (Array.isArray(data.likes)) {
        setLikes(data.likes);
      }
    } catch {
      setLiked(prevLiked);
    } finally {
      setLiking(false);
    }
  };

  const handleCommentClick = () => {
    setShowComments((prev) => !prev);
  };

  const handlePin = async () => {
    const user = getCurrentUser();
    if (!user?.isLoggedIn || !user.token) return;
    const next = !pinned;
    try {
      const res = await fetch(`${API_URL}/posts/${post.id}/pin`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user.token}`,
        },
        credentials: "include",
        body: JSON.stringify({ pinned: next }),
      });
      if (res.ok) {
        setPinned(next);
        toast.success(next ? "文章已置顶" : "已取消置顶");
        notifyContentUpdated();
        router.refresh();
      }
    } catch {
      // ignore
    }
  };

  const handleDelete = async () => {
    if (!window.confirm("确定要删除该文章吗？")) return;
    try {
      const res = await apiFetch(`/posts/${post.id}`, { method: "DELETE" });
      if (res.ok) {
        setDeleted(true);
        toast.success("文章已删除");
        notifyContentUpdated();
        router.refresh();
      } else {
        toast.error("删除失败，请重试");
      }
    } catch {
      toast.error("网络错误，删除失败");
    }
  };

  const handleShare = async () => {
    const articlePath = `/articles/${post.shortId || post.id}`;
    const title = post.title ? `《${post.title}》` : `${authorName} 的文章`;
    await sharePost({
      title,
      url: articlePath,
      typeLabel: "文章",
      summary: excerpt,
    });
  };

  if (deleted) return null;

  if (variant === "feed") {
    const authorAvatar = resolveAvatarFromHash(post.author?.avatar, post.author?.avatarHash, 96);
    return (
      <article
        id={`post-${post.id}`}
        className="flex gap-3 px-4 py-4 sm:px-5 md:px-6 animate-fade-in-up scroll-mt-16"
        style={typeof index === "number" ? { animationDelay: `${index * 60}ms` } : undefined}
      >
        {/* Avatar */}
        <Link
          href="/archives"
          className="relative block h-10 w-10 shrink-0 overflow-hidden rounded-[5px] bg-wechat-bubble md:h-11 md:w-11"
          aria-label={`查看${authorName}的归档`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={authorAvatar}
            alt={authorName}
            className="h-full w-full object-cover"
          />
        </Link>

        {/* Content column */}
        <div className="min-w-0 flex-1 flex flex-col justify-between">
          <h3 className="flex items-center justify-between gap-2 text-[15px] font-medium leading-5 text-wechat-nickname md:text-[16px]">
            <span className="truncate">{authorName}</span>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="rounded-full bg-neutral-100 dark:bg-neutral-800/80 px-2 py-0.5 text-[11px] font-medium text-neutral-600 dark:text-neutral-400">
                #{post.category || "文章"}
              </span>
              {(post.collection?.title || post.collectionTitle) && (
                <span className="rounded-full bg-blue-50 dark:bg-blue-950/60 border border-blue-200/60 dark:border-blue-800/60 px-2 py-0.5 text-[10px] font-medium text-blue-600 dark:text-blue-400">
                  系列: {post.collection?.title || post.collectionTitle}
                </span>
              )}
              {pinned && (
                <span className="shrink-0 rounded-[4px] bg-[#ececec] px-2 py-0.5 text-[11px] font-medium leading-tight text-[#9a9a9a] dark:bg-white/[0.1] dark:text-[#9a9a9a]">
                  置顶
                </span>
              )}
            </div>
          </h3>

          {/* 文章配文 / 摘录 */}
          {excerpt && (
            <p className="mt-1 text-[15px] leading-[23px] text-wechat-text md:text-[16px] md:leading-[24px] line-clamp-3">
              {excerpt}
            </p>
          )}

          {/* 微信公众号长文卡片样式 */}
          <Link
            href={detailUrl}
            className="group/card mt-2.5 flex w-full max-w-md sm:max-w-xl md:max-w-2xl items-stretch overflow-hidden rounded-xl border border-black/[0.06] bg-[#f7f7f7] transition-all duration-200 hover:bg-[#eaeaea] hover:border-black/10 dark:border-white/[0.08] dark:bg-[#25252b] dark:hover:bg-[#2e2e36] dark:hover:border-white/15"
          >
            {coverUrl && (
              <div className="relative h-20 w-20 shrink-0 overflow-hidden bg-black/5 dark:bg-white/5 sm:h-22 sm:w-22">
                <SafeImage
                  src={coverUrl}
                  alt={post.title || ""}
                  fill
                  sizes="88px"
                  className="object-cover transition-transform duration-300 group-hover/card:scale-105"
                />
              </div>
            )}
            <div className="flex min-w-0 flex-1 flex-col justify-between p-2.5 sm:p-3">
              <div>
                <p className="line-clamp-1 text-sm font-semibold text-neutral-900 group-hover/card:text-emerald-700 dark:text-neutral-100 dark:group-hover/card:text-emerald-400">
                  {post.title || "无标题文章"}
                </p>
                <p className="mt-0.5 line-clamp-1 text-xs text-neutral-500 dark:text-neutral-400">
                  {plainText || "深度博文阅读"}
                </p>
              </div>
              <div className="mt-1.5 flex items-center justify-between text-[11px] text-neutral-400 dark:text-neutral-500">
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {readMinutes} 分钟阅读
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200/80 dark:border-emerald-800/60 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300 group-hover/card:bg-emerald-100 dark:group-hover/card:bg-emerald-900/80 transition-colors">
                  <span>阅读全文</span>
                  <ArrowRight className="h-3 w-3 group-hover/card:translate-x-0.5 transition-transform" />
                </span>
              </div>
            </div>
          </Link>

          {/* Time & actions — 朋友圈风格一致的分享评论互动 */}
          <div className="mt-2.5 flex items-center justify-between text-[13px] text-wechat-time md:text-[14px]">
            <Link
              href={detailUrl}
              className="hover:underline hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors"
              title="查看文章详情与评论"
            >
              <time dateTime={post.createdAt} title={post.createdAt}>{exactDateTime}</time>
            </Link>
            <div className="flex items-center gap-2">
              <ActionMenu
                onLike={post.likesDisabled ? undefined : handleLike}
                onComment={post.commentsDisabled ? undefined : handleCommentClick}
                onShare={handleShare}
                onEdit={canEdit || isAdmin ? () => router.push(`/admin/articles/${post.id}`) : undefined}
                onDelete={isAdmin ? handleDelete : undefined}
                onPin={isAdmin ? handlePin : undefined}
                liked={liked}
                pinned={pinned}
              />
            </div>
          </div>

          {/* Likes + comments bubble — 朋友圈风格点赞评论气泡 */}
          <InteractionBubble
            likes={likes}
            comments={comments}
            onReply={(commentId) => {
              setReplyTo(commentId);
              setShowComments(true);
            }}
          />

          {/* Comment section — 朋友圈风格快速评论输入 */}
          {showComments && (
            <CommentSection
              postId={post.id}
              initialComments={comments}
              initialReplyTo={replyTo}
              onReplyCleared={() => setReplyTo(undefined)}
              onCommentAdded={(c) => setComments((prev) => [...prev, c])}
              onCommentSubmitted={() => {
                setReplyTo(undefined);
                setShowComments(false);
              }}
              autoFocus
            />
          )}
        </div>
      </article>
    );
  }

  return (
    <article
      className="group relative overflow-hidden rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-neutral-900/70 p-5 sm:p-7 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.04)] dark:shadow-[0_4px_20px_-8px_rgba(0,0,0,0.4)] transition-all duration-300 hover:border-black/15 dark:hover:border-white/20 hover:shadow-[0_8px_30px_-8px_rgba(0,0,0,0.08)] dark:hover:shadow-[0_8px_30px_-8px_rgba(0,0,0,0.6)] hover:-translate-y-0.5"
      style={typeof index === "number" ? { animationDelay: `${index * 60}ms` } : undefined}
    >
      <div className="flex flex-col sm:flex-row gap-5 sm:gap-6 items-start justify-between">
        {/* 主要文字内容区：桌面左侧 / 移动端在封面后 */}
        <div className="order-2 sm:order-1 min-w-0 flex-1 flex flex-col justify-between self-stretch">
          <div>
            {/* 元信息：置顶、分类、原创徽章、发布日期、阅读时间 */}
            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
              {post.pinned && (
                <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 text-rose-600 border border-rose-200/80 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-900/50 px-2 py-0.5 text-[11px] font-medium">
                  <Pin className="h-3 w-3" />
                  置顶
                </span>
              )}

              {post.category && (
                <span className="inline-flex items-center gap-1 rounded-md bg-neutral-100 dark:bg-neutral-800 px-2.5 py-0.5 font-medium text-neutral-700 dark:text-neutral-300 border border-neutral-200/60 dark:border-neutral-700/60">
                  <Folder className="h-3 w-3 text-neutral-500 dark:text-neutral-400" />
                  {post.category}
                </span>
              )}

              {(post.collection?.title || post.collectionTitle) && (
                <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 text-blue-700 border border-blue-200/70 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/60 px-2.5 py-0.5 font-medium text-[11px]">
                  📚 系列: {post.collection?.title || post.collectionTitle}
                </span>
              )}

              <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium border ${typeBadge.className}`}>
                {typeBadge.label}
              </span>

              {exactDateTime && (
                <span
                  className="inline-flex items-center gap-1 text-neutral-500 dark:text-neutral-400"
                  title={post.createdAt}
                >
                  <Calendar className="h-3 w-3" />
                  <time dateTime={post.createdAt}>{exactDateTime}</time>
                </span>
              )}

              <span className="inline-flex items-center gap-1 text-neutral-400 dark:text-neutral-500">
                <Clock className="h-3 w-3" />
                <span>约 {readMinutes} 分钟</span>
              </span>
            </div>

            {/* 文章标题 */}
            <h2 className="mb-2.5 text-lg sm:text-xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50 leading-snug break-words">
              <Link
                href={detailUrl}
                className="transition-colors hover:text-emerald-600 dark:hover:text-emerald-400 line-clamp-2"
              >
                {post.title || "无标题文章"}
              </Link>
            </h2>

            {/* 摘要正文 */}
            <p className="line-clamp-3 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400 break-words">
              {excerpt || "暂无摘要"}
            </p>
          </div>

          {/* 底部元信息条：作者、阅读量、点赞数、评论数与阅读全文链接 */}
          <div className="mt-5 pt-3.5 border-t border-black/[0.04] dark:border-white/[0.05] flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400 gap-2 flex-wrap">
            <div className="flex items-center gap-3.5 flex-wrap">
              <span className="font-medium text-neutral-700 dark:text-neutral-300">
                {authorName}
              </span>

              <span className="inline-flex items-center gap-1">
                <Eye className="h-3.5 w-3.5 text-neutral-400" />
                <span>{post.viewCount || 0}</span>
              </span>

              {typeof post.likes?.length === "number" && post.likes.length > 0 && (
                <span className="inline-flex items-center gap-1 text-neutral-400 dark:text-neutral-500">
                  <Heart className="h-3 w-3" />
                  <span>{post.likes.length}</span>
                </span>
              )}

              {typeof post.comments?.length === "number" && post.comments.length > 0 && (
                <span className="inline-flex items-center gap-1 text-neutral-400 dark:text-neutral-500">
                  <MessageSquare className="h-3 w-3" />
                  <span>{post.comments.length}</span>
                </span>
              )}
            </div>

            <Link
              href={detailUrl}
              className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100/90 dark:text-emerald-300 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/80 border border-emerald-200/80 dark:border-emerald-800/60 shadow-2xs transition-all duration-150 group-hover:translate-x-0.5 shrink-0"
            >
              <span>阅读全文</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>

        {/* 封面图：移动端在上方 (order-1)，桌面在右侧 (order-2) */}
        {coverUrl && (
          <Link
            href={detailUrl}
            tabIndex={-1}
            aria-hidden="true"
            className="relative order-1 sm:order-2 w-full sm:w-44 md:w-52 aspect-[16/9] sm:aspect-[4/3] shrink-0 overflow-hidden rounded-xl border border-black/5 dark:border-white/10 bg-neutral-100 dark:bg-neutral-800"
          >
            <SafeImage
              src={coverUrl}
              alt={post.title || "文章封面"}
              fill
              sizes="(max-width: 640px) 100vw, 208px"
              className="object-cover transition-transform duration-500 group-hover:scale-105"
            />
          </Link>
        )}
      </div>
    </article>
  );
}
