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
} from "lucide-react";
import { markdownToHtml, copyToClipboard } from "@/lib/markdown";
import { parseFrontmatter, type ArticleFrontmatter } from "@/lib/frontmatter";
import { calculateReadingStats } from "@/lib/reading-time";
import { uploadImage, toAbsoluteUrl } from "@/lib/upload";
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

  // Panels
  const [showMusicPanel, setShowMusicPanel] = useState(false);
  const [showVideoPanel, setShowVideoPanel] = useState(false);
  const [showDoubanPicker, setShowDoubanPicker] = useState(false);
  const [showLinkCardPanel, setShowLinkCardPanel] = useState(false);
  const [showCalloutMenu, setShowCalloutMenu] = useState(false);
  const [showHeadingMenu, setShowHeadingMenu] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);

  useEffect(() => {
    if (!isFullscreen) return;
    const onEsc = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsFullscreen(false);
      }
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [isFullscreen]);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isScrollingRef = useRef<"editor" | "preview" | null>(null);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
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
  }, []);

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

      // 确保前后换行干净
      const prefix = before.endsWith("\n\n") || !before ? "" : before.endsWith("\n") ? "\n" : "\n\n";
      const suffix = after.startsWith("\n\n") || !after ? "" : after.startsWith("\n") ? "\n" : "\n\n";

      const nextValue = `${before}${prefix}${template}${suffix}${after}`;
      onChange(nextValue);

      setTimeout(() => {
        textarea.focus();
        const cursorIndex = before.length + prefix.length + template.length;
        textarea.setSelectionRange(cursorIndex, cursorIndex);
      }, 0);
    },
    [onChange]
  );

  // 统一批量图片上传处理器（原子化插入，防止多图竞态及光标错位）
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

  // 处理粘贴（支持截图截屏或剪贴板图片文件直传）
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

  // 键盘快捷键支持 (Ctrl+B, Ctrl+I, Ctrl+K, Ctrl+S, Tab, Shift+Tab, Enter)
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      const isMac =
        typeof navigator !== "undefined" &&
        /Mac|iPod|iPhone|iPad/i.test(navigator.userAgent || navigator.platform || "");
      const isCmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

      // Ctrl + S / Cmd + S: 保存草稿
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

      // Ctrl + K: 链接
      if (isCmdOrCtrl && e.key.toLowerCase() === "k") {
        e.preventDefault();
        const url = window.prompt("输入链接地址 (URL):", "https://");
        if (url) {
          insertSnippet("[", `](${url})`, "链接标题");
        }
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
          // 反向缩进
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
          // 正向缩进 2 空格
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

        // 匹配无序列表 (- [*+])
        const unorderedMatch = lastLine.match(/^(\s*[-*+]\s+)(.*)$/);
        if (unorderedMatch) {
          if (!unorderedMatch[2].trim()) {
            // 当前行为空列表项，按 Enter 自动取消列表
            e.preventDefault();
            const nextValue =
              textarea.value.slice(0, lastLineStart) + textarea.value.slice(start);
            onChange(nextValue);
            setTimeout(() => {
              textarea.setSelectionRange(lastLineStart, lastLineStart);
            }, 0);
            return;
          }
          // 自动延续无序列表
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

        // 匹配任务列表 (- [ ] 或 - [x])
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
          const nextPrefix = taskMatch[1].replace(/\[[xX]\]/, "[ ]");
          const nextValue =
            textarea.value.slice(0, start) + "\n" + nextPrefix + textarea.value.slice(start);
          onChange(nextValue);
          setTimeout(() => {
            const newPos = start + 1 + nextPrefix.length;
            textarea.setSelectionRange(newPos, newPos);
          }, 0);
          return;
        }

        // 匹配有序列表 (1. )
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
          const nextPrefix = `${orderedMatch[1]}${nextNum}. `;
          const nextValue =
            textarea.value.slice(0, start) + "\n" + nextPrefix + textarea.value.slice(start);
          onChange(nextValue);
          setTimeout(() => {
            const newPos = start + 1 + nextPrefix.length;
            textarea.setSelectionRange(newPos, newPos);
          }, 0);
          return;
        }
      }
    },
    [insertSnippet, onChange, onSave]
  );

  // 双向滚动同步（当分栏显示时，精准按可见内容比例同步，防止死循环抖动）
  const handleEditorScroll = useCallback(() => {
    if (viewMode !== "split") return;
    if (isScrollingRef.current === "preview") return;

    const textarea = textareaRef.current;
    const preview = previewRef.current;
    if (!textarea || !preview) return;

    const maxEditorScroll = textarea.scrollHeight - textarea.clientHeight;
    const maxPreviewScroll = preview.scrollHeight - preview.clientHeight;

    if (maxEditorScroll <= 0 || maxPreviewScroll <= 0) return;

    isScrollingRef.current = "editor";
    const ratio = Math.max(0, Math.min(1, textarea.scrollTop / maxEditorScroll));
    preview.scrollTop = ratio * maxPreviewScroll;

    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(() => {
      isScrollingRef.current = null;
    }, 80);
  }, [viewMode]);

  const handlePreviewScroll = useCallback(() => {
    if (viewMode !== "split") return;
    if (isScrollingRef.current === "editor") return;

    const textarea = textareaRef.current;
    const preview = previewRef.current;
    if (!textarea || !preview) return;

    const maxEditorScroll = textarea.scrollHeight - textarea.clientHeight;
    const maxPreviewScroll = preview.scrollHeight - preview.clientHeight;

    if (maxEditorScroll <= 0 || maxPreviewScroll <= 0) return;

    isScrollingRef.current = "preview";
    const ratio = Math.max(0, Math.min(1, preview.scrollTop / maxPreviewScroll));
    textarea.scrollTop = ratio * maxEditorScroll;

    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(() => {
      isScrollingRef.current = null;
    }, 80);
  }, [viewMode]);

  // 预览区复制代码按钮交互（支持安全回退）
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
        isFullscreen ? "fixed inset-0 z-50 rounded-none border-none shadow-2xl" : ""
      } ${className}`}
      style={{
        height: activeHeight,
        minHeight: isFullscreen ? "100vh" : "360px",
      }}
    >
      {/* 顶部多功能工具栏 (ByteMD / Ghost 风格，所有按钮支持 onMouseDown 防止文本区失焦) */}
      <div className="shrink-0 z-20 flex items-center justify-between gap-2 border-b border-neutral-200/80 dark:border-neutral-800/80 bg-neutral-50/90 dark:bg-[#202025]/90 px-3 py-2 backdrop-blur-md overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:flex-wrap">
        {/* 左侧：格式化工具组 (小屏保持单行平滑横滑，杜绝挤占打字视口) */}
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
                className="absolute left-0 top-full mt-1 w-32 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-[#28282e] p-1.5 shadow-lg z-30 space-y-0.5"
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
                      insertSnippet(`${"#".repeat(level)} `, "", "标题内容");
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
            onClick={() => insertSnippet("- ", "", "列表项")}
            className="rounded-lg p-1.5 text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white hover:bg-neutral-200/60 dark:hover:bg-white/10 transition-colors cursor-pointer"
            title="无序列表"
          >
            <List className="h-4 w-4" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => insertSnippet("1. ", "", "列表项")}
            className="rounded-lg p-1.5 text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white hover:bg-neutral-200/60 dark:hover:bg-white/10 transition-colors cursor-pointer"
            title="有序列表"
          >
            <ListOrdered className="h-4 w-4" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => insertSnippet("- [ ] ", "", "待办任务")}
            className="rounded-lg p-1.5 text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white hover:bg-neutral-200/60 dark:hover:bg-white/10 transition-colors cursor-pointer"
            title="待办任务列表"
          >
            <ListTodo className="h-4 w-4" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => insertSnippet("> ", "", "引用文字")}
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
                className="absolute left-0 top-full mt-1 w-36 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-[#28282e] p-1.5 shadow-lg z-30 space-y-0.5"
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

          {/* 链接与图片 */}
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              const url = window.prompt("输入链接 URL:", "https://");
              if (url) insertSnippet("[", `](${url})`, "链接说明");
            }}
            className="rounded-lg p-1.5 text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white hover:bg-neutral-200/60 dark:hover:bg-white/10 transition-colors cursor-pointer"
            title="插入超链接 (Ctrl+K)"
          >
            <Link2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200/60 dark:hover:bg-white/10 transition-colors cursor-pointer"
            title="上传并插入图片（也支持直接粘贴截图或拖放）"
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
          {isFullscreen && onSave && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={onSave}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-lg bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 px-3 py-1.5 text-xs font-semibold hover:bg-neutral-800 dark:hover:bg-neutral-100 disabled:opacity-50 transition cursor-pointer"
              title="保存草稿 (Ctrl+S)"
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              <span>{saving ? "保存中..." : "存草稿"}</span>
            </button>
          )}

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
        <div className="absolute top-12 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 rounded-full bg-neutral-900/90 dark:bg-white/90 px-4 py-1.5 text-xs font-medium text-white dark:text-neutral-900 shadow-lg backdrop-blur-xs animate-fade-in-up">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400 dark:text-emerald-600" />
          <span>{uploadMessage || "正在处理图片上传..."}</span>
        </div>
      )}

      {/* 图片上传失败提示浮动条 */}
      {uploadError && (
        <div className="absolute top-12 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 rounded-full bg-rose-600 px-4 py-1.5 text-xs font-medium text-white shadow-lg backdrop-blur-xs animate-fade-in-up">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>{uploadError}</span>
        </div>
      )}

      {/* 主工作区：根据 viewMode 渲染单栏或分栏（移动端分栏自适应为单栏或上下叠放） */}
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

      {/* 语法速查弹窗 */}
      {showHelpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-fade-in">
          <div className="relative w-full max-w-lg rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#202025] p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 pb-3">
              <h3 className="font-bold text-neutral-900 dark:text-white flex items-center gap-2 text-base">
                <HelpCircle className="h-5 w-5 text-emerald-500" />
                <span>Markdown 语法与排版指南</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowHelpModal(false)}
                className="rounded-lg p-1 text-neutral-400 hover:text-neutral-700 dark:hover:text-white"
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
                <strong className="text-neutral-900 dark:text-white block mb-1">macOS 代码块（带行号与复制）</strong>
                <code className="block bg-neutral-100 dark:bg-neutral-800 p-2 rounded-lg font-mono">
                  ```ts<br />
                  const greeting = &quot;Hello World&quot;;<br />
                  console.log(greeting);<br />
                  ```
                </code>
              </div>

              <div>
                <strong className="text-neutral-900 dark:text-white block mb-1">提示卡片 (Callout)</strong>
                <code className="block bg-neutral-100 dark:bg-neutral-800 p-2 rounded-lg font-mono">
                  &gt; [!NOTE] 提示内容<br />
                  &gt; [!TIP] 实用小技巧<br />
                  &gt; [!IMPORTANT] 核心重点<br />
                  &gt; [!WARNING] 警告注意事项<br />
                  &gt; [!CAUTION] 危险操作提示
                </code>
              </div>

              <div>
                <strong className="text-neutral-900 dark:text-white block mb-1">图片与截图直传</strong>
                <p>直接按 <code>Ctrl+V</code> 粘贴系统剪贴板中的截图，或将图片文件拖放至编辑区，系统将自动上传并插入 Markdown 链接。</p>
              </div>
            </div>

            <div className="pt-2 text-right">
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
