"use client";
/* eslint-disable react-hooks/set-state-in-effect, react-hooks/refs */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useRouter } from "next/navigation";
import MomentCard from "@/components/MomentCard";
import ArticleFeedCard from "@/components/ArticleFeedCard";
import ArticleCollectionFeedCard from "@/components/ArticleCollectionFeedCard";
import ProjectCard from "@/components/ProjectCard";
import { PostCardSkeleton, ArticleCardSkeleton } from "@/components/Skeleton";
import { useSiteSettings } from "@/lib/site-settings-store";
import { authFetchHeaders } from "@/lib/auth";
import { subscribeContentUpdated } from "@/lib/content-sync";
import type { Post } from "@/lib/types";


export function FeedDispatcher({ post, index }: { post: Post; index: number }) {
  if (post.category === "项目" || post.type === "project") {
    return <ProjectCard post={post} index={index} variant="feed" />;
  }
  if (post.type === "collection") {
    return <ArticleCollectionFeedCard post={post} index={index} />;
  }
  if (post.type === "article") {
    return <ArticleFeedCard post={post} index={index} variant="feed" />;
  }
  return <MomentCard post={post} index={index} />;
}

export const FeedItemDispatcher = FeedDispatcher;

const API_URL = process.env.NEXT_PUBLIC_API_URL || "/api";
const PAGE_SIZE = 10;

interface PostListProps {
  initialPosts: Post[];
  initialHasMore: boolean;
  initialPage: number;
  initialError?: boolean;
  category?: string;
  type?: "moment" | "article";
  layout?: "list" | "grid" | "projects";
}

