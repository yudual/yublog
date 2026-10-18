"use client";

import React, {
  useState,
  useRef,
  useCallback,
  useEffect,
  useMemo,
  type KeyboardEvent,
  type ClipboardEvent,
  type DragEvent,
} from "react";
import {
  Bold,
  Italic,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListTodo,
  Quote,
  Code,
  FileCode,
  Table as TableIcon,
  Link2,
  Image as ImageIcon,
  AlertCircle,
  Music,
  Video,
  Bookmark,
  ExternalLink,
  Columns2,
  Eye,
  PenLine,
  Maximize2,
  Minimize2,
  Loader2,
  HelpCircle,
  Sparkles,
  Save,
  X,
  ArrowLeft,
  FolderOpen,
  CheckCircle2,
  SlidersHorizontal,
  Check,
} from "lucide-react";
import { markdownToHtml, copyToClipboard } from "@/lib/markdown";
import { parseFrontmatter, type ArticleFrontmatter } from "@/lib/frontmatter";
import { calculateReadingStats } from "@/lib/reading-time";
import { uploadImage, toAbsoluteUrl } from "@/lib/upload";
import MediaPicker, { type PickerMediaItem } from "../MediaPicker";
import LinkCardPanel from "../admin/LinkCardPanel";
import MusicPanel from "../admin/MusicPanel";
import VideoPanel from "../admin/VideoPanel";
import DoubanPicker from "../DoubanPicker";
import {
  buildMusicEmbedHtml,
  buildVideoEmbedHtml,
  buildDoubanEmbedHtml,
  buildLinkCardHtml,
} from "./embed-utils";
import type { LinkCard, PostDouban, PostMusic, PostVideo } from "@/lib/types";

export interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  token?: string;
  placeholder?: string;
  height?: string | number;
  minHeight?: string | number;
  className?: string;
  onFrontmatterChange?: (data: ArticleFrontmatter) => void;
  onSave?: () => void;
  onPublish?: () => void;
  onOpenSettings?: () => void;
  title?: string;
  onTitleChange?: (title: string) => void;
  saving?: boolean;
}

