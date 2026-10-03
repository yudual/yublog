"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  Code2,
  Plus,
  Trash2,
  Loader2,
  ExternalLink,
  Pin,
  PinOff,
  Search,
  X,
  PenLine,
  FolderGit2,
  Tag,
  Globe,
} from "lucide-react";
import { apiFetch } from "@/lib/api-fetch";
import { toAbsoluteUrl } from "@/lib/upload";
import { formatArticleTime } from "@/lib/time-format";
import { notifyContentUpdated } from "@/lib/content-sync";
import { toSafeHttpUrl, toSafeImageUrl } from "@/lib/web-url";

interface ProjectListItem {
  id: string;
  shortId: string;
  type: string;
  title: string;
  excerpt: string;
  cover: string;
  category: string;
  content: string;
  repostUrl: string;
  linkCard: { url: string; title: string; description: string; image: string; siteName: string } | null;
  images: string[];
  pinned: boolean;
  status: "published" | "draft";
  createdAt: string;
  author: string;
}

function parseTagsFromContent(content: string, text: string): string[] {
  const match = content.match(/<!--\s*tags:\s*([^\n>]+)\s*-->/i);
  if (match && match[1]) {
    const list = match[1]
      .split(/[,，、]/)
      .map((t) => t.trim())
      .filter(Boolean);
    if (list.length > 0) return list.slice(0, 5);
  }
  const knownTags = [
    ["next.js", "Next.js"],
    ["react", "React"],
    ["typescript", "TypeScript"],
    ["javascript", "JavaScript"],
    ["sqlite", "SQLite"],
    ["markdown", "Markdown"],
    ["node.js", "Node.js"],
    ["tailwind", "Tailwind CSS"],
    ["python", "Python"],
    ["go", "Go"],
    ["docker", "Docker"],
  ] as const;
  const searchable = `${content} ${text}`.toLowerCase();
  const found = knownTags.filter(([needle]) => searchable.includes(needle)).map(([, label]) => label);
  return found.length > 0 ? found.slice(0, 4) : ["独立开发"];
}

