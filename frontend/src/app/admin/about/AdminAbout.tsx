"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Loader2, Save, Check, ExternalLink, RotateCcw, AlertCircle } from "lucide-react";
import MarkdownEditor from "@/components/editor/MarkdownEditor";
import { apiFetch, getToken } from "@/lib/api-fetch";
import { defaultAboutContent } from "@/lib/default-content";
import { htmlToMarkdown } from "@/lib/markdown";

export default function AdminAbout() {
  const [content, setContent] = useState(() => htmlToMarkdown(defaultAboutContent));
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<{
    type: "success" | "warning";
    message: string;
  } | null>(null);

  // 初始化加载：优先读本地缓存，再静默请求后端
  useEffect(() => {
    try {
      const cached = localStorage.getItem("about_page_content");
      if (cached) {
        setContent(htmlToMarkdown(cached));
      }
    } catch {}

    apiFetch("/pages/about")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.content) {
          const md = htmlToMarkdown(data.content);
          setContent(md);
          try {
            localStorage.setItem("about_page_content", md);
          } catch {}
        }
      })
      .catch(() => {
        // 静默降级到本地缓存或默认自述，不弹窗打扰用户
      });
  }, []);

  // 自动隐藏保存状态提示
  useEffect(() => {
    if (!saveStatus) return;
    const timer = setTimeout(() => setSaveStatus(null), 3500);
    return () => clearTimeout(timer);
  }, [saveStatus]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    // 始终先持久化到本地，保证前台和刷新立即可见
    try {
      localStorage.setItem("about_page_content", content);
    } catch {}

    try {
      const res = await apiFetch("/pages/about", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });

      if (res.ok) {
        setSaveStatus({
          type: "success",
          message: "已保存到服务器，前台页面已实时同步",
        });
      } else {
        setSaveStatus({
          type: "warning",
          message: "已保存到本地缓存（离线模式），前台可正常预览",
        });
      }
    } catch {
      setSaveStatus({
        type: "warning",
        message: "已保存到本地缓存（离线模式），前台可正常预览",
      });
    } finally {
      setSaving(false);
    }
  }, [content]);

  const handleReset = () => {
    if (window.confirm("确定要恢复默认的关于页介绍吗？未保存的自定义内容将被覆盖。")) {
      const md = htmlToMarkdown(defaultAboutContent);
      setContent(md);
      try {
        localStorage.setItem("about_page_content", md);
      } catch {}
      setSaveStatus({
        type: "success",
        message: "已重置为默认介绍内容",
      });
    }
  };

  return (
    <div className="mx-auto max-w-[1200px] space-y-5 px-4 py-6">
      {/* 顶部标题与操作栏 */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-adm-text">关于页自述</h1>
            <span className="rounded-full bg-adm-border/50 px-2 py-0.5 text-xs text-adm-text-secondary">
              /about
            </span>
          </div>
          <p className="mt-1 text-sm text-adm-text-secondary">
            编辑前台「关于」频道的个人后花园与站长自述，支持 Markdown 排版、语法高亮与实时双栏预览
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Link
            href="/about"
            target="_blank"
            rel="noopener noreferrer"
            className="adm-btn adm-btn--secondary"
          >
            <ExternalLink className="h-4 w-4" />
            <span>查看前台</span>
          </Link>

          <button
            type="button"
            onClick={handleReset}
            className="adm-btn adm-btn--quiet"
          >
            <RotateCcw className="h-4 w-4" />
            <span>重置默认</span>
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="adm-btn adm-btn--primary"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            <span>保存自述 (Ctrl+S)</span>
          </button>
        </div>
      </div>

      {/* 状态提示条 */}
      {saveStatus && (
        <div
          className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm transition-all ${
            saveStatus.type === "success"
              ? "border border-emerald-500/20 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
              : "border border-amber-500/20 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
          }`}
        >
          {saveStatus.type === "success" ? (
            <Check className="h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0" />
          )}
          <span>{saveStatus.message}</span>
        </div>
      )}

      {/* Markdown 编辑器 */}
      <MarkdownEditor
        value={content}
        onChange={setContent}
        token={getToken() || ""}
        onSave={handleSave}
        placeholder="开始写下你自己的故事、小站理念或向访客打招呼..."
        minHeight="560px"
      />
    </div>
  );
}