export default function PostList({
  initialPosts,
  initialHasMore,
  initialPage,
  initialError = false,
  category,
  type,
  layout = "list",
}: PostListProps) {
  const [activeCategory, setActiveCategory] = useState(category || "");
  const [posts, setPosts] = useState(initialPosts);
  const [page, setPage] = useState(initialPage);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(initialError);
  const postsRef = useRef(posts);
  postsRef.current = posts;
  const retryAbortRef = useRef<AbortController | null>(null);
  const loadMoreAbortRef = useRef<AbortController | null>(null);
  const refreshAbortRef = useRef<AbortController | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);
  const fetchSettings = useSiteSettings((s) => s.fetchSettings);
  const router = useRouter();
  const isInitialMount = useRef(true);

  // 同步外部传入的 category prop 变更
  useEffect(() => {
    setActiveCategory(category || "");
  }, [category]);

  // 从传入数据和常见分类推导分类标签
  const categories = useMemo(() => {
    if (type !== "article") return [];
    const catSet = new Set<string>();
    initialPosts.forEach((p) => {
      if (p.category && typeof p.category === "string") {
        catSet.add(p.category.trim());
      }
    });
    // 添加默认常见分类
    ["随笔", "技术"].forEach((c) => catSet.add(c));
    return ["全部", ...Array.from(catSet)];
  }, [initialPosts, type]);

  const filterParams = useMemo(() => {
    let p = "";
    if (activeCategory) p += `&category=${encodeURIComponent(activeCategory)}`;
    if (type) p += `&type=${type}`;
    return p;
  }, [activeCategory, type]);

  // 初始化时获取站点配置（折叠字数等）。
  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // 切换分类或筛选时拉取第一页数据；首屏挂载时若已提供 initialPosts 则跳过冗余请求
  // 使用 AbortController 取消未完成的旧请求，避免分类快速切换引发竞态条件
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      if (initialPosts && !initialError) return;
    }

    const controller = new AbortController();
    setPosts([]);
    setPage(1);
    setHasMore(false);
    setError(false);
    const email = (typeof window !== "undefined" && localStorage.getItem("visitor_email")) || "";
    const url = `${API_URL}/posts?page=1&limit=${PAGE_SIZE}${filterParams}${email ? `&email=${encodeURIComponent(email)}` : ""}`;
    fetch(url, {
      signal: controller.signal,
      cache: "no-store",
      credentials: "include",
      headers: authFetchHeaders(),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("fetch failed");
        return res.json();
      })
      .then((json) => {
        if (controller.signal.aborted) return;
        if (!json?.data || !Array.isArray(json.data)) return;
        setPosts(json.data);
        setPage(1);
        setHasMore(json.pagination?.hasMore ?? false);
        setError(false);
      })
      .catch((err) => {
        if (err?.name !== "AbortError") {
          setError(true);
        }
      });

    // 故意忽略 initialPosts：仅在分类或筛选参数变更时重置列表，避免 props 更新触发 setPosts([]) 引起闪屏和竞态
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterParams, initialError]);

  const retryFirstPage = useCallback(async () => {
    retryAbortRef.current?.abort();
    const controller = new AbortController();
    retryAbortRef.current = controller;

    const email = (typeof window !== "undefined" && localStorage.getItem("visitor_email")) || "";
    const emailQ = email ? `&email=${encodeURIComponent(email)}` : "";
    setError(false);
    try {
      const res = await fetch(`${API_URL}/posts?page=1&limit=${PAGE_SIZE}${filterParams}${emailQ}`, {
        signal: controller.signal,
        cache: "no-store",
        credentials: "include",
        headers: authFetchHeaders(),
      });
      if (!res.ok) throw new Error("fetch failed");
      const json = await res.json();
      if (!Array.isArray(json?.data)) throw new Error("invalid response");
      if (controller.signal.aborted) return;
      setPosts(json.data);
      setPage(1);
      setHasMore(json.pagination?.hasMore ?? false);
    } catch (err: unknown) {
      if ((err as Error)?.name !== "AbortError") {
        setError(true);
      }
    }
  }, [filterParams]);

  // 当服务端 ISR 完成重生成或路由重载传入新 initialPosts 时，同步更新客户端列表状态
  useEffect(() => {
    if (activeCategory === (category || "")) {
      setPosts(initialPosts);
      setPage(initialPage);
      setHasMore(initialHasMore);
      setError(initialError);
    }
  }, [initialPosts, initialHasMore, initialPage, initialError, activeCategory, category]);

  // 发布/编辑后的即时刷新由客户端重新拉取数据和 router.refresh() 完成；
  // 缓存失效由后端的服务端 revalidate 回调处理，同时支持 BroadcastChannel 跨标签页即时同步。
  useEffect(() => {
    const refreshFirstPage = async () => {
      refreshAbortRef.current?.abort();
      const controller = new AbortController();
      refreshAbortRef.current = controller;

      try {
        const email = (typeof window !== "undefined" && localStorage.getItem("visitor_email")) || "";
        const emailQ = email ? `&email=${encodeURIComponent(email)}` : "";
        const res = await fetch(`${API_URL}/posts?page=1&limit=${PAGE_SIZE}${filterParams}${emailQ}`, {
          signal: controller.signal,
          cache: "no-store",
          credentials: "include",
          headers: authFetchHeaders(),
        });
        if (res.ok) {
          const json = await res.json();
          if (!Array.isArray(json.data)) throw new Error("invalid response");
          if (controller.signal.aborted) return;
          setPosts(json.data);
          setPage(1);
          setHasMore(json.pagination?.hasMore ?? false);
          setError(false);
        } else if (!postsRef.current.length) {
          throw new Error("refresh failed");
        }
      } catch (err: unknown) {
        if ((err as Error)?.name !== "AbortError" && !postsRef.current.length) {
          setError(true);
        }
      }
    };

    const handler = async () => {
      // 客户端立即拉取最新数据
      await refreshFirstPage();
      // 服务端 ISR 由后端写操作回调触发；客户端只刷新自身数据。
      router.refresh();
    };

    // 跨标签页 BroadcastChannel 与当前窗口 CustomEvent 双通道监听
    const unsubscribe = subscribeContentUpdated(handler);

    // 页面重新可见或窗口重新获得焦点时（从其他标签页切回、从后台切回）静默刷新
    const onVisibilityOrFocus = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        refreshFirstPage();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityOrFocus);
    window.addEventListener("focus", onVisibilityOrFocus);

    // 针对停留时间较长的读者，每 60 秒做一次轻量可见性静默轮询更新
    const pollInterval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        refreshFirstPage();
      }
    }, 60000);

    return () => {
      refreshAbortRef.current?.abort();
      unsubscribe();
      document.removeEventListener("visibilitychange", onVisibilityOrFocus);
      window.removeEventListener("focus", onVisibilityOrFocus);
      clearInterval(pollInterval);
    };
  }, [filterParams, router]);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMore) return;
    loadingRef.current = true;
    setLoadingMore(true);
    setError(false);

    loadMoreAbortRef.current?.abort();
    const controller = new AbortController();
    loadMoreAbortRef.current = controller;

    try {
      const email = (typeof window !== "undefined" && localStorage.getItem("visitor_email")) || "";
      const emailQ = email ? `&email=${encodeURIComponent(email)}` : "";
      const res = await fetch(`${API_URL}/posts?page=${page + 1}&limit=${PAGE_SIZE}${filterParams}${emailQ}`, {
        signal: controller.signal,
        cache: "no-store",
        credentials: "include",
        headers: authFetchHeaders(),
      });
      if (!res.ok) throw new Error("fetch failed");
      const json = await res.json();
      if (controller.signal.aborted) return;
      setPosts((prev) => [...prev, ...(json.data || [])]);
      setPage((p) => p + 1);
      setHasMore(json.pagination?.hasMore ?? false);
    } catch (err: unknown) {
      if ((err as Error)?.name !== "AbortError") {
        setError(true);
      }
    } finally {
      setLoadingMore(false);
      loadingRef.current = false;
    }
  }, [page, hasMore, filterParams]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const isDesktop = window.matchMedia("(min-width: 768px)").matches;
    const root = isDesktop ? document.getElementById("scroll-root") : null;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore();
      },
      { root, rootMargin: "300px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore]);

  const renderCategoryFilter = () => {
    if (type !== "article" || categories.length <= 1) return null;
    return (
      <div className="mb-6 flex flex-wrap items-center gap-1.5 sm:gap-2">
        {categories.map((cat) => {
          const isSelected = cat === "全部" ? !activeCategory : activeCategory === cat;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => {
                setActiveCategory(cat === "全部" ? "" : cat);
                setPage(1);
              }}
              className={`rounded-full px-3.5 py-1.5 text-xs sm:text-sm font-medium transition-all duration-200 cursor-pointer ${
                isSelected
                  ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 shadow-xs"
                  : "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200/70 dark:hover:bg-neutral-700 hover:text-neutral-900 dark:hover:text-white"
              }`}
            >
              {cat}
            </button>
          );
        })}
      </div>
    );
  };

  if (posts.length === 0) {
    return (
      <div className="flex-1 flex flex-col w-full">
        {renderCategoryFilter()}
        <div className="flex-1 flex flex-col items-center justify-center py-16 sm:py-20 text-center px-4">
          {error ? (
            <>
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-500 dark:bg-red-950/30 dark:text-red-400 mb-3">
                !
              </div>
              <p className="text-sm font-medium text-neutral-600 dark:text-neutral-300">内容加载失败</p>
              <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">请检查后端服务后重试</p>
              <button
                type="button"
                onClick={retryFirstPage}
                className="mt-4 rounded-lg bg-neutral-900 px-3 py-2 text-xs font-medium text-white transition-opacity hover:opacity-80 dark:bg-white dark:text-neutral-900"
              >
                重试
              </button>
            </>
          ) : layout === "projects" || category === "项目" ? (
            <div className="w-full max-w-lg mx-auto rounded-3xl border border-dashed border-neutral-300/80 dark:border-neutral-700/80 bg-neutral-50/50 dark:bg-neutral-900/40 p-8 sm:p-10 text-center shadow-xs">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 text-2xl text-emerald-600 dark:text-emerald-400 mb-4 ring-8 ring-emerald-500/10">
                💻
              </div>
              <h3 className="text-base sm:text-lg font-semibold text-neutral-800 dark:text-neutral-100">
                项目作品正在打磨中
              </h3>
              <p className="mt-2 text-xs sm:text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed">
                独立产品、代码实验与开源折腾成果即将同步上线。
              </p>
              <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                <span className="rounded-full bg-neutral-100 dark:bg-neutral-800 px-3 py-1 text-[11px] font-medium text-neutral-600 dark:text-neutral-300">
                  🚀 独立开发
                </span>
                <span className="rounded-full bg-neutral-100 dark:bg-neutral-800 px-3 py-1 text-[11px] font-medium text-neutral-600 dark:text-neutral-300">
                  🛠️ 全栈架构
                </span>
                <span className="rounded-full bg-neutral-100 dark:bg-neutral-800 px-3 py-1 text-[11px] font-medium text-neutral-600 dark:text-neutral-300">
                  📦 开源工具
                </span>
              </div>
            </div>
          ) : (
            <>
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-neutral-100 dark:bg-neutral-800 text-xl text-neutral-400 dark:text-neutral-500 mb-3">
                {type === "article" ? "📝" : "🍃"}
              </div>
              <p className="text-sm font-medium text-neutral-600 dark:text-neutral-300">
                {type === "article" ? "该分类下暂无文章" : "暂无动态"}
              </p>
              <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">
                {type === "article"
                  ? "该分类下暂无已发布文章~"
                  : activeCategory
                    ? `#${activeCategory} 话题下暂无动态~`
                    : "博主暂未发布动态~"}
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      {renderCategoryFilter()}
      {layout === "projects" ? (
        <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          {posts.map((post, index) => (
            <div key={post.id} className={posts.length === 1 ? "xl:col-span-2" : ""}>
              <ProjectCard post={post} index={index} featured={posts.length === 1} />
            </div>
          ))}
          {loadingMore &&
            Array.from({ length: 2 }).map((_, i) => (
              <div
                key={`sk-project-${i}`}
                className="min-h-64 animate-pulse rounded-2xl border border-neutral-200/60 bg-wechat-white dark:border-neutral-800/80 dark:bg-neutral-900/60"
              />
            ))}
        </section>
      ) : layout === "grid" ? (
        <section className="grid grid-cols-1 gap-5 sm:gap-6 md:grid-cols-2 xl:grid-cols-3 items-start">
          {posts.map((post, index) => (
            <MomentCard key={post.id} post={post} index={index} variant="card" />
          ))}
          {loadingMore &&
            Array.from({ length: 3 }).map((_, i) => (
              <div
                key={`sk-grid-${i}`}
                className="rounded-3xl bg-wechat-white p-5 border border-neutral-200/60 dark:border-neutral-800/80 animate-pulse space-y-4 shadow-xs"
              >
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-neutral-200 dark:bg-neutral-800" />
                  <div className="space-y-2 flex-1">
                    <div className="h-3 w-1/3 rounded bg-neutral-200 dark:bg-neutral-800" />
                    <div className="h-2.5 w-1/4 rounded bg-neutral-200 dark:bg-neutral-800" />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="h-3 w-full rounded bg-neutral-200 dark:bg-neutral-800" />
                  <div className="h-3 w-4/5 rounded bg-neutral-200 dark:bg-neutral-800" />
                </div>
              </div>
            ))}
        </section>
      ) : type === "article" ? (
        <section className="space-y-4 sm:space-y-5">
          {posts.map((post, index) => (
            <ArticleFeedCard key={post.id} post={post} index={index} />
          ))}
          {loadingMore &&
            Array.from({ length: 2 }).map((_, i) => (
              <ArticleCardSkeleton key={`art-sk-${i}`} />
            ))}
        </section>
      ) : type === "moment" ? (
        <section className="divide-hairline">
          {posts.map((post, index) => (
            <MomentCard key={post.id} post={post} index={index} />
          ))}
          {loadingMore &&
            Array.from({ length: 2 }).map((_, i) => (
              <PostCardSkeleton key={`sk-${i}`} />
            ))}
        </section>
      ) : (
        <section className="divide-hairline">
          {posts.map((post, index) => (
            <FeedDispatcher key={post.id} post={post} index={index} />
          ))}
          {loadingMore &&
            Array.from({ length: 2 }).map((_, i) => (
              <PostCardSkeleton key={`sk-${i}`} />
            ))}
        </section>
      )}

      {/* Sentinel for IntersectionObserver */}
      <div ref={sentinelRef} className="h-1" />

      {error && (
        <div className="py-6 text-center">
          <button
            type="button"
            onClick={loadMore}
            className="text-sm text-emerald-600 dark:text-emerald-400 transition-opacity hover:opacity-70"
          >
            加载失败，点击重试
          </button>
        </div>
      )}

      {!hasMore && !loadingMore && posts.length > 0 && (
        <footer className="py-8 text-center text-xs text-neutral-400 dark:text-neutral-500">
          {type === "article" ? "已展示全部文章" : "已经到底了"}
        </footer>
      )}
    </>
  );
}
