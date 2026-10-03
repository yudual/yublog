"use client";
/* eslint-disable react-hooks/set-state-in-effect, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  User,
  UserRound,
  Contact,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  BookUser,
  X,
  Volume2,
  VolumeX,
  Camera,
  Lock,
  Eye,
  EyeOff,
  ImagePlus,
  Trash2,
  Film,
  Video,
  LogOut,
  MapPin,
  Music,
  Upload,
  ChevronRight,
  Search,
  ExternalLink,
  LayoutDashboard,
  Pencil,
  Heart,
  MessageSquare,
  Library,
  Check,
  MoreVertical,
  Link2,
  Calendar,
  Clock,
  FolderOpen,
  Inbox,
} from "lucide-react";
import { cravatarUrl } from "@/lib/avatar";
import { getGlobalAudio } from "@/lib/global-audio";
import { useMusicPlayer } from "@/lib/music-player-store";
import type { Post, PostDouban, PostImage, PostLocation, PostVideo } from "@/lib/types";
import { formatExactDateTime, toDateTimeLocal, toIsoDateString } from "@/lib/time-format";
import { isLivePhoto, getImageSrc } from "@/lib/post-image";
import { uploadAudio, uploadDirect, uploadImage, uploadVideo, toAbsoluteUrl, toHttps } from "@/lib/upload";
import { PUBLIC_API_URL } from "@/lib/api-fetch";
import { notifyContentUpdated } from "@/lib/content-sync";
import { splitMotionPhoto } from "@/lib/motion-photo";
import { toSafeHttpUrl, toSafeImageUrl } from "@/lib/web-url";

import { useExitAnimation } from "@/lib/use-exit-animation";
import RichTextEditor from "./RichTextEditor";
import LazyImage from "./LazyImage";
import LocationPicker from "./LocationPicker";
import LyricEditor from "./LyricEditor";
import LyricPanel from "./LyricPanel";
import MediaPicker, { type PickerMediaItem } from "./MediaPicker";
import DoubanPicker from "./DoubanPicker";
import DoubanEmbedCard from "./article/DoubanEmbedCard";
import DoubanSidebar from "./DoubanSidebar";

const API_URL = PUBLIC_API_URL;
const AUDIO_BASE = API_URL.replace("/api", "");

function toAbsolute(url: string): string {
  if (!url || typeof url !== "string") return "";
  return url.startsWith("http") ? url : `${AUDIO_BASE}${url}`;
}

interface TopBarProps {
  coverHeight?: number;
}

interface FriendLink {
  id: string;
  name: string;
  url: string;
  desc: string;
  email: string;
  avatar: string;
}

/** 解析友链头像：avatar 优先（邮箱→Cravatar，链接/上传→原值），为空回退 email */
function resolveFriendAvatar(link: { avatar?: string; email?: string }, size = 96): string {
  const avatar = (link.avatar || "").trim();
  if (avatar) {
    if (!avatar.startsWith("http") && avatar.includes("@")) {
      return cravatarUrl(avatar, size);
    }
    return toAbsoluteUrl(avatar);
  }
  const email = (link.email || "").trim();
  if (email) return cravatarUrl(email, size);
  return "";
}

export interface LoggedInUser {
  token: string;
  nickname: string;
  email: string;
  avatar: string;
  cover: string;
  bio: string;
  website: string;
}

