"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { memo, useEffect, useState, useRef, useMemo, useSyncExternalStore, type CSSProperties } from "react";
import { Music, Pause, Pin } from "lucide-react";
import type { Post } from "@/lib/types";
import { formatExactDateTime, getPostSourceLabel } from "@/lib/time-format";
import { resolveAvatarFromHash } from "@/lib/avatar";
import { normalizeImages } from "@/lib/post-image";
import { toAbsoluteUrl, toHttps } from "@/lib/upload";
import { getCurrentUser } from "@/lib/auth";
import { renderContent } from "@/lib/sanitize";
import { useMusicPlayer, getStaticMusicUrl } from "@/lib/music-player-store";
import { useEditPost } from "@/lib/edit-post-store";
import { useSiteSettings } from "@/lib/site-settings-store";
import { getGlobalAudio } from "@/lib/global-audio";
import ImageGrid from "./ImageGrid";
import VideoPlayer from "./VideoPlayer";
import InteractionBubble from "./InteractionBubble";
import ActionMenu from "./ActionMenu";
import CommentSection from "./CommentSection";
import LazyImage from "./LazyImage";
import DoubanEmbedCard from "./article/DoubanEmbedCard";
import { sharePost } from "@/lib/share";
import { toSafeHttpUrl, toSafeImageUrl } from "@/lib/web-url";

import { PUBLIC_API_URL } from "@/lib/api-fetch";

const API_URL = PUBLIC_API_URL;

function useIsDesktop(): boolean {
  return useSyncExternalStore(
    (callback) => {
      if (typeof window === "undefined") return () => {};
      const mql = window.matchMedia("(min-width: 768px)");
      mql.addEventListener("change", callback);
      return () => mql.removeEventListener("change", callback);
    },
    () => (typeof window !== "undefined" ? window.matchMedia("(min-width: 768px)").matches : false),
    () => false
  );
}

function useCurrentUser() {
  return useSyncExternalStore(
    (callback) => {
      if (typeof window === "undefined") return () => {};
      window.addEventListener("storage", callback);
      return () => window.removeEventListener("storage", callback);
    },
    () => getCurrentUser(),
    () => null
  );
}

// 桌面端滚动容器是 #scroll-root（固定定位 div），手机端是 window
function smoothScrollBy(delta: number) {
  if (typeof window === "undefined") return;
  const isDesktop = window.matchMedia("(min-width: 768px)").matches;
  const container = isDesktop ? document.getElementById("scroll-root") : null;
  if (container) {
    container.scrollBy({ top: delta, behavior: "smooth" });
  } else {
    window.scrollBy({ top: delta, behavior: "smooth" });
  }
}

export interface MomentCardProps {
  post: Post;
  index: number;
  /** 管理后台传入时显示删除入口 */
  onDelete?: () => void;
  variant?: "timeline" | "card";
}

