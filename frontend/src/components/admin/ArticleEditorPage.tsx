"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Loader2,
  X,
  Image as ImageIcon,
  Heart,
  MessageSquare,
  Pin,
  FolderOpen,
  SlidersHorizontal,
  CheckCircle2,
  AlertCircle,
  Save,
  Upload,
  Calendar,
  Trash2,
  Clock,
  FileText,
  Check,
  ExternalLink,
  ChevronRight,
  Eye,
  RotateCcw,
} from "lucide-react";
import MarkdownEditor from "@/components/editor/MarkdownEditor";
import MediaPicker from "@/components/MediaPicker";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import AdminModal from "@/components/admin/AdminModal";
import { apiFetch, getToken } from "@/lib/api-fetch";
import { uploadImage, toAbsoluteUrl } from "@/lib/upload";
import { htmlToMarkdown } from "@/lib/markdown";
import { syncFrontmatterToMarkdown, parseFrontmatter, type ArticleFrontmatter } from "@/lib/frontmatter";
import { calculateReadingStats } from "@/lib/reading-time";
import { extractFirstMarkdownImage } from "@/lib/post-image";
import { buildMusicEmbedHtml, buildLinkCardHtml, buildVideoEmbedHtml } from "@/components/editor/embed-utils";
import { notifyContentUpdated } from "@/lib/content-sync";
import type { LinkCard, PostMusic, PostVideo } from "@/lib/types";
import { formatExactDateTime, toDateTimeLocal, toIsoDateString } from "@/lib/time-format";

interface ArticleEditorPageProps {
  articleId?: string;
}

interface ArticleSnapshot {
  title: string;
  content: string;
  caption: string;
  category: string;
  cover: string;
  articleType: "original" | "repost" | "ai";
  repostUrl: string;
  publishTime: string;
  pinned: boolean;
  likesDisabled: boolean;
  commentsDisabled: boolean;
  region: string;
}

interface DraftArticleItem {
  id: string | number;
  title: string;
  category?: string;
  excerpt?: string;
  content?: string;
  createdAt: string;
  [key: string]: unknown;
}

interface LocalDraftBackup {
  title: string;
  content: string;
  caption: string;
  category: string;
  cover: string;
  articleType: "original" | "repost" | "ai";
  repostUrl: string;
  savedAt: number;
}

const CATEGORY_PRESETS = ["随笔", "技术", "生活", "思考", "折腾"];

