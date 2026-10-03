"use client";

import { useEffect, useState, useMemo } from "react";
import ArticleCommentSection from "@/components/article/ArticleCommentSection";
import ArticleEmbedContent from "@/components/article/ArticleEmbedContent";
import AboutSocialSection, { type SocialLinkItem } from "@/components/AboutSocialSection";
import type { Comment, User } from "@/lib/types";

interface AboutReaderProps {
  page: {
    id: string;
    content: string;
    comments: Comment[];
  };
  owner?: User | null;
  siteSettings?: {
    socialLinks?: string;
    [key: string]: unknown;
  } | null;
}

export default function AboutReader({ page, owner, siteSettings }: AboutReaderProps) {
  const [content, setContent] = useState(page.content);
  const [comments, setComments] = useState(page.comments || []);

  useEffect(() => {
    setContent(page.content);
  }, [page.content]);

  useEffect(() => {
    // 仅当服务端未提供内容时，才使用本地缓存作为降级容灾，优先保障服务端新鲜数据
    if (!page.content) {
      try {
        const local = localStorage.getItem("about_page_content");
        if (local) {
          setContent(local);
        }
      } catch {}
    }
  }, [page.content]);

  useEffect(() => {
    setComments(page.comments || []);
  }, [page.comments]);

  // 解析网站全量社交平台链接
  const resolvedSocialLinks = useMemo<SocialLinkItem[]>(() => {
    let list: SocialLinkItem[] = [];
    try {
      const parsed = JSON.parse(siteSettings?.socialLinks || "[]");
      if (Array.isArray(parsed) && parsed.length > 0) {
        list = parsed.filter((l: { type: string; url: string }) => l.type && l.url);
      }
    } catch {}

    // 若无邮箱且 owner.email 存在，补充邮箱
    if (owner?.email && !list.some((l) => l.type.toLowerCase() === "email")) {
      list.push({ type: "email", url: owner.email });
    }
    return list;
  }, [siteSettings?.socialLinks, owner?.email]);

  return (
    <article className="px-4 pb-12 pt-4 md:px-6">
      <h1 className="text-[24px] font-medium leading-tight text-wechat-text dark:text-white md:text-[28px]">
        关于
      </h1>
      {content && content.trim() ? (
        <ArticleEmbedContent
          content={content}
          postId={page.id}
          className="article-content rich-content mt-5 text-[16px] leading-[1.8] text-wechat-text dark:text-gray-200 md:text-[18px] md:leading-[1.9]"
        />
      ) : (
        <div className="py-16 text-center text-sm text-neutral-400 dark:text-neutral-500">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-neutral-100 text-xl text-neutral-400 dark:bg-neutral-800 dark:text-neutral-500">
            🌱
          </div>
          <p className="font-medium text-neutral-600 dark:text-neutral-300">博主暂未填写关于内容</p>
          <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">后续发布后即可在此展现</p>
        </div>
      )}

      {/* 社交矩阵与全网足迹 */}
      <AboutSocialSection socialLinks={resolvedSocialLinks} />

      <div className="mt-8 border-t border-black/5 dark:border-white/10" />
      <ArticleCommentSection
        post={{ id: page.id, content: "", author: { id: "", nickname: "", avatar: "", cover: "", bio: "" }, images: [], likes: [], comments, createdAt: "" }}
        comments={comments}
        onCommentsChange={setComments}
        commentApiBase="/pages/about"
      />
    </article>
  );
}
