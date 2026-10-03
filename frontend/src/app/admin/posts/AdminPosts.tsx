"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { Trash2, Pin, PinOff, Heart, MessageSquare, ExternalLink, Plus, PenLine, Loader2 } from "lucide-react";
import { apiFetch, getToken } from "@/lib/api-fetch";
import type { Post } from "@/lib/types";
import PostCard from "@/components/PostCard";
import { PostCardSkeleton } from "@/components/Skeleton";
import { useSiteSettings } from "@/lib/site-settings-store";
import { PublishModal } from "@/components/TopBar";
import { notifyContentUpdated } from "@/lib/content-sync";

const PAGE_SIZE = 50;

interface AdminPostsProps {
  defaultCategory?: string;
  title?: string;
  description?: string;
}

export default function AdminPosts({
  defaultCategory = "all",
  title = "动态管理",
  description,
}: AdminPostsProps) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>(defaultCategory);
  const [statusFilter, setStatusFilter] = useState<"all" | "published" | "draft">("all");
  const [showPublish, setShowPublish] = useState(false);
  const [editingPost, setEditingPost] = useState<Post | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pinningId, setPinningId] = useState<string | null>(null);
  const [permId, setPermId] = useState<string | null>(null);
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);

  const token = getToken();
  const fetchSettings = useSiteSettings((s) => s.fetchSettings);

  const fetchPosts = useCallback(() => {
    setLoading(true);
    setLoadError("");
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE), type: "moment" });
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (selectedCategory !== "all") {
      params.set("category", selectedCategory);
    }
    apiFetch(`/admin/posts?${params.toString()}`)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.message || "动态加载失败");
        }
        return res.json();
      })
      .then((data) => {
        const dataPosts = Array.isArray(data?.data) ? data.data : [];
        setPosts(dataPosts);
        setTotalPages(Math.max(1, Number(data?.pagination?.totalPages) || 1));
        setTotalCount(Number(data?.pagination?.total) || dataPosts.length);
      })
      .catch((err) => {
        console.error("加载动态列表异常:", err);
        setPosts([]);
        setTotalPages(1);
        setTotalCount(0);
        setLoadError(err instanceof Error ? err.message : "动态加载失败，请重试");
      })
      .finally(() => setLoading(false));
  }, [page, selectedCategory, statusFilter]);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  const handleDelete = async (id: string) => {
    if (!confirm("确定要删除这条内容吗？")) return;
    setDeletingId(id);
    try {
      const res = await apiFetch(`/posts/${id}`, { method: "DELETE" });
      if (res.ok) {
        setPosts((prev) => prev.filter((p) => p.id !== id));
        if (posts.length === 1 && page > 1) setPage((current) => current - 1);
        else fetchPosts();
        notifyContentUpdated();
      } else {
        alert("删除失败");
      }
    } catch {
      alert("删除失败，网络错误");
    } finally {
      setDeletingId(null);
    }
  };

  const handlePin = async (id: string, currentPinned: boolean) => {
    setPinningId(id);
    try {
      const res = await apiFetch(`/posts/${id}/pin`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned: !currentPinned }),
      });
      if (res.ok) {
        setPosts((prev) =>
          prev.map((p) => (p.id === id ? { ...p, pinned: !currentPinned } : p))
        );
        fetchSettings();
        notifyContentUpdated();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.message || "操作失败");
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "操作失败");
    } finally {
      setPinningId(null);
    }
  };

  const handleToggleStatus = async (id: string, currentStatus?: "published" | "draft") => {
    const nextStatus = currentStatus === "draft" ? "published" : "draft";
    setUpdatingStatusId(id);
    try {
      const res = await apiFetch(`/posts/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (res.ok) {
        setPosts((prev) =>
          prev.map((p) => (p.id === id ? { ...p, status: nextStatus } : p))
        );
        notifyContentUpdated();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.message || "状态切换失败");
      }
    } catch {
      alert("网络错误，状态切换失败");
    } finally {
      setUpdatingStatusId(null);
    }
  };

  const handleTogglePermission = async (
    id: string,
    field: "likesDisabled" | "commentsDisabled",
    currentVal: boolean
  ) => {
    setPermId(id);
    try {
      const res = await apiFetch(`/posts/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: !currentVal }),
      });
      if (res.ok) {
        setPosts((prev) =>
          prev.map((p) => (p.id === id ? { ...p, [field]: !currentVal } : p))
        );
        notifyContentUpdated();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.message || "操作失败");
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "操作失败");
    } finally {
      setPermId(null);
    }
  };

  // 严格过滤掉长文文章与项目作品，仅保留动态/岁岁念
  const momentPosts = useMemo(
    () => posts.filter((p) => p.type !== "article" && p.type !== "project" && p.category !== "项目"),
    [posts]
  );

  // 动态聚合分类列表，优先包含「日常」和「岁岁念」
  const categoryTabs = useMemo(() => {
    const catSet = new Set<string>(["日常", "岁岁念", "随想"]);
    momentPosts.forEach((p) => {
      if (p.category && p.category !== "项目") catSet.add(p.category.trim());
    });
    return [
      { key: "all", label: "全部" },
      ...Array.from(catSet).map((cat) => ({ key: cat, label: cat })),
    ];
  }, [momentPosts]);

  const filteredPosts = useMemo(() => {
    return momentPosts.filter((p) => {
      // 状态筛选
      if (statusFilter === "published" && p.status === "draft") return false;
      if (statusFilter === "draft" && p.status !== "draft") return false;

      // 分类筛选
      if (selectedCategory === "all") return true;
      if (selectedCategory === "岁岁念") return p.category === "岁岁念" || !p.category;
      return p.category === selectedCategory;
    });
  }, [momentPosts, statusFilter, selectedCategory]);

  if (loading) {
    return (
      <div className="divide-hairline rounded-xl bg-white dark:bg-adm-card">
        {Array.from({ length: 4 }).map((_, i) => (
          <PostCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="rounded-2xl border border-dashed border-adm-border bg-adm-card px-4 py-16 text-center">
        <p className="text-sm text-adm-danger">{loadError}</p>
        <button
          type="button"
          onClick={fetchPosts}
          className="mt-4 rounded-lg bg-adm-primary px-3 py-2 text-xs font-medium text-adm-primary-text transition-opacity hover:opacity-90"
        >
          重试
        </button>
      </div>
    );
  }

  const publishedCount = momentPosts.filter((p) => p.status !== "draft").length;

  const draftCount = momentPosts.filter((p) => p.status === "draft").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-adm-text">{title}</h2>
          <p className="mt-1 text-sm text-adm-text-secondary">
            {description || `共 ${filteredPosts.length} 条动态内容`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          {token && (
            <button
              type="button"
              onClick={() => setShowPublish(true)}
              className="adm-btn adm-btn--primary"
            >
              <Plus className="h-4 w-4" />
              <span>发布动态</span>
            </button>
          )}
        </div>
      </div>

      {/* 筛选工具栏：状态切换与分类筛选 */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
        {/* 状态筛选（全部 / 已发布 / 草稿箱） */}
        <div className="flex items-center gap-1 rounded-xl border border-adm-border bg-adm-card p-1 self-start sm:self-auto">
          {[
            { key: "all", label: "全部", count: momentPosts.length },
            { key: "published", label: "已发布", count: publishedCount },
            { key: "draft", label: "草稿箱", count: draftCount },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => {
                setStatusFilter(tab.key as "all" | "published" | "draft");
                setPage(1);
              }}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-all cursor-pointer ${
                statusFilter === tab.key
                  ? "bg-adm-primary text-adm-primary-text shadow-xs"
                  : "text-adm-text-secondary hover:text-adm-text"
              }`}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>

        {/* 分类快捷筛选 */}
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-adm-border bg-adm-card p-1 self-start sm:self-auto">
          <span className="text-[11px] text-adm-text-secondary pl-1.5 pr-0.5">分类:</span>
          {categoryTabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => {
                setSelectedCategory(tab.key);
                setPage(1);
              }}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-all cursor-pointer ${
                selectedCategory === tab.key
                  ? "bg-adm-primary text-adm-primary-text shadow-xs"
                  : "text-adm-text-secondary hover:text-adm-text"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {filteredPosts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-adm-border bg-adm-card py-12 text-center">
          <p className="text-sm text-adm-text-tertiary">
            {statusFilter === "draft" ? "草稿箱暂无内容" : "暂无该分类内容"}
          </p>
        </div>
      ) : (
        <div className="gap-3 sm:columns-2">
          {filteredPosts.map((post, index) => (
            <div key={post.id} className="mb-3 break-inside-avoid overflow-hidden rounded-2xl border border-adm-border bg-adm-card">
              <PostCard post={post} index={index} onDelete={() => handleDelete(post.id)} />
              <ActionBar
                post={post}
                permId={permId}
                pinningId={pinningId}
                deletingId={deletingId}
                updatingStatusId={updatingStatusId}
                onDelete={handleDelete}
                onPin={handlePin}
                onTogglePerm={handleTogglePermission}
                onToggleStatus={handleToggleStatus}
                onEdit={async () => {
                  try {
                    const res = await apiFetch(`/posts/${post.id}`);
                    if (res.ok) {
                      const full = await res.json();
                      setEditingPost(full);
                      return;
                    }
                  } catch {
                    // fallback
                  }
                  setEditingPost(post);
                }}
              />
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-1">
          <button
            type="button"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={page <= 1}
            className="rounded-lg border border-adm-border bg-adm-card px-3 py-1.5 text-xs font-medium text-adm-text disabled:opacity-50 cursor-pointer"
          >
            上一页
          </button>
          <span className="text-xs text-adm-text-secondary">
            第 {page} / {totalPages} 页（共 {totalCount} 条）
          </span>
          <button
            type="button"
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            disabled={page >= totalPages}
            className="rounded-lg border border-adm-border bg-adm-card px-3 py-1.5 text-xs font-medium text-adm-text disabled:opacity-50 cursor-pointer"
          >
            下一页
          </button>
        </div>
      )}

      {/* 发表动态弹窗：自动携带当前选中的分类标签（如点日常则默认日常） */}
      {showPublish && token && (
        <PublishModal
          token={token}
          defaultCategory={selectedCategory !== "all" ? selectedCategory : "日常"}
          onClose={() => setShowPublish(false)}
          onPublished={() => {
            setShowPublish(false);
            fetchPosts();
          }}
        />
      )}

      {/* 编辑已有动态/草稿弹窗 */}
      {editingPost && token && (
        <PublishModal
          token={token}
          editPost={editingPost}
          defaultCategory={editingPost.category || "日常"}
          onClose={() => setEditingPost(null)}
          onPublished={() => {
            setEditingPost(null);
            fetchPosts();
          }}
        />
      )}
    </div>
  );
}

/** Admin action bar */
function ActionBar({
  post,
  permId,
  pinningId,
  deletingId,
  updatingStatusId,
  onDelete,
  onPin,
  onTogglePerm,
  onToggleStatus,
  onEdit,
}: {
  post: Post;
  permId: string | null;
  pinningId: string | null;
  deletingId: string | null;
  updatingStatusId: string | null;
  onDelete: (id: string) => void;
  onPin: (id: string, pinned: boolean) => void;
  onTogglePerm: (id: string, field: "likesDisabled" | "commentsDisabled", current: boolean) => void;
  onToggleStatus: (id: string, currentStatus?: "published" | "draft") => void;
  onEdit: () => void;
}) {
  const isProject = post.category === "项目" || post.type === "project";
  const isArticle = post.type === "article";
  const canonicalUrl = isProject
    ? `/projects/${post.shortId || post.id}`
    : isArticle
    ? `/articles/${post.shortId || post.id}`
    : `/moments/${post.shortId || post.id}`;

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5 sm:gap-2 border-t border-adm-border bg-adm-card-hover/40 px-3 sm:px-4 py-2.5">
      {/* 预览入口 */}
      <Link
        href={canonicalUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1 rounded-lg border border-adm-border bg-adm-card px-2.5 py-1.5 text-xs font-medium text-adm-text-secondary transition-colors hover:bg-adm-card-hover hover:text-adm-text cursor-pointer"
        title={`在前端预览${isProject ? "项目" : isArticle ? "文章" : "动态"}`}
      >
        <ExternalLink className="h-3.5 w-3.5" />
        预览
      </Link>

      {/* 一键发布 / 下架切换 */}
      <button
        type="button"
        onClick={() => onToggleStatus(post.id, post.status)}
        disabled={updatingStatusId === post.id}
        className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition cursor-pointer shrink-0 ${
          post.status === "draft"
            ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-300/40"
            : "bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-300/40"
        }`}
        title={post.status === "draft" ? "一键发布此草稿" : "下架并转为草稿"}
      >
        {updatingStatusId === post.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        <span>{post.status === "draft" ? "发布" : "下架"}</span>
      </button>

      {/* 编辑入口 */}
      <button
        type="button"
        onClick={onEdit}
        className="flex items-center gap-1 rounded-lg border border-adm-border bg-adm-card px-2.5 py-1.5 text-xs font-medium text-adm-text-secondary transition-colors hover:bg-adm-card-hover hover:text-adm-text cursor-pointer"
        title="编辑动态"
      >
        <PenLine className="h-3.5 w-3.5" />
        编辑
      </button>

      {!isProject && (
        <>
          <button
            onClick={() => onTogglePerm(post.id, "likesDisabled", !!post.likesDisabled)}
            disabled={permId === post.id}
            title={post.likesDisabled ? "已关闭点赞，点击开启" : "允许点赞，点击关闭"}
            className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 cursor-pointer ${
              post.likesDisabled
                ? "border-red-200 dark:border-red-900/40 text-adm-danger bg-adm-danger-bg"
                : "border-adm-border bg-adm-card text-adm-text-secondary hover:bg-adm-card-hover hover:text-adm-text"
            }`}
          >
            <Heart className="h-3.5 w-3.5" />
            {post.likesDisabled ? "点赞关" : "点赞"}
          </button>
          <button
            onClick={() => onTogglePerm(post.id, "commentsDisabled", !!post.commentsDisabled)}
            disabled={permId === post.id}
            title={post.commentsDisabled ? "已关闭评论，点击开启" : "允许评论，点击关闭"}
            className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 cursor-pointer ${
              post.commentsDisabled
                ? "border-red-200 dark:border-red-900/40 text-adm-danger bg-adm-danger-bg"
                : "border-adm-border bg-adm-card text-adm-text-secondary hover:bg-adm-card-hover hover:text-adm-text"
            }`}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            {post.commentsDisabled ? "评论关" : "评论"}
          </button>
        </>
      )}

      <button
        onClick={() => onPin(post.id, !!post.pinned)}
        disabled={pinningId === post.id}
        className="flex items-center gap-1 rounded-lg border border-adm-border bg-adm-card px-2.5 py-1.5 text-xs font-medium text-adm-text-secondary transition-colors hover:bg-adm-card-hover hover:text-adm-text disabled:opacity-50 cursor-pointer"
      >
        {post.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
        {pinningId === post.id ? "..." : post.pinned ? "取消置顶" : "置顶"}
      </button>
      <button
        onClick={() => onDelete(post.id)}
        disabled={deletingId === post.id}
        className="flex items-center gap-1 rounded-lg border border-red-200 dark:border-red-900/40 bg-adm-danger-bg px-2.5 py-1.5 text-xs font-medium text-adm-danger transition-colors hover:bg-red-100 dark:hover:bg-red-950/50 disabled:opacity-50 cursor-pointer"
      >
        <Trash2 className="h-3.5 w-3.5" />
        {deletingId === post.id ? "..." : "删除"}
      </button>
    </div>
  );
}
