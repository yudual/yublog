"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookMarked, ChevronDown, ChevronUp, ArrowRight, Layers, Pin } from "lucide-react";
import type { Comment, Post } from "@/lib/types";
import { formatExactDateTime } from "@/lib/time-format";
import { resolveAvatarFromHash } from "@/lib/avatar";
import { resolveCoverImage } from "@/lib/post-image";
import { getCurrentUser } from "@/lib/auth";
import { apiFetch, PUBLIC_API_URL } from "@/lib/api-fetch";
import { toast } from "@/lib/toast";
import { notifyContentUpdated } from "@/lib/content-sync";
import { sharePost } from "@/lib/share";
import ActionMenu from "./ActionMenu";
import InteractionBubble from "./InteractionBubble";
import CommentSection from "./CommentSection";

const API_URL = PUBLIC_API_URL;

interface ArticleCollectionFeedCardProps {
  post: Post;
  index?: number;
}

export default function ArticleCollectionFeedCard({ post, index }: ArticleCollectionFeedCardProps) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const authorName = post.author?.nickname || "博主";
  const authorAvatar = resolveAvatarFromHash(post.author?.avatar, post.author?.avatarHash, 96);
  const exactDateTime = formatExactDateTime(post.createdAt);

  const articles = post.collectionArticles || [];
  const totalArticles = articles.length;

  // 点赞与评论状态
  const [likes, setLikes] = useState<Array<{ name: string; email?: string }>>(post.likes || []);
  const [liked, setLiked] = useState(!!post.meLiked);
  const [liking, setLiking] = useState(false);

  const [comments, setComments] = useState<Comment[]>(post.comments || []);
  const [showComments, setShowComments] = useState(false);
  const [replyTo, setReplyTo] = useState<string | undefined>(undefined);

  const [pinned, setPinned] = useState(!!post.pinned);
  const [isAdmin, setIsAdmin] = useState(false);
  const [deleted, setDeleted] = useState(false);

  // 封面图处理（无封面即为空）
  const coverUrl = resolveCoverImage(post.cover, "");

  // 默认最多展示 3 篇，超出部分折叠
  const initialShowCount = 3;
  const showArticles = expanded || totalArticles <= initialShowCount
    ? articles
    : articles.slice(0, initialShowCount);

  // 第一篇文章链接
  const firstArticleUrl = articles.length > 0
    ? `/articles/${articles[0].shortId || articles[0].id}`
    : "#";

  // 管理权限识别
  useEffect(() => {
    const user = getCurrentUser();
    if (user?.isLoggedIn) {
      setIsAdmin(true);
    }
  }, []);

  // 同步外部 props
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

  // 点赞/取消赞处理
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

  // 评论开关
  const handleCommentClick = () => {
    setShowComments((prev) => !prev);
  };

  // 置顶切换
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
        toast.success(next ? "合辑已置顶" : "已取消置顶");
        notifyContentUpdated();
        router.refresh();
      }
    } catch {
      // ignore
    }
  };

  // 删除合辑（不删除包含的文章）
  const handleDelete = async () => {
    if (!window.confirm("确定要删除该系列合辑吗？删除合辑不会删除包含的子文章。")) return;
    try {
      const res = await apiFetch(`/posts/${post.id}`, { method: "DELETE" });
      if (res.ok) {
        setDeleted(true);
        toast.success("系列合辑已删除");
        notifyContentUpdated();
        router.refresh();
      } else {
        toast.error("删除失败，请重试");
      }
    } catch {
      toast.error("删除失败，请重试");
    }
  };

  // 聚合分享处理
  const handleShare = async () => {
    const collectionPath = `/articles/${post.shortId || post.id}`;
    const title = post.title ? `《${post.title}》系列合辑` : `${authorName} 的系列合辑`;
    await sharePost({
      title,
      url: collectionPath,
      typeLabel: "系列合辑",
      summary: post.excerpt,
    });
  };

  if (deleted) return null;

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
        {/* 顶部发布者与标签 */}
        <h3 className="flex items-center justify-between gap-2 text-[15px] font-medium leading-5 text-wechat-nickname md:text-[16px]">
          <span className="truncate">{authorName}</span>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/50 dark:to-indigo-950/50 border border-blue-200/80 dark:border-blue-800/60 px-2.5 py-0.5 text-[11px] font-medium text-blue-700 dark:text-blue-300 shadow-xs">
              <Layers className="h-3 w-3 text-blue-600 dark:text-blue-400" />
              系列合辑 · {totalArticles} 篇
            </span>
            {pinned && (
              <span className="inline-flex shrink-0 items-center gap-0.5 rounded-[4px] bg-neutral-100 px-2 py-0.5 text-[11px] font-medium leading-tight text-neutral-500 dark:bg-white/[0.1] dark:text-neutral-400">
                <Pin className="h-2.5 w-2.5 rotate-45" />
                置顶
              </span>
            )}
          </div>
        </h3>

        {/* 合辑导语/摘要 */}
        {post.excerpt && (
          <p className="mt-1 text-[15px] leading-[23px] text-wechat-text md:text-[16px] md:leading-[24px]">
            {post.excerpt}
          </p>
        )}

        {/* 系列合辑聚合卡片 */}
        <div className="mt-2.5 w-full overflow-hidden rounded-2xl border border-neutral-200/70 dark:border-neutral-800/80 bg-neutral-50 dark:bg-neutral-900/40 p-3.5 sm:p-4 shadow-xs transition-all duration-200 hover:shadow-md">
          {/* 合辑头部 Banner (点击可直达合辑详情专栏) */}
          <Link
            href={`/articles/${post.shortId || post.id}`}
            className="group/banner flex items-start gap-3 pb-3 border-b border-neutral-200/70 dark:border-neutral-800/80 hover:opacity-95 transition-opacity"
            title="点击查看完整合辑目录与专栏详情"
          >
            {coverUrl ? (
              <div className="relative h-16 w-16 sm:h-18 sm:w-18 shrink-0 overflow-hidden rounded-xl border border-black/5 dark:border-white/10 shadow-xs">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={coverUrl}
                  alt={post.title || ""}
                  className="h-full w-full object-cover group-hover/banner:scale-102 transition-transform duration-300"
                />
              </div>
            ) : (
              <div className="flex h-16 w-16 sm:h-18 sm:w-18 shrink-0 items-center justify-center rounded-xl bg-blue-100/70 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300">
                <BookMarked className="h-8 w-8" />
              </div>
            )}

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 font-medium">
                <span>专题精选专栏</span>
                <span>·</span>
                <span>共 {totalArticles} 篇连续更新</span>
              </div>
              <h4 className="mt-0.5 text-base sm:text-lg font-bold text-neutral-900 dark:text-neutral-100 leading-snug line-clamp-2 group-hover/banner:text-blue-600 dark:group-hover/banner:text-blue-400 transition-colors">
                {post.title || "精选系列文章合辑"}
              </h4>
              <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400 line-clamp-1">
                点击进入合辑详情，或从下方章节按序阅读
              </p>
            </div>
          </Link>

          {/* 子文章章节列表 */}
          <div className="mt-3 space-y-1.5">
            {showArticles.map((article, idx) => {
              const articleUrl = `/articles/${article.shortId || article.id}`;
              const order = String(idx + 1).padStart(2, "0");
              return (
                <Link
                  key={article.id}
                  href={articleUrl}
                  className="group/item flex items-center justify-between gap-2.5 rounded-xl px-3 py-2 bg-white/70 hover:bg-white dark:bg-neutral-800/40 dark:hover:bg-neutral-800/80 border border-blue-50/80 dark:border-neutral-700/30 transition-all duration-200 hover:border-blue-200 dark:hover:border-blue-800/50 hover:shadow-xs"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-blue-100/80 text-[11px] font-bold text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
                      {order}
                    </span>
                    <span className="truncate text-sm font-medium text-neutral-800 group-hover/item:text-blue-600 dark:text-neutral-200 dark:group-hover/item:text-blue-400 transition-colors">
                      {article.title || "无标题文章"}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 text-xs text-neutral-400 dark:text-neutral-500">
                    {article.category && (
                      <span className="hidden sm:inline-block rounded bg-neutral-100 dark:bg-neutral-700/50 px-1.5 py-0.5 text-[10px] text-neutral-600 dark:text-neutral-400">
                        {article.category}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 dark:bg-blue-950/60 border border-blue-200/60 dark:border-blue-800/60 px-2.5 py-0.5 text-[11px] font-medium text-blue-700 dark:text-blue-300 transition-colors group-hover/item:bg-blue-100 dark:group-hover/item:bg-blue-900/80">
                      <span>阅读</span>
                      <ArrowRight className="h-3 w-3 group-hover/item:translate-x-0.5 transition-transform" />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>

          {/* 展开/收起按钮（当文章多于 3 篇时） */}
          {totalArticles > initialShowCount && (
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="mt-2.5 flex w-full items-center justify-center gap-1 rounded-xl py-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 hover:bg-blue-50/50 dark:hover:bg-blue-950/30 transition-colors cursor-pointer"
            >
              {expanded ? (
                <>
                  <span>收起部分章节</span>
                  <ChevronUp className="h-3.5 w-3.5" />
                </>
              ) : (
                <>
                  <span>展开剩余 {totalArticles - initialShowCount} 篇章节</span>
                  <ChevronDown className="h-3.5 w-3.5" />
                </>
              )}
            </button>
          )}

          {/* 快捷跳转首篇阅读 */}
          <div className="mt-3 pt-2.5 border-t border-neutral-200/60 dark:border-neutral-800/70 flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
            <span>支持按序连贯阅读</span>
            <Link
              href={firstArticleUrl}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 dark:text-blue-300 dark:bg-blue-950/60 dark:hover:bg-blue-900/80 border border-blue-200/60 dark:border-blue-800/60 transition-colors"
            >
              <span>从第一篇开始阅读</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>

        {/* 底部发布时间与操作菜单 — 与朋友圈动态保持一致 */}
        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[13px] text-wechat-time md:text-[14px]">
            <Link
              href={`/articles/${post.shortId || post.id}`}
              className="hover:underline hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors"
              title="查看合辑专栏详情与讨论"
            >
              <time dateTime={post.createdAt} title={post.createdAt}>{exactDateTime}</time>
            </Link>
            <span className="text-[15px] leading-none text-wechat-time/60">·</span>
            <span className="text-xs text-blue-600/80 dark:text-blue-400/80">
              系列合辑 ({totalArticles}篇)
            </span>
          </div>

          <ActionMenu
            onLike={post.likesDisabled ? undefined : handleLike}
            onComment={post.commentsDisabled ? undefined : handleCommentClick}
            onShare={handleShare}
            onEdit={isAdmin ? () => router.push("/admin/articles") : undefined}
            onDelete={isAdmin ? handleDelete : undefined}
            onPin={isAdmin ? handlePin : undefined}
            liked={liked}
            pinned={pinned}
          />
        </div>

        {/* Likes + comments bubble — 朋友圈风格点赞与评论气泡 */}
        <InteractionBubble
          likes={likes}
          comments={comments}
          onReply={(commentId) => {
            setReplyTo(commentId);
            setShowComments(true);
          }}
        />

        {/* Comment section — 朋友圈风格即时评论输入框 */}
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