export default function ArticleEditorPage({ articleId }: ArticleEditorPageProps) {
  const router = useRouter();
  const [activeArticleId, setActiveArticleId] = useState<string | null>(articleId ?? null);
  const isEdit = Boolean(activeArticleId);

  // 基础内容状态
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [caption, setCaption] = useState("");
  const [cover, setCover] = useState("");
  const [category, setCategory] = useState("随笔");
  const [articleType, setArticleType] = useState<"original" | "repost" | "ai">("original");
  const [repostUrl, setRepostUrl] = useState("");
  const [currentStatus, setCurrentStatus] = useState<"published" | "draft">("published");
  const [publishTime, setPublishTime] = useState<string>(() => toDateTimeLocal());
  const [region, setRegion] = useState("");
  const [likesDisabled, setLikesDisabled] = useState(false);
  const [commentsDisabled, setCommentsDisabled] = useState(false);
  const [pinned, setPinned] = useState(false);

  // 记录已保存快照，用于与当前编辑内容做 diff 避免直接在 render 中访问 ref
  const [savedSnapshot, setSavedSnapshot] = useState<ArticleSnapshot | null>(null);

  // 交互与抽屉状态
  const [showSettingsDrawer, setShowSettingsDrawer] = useState(false);
  const [showDraftBox, setShowDraftBox] = useState(false);
  const [draftArticles, setDraftArticles] = useState<DraftArticleItem[]>([]);
  const [loadingDrafts, setLoadingDrafts] = useState(false);
  const [loading, setLoading] = useState(Boolean(articleId));
  const [saving, setSaving] = useState<null | "published" | "draft">(null);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  // 本地自动草稿与防丢提示
  const [localBackup, setLocalBackup] = useState<LocalDraftBackup | null>(null);
  const [showRestorePrompt, setShowRestorePrompt] = useState(false);

  // 弹窗状态
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [showUnpublishConfirm, setShowUnpublishConfirm] = useState(false);
  const [showImportConfirm, setShowImportConfirm] = useState(false);
  const [pendingImportFile, setPendingImportFile] = useState<File | null>(null);
  const [draftToDelete, setDraftToDelete] = useState<{ id: number | string; title: string } | null>(null);
  const [publishedSuccessInfo, setPublishedSuccessInfo] = useState<{ id: string; title: string } | null>(null);

  // 状态反馈 Toast
  const [saveFeedback, setSaveFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const markdownFileInputRef = useRef<HTMLInputElement | null>(null);
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const titleTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const savedDraftRef = useRef(false);

  const showFeedback = useCallback((type: "success" | "error", message: string) => {
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    setSaveFeedback({ type, message });
    feedbackTimerRef.current = setTimeout(() => {
      setSaveFeedback((curr) => (curr?.message === message ? null : curr));
      feedbackTimerRef.current = null;
    }, 4000);
  }, []);

  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    };
  }, []);

  // 自适应标题文本框高度
  const adjustTitleHeight = useCallback(() => {
    if (titleTextareaRef.current) {
      titleTextareaRef.current.style.height = "auto";
      titleTextareaRef.current.style.height = `${Math.max(titleTextareaRef.current.scrollHeight, 44)}px`;
    }
  }, []);

  useEffect(() => {
    adjustTitleHeight();
  }, [title, adjustTitleHeight]);

  // 计算字数与预计阅读时间
  const readingStats = useMemo(() => {
    const stats = calculateReadingStats(content || "");
    return { count: stats.words, minutes: stats.minutes };
  }, [content]);

  // 判断是否有未保存的改动
  const isDirty = useMemo(() => {
    if (!savedSnapshot) {
      return title.trim().length > 0 || content.trim().length > 0;
    }
    return (
      savedSnapshot.title !== title.trim() ||
      savedSnapshot.content !== content ||
      savedSnapshot.caption !== caption.trim() ||
      savedSnapshot.category !== category.trim() ||
      savedSnapshot.cover !== cover.trim() ||
      savedSnapshot.articleType !== articleType ||
      savedSnapshot.repostUrl !== repostUrl.trim() ||
      savedSnapshot.publishTime !== publishTime ||
      savedSnapshot.pinned !== pinned ||
      savedSnapshot.likesDisabled !== likesDisabled ||
      savedSnapshot.commentsDisabled !== commentsDisabled ||
      savedSnapshot.region !== region.trim()
    );
  }, [
    savedSnapshot,
    title,
    content,
    caption,
    category,
    cover,
    articleType,
    repostUrl,
    publishTime,
    pinned,
    likesDisabled,
    commentsDisabled,
    region,
  ]);

  // 本地自动保存缓存 key
  const autoSaveKey = useMemo(() => {
    return `blog_article_auto_backup_${articleId || "new"}`;
  }, [articleId]);

  // 获取草稿箱数据
  const fetchDraftArticles = useCallback(async () => {
    setLoadingDrafts(true);
    try {
      const res = await apiFetch("/admin/posts?type=article&status=draft&limit=50");
      if (res.ok) {
        const data = await res.json();
        const list = (data.data || []).filter((item: DraftArticleItem) => item.category !== "项目" && (item as Record<string, unknown>).type !== "project");
        setDraftArticles(list);
      }
    } catch {
      // ignore
    } finally {
      setLoadingDrafts(false);
    }
  }, []);

  useEffect(() => {
    fetchDraftArticles();
  }, [fetchDraftArticles]);

  // 检查本地自动保存备份
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(autoSaveKey);
      if (raw) {
        const parsed: LocalDraftBackup = JSON.parse(raw);
        if (Date.now() - parsed.savedAt < 24 * 3600 * 1000 && (parsed.content.trim() || parsed.title.trim())) {
          setLocalBackup(parsed);
          if (!articleId) {
            setShowRestorePrompt(true);
          }
        }
      }
    } catch {
      // ignore
    }
  }, [autoSaveKey, articleId]);

  // 定时将未提交改动自动备份到本地 LocalStorage（每 5 秒防抖）
  useEffect(() => {
    if (typeof window === "undefined") return;
    const timer = setTimeout(() => {
      if (title.trim() || content.trim()) {
        const backup: LocalDraftBackup = {
          title,
          content,
          caption,
          category,
          cover,
          articleType,
          repostUrl,
          savedAt: Date.now(),
        };
        try {
          localStorage.setItem(autoSaveKey, JSON.stringify(backup));
        } catch {
          // ignore
        }
      }
    }, 5000);
    return () => clearTimeout(timer);
  }, [title, content, caption, category, cover, articleType, repostUrl, autoSaveKey]);

  // 恢复本地备份
  const handleRestoreBackup = useCallback(() => {
    if (!localBackup) return;
    setTitle(localBackup.title || "");
    setContent(localBackup.content || "");
    setCaption(localBackup.caption || "");
    if (localBackup.category) setCategory(localBackup.category);
    if (localBackup.cover) setCover(localBackup.cover);
    if (localBackup.articleType) setArticleType(localBackup.articleType);
    if (localBackup.repostUrl) setRepostUrl(localBackup.repostUrl);
    setShowRestorePrompt(false);
    showFeedback("success", "已成功恢复本地未保存草稿！");
  }, [localBackup, showFeedback]);

  const handleDiscardBackup = useCallback(() => {
    try {
      localStorage.removeItem(autoSaveKey);
    } catch {
      // ignore
    }
    setLocalBackup(null);
    setShowRestorePrompt(false);
  }, [autoSaveKey]);

  // 加载已有文章数据
  useEffect(() => {
    if (!articleId) {
      setActiveArticleId(null);
      setTitle("");
      setContent("");
      setCaption("");
      setCover("");
      setCategory("随笔");
      setArticleType("original");
      setRepostUrl("");
      setCurrentStatus("published");
      const initTime = toDateTimeLocal();
      setPublishTime(initTime);
      setRegion("");
      setLikesDisabled(false);
      setCommentsDisabled(false);
      setPinned(false);
      setSavedSnapshot({
        title: "",
        content: "",
        caption: "",
        category: "随笔",
        cover: "",
        articleType: "original",
        repostUrl: "",
        publishTime: initTime,
        pinned: false,
        likesDisabled: false,
        commentsDisabled: false,
        region: "",
      });
      savedDraftRef.current = false;
      setLoading(false);
      return;
    }

    (async () => {
      setLoading(true);
      try {
        const res = await apiFetch(`/posts/${articleId}`);
        if (!res.ok) throw new Error("加载文章数据失败");
        const data = await res.json();
        const rawCaption = data.excerpt || "";
        const isJunkCaption = /^---\s*(?:title|category|tags|articleType):/i.test(rawCaption);
        const cleanCaption = isJunkCaption ? "" : rawCaption;

        const nextTitle = data.title ? data.title.trim() : "";
        const nextCategory = data.category ? data.category.trim() : "随笔";
        const nextCover = data.cover ? data.cover.trim() : "";
        const nextArticleType = (data.articleType as "original" | "repost" | "ai") || "original";
        const nextRepostUrl = data.repostUrl ? data.repostUrl.trim() : "";
        const nextRegion = data.region ? data.region.trim() : "";
        const nextTime = data.createdAt ? toDateTimeLocal(data.createdAt) : toDateTimeLocal();

        setTitle(nextTitle);
        setCaption(cleanCaption);
        setCategory(nextCategory);
        setCurrentStatus(data.status || "published");
        setPublishTime(nextTime);

        let mergedContent = data.content || "";

        if (data.music && !/data-embed="music"/.test(mergedContent)) {
          mergedContent += buildMusicEmbedHtml(data.music as PostMusic);
        }
        if (data.linkCard && !/class="[^"]*link-card[^"]*"/.test(mergedContent)) {
          mergedContent += buildLinkCardHtml(data.linkCard as LinkCard);
        }
        if (data.video && !/data-embed="video"/.test(mergedContent)) {
          mergedContent += buildVideoEmbedHtml(data.video as PostVideo);
        }

        const convertedMd = htmlToMarkdown(mergedContent);
        setContent(convertedMd);

        setCover(nextCover);
        setArticleType(nextArticleType);
        setRepostUrl(nextRepostUrl);
        setRegion(nextRegion);
        setLikesDisabled(!!data.likesDisabled);
        setCommentsDisabled(!!data.commentsDisabled);
        setPinned(!!data.pinned);

        setSavedSnapshot({
          title: nextTitle,
          content: convertedMd,
          caption: cleanCaption,
          category: nextCategory,
          cover: nextCover,
          articleType: nextArticleType,
          repostUrl: nextRepostUrl,
          publishTime: nextTime,
          pinned: !!data.pinned,
          likesDisabled: !!data.likesDisabled,
          commentsDisabled: !!data.commentsDisabled,
          region: nextRegion,
        });

        // 检查本地备份
        const rawLocal = localStorage.getItem(`blog_article_auto_backup_${articleId}`);
        if (rawLocal) {
          const parsedLocal: LocalDraftBackup = JSON.parse(rawLocal);
          if (
            parsedLocal.content &&
            parsedLocal.content !== convertedMd &&
            parsedLocal.savedAt > new Date(data.updatedAt || data.createdAt).getTime()
          ) {
            setLocalBackup(parsedLocal);
            setShowRestorePrompt(true);
          }
        }
      } catch (err) {
        showFeedback("error", err instanceof Error ? err.message : "加载文章失败");
        setTimeout(() => {
          router.push("/admin/articles");
        }, 1500);
      } finally {
        setLoading(false);
      }
    })();
  }, [articleId, router, showFeedback]);

  const lastFmRef = useRef<ArticleFrontmatter>({});

  // 当编辑器解析出 Frontmatter 时同步到各状态
  const handleFrontmatterChange = useCallback((fm: ArticleFrontmatter) => {
    const prev = lastFmRef.current;
    if (fm.title !== undefined && fm.title !== prev.title && typeof fm.title === "string") {
      setTitle(fm.title);
    }
    if (fm.category !== undefined && fm.category !== prev.category && typeof fm.category === "string") {
      setCategory(fm.category);
    }
    if (fm.cover !== undefined && fm.cover !== prev.cover && typeof fm.cover === "string") {
      setCover(fm.cover);
    } else if (prev.cover && (fm.cover === undefined || fm.cover === "")) {
      setCover("");
    }
    if (fm.excerpt !== undefined && fm.excerpt !== prev.excerpt && typeof fm.excerpt === "string") {
      setCaption(fm.excerpt);
    }
    if (fm.date !== undefined && fm.date !== prev.date && typeof fm.date === "string") {
      const parsed = new Date(fm.date);
      if (!isNaN(parsed.getTime())) {
        setPublishTime(toDateTimeLocal(parsed));
      }
    }
    if (fm.articleType && fm.articleType !== prev.articleType && ["original", "repost", "ai"].includes(fm.articleType)) {
      setArticleType(fm.articleType as "original" | "repost" | "ai");
    }
    if (typeof fm.pinned === "boolean" && fm.pinned !== prev.pinned) {
      setPinned(fm.pinned);
    }
    lastFmRef.current = fm;
  }, []);

  // 封面直传处理
  const handleCoverUpload = useCallback(async (file: File) => {
    const token = getToken();
    if (!token) {
      showFeedback("error", "请先登录管理后台");
      return;
    }
    setUploadingCover(true);
    try {
      const url = await uploadImage(file, token);
      setCover(url);
      showFeedback("success", "封面图片已上传");
    } catch (err) {
      showFeedback("error", err instanceof Error ? err.message : "封面上传失败");
    } finally {
      setUploadingCover(false);
    }
  }, [showFeedback]);

  // 从文章内容中提取首张图片作为封面
  const handleExtractCoverFromContent = useCallback(() => {
    const firstImg = extractFirstMarkdownImage(content);
    if (!firstImg) {
      showFeedback("error", "正文中未发现任何图片，请先在编辑器中插入图片");
      return;
    }
    setCover(firstImg);
    showFeedback("success", "已成功提取正文首图为文章封面");
  }, [content, showFeedback]);

  // 移除封面
  const handleRemoveCover = useCallback(() => {
    setCover("");
    showFeedback("success", "已清除封面设置");
  }, [showFeedback]);

  // 保存 / 发布文章核心动作
  const handleSave = useCallback(
    async (targetStatus: "published" | "draft", options: { stay?: boolean } = {}) => {
      const finalTitle = title.trim();
      if (!finalTitle && targetStatus === "published") {
        showFeedback("error", "文章标题不能为空，请输入标题后再发布");
        return;
      }

      setSaving(targetStatus);
      try {
        const finalCover = cover.trim();

        // 统一同步 Frontmatter 到正文头部
        const synchronizedContent = syncFrontmatterToMarkdown(content, {
          title: finalTitle,
          category: category.trim() || "随笔",
          cover: finalCover || undefined,
          excerpt: caption.trim() || undefined,
          articleType,
          repostUrl: articleType === "repost" ? repostUrl.trim() : undefined,
          pinned,
          status: targetStatus,
          date: toIsoDateString(publishTime),
        });

        const body: Record<string, unknown> = {
          type: "article" as const,
          title: finalTitle || "无标题草稿",
          content: synchronizedContent,
          excerpt: caption.trim(),
          cover: finalCover,
          category: category.trim() || "随笔",
          articleType,
          repostUrl: articleType === "repost" ? repostUrl.trim() : "",
          region: region || undefined,
          likesDisabled,
          commentsDisabled,
          pinned,
          status: targetStatus,
          createdAt: toIsoDateString(publishTime),
        };

        let targetId = activeArticleId;
        if (isEdit && activeArticleId) {
          body.music = null;
          body.linkCard = null;
          body.video = null;
          const res = await apiFetch(`/posts/${activeArticleId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.message || "保存文章失败");
          }
        } else {
          const res = await apiFetch(`/posts`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.message || "发布文章失败");
          }
          const created = await res.json();
          targetId = created.id;
          setActiveArticleId(created.id);
        }

        setContent(synchronizedContent);
        setCurrentStatus(targetStatus);
        savedDraftRef.current = true;
        setSavedSnapshot({
          title: finalTitle,
          content: synchronizedContent,
          caption: caption.trim(),
          category: category.trim() || "随笔",
          cover: finalCover,
          articleType,
          repostUrl: articleType === "repost" ? repostUrl.trim() : "",
          publishTime,
          pinned,
          likesDisabled,
          commentsDisabled,
          region: region.trim(),
        });

        // 清理本地自动备份
        try {
          localStorage.removeItem(autoSaveKey);
        } catch {
          // ignore
        }

        notifyContentUpdated();
        fetchDraftArticles();

        if (targetStatus === "published") {
          setPublishedSuccessInfo({
            id: targetId || "",
            title: finalTitle || "文章",
          });
          showFeedback("success", "文章已成功发布并同步至前台！");
          if (targetId && !isEdit) {
            window.history.replaceState(null, "", `/admin/articles/${targetId}`);
          }
        } else {
          showFeedback("success", "草稿已安全保存");
          if (targetId && !isEdit) {
            window.history.replaceState(null, "", `/admin/articles/${targetId}`);
          }
        }

        if (!options.stay && targetStatus === "published") {
          // 预留
        }
      } catch (err) {
        showFeedback("error", err instanceof Error ? err.message : "保存操作失败");
      } finally {
        setSaving(null);
      }
    },
    [
      title,
      content,
      caption,
      cover,
      category,
      articleType,
      repostUrl,
      region,
      likesDisabled,
      commentsDisabled,
      pinned,
      publishTime,
      isEdit,
      activeArticleId,
      autoSaveKey,
      fetchDraftArticles,
      showFeedback,
    ]
  );

  // 返回按钮
  const handleBack = useCallback(() => {
    if (savedDraftRef.current && !isDirty) {
      router.push("/admin/articles");
      return;
    }
    if (isDirty) {
      setShowLeaveModal(true);
      return;
    }
    router.push("/admin/articles");
  }, [isDirty, router]);

  // 全局快捷键
  useEffect(() => {
    const onGlobalKeyDown = (e: globalThis.KeyboardEvent) => {
      // Ctrl+S / Cmd+S 快速存草稿
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        handleSave("draft", { stay: true });
        return;
      }
      // Ctrl+Enter / Cmd+Enter 快速发布
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        handleSave("published", { stay: true });
        return;
      }
      // Esc 关闭属性抽屉
      if (e.key === "Escape" && showSettingsDrawer) {
        setShowSettingsDrawer(false);
      }
    };
    window.addEventListener("keydown", onGlobalKeyDown);
    return () => window.removeEventListener("keydown", onGlobalKeyDown);
  }, [handleSave, showSettingsDrawer]);

  // 页面离开未保存防丢提示
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (savedDraftRef.current && !isDirty) return;
      if (isDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  // 导入 Markdown 文件处理
  const executeImportMarkdown = useCallback(
    async (file: File) => {
      try {
        const text = await file.text();
        const { frontmatter: fm } = parseFrontmatter(text);

        let nextTitle = "";
        if (typeof fm.title === "string" && fm.title.trim()) {
          nextTitle = fm.title.trim();
        } else {
          const h1Match = text.match(/^#\s+(.+)$/m);
          if (h1Match) {
            nextTitle = h1Match[1].trim();
          } else {
            nextTitle = file.name.replace(/\.(md|markdown|txt)$/i, "").trim();
          }
        }

        setTitle(nextTitle);
        setContent(text);

        if (typeof fm.category === "string" && fm.category.trim()) {
          setCategory(fm.category.trim());
        }
        if (typeof fm.cover === "string" && fm.cover.trim()) {
          setCover(fm.cover.trim());
        }
        if (typeof fm.excerpt === "string" && fm.excerpt.trim()) {
          setCaption(fm.excerpt.trim());
        }
        if (
          fm.articleType &&
          typeof fm.articleType === "string" &&
          ["original", "repost", "ai"].includes(fm.articleType)
        ) {
          setArticleType(fm.articleType as "original" | "repost" | "ai");
        }
        if (typeof fm.repostUrl === "string" && fm.repostUrl.trim()) {
          setRepostUrl(fm.repostUrl.trim());
        }
        if (typeof fm.pinned === "boolean") {
          setPinned(fm.pinned);
        }
        if (typeof fm.date === "string" && fm.date.trim()) {
          const parsedDate = new Date(fm.date);
          if (!isNaN(parsedDate.getTime())) {
            setPublishTime(toDateTimeLocal(parsedDate));
          }
        }

        showFeedback("success", `已导入「${file.name}」并提取标题与元数据`);
      } catch (err) {
        showFeedback("error", err instanceof Error ? err.message : "读取 Markdown 文件失败");
      }
    },
    [showFeedback]
  );

  const handleMarkdownFileSelected = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      e.target.value = "";
      if (isDirty) {
        setPendingImportFile(file);
        setShowImportConfirm(true);
      } else {
        executeImportMarkdown(file);
      }
    },
    [isDirty, executeImportMarkdown]
  );

  // 全局拖拽 Markdown 文件支持
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.types.includes("Files")) {
      setIsDraggingFile(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDraggingFile(false);
      const file = e.dataTransfer.files?.[0];
      if (!file) return;

      if (file.name.match(/\.(md|markdown|txt)$/i)) {
        if (isDirty) {
          setPendingImportFile(file);
          setShowImportConfirm(true);
        } else {
          executeImportMarkdown(file);
        }
      }
    },
    [isDirty, executeImportMarkdown]
  );

  if (loading) {
    return (
      <div className="flex h-[70vh] flex-col items-center justify-center gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-adm-text-tertiary" />
        <p className="text-xs text-adm-text-secondary">加载文章中...</p>
      </div>
    );
  }

  const token = getToken() || "";

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="relative min-h-[calc(100vh-4rem)] flex flex-col pb-6"
    >
      {/* 拖拽文件进入全屏提示蒙层 */}
      {isDraggingFile && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-adm-bg/85 backdrop-blur-sm border-2 border-dashed border-emerald-500 m-4 rounded-3xl animate-fade-in pointer-events-none">
          <Upload className="h-12 w-12 text-emerald-500 animate-bounce" />
          <h3 className="mt-3 text-lg font-bold text-adm-text">松开鼠标，导入 Markdown 文档</h3>
          <p className="mt-1 text-xs text-adm-text-secondary">系统将自动解析文章内容、标题与 Frontmatter 属性</p>
        </div>
      )}

      {/* 顶部现代化操作控制栏（Linear / Ghost 质感） */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-adm-border bg-adm-bg/95 backdrop-blur-md py-2.5 px-4 sm:px-8 xl:px-10 mb-3 shadow-2xs">
        {/* 左侧：返回 + 面包屑 + 保存状态指示 */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={handleBack}
            className="adm-icon-btn !h-8.5 !w-8.5 shrink-0"
            title="返回文章管理"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>

          <div className="flex items-center gap-1.5 text-xs text-adm-text-secondary truncate">
            <span className="hidden sm:inline hover:underline cursor-pointer" onClick={() => router.push("/admin/articles")}>
              文章
            </span>
            <ChevronRight className="h-3 w-3 text-adm-text-tertiary hidden sm:inline" />
            <span className="font-semibold text-adm-text truncate max-w-[140px] sm:max-w-[280px]">
              {title.trim() || (isEdit ? "编辑文章" : "写新文章")}
            </span>
          </div>

          <span
            className={`hidden md:inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium border select-none ${
              currentStatus === "draft"
                ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${currentStatus === "draft" ? "bg-amber-500" : "bg-emerald-500"}`} />
            <span>{currentStatus === "draft" ? "草稿箱" : "已发布"}</span>
          </span>

          {/* 实时改动状态小圆点 */}
          <span className="hidden lg:inline-flex items-center text-[11px] text-adm-text-tertiary ml-1">
            {isDirty ? (
              <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-medium">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                未保存更改
              </span>
            ) : (
              <span className="text-adm-text-tertiary">已同步</span>
            )}
          </span>
        </div>

        {/* 右侧：统计 + 导入 + 草稿箱 + 存草稿 + 文章设置抽屉 + 发布主按钮 */}
        <div className="flex items-center gap-2 shrink-0">
          {/* 阅读字数与时间统计 */}
          <div className="hidden xl:flex items-center gap-2 text-xs text-adm-text-tertiary mr-1 select-none">
            <span className="flex items-center gap-1">
              <FileText className="h-3.5 w-3.5" />
              {readingStats.count} 字
            </span>
            <span>·</span>
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              约 {readingStats.minutes} 分钟
            </span>
          </div>

          {/* 导入 Markdown 文件 */}
          <button
            type="button"
            onClick={() => markdownFileInputRef.current?.click()}
            className="hidden sm:inline-flex adm-btn adm-btn--secondary !h-8.5 !px-3 text-xs"
            title="选择本地 .md 文件导入（也可直接拖拽文件入编辑区）"
          >
            <Upload className="h-3.5 w-3.5" />
            <span>导入 .md</span>
          </button>

          {/* 草稿箱入口 */}
          <button
            type="button"
            onClick={() => {
              setShowDraftBox(true);
              fetchDraftArticles();
            }}
            className="relative adm-btn adm-btn--secondary !h-8.5 !px-3 text-xs"
            title="查看草稿箱"
          >
            <FolderOpen className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
            <span className="hidden sm:inline">草稿箱</span>
            {draftArticles.length > 0 && (
              <span className="rounded-full bg-amber-500 text-white px-1.5 py-0.2 text-[10px] font-bold">
                {draftArticles.length}
              </span>
            )}
          </button>

          {/* 存草稿 (Ctrl+S) */}
          <button
            type="button"
            onClick={() => handleSave("draft", { stay: true })}
            disabled={saving !== null}
            className="adm-btn adm-btn--secondary !h-8.5 !px-3 text-xs"
            title="静默存为草稿 (Ctrl/Cmd+S)"
          >
            {saving === "draft" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            <span className="hidden sm:inline">存草稿</span>
          </button>

          {/* 封面快捷设置按钮 */}
          <button
            type="button"
            onClick={() => setShowSettingsDrawer(true)}
            className={`adm-btn !h-8.5 !px-3 text-xs ${
              cover
                ? "border-emerald-500/60 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 hover:bg-emerald-100"
                : "adm-btn--secondary"
            }`}
            title="查看或设置文章封面"
          >
            <ImageIcon className="h-3.5 w-3.5" />
            <span>{cover ? "已设封面" : "设置封面"}</span>
            {cover && (
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            )}
          </button>

          {/* 文章设置抽屉触发按钮 */}
          <button
            type="button"
            onClick={() => setShowSettingsDrawer(true)}
            className={`adm-btn !h-8.5 !px-3 text-xs ${
              showSettingsDrawer
                ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                : "adm-btn--secondary"
            }`}
            title="展开文章属性抽屉（封面、分类、标签、发布时间、SEO）"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span>属性</span>
          </button>

          {/* 正式发布 / 更新发布主按钮 */}
          <button
            type="button"
            onClick={() => handleSave("published", { stay: true })}
            disabled={saving !== null}
            className="adm-btn adm-btn--primary !h-8.5 !px-4 text-xs font-semibold"
            title="发布并同步至前台 (Ctrl/Cmd+Enter)"
          >
            {saving === "published" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5" />
            )}
            <span>{isEdit && currentStatus === "published" ? "更新发布" : "正式发布"}</span>
          </button>
        </div>
      </header>

      {/* 轻量右上角 Toast 提示 */}
      {saveFeedback && (
        <div className="fixed top-14 right-4 sm:right-6 z-50 flex items-center gap-2 rounded-xl border border-adm-border bg-adm-card px-4 py-2.5 text-xs font-medium text-adm-text shadow-xl animate-fade-in-up">
          {saveFeedback.type === "success" ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 text-rose-500 shrink-0" />
          )}
          <span>{saveFeedback.message}</span>
        </div>
      )}

      {/* 本地未保存备份恢复提示条 */}
      {showRestorePrompt && localBackup && (
        <div className="mx-4 sm:mx-auto max-w-4xl mb-3 flex items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-50/70 dark:bg-amber-950/40 p-3 text-xs text-amber-900 dark:text-amber-200 animate-fade-in">
          <div className="flex items-center gap-2">
            <RotateCcw className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>
              检测到您在 {formatExactDateTime(new Date(localBackup.savedAt).toISOString())} 有一份未提交的本地自动保存草稿
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleRestoreBackup}
              className="rounded-lg bg-amber-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-amber-700 transition cursor-pointer"
            >
              一键恢复
            </button>
            <button
              type="button"
              onClick={handleDiscardBackup}
              className="text-xs text-adm-text-secondary hover:underline cursor-pointer"
            >
              忽略
            </button>
          </div>
        </div>
      )}

      {/* 写作正文画布（无边框大标题 + Markdown 大画卷编辑器） */}
      <main className="flex-1 w-full max-w-[1580px] 2xl:max-w-[1760px] mx-auto px-4 sm:px-8 xl:px-10 flex flex-col space-y-3">
        {/* 沉浸式大标题输入区（无边框、自适应高度） */}
        <div className="pt-2 pb-2.5 border-b border-adm-border/60">
          <textarea
            ref={titleTextareaRef}
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              adjustTitleHeight();
            }}
            placeholder="输入文章标题..."
            rows={1}
            maxLength={200}
            className="w-full resize-none border-none bg-transparent text-2xl sm:text-4xl font-extrabold tracking-tight text-adm-text placeholder:text-adm-text-tertiary/40 focus:outline-none leading-tight"
          />

          {/* 快捷元信息条：分类快选、字数统计 */}
          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2.5 text-xs">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-medium text-adm-text-tertiary mr-0.5">常用分类:</span>
              {CATEGORY_PRESETS.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors cursor-pointer ${
                    category === cat
                      ? "bg-adm-text text-adm-bg font-semibold shadow-2xs"
                      : "bg-adm-input text-adm-text-secondary hover:bg-neutral-200 dark:hover:bg-neutral-800"
                  }`}
                >
                  {cat}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setShowSettingsDrawer(true)}
                className="text-[11px] text-adm-text-secondary hover:text-adm-text hover:underline ml-1 cursor-pointer"
              >
                + 更多属性
              </button>
            </div>

            <div className="flex items-center gap-2 text-[11px] text-adm-text-tertiary select-none">
              <span className="flex items-center gap-1">
                <FileText className="h-3 w-3" />
                {readingStats.count} 字
              </span>
              <span>·</span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                约 {readingStats.minutes} 分钟
              </span>
            </div>
          </div>
        </div>

        {/* Markdown 主编辑器组件（开阔视野，自适应视口高度） */}
        <div className="flex-1 min-h-[calc(100vh-13.5rem)] flex flex-col">
          <MarkdownEditor
            value={content}
            onChange={setContent}
            token={token}
            onFrontmatterChange={handleFrontmatterChange}
            onSave={() => handleSave("draft", { stay: true })}
            saving={saving !== null}
            height="calc(100vh - 13.5rem)"
            minHeight="720px"
          />
        </div>
      </main>

      {/* 右侧文章属性设置抽屉（Inspector Sheet） */}
      {showSettingsDrawer && (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/30 backdrop-blur-xs animate-overlay-in">
          {/* 抽屉容器 */}
          <div className="relative w-full max-w-md bg-adm-card border-l border-adm-border h-full flex flex-col shadow-2xl animate-fade-in">
            {/* 抽屉头部 */}
            <div className="flex items-center justify-between border-b border-adm-border px-5 py-3.5">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4 text-adm-text" />
                <h3 className="font-bold text-sm text-adm-text">文章发布与设置</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowSettingsDrawer(false)}
                className="rounded-lg p-1.5 text-adm-text-secondary hover:bg-adm-input hover:text-adm-text transition cursor-pointer"
                title="关闭设置抽屉 (Esc)"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* 抽屉内容区 */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5 text-xs [scrollbar-width:thin]">
              {/* 1. 封面设置 */}
              <section className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="font-semibold text-adm-text flex items-center gap-1.5">
                    <ImageIcon className="h-3.5 w-3.5 text-adm-text-secondary" />
                    <span>文章封面</span>
                  </label>
                  {cover ? (
                    <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">已设置专属封面</span>
                  ) : extractFirstMarkdownImage(content) ? (
                    <span className="text-[11px] text-adm-text-tertiary">前台将自动提取正文首图</span>
                  ) : (
                    <span className="text-[11px] text-adm-text-tertiary">未设置</span>
                  )}
                </div>

                {cover ? (
                  <div className="space-y-2">
                    <div className="relative overflow-hidden rounded-xl border border-adm-border bg-adm-input aspect-video w-full">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={toAbsoluteUrl(cover)} alt="封面预览" className="h-full w-full object-cover" />
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => coverInputRef.current?.click()}
                        disabled={uploadingCover}
                        className="flex-1 rounded-lg border border-adm-border bg-adm-bg py-1.5 text-center text-xs font-medium text-adm-text hover:bg-adm-input transition cursor-pointer"
                      >
                        {uploadingCover ? "上传中..." : "更换本地图片"}
                      </button>
                      <button
                        type="button"
                        onClick={handleRemoveCover}
                        className="rounded-lg border border-rose-300 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/30 px-3 py-1.5 text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-100 transition cursor-pointer"
                      >
                        清除
                      </button>
                    </div>

                    {/* 直接修改图片 URL */}
                    <div className="pt-1">
                      <input
                        type="text"
                        value={cover}
                        onChange={(e) => setCover(e.target.value.trim())}
                        placeholder="或直接粘贴图片 URL (AI生成/图床/外链)"
                        className="w-full rounded-lg border border-adm-border bg-adm-input px-2.5 py-1.5 text-xs text-adm-text placeholder:text-adm-text-tertiary focus:outline-none focus:ring-1 focus:ring-adm-primary"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div
                      onClick={() => coverInputRef.current?.click()}
                      className="flex flex-col items-center justify-center rounded-xl border border-dashed border-adm-border bg-adm-bg/60 p-4 text-center hover:border-adm-text-secondary transition cursor-pointer"
                    >
                      <Upload className="h-5 w-5 text-adm-text-tertiary" />
                      <p className="mt-1.5 text-xs font-medium text-adm-text">点击上传封面图片</p>
                      <p className="text-[10px] text-adm-text-tertiary">支持 JPG / PNG / WebP，自动优化压缩</p>
                    </div>

                    {/* 直接粘贴图片 URL */}
                    <div>
                      <input
                        type="text"
                        value={cover}
                        onChange={(e) => setCover(e.target.value.trim())}
                        placeholder="或直接粘贴图片 URL (AI生成/图床/外链)"
                        className="w-full rounded-lg border border-adm-border bg-adm-input px-2.5 py-1.5 text-xs text-adm-text placeholder:text-adm-text-tertiary focus:outline-none focus:ring-1 focus:ring-adm-primary"
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setMediaPickerOpen(true)}
                        className="flex-1 rounded-lg border border-adm-border bg-adm-bg py-1.5 text-center text-xs text-adm-text-secondary hover:bg-adm-input transition cursor-pointer"
                      >
                        从素材库选取
                      </button>
                      <button
                        type="button"
                        onClick={handleExtractCoverFromContent}
                        className="flex-1 rounded-lg border border-adm-border bg-adm-bg py-1.5 text-center text-xs text-adm-text-secondary hover:bg-adm-input transition cursor-pointer"
                      >
                        提取正文首图
                      </button>
                    </div>
                  </div>
                )}
              </section>

              {/* 2. 分类与标签 */}
              <section className="space-y-2.5">
                <label className="block font-semibold text-adm-text">文章分类</label>
                <div className="flex flex-wrap gap-1.5">
                  {CATEGORY_PRESETS.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setCategory(cat)}
                      className={`rounded-lg px-2.5 py-1 text-xs font-medium transition cursor-pointer ${
                        category === cat
                          ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                          : "bg-adm-input text-adm-text-secondary hover:bg-neutral-200/50 dark:hover:bg-neutral-800"
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="输入自定义分类..."
                  className="w-full rounded-lg border border-adm-border bg-adm-bg px-3 py-1.5 text-xs text-adm-text placeholder:text-adm-text-tertiary focus:outline-none focus:ring-1 focus:ring-adm-text"
                />
              </section>

              {/* 3. 朋友圈配文 / 摘要 */}
              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block font-semibold text-adm-text">文章摘要 / 动态配文</label>
                  <span className="text-[10px] text-adm-text-tertiary">展示在列表卡片及前台动态</span>
                </div>
                <textarea
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  rows={3}
                  placeholder="留空则自动提取正文首段作为摘要..."
                  className="w-full rounded-lg border border-adm-border bg-adm-bg p-2.5 text-xs text-adm-text placeholder:text-adm-text-tertiary focus:outline-none focus:ring-1 focus:ring-adm-text resize-none leading-relaxed"
                />
              </section>

              {/* 4. 发布时间调度 */}
              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block font-semibold text-adm-text flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 text-adm-text-secondary" />
                    <span>发布时间</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setPublishTime(toDateTimeLocal(new Date()))}
                    className="text-[11px] text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                  >
                    设为此刻
                  </button>
                </div>
                <input
                  type="datetime-local"
                  value={publishTime}
                  onChange={(e) => setPublishTime(e.target.value)}
                  className="w-full rounded-lg border border-adm-border bg-adm-bg px-3 py-1.5 text-xs text-adm-text focus:outline-none focus:ring-1 focus:ring-adm-text"
                />
                <p className="text-[10px] text-adm-text-tertiary leading-relaxed">
                  前台博客列表将以此时间进行时间线排序与归档。
                </p>
              </section>

              {/* 5. 创作版权类型 */}
              <section className="space-y-2">
                <label className="block font-semibold text-adm-text">创作属性</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { key: "original", label: "原创作品" },
                    { key: "repost", label: "转载文章" },
                    { key: "ai", label: "AI 辅助" },
                  ].map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setArticleType(item.key as "original" | "repost" | "ai")}
                      className={`rounded-lg border px-2 py-1.5 text-center text-xs font-medium transition cursor-pointer ${
                        articleType === item.key
                          ? "border-adm-text bg-adm-input text-adm-text font-bold"
                          : "border-adm-border bg-adm-bg text-adm-text-secondary hover:bg-adm-input"
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>

                {articleType === "repost" && (
                  <div className="pt-1">
                    <input
                      type="url"
                      value={repostUrl}
                      onChange={(e) => setRepostUrl(e.target.value)}
                      placeholder="转载原出处 URL (https://...)"
                      className="w-full rounded-lg border border-adm-border bg-adm-bg px-3 py-1.5 text-xs text-adm-text placeholder:text-adm-text-tertiary focus:outline-none"
                    />
                  </div>
                )}
              </section>

              {/* 6. 高级展示与互动权限 */}
              <section className="space-y-2">
                <label className="block font-semibold text-adm-text">权限与置顶</label>
                <div className="space-y-1.5">
                  <label className="flex items-center justify-between rounded-lg border border-adm-border bg-adm-bg px-3 py-2 cursor-pointer hover:bg-adm-input transition">
                    <span className="flex items-center gap-2 text-adm-text">
                      <Pin className="h-3.5 w-3.5 rotate-45 text-adm-text-secondary" />
                      <span>首页置顶</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={pinned}
                      onChange={(e) => setPinned(e.target.checked)}
                      className="rounded accent-zinc-900 dark:accent-white cursor-pointer"
                    />
                  </label>

                  <label className="flex items-center justify-between rounded-lg border border-adm-border bg-adm-bg px-3 py-2 cursor-pointer hover:bg-adm-input transition">
                    <span className="flex items-center gap-2 text-adm-text">
                      <Heart className="h-3.5 w-3.5 text-adm-text-secondary" />
                      <span>允许点赞</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={!likesDisabled}
                      onChange={(e) => setLikesDisabled(!e.target.checked)}
                      className="rounded accent-zinc-900 dark:accent-white cursor-pointer"
                    />
                  </label>

                  <label className="flex items-center justify-between rounded-lg border border-adm-border bg-adm-bg px-3 py-2 cursor-pointer hover:bg-adm-input transition">
                    <span className="flex items-center gap-2 text-adm-text">
                      <MessageSquare className="h-3.5 w-3.5 text-adm-text-secondary" />
                      <span>允许评论</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={!commentsDisabled}
                      onChange={(e) => setCommentsDisabled(!e.target.checked)}
                      className="rounded accent-zinc-900 dark:accent-white cursor-pointer"
                    />
                  </label>
                </div>
              </section>

              {/* 7. 下架为草稿操作（已发布文章专属） */}
              {isEdit && currentStatus === "published" && (
                <section className="pt-2 border-t border-adm-border">
                  <button
                    type="button"
                    onClick={() => setShowUnpublishConfirm(true)}
                    className="w-full rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 py-2 text-xs font-medium text-amber-700 dark:text-amber-300 hover:bg-amber-100 transition cursor-pointer"
                  >
                    下架并转入草稿箱
                  </button>
                </section>
              )}
            </div>

            {/* 抽屉底部快捷按钮 */}
            <div className="border-t border-adm-border p-4 flex items-center justify-between gap-3 bg-adm-bg">
              <button
                type="button"
                onClick={() => setShowSettingsDrawer(false)}
                className="flex-1 adm-btn adm-btn--secondary"
              >
                完成
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowSettingsDrawer(false);
                  handleSave("published", { stay: true });
                }}
                disabled={saving !== null}
                className="flex-1 adm-btn adm-btn--primary"
              >
                {saving === "published" ? "发布中..." : "立即发布"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 发布成功提示卡片弹窗 */}
      {publishedSuccessInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 animate-overlay-in">
          <div className="relative w-full max-w-md rounded-2xl border border-adm-border bg-adm-card p-6 shadow-2xl animate-fade-in text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 mb-3">
              <Check className="h-6 w-6" />
            </div>
            <h3 className="text-base font-bold text-adm-text">文章发布成功！</h3>
            <p className="mt-1 text-xs text-adm-text-secondary leading-relaxed">
              《{publishedSuccessInfo.title}》已成功发布，并已同步更新至前台页面与订阅源。
            </p>

            <div className="mt-6 flex flex-col sm:flex-row items-center gap-2">
              <a
                href={`/articles/${publishedSuccessInfo.id}`}
                target="_blank"
                rel="noreferrer"
                className="w-full flex-1 adm-btn adm-btn--secondary"
              >
                <Eye className="h-4 w-4" />
                <span>新标签页查看</span>
                <ExternalLink className="h-3 w-3 text-adm-text-tertiary" />
              </a>
              <button
                type="button"
                onClick={() => setPublishedSuccessInfo(null)}
                className="w-full flex-1 adm-btn adm-btn--primary"
              >
                留在当前页继续编辑
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 媒体库选择弹窗 */}
      <MediaPicker
        open={mediaPickerOpen}
        onClose={() => setMediaPickerOpen(false)}
        onSelect={(item) => {
          setCover(item.url);
          setMediaPickerOpen(false);
          showFeedback("success", "已选定封面图片");
        }}
        category="image"
      />

      {/* 文章草稿箱抽屉/弹窗 */}
      {showDraftBox && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 animate-overlay-in">
          <div className="relative w-full max-w-lg rounded-2xl border border-adm-border bg-adm-card p-5 shadow-2xl max-h-[85vh] flex flex-col animate-modal-in">
            <div className="flex items-center justify-between pb-3 border-b border-adm-border">
              <div className="flex items-center gap-2">
                <FolderOpen className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                <h3 className="font-bold text-sm text-adm-text">文章草稿箱 ({draftArticles.length})</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowDraftBox(false)}
                className="rounded-lg p-1 text-adm-text-secondary hover:bg-adm-input cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-3 space-y-2.5 [scrollbar-width:thin]">
              {loadingDrafts ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-adm-text-tertiary" />
                </div>
              ) : draftArticles.length === 0 ? (
                <div className="py-12 text-center text-xs text-adm-text-tertiary">
                  草稿箱中暂无文章，随时可在编辑时点击「存草稿」暂存。
                </div>
              ) : (
                draftArticles.map((draft) => (
                  <div
                    key={draft.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-adm-border/80 bg-adm-bg/60 p-3 hover:bg-adm-input/40 transition"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate font-semibold text-xs text-adm-text">
                          {draft.title || "无标题草稿"}
                        </span>
                        {draft.category && (
                          <span className="rounded bg-neutral-200 dark:bg-neutral-800 px-1.5 py-0.2 text-[10px] text-neutral-600 dark:text-neutral-400">
                            {draft.category}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 line-clamp-1 text-[11px] text-adm-text-secondary">
                        {draft.excerpt || draft.content || "暂无描述"}
                      </p>
                      <span className="mt-1 block text-[10px] text-adm-text-tertiary">
                        保存时间：{formatExactDateTime(draft.createdAt)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Link
                        href={`/admin/articles/${draft.id}`}
                        onClick={() => setShowDraftBox(false)}
                        className="rounded-lg bg-adm-primary px-2.5 py-1 text-xs font-medium text-adm-primary-text hover:opacity-90 transition cursor-pointer"
                      >
                        继续编辑
                      </Link>
                      <button
                        type="button"
                        onClick={() => setDraftToDelete({ id: draft.id, title: draft.title || "无标题草稿" })}
                        className="rounded-lg p-1.5 text-adm-text-tertiary hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 cursor-pointer transition"
                        title="彻底删除草稿"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* 隐藏的文件输入组件 */}
      <input
        ref={markdownFileInputRef}
        type="file"
        accept=".md,.markdown,text/markdown,.txt"
        onChange={handleMarkdownFileSelected}
        className="hidden"
      />
      <input
        ref={coverInputRef}
        type="file"
        accept="image/*"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleCoverUpload(file);
          e.target.value = "";
        }}
        className="hidden"
      />

      {/* 覆盖现有编辑确认弹窗 */}
      <ConfirmDialog
        open={showImportConfirm}
        title="确认导入 Markdown 文件？"
        message="导入新文件将覆盖当前正在编辑的内容。是否确认继续覆盖？"
        confirmText="继续导入"
        cancelText="取消"
        onConfirm={() => {
          setShowImportConfirm(false);
          if (pendingImportFile) {
            executeImportMarkdown(pendingImportFile);
            setPendingImportFile(null);
          }
        }}
        onCancel={() => {
          setShowImportConfirm(false);
          setPendingImportFile(null);
        }}
      />

      {/* 下架为草稿二次确认弹窗 */}
      <ConfirmDialog
        open={showUnpublishConfirm}
        title="确认下架文章？"
        message="下架后文章将转入草稿箱，前台文章列表将隐藏该文章，随时可在后台重新发布。"
        confirmText="确认下架"
        cancelText="取消"
        danger={true}
        onConfirm={async () => {
          setShowUnpublishConfirm(false);
          setShowSettingsDrawer(false);
          await handleSave("draft", { stay: true });
        }}
        onCancel={() => setShowUnpublishConfirm(false)}
      />

      {/* 删除草稿确认弹窗 */}
      <ConfirmDialog
        open={!!draftToDelete}
        title="确认彻底删除草稿？"
        message={`确定彻底删除草稿「${draftToDelete?.title || "未命名草稿"}」？此操作无法撤销。`}
        confirmText="确认删除"
        cancelText="取消"
        danger={true}
        onConfirm={async () => {
          if (!draftToDelete) return;
          const targetId = draftToDelete.id;
          setDraftToDelete(null);
          try {
            const res = await apiFetch(`/posts/${targetId}`, { method: "DELETE" });
            if (res.ok) {
              setDraftArticles((prev) => prev.filter((d) => d.id !== targetId));
              if (targetId === activeArticleId) {
                setActiveArticleId(null);
                window.history.replaceState(null, "", "/admin/articles/new");
              }
              notifyContentUpdated();
              showFeedback("success", "草稿已彻底删除");
            } else {
              showFeedback("error", "删除草稿失败");
            }
          } catch {
            showFeedback("error", "删除草稿失败");
          }
        }}
        onCancel={() => setDraftToDelete(null)}
      />

      {/* 离开未保存更改确认弹窗 */}
      <AdminModal
        open={showLeaveModal}
        onClose={() => setShowLeaveModal(false)}
        title="未保存更改确认"
        width="sm"
        footer={
          <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 w-full">
            <button
              type="button"
              onClick={() => setShowLeaveModal(false)}
              className="rounded-xl border border-adm-border px-3.5 py-2 text-xs font-medium text-adm-text-secondary hover:bg-adm-input transition cursor-pointer"
            >
              留在页面
            </button>
            <button
              type="button"
              onClick={() => {
                setShowLeaveModal(false);
                router.push("/admin/articles");
              }}
              className="rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 px-3.5 py-2 text-xs font-medium text-rose-700 dark:text-rose-300 hover:bg-rose-100 transition cursor-pointer"
            >
              放弃更改
            </button>
            <button
              type="button"
              onClick={async () => {
                setShowLeaveModal(false);
                await handleSave("draft");
                router.push("/admin/articles");
              }}
              className="rounded-xl bg-adm-primary px-4 py-2 text-xs font-medium text-adm-primary-text hover:opacity-90 transition cursor-pointer"
            >
              存为草稿后离开
            </button>
          </div>
        }
      >
        <div className="space-y-2 py-2 text-xs leading-relaxed text-adm-text-secondary">
          <p className="font-semibold text-adm-text">当前文章有未保存的内容。</p>
          <p>直接离开将放弃本次修改。您可以选择存入草稿箱，或直接离开。</p>
        </div>
      </AdminModal>
    </div>
  );
}