export default function TopBar({ coverHeight = 300 }: TopBarProps) {
  const router = useRouter();
  const [scrollProgress, setScrollProgress] = useState(0);
  const [bgAlpha, setBgAlpha] = useState(0);
  const [showFriends, setShowFriends] = useState(false);
  const [friendsTab, setFriendsTab] = useState<"friends" | "douban">("friends");
  const friendsAnim = useExitAnimation(() => setShowFriends(false), 250);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const coverHeightRef = useRef(coverHeight);
  useEffect(() => {
    const measure = () => {
      const el = document.querySelector("[data-cover-header]");
      if (el) coverHeightRef.current = el.getBoundingClientRect().height;
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  const [showLogin, setShowLogin] = useState(false);
  const [showPublish, setShowPublish] = useState(false);

  // Music player — 从全局 store 读取状态（由 GlobalMusicManager 管理）
  const isPlaying = useMusicPlayer((s) => s.isPlaying);
  const isLoading = useMusicPlayer((s) => s.isLoading);
  const switching = useMusicPlayer((s) => s.switching);
  const musicUrl = useMusicPlayer((s) => s.musicUrl);
  const musicName = useMusicPlayer((s) => s.musicName);
  const lyric = useMusicPlayer((s) => s.lyric);
  const currentLyric = useMusicPlayer((s) => s.currentLyric);
  const currentLyricIndex = useMusicPlayer((s) => s.currentLyricIndex);
  const showLyricPanel = useMusicPlayer((s) => s.showLyricPanel);
  const muted = useMusicPlayer((s) => s.muted);
  const audioError = useMusicPlayer((s) => s.audioError);
  const audioErrorMessage = useMusicPlayer((s) => s.audioErrorMessage);
  const musicLoaded = useMusicPlayer((s) => s.musicLoaded);
  const activePostMusic = useMusicPlayer((s) => s.activePostMusic);
  const playlist = useMusicPlayer((s) => s.playlist);
  const currentIndex = useMusicPlayer((s) => s.currentIndex);
  const clearActivePost = useMusicPlayer((s) => s.clear);
  const setShowLyricPanel = useMusicPlayer((s) => s.setShowLyricPanel);
  const setMuted = useMusicPlayer((s) => s.setMuted);
  const prepareTrack = useMusicPlayer((s) => s.prepareTrack);

  // Logged-in state
  const [loggedIn, setLoggedIn] = useState<LoggedInUser | null>(null);

  const [friendLinks, setFriendLinks] = useState<FriendLink[]>([]);
  const [friendsPage, setFriendsPage] = useState(1);
  const [friendsHasMore, setFriendsHasMore] = useState(false);
  const [friendsLoadingMore, setFriendsLoadingMore] = useState(false);
  const [friendsLoaded, setFriendsLoaded] = useState(false);
  const friendsSentinelRef = useRef<HTMLDivElement>(null);
  const friendsLoadingRef = useRef(false);

  // 豆瓣数据预检查：用于决定是否显示"影单"tab和友链按钮
  const [hasDouban, setHasDouban] = useState(false);
  const [doubanLoaded, setDoubanLoaded] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch friend links + douban existence check（音乐数据由 GlobalMusicManager 全局管理）
  useEffect(() => {
    fetch(`${API_URL}/friends`)
      .then((res) => (res.ok ? res.json() : { data: [], pagination: { hasMore: false } }))
      .then((data: { data: FriendLink[]; pagination?: { hasMore: boolean } }) => {
        setFriendLinks(data.data || []);
        setFriendsHasMore(false);
      })
      .catch(() => {})
      .finally(() => setFriendsLoaded(true));

    // 轻量检查豆瓣是否有数据（只取 typeCounts，limit=1）
    fetch(`${API_URL}/douban?type=movie&status=all&page=1&limit=1`)
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => {
        if (d?.typeCounts) {
          const total = d.typeCounts.movie + d.typeCounts.book + d.typeCounts.music;
          setHasDouban(total > 0);
        }
      })
      .catch(() => {})
      .finally(() => setDoubanLoaded(true));
  }, []);

  // 搜索防抖：输入 300ms 后自动请求
  useEffect(() => {
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults([]);
      return;
    }
    searchDebounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`${API_URL}/posts/search?q=${encodeURIComponent(q)}`);
        if (res.ok) {
          setSearchResults(await res.json());
        } else {
          setSearchResults([]);
        }
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [searchQuery]);
  const loadMoreFriends = useCallback(async () => {
    if (friendsLoadingRef.current || !friendsHasMore) return;
    friendsLoadingRef.current = true;
    setFriendsLoadingMore(true);
    const nextPage = friendsPage + 1;
    try {
      const res = await fetch(`${API_URL}/friends?page=${nextPage}&limit=10`);
      const data = await res.json();
      if (Array.isArray(data.data)) {
        setFriendLinks((prev) => [...prev, ...data.data]);
        setFriendsHasMore(data.pagination?.hasMore || false);
        setFriendsPage(nextPage);
      }
    } catch {
      // ignore
    } finally {
      setFriendsLoadingMore(false);
      friendsLoadingRef.current = false;
    }
  }, [friendsPage, friendsHasMore]);

  // IntersectionObserver：友链弹窗滚动到底部自动加载更多
  useEffect(() => {
    if (!showFriends || !friendsSentinelRef.current) return;
    const sentinel = friendsSentinelRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMoreFriends();
      },
      { rootMargin: "50px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMoreFriends, showFriends, friendsTab]);

  // 影单 tab 被隐藏时（豆瓣无数据），自动切回友链 tab
  useEffect(() => {
    if (friendsTab === "douban" && doubanLoaded && !hasDouban) {
      setFriendsTab("friends");
    }
  }, [friendsTab, doubanLoaded, hasDouban]);

  // 点击菜单外部关闭三点菜单
  useEffect(() => {
    if (!showUserMenu) return;
    const onClickAway = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener("mousedown", onClickAway);
    return () => document.removeEventListener("mousedown", onClickAway);
  }, [showUserMenu]);

  // audio 事件绑定、歌词 fetch、onEnded 切歌逻辑由 GlobalMusicManager 全局管理

  useEffect(() => {
    let rafId: number | null = null;
    const onScroll = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const y = Math.max(root?.scrollTop || 0, window.scrollY || 0);
        const refHeight = coverHeightRef.current;
        setScrollProgress(Math.min(1, Math.max(0, y / refHeight)));

        // Background opacity based on avatar position relative to top bar.
        // Fades in as the top bar starts covering the avatar, fully opaque
        // once the avatar is completely hidden behind the bar.
        // Mobile: advance 120px so bg appears earlier
        const avatar = document.querySelector("[data-cover-avatar]") as HTMLElement | null;
        const topbar = document.querySelector("[data-topbar]") as HTMLElement | null;
        if (avatar && topbar) {
          const avatarRect = avatar.getBoundingClientRect();
          const topbarBottom = topbar.getBoundingClientRect().bottom;
          const isMobile = window.innerWidth < 768;
          const advance = isMobile ? 150 : 0;
          const fadeStart = topbarBottom + advance;
          const fadeEnd = topbarBottom - avatarRect.height;
          if (avatarRect.top >= fadeStart) {
            setBgAlpha(0);
          } else if (avatarRect.top <= fadeEnd) {
            setBgAlpha(1);
          } else {
            setBgAlpha(1 - (avatarRect.top - fadeEnd) / (fadeStart - fadeEnd));
          }
        }
      });
    };
    const root = document.getElementById("scroll-root");
    window.addEventListener("scroll", onScroll, { passive: true });
    if (root) root.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    onScroll();
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      window.removeEventListener("scroll", onScroll);
      if (root) root.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [coverHeight]);

  // Restore login from localStorage
  useEffect(() => {
    const token = localStorage.getItem("admin_token");
    const nickname = localStorage.getItem("admin_nickname");
    const email = localStorage.getItem("admin_email") || "";
    const avatar = localStorage.getItem("admin_avatar") || "";
    const cover = localStorage.getItem("admin_cover") || "";
    const bio = localStorage.getItem("admin_bio") || "";
    const website = localStorage.getItem("admin_website") || "";
    if (token && nickname) {
      setLoggedIn({ token, nickname, email, avatar, cover, bio, website });
    }
  }, []);

  const togglePlay = async () => {
    const audio = getGlobalAudio();
    if (!audio || (!musicUrl && !activePostMusic && playlist.length === 0)) return;
    if (audio.paused) {
      let targetUrl = activePostMusic?.url || musicUrl;
      if (!activePostMusic && !targetUrl) {
        const prepared = await prepareTrack(currentIndex);
        if (!prepared) return;
        targetUrl = prepared.url;
      }
      // 强守卫：src 缺失或不匹配目标 URL 时重新加载，避免播放过期歌曲
      if (!audio.getAttribute("src") || !audio.src.includes(targetUrl)) {
        audio.src = targetUrl;
      }
      audio.play().catch(() => useMusicPlayer.getState().setAudioError(true, "播放地址已失效或被音源拒绝，请重试或切换曲目。"));
    } else {
      audio.pause();
    }
  };

  const toggleMute = () => {
    const audio = getGlobalAudio();
    if (audio) {
      audio.muted = !muted;
      setMuted(!muted);
    }
  };

  const playTrack = async (index: number) => {
    const audio = getGlobalAudio();
    const st = useMusicPlayer.getState();
    if (!st.playlist[index] || !audio) return;
    const prepared = await prepareTrack(index);
    if (!prepared) return;
    if (st.activePostMusic) clearActivePost();
    audio.src = prepared.url;
    audio.play().catch(() => useMusicPlayer.getState().setAudioError(true, "播放地址已失效或被音源拒绝，请重试或切换曲目。"));
  };

  const playNext = () => {
    if (playlist.length === 0) return;
    const next = (currentIndex + 1) % playlist.length;
    playTrack(next);
  };

  const playPrev = () => {
    if (playlist.length === 0) return;
    const prev = (currentIndex - 1 + playlist.length) % playlist.length;
    playTrack(prev);
  };

  const handleLogout = () => {
    localStorage.removeItem("admin_token");
    localStorage.removeItem("admin_nickname");
    localStorage.removeItem("admin_email");
    localStorage.removeItem("admin_avatar");
    localStorage.removeItem("admin_cover");
    localStorage.removeItem("admin_bio");
    localStorage.removeItem("admin_website");
    setLoggedIn(null);
    window.location.reload();
  };

  // Background opacity is driven by bgAlpha state (computed from avatar
  // position in the scroll handler above). Fades in exactly when the top
  // bar starts covering the avatar — works identically on mobile & desktop.
  const blur = "0px";
  const frosted = bgAlpha > 0.5;

  // Icon color helper
  const iconClass = frosted
    ? "text-gray-700 hover:bg-black/5 dark:text-gray-200 dark:hover:bg-white/10"
    : "text-white hover:bg-white/20 drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]";

  return (
    <>
      {/* Fixed wrapper — no background, just positioning.
          pointer-events-none so the transparent side areas (desktop) don't
          block clicks on the page below; the inner card re-enables events. */}
      <header data-topbar className="fixed left-1/2 z-50 w-full max-w-[600px] -translate-x-1/2 pointer-events-none top-0 md:top-6">
        {/* Inner card-width container — solid floating card fixed at top-6.
            No spacer, no mask — the 24px gap above is just the page background. */}
        <div
          className={`pointer-events-auto topbar-surface flex h-12 w-full items-center justify-between px-4 sm:px-5 md:px-6 transition-all duration-300 md:rounded-t-2xl ${
            frosted
              ? "md:shadow-[0_4px_20px_-8px_rgba(0,0,0,0.12)] md:border md:border-wechat-border"
              : "md:border md:border-transparent"
          }`}
          style={{
            "--topbar-bg-alpha": bgAlpha,
            "--topbar-blur": blur,
          } as React.CSSProperties}
        >
          {/* Left: spacer */}
          <div className="flex-1 min-w-0" />

          {/* Right: search + friends + publish/login */}
          <div className="relative flex shrink-0 items-center gap-1.5">
            {/* 搜索按钮 */}
            <button
              type="button"
              onClick={() => { setShowSearch((v) => { const next = !v; if (!next) { setSearchQuery(""); setSearchResults([]); } return next; }); }}
              className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${showSearch ? "bg-wechat-link/15 text-wechat-link dark:bg-white/15" : iconClass}`}
              aria-label="搜索"
            >
              <Search className="h-[18px] w-[18px]" />
            </button>

            {/* 搜索面板 */}
            {showSearch && (
              <div
                className="absolute right-0 top-full z-50 mt-2 w-[280px] rounded-2xl border border-wechat-border bg-wechat-white shadow-[0_8px_32px_-12px_rgba(0,0,0,0.18)] dark:border-white/10 dark:bg-[#232328] dark:shadow-[0_8px_32px_-12px_rgba(0,0,0,0.55)] md:w-[320px]"
              >
                <div className="flex items-center gap-2 border-b border-wechat-border px-3 py-2 dark:border-white/10">
                  <Search className="h-4 w-4 shrink-0 text-wechat-time" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="搜索动态 / 文章…"
                    className="flex-1 bg-transparent text-sm text-wechat-text outline-none placeholder:text-wechat-time"
                    autoFocus
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => { setSearchQuery(""); setSearchResults([]); }}
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-wechat-time hover:text-wechat-text"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
                {/* Results */}
                <div className="max-h-[340px] overflow-y-auto">
                  {searching && searchResults.length === 0 && (
                    <div className="py-8 text-center text-xs text-wechat-time">搜索中…</div>
                  )}
                  {!searching && searchQuery.trim() && searchResults.length === 0 && (
                    <div className="py-8 text-center text-xs text-wechat-time">无结果</div>
                  )}
                  {searchResults.map((item: any) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        const path = (item.category === "项目" || item.type === "project")
                          ? `/projects/${item.shortId || item.id}`
                          : item.type === "article"
                          ? `/articles/${item.shortId || item.id}`
                          : `/moments/${item.shortId || item.id}`;
                        setShowSearch(false);
                        setSearchQuery("");
                        setSearchResults([]);
                        router.push(path);
                      }}
                      className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-wechat-hover dark:hover:bg-white/5"
                    >
                      {toSafeImageUrl(item.cover) ? (
                        <div className="mt-0.5 h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-wechat-bubble dark:bg-white/5">
                          <LazyImage
                            src={toAbsoluteUrl(toSafeImageUrl(item.cover) || "")}
                            alt={item.title || item.excerpt || ""}
                            className="h-full w-full object-cover"
                          />
                        </div>
                      ) : null}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          {item.type === "article" && (
                            <span className="shrink-0 rounded-[3px] bg-wechat-link/10 px-1 py-0 text-[10px] font-medium text-wechat-link dark:bg-white/10">文</span>
                          )}
                          <span className="truncate text-[13px] font-medium text-wechat-text">
                            {item.title || item.excerpt || "无标题"}
                          </span>
                        </div>
                        {(item.excerpt || item.content) && (
                          <p className="line-clamp-1 mt-0.5 text-[11px] leading-relaxed text-wechat-time">
                            {item.excerpt || item.content}
                          </p>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 友链按钮 */}
            {((!friendsLoaded || !doubanLoaded) || friendLinks.length > 0 || hasDouban) && (
            <button
              type="button"
              onClick={() => { setFriendsTab(friendLinks.length === 0 && hasDouban ? "douban" : "friends"); setShowUserMenu(false); setShowFriends(true); }}
              className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors md:hidden ${iconClass}`}
              aria-label="友链"
            >
              <Contact className="h-[18px] w-[18px]" />
            </button>
            )}

            {/* Camera (发布动态) / UserRound (登录) — 移动端最右侧 */}
            {loggedIn ? (
              <button
                type="button"
                onClick={() => setShowPublish(true)}
                className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors lg:hidden ${iconClass}`}
                aria-label="发布动态"
              >
                <Camera className="h-[18px] w-[18px]" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowLogin(true)}
                className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors lg:hidden ${iconClass}`}
                aria-label="登录"
              >
                <UserRound className="h-[18px] w-[18px]" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ===== Login Modal ===== */}
      {showLogin && (
        <LoginModal
          onClose={() => setShowLogin(false)}
          onSuccess={(user) => {
            setLoggedIn(user);
            // 不立即关闭弹窗，由 LoginModal 内部 handleClose 播放退出动画后再 onClose
            const reload = () => window.location.reload();
            if (user.email && user.nickname) {
              fetch(`${API_URL}/posts/likes/update-name`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ email: user.email, newName: user.nickname }),
              }).finally(() => setTimeout(reload, 260));
            } else {
              setTimeout(reload, 260);
            }
          }}
        />
      )}

      {/* ===== Publish Modal ===== */}
      {showPublish && loggedIn && (
        <PublishModal
          token={loggedIn.token}
          defaultCategory="日常"
          onClose={() => setShowPublish(false)}
          onPublished={() => {
            // 不直接关闭弹窗，由 PublishModal 内部 handleClose 播放退出动画后关闭
            window.dispatchEvent(new CustomEvent("post-published"));
          }}
        />
      )}

      {/* ===== Friends & Douban Modal — 从顶部滑下 + Tab 切换 ===== */}
      {(showFriends || friendsAnim.closing) && typeof document !== "undefined" && createPortal(
        <div
          data-modal="overlay"
          className={`fixed inset-0 z-[100] flex items-start justify-center bg-black/40 md:items-center md:p-4 ${friendsAnim.closing ? "animate-overlay-out" : "animate-overlay-in"}`}
          onClick={friendsAnim.handleClose}
        >
          <div
            className={`flex h-[100dvh] w-full max-w-[520px] flex-col bg-wechat-white pt-[env(safe-area-inset-top)] md:h-auto md:rounded-2xl md:pt-0 md:shadow-xl dark:bg-[#232328] ${friendsAnim.closing ? "animate-sheet-to-top md:animate-modal-out" : "animate-sheet-from-top md:animate-modal-in"}`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Tab 切换：友链 / 豆瓣 + 三点菜单 */}
            <div className="flex shrink-0 items-center border-b border-wechat-border px-2 dark:border-white/10">
              <button
                onClick={() => setFriendsTab("friends")}
                className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium transition-colors ${
                  friendsTab === "friends"
                    ? "border-b-2 border-wechat-nickname text-wechat-text"
                    : "text-wechat-time hover:text-wechat-text"
                }`}
              >
                <Contact className="h-4 w-4" />
                友链
              </button>
              {/* 影单 tab：没有豆瓣数据时隐藏（加载中仍显示以避免闪烁） */}
              {(hasDouban || !doubanLoaded) && (
              <button
                onClick={() => setFriendsTab("douban")}
                className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium transition-colors ${
                  friendsTab === "douban"
                    ? "border-b-2 border-wechat-nickname text-wechat-text"
                    : "text-wechat-time hover:text-wechat-text"
                }`}
              >
                <Film className="h-4 w-4" />
                影单
              </button>
              )}
              <div className="ml-auto flex items-center gap-0.5">
                {loggedIn && (
                  <div ref={userMenuRef} className="relative">
                    <button
                      onClick={() => setShowUserMenu((v) => !v)}
                      className="flex h-8 w-8 items-center justify-center rounded-full text-wechat-time transition-colors hover:bg-wechat-hover hover:text-wechat-text"
                      aria-label="更多"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </button>
                    {showUserMenu && (
                      <div className="animate-dropdown-in absolute right-0 top-full z-50 mt-1 w-36 overflow-hidden rounded-xl border border-wechat-border bg-wechat-white shadow-xl dark:border-white/10 dark:bg-[#2c2c30]">
                        <button
                          type="button"
                          onClick={() => {
                            setShowUserMenu(false);
                            friendsAnim.handleClose();
                            window.open("/admin", "_blank", "noopener,noreferrer");
                          }}
                          className="flex w-full items-center gap-2 px-3.5 py-2.5 text-xs text-wechat-text transition-colors hover:bg-wechat-hover dark:hover:bg-white/10"
                        >
                          <LayoutDashboard className="h-3.5 w-3.5 text-wechat-time" />
                          后台管理
                        </button>
                        <div className="h-px bg-wechat-border dark:bg-white/10" />
                        <button
                          type="button"
                          onClick={() => {
                            setShowUserMenu(false);
                            friendsAnim.handleClose();
                            handleLogout();
                          }}
                          className="flex w-full items-center gap-2 px-3.5 py-2.5 text-xs text-red-500 transition-colors hover:bg-red-50 dark:hover:bg-red-500/10"
                        >
                          <LogOut className="h-3.5 w-3.5" />
                          退出登录
                        </button>
                      </div>
                    )}
                  </div>
                )}
                <button
                  onClick={friendsAnim.handleClose}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-wechat-time transition-colors hover:bg-wechat-hover hover:text-wechat-text"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div key={friendsTab} className="animate-content-fade-in flex-1 overflow-y-auto px-2 pb-2 md:max-h-[80vh]">
              {friendsTab === "friends" ? (
                <>
                  {!friendsLoaded ? (
                    <div className="space-y-1">
                      {[...Array(5)].map((_, i) => (
                        <div key={i} className="flex items-center gap-3 rounded-lg px-2 py-2.5">
                          <div className="h-10 w-10 shrink-0 animate-pulse rounded-[8px] bg-wechat-bubble dark:bg-white/5" />
                          <div className="flex-1 space-y-1.5">
                            <div className="h-3.5 w-1/3 animate-pulse rounded bg-wechat-bubble dark:bg-white/5" />
                            <div className="h-2.5 w-1/2 animate-pulse rounded bg-wechat-bubble dark:bg-white/5" />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : friendLinks.length === 0 ? (
                    <div className="py-8 text-center text-sm text-wechat-time">暂无友情链接</div>
                  ) : (
                    <ul>
                      {friendLinks.map((link) => (
                        <li key={link.id}>
                          {toSafeHttpUrl(link.url) ? (
                          <a
                            href={toSafeHttpUrl(link.url) || undefined}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-wechat-hover"
                          >
                            <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-[8px] bg-wechat-bubble">
                              {resolveFriendAvatar(link, 80) ? (
                                <LazyImage
                                  src={resolveFriendAvatar(link, 80)}
                                  alt={link.name}
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center">
                                  <BookUser className="h-4 w-4 text-wechat-time" />
                                </div>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[14px] font-medium text-wechat-nickname">
                                {link.name}
                              </p>
                              {link.desc && (
                                <p className="truncate text-xs text-wechat-time">{link.desc}</p>
                              )}
                            </div>
                            <ExternalLink className="h-4 w-4 shrink-0 text-wechat-time" />
                          </a>
                          ) : null}
                        </li>
                      ))}
                      {friendsLoadingMore &&
                        [...Array(3)].map((_, i) => (
                          <li key={`fsk-${i}`} className="flex items-center gap-3 rounded-lg px-2 py-2.5">
                            <div className="h-10 w-10 shrink-0 animate-pulse rounded-[8px] bg-wechat-bubble dark:bg-white/5" />
                            <div className="flex-1 space-y-1.5">
                              <div className="h-3.5 w-1/3 animate-pulse rounded bg-wechat-bubble dark:bg-white/5" />
                              <div className="h-2.5 w-1/2 animate-pulse rounded bg-wechat-bubble dark:bg-white/5" />
                            </div>
                          </li>
                        ))}
                    </ul>
                  )}
                  <div ref={friendsSentinelRef} className="h-1" />
                </>
              ) : (
                <DoubanSidebar embedded />
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* 歌词浮层：点击顶栏音乐区展开 */}
      {showLyricPanel && lyric && lyric.length > 0 && (
        <LyricPanel
          lines={lyric}
          currentIndex={currentLyricIndex}
          onClose={() => setShowLyricPanel(false)}
        />
      )}
    </>
  );
}

/* ========== Login Modal ========== */
export function LoginModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: (user: LoggedInUser) => void;
}) {
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { closing, handleClose } = useExitAnimation(onClose, 220);

  const handleSubmit = async () => {
    if (!account.trim() || !password.trim()) {
      setError("请输入用户名和密码");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "登录失败");
        return;
      }
      localStorage.setItem("admin_token", data.token);
      localStorage.setItem("admin_nickname", data.user.nickname);
      localStorage.setItem("admin_email", data.user.email);
      localStorage.setItem("admin_avatar", data.user.avatar || "");
      localStorage.setItem("admin_cover", data.user.cover || "");
      localStorage.setItem("admin_bio", data.user.bio || "");
      localStorage.setItem("admin_website", data.user.website || "");
      onSuccess({
        token: data.token,
        nickname: data.user.nickname,
        email: data.user.email,
        avatar: data.user.avatar || "",
        cover: data.user.cover || "",
        bio: data.user.bio || "",
        website: data.user.website || "",
      });
      handleClose();
    } catch {
      setError("网络错误，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      data-modal="overlay"
      className={`fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4 ${closing ? "animate-overlay-out" : "animate-overlay-in"}`}
      onClick={handleClose}
    >
      <div
        className={`w-full max-w-[320px] rounded-2xl bg-wechat-white shadow-xl dark:bg-[#232328] ${closing ? "animate-modal-out" : "animate-modal-in"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-wechat-border px-5 py-3.5 dark:border-white/10">
          <h3 className="text-base font-semibold text-wechat-text">登录</h3>
          <button
            onClick={handleClose}
            className="text-wechat-time transition-colors hover:text-wechat-text"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5">
          <div className="space-y-4">
            {/* 用户名或邮箱 */}
            <div className="relative">
              <UserRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-wechat-time" />
              <input
                type="text"
                value={account}
                onChange={(e) => setAccount(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                placeholder="用户名或邮箱"
                className="w-full rounded-lg border border-wechat-border bg-wechat-bubble py-3 pl-10 pr-3 text-sm text-wechat-text transition-colors placeholder:text-wechat-time focus:border-wechat-nickname focus:bg-wechat-white focus:outline-none"
              />
            </div>

            {/* Password */}
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-wechat-time" />
              <input
                type={showPwd ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                placeholder="密码"
                className="w-full rounded-lg border border-wechat-border bg-wechat-bubble py-3 pl-10 pr-10 text-sm text-wechat-text transition-colors placeholder:text-wechat-time focus:border-wechat-nickname focus:bg-wechat-white focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowPwd((p) => !p)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-wechat-time hover:text-wechat-text"
              >
                {showPwd ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>

            {error && <p className="text-xs text-red-500">{error}</p>}

            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading}
              className="w-full rounded-lg bg-black py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-85 disabled:opacity-50 dark:bg-white dark:text-black"
            >
              {loading ? "登录中..." : "登录"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

/* ========== Publish Modal (WeChat Moments Style) ========== */

export function PublishModal({
  token,
  onClose,
  onPublished,
  editPost,
  defaultCategory,
}: {
  token: string;
  onClose: () => void;
  onPublished: () => void;
  /** 传入则进入编辑模式（PUT /posts/:id），否则为发表模式（POST /posts） */
  editPost?: Post;
  defaultCategory?: string;
}) {
  const isEdit = !!editPost;
  const initialCategory = editPost?.category || (defaultCategory && defaultCategory !== "all" ? defaultCategory : "日常");
  const [activePostId, setActivePostId] = useState<string | null>(editPost?.id || null);
  const [activePostStatus, setActivePostStatus] = useState<"published" | "draft">(editPost?.status || "published");
  const [publishTime, setPublishTime] = useState<string>(() => toDateTimeLocal(editPost?.createdAt));
  const [showDraftBox, setShowDraftBox] = useState(false);
  const [draftList, setDraftList] = useState<Post[]>([]);
  const [draftListLoading, setDraftListLoading] = useState(false);
  const [draftCount, setDraftCount] = useState(0);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState("");
  const [content, setContent] = useState(editPost?.content ?? "");
  const [category, setCategory] = useState<string>(initialCategory);
  const [savingTarget, setSavingTarget] = useState<"published" | "draft" | null>(null);
  const [hasRestoredDraft, setHasRestoredDraft] = useState(false);
  const [draftSavedTime, setDraftSavedTime] = useState("");
  const [images, setImages] = useState<PostImage[]>(editPost?.images ?? []);
  const [uploading, setUploading] = useState(false);
  // 图片上传模式：normal=普通图片，live=实况图（需配对图片+视频），video=短视频
  const [uploadMode, setUploadMode] = useState<"normal" | "live" | "video">(
    editPost?.video ? "video" : "normal"
  );

  // 短视频：解析/上传/直链/嵌入
  const [video, setVideo] = useState<PostVideo | null>(editPost?.video ?? null);
  const [videoTab, setVideoTab] = useState<"parse" | "upload" | "url" | "embed">("parse");
  const [parseUrl, setParseUrl] = useState("");
  const [parsing, setParsing] = useState(false);
  const [videoUploading, setVideoUploading] = useState(false);
  const [videoDirectUrl, setVideoDirectUrl] = useState("");
  const [videoDirectCover, setVideoDirectCover] = useState("");
  const [embedCode, setEmbedCode] = useState(editPost?.video?.embedCode ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [location, setLocation] = useState<PostLocation | null>(
    editPost?.location ?? null
  );
  const [showLocationPanel, setShowLocationPanel] = useState(false);
  const [music, setMusic] = useState<{
    name: string;
    artist: string;
    cover: string;
    url: string;
    source: "upload";
    /** LRC 歌词文本（R2 上传音乐） */
    lrc?: string;
  } | null>(editPost?.music ?? null);
  const [linkCard, setLinkCard] = useState<{
    url: string;
    title: string;
    description: string;
    image: string;
    siteName: string;
  } | null>(editPost?.linkCard ?? null);
  const [linkCardLoading, setLinkCardLoading] = useState(false);
  const [showMusicPanel, setShowMusicPanel] = useState(false);
  const [douban, setDouban] = useState<PostDouban | null>(editPost?.douban ?? null);
  const [showDoubanPicker, setShowDoubanPicker] = useState(false);
  // 媒体库选择器：控制从媒体库导入图片/视频/音频/封面
  const [mediaPickerMode, setMediaPickerMode] = useState<"image" | "video" | "audio" | "cover" | null>(null);
  // 媒体库小胶囊：内联三排横向滚动选择图片（分页加载 + 延迟渲染，避免手机卡顿）
  const [mediaItems, setMediaItems] = useState<{ id: string; url: string; filename: string }[]>([]);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [mediaPage, setMediaPage] = useState(1);
  const [mediaHasMore, setMediaHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [showMediaPicker, setShowMediaPicker] = useState(false);
  const [mediaRendered, setMediaRendered] = useState(false);
  const mediaSentinelRef = useRef<HTMLDivElement>(null);
  // R2 音频仅支持上传或从媒体库选择。
  const [uploadingAudio, setUploadingAudio] = useState(false);
  // 编辑模式：从 editPost.music 回填元数据，避免用户看到空白表单
  const [customMusicName, setCustomMusicName] = useState(editPost?.music?.name ?? "");
  const [customMusicArtist, setCustomMusicArtist] = useState(editPost?.music?.artist ?? "");
  const [customMusicCover, setCustomMusicCover] = useState(editPost?.music?.cover ?? "");
  const [uploadedAudioUrl, setUploadedAudioUrl] = useState(editPost?.music?.url ?? "");
  const [uploadedAudioName, setUploadedAudioName] = useState(editPost?.music?.name ?? "");
  const [customMusicLrc, setCustomMusicLrc] = useState(editPost?.music?.lrc ?? "");
  const [showLyricEditor, setShowLyricEditor] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  // 互动权限：关闭点赞/评论
  const [likesDisabled, setLikesDisabled] = useState(editPost?.likesDisabled ?? false);
  const [commentsDisabled, setCommentsDisabled] = useState(editPost?.commentsDisabled ?? false);
  const [showExternalUrlInput, setShowExternalUrlInput] = useState(false);
  const [externalImageUrl, setExternalImageUrl] = useState("");

  const handleAddExternalImage = () => {
    const raw = externalImageUrl.trim();
    if (!raw) return;
    const urls = raw
      .split(/[\n,\s]+/)
      .map((u) => u.trim())
      .filter((u) => /^https?:\/\//i.test(u));

    if (urls.length === 0) {
      setError("请输入以 http:// 或 https:// 开头的有效图片链接");
      return;
    }

    const availableSlots = 9 - images.length;
    if (availableSlots <= 0) {
      setError("最多只能添加 9 张图片");
      return;
    }

    const toAdd = urls.slice(0, availableSlots);
    setImages((prev) => [...prev, ...toAdd]);
    setExternalImageUrl("");
    setShowExternalUrlInput(false);
    setError("");
  };

  const uploadOne = async (
    file: File,
    kind: "image" | "video"
  ): Promise<string | null> => {
    try {
      return kind === "image" ? await uploadImage(file, token) : await uploadVideo(file, token);
    } catch (err: any) {
      const msg = err.message || "上传失败";
      if (msg.includes("R2 存储未配置") || msg.includes("缺少 R2")) {
        setError("未配置云端存储 R2；若您拥有自有图床，可直接点击下方「添加图床外链」粘贴图片 URL。");
      } else {
        setError(msg);
      }
      return null;
    }
  };

  const createLivePhotoPair = async (imageFile: File, videoFile: File) => {
    const [image, video] = await Promise.all([
      uploadDirect(imageFile, token, "image"),
      uploadDirect(videoFile, token, "video"),
    ]);
    const response = await fetch(`${API_URL}/media/live-photo`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ imageMediaId: image.id, videoMediaId: video.id }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || "实况图配对失败");
    }
    return response.json() as Promise<{ image: string; video: string; isLivePhoto: boolean }>;
  };

  // 浏览器本地拆分 JPEG 内嵌 MP4 后分别直传 R2，避免 Vercel 函数处理大文件。
  const uploadMotionPhoto = async (
    file: File
  ): Promise<{ image: string; video: string | null; isLivePhoto: boolean } | null> => {
    const parts = await splitMotionPhoto(file);
    if (!parts) {
      const image = await uploadOne(file, "image");
      return image ? { image, video: null, isLivePhoto: false } : null;
    }
    const baseName = file.name.replace(/\.[^.]+$/, "");
    const imageFile = new File([parts.image], `${baseName}.jpg`, { type: "image/jpeg" });
    const videoFile = new File([parts.video], `${baseName}.mp4`, { type: "video/mp4" });
    const result = await createLivePhotoPair(imageFile, videoFile);
    return result;
  };

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError("");
    try {
      const fileArr = Array.from(files);

      // 实况图模式 + 单个图片文件 → 尝试动态照片提取
      if (uploadMode === "live" && fileArr.length === 1 && fileArr[0].type.startsWith("image/")) {
        const result = await uploadMotionPhoto(fileArr[0]);
        if (result) {
          if (result.isLivePhoto && result.video) {
            const videoUrl: string = result.video;
            setImages((prev) => [...prev, { src: result.image, video: videoUrl }].slice(0, 9));
          } else {
            // 无嵌入视频，降级为普通图片
            setImages((prev) => [...prev, result.image].slice(0, 9));
            setError("未检测到嵌入视频，已作为普通图片上传。如需实况图，请同时选择配对的图片和视频文件");
          }
        }
        return;
      }

      // 按文件名（去扩展名）分组配对实况图
      const groups = new Map<string, { image?: File; video?: File }>();
      for (const file of fileArr) {
        const baseName = file.name.replace(/\.[^.]+$/, "");
        if (!groups.has(baseName)) groups.set(baseName, {});
        const g = groups.get(baseName)!;
        if (file.type.startsWith("image/")) g.image = file;
        else if (file.type.startsWith("video/")) g.video = file;
      }

      // 如果按文件名未能配对，回退到按选择顺序配对
      const pairedGroups = Array.from(groups.values());
      const hasAnyPair = pairedGroups.some((g) => g.image && g.video);
      if (!hasAnyPair && uploadMode === "live") {
        const imageFiles = fileArr.filter((f) => f.type.startsWith("image/"));
        const videoFiles = fileArr.filter((f) => f.type.startsWith("video/"));
        if (imageFiles.length > 0 && videoFiles.length > 0) {
          // 按顺序配对
          imageFiles.forEach((img, i) => {
            if (videoFiles[i]) {
              groups.set(`__fallback_${i}`, { image: img, video: videoFiles[i] });
            }
          });
        }
      }

      const newImages: PostImage[] = [];
      for (const [, g] of groups) {
        if (images.length + newImages.length >= 9) break;
        if (g.image && g.video) {
          // 实况图：图片和视频先直传 R2，再由后端建立媒体库配对。
          try {
            const pair = await createLivePhotoPair(g.image, g.video);
            newImages.push({ src: pair.image, video: pair.video });
          } catch (err: any) {
            setError(err.message || "实况图上传失败");
          }
        } else if (g.image) {
          const url = await uploadOne(g.image, "image");
          if (url) newImages.push(url);
        } else if (g.video) {
          // 仅视频无配对图片 → 拒绝
          setError("实况图需同时选择图片和视频配对文件");
        }
      }
      if (newImages.length > 0) {
        setImages((prev) => [...prev, ...newImages].slice(0, 9));
      }
    } catch {
      setError("网络错误，上传失败");
    } finally {
      setUploading(false);
    }
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  // 媒体库小胶囊：分页拉取图片列表（初始12张=3排×4列，滚动到底自动加载下一页）
  const PAGE_SIZE = 24;
  useEffect(() => {
    let cancelled = false;
    setMediaLoading(true);
    setMediaPage(1);
    fetch(`${API_URL}/media?category=image&page=1&limit=${PAGE_SIZE}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : { data: [] }))
      .then((data) => {
        if (!cancelled) {
          setMediaItems(data.data || []);
          setMediaHasMore(data.pagination?.hasMore || false);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setMediaLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  // 加载更多媒体图片
  const loadMoreMedia = useCallback(() => {
    if (loadingMore || !mediaHasMore) return;
    setLoadingMore(true);
    const nextPage = mediaPage + 1;
    fetch(`${API_URL}/media?category=image&page=${nextPage}&limit=${PAGE_SIZE}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : { data: [] }))
      .then((data) => {
        const newItems = data.data || [];
        if (newItems.length > 0) {
          setMediaItems((prev) => [...prev, ...newItems]);
          setMediaHasMore(data.pagination?.hasMore || false);
          setMediaPage(nextPage);
        } else {
          setMediaHasMore(false);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingMore(false));
  }, [loadingMore, mediaHasMore, mediaPage, token]);

  // IntersectionObserver：横向滚动接近末尾时自动加载下一页
  useEffect(() => {
    const sentinel = mediaSentinelRef.current;
    const container = sentinel?.parentElement;
    if (!sentinel || !container) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMoreMedia();
        }
      },
      { root: container, rootMargin: '0px 80px 0px 0px' }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMoreMedia, showMediaPicker]);

  const handleUploadAudio = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    setUploadingAudio(true);
    setError("");
    try {
      const url = await uploadAudio(file, token);
      setUploadedAudioUrl(url);
      setUploadedAudioName(file.name);
      // 自动填充歌名（若用户未填）
      if (!customMusicName) setCustomMusicName(file.name.replace(/\.[^.]+$/, ""));
    } catch (err: any) {
      setError(err.message || "上传失败");
    } finally {
      setUploadingAudio(false);
    }
  };

  const handleUploadCover = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    setUploadingCover(true);
    setError("");
    try {
      const url = await uploadImage(file, token);
      setCustomMusicCover(url);
    } catch (e: any) {
      setError(e.message || "封面上传失败");
    } finally {
      setUploadingCover(false);
    }
  };

  const handleConfirmUploadMusic = () => {
    const url = uploadedAudioUrl;
    if (!url) {
      setError("请上传 R2 音频文件");
      return;
    }
    setMusic({
      name: customMusicName || "未知歌曲",
      artist: customMusicArtist || "未知艺术家",
      cover: customMusicCover,
      url,
      source: "upload",
      lrc: customMusicLrc || undefined,
    });
    setShowMusicPanel(false);
  };

  // content 现为 HTML，需提取纯文本判断是否为空（<p><br></p> 应视为空，但 img 表情不算空）
  const isContentEmpty = (html: string) => {
    if (!html.trim()) return true;
    if (typeof document === "undefined") return false;
    const div = document.createElement("div");
    div.innerHTML = html;
    if (div.textContent?.trim()) return false;
    if (div.querySelector("img")) return false;
    return true;
  };

  // 获取链接卡片预览
  const handleFetchLinkCard = async (url: string) => {
    setLinkCardLoading(true);
    setError("");
    try {
      const res = await fetch(
        `${API_URL}/url-preview?url=${encodeURIComponent(url)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const data = await res.json();
        setLinkCard(data);
      } else {
        const err = await res.json().catch(() => ({ message: "获取链接信息失败" }));
        setError(err.message || "获取链接信息失败");
      }
    } catch {
      setError("网络错误，获取链接信息失败");
    } finally {
      setLinkCardLoading(false);
    }
  };

  // 短视频解析：调后端 /api/video/parse。overrideUrl 用于粘贴时自动解析
  const handleParseVideo = async (overrideUrl?: string) => {
    const input = overrideUrl || parseUrl.trim();
    if (!input) return;
    setParsing(true);
    setError("");
    try {
      // 智能提取 URL：用户可能粘贴整段抖音分享文本（含前缀噪声+链接+尾部提示）
      const urlMatch = input.match(/https?:\/\/[^\s，。！]+/i);
      const url = urlMatch ? urlMatch[0] : input;
      const res = await fetch(`${API_URL}/video/parse`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ url }),
      });
      if (res.ok) {
        const data = await res.json();
        setVideo({ ...data, source: "parse" });
      } else {
        const err = await res.json().catch(() => ({ message: "解析失败" }));
        setError(err.message || "解析失败");
      }
    } catch {
      setError("网络错误，解析失败");
    } finally {
      setParsing(false);
    }
  };

  // 短视频上传：复用 uploadOne(file, "video")
  const handleVideoUpload = async (file: File) => {
    setVideoUploading(true);
    setError("");
    try {
      const url = await uploadOne(file, "video");
      if (url) {
        setVideo({ url, source: "upload", platform: "upload" });
      }
    } finally {
      setVideoUploading(false);
    }
  };

  // 本地草稿恢复（仅在新建模式下有效）
  useEffect(() => {
    if (isEdit || typeof window === "undefined") return;
    try {
      const saved = localStorage.getItem("moment_publish_draft");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && (parsed.content || (Array.isArray(parsed.images) && parsed.images.length > 0))) {
          if (parsed.content) setContent(parsed.content);
          if (Array.isArray(parsed.images) && parsed.images.length > 0) setImages(parsed.images);
          if (parsed.category && (!defaultCategory || defaultCategory === "all")) setCategory(parsed.category);
          if (parsed.location) setLocation(parsed.location);
          if (parsed.music) setMusic(parsed.music);
          if (parsed.linkCard) setLinkCard(parsed.linkCard);
          if (parsed.video) {
            setVideo(parsed.video);
            setUploadMode("video");
          }
          if (parsed.douban) setDouban(parsed.douban);
          if (parsed.updatedAt) {
            const date = new Date(parsed.updatedAt);
            setDraftSavedTime(`${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`);
          }
          setHasRestoredDraft(true);
        }
      }
    } catch {
      // ignore
    }
  }, [isEdit, defaultCategory]);

  // 本地草稿自动保存（节流 800ms，仅在新建且有内容时保存）
  useEffect(() => {
    if (isEdit || typeof window === "undefined") return;
    const timer = setTimeout(() => {
      try {
        if (!isContentEmpty(content) || images.length > 0 || video || music || linkCard || douban) {
          localStorage.setItem(
            "moment_publish_draft",
            JSON.stringify({
              content,
              category,
              images,
              location,
              music,
              linkCard,
              video,
              douban,
              updatedAt: Date.now(),
            })
          );
        }
      } catch {
        // ignore
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [content, category, images, location, music, linkCard, video, douban, isEdit]);

  const fetchDrafts = useCallback(async () => {
    if (!token) return;
    setDraftListLoading(true);
    try {
      const res = await fetch(`${API_URL}/admin/posts?type=moment&status=draft&limit=50`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const items = (data.data || []).filter((p: any) => p.type !== "article" && p.type !== "project");
        setDraftList(items);
        setDraftCount(items.length);
      }
    } catch {
      // ignore
    } finally {
      setDraftListLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchDrafts();
  }, [fetchDrafts]);

  const handleLoadDraft = async (draft: Post) => {
    let fullDraft = draft;
    try {
      const res = await fetch(`${API_URL}/posts/${draft.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        fullDraft = await res.json();
      }
    } catch {
      // fallback to draft
    }
    setActivePostId(fullDraft.id);
    setActivePostStatus("draft");
    setContent(fullDraft.content || "");
    setCategory(fullDraft.category || "日常");
    setImages(Array.isArray(fullDraft.images) ? fullDraft.images : []);
    setLocation(fullDraft.location || null);
    setMusic(fullDraft.music || null);
    setLinkCard(fullDraft.linkCard || null);
    if (fullDraft.video) {
      setVideo(fullDraft.video);
      setUploadMode("video");
    } else {
      setVideo(null);
      setUploadMode("normal");
    }
    setDouban(fullDraft.douban || null);
    setLikesDisabled(!!fullDraft.likesDisabled);
    setCommentsDisabled(!!fullDraft.commentsDisabled);
    if (fullDraft.createdAt) {
      setPublishTime(toDateTimeLocal(fullDraft.createdAt));
    }
    setShowDraftBox(false);
    setSaveSuccessMsg("已载入草稿，可继续编辑或直接发布");
    setTimeout(() => setSaveSuccessMsg(""), 3000);
  };

  const handleDeleteDraft = async (draftId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("确定删除这条草稿吗？")) return;
    try {
      const res = await fetch(`${API_URL}/posts/${draftId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setDraftList((prev) => prev.filter((d) => d.id !== draftId));
        setDraftCount((prev) => Math.max(0, prev - 1));
        if (activePostId === draftId) {
          setActivePostId(null);
          setActivePostStatus("published");
          setContent("");
          setImages([]);
          setLocation(null);
          setMusic(null);
          setLinkCard(null);
          setVideo(null);
          setDouban(null);
        }
        notifyContentUpdated();
      } else {
        alert("删除草稿失败");
      }
    } catch {
      alert("删除草稿失败，网络错误");
    }
  };

  const handleClearDraft = () => {
    setContent("");
    setImages([]);
    setLocation(null);
    setMusic(null);
    setLinkCard(null);
    setVideo(null);
    setDouban(null);
    setUploadMode("normal");
    setCategory(defaultCategory && defaultCategory !== "all" ? defaultCategory : "日常");
    setHasRestoredDraft(false);
    setActivePostId(null);
    setActivePostStatus("published");
    if (typeof window !== "undefined") {
      localStorage.removeItem("moment_publish_draft");
    }
  };

  const handleSubmit = async (targetStatus: "published" | "draft" = "published") => {
    if (!hasPublishableContent) return;
    setSubmitting(true);
    setSavingTarget(targetStatus);
    setError("");
    setSaveSuccessMsg("");
    try {
      const isUpdating = !!activePostId;
      const url = isUpdating ? `${API_URL}/posts/${activePostId}` : `${API_URL}/posts`;
      const method = isUpdating ? "PUT" : "POST";
      const fallbackCat = defaultCategory && defaultCategory !== "all" ? defaultCategory : "日常";
      const payload: Record<string, any> = isUpdating
        ? {
            category: category.trim() || fallbackCat,
            content: isContentEmpty(content) ? "" : content,
            images: uploadMode === "video" ? [] : (images.length > 0 ? images : []),
            location: location || null,
            music: music || null,
            linkCard: linkCard || null,
            video: uploadMode === "video" ? video : null,
            douban: douban || null,
            likesDisabled,
            commentsDisabled,
            status: targetStatus,
            createdAt: toIsoDateString(publishTime),
          }
        : {
            category: category.trim() || fallbackCat,
            content: isContentEmpty(content) ? undefined : content,
            images: uploadMode === "video" ? [] : (images.length > 0 ? images : undefined),
            location: location || undefined,
            music: music || undefined,
            linkCard: linkCard || undefined,
            video: uploadMode === "video" ? video || undefined : undefined,
            douban: douban || undefined,
            likesDisabled,
            commentsDisabled,
            status: targetStatus,
            createdAt: toIsoDateString(publishTime),
          };
      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        if (typeof window !== "undefined") {
          localStorage.removeItem("moment_publish_draft");
        }
        const resData = await res.json().catch(() => ({}));
        notifyContentUpdated();
        onPublished();
        fetchDrafts();

        if (targetStatus === "draft") {
          if (resData?.id) {
            setActivePostId(resData.id);
            setActivePostStatus("draft");
          }
          setSaveSuccessMsg("草稿已安全保存至草稿箱！");
          setTimeout(() => setSaveSuccessMsg(""), 3500);
        } else {
          handleClose();
        }
      } else if (res.status === 401) {
        localStorage.removeItem("admin_token");
        localStorage.removeItem("admin_nickname");
        setError("登录已失效，请重新登录");
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      } else {
        const err = await res.json().catch(() => ({}));
        setError(err.message || `${targetStatus === "draft" ? "保存草稿" : isUpdating ? "保存" : "发表"}失败 (${res.status})`);
      }
    } catch {
      setError("网络错误，操作失败");
    } finally {
      setSubmitting(false);
      setSavingTarget(null);
    }
  };

  const handleCancel = () => {
    if (activePostId) {
      // 当前内容已在草稿箱安全持久化，直接退出
      handleClose();
      return;
    }
    if (!isEdit && hasPublishableContent) {
      const confirmExit = window.confirm(
        "确定退出编辑吗？\n\n- 点击「确定」：确认退出（未发表内容将被清空）\n- 点击「取消」：留在当前页面继续编辑\n\n提示：若想保留内容以便后续发布，可直接点击右上角「存草稿」按钮。"
      );
      if (!confirmExit) {
        return;
      }
      if (typeof window !== "undefined") {
        localStorage.removeItem("moment_publish_draft");
      }
    }
    handleClose();
  };

  const activeImages = uploadMode === "video" ? [] : images;
  const activeVideo = uploadMode === "video" ? video : null;
  const hasActiveMedia = activeImages.length > 0 || !!activeVideo;
  const hasPublishableContent = !isContentEmpty(content) || hasActiveMedia || !!music || !!linkCard || !!douban;
  const imgCount = images.length;
  const audioBase = API_URL.replace("/api", "");
  const { closing, handleClose } = useExitAnimation(onClose, 250);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div data-modal="overlay" className={`fixed inset-0 z-[100] flex items-end justify-center bg-black/40 p-0 md:items-center md:p-4 ${closing ? "animate-overlay-out" : "animate-overlay-in"}`} onPointerDown={(e) => { if (e.target === e.currentTarget) handleCancel(); }}>
      <div className={`relative flex h-full w-full flex-col bg-wechat-white md:h-auto md:min-h-[560px] md:max-h-[90vh] md:max-w-[680px] md:overflow-hidden md:rounded-2xl md:shadow-xl dark:bg-[#232328] ${closing ? "animate-sheet-down md:animate-modal-out" : "animate-sheet-up md:animate-modal-in"}`} onClick={(e) => e.stopPropagation()}>
      {/* Header */}
      <div className="sticky top-0 z-10 relative flex items-center justify-between border-b border-wechat-border bg-wechat-white px-4 py-3 rounded-t-2xl dark:bg-[#232328] dark:border-white/10">
        <button
          onClick={handleCancel}
          className="text-sm font-medium text-wechat-text transition-colors hover:opacity-70 dark:text-gray-200 cursor-pointer"
        >
          取消
        </button>

        <div className="flex items-center gap-1.5">
          {activePostStatus === "draft" && (
            <span className="rounded bg-amber-100 dark:bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300 border border-amber-300/40">
              当前为草稿
            </span>
          )}
          {hasRestoredDraft && (
            <span className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">
              已载入未发表草稿
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* 草稿箱按钮 */}
          <button
            type="button"
            onClick={() => {
              setShowDraftBox(!showDraftBox);
              if (!showDraftBox) fetchDrafts();
            }}
            className={`relative inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs sm:text-sm font-medium transition-colors cursor-pointer ${
              showDraftBox
                ? "border-amber-500 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                : "border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-white/10"
            }`}
            title="查看与载入历史草稿"
          >
            <FolderOpen className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
            <span>草稿箱</span>
            {draftCount > 0 && (
              <span className="rounded-full bg-amber-500 px-1.5 py-0.2 text-[10px] font-bold text-white leading-tight">
                {draftCount}
              </span>
            )}
          </button>

          {/* 存草稿按钮 */}
          <button
            onClick={() => handleSubmit("draft")}
            disabled={submitting || !hasPublishableContent}
            className="rounded-md border border-neutral-300 dark:border-neutral-700 px-3 py-1.5 text-xs sm:text-sm font-medium transition-colors text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            {submitting && savingTarget === "draft" ? "保存中..." : "存草稿"}
          </button>

          {/* 发表 / 保存按钮 */}
          <button
            onClick={() => handleSubmit("published")}
            disabled={submitting || !hasPublishableContent}
            className="rounded-md px-3.5 py-1.5 text-xs sm:text-sm font-medium transition-colors disabled:bg-wechat-bubble disabled:text-wechat-time enabled:bg-green-500 enabled:text-white enabled:hover:bg-green-600 dark:disabled:bg-white/5 dark:disabled:text-gray-500 cursor-pointer"
          >
            {submitting && savingTarget === "published"
              ? (activePostId ? "保存中..." : "发表中...")
              : activePostId
              ? (activePostStatus === "draft" ? "发布此草稿" : "保存")
              : "发表"}
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-4 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        {/* 操作成功即时反馈条 */}
        {saveSuccessMsg && (
          <div className="mb-3 flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-50/90 dark:bg-emerald-950/40 px-3.5 py-2.5 text-xs text-emerald-800 dark:text-emerald-200 animate-fade-in">
            <span className="font-medium">✅ {saveSuccessMsg}</span>
            <button
              type="button"
              onClick={() => setSaveSuccessMsg("")}
              className="text-emerald-700 dark:text-emerald-300 hover:opacity-75 cursor-pointer ml-2"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* 动态草稿箱面板 */}
        {showDraftBox && (
          <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-50/60 dark:bg-amber-950/20 p-3.5 animate-fade-in">
            <div className="flex items-center justify-between pb-2 border-b border-amber-500/20">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-800 dark:text-amber-200">
                <FolderOpen className="h-4 w-4" />
                <span>岁岁念草稿箱 ({draftList.length})</span>
              </div>
              <button
                type="button"
                onClick={() => setShowDraftBox(false)}
                className="text-amber-700 dark:text-amber-300 hover:opacity-75 text-xs cursor-pointer font-medium"
              >
                收起
              </button>
            </div>

            <div className="mt-2.5 max-h-52 overflow-y-auto space-y-2 [scrollbar-width:thin]">
              {draftListLoading ? (
                <div className="py-4 text-center text-xs text-amber-700 dark:text-amber-300">
                  正在加载草稿...
                </div>
              ) : draftList.length === 0 ? (
                <div className="py-4 text-center text-xs text-neutral-500 dark:text-neutral-400">
                  草稿箱空空如也，随时可在编辑时点击「存草稿」暂存。
                </div>
              ) : (
                draftList.map((draft) => (
                  <div
                    key={draft.id}
                    className={`flex items-center justify-between gap-2 rounded-lg border p-2.5 text-xs transition ${
                      activePostId === draft.id
                        ? "border-amber-500 bg-amber-100/60 dark:bg-amber-900/30"
                        : "border-neutral-200/80 bg-white dark:border-white/10 dark:bg-neutral-800/80 hover:border-amber-400"
                    }`}
                  >
                    <div className="min-w-0 flex-1 cursor-pointer" onClick={() => handleLoadDraft(draft)}>
                      <p className="line-clamp-2 font-medium text-neutral-800 dark:text-neutral-200">
                        {draft.content ? draft.content.replace(/<[^>]*>/g, "").trim() || "包含多媒体内容的动态" : "无文本内容"}
                      </p>
                      <div className="mt-1 flex items-center gap-2 text-[10px] text-neutral-400">
                        <span>保存于 {formatExactDateTime(draft.createdAt)}</span>
                        {draft.category && (
                          <span className="rounded bg-neutral-100 dark:bg-neutral-700 px-1 py-0.2">
                            #{draft.category}
                          </span>
                        )}
                        {Array.isArray(draft.images) && draft.images.length > 0 && (
                          <span>{draft.images.length} 张图片</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleLoadDraft(draft)}
                        className="rounded-md bg-amber-500 text-white dark:bg-amber-600 px-2.5 py-1 text-[11px] font-medium hover:opacity-90 transition cursor-pointer"
                      >
                        {activePostId === draft.id ? "编辑中" : "载入"}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteDraft(draft.id, e)}
                        className="rounded p-1 text-neutral-400 hover:text-rose-600 dark:hover:text-rose-400 transition cursor-pointer"
                        title="删除草稿"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
        {/* 本地草稿恢复提示横幅 */}
        {hasRestoredDraft && (
          <div className="mb-3 flex items-center justify-between rounded-xl border border-amber-500/30 bg-amber-50/70 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
            <span>📝 已自动恢复上次未发布的草稿内容{draftSavedTime ? ` (${draftSavedTime})` : ""}</span>
            <button
              type="button"
              onClick={handleClearDraft}
              className="text-amber-600 dark:text-amber-400 hover:underline font-medium cursor-pointer"
            >
              清空草稿
            </button>
          </div>
        )}

        <div className="mb-3 flex items-center justify-between rounded-xl border border-dashed border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/20 px-3 py-2 text-xs text-neutral-600 dark:text-neutral-400">
          <span>发布深度长文或开源项目？</span>
          <div className="flex items-center gap-2 font-medium">
            <Link
              href="/admin/articles/new"
              onClick={handleClose}
              className="text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
            >
              写文章 →
            </Link>
            <span>·</span>
            <Link
              href="/admin/projects/new"
              onClick={handleClose}
              className="text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
            >
              新建项目 →
            </Link>
          </div>
        </div>

        {/* Rich text editor - WeChat official account style */}
        <RichTextEditor
          value={content}
          onChange={setContent}
          placeholder="这一刻的想法（朋友圈 / 岁岁念动态）..."
          minHeight={200}
          onLinkCard={handleFetchLinkCard}
          linkCardLoading={linkCardLoading}
          hasLinkCard={!!linkCard}
          onDouban={() => setShowDoubanPicker(true)}
        />

        {/* 分类快捷药丸（仅属于动态/朋友圈维度的标签，与文章、项目严格分离） */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-wechat-time text-[11px]">归类：</span>
          {["日常", "岁岁念", "随想", "随手拍", "摄影", "生活"].map((cat) => (

            <button
              key={cat}
              type="button"
              onClick={() => setCategory(category === cat ? "" : cat)}
              className={`rounded-full px-2.5 py-0.5 transition-all text-xs font-medium cursor-pointer ${
                category === cat
                  ? "bg-wechat-text text-wechat-white dark:bg-white dark:text-neutral-900"
                  : "bg-wechat-bubble text-wechat-time hover:bg-wechat-hover dark:bg-white/5 dark:text-gray-400"
              }`}
            >
              #{cat}
            </button>
          ))}
          <input
            type="text"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="自定义标签"
            className="w-20 rounded-full border border-wechat-border/70 dark:border-white/10 bg-transparent px-2 py-0.5 text-xs text-wechat-text dark:text-gray-200 focus:outline-hidden placeholder:text-wechat-time"
          />
        </div>

        {/* Image grid - 微信风格 3 列网格 */}
        {/* 上传模式切换：普通图片 / 实况图 / 短视频（视频独占，不可与图片共存） */}
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setUploadMode("normal");
            }}
            className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs transition-colors ${
              uploadMode === "normal"
                ? "bg-green-500 text-white"
                : "bg-wechat-bubble text-wechat-time dark:bg-white/5 dark:text-gray-400"
            }`}
          >
            <ImagePlus className="h-3.5 w-3.5" />
            普通图片
          </button>
          <button
            type="button"
            onClick={() => {
              setUploadMode("live");
            }}
            className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs transition-colors ${
              uploadMode === "live"
                ? "bg-green-500 text-white"
                : "bg-wechat-bubble text-wechat-time dark:bg-white/5 dark:text-gray-400"
            }`}
          >
            <Film className="h-3.5 w-3.5" />
            实况图
          </button>
          <button
            type="button"
            onClick={() => {
              setUploadMode("video");
            }}
            className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs transition-colors ${
              uploadMode === "video"
                ? "bg-green-500 text-white"
                : "bg-wechat-bubble text-wechat-time dark:bg-white/5 dark:text-gray-400"
            }`}
          >
            <Video className="h-3.5 w-3.5" />
            短视频
          </button>
        </div>

        {uploadMode === "live" && (
          <div className="mt-1.5 space-y-1 text-[11px] leading-relaxed text-wechat-time">
            <p>
              <strong className="text-wechat-text">单文件上传（推荐安卓）：</strong>
              直接选择一张实况图，系统自动提取内嵌视频。OPPO/小米/三星等安卓手机拍摄的动态照片可直接上传。
            </p>
            <p>
              <strong className="text-wechat-text">配对上传（iOS/手动）：</strong>
              同时选择图片(JPEG)和视频(MP4/MOV)，按文件名自动配对。iOS 需先导出为独立文件。
            </p>
          </div>
        )}

        {uploadMode !== "video" && (
        <>
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          {images.map((img, i) => {
            const src = getImageSrc(img);
            const live = isLivePhoto(img);
            return (
            <div
              key={i}
              className="group relative aspect-square overflow-hidden rounded bg-wechat-bubble dark:bg-white/5"
            >
              <LazyImage
                src={typeof src === "string" && src.startsWith("http")
                  ? src
                  : `${audioBase}${src}`}
                alt={`图片 ${i + 1}`}
                className="h-full w-full object-cover"
              />
              {live && (
                <span className="absolute left-1 top-1 rounded bg-black/60 px-1 py-0.5 text-[10px] font-medium text-white">
                  实况
                </span>
              )}
              <button
                onClick={() => removeImage(i)}
                className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-white transition-opacity md:opacity-0 md:group-hover:opacity-100"
                aria-label="删除图片"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
            );
          })}

          {/* Upload button (if < 9 images) */}
          {images.length < 9 && (
            <>
            <label className="flex aspect-square cursor-pointer items-center justify-center rounded border border-wechat-border bg-wechat-bubble transition-colors active:bg-wechat-hover dark:border-white/10 dark:bg-white/5">
              <input
                type="file"
                accept={
                  uploadMode === "live"
                    ? "image/jpeg,image/jpg,image/png,image/webp,video/mp4,video/quicktime,video/3gpp,video/3gp"
                    : "image/jpeg,image/jpg,image/png,image/gif,image/webp"
                }
                multiple
                className="hidden"
                onChange={(e) => {
                  handleUpload(e.target.files);
                  e.target.value = "";
                }}
              />
              {uploading ? (
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-wechat-time border-t-wechat-nickname" />
              ) : uploadMode === "live" ? (
                <Film className="h-7 w-7 text-wechat-time" />
              ) : (
                <ImagePlus className="h-7 w-7 text-wechat-time" />
              )}
            </label>
            </>
          )}
        </div>

        {imgCount > 0 && (
          <p className="mt-2 text-xs text-wechat-time">
            {imgCount}/9 张图片
          </p>
        )}

        {/* 从媒体库选择与图床外链快捷导入 */}
        {uploadMode === "normal" && images.length < 9 && (
          <div className="mt-3 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowExternalUrlInput(!showExternalUrlInput)}
                className={`flex items-center gap-1 rounded-full border border-wechat-border bg-wechat-bubble px-3 py-1 text-xs text-wechat-time transition-colors hover:bg-wechat-hover dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10 ${
                  showExternalUrlInput ? "text-wechat-text dark:text-white font-medium" : ""
                }`}
              >
                <Link2 className="h-3.5 w-3.5" />
                添加图床外链
              </button>

              {(mediaLoading || mediaItems.length > 0) && (
                <button
                  type="button"
                  onClick={() => {
                    if (!showMediaPicker) {
                      // 展开：先显示容器（骨架），延迟 200ms 再渲染图片，避免动画+渲染同时进行导致卡顿
                      setShowMediaPicker(true);
                      setMediaRendered(false);
                      setTimeout(() => setMediaRendered(true), 200);
                    } else {
                      // 收起：立即隐藏
                      setMediaRendered(false);
                      setShowMediaPicker(false);
                    }
                  }}
                  className={`flex items-center gap-1 rounded-full border border-wechat-border bg-wechat-bubble px-3 py-1 text-xs text-wechat-time transition-colors hover:bg-wechat-hover dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10 ${
                    showMediaPicker ? "text-wechat-text" : ""
                  }`}
                >
                  <Library className="h-3.5 w-3.5" />
                  从媒体库导入
                </button>
              )}
            </div>

            {showExternalUrlInput && (
              <div className="flex items-center gap-2 rounded-xl border border-wechat-border bg-wechat-bubble/60 p-2 dark:border-white/10 dark:bg-white/5">
                <input
                  type="text"
                  value={externalImageUrl}
                  onChange={(e) => setExternalImageUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddExternalImage();
                    }
                  }}
                  placeholder="粘贴自有图床图片 URL（支持以空格或换行分隔多张）..."
                  className="flex-1 bg-transparent px-2 py-1 text-xs text-wechat-text placeholder:text-wechat-time focus:outline-none dark:text-gray-200"
                />
                <button
                  type="button"
                  onClick={handleAddExternalImage}
                  disabled={!externalImageUrl.trim()}
                  className="rounded-lg bg-green-500 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-green-600 disabled:opacity-40"
                >
                  添加
                </button>
                <button
                  type="button"
                  onClick={() => setShowExternalUrlInput(false)}
                  className="p-1 text-xs text-wechat-time hover:text-wechat-text"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        )}
        {uploadMode === "normal" && images.length < 9 && (mediaLoading || mediaItems.length > 0) && (
          <div className="mt-1">
            {showMediaPicker && (
              <div className="animate-emoji-fade-in mt-2">
                {!mediaRendered || mediaLoading ? (
                  <div className="grid grid-rows-3 grid-flow-col gap-0.5 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                    {Array.from({ length: 9 }).map((_, i) => (
                      <div
                        key={i}
                        className="h-10 w-10 shrink-0 animate-pulse rounded bg-wechat-bubble dark:bg-white/5"
                      />
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-rows-3 grid-flow-col gap-0.5 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                    {mediaItems.map((item) => {
                      const fullUrl = toAbsoluteUrl(item.url);
                      const isSelected = images.some((img) => {
                        const imgSrc = typeof img === "string" ? img : img.src;
                        return imgSrc === item.url || imgSrc === fullUrl || toAbsoluteUrl(imgSrc) === fullUrl;
                      });
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            if (isSelected || images.length >= 9) return;
                            setImages((prev) => [...prev, item.url]);
                          }}
                          disabled={isSelected || images.length >= 9}
                          title={item.filename}
                          className={`relative h-10 w-10 shrink-0 overflow-hidden rounded transition-all ${
                            isSelected
                              ? "cursor-default opacity-40"
                              : "cursor-pointer hover:opacity-80 active:scale-95"
                          }`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={fullUrl}
                            alt=""
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                          {isSelected && (
                            <span className="absolute inset-0 flex items-center justify-center bg-black/30">
                              <Check className="h-3.5 w-3.5 text-white" />
                            </span>
                          )}
                        </button>
                      );
                    })}
                    {/* 哨兵元素：横向滚动接近末尾时触发加载下一页 */}
                    {mediaHasMore && (
                      <div ref={mediaSentinelRef} className="flex row-span-3 w-10 shrink-0 items-center justify-center">
                        {loadingMore ? (
                          <div className="h-10 w-10 shrink-0 animate-pulse rounded bg-wechat-bubble dark:bg-white/5" />
                        ) : null}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        </>
        )}

        {/* 短视频面板 */}
        {uploadMode === "video" && (
          <div className="mt-2 space-y-2">
            {/* 子 Tab 切换 */}
            <div className="flex flex-wrap items-center gap-2">
              {(["parse", "upload", "url", "embed"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setVideoTab(tab)}
                  className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs transition-colors ${
                    videoTab === tab
                      ? "bg-green-500 text-white"
                      : "bg-wechat-bubble text-wechat-time dark:bg-white/5 dark:text-gray-400"
                  }`}
                >
                  {tab === "parse" && "解析链接"}
                  {tab === "upload" && "上传文件"}
                  {tab === "url" && "视频直链"}
                  {tab === "embed" && "B站嵌入"}
                </button>
              ))}
            </div>

            {/* 解析链接 */}
            {videoTab === "parse" && !video && (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={parseUrl}
                  onChange={(e) => setParseUrl(e.target.value)}
                  onPaste={(e) => {
                    // 粘贴分享文本时自动提取URL并解析
                    const text = e.clipboardData.getData("text");
                    const urlMatch = text.match(/https?:\/\/[^\s，。！]+/i);
                    if (urlMatch && urlMatch[0] !== text.trim()) {
                      e.preventDefault();
                      setParseUrl(urlMatch[0]);
                      handleParseVideo(urlMatch[0]);
                    }
                  }}
                  placeholder="粘贴抖音/快手/小红书/微博链接或分享文本"
                  className="flex-1 rounded-md border border-black/5 bg-wechat-bubble px-3 py-1.5 text-sm text-wechat-text outline-none placeholder:text-wechat-time dark:border-white/5 dark:bg-white/5 dark:text-gray-200"
                  onKeyDown={(e) => e.key === "Enter" && handleParseVideo()}
                />
                <button
                  type="button"
                  onClick={() => handleParseVideo()}
                  disabled={!parseUrl.trim() || parsing}
                  className="rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:bg-wechat-bubble disabled:text-wechat-time enabled:bg-green-500 enabled:text-white enabled:hover:bg-green-600 dark:disabled:bg-white/5 dark:disabled:text-gray-500"
                >
                  {parsing ? "解析中" : "解析"}
                </button>
              </div>
            )}

            {/* 上传文件 */}
            {videoTab === "upload" && !video && (
              <div className="space-y-2">
                <label className="flex h-24 cursor-pointer items-center justify-center rounded-md border border-dashed border-black/5 bg-wechat-bubble transition-colors active:bg-wechat-hover dark:border-white/5 dark:bg-white/5">
                  <input
                    type="file"
                    accept="video/mp4,video/quicktime,video/webm"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleVideoUpload(f);
                      e.target.value = "";
                    }}
                  />
                  {videoUploading ? (
                    <div className="flex items-center gap-2 text-xs text-wechat-time">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-wechat-time border-t-wechat-nickname" />
                      上传中...
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-1 text-xs text-wechat-time">
                      <Video className="h-6 w-6" />
                      点击上传视频（MP4/MOV/WEBM，≤50MB）
                    </div>
                  )}
                </label>
                <button
                  type="button"
                  onClick={() => setMediaPickerMode("video")}
                  className="flex w-full items-center justify-center gap-1.5 rounded-md border border-black/5 bg-wechat-bubble py-2 text-xs text-wechat-time transition-colors active:bg-wechat-hover dark:border-white/5 dark:bg-white/5"
                >
                  <Library className="h-3.5 w-3.5" />
                  从媒体库选择
                </button>
                <MediaPicker
                  open={mediaPickerMode === "video"}
                  onClose={() => setMediaPickerMode(null)}
                  category="video"
                  title="从媒体库选择视频"
                  onSelect={(item: PickerMediaItem) => {
                    setVideo({ url: item.url, source: "upload", platform: "upload" } as PostVideo);
                    setMediaPickerMode(null);
                  }}
                />
              </div>
            )}

            {/* 视频直链 */}
            {videoTab === "url" && !video && (
              <div className="space-y-2">
                <input
                  type="text"
                  value={videoDirectUrl}
                  onChange={(e) => setVideoDirectUrl(e.target.value)}
                  placeholder="视频直链地址（https://...）"
                  className="w-full rounded-md border border-black/5 bg-wechat-bubble px-3 py-1.5 text-sm text-wechat-text outline-none placeholder:text-wechat-time dark:border-white/5 dark:bg-white/5 dark:text-gray-200"
                />
                <input
                  type="text"
                  value={videoDirectCover}
                  onChange={(e) => setVideoDirectCover(e.target.value)}
                  placeholder="封面地址（可选）"
                  className="w-full rounded-md border border-black/5 bg-wechat-bubble px-3 py-1.5 text-sm text-wechat-text outline-none placeholder:text-wechat-time dark:border-white/5 dark:bg-white/5 dark:text-gray-200"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (!videoDirectUrl.trim()) return;
                    setVideo({ url: videoDirectUrl.trim(), cover: videoDirectCover.trim() || undefined, source: "url", platform: "url" });
                  }}
                  disabled={!videoDirectUrl.trim()}
                  className="rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:bg-wechat-bubble disabled:text-wechat-time enabled:bg-green-500 enabled:text-white enabled:hover:bg-green-600 dark:disabled:bg-white/5 dark:disabled:text-gray-500"
                >
                  使用
                </button>
              </div>
            )}

            {/* B站嵌入 */}
            {videoTab === "embed" && !video && (
              <div className="space-y-2">
                <textarea
                  value={embedCode}
                  onChange={(e) => setEmbedCode(e.target.value)}
                  placeholder="粘贴 B 站嵌入代码，例如：<iframe src=&quot;//player.bilibili.com/...&quot;>"
                  rows={3}
                  className="w-full resize-none rounded-md border border-black/5 bg-wechat-bubble px-3 py-1.5 text-sm text-wechat-text outline-none placeholder:text-wechat-time dark:border-white/5 dark:bg-white/5 dark:text-gray-200"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (!embedCode.trim()) return;
                    setVideo({ embedCode: embedCode.trim(), source: "embed", platform: "bilibili" });
                  }}
                  disabled={!embedCode.trim()}
                  className="rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:bg-wechat-bubble disabled:text-wechat-time enabled:bg-green-500 enabled:text-white enabled:hover:bg-green-600 dark:disabled:bg-white/5 dark:disabled:text-gray-500"
                >
                  使用
                </button>
              </div>
            )}

            {/* 视频预览区 */}
            {video && (
              <div className="relative flex items-center gap-2 rounded-md bg-wechat-bubble p-2 dark:bg-white/5">
                <div className="h-12 w-16 shrink-0 overflow-hidden rounded bg-black/10 dark:bg-white/10">
                  {toSafeImageUrl(video.cover) ? (
                    <LazyImage
                      src={toAbsoluteUrl(toSafeImageUrl(video.cover) || "")}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <Video className="h-5 w-5 text-wechat-time" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  {video.title && (
                    <p className="truncate text-xs font-medium text-wechat-text">{video.title}</p>
                  )}
                  <p className="truncate text-[11px] text-wechat-time">
                    {video.platform && (
                      <span className="mr-1 rounded bg-white/50 px-1 py-0.5 text-[10px] dark:bg-white/10">
                        {video.platform}
                      </span>
                    )}
                    {video.author || video.source}
                  </p>
                </div>
                <button
                  onClick={() => setVideo(null)}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70"
                  aria-label="移除视频"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* 链接卡片预览 */}
        {linkCard && toSafeHttpUrl(linkCard.url) && (
          <div className="mt-3 relative">
            <div className="flex items-stretch overflow-hidden rounded-[8px] bg-[#f2f2f2] transition-colors hover:bg-[#eaeaea] active:bg-[#e0e0e0] dark:bg-[#2a2a30] dark:hover:bg-[#33333a] dark:active:bg-[#3a3a42]">
              <a
                href={toSafeHttpUrl(linkCard.url) || undefined}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-stretch"
              >
                {/* 左侧方形封面 */}
                <div className="flex h-[72px] w-[72px] shrink-0 items-center justify-center overflow-hidden bg-black/[0.02] dark:bg-white/[0.02]">
                  {toSafeImageUrl(linkCard.image) && (
                    <LazyImage
                      src={toSafeImageUrl(linkCard.image) || ""}
                      alt=""
                      className="h-full w-full object-contain p-1.5"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  )}
                </div>
                {/* 右侧内容区 — 半透明背景，与音乐卡片一致 */}
                <div className="flex min-w-0 flex-1 flex-col justify-center bg-white/35 px-3 dark:bg-white/[0.04]">
                  <p className="line-clamp-1 text-[14px] font-medium leading-[20px] text-black/[0.87] dark:text-white/90">
                    {linkCard.title || toSafeHttpUrl(linkCard.url)}
                  </p>
                  {linkCard.description && (
                    <p className="line-clamp-2 mt-0.5 text-[12px] leading-[15px] text-black/50 dark:text-white/50">
                      {linkCard.description}
                    </p>
                  )}
                </div>
              </a>
            </div>
            <button
              onClick={() => setLinkCard(null)}
              className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80"
              aria-label="移除链接卡片"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}

        {/* Options — 微信朋友圈风格选项行（发布时间、位置、音乐等） */}
        <div className="mt-4 border-t border-black/5 dark:border-white/5">
          {/* Publication Time */}
          <div className="flex items-center justify-between py-3">
            <div className="flex items-center gap-3">
              <Calendar className="h-5 w-5 shrink-0 text-wechat-time" />
              <div className="flex flex-col">
                <span className="text-[15px] text-wechat-text dark:text-gray-200">发布时间</span>
                <span className="text-[11px] text-wechat-time">精确指定动态发布日期与时间</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <input
                type="datetime-local"
                value={publishTime}
                onChange={(e) => setPublishTime(e.target.value)}
                className="rounded-lg border border-black/10 bg-white dark:bg-white/5 dark:border-white/10 px-2 py-1 text-xs text-wechat-text dark:text-gray-200 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setPublishTime(toDateTimeLocal(new Date()))}
                className="rounded-lg border border-black/10 dark:border-white/10 px-2 py-1 text-[11px] text-wechat-time hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer transition-colors"
                title="重置为当前实时时间"
              >
                设为现在
              </button>
            </div>
          </div>

          {/* Location */}
          <div className="flex items-center gap-3 border-t border-black/5 py-3 dark:border-white/5">
            <MapPin className="h-5 w-5 shrink-0 text-wechat-time" />
            {location ? (
              <div className="flex min-w-0 flex-1 items-center justify-between">
                <span className="truncate text-[15px] text-wechat-text dark:text-gray-200">
                  {location.city
                    ? `${location.city} · ${location.name}`
                    : location.name}
                </span>
                <button
                  onClick={() => setLocation(null)}
                  className="ml-2 shrink-0 text-wechat-time hover:text-wechat-text"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowLocationPanel(true)}
                className="flex flex-1 items-center justify-between text-[15px] text-wechat-time hover:text-wechat-text"
              >
                <span>所在位置</span>
                <ChevronRight className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Music */}
          <div className="flex items-center gap-3 border-t border-black/5 py-3 dark:border-white/5">
            <Music className="h-5 w-5 shrink-0 text-wechat-time" />
            {music ? (
              <div className="flex min-w-0 flex-1 items-center gap-2">
                {music.cover && (
                  <LazyImage
                    src={toHttps(typeof music.cover === "string" && music.cover.startsWith("http") ? music.cover : `${audioBase}${music.cover}`)}
                    alt=""
                    className="h-8 w-8 shrink-0 rounded object-cover"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium text-wechat-text dark:text-gray-200">
                    {music.name}
                  </p>
                  <p className="truncate text-xs text-wechat-time">
                    {music.artist}
                  </p>
                </div>
                {music.source === "upload" && (
                  <button
                    onClick={() => {
                      setShowMusicPanel(true);
                    }}
                    className="text-wechat-time hover:text-wechat-text"
                    aria-label="编辑音乐信息"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                )}
                <button
                  onClick={() => setMusic(null)}
                  className="text-wechat-time hover:text-wechat-text"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  setCustomMusicName("");
                  setCustomMusicArtist("");
                  setCustomMusicCover("");
                  setUploadedAudioUrl("");
                  setUploadedAudioName("");
                  setCustomMusicLrc("");
                  setShowLyricEditor(false);
                  setShowMusicPanel(true);
                }}
                className="flex flex-1 items-center justify-between text-[15px] text-wechat-time hover:text-wechat-text"
              >
                <span>添加音乐</span>
                <ChevronRight className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* 豆瓣卡片 — 已选时显示预览，添加入口在工具栏 */}
          {douban && (
            <div className="flex items-center gap-3 border-t border-black/5 py-3 dark:border-white/5">
              <Film className="h-5 w-5 shrink-0 text-wechat-time" />
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <div className="min-w-0 flex-1">
                  <DoubanEmbedCard item={douban} className="mt-0 max-w-none" />
                </div>
                <button
                  onClick={() => setDouban(null)}
                  className="shrink-0 text-wechat-time hover:text-wechat-text"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* 允许点赞 — 微信朋友圈风格开关行 */}
          <div className="flex items-center gap-3 border-t border-black/5 py-3 dark:border-white/5">
            <Heart className="h-5 w-5 shrink-0 text-wechat-time" />
            <span className="flex-1 text-[15px] text-wechat-text dark:text-gray-200">允许点赞</span>
            <button
              type="button"
              role="switch"
              aria-checked={!likesDisabled}
              onClick={() => setLikesDisabled((v) => !v)}
              className={`relative h-[22px] w-[40px] rounded-full transition-colors ${
                likesDisabled ? "bg-black/15 dark:bg-white/20" : "bg-green-500"
              }`}
            >
              <span
                className={`absolute left-[2px] top-[2px] h-[18px] w-[18px] rounded-full bg-white shadow transition-transform ${
                  likesDisabled ? "translate-x-0" : "translate-x-[18px]"
                }`}
              />
            </button>
          </div>

          {/* 允许评论 — 微信朋友圈风格开关行 */}
          <div className="flex items-center gap-3 border-t border-black/5 py-3 dark:border-white/5">
            <MessageSquare className="h-5 w-5 shrink-0 text-wechat-time" />
            <span className="flex-1 text-[15px] text-wechat-text dark:text-gray-200">允许评论</span>
            <button
              type="button"
              role="switch"
              aria-checked={!commentsDisabled}
              onClick={() => setCommentsDisabled((v) => !v)}
              className={`relative h-[22px] w-[40px] rounded-full transition-colors ${
                commentsDisabled ? "bg-black/15 dark:bg-white/20" : "bg-green-500"
              }`}
            >
              <span
                className={`absolute left-[2px] top-[2px] h-[18px] w-[18px] rounded-full bg-white shadow transition-transform ${
                  commentsDisabled ? "translate-x-0" : "translate-x-[18px]"
                }`}
              />
            </button>
          </div>
        </div>

        {error && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-500/10 dark:text-red-400">
            {error}
          </p>
        )}
      </div>

      {/* ===== Music Panel (search + upload) ===== */}
      {showMusicPanel && (
        <div className="absolute inset-0 z-20 flex flex-col overflow-hidden bg-wechat-white animate-modal-in md:rounded-2xl dark:bg-[#232328]">
          {/* Music panel header */}
          <div className="flex items-center justify-between border-b border-black/5 px-4 py-3 dark:border-white/5">
            <button
              onClick={() => setShowMusicPanel(false)}
              className="text-sm text-wechat-time hover:text-wechat-text"
            >
              返回
            </button>
            <span className="text-sm font-medium text-wechat-text dark:text-gray-200">添加音乐</span>
            <span className="w-8" />
          </div>

          <div className="flex-1 overflow-y-auto p-4 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
              <div className="space-y-4">
                {/* 封面 */}
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-wechat-time">
                    歌曲封面（可选）
                  </label>
                  {customMusicCover ? (
                    <div className="relative inline-block">
                      <LazyImage src={customMusicCover} alt="封面预览" className="h-24 w-24 rounded-lg object-cover" />
                      <button
                        type="button"
                        onClick={() => setCustomMusicCover("")}
                        className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
                        aria-label="移除封面"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <label className="block">
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            handleUploadCover(e.target.files);
                            e.target.value = "";
                          }}
                        />
                        <div className="flex h-24 w-24 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-black/5 transition-colors hover:border-green-400 dark:border-white/5">
                          {uploadingCover ? (
                            <div className="h-6 w-6 animate-spin rounded-full border-2 border-wechat-time border-t-green-500" />
                          ) : (
                            <>
                              <ImagePlus className="h-6 w-6 text-wechat-time" />
                              <span className="mt-1 text-[10px] text-wechat-time">封面</span>
                            </>
                          )}
                        </div>
                      </label>
                      <button
                        type="button"
                        onClick={() => setMediaPickerMode("cover")}
                        className="flex h-24 w-24 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-black/5 transition-colors hover:border-green-400 dark:border-white/5"
                      >
                        <Library className="h-6 w-6 text-wechat-time" />
                        <span className="mt-1 text-[10px] text-wechat-time">媒体库</span>
                      </button>
                    </div>
                  )}
                  <MediaPicker
                    open={mediaPickerMode === "cover"}
                    onClose={() => setMediaPickerMode(null)}
                    category="image"
                    title="从媒体库选择封面"
                    onSelect={(item: PickerMediaItem) => {
                      setCustomMusicCover(item.url);
                      setMediaPickerMode(null);
                    }}
                  />
                </div>

                {/* 歌曲名称 */}
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-wechat-time">
                    歌曲名称
                  </label>
                  <input
                    type="text"
                    value={customMusicName}
                    onChange={(e) => setCustomMusicName(e.target.value)}
                    placeholder="歌曲名称"
                    className="w-full rounded-lg border border-black/5 bg-wechat-bubble px-3 py-2 text-sm text-wechat-text placeholder:text-wechat-time focus:outline-none dark:border-white/5 dark:bg-white/5 dark:text-gray-200 dark:placeholder:text-gray-500"
                  />
                </div>

                {/* 艺术家 */}
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-wechat-time">
                    艺术家
                  </label>
                  <input
                    type="text"
                    value={customMusicArtist}
                    onChange={(e) => setCustomMusicArtist(e.target.value)}
                    placeholder="歌手名"
                    className="w-full rounded-lg border border-black/5 bg-wechat-bubble px-3 py-2 text-sm text-wechat-text placeholder:text-wechat-time focus:outline-none dark:border-white/5 dark:bg-white/5 dark:text-gray-200 dark:placeholder:text-gray-500"
                  />
                </div>

                {/* 音频来源：上传文件 / 直链URL 切换 */}
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-wechat-time">R2 音频文件</label>
                  {uploadedAudioUrl ? (
                      <div className="flex items-center justify-between rounded-lg border border-black/5 bg-wechat-bubble px-3 py-2.5 dark:border-white/5 dark:bg-white/5">
                        <div className="flex min-w-0 items-center gap-2">
                          <Music className="h-4 w-4 shrink-0 text-green-500" />
                          <span className="truncate text-sm text-wechat-text dark:text-gray-200">
                            {uploadedAudioName || "音频已上传"}
                          </span>
                        </div>
                        <label className="shrink-0 cursor-pointer text-xs text-green-600 hover:text-green-700 dark:text-green-400">
                          重新上传
                          <input
                            type="file"
                            accept="audio/mpeg,audio/mp3,audio/wav,audio/ogg,audio/aac"
                            className="hidden"
                            onChange={(e) => {
                              handleUploadAudio(e.target.files);
                              e.target.value = "";
                            }}
                          />
                        </label>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <label className="block">
                          <input
                            type="file"
                            accept="audio/mpeg,audio/mp3,audio/wav,audio/ogg,audio/aac"
                            className="hidden"
                            onChange={(e) => {
                              handleUploadAudio(e.target.files);
                              e.target.value = "";
                            }}
                          />
                          <div className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-black/5 py-6 transition-colors hover:border-green-400 dark:border-white/5">
                            {uploadingAudio ? (
                              <div className="h-8 w-8 animate-spin rounded-full border-2 border-wechat-time border-t-green-500" />
                            ) : (
                              <>
                                <Upload className="h-7 w-7 text-wechat-time" />
                                <p className="mt-1.5 text-sm text-wechat-time">
                                  点击上传音乐文件
                                </p>
                                <p className="mt-0.5 text-[11px] text-wechat-time">
                                  支持 MP3/WAV/OGG/AAC，最大 20MB
                                </p>
                              </>
                            )}
                          </div>
                        </label>
                        <button
                          type="button"
                          onClick={() => setMediaPickerMode("audio")}
                          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-black/5 py-2 text-xs text-wechat-time transition-colors hover:border-green-400 dark:border-white/5"
                        >
                          <Library className="h-3.5 w-3.5" />
                          从媒体库选择
                        </button>
                        <MediaPicker
                          open={mediaPickerMode === "audio"}
                          onClose={() => setMediaPickerMode(null)}
                          category="audio"
                          title="从媒体库选择音频"
                          onSelect={(item: PickerMediaItem) => {
                            setUploadedAudioUrl(item.url);
                            setUploadedAudioName(item.filename);
                            if (!customMusicName) setCustomMusicName(item.filename.replace(/\.[^.]+$/, ""));
                            setMediaPickerMode(null);
                          }}
                        />
                      </div>
                    )}
                </div>

                {/* 歌词（可折叠） */}
                <div>
                  <button
                    type="button"
                    onClick={() => setShowLyricEditor((v) => !v)}
                    className="flex w-full items-center justify-between rounded-lg bg-wechat-bubble px-3 py-2 text-xs font-medium text-wechat-time transition-colors hover:bg-wechat-bubble/70 dark:bg-white/5 dark:text-gray-400"
                  >
                    <span className="flex items-center gap-1.5">
                      <Music className="h-3.5 w-3.5" />
                      编辑歌词
                      {customMusicLrc && (
                        <span className="rounded-full bg-green-500/15 px-1.5 py-0.5 text-[10px] text-green-600 dark:text-green-400">
                          已编辑
                        </span>
                      )}
                    </span>
                    <span className="text-[10px]">{showLyricEditor ? "收起" : "展开"}</span>
                  </button>
                  {showLyricEditor && (
                    <div className="mt-2">
                      <LyricEditor
                        audioUrl={uploadedAudioUrl}
                        value={customMusicLrc}
                        onChange={setCustomMusicLrc}
                      />
                    </div>
                  )}
                </div>

                {/* 确认按钮 */}
                <button
                  type="button"
                  onClick={handleConfirmUploadMusic}
                  disabled={!uploadedAudioUrl}
                  className="w-full rounded-lg py-2.5 text-sm font-medium transition-colors disabled:bg-wechat-bubble disabled:text-wechat-time enabled:bg-green-500 enabled:text-white enabled:hover:bg-green-600 dark:disabled:bg-white/5 dark:disabled:text-gray-500"
                >
                  确认使用
                </button>
              </div>
            </div>
        </div>
      )}

      {/* ===== Location Picker (微信式地图选位) ===== */}
      {showLocationPanel && (
        <LocationPicker
          initial={location}
          onSelect={(loc) => {
            setLocation(loc);
            setShowLocationPanel(false);
          }}
          onClose={() => setShowLocationPanel(false)}
        />
      )}

      {/* ===== Douban Picker (豆瓣影单选择器) ===== */}
      {showDoubanPicker && (
        <DoubanPicker
          open={showDoubanPicker}
          onClose={() => setShowDoubanPicker(false)}
          onSelect={(item) => setDouban(item)}
        />
      )}

      </div>
    </div>,
    document.body
  );
}
