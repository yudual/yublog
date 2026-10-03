"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Music, Pause, Play, BookMarked, Layers, ArrowRight } from "lucide-react";
import type { Post, PostMusic } from "@/lib/types";
import { formatDetailTime, getPostSourceLabel } from "@/lib/time-format";
import { resolveAvatarFromHash } from "@/lib/avatar";
import { normalizeImages, resolveCoverImage } from "@/lib/post-image";
import { toHttps } from "@/lib/upload";
import { renderContent } from "@/lib/sanitize";
import { getCurrentUser } from "@/lib/auth";
import { useMusicPlayer, getStaticMusicUrl } from "@/lib/music-player-store";
import { getGlobalAudio } from "@/lib/global-audio";
import { useEditPost } from "@/lib/edit-post-store";
import { toast } from "@/lib/toast";
import { sharePost } from "@/lib/share";
import { toSafeHttpUrl, toSafeImageUrl } from "@/lib/web-url";
import ImageGrid from "@/components/ImageGrid";
import VideoPlayer from "@/components/VideoPlayer";
import InteractionBubble from "@/components/InteractionBubble";
import ActionMenu from "@/components/ActionMenu";
import CommentSection from "@/components/CommentSection";
import LazyImage from "@/components/LazyImage";

import { PUBLIC_API_URL } from "@/lib/api-fetch";

const API_URL = PUBLIC_API_URL;

interface PostDetailProps {
  post: Post;
}

function formatMusicInfo(music: PostMusic): { title: string; subtitle?: string } {
  function clean(s: string): string {
    return s
      .replace(/ - .*?音乐解析$/gi, "")
      .replace(/音乐解析$/gi, "")
      .replace(/@\S+/g, "")
      .replace(/汽水音乐/g, "")
      .replace(/网易云音乐/g, "")
      .replace(/QQ音乐/g, "")
      .replace(/酷狗音乐/g, "")
      .replace(/酷我音乐/g, "")
      .trim();
  }
  let name = clean(music.name || "");
  let artist = clean(music.artist || "");
  if (!artist && name.includes(" - ")) {
    const parts = name.split(" - ");
    name = clean(parts[0]);
    artist = clean(parts.slice(1).join(" - "));
  }
  if (!name && music.name) name = clean(music.name);
  return { title: name || "未知歌曲", subtitle: artist || undefined };
}