function MomentCard({
  post,
  index,
  onDelete,
  variant = "timeline",
}: MomentCardProps) {
  const isCardVariant = variant === "card";
  const safeLinkUrl = toSafeHttpUrl(post.linkCard?.url);
  const safeLinkImage = toSafeImageUrl(post.linkCard?.image);
  const router = useRouter();
  const isDesktop = useIsDesktop();
  const currentUser = useCurrentUser();

  const [likes, setLikes] = useState<Array<{ name: string; email?: string }>>(post.likes || []);
  const [liked, setLiked] = useState(!!post.meLiked);
  const [liking, setLiking] = useState(false);
  const [comments, setComments] = useState(post.comments || []);
  const [showComments, setShowComments] = useState(false);
  const [replyTo, setReplyTo] = useState<string | undefined>(undefined);
  const [pinned, setPinned] = useState(!!post.pinned);
  const [avatarLoaded, setAvatarLoaded] = useState(false);

  // Sync state when props change
  const [prevPostId, setPrevPostId] = useState(post.id);
  const [prevMeLiked, setPrevMeLiked] = useState(post.meLiked);
  if (post.id !== prevPostId || post.meLiked !== prevMeLiked) {
    setPrevPostId(post.id);
    setPrevMeLiked(post.meLiked);
    setLiked(!!post.meLiked);
  }

  const [prevLikes, setPrevLikes] = useState(post.likes);
  if (post.likes !== prevLikes) {
    setPrevLikes(post.likes);
    setLikes(post.likes || []);
  }

  const [prevComments, setPrevComments] = useState(post.comments);
  if (post.comments !== prevComments) {
    setPrevComments(post.comments);
    setComments(post.comments || []);
  }

  const [prevPinned, setPrevPinned] = useState(post.pinned);
  if (post.pinned !== prevPinned) {
    setPrevPinned(post.pinned);
    setPinned(!!post.pinned);
  }

  const isAdmin = !!currentUser?.isLoggedIn;
  const canEdit = !!(
    currentUser?.isLoggedIn &&
    (post.author?.isOwner ||
      (post.author?.nickname && post.author.nickname === currentUser.nickname))
  );

  const normalizedImages = useMemo(() => normalizeImages(post.images), [post.images]);

  // 长文展开/收起
  // clippable 默认 true：SSR 即折叠，避免硬刷新时长内容先展开后折叠的闪屏
  // measured 控制"展开"按钮显示，避免短内容按钮闪现
  const [contentExpanded, setContentExpanded] = useState(false);
  const [clippable, setClippable] = useState(true);
  const [measured, setMeasured] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const collapseLength = useSiteSettings((s) => s.postCollapseLength);
  const openEdit = useEditPost((s) => s.open);

  // 动态音乐接管顶栏播放器：点击动态音乐卡片后由顶栏播放，歌词也在顶栏显示
  const activePostId = useMusicPlayer((s) => s.activePostId);
  const isPlaying = useMusicPlayer((s) => s.isPlaying);
  const isLoading = useMusicPlayer((s) => s.isLoading);
  const setActiveMusic = useMusicPlayer((s) => s.setActive);
  // 当前动态是否正在顶栏播放
  const isThisActive = activePostId === post.id;
  const isThisPlaying = isThisActive && isPlaying;
  const isThisLoading = isThisActive && isLoading;

  // 长文折叠检测：纯文字字数超过配置阈值时显示展开/收起按钮
  useEffect(() => {
    const el = contentRef.current;
    if (!el) {
      setMeasured(true);
      return;
    }
    // 计算纯文本字数（去除 HTML 标签）
    const textLength = (el.textContent || "").replace(/\s/g, "").length;
    // collapseLength=0 表示不折叠
    setClippable(collapseLength > 0 && textLength > collapseLength);
    setMeasured(true);
  }, [post.content, collapseLength]);

  // 根据折叠字数和屏幕宽度动态计算 line-clamp 行数
  // 手机端每行约 18 个字，桌面端每行约 50 个字
  const charsPerLine = isDesktop ? 50 : 18;
  const clampLines = Math.max(1, Math.ceil(collapseLength / charsPerLine));

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
        router.refresh();
      }
    } catch {
      // ignore
    }
  };

  const handleLike = async () => {
    if (liking) return;
    setLiking(true);
    // 乐观更新：点击瞬间翻转 UI，失败回滚
    const prevLiked = liked;
    setLiked(!prevLiked);
    const user = getCurrentUser();
    const name = user?.nickname || "访客";
    const email = user?.email || "";
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (user?.isLoggedIn && user.token) {
        headers.Authorization = `Bearer ${user.token}`;
      }
      const res = await fetch(`${API_URL}/posts/${post.id}/likes`, {
        method: "POST",
        headers,
        credentials: "include", // 关键：携带 cookie（visitorId）
        body: JSON.stringify({ name, email }),
      });
      if (res.status === 403) {
        // likesDisabled：回滚 UI 并提示
        setLiked(prevLiked);
        const data = await res.json().catch(() => ({}));
        if (data?.message) alert(data.message);
        return;
      }
      if (!res.ok) {
        setLiked(prevLiked); // 回滚
        return;
      }
      const data = await res.json();
      setLiked(data.liked);
      if (Array.isArray(data.likes)) {
        setLikes(data.likes);
      }
    } catch {
      setLiked(prevLiked); // 网络错误回滚
    } finally {
      setLiking(false);
    }
  };

  const handleCommentClick = () => {
    setShowComments((prev) => !prev);
  };

  const handleShare = async () => {
    const momentPath = `/moments/${post.shortId || post.id}`;
    const plainText = (post.content || "")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();
    const title = plainText
      ? plainText.length > 30
        ? plainText.slice(0, 30) + "…"
        : plainText
      : `${post.author?.nickname || "用户"} 的动态`;

    await sharePost({
      title,
      url: momentPath,
      typeLabel: "动态",
      summary: plainText,
      cover: post.images && post.images.length > 0 ? (typeof post.images[0] === "string" ? post.images[0] : post.images[0]?.src) : undefined,
      author: post.author?.nickname || "Dual",
    });
  };

  // 点击动态音乐卡片：后端只解析直连地址，浏览器直接从音乐源下载音频。
  const handleMusicClick = async () => {
    if (!post.music) return;
    const audio = getGlobalAudio();
    if (!audio) return;

    if (isThisActive) {
      if (audio.paused) {
        audio.play().catch(() => {});
      } else {
        audio.pause();
      }
      return;
    }

    try {
      const playUrl = getStaticMusicUrl(post.music);
      if (!playUrl) throw new Error("该动态没有可播放的 R2 音频文件。");
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

  // 从邮件通知链接跳转：?post={postId}#comment-{commentId}
  const urlNavRef = useRef(false);
  useEffect(() => {
    if (urlNavRef.current) return;
    urlNavRef.current = true;

    const params = new URLSearchParams(window.location.search);
    const postParam = params.get("post");
    if (postParam !== post.id) return;

    const hash = window.location.hash;
    const commentId = hash.startsWith("#comment-") ? hash.substring(9) : null;

    // 等待入场动画结束后再滚动
    setTimeout(() => {
      if (commentId) {
        const el = document.getElementById(`comment-${commentId}`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          el.style.transition = "background-color 0.3s ease";
          el.style.backgroundColor = "rgba(128, 128, 128, 0.14)";
          setTimeout(() => { el.style.backgroundColor = ""; }, 2500);
          setShowComments(true);
          return;
        }
      }
      const postEl = document.getElementById(`post-${post.id}`);
      if (postEl) {
        postEl.scrollIntoView({ behavior: "smooth", block: "center" });
        postEl.style.transition = "background-color 0.3s ease";
        postEl.style.backgroundColor = "rgba(128, 128, 128, 0.08)";
        setTimeout(() => { postEl.style.backgroundColor = ""; }, 1800);
      }
    }, 800);

    // 清除 URL 参数，避免刷新重复触发
    window.history.replaceState({}, "", window.location.pathname);
  }, [post.id]);

  const displayName = post.author?.nickname || "用户";
  const authorAvatar = resolveAvatarFromHash(post.author?.avatar, post.author?.avatarHash, 96);

  return (
    <article
      id={`post-${post.id}`}
      className={
        isCardVariant
          ? "group relative flex flex-col justify-between rounded-2xl bg-white/90 dark:bg-neutral-900/80 backdrop-blur-sm p-5 sm:p-6 shadow-[0_1px_3px_rgba(0,0,0,0.02),0_8px_24px_-6px_rgba(0,0,0,0.03)] dark:shadow-[0_1px_3px_rgba(0,0,0,0.3)] border border-neutral-200/70 dark:border-neutral-800/80 animate-fade-in-up scroll-mt-16 transition-all duration-300 hover:border-neutral-300 dark:hover:border-neutral-700 hover:shadow-[0_8px_30px_-6px_rgba(0,0,0,0.06)] dark:hover:shadow-[0_8px_30px_-6px_rgba(0,0,0,0.4)] hover:-translate-y-0.5"
          : "flex gap-3 px-4 py-4 sm:px-5 md:px-6 animate-fade-in-up scroll-mt-16"
      }
      style={{ animationDelay: `${index * 60}ms`, opacity: 0 }}
    >
      {/* 独立卡片模式顶部微高光 */}
      {isCardVariant && (
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-neutral-300/40 dark:via-neutral-700/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10" />
      )}

      {/* 独立卡片模式顶栏 */}
      {isCardVariant && (
        <div className="flex items-center justify-between gap-3 pb-3 border-b border-black/[0.04] dark:border-white/[0.05] mb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <Link
              href="/"
              className="relative block h-10 w-10 shrink-0 overflow-hidden rounded-full bg-wechat-bubble ring-1 ring-black/5 dark:ring-white/10"
              aria-label={`查看${displayName}的主页`}
            >
              <Image
                src={authorAvatar}
                alt={displayName}
                fill
                onLoad={() => setAvatarLoaded(true)}
                className={`object-cover transition-opacity duration-500 ${avatarLoaded ? "opacity-100" : "opacity-0"}`}
                sizes="40px"
                unoptimized
              />
            </Link>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                  {displayName}
                </span>
                {pinned && (
                  <Pin className="h-3 w-3 shrink-0 rotate-45 text-[#9a9a9a]" fill="currentColor" strokeWidth={2} />
                )}
              </div>
              <Link
                href={`/moments/${post.shortId || post.id}`}
                className="inline-block hover:underline hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors"
                title="查看动态详情"
              >
                <time className="block text-[11px] text-wechat-time" title={post.createdAt}>
                  {formatExactDateTime(post.createdAt)}
                </time>
              </Link>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {post.status === "draft" && (
              <span className="shrink-0 rounded bg-amber-100 dark:bg-amber-500/20 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300 border border-amber-300/40">
                草稿
              </span>
            )}
            {post.category && (
              <span className="rounded-full bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200/60 dark:border-emerald-800/60 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                #{post.category}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Avatar (时间线模式) */}
      {!isCardVariant && (
        <Link
          href="/"
          className="relative block h-10 w-10 shrink-0 overflow-hidden rounded-[5px] bg-wechat-bubble md:h-11 md:w-11"
          aria-label={`查看${displayName}的主页`}
        >
          <Image
            src={authorAvatar}
            alt={displayName}
            fill
            onLoad={() => setAvatarLoaded(true)}
            className={`object-cover transition-opacity duration-500 ${avatarLoaded ? "opacity-100" : "opacity-0"}`}
            sizes="44px"
            unoptimized
          />
        </Link>
      )}

      {/* Content column */}
      <div className="min-w-0 flex-1 flex flex-col justify-between">
        {!isCardVariant && (
          <h3 className="flex items-center justify-between gap-2 text-[15px] font-medium leading-5 text-wechat-nickname md:text-[16px]">
            <span className="flex min-w-0 items-center gap-1">
              <span className="truncate">{displayName}</span>
              {pinned && (
                <Pin className="h-[15px] w-[15px] shrink-0 rotate-45 text-[#9a9a9a]" fill="currentColor" strokeWidth={2} />
              )}
            </span>
            <div className="flex items-center gap-1.5 shrink-0">
              {post.status === "draft" && (
                <span className="shrink-0 rounded bg-amber-100 dark:bg-amber-500/20 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300 border border-amber-300/40">
                  草稿
                </span>
              )}
              {post.category && (
                <span className="rounded-full bg-neutral-100 dark:bg-neutral-800/80 px-2 py-0.5 text-[11px] font-medium text-neutral-600 dark:text-neutral-400">
                  #{post.category}
                </span>
              )}
              {pinned && (
                <span className="shrink-0 rounded-[4px] bg-[#ececec] px-2 py-0.5 text-[11px] font-medium leading-tight text-[#9a9a9a] dark:bg-white/[0.1] dark:text-[#9a9a9a]">
                  置顶
                </span>
              )}
            </div>

          </h3>
        )}

        {/* moment 正文 */}
        {post.content && (
          <div className="mt-1">
            <div
              ref={contentRef}
              className={`rich-content relative text-[15px] leading-[23px] text-wechat-text md:text-[16px] md:leading-[24px] ${
                clippable && !contentExpanded ? "collapsed" : ""
              }`}
              style={
                clippable && !contentExpanded
                  ? ({ WebkitLineClamp: clampLines } as CSSProperties)
                  : undefined
              }
              dangerouslySetInnerHTML={{
                __html: renderContent(post.content),
              }}
            />
            {clippable && measured && (
              <button
                type="button"
                onClick={() => {
                  if (contentExpanded) {
                    const content = contentRef.current;
                    setContentExpanded(false);
                    requestAnimationFrame(() => {
                      if (content) {
                        // 收起后内容高度缩小，页面变短，当前动态可能被挤出视口上方
                        // 如果内容顶部低于 80px（被 TopBar 遮挡或在视口上方），上滚回正
                        const afterTop = content.getBoundingClientRect().top;
                        if (afterTop < 80) {
                          smoothScrollBy(afterTop - 80);
                        }
                      }
                    });
                  } else {
                    setContentExpanded(true);
                  }
                }}
                className="mt-1.5 inline-flex items-center rounded px-1.5 py-0.5 -ml-1 text-[13px] font-medium text-wechat-link transition-colors hover:bg-black/5 dark:hover:bg-white/5 active:opacity-60 md:text-[14px] cursor-pointer"
              >
                {contentExpanded ? "收起" : "展开"}
              </button>
            )}
          </div>
        )}

        {post.video ? (
          <VideoPlayer video={post.video} postId={post.id} />
        ) : (
          <ImageGrid images={normalizedImages} />
        )}

        {/* Link card */}
        {post.linkCard && safeLinkUrl && (
          <a
            href={safeLinkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`mt-2.5 flex w-full items-stretch overflow-hidden rounded-xl border border-neutral-200/70 bg-neutral-50/80 hover:bg-neutral-100/80 dark:border-neutral-750 dark:bg-neutral-850/80 dark:hover:bg-neutral-800/90 shadow-2xs hover:shadow-xs transition-all duration-200 active:scale-[0.99] ${
              isCardVariant ? "max-w-full" : "max-w-[260px] md:max-w-[300px]"
            }`}
          >
            {/* 左侧方形封面 */}
            <div className="flex h-[72px] w-[72px] shrink-0 md:h-[80px] md:w-[80px] items-center justify-center overflow-hidden bg-black/[0.02] dark:bg-white/[0.02]">
              {safeLinkImage && (
                <LazyImage
                  src={safeLinkImage}
                  alt=""
                  className="h-full w-full object-contain p-1.5"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              )}
            </div>
            {/* 右侧内容区 */}
            <div className="flex min-w-0 flex-1 flex-col justify-center px-3 py-2">
              <p className="line-clamp-1 text-[13px] sm:text-[14px] font-semibold text-neutral-900 dark:text-neutral-100">
                {post.linkCard.title || safeLinkUrl}
              </p>
              {post.linkCard.description && (
                <p className="line-clamp-2 mt-0.5 text-[11px] sm:text-[12px] text-neutral-500 dark:text-neutral-400">
                  {post.linkCard.description}
                </p>
              )}
            </div>
          </a>
        )}

        {/* Music card */}
        {post.music && (
          <div
            onClick={handleMusicClick}
            className={`mt-2.5 flex w-full cursor-pointer items-stretch overflow-hidden rounded-xl border border-neutral-200/70 bg-neutral-50/80 hover:bg-neutral-100/80 dark:border-neutral-750 dark:bg-neutral-850/80 dark:hover:bg-neutral-800/90 shadow-2xs hover:shadow-xs transition-all duration-200 active:scale-[0.99] ${
              isCardVariant ? "max-w-full" : "max-w-[260px] md:max-w-[300px]"
            }`}
          >
            {/* 左侧方形封面 */}
            <div className="relative h-[72px] w-[72px] shrink-0 md:h-[80px] md:w-[80px] overflow-hidden bg-black/5 dark:bg-white/5">
              {toSafeImageUrl(post.music.cover) ? (
                <LazyImage
                  src={toHttps(
                    toSafeImageUrl(post.music.cover)?.startsWith("http")
                      ? toSafeImageUrl(post.music.cover) || ""
                      : `${API_URL.replace("/api", "")}${toAbsoluteUrl(toSafeImageUrl(post.music.cover) || "")}`
                  )}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <Music className="h-6 w-6 text-black/30 dark:text-white/30 md:h-7 md:w-7" />
                </div>
              )}
            </div>

            {/* 右侧内容区 */}
            <div className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] sm:text-[14px] font-semibold text-neutral-900 dark:text-neutral-100">
                  {post.music.name}
                </p>
                <p className="truncate text-[11px] sm:text-[12px] text-neutral-500 dark:text-neutral-400">
                  {post.music.artist}
                </p>
              </div>
              {/* 播放/暂停图标 */}
              {isThisLoading ? (
                <span className="h-3 w-3 shrink-0 rounded-full bg-neutral-500 animate-pulse dark:bg-neutral-400" />
              ) : isThisPlaying ? (
                <Pause className="h-4 w-4 shrink-0 text-neutral-700 dark:text-neutral-200" fill="currentColor" />
              ) : (
                <svg
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="h-4 w-4 shrink-0 translate-x-[1px] text-neutral-700 dark:text-neutral-200"
                >
                  <path d="M8 5.14v13.72c0 .93 1.03 1.5 1.83 1.01l11.3-6.86a1.25 1.25 0 0 0 0-2.14L9.83 4.13A1.25 1.25 0 0 0 8 5.14Z" />
                </svg>
              )}
            </div>
          </div>
        )}

        {/* Douban card — 豆瓣影单卡片，与链接卡片/音乐卡片同层级 */}
        {post.douban && (
          <DoubanEmbedCard item={post.douban} />
        )}

        {/* Location — 显示在时间上方，格式：城市 · 地点名 */}
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
        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[13px] text-wechat-time md:text-[14px]">
            {!isCardVariant && (
              <Link
                href={`/moments/${post.shortId || post.id}`}
                className="hover:underline hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors"
                title="查看动态详情"
              >
                <time title={post.createdAt}>{formatExactDateTime(post.createdAt)}</time>
              </Link>
            )}
            {(() => {
              const src = getPostSourceLabel(post);
              if (!src) return null;
              return (
                <>
                  {!isCardVariant && <span className="text-[15px] leading-none text-wechat-time/60">·</span>}
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
                ? () => {
                    if (post.category === "项目" || post.type === "project") {
                      router.push(`/admin/projects/${post.id}`);
                    } else if (post.type === "article") {
                      router.push(`/admin/articles/${post.id}`);
                    } else {
                      openEdit(post);
                    }
                  }
                : undefined
            }
            onDelete={onDelete}
            onPin={isAdmin ? handlePin : undefined}
            liked={liked}
            pinned={pinned}
          />
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

// memo：列表中任一卡片内部状态变化时，其余卡片 props 不变即可跳过重渲染
export default memo(MomentCard);
