"use client";
/* eslint-disable react-hooks/set-state-in-effect, @typescript-eslint/no-explicit-any */

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  PenLine,
  Trash2,
  Loader2,
  FileText,
  ExternalLink,
  Pin,
  PinOff,
  Search,
  X,
  Layers,
  CheckSquare,
  Square,
  ArrowUp,
  ArrowDown,
  Unlink,
  Check,
  AlertCircle,
  CheckCircle2,
  Copy,
  ImageIcon,
  Eye,
  MessageSquare,
  Heart,
  MoreHorizontal,
  ArrowUpDown,
  FolderEdit,
  Tag,
  Globe,
  Archive,
} from "lucide-react";
import { apiFetch } from "@/lib/api-fetch";
import { formatArticleTime } from "@/lib/time-format";
import { stripMarkdownAndHtml } from "@/lib/frontmatter";
import { resolveCoverImage } from "@/lib/post-image";
import { notifyContentUpdated } from "@/lib/content-sync";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import QuickCoverModal from "@/components/admin/QuickCoverModal";

interface ArticleListItem {
  id: string;
  shortId: string;
  type: string;
  title: string;
  excerpt: string;
  cover: string;
  category: string;
  content: string;
  articleType: "original" | "repost" | "ai";
  repostUrl: string;
  pinned: boolean;
  status: "published" | "draft";
  viewCount?: number;
  commentCount?: number;
  likeCount?: number;
  collectionId?: string | null;
  collectionTitle?: string | null;
  hideInHome?: boolean;
  collectionPostIds?: string[] | null;
  createdAt: string;
  updatedAt?: string;
  author: string;
}

interface CollectionListItem {
  id: string;
  shortId: string;
  title: string;
  excerpt: string;
  cover: string;
  pinned: boolean;
  status: string;
  createdAt: string;
  updatedAt: string;
  postIds: string[];
  articleCount: number;
  articles: Array<{
    id: string;
    shortId: string;
    title: string;
    cover: string;
  }>;
}

const ARTICLE_TYPE_BADGE: Record<string, { label: string; cls: string }> = {
  original: { label: "原创", cls: "bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400" },
  repost: { label: "转载", cls: "bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400" },
  ai: { label: "AI", cls: "bg-purple-50 text-purple-600 dark:bg-purple-500/15 dark:text-purple-400" },
};

function AdminArticlesContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // 从 URL 读取查询状态（保持前进后退和刷新持久性）
  const currentPage = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
  const currentStatus = (searchParams.get("status") || "all") as "all" | "published" | "draft";
  const currentCategory = searchParams.get("category") || "";
  const currentSortBy = searchParams.get("sortBy") || "created_desc";
  const currentKeyword = searchParams.get("keyword") || searchParams.get("search") || "";

  // 状态定义
  const [articles, setArticles] = useState<ArticleListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // 搜索框本地输入状态
  const [searchInput, setSearchInput] = useState(currentKeyword);

  // 状态计数
  const [statusCounts, setStatusCounts] = useState<{ all: number; published: number; draft: number }>({
    all: 0,
    published: 0,
    draft: 0,
  });

  // 操作中单行 loading
  const [deleting, setDeleting] = useState<string | null>(null);
  const [pinning, setPinning] = useState<string | null>(null);
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);
  const [removingFromCol, setRemovingFromCol] = useState<string | null>(null);

  // 行操作更多菜单
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  // 快捷封面弹窗
  const [quickCoverTarget, setQuickCoverTarget] = useState<ArticleListItem | null>(null);

  // 多选与通用批量管理
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchOperating, setBatchOperating] = useState(false);

  // 批量修改分类 Modal
  const [showBatchCategoryModal, setShowBatchCategoryModal] = useState(false);
  const [targetCategoryInput, setTargetCategoryInput] = useState("");

  // 合辑弹窗
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showManageModal, setShowManageModal] = useState(false);
  const [collections, setCollections] = useState<CollectionListItem[]>([]);
  const [loadingCollections, setLoadingCollections] = useState(false);
  const [submittingCollection, setSubmittingCollection] = useState(false);

  // 合辑表单状态
  const [colTitle, setColTitle] = useState("");
  const [colExcerpt, setColExcerpt] = useState("");
  const [colCover, setColCover] = useState("");
  const [colPinned, setColPinned] = useState(false);
  const [orderedSelectedIds, setOrderedSelectedIds] = useState<string[]>([]);

  // 提示反馈
  const [bannerFeedback, setBannerFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showFeedback = useCallback((type: "success" | "error", message: string) => {
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    setBannerFeedback({ type, message });
    feedbackTimerRef.current = setTimeout(() => {
      setBannerFeedback(null);
      feedbackTimerRef.current = null;
    }, 3500);
  }, []);

  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    };
  }, []);

  // 点击外部关闭下拉菜单
  useEffect(() => {
    const handleDocumentClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-row-menu]")) {
        setActiveMenuId(null);
      }
    };
    document.addEventListener("click", handleDocumentClick);
    return () => document.removeEventListener("click", handleDocumentClick);
  }, []);

  // 全局确认弹窗状态
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    danger?: boolean;
    onConfirm: () => void;
  }>({
    open: false,
    title: "",
    message: "",
    confirmText: "确定",
    cancelText: "取消",
    danger: false,
    onConfirm: () => {},
  });

  // 更新 URL Query 参数
  const updateQueryParams = useCallback(
    (updates: Record<string, string | number | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (
          value === null ||
          value === "" ||
          (key === "page" && Number(value) === 1) ||
          (key === "status" && value === "all") ||
          (key === "sortBy" && value === "created_desc")
        ) {
          params.delete(key);
        } else {
          params.set(key, String(value));
        }
      }
      const qs = params.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  // 刷新状态计数
  const refreshStatusCounts = useCallback(async () => {
    try {
      const [allRes, pubRes, draftRes] = await Promise.all([
        apiFetch("/admin/posts?type=article&limit=1"),
        apiFetch("/admin/posts?type=article&status=published&limit=1"),
        apiFetch("/admin/posts?type=article&status=draft&limit=1"),
      ]);
      const [allData, pubData, draftData] = await Promise.all([
        allRes.ok ? allRes.json() : null,
        pubRes.ok ? pubRes.json() : null,
        draftRes.ok ? draftRes.json() : null,
      ]);
      setStatusCounts({
        all: allData?.pagination?.total || 0,
        published: pubData?.pagination?.total || 0,
        draft: draftData?.pagination?.total || 0,
      });
    } catch {
      // ignore
    }
  }, []);

  // 加载全部分类
  const fetchCategories = useCallback(async () => {
    try {
      const res = await apiFetch("/admin/posts/categories");
      if (res.ok) {
        const json = await res.json();
        setCategories(json.categories || []);
      }
    } catch {
      // ignore
    }
  }, []);

  // 加载文章列表
  const fetchArticles = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const params = new URLSearchParams({
        type: "article",
        page: String(currentPage),
        limit: "20",
      });
      if (currentStatus !== "all") params.set("status", currentStatus);
      if (currentCategory.trim()) params.set("category", currentCategory.trim());
      if (currentKeyword.trim()) params.set("keyword", currentKeyword.trim());
      if (currentSortBy) params.set("sortBy", currentSortBy);

      const res = await apiFetch(`/admin/posts?${params.toString()}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "文章加载失败");
      }
      const data = await res.json();
      const rawList: ArticleListItem[] = data.data || [];
      const cleanList = rawList.filter((item) => item.category !== "项目" && item.type !== "project");
      setArticles(cleanList);
      setTotalPages(data.pagination?.totalPages || 1);
      setTotalCount(data.pagination?.total || cleanList.length);
    } catch (err) {
      console.error("加载文章列表异常:", err);
      setArticles([]);
      setTotalPages(1);
      setTotalCount(0);
      setLoadError(err instanceof Error ? err.message : "文章加载失败，请重试");
    } finally {
      setLoading(false);
    }
  }, [currentPage, currentStatus, currentCategory, currentKeyword, currentSortBy]);

  // 加载合辑列表
  const fetchCollections = useCallback(async () => {
    setLoadingCollections(true);
    try {
      const res = await apiFetch("/admin/collections");
      if (res.ok) {
        const json = await res.json();
        setCollections(json.data || []);
      }
    } catch (err) {
      console.error("加载合辑列表异常:", err);
    } finally {
      setLoadingCollections(false);
    }
  }, []);

  // 初始化与参数监听
  useEffect(() => {
    fetchArticles();
  }, [fetchArticles]);

  useEffect(() => {
    fetchCategories();
    fetchCollections();
    refreshStatusCounts();
  }, [fetchCategories, fetchCollections, refreshStatusCounts]);

  // 当外部 currentKeyword 变化时同步输入框
  useEffect(() => {
    setSearchInput(currentKeyword);
  }, [currentKeyword]);

  // 通用多选勾选/取消勾选
  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAllCurrentPage = () => {
    if (articles.length === 0) return;
    const allSelected = articles.every((a) => selectedIds.has(a.id));
    if (allSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const a of articles) next.delete(a.id);
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const a of articles) next.add(a.id);
        return next;
      });
    }
  };

  // 搜索提交与重置
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateQueryParams({ keyword: searchInput.trim(), page: 1 });
  };

  const handleClearSearch = () => {
    setSearchInput("");
    updateQueryParams({ keyword: null, page: 1 });
  };

  // 单篇删除
  const handleDelete = useCallback(
    (article: ArticleListItem) => {
      setConfirmDialog({
        open: true,
        title: "删除文章确认",
        message: `确定彻底删除文章《${article.title || "无标题"}》吗？删除后相关评论与点赞将一并清理且不可恢复。`,
        confirmText: "彻底删除",
        danger: true,
        onConfirm: async () => {
          setConfirmDialog((prev) => ({ ...prev, open: false }));
          setDeleting(article.id);
          try {
            const res = await apiFetch(`/posts/${article.id}`, { method: "DELETE" });
            if (!res.ok) throw new Error("删除失败");
            showFeedback("success", `文章《${article.title || "无标题"}》已成功删除`);
            setArticles((prev) => prev.filter((a) => a.id !== article.id));
            setSelectedIds((prev) => {
              const next = new Set(prev);
              next.delete(article.id);
              return next;
            });
            refreshStatusCounts();
            fetchCategories();
            notifyContentUpdated();
          } catch (err) {
            showFeedback("error", err instanceof Error ? err.message : "删除失败");
          } finally {
            setDeleting(null);
          }
        },
      });
    },
    [refreshStatusCounts, fetchCategories, showFeedback]
  );

  // 单篇置顶/取消置顶
  const handlePin = useCallback(
    async (id: string, currentPinned: boolean) => {
      setPinning(id);
      try {
        const res = await apiFetch(`/posts/${id}/pin`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pinned: !currentPinned }),
        });
        if (!res.ok) throw new Error("操作失败");
        const data = await res.json();
        setArticles((prev) =>
          prev.map((a) => (a.id === id ? { ...a, pinned: !!data.pinned } : a))
        );
        showFeedback("success", !currentPinned ? "文章已置顶" : "已取消置顶");
        notifyContentUpdated();
      } catch (err) {
        showFeedback("error", err instanceof Error ? err.message : "操作失败");
      } finally {
        setPinning(null);
      }
    },
    [showFeedback]
  );

  // 单篇状态切换
  const handleToggleStatus = useCallback(
    (article: ArticleListItem) => {
      const isPublished = article.status === "published";
      const nextStatus = isPublished ? "draft" : "published";

      const executeToggle = async () => {
        setUpdatingStatusId(article.id);
        try {
          const res = await apiFetch(`/posts/${article.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: nextStatus }),
          });
          if (!res.ok) throw new Error("切换发布状态失败");
          await fetchArticles();
          refreshStatusCounts();
          notifyContentUpdated();
          showFeedback(
            "success",
            nextStatus === "published"
              ? `文章《${article.title}》已正式发布`
              : `文章《${article.title}》已下架转为草稿`
          );
        } catch (err) {
          showFeedback("error", err instanceof Error ? err.message : "状态切换失败");
        } finally {
          setUpdatingStatusId(null);
        }
      };

      if (isPublished) {
        setConfirmDialog({
          open: true,
          title: "下架文章为草稿",
          message: `确定将《${article.title}》下架为草稿吗？下架后前台访客将无法浏览此文章。`,
          confirmText: "确认下架",
          danger: false,
          onConfirm: () => {
            setConfirmDialog((prev) => ({ ...prev, open: false }));
            executeToggle();
          },
        });
      } else {
        executeToggle();
      }
    },
    [fetchArticles, refreshStatusCounts, showFeedback]
  );

  // 移出合辑
  const handleRemoveFromCollection = (article: ArticleListItem) => {
    if (!article.collectionId) return;

    setConfirmDialog({
      open: true,
      title: "移出合辑确认",
      message: `确定将《${article.title}》移出合辑吗？移出后文章将恢复在首页独立展示。`,
      confirmText: "确认移出",
      danger: false,
      onConfirm: async () => {
        setConfirmDialog((prev) => ({ ...prev, open: false }));
        setRemovingFromCol(article.id);
        try {
          const res = await apiFetch(`/admin/collections/${article.collectionId}/remove-post`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ postId: article.id }),
          });
          if (!res.ok) throw new Error("移出合辑失败");
          showFeedback("success", `文章《${article.title}》已移出合辑`);
          await fetchArticles();
          await fetchCollections();
          notifyContentUpdated();
        } catch (err: any) {
          showFeedback("error", err.message || "移出合辑失败");
        } finally {
          setRemovingFromCol(null);
        }
      },
    });
  };

  // 解散合辑
  const handleDissolveCollection = (col: CollectionListItem) => {
    setConfirmDialog({
      open: true,
      title: "解散合辑确认",
      message: `确定解散合辑《${col.title}》吗？解散后合辑卡片将被移除，其中的 ${col.articleCount} 篇文章全部恢复在首页独立展示，文章内容绝不会被删除。`,
      confirmText: "确认解散",
      danger: true,
      onConfirm: async () => {
        setConfirmDialog((prev) => ({ ...prev, open: false }));
        try {
          const res = await apiFetch(`/admin/collections/${col.id}`, { method: "DELETE" });
          if (!res.ok) throw new Error("解散合辑失败");
          showFeedback("success", `合辑《${col.title}》已解散，所含文章已恢复在首页独立展示`);
          await fetchCollections();
          await fetchArticles();
          notifyContentUpdated();
        } catch (err: any) {
          showFeedback("error", err.message || "解散合辑失败");
        }
      },
    });
  };

  // 复制链接
  const handleCopyLink = useCallback(
    (article: ArticleListItem) => {
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const url = `${origin}/articles/${article.shortId || article.id}`;
      navigator.clipboard
        .writeText(url)
        .then(() => {
          showFeedback("success", `已复制文章公开链接：${article.title}`);
        })
        .catch(() => {
          showFeedback("error", "复制链接失败，请手动复制");
        });
    },
    [showFeedback]
  );

  // ================= 批量操作函数 =================

  // 批量删除
  const handleBatchDelete = () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    setConfirmDialog({
      open: true,
      title: "批量彻底删除确认",
      message: `确定彻底删除选中的 ${ids.length} 篇文章吗？此操作将同时清理所有关联的评论和点赞，且不可撤销！`,
      confirmText: `彻底删除 (${ids.length}篇)`,
      danger: true,
      onConfirm: async () => {
        setConfirmDialog((prev) => ({ ...prev, open: false }));
        setBatchOperating(true);
        try {
          const res = await apiFetch("/admin/posts/batch-delete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.message || "批量删除失败");

          showFeedback("success", data.message || `成功删除 ${ids.length} 篇内容`);
          setSelectedIds(new Set());
          await fetchArticles();
          refreshStatusCounts();
          fetchCategories();
          notifyContentUpdated();
        } catch (err: any) {
          showFeedback("error", err.message || "批量删除失败");
        } finally {
          setBatchOperating(false);
        }
      },
    });
  };

  // 批量修改发布状态 (发布 / 下架)
  const handleBatchStatus = (targetStatus: "published" | "draft") => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    const actionText = targetStatus === "published" ? "批量发布" : "批量下架为草稿";

    setConfirmDialog({
      open: true,
      title: `${actionText}确认`,
      message: `确定将选中的 ${ids.length} 篇文章${actionText}吗？`,
      confirmText: actionText,
      danger: targetStatus === "draft",
      onConfirm: async () => {
        setConfirmDialog((prev) => ({ ...prev, open: false }));
        setBatchOperating(true);
        try {
          const res = await apiFetch("/admin/posts/batch-status", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids, status: targetStatus }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.message || `${actionText}失败`);

          showFeedback("success", data.message || `成功更新 ${ids.length} 篇状态`);
          setSelectedIds(new Set());
          await fetchArticles();
          refreshStatusCounts();
          notifyContentUpdated();
        } catch (err: any) {
          showFeedback("error", err.message || `${actionText}失败`);
        } finally {
          setBatchOperating(false);
        }
      },
    });
  };

  // 批量修改分类提交
  const handleBatchCategorySubmit = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const cat = targetCategoryInput.trim();
    if (!cat) {
      showFeedback("error", "请输入或选择分类名称");
      return;
    }

    setBatchOperating(true);
    try {
      const res = await apiFetch("/admin/posts/batch-category", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, category: cat }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "批量修改分类失败");

      showFeedback("success", data.message || `已将 ${ids.length} 篇文章分类更新为「${cat}」`);
      setShowBatchCategoryModal(false);
      setTargetCategoryInput("");
      setSelectedIds(new Set());
      await fetchArticles();
      fetchCategories();
      notifyContentUpdated();
    } catch (err: any) {
      showFeedback("error", err.message || "批量修改分类失败");
    } finally {
      setBatchOperating(false);
    }
  };

  // 打开打包合辑弹窗
  const handleOpenCreateCollection = () => {
    const list = Array.from(selectedIds);
    if (list.length === 0) return;

    // 智能筛选出适合建合辑的文章（已发布且未加入其他合辑）
    const validList = list.filter((id) => {
      const p = articles.find((a) => a.id === id);
      return p && p.status === "published" && !p.collectionId;
    });

    if (validList.length === 0) {
      showFeedback("error", "所选文章中没有符合合辑条件的文章（合辑要求已发布且未归属其他合辑）");
      return;
    }

    if (validList.length < list.length) {
      showFeedback("error", `已自动过滤掉 ${list.length - validList.length} 篇草稿或已在其他合辑的文章`);
    }

    setOrderedSelectedIds(validList);
    const firstPost = articles.find((a) => a.id === validList[0]);
    if (firstPost) {
      setColTitle(firstPost.title ? `${firstPost.title} 系列` : "精选系列合辑");
      setColExcerpt(stripMarkdownAndHtml(firstPost.excerpt || firstPost.content || "").slice(0, 100));
      const firstCover = articles.find((a) => validList.includes(a.id) && a.cover)?.cover || "";
      setColCover(firstCover);
    }
    setColPinned(false);
    setShowCreateModal(true);
  };

  // 调整合辑内文章顺序
  const handleMoveOrder = (index: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= orderedSelectedIds.length) return;
    const next = [...orderedSelectedIds];
    const temp = next[index];
    next[index] = next[targetIndex];
    next[targetIndex] = temp;
    setOrderedSelectedIds(next);
  };

  // 提交创建合辑
  const handleSaveCollection = async () => {
    if (!colTitle.trim()) {
      showFeedback("error", "请输入合辑名称");
      return;
    }
    if (orderedSelectedIds.length === 0) {
      showFeedback("error", "请至少选择一篇文章");
      return;
    }

    setSubmittingCollection(true);
    try {
      const res = await apiFetch("/admin/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: colTitle.trim(),
          excerpt: colExcerpt.trim(),
          cover: colCover.trim(),
          pinned: colPinned,
          postIds: orderedSelectedIds,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "创建合辑失败");
      }

      setShowCreateModal(false);
      setSelectedIds(new Set());
      await fetchArticles();
      await fetchCollections();
      refreshStatusCounts();
      notifyContentUpdated();
      showFeedback("success", `系列合辑《${colTitle.trim()}》创建成功，已在首页聚合展示`);
    } catch (err: any) {
      showFeedback("error", err.message || "创建合辑失败，请重试");
    } finally {
      setSubmittingCollection(false);
    }
  };

  return (
    <div className="space-y-4 pb-24">
      {/* 顶部标题与主要操作 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-adm-text">文章与系列管理</h1>
          <p className="mt-0.5 text-xs sm:text-sm text-adm-text-secondary">
            创作长文、管理草稿，勾选批量管理状态与分类，或建立首页系列合辑
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              fetchCollections();
              setShowManageModal(true);
            }}
            className="adm-btn adm-btn--secondary cursor-pointer"
          >
            <Layers className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <span>合辑管理 ({collections.length})</span>
          </button>
          <Link href="/admin/articles/new" className="adm-btn adm-btn--primary cursor-pointer">
            <PenLine className="h-4 w-4" />
            <span>写新文章</span>
          </Link>
        </div>
      </div>

      {/* 轻量操作反馈横条 */}
      {bannerFeedback && (
        <div
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-medium transition-all animate-fade-in ${
            bannerFeedback.type === "success"
              ? "border border-emerald-500/30 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
              : "border border-rose-500/30 bg-rose-50 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300"
          }`}
        >
          {bannerFeedback.type === "success" ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0" />
          )}
          <span>{bannerFeedback.message}</span>
        </div>
      )}

      {/* 筛选与搜索工具栏 */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 rounded-2xl border border-adm-border bg-adm-card p-3 shadow-xs">
        {/* 左侧：状态 Tabs */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-xl bg-adm-input p-1">
            {[
              { key: "all", label: "全部", count: statusCounts.all },
              { key: "published", label: "已发布", count: statusCounts.published },
              { key: "draft", label: "草稿箱", count: statusCounts.draft },
            ].map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => updateQueryParams({ status: tab.key, page: 1 })}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all cursor-pointer ${
                  currentStatus === tab.key
                    ? "bg-adm-primary text-adm-primary-text shadow-xs"
                    : "text-adm-text-secondary hover:text-adm-text"
                }`}
              >
                {tab.label} ({tab.count})
              </button>
            ))}
          </div>

          {/* 全选当前页复选框 */}
          <button
            type="button"
            onClick={handleSelectAllCurrentPage}
            disabled={articles.length === 0}
            className="flex items-center gap-1.5 rounded-xl border border-adm-border bg-adm-input px-3 py-1.5 text-xs font-medium text-adm-text hover:bg-adm-card-hover disabled:opacity-40 transition-colors cursor-pointer"
          >
            {articles.length > 0 && articles.every((a) => selectedIds.has(a.id)) ? (
              <CheckSquare className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            ) : (
              <Square className="h-4 w-4 text-adm-text-tertiary" />
            )}
            <span>全选当页</span>
          </button>
        </div>

        {/* 右侧：分类筛选 + 排序方式 + 关键词搜索 */}
        <div className="flex flex-wrap items-center gap-2">
          {/* 分类下拉选择 */}
          <div className="relative flex items-center">
            <Tag className="absolute left-2.5 h-3.5 w-3.5 text-adm-text-tertiary pointer-events-none" />
            <select
              value={currentCategory}
              onChange={(e) => updateQueryParams({ category: e.target.value || null, page: 1 })}
              className="appearance-none rounded-xl border border-adm-border bg-adm-input pl-8 pr-7 py-1.5 text-xs text-adm-text focus:outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer"
            >
              <option value="">全部分类 ({categories.length})</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* 排序方式下拉选择 */}
          <div className="relative flex items-center">
            <ArrowUpDown className="absolute left-2.5 h-3.5 w-3.5 text-adm-text-tertiary pointer-events-none" />
            <select
              value={currentSortBy}
              onChange={(e) => updateQueryParams({ sortBy: e.target.value, page: 1 })}
              className="appearance-none rounded-xl border border-adm-border bg-adm-input pl-8 pr-7 py-1.5 text-xs text-adm-text focus:outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer"
            >
              <option value="created_desc">最新发布</option>
              <option value="updated">最近修改</option>
              <option value="views">阅读最多</option>
              <option value="created_asc">最早发布</option>
            </select>
          </div>

          {/* 关键词搜索框 */}
          <form onSubmit={handleSearchSubmit} className="relative w-full sm:w-56">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-adm-text-tertiary" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  updateQueryParams({ keyword: searchInput.trim(), page: 1 });
                }
              }}
              placeholder="回车搜索标题或分类..."
              className="w-full rounded-xl border border-adm-border bg-adm-input pl-8 pr-8 py-1.5 text-xs text-adm-text placeholder:text-adm-text-tertiary focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
            <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
            {searchInput && (
              <button
                type="button"
                onClick={handleClearSearch}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-adm-text-tertiary hover:text-adm-text cursor-pointer"
                title="清除搜索"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </form>
        </div>
      </div>

      {/* 列表主体 */}
      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-adm-text-tertiary" />
        </div>
      ) : loadError ? (
        <div className="rounded-2xl border border-dashed border-adm-border bg-adm-card px-4 py-16 text-center">
          <p className="text-sm text-adm-danger">{loadError}</p>
          <button
            type="button"
            onClick={fetchArticles}
            className="mt-4 rounded-xl bg-adm-primary px-4 py-2 text-xs font-medium text-adm-primary-text hover:opacity-90 cursor-pointer"
          >
            重试加载
          </button>
        </div>
      ) : articles.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-adm-border bg-adm-card py-20 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-adm-input text-adm-text-tertiary">
            <FileText className="h-7 w-7" />
          </div>
          <p className="mt-3 text-sm text-adm-text-secondary">
            {currentKeyword || currentCategory || currentStatus !== "all"
              ? "没有找到符合当前筛选条件的文章"
              : "还没有文章"}
          </p>
          {(currentKeyword || currentCategory || currentStatus !== "all") && (
            <button
              type="button"
              onClick={() => {
                setSearchInput("");
                updateQueryParams({ keyword: null, category: null, status: "all", page: 1 });
              }}
              className="mt-3 text-xs text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
            >
              清除所有筛选条件
            </button>
          )}
          {!currentKeyword && !currentCategory && currentStatus === "all" && (
            <Link href="/admin/articles/new" className="mt-4 adm-btn adm-btn--primary cursor-pointer">
              <PenLine className="h-4 w-4" />
              <span>写第一篇文章</span>
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {articles.map((article) => {
            const isSelected = selectedIds.has(article.id);
            const isInCollection = !!article.collectionId;
            const coverSrc = resolveCoverImage(article.cover, article.content);
            const isMenuOpen = activeMenuId === article.id;

            return (
              <div
                key={article.id}
                className={`relative group flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4 rounded-2xl border p-3.5 sm:p-4 transition-all ${
                  isSelected
                    ? "border-blue-500/70 bg-blue-50/40 dark:border-blue-600/70 dark:bg-blue-950/20 shadow-xs"
                    : "border-adm-border bg-adm-card hover:bg-adm-card-hover"
                }`}
              >
                {/* 勾选框 */}
                <button
                  type="button"
                  onClick={() => handleToggleSelect(article.id)}
                  className="shrink-0 p-1 text-adm-text hover:text-blue-600 transition-colors cursor-pointer"
                  title={isSelected ? "取消勾选" : "勾选进行批量管理"}
                >
                  {isSelected ? (
                    <CheckSquare className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  ) : (
                    <Square className="h-5 w-5 text-adm-text-tertiary group-hover:text-adm-text-secondary" />
                  )}
                </button>

                {/* 封面缩略图 */}
                <div
                  onClick={() => setQuickCoverTarget(article)}
                  className="group/cover relative h-28 sm:h-20 w-full sm:w-32 shrink-0 overflow-hidden rounded-xl bg-adm-input cursor-pointer border border-adm-border/60 hover:border-blue-500/80 transition-all"
                  title="点击快捷更换封面"
                >
                  {coverSrc ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={coverSrc}
                      alt={article.title}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover/cover:scale-105"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-adm-text-tertiary">
                      <FileText className="h-5 w-5" />
                      <span className="text-[10px] text-blue-600 dark:text-blue-400 font-medium">+ 设封面</span>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/cover:opacity-100 transition-opacity flex items-center justify-center gap-1 text-white text-[11px] font-medium backdrop-blur-xs">
                    <ImageIcon className="h-3.5 w-3.5" />
                    <span>更换</span>
                  </div>
                </div>

                {/* 中间信息区 */}
                <div className="min-w-0 flex-1 flex flex-col justify-between self-stretch gap-1.5">
                  <div>
                    {/* 标题与徽标 */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <h3 className="truncate font-semibold text-sm sm:text-base text-adm-text max-w-[90%]">
                        {article.title || "无标题文章"}
                      </h3>

                      {ARTICLE_TYPE_BADGE[article.articleType] && (
                        <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium ${ARTICLE_TYPE_BADGE[article.articleType].cls}`}>
                          {ARTICLE_TYPE_BADGE[article.articleType].label}
                        </span>
                      )}

                      {article.status === "draft" && (
                        <span className="shrink-0 rounded-md bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 text-[10px] font-medium">
                          草稿箱
                        </span>
                      )}

                      {article.pinned && (
                        <span className="shrink-0 rounded-md bg-green-50 dark:bg-green-500/15 text-green-600 dark:text-green-400 px-1.5 py-0.5 text-[10px] font-medium flex items-center gap-0.5">
                          <Pin className="h-2.5 w-2.5" />
                          置顶
                        </span>
                      )}

                      {isInCollection && (
                        <span className="shrink-0 inline-flex items-center gap-1 rounded-md bg-blue-100 dark:bg-blue-900/60 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:text-blue-300">
                          <Layers className="h-2.5 w-2.5" />
                          {article.collectionTitle || "系列合辑"}
                        </span>
                      )}
                    </div>

                    {/* 摘要 */}
                    <p className="mt-1 line-clamp-1 sm:line-clamp-2 text-xs text-adm-text-secondary break-words">
                      {stripMarkdownAndHtml(article.excerpt || article.content || "") || "暂无摘要与正文片段..."}
                    </p>
                  </div>

                  {/* 底部指标数据栏 */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-adm-text-tertiary">
                    {/* 分类 */}
                    {article.category && (
                      <span className="inline-flex items-center gap-1 rounded bg-adm-input px-1.5 py-0.5 text-[11px] text-adm-text-secondary font-medium">
                        <Tag className="h-3 w-3" />
                        {article.category}
                      </span>
                    )}

                    {/* 互动指标 */}
                    <div className="flex items-center gap-3 text-[11px]">
                      <span className="inline-flex items-center gap-1" title="阅读浏览量">
                        <Eye className="h-3 w-3" />
                        {article.viewCount || 0}
                      </span>
                      <span className="inline-flex items-center gap-1" title="评论互动数">
                        <MessageSquare className="h-3 w-3" />
                        {article.commentCount || 0}
                      </span>
                      <span className="inline-flex items-center gap-1" title="点赞收藏数">
                        <Heart className="h-3 w-3" />
                        {article.likeCount || 0}
                      </span>
                    </div>

                    {/* 时间 */}
                    <span className="text-[11px]">{formatArticleTime(article.createdAt)}</span>
                    {article.updatedAt && article.updatedAt !== article.createdAt && (
                      <span className="hidden md:inline text-[11px] opacity-75">
                        (修于 {formatArticleTime(article.updatedAt)})
                      </span>
                    )}
                  </div>
                </div>

                {/* 右侧核心操作栏与更多菜单 */}
                <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center pt-2 sm:pt-0 border-t sm:border-t-0 border-adm-border/40 w-full sm:w-auto justify-end">
                  {/* 编辑入口 */}
                  <Link
                    href={`/admin/articles/${article.id}`}
                    className="flex items-center gap-1 rounded-xl bg-adm-primary px-3 py-1.5 text-xs font-medium text-adm-primary-text hover:opacity-90 transition cursor-pointer"
                    title="进入完整编辑器"
                  >
                    <PenLine className="h-3.5 w-3.5" />
                    <span>编辑</span>
                  </Link>

                  {/* 发布 / 下架快捷切换 */}
                  <button
                    type="button"
                    onClick={() => handleToggleStatus(article)}
                    disabled={updatingStatusId === article.id}
                    className={`flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-medium border transition cursor-pointer ${
                      article.status === "draft"
                        ? "border-emerald-500/30 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300"
                        : "border-adm-border bg-adm-input text-adm-text hover:bg-adm-card-hover"
                    }`}
                    title={article.status === "draft" ? "正式发布此文章" : "下架此文章并转入草稿箱"}
                  >
                    {updatingStatusId === article.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : article.status === "draft" ? (
                      <Globe className="h-3 w-3 text-emerald-600" />
                    ) : (
                      <Archive className="h-3 w-3 text-adm-text-tertiary" />
                    )}
                    <span>{article.status === "draft" ? "发布" : "下架"}</span>
                  </button>

                  {/* 更多功能下拉菜单 (置顶、换封面、复制链接、前台预览、移出合辑、删除) */}
                  <div className="relative" data-row-menu>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveMenuId(isMenuOpen ? null : article.id);
                      }}
                      className="flex h-8 w-8 items-center justify-center rounded-xl border border-adm-border bg-adm-input text-adm-text-secondary hover:text-adm-text hover:bg-adm-card-hover transition cursor-pointer"
                      title="更多管理操作"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </button>

                    {isMenuOpen && (
                      <div className="absolute right-0 bottom-full sm:bottom-auto sm:top-full mt-1 sm:mt-1.5 mb-1 sm:mb-0 w-44 rounded-2xl border border-adm-border bg-adm-card p-1.5 shadow-xl backdrop-blur-md z-40 space-y-0.5 animate-scale-in">
                        {/* 首页置顶 */}
                        <button
                          type="button"
                          onClick={() => {
                            setActiveMenuId(null);
                            handlePin(article.id, !!article.pinned);
                          }}
                          disabled={pinning === article.id}
                          className="flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-xs text-adm-text hover:bg-adm-input transition cursor-pointer"
                        >
                          {article.pinned ? (
                            <>
                              <PinOff className="h-3.5 w-3.5 text-adm-text-tertiary" />
                              <span>取消首页置顶</span>
                            </>
                          ) : (
                            <>
                              <Pin className="h-3.5 w-3.5 text-green-600" />
                              <span>设为首页置顶</span>
                            </>
                          )}
                        </button>

                        {/* 更换封面 */}
                        <button
                          type="button"
                          onClick={() => {
                            setActiveMenuId(null);
                            setQuickCoverTarget(article);
                          }}
                          className="flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-xs text-adm-text hover:bg-adm-input transition cursor-pointer"
                        >
                          <ImageIcon className="h-3.5 w-3.5 text-blue-500" />
                          <span>快捷更换封面</span>
                        </button>

                        {/* 复制公开链接 */}
                        {article.status === "published" && (
                          <button
                            type="button"
                            onClick={() => {
                              setActiveMenuId(null);
                              handleCopyLink(article);
                            }}
                            className="flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-xs text-adm-text hover:bg-adm-input transition cursor-pointer"
                          >
                            <Copy className="h-3.5 w-3.5 text-adm-text-tertiary" />
                            <span>复制公开链接</span>
                          </button>
                        )}

                        {/* 前台预览 */}
                        {article.status === "published" && (
                          <Link
                            href={`/articles/${article.shortId || article.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => setActiveMenuId(null)}
                            className="flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-xs text-adm-text hover:bg-adm-input transition cursor-pointer"
                          >
                            <ExternalLink className="h-3.5 w-3.5 text-adm-text-tertiary" />
                            <span>前台新窗口浏览</span>
                          </Link>
                        )}

                        {/* 移出合辑 */}
                        {isInCollection && (
                          <button
                            type="button"
                            onClick={() => {
                              setActiveMenuId(null);
                              handleRemoveFromCollection(article);
                            }}
                            disabled={removingFromCol === article.id}
                            className="flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-xs text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition cursor-pointer"
                          >
                            <Unlink className="h-3.5 w-3.5" />
                            <span>移出当前合辑</span>
                          </button>
                        )}

                        <div className="h-px bg-adm-border my-1" />

                        {/* 彻底删除 */}
                        <button
                          type="button"
                          onClick={() => {
                            setActiveMenuId(null);
                            handleDelete(article);
                          }}
                          disabled={deleting === article.id}
                          className="flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span>彻底删除文章</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* 分页控制器 */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-3 text-xs text-adm-text-secondary">
              <span>
                第 {currentPage} 页 / 共 {totalPages} 页 (共 {totalCount} 篇)
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => updateQueryParams({ page: currentPage - 1 })}
                  disabled={currentPage <= 1}
                  className="rounded-xl border border-adm-border bg-adm-card px-3 py-1.5 text-xs font-medium text-adm-text disabled:opacity-40 transition cursor-pointer hover:bg-adm-input"
                >
                  上一页
                </button>
                <button
                  type="button"
                  onClick={() => updateQueryParams({ page: currentPage + 1 })}
                  disabled={currentPage >= totalPages}
                  className="rounded-xl border border-adm-border bg-adm-card px-3 py-1.5 text-xs font-medium text-adm-text disabled:opacity-40 transition cursor-pointer hover:bg-adm-input"
                >
                  下一页
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 底部悬浮通用批量操作工具条 (选中文章时呼出) */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-[95%] max-w-2xl rounded-2xl border border-blue-200 dark:border-blue-900/80 bg-adm-card/95 p-3 sm:px-5 backdrop-blur-xl shadow-2xl animate-fade-in-up flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white shadow-xs">
              {selectedIds.size}
            </span>
            <span className="text-xs sm:text-sm font-semibold text-adm-text">
              已选 {selectedIds.size} 篇
            </span>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="text-xs text-adm-text-secondary hover:text-adm-text underline cursor-pointer ml-1"
            >
              取消
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* 批量发布 */}
            <button
              type="button"
              onClick={() => handleBatchStatus("published")}
              disabled={batchOperating}
              className="flex items-center gap-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 text-xs font-medium transition cursor-pointer shadow-xs disabled:opacity-50"
              title="将选中的所有文章转为已发布"
            >
              <Globe className="h-3.5 w-3.5" />
              <span>批量发布</span>
            </button>

            {/* 批量下架为草稿 */}
            <button
              type="button"
              onClick={() => handleBatchStatus("draft")}
              disabled={batchOperating}
              className="flex items-center gap-1 rounded-xl border border-adm-border bg-adm-input text-adm-text hover:bg-adm-card-hover px-3 py-1.5 text-xs font-medium transition cursor-pointer shadow-xs disabled:opacity-50"
              title="将选中的文章下架为草稿"
            >
              <Archive className="h-3.5 w-3.5" />
              <span>转草稿</span>
            </button>

            {/* 批量更改分类 */}
            <button
              type="button"
              onClick={() => {
                setTargetCategoryInput("");
                setShowBatchCategoryModal(true);
              }}
              disabled={batchOperating}
              className="flex items-center gap-1 rounded-xl border border-adm-border bg-adm-input text-adm-text hover:bg-adm-card-hover px-3 py-1.5 text-xs font-medium transition cursor-pointer shadow-xs disabled:opacity-50"
            >
              <FolderEdit className="h-3.5 w-3.5 text-blue-500" />
              <span>改分类</span>
            </button>

            {/* 打包合辑 */}
            <button
              type="button"
              onClick={handleOpenCreateCollection}
              disabled={batchOperating}
              className="flex items-center gap-1 rounded-xl bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 text-xs font-medium transition cursor-pointer shadow-xs disabled:opacity-50"
            >
              <Layers className="h-3.5 w-3.5" />
              <span>建合辑</span>
            </button>

            {/* 批量删除 */}
            <button
              type="button"
              onClick={handleBatchDelete}
              disabled={batchOperating}
              className="flex items-center gap-1 rounded-xl bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 text-xs font-medium transition cursor-pointer shadow-xs disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>删除</span>
            </button>
          </div>
        </div>
      )}

      {/* 弹窗：批量修改分类 Modal */}
      {showBatchCategoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs animate-fade-in">
          <div className="w-full max-w-md rounded-2xl border border-adm-border bg-adm-card p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-adm-border">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-300">
                  <FolderEdit className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-adm-text">批量修改文章分类</h3>
                  <p className="text-xs text-adm-text-secondary">
                    将选中的 {selectedIds.size} 篇文章一键划入指定分类
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowBatchCategoryModal(false)}
                className="text-adm-text-tertiary hover:text-adm-text cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-medium text-adm-text mb-1.5">
                选择已有分类或输入新分类
              </label>
              {categories.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2.5 max-h-24 overflow-y-auto pr-1">
                  {categories.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setTargetCategoryInput(c)}
                      className={`rounded-lg px-2.5 py-1 text-xs transition cursor-pointer ${
                        targetCategoryInput === c
                          ? "bg-blue-600 text-white"
                          : "bg-adm-input text-adm-text hover:bg-adm-card-hover border border-adm-border"
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              )}
              <input
                type="text"
                value={targetCategoryInput}
                onChange={(e) => setTargetCategoryInput(e.target.value)}
                placeholder="输入目标分类名称..."
                className="w-full rounded-xl border border-adm-border bg-adm-input px-3 py-2 text-sm text-adm-text placeholder:text-adm-text-tertiary focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-adm-border">
              <button
                type="button"
                onClick={() => setShowBatchCategoryModal(false)}
                className="rounded-xl border border-adm-border px-4 py-2 text-xs font-medium text-adm-text hover:bg-adm-input transition cursor-pointer"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleBatchCategorySubmit}
                disabled={batchOperating || !targetCategoryInput.trim()}
                className="flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 text-xs font-medium transition shadow-xs disabled:opacity-50 cursor-pointer"
              >
                {batchOperating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                <span>确认批量修改</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 弹窗：建立文章合辑 Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs animate-fade-in">
          <div className="w-full max-w-lg rounded-2xl border border-adm-border bg-adm-card p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-adm-border">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-300">
                  <Layers className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-adm-text">建立文章合辑</h3>
                  <p className="text-xs text-adm-text-secondary">
                    合并选中的 {orderedSelectedIds.length} 篇文章为 1 个首页系列合辑展示
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-adm-text-tertiary hover:text-adm-text cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* 合辑名称 */}
            <div>
              <label className="block text-xs font-medium text-adm-text mb-1">
                合辑标题 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={colTitle}
                onChange={(e) => setColTitle(e.target.value)}
                placeholder="例如：深入理解架构设计系列 / 2026年终随笔专题"
                className="w-full rounded-xl border border-adm-border bg-adm-input px-3 py-2 text-sm text-adm-text placeholder:text-adm-text-tertiary focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              />
            </div>

            {/* 合辑简介/导读 */}
            <div>
              <label className="block text-xs font-medium text-adm-text mb-1">合辑简介 / 导读摘要</label>
              <textarea
                value={colExcerpt}
                onChange={(e) => setColExcerpt(e.target.value)}
                rows={2}
                placeholder="简述该系列的主要内容与阅读指引..."
                className="w-full rounded-xl border border-adm-border bg-adm-input px-3 py-2 text-xs text-adm-text placeholder:text-adm-text-tertiary focus:outline-none focus:ring-2 focus:ring-blue-500/30 resize-none"
              />
            </div>

            {/* 封面图快速选择 */}
            <div>
              <label className="block text-xs font-medium text-adm-text mb-1.5">
                合辑封面选择（点击可直接套用选中文章的封面）
              </label>
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {orderedSelectedIds.map((id) => {
                  const post = articles.find((a) => a.id === id);
                  if (!post?.cover) return null;
                  const isCurCover = colCover === post.cover;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setColCover(post.cover)}
                      className={`relative h-14 w-20 shrink-0 overflow-hidden rounded-lg border-2 transition-all cursor-pointer ${
                        isCurCover ? "border-blue-600 scale-95 shadow-sm" : "border-transparent opacity-70 hover:opacity-100"
                      }`}
                      title={post.title}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={post.cover} alt="" className="h-full w-full object-cover" />
                      {isCurCover && (
                        <div className="absolute inset-0 bg-blue-600/30 flex items-center justify-center">
                          <Check className="h-4 w-4 text-white" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
              <input
                type="text"
                value={colCover}
                onChange={(e) => setColCover(e.target.value)}
                placeholder="封面图 URL (留空将自动采用默认封面)"
                className="mt-1.5 w-full rounded-xl border border-adm-border bg-adm-input px-3 py-1.5 text-xs text-adm-text placeholder:text-adm-text-tertiary focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              />
            </div>

            {/* 是否在首页置顶 */}
            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="colPinned"
                checked={colPinned}
                onChange={(e) => setColPinned(e.target.checked)}
                className="h-4 w-4 rounded border-adm-border text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor="colPinned" className="text-xs font-medium text-adm-text cursor-pointer">
                在首页动态流中置顶此系列合辑卡片
              </label>
            </div>

            {/* 包含文章列表及排序调整 */}
            <div className="pt-2 border-t border-adm-border">
              <label className="block text-xs font-semibold text-adm-text mb-2">
                章节顺序调整（按此顺序在合辑卡片和阅读导航中展示）：
              </label>
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {orderedSelectedIds.map((id, index) => {
                  const post = articles.find((a) => a.id === id);
                  return (
                    <div
                      key={id}
                      className="flex items-center justify-between gap-2 rounded-xl bg-adm-input px-3 py-2 text-xs text-adm-text border border-adm-border/50"
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-blue-100 text-[11px] font-bold text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                          {index + 1}
                        </span>
                        <span className="truncate font-medium">{post?.title || "无标题文章"}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleMoveOrder(index, "up")}
                          disabled={index === 0}
                          className="p-1 text-adm-text-secondary hover:text-adm-text disabled:opacity-20 cursor-pointer"
                          title="上移"
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMoveOrder(index, "down")}
                          disabled={index === orderedSelectedIds.length - 1}
                          className="p-1 text-adm-text-secondary hover:text-adm-text disabled:opacity-20 cursor-pointer"
                          title="下移"
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 确认提交按钮 */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-adm-border">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="rounded-xl border border-adm-border px-4 py-2 text-xs font-medium text-adm-text hover:bg-adm-input transition cursor-pointer"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleSaveCollection}
                disabled={submittingCollection}
                className="flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 text-xs font-medium transition shadow-xs disabled:opacity-50 cursor-pointer"
              >
                {submittingCollection ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                <span>确认建立合辑并在首页展示</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 弹窗：合辑管理 Modal */}
      {showManageModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs animate-fade-in">
          <div className="w-full max-w-2xl rounded-2xl border border-adm-border bg-adm-card p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-adm-border">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-300">
                  <Layers className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-adm-text">已创建的首页系列合辑</h3>
                  <p className="text-xs text-adm-text-secondary">
                    管理或解散首页合辑（解散后文章不被删除，仅恢复首页独立展示）
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowManageModal(false)}
                className="text-adm-text-tertiary hover:text-adm-text cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {loadingCollections ? (
              <div className="flex h-40 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-adm-text-tertiary" />
              </div>
            ) : collections.length === 0 ? (
              <div className="py-12 text-center text-adm-text-secondary text-sm">
                目前还没有创建任何系列合辑。在文章列表勾选多篇文章即可打包创建。
              </div>
            ) : (
              <div className="space-y-3">
                {collections.map((col) => (
                  <div
                    key={col.id}
                    className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-xl border border-adm-border bg-adm-input/60 p-3.5 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-adm-text">{col.title}</span>
                        <span className="rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 px-2 py-0.5 text-[10px] font-medium">
                          共 {col.articleCount} 篇
                        </span>
                        {col.pinned && (
                          <span className="rounded bg-green-50 px-1.5 py-0.5 text-[10px] font-medium text-green-600 dark:bg-green-500/15 dark:text-green-400">
                            首页置顶
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-adm-text-secondary line-clamp-1">
                        {col.excerpt || "暂无导语"}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {col.articles.map((art, idx) => (
                          <span
                            key={art.id}
                            className="rounded bg-adm-card border border-adm-border/50 px-2 py-0.5 text-[11px] text-adm-text-secondary"
                          >
                            {idx + 1}. {art.title}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                      <button
                        type="button"
                        onClick={() => handleDissolveCollection(col)}
                        className="rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-100 transition cursor-pointer"
                      >
                        解散合辑
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end pt-3 border-t border-adm-border">
              <button
                type="button"
                onClick={() => setShowManageModal(false)}
                className="rounded-xl border border-adm-border px-4 py-2 text-xs font-medium text-adm-text hover:bg-adm-input cursor-pointer"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 快捷封面修改弹窗 */}
      {quickCoverTarget && (
        <QuickCoverModal
          open={!!quickCoverTarget}
          onClose={() => setQuickCoverTarget(null)}
          postId={quickCoverTarget.id}
          postTitle={quickCoverTarget.title}
          initialCover={quickCoverTarget.cover}
          content={quickCoverTarget.content}
          onSuccess={(newCover) => {
            setArticles((prev) =>
              prev.map((a) => (a.id === quickCoverTarget.id ? { ...a, cover: newCover } : a))
            );
            showFeedback("success", `文章《${quickCoverTarget.title || "无标题"}》封面已更新`);
          }}
        />
      )}

      {/* 统一二次确认弹窗 */}
      <ConfirmDialog
        open={confirmDialog.open}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmText={confirmDialog.confirmText}
        cancelText={confirmDialog.cancelText}
        danger={confirmDialog.danger}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog((prev) => ({ ...prev, open: false }))}
      />
    </div>
  );
}

export default function AdminArticlesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-adm-text-tertiary" />
        </div>
      }
    >
      <AdminArticlesContent />
    </Suspense>
  );
}