export default function AdminProjectsPage() {
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [pinning, setPinning] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "published" | "draft">("all");

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await apiFetch(`/admin/posts?category=${encodeURIComponent("项目")}&limit=50`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "加载项目失败");
      }
      const data = await res.json();
      setProjects(data.data || []);
    } catch (err) {
      console.error("加载项目列表异常:", err);
      setProjects([]);
      setLoadError(err instanceof Error ? err.message : "项目加载失败，请重试");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const handleDelete = useCallback(async (id: string, name: string) => {
    if (!confirm(`确定要删除项目「${name || "未命名"}」吗？删除后前台将不再展示。`)) return;
    setDeleting(id);
    try {
      const res = await apiFetch(`/posts/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("删除失败");
      setProjects((prev) => prev.filter((p) => p.id !== id));
      notifyContentUpdated();
    } catch (err) {
      alert(err instanceof Error ? err.message : "删除项目失败");
    } finally {
      setDeleting(null);
    }
  }, []);

  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);

  const handlePin = useCallback(async (id: string, currentPinned: boolean) => {
    setPinning(id);
    try {
      const res = await apiFetch(`/posts/${id}/pin`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned: !currentPinned }),
      });
      if (!res.ok) throw new Error("操作失败");
      const data = await res.json();
      setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, pinned: !!data.pinned } : p)));
      notifyContentUpdated();
    } catch (err) {
      alert(err instanceof Error ? err.message : "操作失败");
    } finally {
      setPinning(null);
    }
  }, []);

  const handleToggleStatus = useCallback(async (id: string, currentStatus: "published" | "draft") => {
    const nextStatus = currentStatus === "published" ? "draft" : "published";
    setUpdatingStatusId(id);
    try {
      const res = await apiFetch(`/posts/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!res.ok) throw new Error("切换发布状态失败");
      setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, status: nextStatus } : p)));
      notifyContentUpdated();
    } catch (err) {
      alert(err instanceof Error ? err.message : "状态切换失败");
    } finally {
      setUpdatingStatusId(null);
    }
  }, []);

  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      if (statusFilter === "published" && p.status !== "published") return false;
      if (statusFilter === "draft" && p.status !== "draft") return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = (p.title || "").toLowerCase().includes(q);
        const matchExcerpt = (p.excerpt || "").toLowerCase().includes(q);
        const matchContent = (p.content || "").toLowerCase().includes(q);
        if (!matchTitle && !matchExcerpt && !matchContent) return false;
      }
      return true;
    });
  }, [projects, statusFilter, searchQuery]);

  return (
    <div className="space-y-4">
      {/* 顶部标题与新建项目按钮 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-adm-text flex items-center gap-2">
            <Code2 className="h-5 w-5 text-emerald-600" />
            <span>项目管理</span>
          </h1>
          <p className="mt-0.5 text-sm text-adm-text-secondary">
            管理在前台「项目」频道与首页展示的开源作品、独立产品与代码项目
          </p>
        </div>
        <Link
          href="/admin/projects/new"
          className="flex items-center justify-center gap-1.5 rounded-xl bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700 dark:bg-white dark:text-gray-900 dark:hover:bg-emerald-200 self-start sm:self-auto cursor-pointer shadow-xs"
        >
          <Plus className="h-4 w-4" />
          新建项目
        </Link>
      </div>

      {/* 筛选与搜索栏 */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* 状态 Tabs */}
        <div className="flex items-center gap-1 rounded-xl border border-adm-border bg-adm-card p-1 self-start sm:self-auto">
          {[
            { key: "all", label: "全部", count: projects.length },
            { key: "published", label: "已发布", count: projects.filter((p) => p.status === "published").length },
            { key: "draft", label: "草稿箱", count: projects.filter((p) => p.status === "draft").length },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setStatusFilter(tab.key as "all" | "published" | "draft")}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all cursor-pointer ${
                statusFilter === tab.key
                  ? "bg-adm-primary text-adm-primary-text shadow-xs"
                  : "text-adm-text-secondary hover:text-adm-text"
              }`}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>

        {/* 搜索框 */}
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-adm-text-tertiary" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索项目名称或简介..."
            className="w-full rounded-xl border border-adm-border bg-adm-card pl-8 pr-8 py-1.5 text-xs text-adm-text placeholder:text-adm-text-tertiary focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-adm-text-tertiary hover:text-adm-text cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* 项目列表 */}
      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-adm-text-tertiary" />
        </div>
      ) : loadError ? (
        <div className="rounded-2xl border border-dashed border-adm-border bg-adm-card px-4 py-16 text-center">
          <p className="text-sm text-adm-danger">{loadError}</p>
          <button
            type="button"
            onClick={fetchProjects}
            className="mt-4 rounded-lg bg-adm-primary px-3 py-2 text-xs font-medium text-adm-primary-text transition-opacity hover:opacity-90"
          >
            重试
          </button>
        </div>
      ) : projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-adm-border bg-adm-card py-20">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-adm-input">
            <Code2 className="h-7 w-7 text-adm-text-tertiary" />
          </div>
          <p className="mt-3 text-sm text-adm-text-secondary">还没有添加任何项目作品</p>
          <Link
            href="/admin/projects/new"
            className="mt-4 text-sm font-medium text-emerald-600 hover:underline"
          >
            添加第一个独立项目 →
          </Link>
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-adm-border bg-adm-card py-16 text-center">
          <p className="text-sm text-adm-text-secondary">没有找到符合条件的项目</p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery("");
              setStatusFilter("all");
            }}
            className="mt-3 text-xs text-emerald-600 hover:underline cursor-pointer"
          >
            重置筛选条件
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredProjects.map((project) => {
            const displayTitle = project.title?.trim() || project.linkCard?.title?.trim() || "未命名项目";
            const displayExcerpt = project.excerpt?.trim() || project.content || "暂无简介";
            const coverImage = toSafeImageUrl(project.cover || project.images?.[0] || project.linkCard?.image);
            const demoUrl = toSafeHttpUrl(project.linkCard?.url);
            const repoUrl = toSafeHttpUrl(project.repostUrl);
            const tags = parseTagsFromContent(project.content, displayExcerpt);

            return (
              <div
                key={project.id}
                className="group flex flex-col justify-between overflow-hidden rounded-2xl border border-adm-border bg-adm-card p-4 transition-all hover:border-adm-border/80 hover:shadow-sm"
              >
                <div>
                  {/* 顶栏：封面图 + 核心信息 */}
                  <div className="flex gap-3.5">
                    {/* 封面预览 */}
                    <div className="relative h-20 w-28 shrink-0 overflow-hidden rounded-xl border border-adm-border/60 bg-adm-input flex items-center justify-center">
                      {coverImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={toAbsoluteUrl(coverImage)}
                          alt={displayTitle}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <Code2 className="h-6 w-6 text-adm-text-tertiary" />
                      )}
                    </div>

                    {/* 标题、徽章与简介 */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <h3 className="truncate font-semibold text-sm text-adm-text group-hover:text-emerald-600 transition-colors">
                          {displayTitle}
                        </h3>
                        {project.pinned && (
                          <span className="shrink-0 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
                            置顶
                          </span>
                        )}
                        {project.status === "draft" && (
                          <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">
                            草稿
                          </span>
                        )}
                      </div>

                      <p className="mt-1 line-clamp-2 text-xs text-adm-text-secondary leading-relaxed">
                        {displayExcerpt}
                      </p>
                    </div>
                  </div>

                  {/* 技术栈标签 */}
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <Tag className="h-3 w-3 text-adm-text-tertiary" />
                    {tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-md bg-adm-input px-1.5 py-0.5 text-[10px] text-adm-text-secondary font-mono"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>

                  {/* 关键外链快速预览 */}
                  <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[11px]">
                    {demoUrl && (
                      <a
                        href={demoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-emerald-600 hover:underline"
                      >
                        <Globe className="h-3 w-3" />
                        <span className="truncate max-w-[140px]">体验地址</span>
                      </a>
                    )}
                    {repoUrl && (
                      <a
                        href={repoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-adm-text-secondary hover:text-adm-text"
                      >
                        <FolderGit2 className="h-3 w-3" />
                        <span className="truncate max-w-[140px]">开源仓库</span>
                      </a>
                    )}
                  </div>
                </div>

                {/* 底栏：时间与操作按键 */}
                <div className="mt-4 flex items-center justify-between border-t border-adm-border/50 pt-2.5 text-xs text-adm-text-tertiary">
                  <span>{formatArticleTime(project.createdAt)}</span>

                  <div className="flex items-center gap-1">
                    {/* 查看前台 */}
                    {project.status === "published" && (
                      <Link
                        href={`/projects/${project.shortId || project.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-adm-text-secondary hover:bg-adm-input hover:text-adm-text"
                        title="前台查看"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    )}

                    {/* 置顶切换 */}
                    {project.status === "published" && (
                      <button
                        type="button"
                        onClick={() => handlePin(project.id, !!project.pinned)}
                        disabled={pinning === project.id}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-adm-text-secondary hover:bg-adm-input hover:text-adm-text disabled:opacity-50 cursor-pointer"
                        title={project.pinned ? "取消置顶" : "置顶项目"}
                      >
                        {pinning === project.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : project.pinned ? (
                          <PinOff className="h-3.5 w-3.5" />
                        ) : (
                          <Pin className="h-3.5 w-3.5" />
                        )}
                      </button>
                    )}

                    {/* 一键切换发布/草稿状态 */}
                    <button
                      type="button"
                      onClick={() => handleToggleStatus(project.id, project.status)}
                      disabled={updatingStatusId === project.id}
                      className={`px-2 py-0.5 text-xs rounded-md font-medium transition cursor-pointer flex items-center gap-1 shrink-0 ${
                        project.status === "draft"
                          ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-300/40"
                          : "bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-300/40"
                      }`}
                      title={project.status === "draft" ? "一键发布此草稿" : "下架并转为草稿"}
                    >
                      {updatingStatusId === project.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : null}
                      <span>{project.status === "draft" ? "发布" : "下架"}</span>
                    </button>

                    {/* 编辑项目 */}
                    <Link
                      href={`/admin/projects/${project.id}`}
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-adm-text-secondary hover:bg-adm-input hover:text-adm-text"
                      title="编辑项目"
                    >
                      <PenLine className="h-3.5 w-3.5" />
                    </Link>

                    {/* 删除项目 */}
                    <button
                      type="button"
                      onClick={() => handleDelete(project.id, displayTitle)}
                      disabled={deleting === project.id}
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-adm-text-secondary hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10 disabled:opacity-50 cursor-pointer"
                      title="删除项目"
                    >
                      {deleting === project.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