export default function MarkdownEditor({
  value,
  onChange,
  token = "",
  placeholder = "支持 Markdown 语法与 YAML Frontmatter 写作...",
  height,
  minHeight = "620px",
  className = "",
  onFrontmatterChange,
  onSave,
  onPublish,
  onOpenSettings,
  title = "",
  onTitleChange,
  saving = false,
}: MarkdownEditorProps) {
  const [viewMode, setViewMode] = useState<"split" | "edit" | "preview">("split");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [customHeight, setCustomHeight] = useState<number | null>(null);
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });

  // 弹窗状态
  const [showMusicPanel, setShowMusicPanel] = useState(false);
  const [showVideoPanel, setShowVideoPanel] = useState(false);
  const [showDoubanPicker, setShowDoubanPicker] = useState(false);
  const [showLinkCardPanel, setShowLinkCardPanel] = useState(false);
  const [showCalloutMenu, setShowCalloutMenu] = useState(false);
  const [showHeadingMenu, setShowHeadingMenu] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showMediaPicker, setShowMediaPicker] = useState(false);

  // 优雅插入超链接弹窗状态
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkModalText, setLinkModalText] = useState("");
  const [linkModalUrl, setLinkModalUrl] = useState("https://");

  const containerRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isScrollingRef = useRef<"editor" | "preview" | null>(null);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 记录光标位置防止外部更新导致光标跳位
  const lastSelectionRef = useRef<{ start: number; end: number } | null>(null);

  useEffect(() => {
    if (!isFullscreen) return;
    const onEsc = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape" && !showLinkModal && !showHelpModal && !showMediaPicker) {
        setIsFullscreen(false);
      }
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [isFullscreen, showLinkModal, showHelpModal, showMediaPicker]);

  const isDraggingResizeRef = useRef(false);
  const startYRef = useRef(0);
  const startHeightRef = useRef(0);

  const initialHeight = useMemo(() => {
    const raw = height || minHeight;
    if (typeof raw === "number") return `${raw}px`;
    if (typeof raw === "string") return raw;
    return "620px";
  }, [height, minHeight]);

  const activeHeight = isFullscreen
    ? "100vh"
    : customHeight !== null
    ? `${customHeight}px`
    : initialHeight;

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingResizeRef.current = true;
    startYRef.current = e.clientY;
    startHeightRef.current = containerRef.current?.getBoundingClientRect().height || 620;

    const onMouseMove = (ev: MouseEvent) => {
      if (!isDraggingResizeRef.current) return;
      const delta = ev.clientY - startYRef.current;
      const nextH = Math.max(360, Math.min(window.innerHeight * 0.92, startHeightRef.current + delta));
      setCustomHeight(nextH);
    };

    const onMouseUp = () => {
      isDraggingResizeRef.current = false;
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const updateCursorPos = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const pos = textarea.selectionStart || 0;
    const before = textarea.value.slice(0, pos);
    const lines = before.split("\n");
    const line = lines.length;
    const col = (lines[lines.length - 1]?.length || 0) + 1;
    setCursorPos({ line, col });

    lastSelectionRef.current = {
      start: textarea.selectionStart,
      end: textarea.selectionEnd,
    };
  }, []);

  // 保持光标位置，外部 value 改变时若处于编辑态则恢复光标，杜绝乱跳
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    if (document.activeElement === textarea && lastSelectionRef.current) {
      const { start, end } = lastSelectionRef.current;
      const maxLen = textarea.value.length;
      textarea.setSelectionRange(Math.min(start, maxLen), Math.min(end, maxLen));
    }
  }, [value]);

  // 解析并同步 Frontmatter
  const parsed = useMemo(() => {
    return parseFrontmatter(value || "");
  }, [value]);
  const { content: pureContent } = parsed;

  const lastRawFmRef = useRef<string>("");
  useEffect(() => {
    if (
      onFrontmatterChange &&
      parsed.hasFrontmatter &&
      parsed.rawFrontmatter !== lastRawFmRef.current
    ) {
      lastRawFmRef.current = parsed.rawFrontmatter;
      onFrontmatterChange(parsed.frontmatter);
    }
  }, [parsed, onFrontmatterChange]);

  // 生成实时 HTML 预览
  const previewHtml = useMemo(() => {
    return markdownToHtml(value || "");
  }, [value]);

  // 字数统计与阅读时间
  const stats = useMemo(() => {
    const reading = calculateReadingStats(pureContent || "");
    const lineCount = value ? value.split("\n").length : 1;
    return {
      charCount: reading.words,
      wordCount: reading.englishWords,
      readMinutes: reading.minutes,
      lineCount,
    };
  }, [pureContent, value]);

  // 插入行内文本或语法片段
  const insertSnippet = useCallback(
    (prefix: string, suffix = "", defaultText = "文本") => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const selected = textarea.value.slice(start, end) || defaultText;
      const replacement = `${prefix}${selected}${suffix}`;

      const nextValue =
        textarea.value.slice(0, start) + replacement + textarea.value.slice(end);
      onChange(nextValue);

      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(
          start + prefix.length,
          start + prefix.length + selected.length
        );
        lastSelectionRef.current = {
          start: start + prefix.length,
          end: start + prefix.length + selected.length,
        };
      }, 0);
    },
    [onChange]
  );

  // 插入换行块
  const insertBlock = useCallback(
    (template: string) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const before = textarea.value.slice(0, start);
      const after = textarea.value.slice(end);

      const prefix = before.endsWith("\n\n") || !before ? "" : before.endsWith("\n") ? "\n" : "\n\n";
      const suffix = after.startsWith("\n\n") || !after ? "" : after.startsWith("\n") ? "\n" : "\n\n";

      const nextValue = `${before}${prefix}${template}${suffix}${after}`;
      onChange(nextValue);

      setTimeout(() => {
        textarea.focus();
        const cursorIndex = before.length + prefix.length + template.length;
        textarea.setSelectionRange(cursorIndex, cursorIndex);
        lastSelectionRef.current = { start: cursorIndex, end: cursorIndex };
      }, 0);
    },
    [onChange]
  );

  // 插入行首块级语法（标题、引用、列表、待办），确保从行首起首并保持排版整洁
  const insertLinePrefix = useCallback(
    (prefix: string, defaultText = "内容") => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const before = textarea.value.slice(0, start);
      const after = textarea.value.slice(end);
      const selected = textarea.value.slice(start, end) || defaultText;

      const needLineBreak = before && !before.endsWith("\n");
      const lineBreak = needLineBreak ? "\n" : "";
      const replacement = `${lineBreak}${prefix}${selected}`;
      const nextValue = `${before}${replacement}${after}`;
      onChange(nextValue);

      setTimeout(() => {
        textarea.focus();
        const selStart = start + lineBreak.length + prefix.length;
        const selEnd = selStart + selected.length;
        textarea.setSelectionRange(selStart, selEnd);
        lastSelectionRef.current = { start: selStart, end: selEnd };
      }, 0);
    },
    [onChange]
  );

  // 打开优雅超链接插入弹窗
  const handleOpenLinkModal = useCallback(() => {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart || 0;
    const end = textarea?.selectionEnd || 0;
    const selected = textarea ? textarea.value.slice(start, end) : "";
    setLinkModalText(selected || "链接标题");
    setLinkModalUrl("https://");
    setShowLinkModal(true);
  }, []);

  // 确认插入超链接
  const handleConfirmInsertLink = useCallback(() => {
    const text = linkModalText.trim() || "链接标题";
    const url = linkModalUrl.trim() || "https://";
    insertSnippet("[", `](${url})`, text);
    setShowLinkModal(false);
  }, [linkModalText, linkModalUrl, insertSnippet]);

  // 从素材库选图并插入
  const handleSelectFromMediaPicker = useCallback(
    (item: PickerMediaItem) => {
      const altName = item.filename.replace(/\.[^.]+$/, "").trim() || "图片";
      insertBlock(`![${altName}](${toAbsoluteUrl(item.url)})`);
      setShowMediaPicker(false);
    },
    [insertBlock]
  );

  // 统一批量本地图片上传处理器
  const handleBatchUpload = useCallback(
    async (files: File[]) => {
      const imageFiles = files.filter((f) => f.type.startsWith("image/"));
      if (imageFiles.length === 0) return;

      const tokenToUse =
        token ||
        (typeof window !== "undefined"
          ? localStorage.getItem("admin_token") || ""
          : "");
      if (!tokenToUse) {
        setUploadError("请先登录管理后台再上传图片");
        setTimeout(() => setUploadError(null), 4000);
        return;
      }

      setUploading(true);
      setUploadError(null);
      const results: string[] = [];
      try {
        for (let i = 0; i < imageFiles.length; i++) {
          const file = imageFiles[i];
          setUploadMessage(`正在上传 (${i + 1}/${imageFiles.length})：${file.name}`);
          const url = await uploadImage(file, tokenToUse);
          const altName = file.name.replace(/\.[^.]+$/, "").trim() || "图片";
          results.push(`![${altName}](${toAbsoluteUrl(url)})`);
        }
        if (results.length > 0) {
          insertBlock(results.join("\n\n"));
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "图片上传失败";
        setUploadError(msg);
        setTimeout(() => setUploadError(null), 4000);
      } finally {
        setUploading(false);
        setUploadMessage("");
      }
    },
    [token, insertBlock]
  );

  // 处理粘贴（截图截屏直传）
  const handlePaste = useCallback(
    (e: ClipboardEvent<HTMLTextAreaElement>) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      const imageFiles: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) imageFiles.push(file);
        }
      }

      if (imageFiles.length > 0) {
        e.preventDefault();
        handleBatchUpload(imageFiles);
      }
    },
    [handleBatchUpload]
  );

  // 拖放图片文件上传
  const handleDrop = useCallback(
    (e: DragEvent<HTMLTextAreaElement>) => {
      e.preventDefault();
      setIsDragOver(false);

      const files = e.dataTransfer?.files;
      if (!files || files.length === 0) return;

      const imageFiles = Array.from(files).filter((f) => f.type.startsWith("image/"));
      if (imageFiles.length > 0) {
        handleBatchUpload(imageFiles);
      }
    },
    [handleBatchUpload]
  );

  // 快捷键支持
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      const isMac =
        typeof navigator !== "undefined" &&
        /Mac|iPod|iPhone|iPad/i.test(navigator.userAgent || navigator.platform || "");
      const isCmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

      // Ctrl + S: 保存草稿
      if (isCmdOrCtrl && e.key.toLowerCase() === "s") {
        e.preventDefault();
        onSave?.();
        return;
      }

      // Ctrl + B: 加粗
      if (isCmdOrCtrl && e.key.toLowerCase() === "b") {
        e.preventDefault();
        insertSnippet("**", "**", "加粗文字");
        return;
      }

      // Ctrl + I: 斜体
      if (isCmdOrCtrl && e.key.toLowerCase() === "i") {
        e.preventDefault();
        insertSnippet("*", "*", "斜体文字");
        return;
      }

      // Ctrl + K: 优雅链接弹窗
      if (isCmdOrCtrl && e.key.toLowerCase() === "k") {
        e.preventDefault();
        handleOpenLinkModal();
        return;
      }

      // Tab: 缩进 2 空格
      if (e.key === "Tab") {
        e.preventDefault();
        const textarea = textareaRef.current;
        if (!textarea) return;

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;

        if (e.shiftKey) {
          const before = textarea.value.slice(0, start);
          const lineStart = before.lastIndexOf("\n") + 1;
          const currentLine = textarea.value.slice(lineStart, end);
          if (currentLine.startsWith("  ")) {
            const nextValue =
              textarea.value.slice(0, lineStart) +
              currentLine.slice(2) +
              textarea.value.slice(end);
            onChange(nextValue);
            setTimeout(() => {
              textarea.setSelectionRange(Math.max(lineStart, start - 2), end - 2);
            }, 0);
          }
        } else {
          const nextValue =
            textarea.value.slice(0, start) + "  " + textarea.value.slice(end);
          onChange(nextValue);
          setTimeout(() => {
            textarea.setSelectionRange(start + 2, start + 2);
          }, 0);
        }
        return;
      }

      // Enter: 智能列表续行
      if (e.key === "Enter" && !e.shiftKey) {
        const textarea = textareaRef.current;
        if (!textarea) return;

        const start = textarea.selectionStart;
        const before = textarea.value.slice(0, start);
        const lastLineStart = before.lastIndexOf("\n") + 1;
        const lastLine = before.slice(lastLineStart);

        // 无序列表
        const unorderedMatch = lastLine.match(/^(\s*[-*+]\s+)(.*)$/);
        if (unorderedMatch) {
          if (!unorderedMatch[2].trim()) {
            e.preventDefault();
            const nextValue =
              textarea.value.slice(0, lastLineStart) + textarea.value.slice(start);
            onChange(nextValue);
            setTimeout(() => {
              textarea.setSelectionRange(lastLineStart, lastLineStart);
            }, 0);
            return;
          }
          e.preventDefault();
          const nextValue =
            textarea.value.slice(0, start) + "\n" + unorderedMatch[1] + textarea.value.slice(start);
          onChange(nextValue);
          setTimeout(() => {
            const newPos = start + 1 + unorderedMatch[1].length;
            textarea.setSelectionRange(newPos, newPos);
          }, 0);
          return;
        }

        // 任务列表
        const taskMatch = lastLine.match(/^(\s*[-*+]\s+\[[ xX]\]\s+)(.*)$/);
        if (taskMatch) {
          if (!taskMatch[2].trim()) {
            e.preventDefault();
            const nextValue =
              textarea.value.slice(0, lastLineStart) + textarea.value.slice(start);
            onChange(nextValue);
            setTimeout(() => {
              textarea.setSelectionRange(lastLineStart, lastLineStart);
            }, 0);
            return;
          }
          e.preventDefault();
          const nextValue =
            textarea.value.slice(0, start) + "\n- [ ] " + textarea.value.slice(start);
          onChange(nextValue);
          setTimeout(() => {
            const newPos = start + 1 + 6;
            textarea.setSelectionRange(newPos, newPos);
          }, 0);
          return;
        }

        // 有序列表
        const orderedMatch = lastLine.match(/^(\s*)(\d+)\.\s+(.*)$/);
        if (orderedMatch) {
          if (!orderedMatch[3].trim()) {
            e.preventDefault();
            const nextValue =
              textarea.value.slice(0, lastLineStart) + textarea.value.slice(start);
            onChange(nextValue);
            setTimeout(() => {
              textarea.setSelectionRange(lastLineStart, lastLineStart);
            }, 0);
            return;
          }
          e.preventDefault();
          const nextNum = parseInt(orderedMatch[2], 10) + 1;
          const continuation = `${orderedMatch[1]}${nextNum}. `;
          const nextValue =
            textarea.value.slice(0, start) + "\n" + continuation + textarea.value.slice(start);
          onChange(nextValue);
          setTimeout(() => {
            const newPos = start + 1 + continuation.length;
            textarea.setSelectionRange(newPos, newPos);
          }, 0);
          return;
        }
      }
    },
    [onSave, insertSnippet, handleOpenLinkModal, onChange]
  );

  // 左右滚动同步
  const handleEditorScroll = useCallback(() => {
    if (viewMode !== "split") return;
    if (isScrollingRef.current === "preview") return;
    const editor = textareaRef.current;
    const preview = previewRef.current;
    if (!editor || !preview) return;

    isScrollingRef.current = "editor";
    const percent = editor.scrollTop / (editor.scrollHeight - editor.clientHeight || 1);
    preview.scrollTop = percent * (preview.scrollHeight - preview.clientHeight);

    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(() => {
      isScrollingRef.current = null;
    }, 80);
  }, [viewMode]);

  const handlePreviewScroll = useCallback(() => {
    if (viewMode !== "split") return;
    if (isScrollingRef.current === "editor") return;
    const editor = textareaRef.current;
    const preview = previewRef.current;
    if (!editor || !preview) return;

    isScrollingRef.current = "preview";
    const percent = preview.scrollTop / (preview.scrollHeight - preview.clientHeight || 1);
    editor.scrollTop = percent * (editor.scrollHeight - editor.clientHeight);

    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(() => {
      isScrollingRef.current = null;
    }, 80);
  }, [viewMode]);

  // 预览区复制代码
  const handlePreviewClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const copyBtn = target.closest(".macos-enhanced-copy") as HTMLButtonElement | null;
    if (copyBtn) {
      e.preventDefault();
      e.stopPropagation();
      const pre = copyBtn.closest(".macos-enhanced-pre");
      if (!pre) return;
      const code = pre.querySelector("code");
      const codeText = pre.getAttribute("data-code") || code?.textContent || "";
      copyToClipboard(codeText).then((success) => {
        if (!success) return;
        const span = copyBtn.querySelector("span");
        if (span) {
          const old = span.textContent;
          span.textContent = "已复制";
          copyBtn.style.color = "#28c840";
          setTimeout(() => {
            span.textContent = old;
            copyBtn.style.color = "";
          }, 1800);
        }
      });
    }
  };

  return (
    <div
      ref={containerRef}
      className={`relative flex flex-col rounded-2xl border border-neutral-200/80 dark:border-neutral-800/80 bg-white dark:bg-[#18181c] shadow-sm transition-all overflow-hidden ${
        isFullscreen ? "fixed inset-0 z-50 rounded-none border-none shadow-2xl bg-white dark:bg-[#141416]" : ""
      } ${className}`}
      style={{
        height: activeHeight,
        minHeight: isFullscreen ? "100vh" : "360px",
      }}
    >
      {/* 全屏模式沉浸式顶栏：提供标题输入、存草稿、属性与正式发布 */}
      {isFullscreen && (
        <div className="shrink-0 z-30 flex items-center justify-between gap-3 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-100/90 dark:bg-[#1c1c20]/95 px-4 py-2.5 backdrop-blur-md">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <button
              type="button"
              onClick={() => setIsFullscreen(false)}
              className="flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-800 transition cursor-pointer shrink-0"
              title="退出全屏模式 (Esc)"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">退出全屏</span>
            </button>

            {onTitleChange ? (
              <input
                type="text"
                value={title}
                onChange={(e) => onTitleChange(e.target.value)}
                placeholder="在此输入文章标题..."
                className="bg-transparent text-sm sm:text-base font-bold text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-none w-full max-w-xl truncate"
              />
            ) : (
              <span className="text-sm font-bold text-neutral-900 dark:text-neutral-100 truncate">
                {title || "全屏沉浸创作"}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {onOpenSettings && (
              <button
                type="button"
                onClick={onOpenSettings}
                className="flex items-center gap-1 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-1.5 text-xs font-medium text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition cursor-pointer"
                title="展开属性抽屉"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">文章属性</span>
              </button>
            )}

            {onSave && (
              <button
                type="button"
                onClick={onSave}
                disabled={saving}
                className="flex items-center gap-1 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-1.5 text-xs font-medium text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition cursor-pointer disabled:opacity-50"
                title="保存草稿 (Ctrl+S)"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                <span>存草稿</span>
              </button>
            )}

            {onPublish && (
              <button
                type="button"
                onClick={onPublish}
                disabled={saving}
                className="flex items-center gap-1 rounded-xl bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-1.5 text-xs font-medium transition cursor-pointer shadow-xs disabled:opacity-50"
                title="立即正式发布"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>发布</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* 顶部多功能工具栏 */}
      <div className="shrink-0 z-20 flex items-center justify-between gap-2 border-b border-neutral-200/80 dark:border-neutral-800/80 bg-neutral-50/90 dark:bg-[#202025]/90 px-3 py-2 backdrop-blur-md overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:flex-wrap">
        {/* 左侧：格式化工具组 */}
        <div className="flex items-center gap-1 shrink-0">
          {/* 标题下拉菜单 */}
          <div className="relative">
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setShowHeadingMenu(!showHeadingMenu)}
              className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200/60 dark:hover:bg-white/10 transition-colors cursor-pointer"
              title="标题层级"
            >
              <Heading1 className="h-4 w-4" />
              <span>标题</span>
            </button>
            {showHeadingMenu && (
              <div
                className="absolute left-0 top-full mt-1 w-32 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-[#28282e] p-1.5 shadow-lg z-30 space-y-0.5 animate-scale-in"
                onMouseLeave={() => setShowHeadingMenu(false)}
              >
                {[
                  { level: 1, label: "一级标题 #", icon: Heading1 },
                  { level: 2, label: "二级标题 ##", icon: Heading2 },
                  { level: 3, label: "三级标题 ###", icon: Heading3 },
                ].map(({ level, label, icon: HIcon }) => (
                  <button
                    key={level}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      insertLinePrefix(`${"#".repeat(level)} `, "标题内容");
                      setShowHeadingMenu(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-white/10 cursor-pointer"
                  >
                    <HIcon className="h-3.5 w-3.5" />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="h-4 w-[1px] bg-neutral-300 dark:bg-neutral-700 mx-1" />

          {/* 常用行内样式 */}
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => insertSnippet("**", "**", "粗体文本")}
            className="rounded-lg p-1.5 text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white hover:bg-neutral-200/60 dark:hover:bg-white/10 transition-colors cursor-pointer"
            title="加粗 (Ctrl+B)"
          >
            <Bold className="h-4 w-4" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => insertSnippet("*", "*", "斜体文本")}
            className="rounded-lg p-1.5 text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white hover:bg-neutral-200/60 dark:hover:bg-white/10 transition-colors cursor-pointer"
            title="斜体 (Ctrl+I)"
          >
            <Italic className="h-4 w-4" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => insertSnippet("~~", "~~", "删除线文本")}
            className="rounded-lg p-1.5 text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white hover:bg-neutral-200/60 dark:hover:bg-white/10 transition-colors cursor-pointer"
            title="删除线"
          >
            <Strikethrough className="h-4 w-4" />
          </button>

          <div className="h-4 w-[1px] bg-neutral-300 dark:bg-neutral-700 mx-1" />

          {/* 列表与引用 */}
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => insertLinePrefix("- ", "列表项")}
            className="rounded-lg p-1.5 text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white hover:bg-neutral-200/60 dark:hover:bg-white/10 transition-colors cursor-pointer"
            title="无序列表"
          >
            <List className="h-4 w-4" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => insertLinePrefix("1. ", "列表项")}
            className="rounded-lg p-1.5 text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white hover:bg-neutral-200/60 dark:hover:bg-white/10 transition-colors cursor-pointer"
            title="有序列表"
          >
            <ListOrdered className="h-4 w-4" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => insertLinePrefix("- [ ] ", "待办任务")}
            className="rounded-lg p-1.5 text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white hover:bg-neutral-200/60 dark:hover:bg-white/10 transition-colors cursor-pointer"
            title="待办任务列表"
          >
            <ListTodo className="h-4 w-4" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => insertLinePrefix("> ", "引用文字")}
            className="rounded-lg p-1.5 text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white hover:bg-neutral-200/60 dark:hover:bg-white/10 transition-colors cursor-pointer"
            title="块引用"
          >
            <Quote className="h-4 w-4" />
          </button>

          {/* Callout 提示框下拉 */}
          <div className="relative">
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setShowCalloutMenu(!showCalloutMenu)}
              className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200/60 dark:hover:bg-white/10 transition-colors cursor-pointer"
              title="提示卡片 (Callout)"
            >
              <AlertCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <span className="hidden sm:inline">提示框</span>
            </button>
            {showCalloutMenu && (
              <div
                className="absolute left-0 top-full mt-1 w-36 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-[#28282e] p-1.5 shadow-lg z-30 space-y-0.5 animate-scale-in"
                onMouseLeave={() => setShowCalloutMenu(false)}
              >
                {[
                  { tag: "NOTE", label: "提示 (Note)", color: "text-blue-600 dark:text-blue-400" },
                  { tag: "TIP", label: "技巧 (Tip)", color: "text-emerald-600 dark:text-emerald-400" },
                  { tag: "IMPORTANT", label: "重点 (Important)", color: "text-purple-600 dark:text-purple-400" },
                  { tag: "WARNING", label: "警告 (Warning)", color: "text-amber-600 dark:text-amber-400" },
                  { tag: "CAUTION", label: "危险 (Caution)", color: "text-rose-600 dark:text-rose-400" },
                ].map(({ tag, label, color }) => (
                  <button
                    key={tag}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      insertBlock(`> [!${tag}]\n> 在这里写下具体的${label}说明...`);
                      setShowCalloutMenu(false);
                    }}
                    className={`flex w-full items-center px-2.5 py-1.5 text-xs font-medium rounded-lg hover:bg-neutral-100 dark:hover:bg-white/10 text-neutral-700 dark:text-neutral-200 cursor-pointer ${color}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="h-4 w-[1px] bg-neutral-300 dark:bg-neutral-700 mx-1" />

          {/* 代码与表格 */}
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => insertSnippet("`", "`", "code")}
            className="rounded-lg p-1.5 text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white hover:bg-neutral-200/60 dark:hover:bg-white/10 transition-colors cursor-pointer"
            title="行内代码"
          >
            <Code className="h-4 w-4" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => insertBlock("```ts\n// 输入代码...\nconsole.log(\"Hello Blog!\");\n```")}
            className="rounded-lg p-1.5 text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white hover:bg-neutral-200/60 dark:hover:bg-white/10 transition-colors cursor-pointer"
            title="多行代码块"
          >
            <FileCode className="h-4 w-4" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() =>
              insertBlock(
                "| 列标题 1 | 列标题 2 | 列标题 3 |\n| :--- | :---: | ---: |\n| 左对齐数据 | 居中数据 | 右对齐数据 |\n| 更多行数据 | 示例单元格 | 示例内容 |"
              )
            }
            className="rounded-lg p-1.5 text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white hover:bg-neutral-200/60 dark:hover:bg-white/10 transition-colors cursor-pointer"
            title="插入 GFM 表格"
          >
            <TableIcon className="h-4 w-4" />
          </button>

          <div className="h-4 w-[1px] bg-neutral-300 dark:bg-neutral-700 mx-1" />

          {/* 优雅超链接按钮 (避免原生 window.prompt 弹窗阻断) */}
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleOpenLinkModal}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200/60 dark:hover:bg-white/10 transition-colors cursor-pointer"
            title="插入超链接 (Ctrl+K)"
          >
            <Link2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <span>链接</span>
          </button>

          {/* 本地上传插图 */}
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200/60 dark:hover:bg-white/10 transition-colors cursor-pointer"
            title="从本地上传并插入图片（也支持粘贴截图与拖放）"
          >
            <ImageIcon className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <span>插图</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = e.target.files;
              if (files && files.length > 0) {
                handleBatchUpload(Array.from(files));
              }
              e.target.value = "";
            }}
          />

          {/* 从媒体素材库选择插图 */}
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setShowMediaPicker(true)}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200/60 dark:hover:bg-white/10 transition-colors cursor-pointer"
            title="从已有素材库中选择图片插入"
          >
            <FolderOpen className="h-4 w-4 text-amber-500" />
            <span>素材库</span>
          </button>

          <div className="h-4 w-[1px] bg-neutral-300 dark:bg-neutral-700 mx-1" />

          {/* 丰富内嵌组件快捷按钮 */}
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setShowMusicPanel(true)}
            className="rounded-lg p-1.5 text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white hover:bg-neutral-200/60 dark:hover:bg-white/10 transition-colors cursor-pointer"
            title="插入音乐卡片"
          >
            <Music className="h-4 w-4" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setShowVideoPanel(true)}
            className="rounded-lg p-1.5 text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white hover:bg-neutral-200/60 dark:hover:bg-white/10 transition-colors cursor-pointer"
            title="插入视频播放器"
          >
            <Video className="h-4 w-4" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setShowDoubanPicker(true)}
            className="rounded-lg p-1.5 text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white hover:bg-neutral-200/60 dark:hover:bg-white/10 transition-colors cursor-pointer"
            title="插入豆瓣条目"
          >
            <Bookmark className="h-4 w-4" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setShowLinkCardPanel(true)}
            className="rounded-lg p-1.5 text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white hover:bg-neutral-200/60 dark:hover:bg-white/10 transition-colors cursor-pointer"
            title="插入精美链接卡片"
          >
            <ExternalLink className="h-4 w-4" />
          </button>
        </div>

        {/* 右侧：视图模式切换、语法速查与全屏 */}
        <div className="flex items-center gap-1.5 shrink-0 pl-1">
          {/* 语法速查 */}
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setShowHelpModal(true)}
            className="rounded-lg p-1.5 text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white hover:bg-neutral-200/60 dark:hover:bg-white/10 transition-colors cursor-pointer"
            title="Markdown 语法速查"
          >
            <HelpCircle className="h-4 w-4" />
          </button>

          {/* 视图模式切换 */}
          <div className="flex items-center rounded-xl bg-neutral-200/60 dark:bg-neutral-800 p-0.5 text-xs font-medium">
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setViewMode("edit")}
              className={`flex items-center gap-1 rounded-lg px-2 py-1 transition-all cursor-pointer ${
                viewMode === "edit"
                  ? "bg-white dark:bg-[#28282e] text-neutral-900 dark:text-white shadow-xs font-semibold"
                  : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900"
              }`}
              title="纯编辑模式"
            >
              <PenLine className="h-3.5 w-3.5" />
              <span>编辑</span>
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setViewMode("split")}
              className={`hidden sm:flex items-center gap-1 rounded-lg px-2 py-1 transition-all cursor-pointer ${
                viewMode === "split"
                  ? "bg-white dark:bg-[#28282e] text-neutral-900 dark:text-white shadow-xs font-semibold"
                  : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900"
              }`}
              title="分栏双屏实时预览"
            >
              <Columns2 className="h-3.5 w-3.5" />
              <span>分栏</span>
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setViewMode("preview")}
              className={`flex items-center gap-1 rounded-lg px-2 py-1 transition-all cursor-pointer ${
                viewMode === "preview"
                  ? "bg-white dark:bg-[#28282e] text-neutral-900 dark:text-white shadow-xs font-semibold"
                  : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900"
              }`}
              title="纯预览模式"
            >
              <Eye className="h-3.5 w-3.5" />
              <span>预览</span>
            </button>
          </div>

          {/* 全屏写作切换 */}
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setIsFullscreen(!isFullscreen)}
            className={`flex items-center gap-1 rounded-lg p-1.5 text-xs font-medium transition cursor-pointer ${
              isFullscreen
                ? "bg-neutral-200 dark:bg-neutral-800 text-neutral-900 dark:text-white px-2"
                : "text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white hover:bg-neutral-200/60 dark:hover:bg-white/10"
            }`}
            title={isFullscreen ? "退出全屏 (Esc)" : "沉浸全屏写作"}
          >
            {isFullscreen ? (
              <>
                <Minimize2 className="h-4 w-4" />
                <span className="hidden sm:inline">退出全屏</span>
              </>
            ) : (
              <Maximize2 className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      {/* 拖放图片遮罩 */}
      {isDragOver && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-emerald-500/10 backdrop-blur-xs border-2 border-dashed border-emerald-500 rounded-2xl pointer-events-none">
          <ImageIcon className="h-12 w-12 text-emerald-600 dark:text-emerald-400 animate-bounce" />
          <p className="mt-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
            松开鼠标，立即上传并插入图片
          </p>
        </div>
      )}

      {/* 图片上传中状态浮动条 */}
      {uploading && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 rounded-full bg-neutral-900/90 dark:bg-white/90 px-4 py-1.5 text-xs font-medium text-white dark:text-neutral-900 shadow-lg backdrop-blur-xs animate-fade-in-up">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400 dark:text-emerald-600" />
          <span>{uploadMessage || "正在处理图片上传..."}</span>
        </div>
      )}

      {/* 图片上传失败提示浮动条 */}
      {uploadError && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 rounded-full bg-rose-600 px-4 py-1.5 text-xs font-medium text-white shadow-lg backdrop-blur-xs animate-fade-in-up">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>{uploadError}</span>
        </div>
      )}

      {/* 主工作区 */}
      <div className="relative flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">
        {/* 左侧：Markdown 编辑器 */}
        {(viewMode === "split" || viewMode === "edit") && (
          <div
            className={`relative flex-1 min-w-0 min-h-0 h-full overflow-hidden ${
              viewMode === "split" ? "border-b md:border-b-0 md:border-r border-neutral-200/80 dark:border-neutral-800/80" : ""
            }`}
          >
            <textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => {
                lastSelectionRef.current = {
                  start: e.target.selectionStart,
                  end: e.target.selectionEnd,
                };
                onChange(e.target.value);
                updateCursorPos();
              }}
              onSelect={updateCursorPos}
              onKeyUp={updateCursorPos}
              onClick={updateCursorPos}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragOver(true);
              }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
              onScroll={handleEditorScroll}
              placeholder={placeholder}
              spellCheck={false}
              className="absolute inset-0 w-full h-full resize-none bg-transparent p-6 sm:p-8 md:p-10 font-sans text-[15px] sm:text-[15.5px] leading-[1.85] tracking-normal text-neutral-800 dark:text-neutral-100 focus:outline-none placeholder:text-neutral-400/70 dark:placeholder:text-neutral-500/70 selection:bg-emerald-500/25 overflow-y-auto editor-scrollbar"
            />
          </div>
        )}

        {/* 右侧：实时渲染预览 */}
        {(viewMode === "split" || viewMode === "preview") && (
          <div
            ref={previewRef}
            onScroll={handlePreviewScroll}
            onClick={handlePreviewClick}
            className="relative flex-1 min-w-0 min-h-0 h-full overflow-y-auto p-6 sm:p-8 md:p-10 bg-neutral-50/40 dark:bg-[#121215]/50 editor-scrollbar"
          >
            {value ? (
              <div
                className="article-content rich-content max-w-none text-[15px] sm:text-[15.5px] leading-[1.85] text-neutral-800 dark:text-neutral-100"
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center text-neutral-400 dark:text-neutral-600 select-none">
                <Sparkles className="h-8 w-8 stroke-1" />
                <p className="mt-2 text-sm">在左侧输入 Markdown，右侧将实时渲染排版预览</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 底部状态栏 */}
      <div className="shrink-0 flex items-center justify-between border-t border-neutral-200/80 dark:border-neutral-800/80 bg-neutral-50/80 dark:bg-[#202025]/80 px-4 py-1.5 text-xs text-neutral-500 dark:text-neutral-400 select-none">
        <div className="flex items-center gap-3 sm:gap-4">
          <span>
            字数：<strong className="font-semibold text-neutral-800 dark:text-neutral-200">{stats.charCount}</strong>
          </span>
          <span>
            行数：<strong className="font-semibold text-neutral-800 dark:text-neutral-200">{stats.lineCount}</strong>
          </span>
          <span className="hidden sm:inline-block">
            光标：<strong className="font-semibold text-neutral-800 dark:text-neutral-200">{cursorPos.line}</strong> 行 <strong className="font-semibold text-neutral-800 dark:text-neutral-200">{cursorPos.col}</strong> 列
          </span>
          <span className="hidden md:inline-block">
            阅读：约 <strong className="font-semibold text-neutral-800 dark:text-neutral-200">{stats.readMinutes}</strong> 分钟
          </span>
        </div>

        {/* 垂直高度调整手柄 */}
        {!isFullscreen && (
          <div
            onMouseDown={handleResizeStart}
            className="flex items-center gap-1 px-3 py-0.5 rounded text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-200/50 dark:hover:bg-neutral-800/60 cursor-row-resize transition-colors select-none"
            title="按住上下拖拽调整编辑器高度"
          >
            <div className="flex flex-col items-center gap-0.5">
              <div className="w-8 h-[2px] bg-neutral-300 dark:bg-neutral-600 rounded-full" />
              <div className="w-4 h-[2px] bg-neutral-300 dark:bg-neutral-600 rounded-full" />
            </div>
          </div>
        )}

        <div className="flex items-center gap-3 text-[11px]">
          <span className="hidden lg:inline-block">快捷键: Ctrl+S 保存 · Ctrl+B 粗体 · 截图拖拽即传</span>
          <span className="rounded-md bg-neutral-200/60 dark:bg-neutral-800 px-1.5 py-0.5 font-mono text-neutral-600 dark:text-neutral-300">
            GFM + Frontmatter
          </span>
        </div>
      </div>

      {/* 弹窗 1：插入超链接模态框 */}
      {showLinkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs animate-fade-in">
          <div className="w-full max-w-sm rounded-2xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-[#202025] p-5 shadow-2xl space-y-4 animate-scale-in">
            <div className="flex items-center justify-between pb-2 border-b border-neutral-200 dark:border-neutral-800">
              <div className="flex items-center gap-2">
                <Link2 className="h-4 w-4 text-blue-600" />
                <h3 className="font-bold text-sm text-neutral-900 dark:text-white">插入超链接</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowLinkModal(false)}
                className="text-neutral-400 hover:text-neutral-700 dark:hover:text-white cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  链接文本
                </label>
                <input
                  type="text"
                  value={linkModalText}
                  onChange={(e) => setLinkModalText(e.target.value)}
                  placeholder="例如：查看官方文档"
                  className="w-full rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 px-3 py-2 text-xs text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleConfirmInsertLink();
                  }}
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  链接地址 (URL)
                </label>
                <input
                  type="text"
                  value={linkModalUrl}
                  onChange={(e) => setLinkModalUrl(e.target.value)}
                  placeholder="https://example.com"
                  className="w-full rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 px-3 py-2 text-xs text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 font-mono"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleConfirmInsertLink();
                  }}
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-200 dark:border-neutral-800">
              <button
                type="button"
                onClick={() => setShowLinkModal(false)}
                className="rounded-xl border border-neutral-200 dark:border-neutral-700 px-3 py-1.5 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition cursor-pointer"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleConfirmInsertLink}
                className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 text-xs font-medium transition cursor-pointer shadow-xs"
              >
                确认插入
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 弹窗 2：从媒体素材库选择配图 */}
      <MediaPicker
        open={showMediaPicker}
        onClose={() => setShowMediaPicker(false)}
        onSelect={handleSelectFromMediaPicker}
        category="image"
        title="从素材库插入文章配图"
      />

      {/* 弹窗 3：语法速查弹窗 */}
      {showHelpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs animate-fade-in">
          <div className="w-full max-w-lg rounded-2xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-[#202025] p-6 shadow-2xl space-y-4 animate-scale-in">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-200 dark:border-neutral-700">
              <div className="flex items-center gap-2">
                <HelpCircle className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                <h3 className="font-bold text-sm text-neutral-900 dark:text-white">Markdown 语法速查</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowHelpModal(false)}
                className="rounded-lg p-1 text-neutral-400 hover:text-neutral-700 dark:hover:text-white cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto space-y-3 text-xs leading-relaxed text-neutral-600 dark:text-neutral-300 pr-1">
              <div>
                <strong className="text-neutral-900 dark:text-white block mb-1">标题与文本</strong>
                <code className="block bg-neutral-100 dark:bg-neutral-800 p-2 rounded-lg font-mono">
                  # 一级标题&nbsp;&nbsp;## 二级标题&nbsp;&nbsp;### 三级标题<br />
                  **加粗**&nbsp;&nbsp;*斜体*&nbsp;&nbsp;~~删除线~~&nbsp;&nbsp;`行内代码`
                </code>
              </div>

              <div>
                <strong className="text-neutral-900 dark:text-white block mb-1">列表与待办</strong>
                <code className="block bg-neutral-100 dark:bg-neutral-800 p-2 rounded-lg font-mono">
                  - 无序列表项<br />
                  1. 有序列表项<br />
                  - [ ] 待办任务&nbsp;&nbsp;- [x] 已完成任务
                </code>
              </div>

              <div>
                <strong className="text-neutral-900 dark:text-white block mb-1">代码块与表格</strong>
                <code className="block bg-neutral-100 dark:bg-neutral-800 p-2 rounded-lg font-mono">
                  ```ts<br />
                  console.log(&quot;Hello Dual!&quot;);<br />
                  ```
                </code>
              </div>

              <div>
                <strong className="text-neutral-900 dark:text-white block mb-1">提示卡片 (Callout)</strong>
                <code className="block bg-neutral-100 dark:bg-neutral-800 p-2 rounded-lg font-mono">
                  &gt; [!NOTE] 提示内容<br />
                  &gt; [!TIP] 实用小技巧<br />
                  &gt; [!IMPORTANT] 核心重点<br />
                  &gt; [!WARNING] 警告注意事项
                </code>
              </div>

              <div>
                <strong className="text-neutral-900 dark:text-white block mb-1">图片与快捷上传</strong>
                <p>直接按 <code>Ctrl+V</code> 粘贴系统截图，拖放图片到编辑区，或点击工具栏「素材库」直接挑选现有图片。</p>
              </div>
            </div>

            <div className="pt-2 text-right border-t border-neutral-200 dark:border-neutral-800">
              <button
                type="button"
                onClick={() => setShowHelpModal(false)}
                className="rounded-xl bg-neutral-900 px-4 py-2 text-xs font-semibold text-white dark:bg-white dark:text-neutral-900 cursor-pointer"
              >
                我知道了
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 模态插入面板 */}
      <MusicPanel
        open={showMusicPanel}
        onClose={() => setShowMusicPanel(false)}
        onConfirm={(music: PostMusic) => {
          insertBlock(buildMusicEmbedHtml(music));
          setShowMusicPanel(false);
        }}
        token={token}
      />

      <VideoPanel
        open={showVideoPanel}
        onClose={() => setShowVideoPanel(false)}
        onConfirm={(video: PostVideo) => {
          insertBlock(buildVideoEmbedHtml(video));
          setShowVideoPanel(false);
        }}
        token={token}
      />

      <DoubanPicker
        open={showDoubanPicker}
        onClose={() => setShowDoubanPicker(false)}
        onSelect={(item: PostDouban) => {
          insertBlock(buildDoubanEmbedHtml(item));
          setShowDoubanPicker(false);
        }}
      />

      <LinkCardPanel
        open={showLinkCardPanel}
        onClose={() => setShowLinkCardPanel(false)}
        onConfirm={(card: LinkCard) => {
          insertBlock(buildLinkCardHtml(card));
          setShowLinkCardPanel(false);
        }}
        token={token}
      />
    </div>
  );
}
