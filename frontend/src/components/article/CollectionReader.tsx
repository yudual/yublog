"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  BookMarked,
  BookOpen,
  Layers,
  ArrowRight,
  Share2,
  Heart,
  Calendar,
  Eye,
  Clock,
  Sparkles,
} from "lucide-react";
import type { Post } from "@/lib/types";
import { formatArticleTime } from "@/lib/time-format";
import { resolveAvatarFromHash } from "@/lib/avatar";
import { resolveCoverImage } from "@/lib/post-image";
import { getCurrentUser } from "@/lib/auth";
import { sharePost } from "@/lib/share";
import ArticleCommentSection from "@/components/article/ArticleCommentSection";
import { PUBLIC_API_URL } from "@/lib/api-fetch";

const API_URL = PUBLIC_API_URL;

interface CollectionReaderProps {
  post: Post;
}

export default function CollectionReader({ post }: CollectionReaderProps) {
  const [likes, setLikes] = useState<Array<{ name: string; email?: string }>>(post.likes || []);
  const [liked, setLiked] = useState(() => !!post.meLiked);
  const [liking, setLiking] = useState(false);
  const [comments, setComments] = useState(post.comments || []);
  const [copied, setCopied] = useState(false);

  const coverUrl = resolveCoverImage(post.cover, "");
  const articles = post.collectionArticles || [];
  const totalArticles = articles.length;
  const firstArticleUrl = articles.length > 0
    ? `/articles/${articles[0].shortId || articles[0].id}`
    : "#";

  const authorName = post.author?.nickname || "博主";
  const authorAvatar = resolveAvatarFromHash(post.author?.avatar, post.author?.avatarHash, 96);
  const formattedDate = formatArticleTime(post.createdAt);

  const [prevPostId, setPrevPostId] = useState(post.id);
  if (prevPostId !== post.id) {
    setPrevPostId(post.id);
    setLiked(!!post.meLiked);
    setLikes(post.likes || []);
    setComments(post.comments || []);
  }

  // 点赞/取消点赞
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
        headers["Authorization"] = `Bearer ${user.token}`;
      }
      const res = await fetch(`${API_URL}/posts/${post.id}/likes`, {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify({ name, email }),
      });
      if (!res.ok) {
        setLiked(prevLiked);
        return;
      }
      const data = await res.json();
      setLiked(data.liked);
      if (Array.isArray(data.likes)) setLikes(data.likes);
    } catch {
      setLiked(prevLiked);
    } finally {
      setLiking(false);
    }
  };

  // 分享合辑
  const handleShare = async () => {
    const collectionPath = `/articles/${post.shortId || post.id}`;
    const title = post.title ? `《${post.title}》系列合辑` : `${authorName} 的系列合辑`;
    await sharePost({
      title,
      url: collectionPath,
      typeLabel: "系列合辑",
      summary: post.excerpt,
      cover: coverUrl,
      author: authorName,
      date: formattedDate,
      totalArticles,
    });
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <article className="w-full article-content">
      {/* 顶部专栏横幅与封面大图 */}
      <div className="group/bannerbox relative overflow-hidden rounded-2xl sm:rounded-3xl border border-neutral-200/70 dark:border-neutral-800/80 bg-white/90 dark:bg-neutral-900/80 backdrop-blur-md p-6 sm:p-8 lg:p-10 shadow-[0_1px_3px_rgba(0,0,0,0.02),0_8px_24px_-6px_rgba(0,0,0,0.04)] dark:shadow-[0_1px_3px_rgba(0,0,0,0.3),0_10px_28px_-6px_rgba(0,0,0,0.5)] mb-8 transition-all duration-300">
        {/* 顶部微高光线 */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-neutral-300/40 dark:via-neutral-700/50 to-transparent" />

        <div className="flex flex-col md:flex-row gap-6 md:gap-8 items-start">
          {/* 封面缩略图 */}
          {coverUrl ? (
            <div className="relative w-full md:w-60 lg:w-72 aspect-video md:aspect-[4/3] shrink-0 overflow-hidden rounded-xl sm:rounded-2xl border border-black/5 dark:border-white/10 shadow-2xs bg-neutral-100 dark:bg-neutral-800">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={coverUrl}
                alt={post.title || "合辑封面"}
                className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover/bannerbox:scale-105"
              />
            </div>
          ) : (
            <div className="flex w-full md:w-60 lg:w-72 aspect-video md:aspect-[4/3] shrink-0 items-center justify-center rounded-xl sm:rounded-2xl bg-blue-50/80 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400 border border-blue-200/40 dark:border-blue-900/40 shadow-2xs">
              <BookOpen className="h-14 w-14" />
            </div>
          )}

          {/* 右侧核心信息 */}
          <div className="min-w-0 flex-1 flex flex-col justify-between">
            <div>
              <div className="inline-flex items-center gap-1.5 rounded-md bg-blue-50/80 dark:bg-blue-950/50 border border-blue-200/60 dark:border-blue-900/50 px-2.5 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-300 mb-3">
                <BookOpen className="h-3.5 w-3.5 text-blue-500 dark:text-blue-400" />
                <span>系列合辑专栏</span>
                <span className="text-neutral-300 dark:text-neutral-700">·</span>
                <span>全篇共 {totalArticles} 章</span>
              </div>

              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-neutral-900 dark:text-neutral-50 leading-tight">
                {post.title || "系列文章合辑"}
              </h1>

              {post.excerpt && (
                <p className="mt-3 text-sm sm:text-base leading-relaxed text-neutral-600 dark:text-neutral-300 font-normal">
                  {post.excerpt}
                </p>
              )}
            </div>

            {/* 作者信息与元数据 */}
            <div className="mt-6 pt-5 border-t border-neutral-100 dark:border-neutral-800/80 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Link href="/" className="relative block h-9 w-9 overflow-hidden rounded-full border border-black/5 dark:border-white/10 shadow-2xs">
                  <Image
                    src={authorAvatar}
                    alt={authorName}
                    fill
                    className="object-cover"
                    sizes="36px"
                    unoptimized={authorAvatar.endsWith(".svg")}
                  />
                </Link>
                <div className="text-xs sm:text-sm">
                  <span className="font-semibold text-neutral-800 dark:text-neutral-200">{authorName}</span>
                  <div className="flex items-center gap-2 text-neutral-400 dark:text-neutral-500 text-[11px] sm:text-xs mt-0.5">
                    <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {formattedDate}</span>
                    <span>·</span>
                    <span className="flex items-center gap-1"><Eye className="h-3 w-3" /> {post.viewCount || 0} 阅读</span>
                  </div>
                </div>
              </div>

              {/* 快捷操作栏：触感微交互按钮 */}
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={handleLike}
                  className={`group/like inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold border shadow-2xs hover:shadow-xs active:scale-[0.97] transition-all cursor-pointer ${
                    liked
                      ? "border-red-200 bg-red-50 text-red-600 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-400"
                      : "border-neutral-200/80 bg-white/90 text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700/80 dark:bg-neutral-800/80 dark:text-neutral-200 dark:hover:bg-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-600"
                  }`}
                  title="为合辑点赞"
                >
                  <Heart className={`h-3.5 w-3.5 group-hover/like:scale-110 transition-transform ${liked ? "fill-red-500 text-red-500" : ""}`} />
                  <span>{likes.length > 0 ? likes.length : "赞"}</span>
                </button>

                <button
                  type="button"
                  onClick={handleShare}
                  className="group/share inline-flex items-center gap-1.5 rounded-xl border border-neutral-200/80 bg-white/90 px-3.5 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 hover:border-neutral-300 dark:border-neutral-700/80 dark:bg-neutral-800/80 dark:text-neutral-200 dark:hover:bg-neutral-800 dark:hover:border-neutral-600 shadow-2xs hover:shadow-xs active:scale-[0.97] transition-all cursor-pointer"
                  title="分享合辑"
                >
                  <Share2 className="h-3.5 w-3.5 text-neutral-400 group-hover/share:rotate-12 transition-transform" />
                  <span>{copied ? "已复制" : "分享"}</span>
                </button>

                {articles.length > 0 && (
                  <Link
                    href={firstArticleUrl}
                    className="group/read inline-flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-xs font-semibold shadow-xs hover:shadow-sm active:scale-[0.97] transition-all"
                  >
                    <span>从第一篇阅读</span>
                    <ArrowRight className="h-3.5 w-3.5 text-blue-200 group-hover/read:text-white group-hover/read:translate-x-0.5 transition-transform" />
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 章节目录索引大纲 */}
      <div className="mb-10">
        <div className="flex items-center justify-between pb-3.5 mb-5 border-b border-neutral-200/70 dark:border-neutral-800/80">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-blue-50/80 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400 border border-blue-200/50 dark:border-blue-900/40">
              <BookOpen className="h-3.5 w-3.5" />
            </div>
            <h2 className="text-lg sm:text-xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
              章节目录导航
            </h2>
          </div>
          <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
            按序连载 · 共 {articles.length} 篇
          </span>
        </div>

        {articles.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-neutral-200 dark:border-neutral-800 p-8 text-center text-sm text-neutral-400">
            暂无已发布的子文章
          </div>
        ) : (
          <div className="space-y-2.5">
            {articles.map((article, index) => {
              const articleUrl = `/articles/${article.shortId || article.id}`;
              const order = String(index + 1).padStart(2, "0");
              return (
                <Link
                  key={article.id}
                  href={articleUrl}
                  className="group/ch relative flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-neutral-200/70 dark:border-neutral-800/80 bg-white/80 dark:bg-neutral-900/60 p-4 sm:p-5 transition-all duration-300 hover:border-neutral-300 dark:hover:border-neutral-700 hover:bg-white dark:hover:bg-neutral-850 hover:shadow-[0_2px_12px_-2px_rgba(0,0,0,0.04)] dark:hover:shadow-[0_2px_12px_-2px_rgba(0,0,0,0.4)] hover:-translate-y-0.5"
                >
                  <div className="flex items-start gap-3.5 min-w-0 flex-1">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-neutral-100/80 dark:bg-neutral-800/80 font-mono text-xs font-bold text-neutral-600 dark:text-neutral-300 group-hover/ch:bg-blue-600 group-hover/ch:text-white transition-colors">
                      {order}
                    </span>

                    <div className="min-w-0 flex-1">
                      <h3 className="text-base sm:text-lg font-bold text-neutral-900 dark:text-neutral-100 group-hover/ch:text-blue-600 dark:group-hover/ch:text-blue-400 transition-colors leading-snug">
                        {article.title || "无标题文章"}
                      </h3>

                      {article.excerpt && (
                        <p className="mt-1 text-xs sm:text-sm text-neutral-500 dark:text-neutral-400 line-clamp-2 leading-relaxed">
                          {article.excerpt}
                        </p>
                      )}

                      <div className="mt-2.5 flex flex-wrap items-center gap-3 text-xs text-neutral-400 dark:text-neutral-500">
                        {article.category && (
                          <span className="rounded-md bg-neutral-100/90 dark:bg-neutral-800/90 px-2 py-0.5 text-[11px] font-medium text-neutral-600 dark:text-neutral-300 border border-neutral-200/50 dark:border-neutral-700/50">
                            #{article.category}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Eye className="h-3 w-3" />
                          <span>{article.viewCount || 0} 阅读</span>
                        </span>
                        {article.createdAt && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            <span>{formatArticleTime(article.createdAt)}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 悬停操作指示 */}
                  <div className="shrink-0 flex items-center justify-end sm:justify-center">
                    <span className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-200/70 dark:border-neutral-700/70 bg-neutral-50/80 dark:bg-neutral-800/60 px-3.5 py-1.5 text-xs font-semibold text-neutral-700 dark:text-neutral-200 group-hover/ch:bg-blue-600 group-hover/ch:border-blue-600 group-hover/ch:text-white transition-all shadow-2xs">
                      <span>阅读本章</span>
                      <ArrowRight className="h-3.5 w-3.5 group-hover/ch:translate-x-0.5 transition-transform" />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* 合辑评论与留言区 */}
      <div className="mt-12 pt-8 border-t border-neutral-200/60 dark:border-neutral-800">
        <ArticleCommentSection
          post={post}
          comments={comments}
          onCommentsChange={setComments}
        />
      </div>
    </article>
  );
}
