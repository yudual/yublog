"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Code2, ExternalLink, FolderGit2, Link2 } from "lucide-react";
import type { Comment, Post } from "@/lib/types";
import { formatExactDateTime } from "@/lib/time-format";
import { getImageSrc, extractFirstMarkdownImage } from "@/lib/post-image";
import { resolveAvatarFromHash } from "@/lib/avatar";
import { toAbsoluteUrl, toHttps } from "@/lib/upload";
import { useEffect, useMemo, useState } from "react";
import { stripMarkdownAndHtml } from "@/lib/frontmatter";
import { getCurrentUser } from "@/lib/auth";
import { apiFetch, PUBLIC_API_URL } from "@/lib/api-fetch";
import { toast } from "@/lib/toast";
import { notifyContentUpdated } from "@/lib/content-sync";
import { sharePost } from "@/lib/share";
import { toSafeHttpUrl, toSafeImageUrl } from "@/lib/web-url";
import ActionMenu from "./ActionMenu";
import InteractionBubble from "./InteractionBubble";
import CommentSection from "./CommentSection";

const API_URL = PUBLIC_API_URL;

interface ProjectCardProps {
  post: Post;
  index?: number;
  featured?: boolean;
  variant?: "standalone" | "feed";
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

function getProjectTags(post: Post, text: string) {
  const content = post.content || "";
  const explicitMatch = content.match(/<!--\s*tags:\s*([^\n>]+)\s*-->/i);
  if (explicitMatch && explicitMatch[1]) {
    const customTags = explicitMatch[1]
      .split(/[,，、]/)
      .map((t) => t.trim())
      .filter(Boolean);
    if (customTags.length > 0) return customTags.slice(0, 5);
  }
  const searchable = `${post.title || ""} ${post.excerpt || ""} ${text}`.toLowerCase();
  const knownTags = [
    ["next.js", "Next.js"],
    ["react", "React"],
    ["typescript", "TypeScript"],
    ["javascript", "JavaScript"],
    ["sqlite", "SQLite"],
    ["localstorage", "LocalStorage"],
    ["markdown", "Markdown"],
    ["node.js", "Node.js"],
    ["tailwind", "Tailwind CSS"],
    ["本地优先", "Local-first"],
  ] as const;
  const tags = knownTags.filter(([needle]) => searchable.includes(needle)).map(([, label]) => label);
  return tags.length > 0 ? tags.slice(0, 4) : ["独立开发", "个人作品"];
}

export default function ProjectCard({ post, index, featured = false, variant = "standalone" }: ProjectCardProps) {
  const router = useRouter();
  const plainText = useMemo(() => toPlainText(post.content || ""), [post.content]);
  const title = useMemo(() => getProjectTitle(post, plainText), [plainText, post]);
  const description = useMemo(() => getProjectDescription(post, plainText), [plainText, post]);
  const tags = useMemo(() => getProjectTags(post, plainText), [plainText, post]);
  const detailHref = `/projects/${post.shortId || post.id}`;
  const projectHref = toSafeHttpUrl(post.linkCard?.url);
  const isExternal = Boolean(projectHref);

  // 朋友圈模式下的互动状态
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
        toast.success(next ? "项目已置顶" : "已取消置顶");
        notifyContentUpdated();
        router.refresh();
      }
    } catch {
      // ignore
    }
  };

  const handleDelete = async () => {
    if (!window.confirm("确定要删除该项目动态吗？")) return;
    try {
      const res = await apiFetch(`/posts/${post.id}`, { method: "DELETE" });
      if (res.ok) {
        setDeleted(true);
        toast.success("项目动态已删除");
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
    const projectPath = `/projects/${post.shortId || post.id}`;
    const shareTitle = `项目: ${title}`;
    const firstImg = post.cover || post.linkCard?.image || (post.images && post.images.length > 0 ? (typeof post.images[0] === "string" ? post.images[0] : post.images[0]?.src) : undefined);
    await sharePost({
      title: shareTitle,
      url: projectPath,
      typeLabel: "项目",
      summary: description,
      cover: firstImg,
      author: post.author?.nickname || "Dual",
    });
  };

  const imageCandidates = useMemo(() => {
    const firstContentImg = extractFirstMarkdownImage(post.content);
    const values = [
      post.cover,
      post.linkCard?.image,
      firstContentImg,
      ...(Array.isArray(post.images) ? post.images.map(getImageSrc) : []),
    ];
    return Array.from(new Set(values
      .map((value) => toSafeImageUrl(value))
      .filter((value): value is string => Boolean(value))
      .map((value) => toHttps(toAbsoluteUrl(value)))));
  }, [post.cover, post.linkCard?.image, post.content, post.images]);
  const [imageIndex, setImageIndex] = useState(0);
  const [isFallback, setIsFallback] = useState(false);

  useEffect(() => {
    setImageIndex(0);
    setIsFallback(false);
  }, [imageCandidates]);

  const showCoverFallback = imageCandidates.length === 0 || isFallback;

  const handleImageError = () => {
    if (imageIndex < imageCandidates.length - 1) {
      setImageIndex((current) => current + 1);
      return;
    }
    setIsFallback(true);
  };

  if (deleted) return null;

  if (variant === "feed") {
    const authorName = post.author?.nickname || "博主";
    const authorAvatar = resolveAvatarFromHash(post.author?.avatar, post.author?.avatarHash, 96);
    return (
      <article
        id={`post-${post.id}`}
        className="flex gap-3 px-4 py-4 sm:px-5 md:px-6 animate-fade-in-up scroll-mt-16"
        style={typeof index === "number" ? { animationDelay: `${index * 60}ms` } : undefined}
      >
        {/* Avatar */}
        <Link
          href="/"
          className="relative block h-10 w-10 shrink-0 overflow-hidden rounded-[5px] bg-wechat-bubble md:h-11 md:w-11"
          aria-label={`查看${authorName}的主页`}
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
                #{post.category || "项目"}
              </span>
              {pinned && (
                <span className="shrink-0 rounded-[4px] bg-[#ececec] px-2 py-0.5 text-[11px] font-medium leading-tight text-[#9a9a9a] dark:bg-white/[0.1] dark:text-[#9a9a9a]">
                  置顶
                </span>
              )}
            </div>
          </h3>

          {/* Project text / intro */}
          {plainText && (
            <p className="mt-1 text-[15px] leading-[23px] text-wechat-text md:text-[16px] md:leading-[24px] line-clamp-3">
              {plainText}
            </p>
          )}

          {/* 微信朋友圈精致项目卡片 */}
          <div className="group/proj mt-3 overflow-hidden rounded-2xl border border-neutral-200/80 bg-white/90 dark:border-neutral-700/80 dark:bg-neutral-850/90 shadow-[0_1px_3px_rgba(0,0,0,0.02),0_4px_16px_-4px_rgba(0,0,0,0.04)] dark:shadow-[0_1px_3px_rgba(0,0,0,0.3)] transition-all duration-300 hover:border-neutral-300 dark:hover:border-neutral-600 hover:shadow-[0_4px_20px_-4px_rgba(0,0,0,0.08)] max-w-[480px]">
            <div className="flex items-stretch">
              {/* 左侧方形项目封面/图标 */}
              <Link
                href={detailHref}
                className="relative h-22 w-22 sm:h-24 sm:w-24 shrink-0 overflow-hidden bg-[#e9efe8] dark:bg-[#1d2922] flex items-center justify-center cursor-pointer block group-hover/proj:opacity-90 transition-opacity"
                aria-label={`查看项目 ${title}`}
              >
                {imageCandidates[imageIndex] && !showCoverFallback ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={imageCandidates[imageIndex]}
                    alt={title}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover/proj:scale-105"
                    onError={handleImageError}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center text-[#42634b] dark:text-[#9cc5a6]">
                    <Code2 className="h-8 w-8" strokeWidth={1.5} />
                  </div>
                )}
              </Link>
              {/* 右侧项目信息 */}
              <div className="flex min-w-0 flex-1 flex-col justify-between p-2.5 sm:p-3">
                <div>
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                      {post.category || "PROJECT"}
                    </span>
                    {post.linkCard?.siteName && (
                      <span className="text-[10px] text-neutral-400">
                        {post.linkCard.siteName}
                      </span>
                    )}
                  </div>
                  <h4 className="line-clamp-1 text-sm font-semibold text-neutral-900 dark:text-neutral-100 group-hover/proj:text-emerald-700 dark:group-hover/proj:text-emerald-300">
                    <Link href={detailHref} className="hover:underline">
                      {title}
                    </Link>
                  </h4>
                  <p className="mt-0.5 line-clamp-1 text-xs text-neutral-500 dark:text-neutral-400">
                    {description}
                  </p>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-1">
                    {tags.slice(0, 2).map((tag) => (
                      <span key={tag} className="rounded-md bg-neutral-100/80 dark:bg-neutral-700/60 px-1.5 py-0.5 text-[10px] font-medium text-neutral-600 dark:text-neutral-300 border border-neutral-200/50 dark:border-neutral-700/40">
                        #{tag}
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {projectHref ? (
                      <a
                        href={projectHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200/60 dark:border-emerald-800/60 hover:bg-emerald-100/80 dark:hover:bg-emerald-900/60 active:scale-95 transition-all"
                      >
                        <span>体验</span>
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : null}
                    <Link
                      href={detailHref}
                      className="inline-flex items-center gap-0.5 rounded-lg px-2 py-1 text-xs font-semibold text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white bg-neutral-100/80 dark:bg-neutral-800/80 border border-neutral-200/60 dark:border-neutral-700/60 hover:bg-neutral-200/70 dark:hover:bg-neutral-700/80 active:scale-95 transition-all"
                    >
                      <span>详情</span>
                      <ArrowUpRight className="h-3 w-3" />
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Time & actions — 朋友圈流模式统一交互 */}
          <div className="mt-2.5 flex items-center justify-between text-[13px] text-wechat-time md:text-[14px]">
            <Link
              href={detailHref}
              className="hover:underline hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors"
              title="查看项目详情与评论"
            >
              <time dateTime={post.createdAt} title={post.createdAt}>{formatExactDateTime(post.createdAt)}</time>
            </Link>
            <div className="flex items-center gap-2">
              <Link
                href={detailHref}
                className="text-xs text-neutral-400 hover:text-emerald-600 dark:text-neutral-500 dark:hover:text-emerald-400 transition-colors inline-flex items-center gap-1"
              >
                <span>查看项目</span>
                <ArrowUpRight className="h-3 w-3" />
              </Link>
              <ActionMenu
                onLike={post.likesDisabled ? undefined : handleLike}
                onComment={post.commentsDisabled ? undefined : handleCommentClick}
                onShare={handleShare}
                onEdit={canEdit || isAdmin ? () => router.push(`/admin/projects/${post.id}`) : undefined}
                onDelete={isAdmin ? handleDelete : undefined}
                onPin={isAdmin ? handlePin : undefined}
                liked={liked}
                pinned={pinned}
              />
            </div>
          </div>

          {/* Likes + comments bubble */}
          <InteractionBubble
            likes={likes}
            comments={comments}
            onReply={(commentId) => {
              setReplyTo(commentId);
              setShowComments(true);
            }}
          />

          {/* Comment section */}
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

  const cover = (
    <div className={`relative overflow-hidden bg-[#e9efe8] dark:bg-[#1d2922] ${featured ? "min-h-64 xl:min-h-full" : "aspect-[16/10]"}`}>
      {showCoverFallback ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-[#42634b] dark:text-[#9cc5a6]">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-current/20 bg-white/60 shadow-sm dark:bg-black/10">
            <Code2 className="h-8 w-8" strokeWidth={1.5} />
          </div>
          <span className="font-mono text-[10px] uppercase tracking-[0.24em] opacity-70">project preview</span>
        </div>
      ) : (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={imageCandidates[imageIndex]}
          alt={`${title} 项目预览`}
          className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
          onError={handleImageError}
        />
      )}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.18),transparent_48%)] dark:bg-[linear-gradient(135deg,rgba(255,255,255,0.08),transparent_48%)]" />
      <div className="absolute left-4 top-4 flex items-center gap-1.5 rounded-full bg-neutral-900/75 dark:bg-neutral-850/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-white backdrop-blur-md border border-white/10 shadow-sm">
        <FolderGit2 className="h-3.5 w-3.5 text-emerald-400" />
        <span>Project</span>
      </div>
    </div>
  );

  return (
    <article
      className={`group relative overflow-hidden rounded-2xl border border-neutral-200/80 bg-white/90 dark:border-neutral-800 dark:bg-neutral-900/80 backdrop-blur-sm shadow-[0_1px_3px_rgba(0,0,0,0.02),0_8px_24px_-4px_rgba(0,0,0,0.04)] dark:shadow-[0_1px_3px_rgba(0,0,0,0.3),0_8px_24px_-4px_rgba(0,0,0,0.25)] transition-all duration-300 hover:-translate-y-1 hover:border-neutral-300 dark:hover:border-neutral-700 hover:shadow-[0_12px_32px_-8px_rgba(0,0,0,0.08)] dark:hover:shadow-[0_12px_32px_-8px_rgba(0,0,0,0.4)] ${featured ? "xl:grid xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]" : ""}`}
      style={typeof index === "number" ? { animationDelay: `${index * 60}ms` } : undefined}
    >
      {/* 顶部微高光线 */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-neutral-300/40 dark:via-neutral-700/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10" />

      <Link href={detailHref} className="block" aria-label={`查看项目 ${title}`}>
        {cover}
      </Link>

      <div className={`flex min-w-0 flex-col p-5 sm:p-6 ${featured ? "xl:justify-center xl:p-9" : ""}`}>
        <div className="mb-4 flex items-center justify-between gap-3 text-xs text-neutral-400 dark:text-neutral-500">
          <span className="font-mono uppercase tracking-[0.16em]">{post.category || "作品"}</span>
          <span title={post.createdAt}>{formatExactDateTime(post.createdAt)}</span>
        </div>

        <h2 className={`font-semibold tracking-tight text-neutral-900 dark:text-white ${featured ? "text-2xl sm:text-3xl" : "text-xl"}`}>
          <Link href={detailHref} className="transition-colors hover:text-emerald-700 dark:hover:text-emerald-300">
            {title}
          </Link>
        </h2>
        <p className={`mt-3 text-sm leading-7 text-neutral-600 dark:text-neutral-300 ${featured ? "line-clamp-4" : "line-clamp-3"}`}>
          {description || "一个值得被认真展示的个人项目。"}
        </p>

        <div className="mt-5 flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span
              key={tag}
              className="rounded-lg border border-neutral-200/70 bg-neutral-50/80 dark:border-neutral-750 dark:bg-neutral-800/60 px-2.5 py-0.5 text-[11px] font-medium text-neutral-600 dark:text-neutral-300"
            >
              #{tag}
            </span>
          ))}
        </div>

        <div className="mt-7 flex flex-wrap items-center gap-3 border-t border-neutral-200/70 pt-5 dark:border-neutral-800">
          {isExternal ? (
            <>
              <a
                href={projectHref || detailHref}
                target="_blank"
                rel="noopener noreferrer"
                className="group/btn inline-flex min-h-9 items-center gap-2 rounded-xl bg-neutral-900 px-4 text-xs font-semibold text-white shadow-2xs transition-all duration-200 hover:bg-emerald-600 dark:bg-white dark:text-neutral-950 dark:hover:bg-emerald-300 hover:shadow-xs active:scale-[0.97]"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                <span>查看项目</span>
              </a>
              <Link
                href={detailHref}
                className="group/detail inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-neutral-200/80 bg-white/80 px-3.5 text-xs font-semibold text-neutral-700 shadow-2xs transition-all duration-200 hover:border-neutral-300 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800/80 dark:text-neutral-200 dark:hover:border-neutral-600 dark:hover:bg-neutral-800 hover:shadow-xs active:scale-[0.97]"
              >
                <span>详情</span>
                <ArrowUpRight className="h-3.5 w-3.5 group-hover/detail:translate-x-0.5 group-hover/detail:-translate-y-0.5 transition-transform" />
              </Link>
            </>
          ) : (
            <Link
              href={detailHref}
              className="group/btn inline-flex min-h-9 items-center gap-2 rounded-xl bg-neutral-900 px-4 text-xs font-semibold text-white shadow-2xs transition-all duration-200 hover:bg-emerald-600 dark:bg-white dark:text-neutral-950 dark:hover:bg-emerald-300 hover:shadow-xs active:scale-[0.97]"
            >
              <span>查看详情</span>
              <ArrowUpRight className="h-4 w-4 group-hover/btn:translate-x-0.5 group-hover/btn:-translate-y-0.5 transition-transform" />
            </Link>
          )}
          {post.linkCard?.url && (
            <span className="inline-flex items-center gap-1.5 text-xs text-neutral-400 dark:text-neutral-500">
              <Link2 className="h-3.5 w-3.5" />
              {post.linkCard.siteName || "外部链接"}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