export default function PostDetail({ post }: PostDetailProps) {
  const router = useRouter();
  const [likes, setLikes] = useState<Array<{ name: string; email?: string }>>(post.likes || []);
  const [liked, setLiked] = useState(false);
  const [liking, setLiking] = useState(false);
  const [comments, setComments] = useState(post.comments || []);
  const [replyTo, setReplyTo] = useState<string | undefined>(undefined);
  const [canEdit, setCanEdit] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [pinned, setPinned] = useState(!!post.pinned);
  const [showComments, setShowComments] = useState(false);
  const commentSectionRef = useRef<HTMLDivElement>(null);
  const openEdit = useEditPost((s) => s.open);

  const activePostId = useMusicPlayer((s) => s.activePostId);
  const isPlaying = useMusicPlayer((s) => s.isPlaying);
  const isLoading = useMusicPlayer((s) => s.isLoading);
  const setActiveMusic = useMusicPlayer((s) => s.setActive);
  const isThisActive = activePostId === post.id;
  const isThisPlaying = isThisActive && isPlaying;
  const isThisLoading = isThisActive && isLoading;
  const normalizedImages = useMemo(() => normalizeImages(post.images), [post.images]);
  const coverUrl = resolveCoverImage(post.cover, "");

  useEffect(() => {
    const user = getCurrentUser();
    if (user?.isLoggedIn) {
      setIsAdmin(true);
      const sameEmail = post.author?.email && user.email && post.author.email === user.email;
      const sameNickname = post.author?.nickname && post.author.nickname === user.nickname;
      setCanEdit(!!(sameEmail || sameNickname));
    }
  }, [post.author?.email, post.author?.nickname]);

  // 仅在挂载时（或 post.id 变化时）根据后端返回的 meLiked 推导 liked 初始值。
  useEffect(() => {
    setLiked(!!post.meLiked);
  }, [post.id, post.meLiked]);

  useEffect(() => {
    setComments(post.comments || []);
  }, [post.comments]);

  useEffect(() => {
    setLikes(post.likes || []);
  }, [post.likes]);

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
    setShowComments((prev) => {
      if (!prev) {
        requestAnimationFrame(() => {
          commentSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
        });
      }
      return !prev;
    });
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
        toast.success(next ? "已置顶" : "已取消置顶");
        router.refresh();
      }
    } catch {
      // ignore
    }
  };

  const handleShare = async () => {
    const isCollection = post.type === "collection";
    const path = isCollection
      ? `/articles/${post.shortId || post.id}`
      : `/moments/${post.shortId || post.id}`;
    const plainText = (post.title || post.excerpt || post.content || "")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();
    const title = post.title
      ? (isCollection ? `《${post.title}》系列合辑` : post.title)
      : (plainText
        ? (plainText.length > 30 ? plainText.slice(0, 30) + "…" : plainText)
        : `${post.author?.nickname || "用户"} 的动态`);

    await sharePost({
      title,
      url: path,
      typeLabel: isCollection ? "系列合辑" : "动态",
      summary: post.excerpt || plainText,
    });
  };

  const handleMusicClick = async () => {
    if (!post.music) return;
    const audio = getGlobalAudio();
    if (!audio) return;
    if (isThisActive) {
      if (audio.paused) {
        await audio.play();
      } else {
        audio.pause();
      }
      return;
    }

    try {
      const staticUrl = getStaticMusicUrl(post.music);
      const playUrl = staticUrl;

      if (!playUrl) throw new Error("该动态没有可播放的音频文件。");
      setActiveMusic(post.id, {
        postId: post.id,
        url: playUrl,
        name: post.music.name,
        artist: post.music.artist,
        cover: post.music.cover,
        lrc: post.music.lrc,
      });
      audio.src = playUrl;
      await audio.play();
    } catch (error) {
      const message = error instanceof Error ? error.message : "无法获取可直连的播放地址。";
      useMusicPlayer.getState().setAudioError(true, message);
    }
  };

  const displayName = post.author?.nickname || "用户";
  const authorAvatar = resolveAvatarFromHash(post.author?.avatar, post.author?.avatarHash, 96);
  const musicInfo = post.music ? formatMusicInfo(post.music) : null;
  const safeLinkUrl = toSafeHttpUrl(post.linkCard?.url);
  const safeLinkImage = toSafeImageUrl(post.linkCard?.image);
  const articles = post.collectionArticles || [];
  const totalArticles = articles.length;

  return (
    <article id={`post-${post.id}`} className="flex gap-3 px-4 py-4 sm:px-5 md:px-6 scroll-mt-16">
      {/* Avatar */}
      <Link
        href="/archives"
        className="relative block h-10 w-10 shrink-0 overflow-hidden rounded-[5px] bg-wechat-bubble md:h-11 md:w-11"
      >
        <Image
          src={authorAvatar}
          alt={displayName}
          fill
          className="object-cover"
          sizes="44px"
          unoptimized={authorAvatar.endsWith(".svg")}
        />
      </Link>

      {/* Content column */}
      <div className="min-w-0 flex-1">
        <h2 className="text-[15px] font-medium leading-5 text-wechat-nickname md:text-[16px]">
          {displayName}
        </h2>

        {/* 系列合辑展示 (若 post.type === "collection") */}
        {post.type === "collection" && (
          <div className="mt-3 w-full overflow-hidden rounded-2xl border border-blue-100/90 dark:border-blue-900/40 bg-gradient-to-br from-[#f8faff] via-[#f5f8ff] to-[#edf3ff] dark:from-[#1b1e26] dark:via-[#191d27] dark:to-[#161a24] p-4 sm:p-5 shadow-xs">
            <div className="flex items-start gap-3.5 pb-3.5 border-b border-blue-100/70 dark:border-blue-900/30">
              {coverUrl ? (
                <div className="relative h-20 w-20 sm:h-24 sm:w-24 shrink-0 overflow-hidden rounded-xl border border-black/5 dark:border-white/10 shadow-xs">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={coverUrl} alt={post.title || ""} className="h-full w-full object-cover" />
                </div>
              ) : (
                <div className="flex h-20 w-20 sm:h-24 sm:w-24 shrink-0 items-center justify-center rounded-xl bg-blue-100/70 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300">
                  <BookMarked className="h-10 w-10" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 font-medium">
                  <Layers className="h-3.5 w-3.5" />
                  <span>系列合辑专栏</span>
                  <span>·</span>
                  <span>共 {totalArticles} 篇连续更新</span>
                </div>
                <h3 className="mt-1 text-lg sm:text-xl font-bold text-neutral-900 dark:text-neutral-100 leading-snug">
                  {post.title || "系列文章合辑"}
                </h3>
                {post.excerpt && (
                  <p className="mt-1.5 text-xs sm:text-sm text-neutral-600 dark:text-neutral-300 leading-relaxed">
                    {post.excerpt}
                  </p>
                )}
              </div>
            </div>

            {/* 子章节列表 */}
            {articles.length > 0 && (
              <div className="mt-4 space-y-2">
                <div className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 mb-1">
                  章节目录：
                </div>
                {articles.map((article, idx) => {
                  const articleUrl = `/articles/${article.shortId || article.id}`;
                  const order = String(idx + 1).padStart(2, "0");
                  return (
                    <Link
                      key={article.id}
                      href={articleUrl}
                      className="group/item flex items-center justify-between gap-2.5 rounded-xl px-3.5 py-2.5 bg-white/80 hover:bg-white dark:bg-neutral-800/50 dark:hover:bg-neutral-800/90 border border-blue-50/80 dark:border-neutral-700/40 transition-all duration-200 hover:border-blue-200 dark:hover:border-blue-800/60 hover:shadow-xs"
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
                          <span className="rounded bg-neutral-100 dark:bg-neutral-700/50 px-1.5 py-0.5 text-[10px] text-neutral-600 dark:text-neutral-400">
                            {article.category}
                          </span>
                        )}
                        <span className="group-hover/item:translate-x-0.5 transition-transform text-blue-600 dark:text-blue-400 flex items-center gap-0.5 text-xs font-medium">
                          阅读 <ArrowRight className="h-3 w-3" />
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Content text */}
        {post.content && (
          <div
            className="rich-content mt-1 text-[15px] leading-[24px] text-wechat-text md:text-[16px] md:leading-[24px]"
            dangerouslySetInnerHTML={{ __html: renderContent(post.content) }}
          />
        )}

        {/* Images */}
        {!post.video && post.images && post.images.length > 0 && (
          <div className="mt-2">
            <ImageGrid images={normalizedImages} />
          </div>
        )}

        {/* Video */}
        {post.video && (
          <div className="mt-2">
            <VideoPlayer video={post.video} postId={post.id} />
          </div>
        )}

        {/* Music card */}
        {post.music && (
          <div
            onClick={handleMusicClick}
            className="mt-2 flex w-full max-w-[240px] md:max-w-[280px] cursor-pointer items-stretch overflow-hidden rounded-[8px] bg-[#f2f2f2] transition-opacity active:opacity-80 dark:bg-[#2a2a30]"
          >
            <div className="relative h-[72px] w-[72px] shrink-0 md:h-[80px] md:w-[80px] overflow-hidden bg-black/5 dark:bg-white/5">
              {post.music.cover ? (
                <LazyImage
                  src={toHttps(
                    typeof post.music.cover === "string" && post.music.cover.startsWith("http")
                      ? post.music.cover
                      : `${API_URL.replace("/api", "")}${post.music.cover}`
                  )}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <Music className="h-6 w-6 text-black/30 dark:text-white/30" />
                </div>
              )}
            </div>
            <div className="flex min-w-0 flex-1 items-center gap-2 bg-white/35 px-3 dark:bg-white/[0.04]">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-medium leading-[20px] text-black/[0.87] dark:text-white/90 md:text-[15px] md:leading-[21px]">
                  {musicInfo?.title}
                </p>
                <p className="truncate text-[12px] leading-[16px] text-black/50 dark:text-white/50 md:text-[13px] md:leading-[17px]">
                  {musicInfo?.subtitle}
                </p>
              </div>
              {isThisLoading ? (
                <span className="h-3 w-3 shrink-0 rounded-full bg-black/55 animate-pulse dark:bg-white/55" />
              ) : isThisPlaying ? (
                <Pause className="h-3.5 w-3.5 shrink-0 text-black/55 dark:text-white/55" fill="currentColor" />
              ) : (
                <Play className="h-3.5 w-3.5 shrink-0 translate-x-[1px] text-black/55 dark:text-white/55" fill="currentColor" />
              )}
            </div>
          </div>
        )}

        {/* Link card */}
        {post.linkCard && safeLinkUrl && (
          <a
            href={safeLinkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 flex w-full max-w-[240px] md:max-w-[280px] items-stretch overflow-hidden rounded-[8px] bg-[#f2f2f2] transition-colors hover:bg-[#eaeaea] active:bg-[#e0e0e0] dark:bg-[#2a2a30] dark:hover:bg-[#33333a] dark:active:bg-[#3a3a42]"
          >
            <div className="flex h-[72px] w-[72px] shrink-0 md:h-[80px] md:w-[80px] items-center justify-center overflow-hidden bg-black/[0.02] dark:bg-white/[0.02]">
              {safeLinkImage && (
                <LazyImage
                  src={safeLinkImage}
                  alt=""
                  className="h-full w-full object-contain p-1.5"
                />
              )}
            </div>
            <div className="flex min-w-0 flex-1 flex-col justify-center bg-white/35 px-3 dark:bg-white/[0.04]">
              <p className="line-clamp-1 text-[14px] font-medium leading-[20px] text-black/[0.87] dark:text-white/90 md:text-[15px] md:leading-[21px]">
                {post.linkCard.title || safeLinkUrl}
              </p>
              {post.linkCard.description && (
                <p className="line-clamp-2 mt-0.5 text-[12px] leading-[15px] text-black/50 dark:text-white/50 md:text-[13px] md:leading-[16px]">
                  {post.linkCard.description}
                </p>
              )}
            </div>
          </a>
        )}

        {/* Location */}
        {post.location && typeof post.location === "object" && (
          <div className="mt-2">
            <span className="text-[13px] text-wechat-link md:text-[14px]">
              {post.location.city
                ? `${post.location.city} · ${post.location.name}`
                : post.location.name}
            </span>
          </div>
        )}

        {/* Time + action */}
        <div className="mt-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[13px] text-wechat-time md:text-[14px]">
            <time title={post.createdAt}>{formatDetailTime(post.createdAt)}</time>
            {(() => {
              const src = getPostSourceLabel(post);
              if (!src) return null;
              return (
                <>
                  <span className="text-[16px] leading-none text-wechat-time/60">·</span>
                  <span>来自 {src}</span>
                </>
              );
            })()}
          </div>
          <ActionMenu
            onLike={post.likesDisabled ? undefined : handleLike}
            onComment={post.commentsDisabled ? undefined : handleCommentClick}
            onShare={handleShare}
            onEdit={
              canEdit
                ? () => openEdit(post)
                : isAdmin && post.type === "collection"
                ? () => router.push("/admin/articles")
                : undefined
            }
            onPin={isAdmin ? handlePin : undefined}
            liked={liked}
            pinned={pinned}
          />
        </div>

        {/* Likes (text) + Comments — 微信朋友圈详情风格 */}
        {(likes.length > 0 || comments.length > 0) && (
          <div className="mt-2">
            <InteractionBubble
              likes={likes}
              comments={comments}
              showAvatars
              onReply={(commentId) => {
                setReplyTo(commentId);
                setShowComments(true);
                requestAnimationFrame(() => {
                  commentSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
                });
              }}
            />
          </div>
        )}

        {/* Comment section — 仅通过 ActionMenu 的"评论"触发显示 */}
        <div ref={commentSectionRef}>
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
      </div>
    </article>
  );
}
