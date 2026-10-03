"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Loader2,
  ExternalLink,
  FolderGit2,
  Save,
  CheckCircle2,
  Pin,
  Image as ImageIcon,
  SlidersHorizontal,
  FolderOpen,
  Upload,
  Sparkles,
  Eye,
} from "lucide-react";
import { apiFetch, getToken } from "@/lib/api-fetch";
import { uploadImage, toAbsoluteUrl } from "@/lib/upload";
import { extractFirstMarkdownImage } from "@/lib/post-image";
import MarkdownEditor from "@/components/editor/MarkdownEditor";
import MediaPicker from "@/components/MediaPicker";

interface ProjectEditorPageProps {
  projectId?: string;
}

const DEFAULT_MARKDOWN_TEMPLATE = `# 项目名称

一句话介绍这个项目是做什么的。

- **在线演示**：https://example.com
- **开源仓库**：https://github.com/username/project
- **核心技术**：Next.js, React, TypeScript

## 核心特性
- 特性一
- 特性二

## 项目说明
架构选型、设计思路，或贴一张项目截图：
![项目预览图](https://picsum.photos/seed/projectpreview/1200/600)
`;

export default function ProjectEditorPage({ projectId }: ProjectEditorPageProps) {
  const router = useRouter();
  const isEdit = !!projectId;

  const [title, setTitle] = useState("");
  const [demoUrl, setDemoUrl] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [cover, setCover] = useState("");
  const [markdown, setMarkdown] = useState(isEdit ? "" : DEFAULT_MARKDOWN_TEMPLATE);
  const [pinned, setPinned] = useState(false);
  const [showSettings, setShowSettings] = useState(true);
  const [currentStatus, setCurrentStatus] = useState<"published" | "draft">("published");
  const [saveFeedback, setSaveFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState<null | "published" | "draft">(null);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [showCoverUrlInput, setShowCoverUrlInput] = useState(false);

  const coverInputRef = useRef<HTMLInputElement | null>(null);

  // 加载编辑数据
  useEffect(() => {
    if (!projectId) return;
    (async () => {
      try {
        const res = await apiFetch(`/posts/${projectId}`);
        if (!res.ok) throw new Error("加载项目失败");
        const data = await res.json();

        setTitle(data.title || "");
        setDemoUrl(data.linkCard?.url || "");
        setRepoUrl(data.repostUrl || "");
        setCover(data.cover || "");
        setPinned(!!data.pinned);
        setCurrentStatus(data.status || "published");

        // 如果正文开头有 tags 标记，提取但保持正文纯净
        let rawContent = data.content || "";
        rawContent = rawContent.replace(/<!--\s*tags:\s*[^\n>]*-->\n?/gi, "");
        setMarkdown(rawContent);
      } catch (err) {
        alert(err instanceof Error ? err.message : "加载失败");
        router.push("/admin/projects");
      } finally {
        setLoading(false);
      }
    })();
  }, [projectId, router]);

  // 上传封面
  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const token = getToken();
    if (!token) {
      alert("请先登录管理后台");
      return;
    }
    setUploadingCover(true);
    try {
      const url = await uploadImage(file, token);
      setCover(url);
    } catch (err: any) {
      alert(err.message || "封面上传失败");
    } finally {
      setUploadingCover(false);
      if (coverInputRef.current) coverInputRef.current.value = "";
    }
  };

  // 从 Markdown 自动提取摘要与标签
  const parseMetadataFromMarkdown = () => {
    const lines = markdown.split("\n").map((l) => l.trim()).filter(Boolean);
    const autoFirstImage = extractFirstMarkdownImage(markdown);

    const textLines = lines.filter(
      (l) => !l.startsWith("#") && !l.startsWith("!") && !l.startsWith("-") && !l.startsWith(">")
    );
    const autoExcerpt = textLines[0] || (title ? `${title} 项目作品` : "个人独立开发项目作品");

    const knownTags = [
      "Next.js",
      "React",
      "TypeScript",
      "JavaScript",
      "Tailwind CSS",
      "Vue",
      "Node.js",
      "Express",
      "Python",
      "Go",
      "Docker",
      "MySQL",
      "PostgreSQL",
      "AI",
    ];
    const foundTags = knownTags.filter((t) => markdown.toLowerCase().includes(t.toLowerCase()));

    return { autoFirstImage, autoExcerpt, foundTags };
  };

  const handleSave = async (
    targetStatus: "published" | "draft",
    options: { stay?: boolean } = {}
  ) => {
    let finalTitle = title.trim();
    if (!finalTitle) {
      const h1Match = markdown.match(/^#\s+(.+)$/m);
      if (h1Match) finalTitle = h1Match[1].trim();
    }

    if (!finalTitle) {
      alert("请填写项目名称（或在 Markdown 第一行写 # 项目名称）");
      return;
    }

    setSaving(targetStatus);
    try {
      const { autoFirstImage, autoExcerpt, foundTags } = parseMetadataFromMarkdown();
      const finalCover = cover.trim();

      // 在正文隐藏嵌入 tags 标记以供前台解析
      let finalContent = markdown.trim();
      if (foundTags.length > 0) {
        finalContent = `<!-- tags: ${foundTags.join(", ")} -->\n` + finalContent;
      }

      const linkCard = demoUrl.trim()
        ? {
            url: demoUrl.trim(),
            title: finalTitle,
            description: autoExcerpt,
            image: finalCover || autoFirstImage || "",
            siteName: "在线演示",
          }
        : null;

      const payload = {
        type: "article",
        category: "项目",
        title: finalTitle,
        excerpt: autoExcerpt,
        cover: finalCover,
        content: finalContent,
        linkCard,
        repostUrl: repoUrl.trim(),
        pinned,
        status: targetStatus,
      };

      let targetId = projectId;
      if (isEdit) {
        const res = await apiFetch(`/posts/${projectId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.message || "保存项目失败");
        }
      } else {
        const res = await apiFetch(`/posts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.message || "发布项目失败");
        }
        const created = await res.json();
        targetId = created.id;
      }

      setCurrentStatus(targetStatus);

      if (options.stay) {
        setSaveFeedback({
          type: "success",
          message: targetStatus === "draft" ? "草稿已安全保存" : "项目已成功发布并同步至前台",
        });
        if (!isEdit && targetId) {
          window.history.replaceState(null, "", `/admin/projects/${targetId}`);
        }
        setTimeout(() => setSaveFeedback(null), 3500);
      } else {
        router.push("/admin/projects");
        router.refresh();
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "操作失败");
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-adm-text-tertiary" />
      </div>
    );
  }

  const token = getToken() || "";

  return (
    <div className="mx-auto flex max-w-7xl flex-col space-y-3 pb-6">
      {/* 顶部极简操作栏 */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-adm-border pb-3">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/projects"
            className="adm-icon-btn !h-8.5 !w-8.5 shrink-0"
            title="返回项目列表"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <span className="text-sm font-semibold text-adm-text">
            {isEdit ? "编辑项目" : "新建项目"}
          </span>

          {/* 状态标识 */}
          <span
            className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold border select-none ${
              currentStatus === "draft"
                ? "border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-300"
                : "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
            }`}
          >
            {currentStatus === "draft" ? "草稿箱" : "已发布"}
          </span>
        </div>

        {/* 右侧：扩展设置与发布 */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowSettings(!showSettings)}
            className={`adm-btn !h-8.5 !px-3 text-xs ${
              showSettings
                ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                : "adm-btn--secondary"
            }`}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span>{showSettings ? "收起设置" : "外链与封面"}</span>
            {cover && (
              <span className="ml-0.5 flex h-2 w-2 rounded-full bg-emerald-500" title="已设置专属封面" />
            )}
          </button>

          <button
            type="button"
            onClick={() => handleSave("draft", { stay: true })}
            disabled={!!saving}
            className="adm-btn adm-btn--secondary !h-8.5 !px-3 text-xs"
            title="保存草稿 (Ctrl+S)"
          >
            {saving === "draft" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            <span>存草稿</span>
          </button>

          {isEdit && currentStatus === "published" && (
            <button
              type="button"
              onClick={() => handleSave("draft")}
              disabled={!!saving}
              className="hidden sm:inline-flex adm-btn !h-8.5 !px-3 text-xs border border-amber-300/60 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 hover:bg-amber-100"
              title="下架此项目并转为草稿"
            >
              <span>下架为草稿</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => handleSave("published")}
            disabled={!!saving}
            className="adm-btn adm-btn--primary !h-8.5 !px-4 text-xs font-semibold"
          >
            {saving === "published" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5" />
            )}
            <span>{currentStatus === "published" && isEdit ? "更新项目" : "发布项目"}</span>
          </button>
        </div>
      </div>

      {/* 反馈提示 */}
      {saveFeedback && (
        <div
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-medium transition-all ${
            saveFeedback.type === "success"
              ? "border border-emerald-500/30 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
              : "border border-rose-500/30 bg-rose-50 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300"
          }`}
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{saveFeedback.message}</span>
        </div>
      )}

      {/* 标题栏 */}
      <div className="flex items-center gap-3">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="项目名称（例如：YuBlog 个人博客）..."
          className="flex-1 rounded-xl border border-adm-border bg-adm-card px-4 py-2.5 text-base sm:text-lg font-bold text-adm-text placeholder:text-adm-text-tertiary focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
        />
        <label className="flex items-center gap-1.5 text-xs text-adm-text-secondary cursor-pointer shrink-0 border border-adm-border rounded-xl px-3 py-2.5 bg-adm-card">
          <Pin className="h-3.5 w-3.5" />
          <span>置顶项目</span>
          <input
            type="checkbox"
            checked={pinned}
            onChange={(e) => setPinned(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-adm-border text-emerald-600"
          />
        </label>
      </div>

      {/* 专属封面与外链设置区域 */}
      {showSettings && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 rounded-2xl border border-adm-border bg-adm-card p-4 sm:p-5 shadow-xs animate-fade-in text-xs">
          {/* 1. 项目卡片封面 */}
          <div className="space-y-2 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <label className="font-semibold text-adm-text flex items-center gap-1.5">
                <ImageIcon className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <span>项目卡片封面</span>
              </label>
              <span className="text-[11px] text-adm-text-tertiary">
                用于 /projects 列表卡片展示
              </span>
            </div>

            {cover ? (
              <div className="space-y-2">
                <div className="relative group overflow-hidden rounded-xl border border-adm-border bg-neutral-100 dark:bg-neutral-800 aspect-[16/9] w-full">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={toAbsoluteUrl(cover)}
                    alt="封面预览"
                    className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => coverInputRef.current?.click()}
                      disabled={uploadingCover}
                      className="inline-flex items-center gap-1 rounded-lg bg-white/95 dark:bg-neutral-900/95 text-neutral-900 dark:text-white px-2.5 py-1 text-xs font-medium hover:bg-white transition cursor-pointer"
                    >
                      {uploadingCover ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                      <span>更换</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setMediaPickerOpen(true)}
                      className="inline-flex items-center gap-1 rounded-lg bg-white/95 dark:bg-neutral-900/95 text-neutral-900 dark:text-white px-2.5 py-1 text-xs font-medium hover:bg-white transition cursor-pointer"
                    >
                      <FolderOpen className="h-3 w-3" />
                      <span>图库</span>
                    </button>
                    <a
                      href={toAbsoluteUrl(cover)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-lg bg-white/95 dark:bg-neutral-900/95 text-neutral-900 dark:text-white px-2.5 py-1 text-xs font-medium hover:bg-white transition"
                    >
                      <Eye className="h-3 w-3" />
                      <span>原图</span>
                    </a>
                    <button
                      type="button"
                      onClick={() => setCover("")}
                      className="inline-flex items-center gap-1 rounded-lg bg-rose-600/95 text-white px-2.5 py-1 text-xs font-medium hover:bg-rose-700 transition cursor-pointer"
                    >
                      <span>移除</span>
                    </button>
                  </div>
                </div>
                <input
                  type="text"
                  value={cover}
                  onChange={(e) => setCover(e.target.value)}
                  placeholder="封面图片 URL..."
                  className="w-full rounded-lg border border-adm-border bg-adm-bg px-3 py-1.5 text-xs text-adm-text placeholder:text-adm-text-tertiary focus:outline-none"
                />
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-adm-border bg-adm-bg/50 hover:bg-adm-bg transition p-5 text-center flex flex-col items-center justify-center gap-2 min-h-[150px]">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
                  <ImageIcon className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-xs font-medium text-adm-text">未设置卡片封面</p>
                  <p className="text-[11px] text-adm-text-tertiary mt-0.5">未设置时前台将使用默认代码占位卡片</p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-1.5 mt-1">
                  <button
                    type="button"
                    onClick={() => coverInputRef.current?.click()}
                    disabled={uploadingCover}
                    className="inline-flex items-center gap-1 rounded-lg bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 px-3 py-1 text-xs font-medium hover:bg-emerald-700 dark:hover:bg-emerald-200 transition cursor-pointer"
                  >
                    {uploadingCover ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                    <span>上传图片</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMediaPickerOpen(true)}
                    className="inline-flex items-center gap-1 rounded-lg border border-adm-border bg-adm-card px-2.5 py-1 text-xs font-medium text-adm-text hover:bg-adm-input transition cursor-pointer"
                  >
                    <FolderOpen className="h-3.5 w-3.5" />
                    <span>媒体库</span>
                  </button>
                  {extractFirstMarkdownImage(markdown) && (
                    <button
                      type="button"
                      onClick={() => setCover(extractFirstMarkdownImage(markdown))}
                      className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-50/60 dark:bg-emerald-950/30 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100/60 transition cursor-pointer"
                    >
                      <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                      <span>提取正文首图</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowCoverUrlInput(!showCoverUrlInput)}
                    className="rounded-lg border border-adm-border bg-adm-card px-2.5 py-1 text-xs font-medium text-adm-text-secondary hover:text-adm-text transition cursor-pointer"
                  >
                    {showCoverUrlInput ? "收起" : "输入 URL"}
                  </button>
                </div>
                {showCoverUrlInput && (
                  <input
                    type="text"
                    value={cover}
                    onChange={(e) => setCover(e.target.value)}
                    placeholder="https://... 图片链接"
                    className="w-full max-w-sm mt-1 rounded-lg border border-adm-border bg-adm-card px-2.5 py-1.5 text-xs text-adm-text placeholder:text-adm-text-tertiary focus:outline-none"
                  />
                )}
              </div>
            )}

            <input
              ref={coverInputRef}
              type="file"
              accept="image/*"
              onChange={handleCoverUpload}
              className="hidden"
            />
          </div>

          {/* 2. 项目外链与相关设置 */}
          <div className="space-y-3 flex flex-col justify-between">
            <div className="space-y-3">
              <label className="font-semibold text-adm-text block">项目外链与部署</label>

              <div>
                <label className="block text-adm-text-secondary mb-1 flex items-center gap-1">
                  <ExternalLink className="h-3 w-3 text-emerald-600" />
                  <span>在线体验地址 (Demo URL)</span>
                </label>
                <input
                  type="url"
                  value={demoUrl}
                  onChange={(e) => setDemoUrl(e.target.value)}
                  placeholder="https://your-demo.com"
                  className="w-full rounded-lg border border-adm-border bg-adm-bg px-2.5 py-1.5 text-xs text-adm-text placeholder:text-adm-text-tertiary focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-adm-text-secondary mb-1 flex items-center gap-1">
                  <FolderGit2 className="h-3 w-3 text-emerald-600" />
                  <span>开源仓库地址 (GitHub / Gitee)</span>
                </label>
                <input
                  type="url"
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  placeholder="https://github.com/username/project"
                  className="w-full rounded-lg border border-adm-border bg-adm-bg px-2.5 py-1.5 text-xs text-adm-text placeholder:text-adm-text-tertiary focus:outline-none"
                />
              </div>
            </div>

            <div className="rounded-xl border border-adm-border/60 bg-adm-bg/40 p-3 text-[11px] text-adm-text-tertiary space-y-1">
              <p className="font-medium text-adm-text-secondary">关于项目卡片与详情页：</p>
              <p>• 封面仅在前台 <span className="font-mono text-emerald-600 dark:text-emerald-400">/projects</span> 列表卡片作为视觉预览展示。</p>
              <p>• 正式项目介绍页面将直接呈现下方的 Markdown 正文，纯粹专业无多余大图干扰。</p>
            </div>
          </div>
        </div>
      )}

      {/* 现代化的 Markdown 写作与分屏预览组件 */}
      <MarkdownEditor
        value={markdown}
        onChange={setMarkdown}
        token={token}
        onSave={() => handleSave(currentStatus === "draft" ? "draft" : "published", { stay: true })}
        placeholder="在此编写项目技术架构、设计思路、快速开始及项目截图..."
        minHeight="640px"
      />

      {/* 媒体库选择弹窗 */}
      <MediaPicker
        open={mediaPickerOpen}
        onClose={() => setMediaPickerOpen(false)}
        onSelect={(item) => {
          setCover(item.url);
          setMediaPickerOpen(false);
        }}
        category="image"
      />
    </div>
  );
}
