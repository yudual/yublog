import Link from "next/link";
import { BookOpen, ChevronRight, Layers, Pin, ArrowRight } from "lucide-react";
import type { Post } from "@/lib/types";
import { resolveCoverImage } from "@/lib/post-image";
import { fetchPostsPage } from "@/lib/server-data";

/**
 * 文章页顶部的"系列合辑"入口横条。
 * 沉稳精雕的杂志专栏展区，具备多层柔和投影与触感微交互。
 */
export default async function CollectionStrip() {
  const result = await fetchPostsPage("page=1&limit=10&type=collection");
  const collections = result.data;
  if (collections.length === 0) return null;

  return (
    <section aria-label="系列合辑" className="mt-12 sm:mt-16">
      <div className="flex items-center justify-between px-1 pb-3.5 border-t border-neutral-200/70 dark:border-neutral-800/80 pt-7">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50/80 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400 border border-blue-200/50 dark:border-blue-900/40">
            <BookOpen className="h-3.5 w-3.5" />
          </div>
          <div>
            <h3 className="text-base font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
              系列专栏合辑
            </h3>
          </div>
          <span className="ml-1 rounded-md bg-neutral-100/80 dark:bg-neutral-800/80 px-2 py-0.5 text-[11px] font-medium text-neutral-500 dark:text-neutral-400 border border-neutral-200/50 dark:border-neutral-700/50">
            {result.total} 个
          </span>
        </div>

        <Link
          href="/collections"
          className="group/all inline-flex items-center gap-1.5 rounded-xl border border-neutral-200/80 dark:border-neutral-700/80 bg-white/80 dark:bg-neutral-800/70 px-3 py-1.5 text-xs font-semibold text-neutral-600 dark:text-neutral-300 shadow-2xs hover:border-neutral-300 dark:hover:border-neutral-600 hover:text-neutral-900 dark:hover:text-white hover:shadow-xs active:scale-[0.97] transition-all"
        >
          <span>浏览所有专栏</span>
          <ChevronRight className="h-3.5 w-3.5 text-neutral-400 group-hover/all:text-neutral-700 dark:group-hover/all:text-neutral-200 group-hover/all:translate-x-0.5 transition-all" />
        </Link>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4 pt-1 scroll-smooth snap-x snap-mandatory [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5">
        {collections.map((col: Post) => {
          const articleCount = Array.isArray(col.collectionArticles) ? col.collectionArticles.length : 0;
          const cover = resolveCoverImage(col.cover, "");
          return (
            <Link
              key={col.id}
              href={`/articles/${col.shortId || col.id}`}
              className="group snap-start relative flex w-72 sm:w-80 shrink-0 flex-col overflow-hidden rounded-2xl border border-neutral-200/70 dark:border-neutral-800/80 bg-white/90 dark:bg-neutral-900/80 backdrop-blur-md shadow-[0_1px_3px_rgba(0,0,0,0.02),0_6px_20px_-4px_rgba(0,0,0,0.03)] dark:shadow-[0_1px_3px_rgba(0,0,0,0.3)] transition-all duration-300 hover:border-neutral-300 dark:hover:border-neutral-700 hover:shadow-[0_4px_20px_-4px_rgba(0,0,0,0.06)] hover:-translate-y-1"
            >
              {/* 顶部微高光线 */}
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-neutral-300/40 dark:via-neutral-700/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

              <div className="flex items-start gap-3.5 p-4">
                {cover ? (
                  <div className="relative h-14 w-14 sm:h-16 sm:w-16 shrink-0 overflow-hidden rounded-xl border border-black/5 dark:border-white/10 shadow-2xs bg-neutral-100 dark:bg-neutral-800">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={cover}
                      alt={col.title || "合辑封面"}
                      className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
                    />
                  </div>
                ) : (
                  <div className="flex h-14 w-14 sm:h-16 sm:w-16 shrink-0 items-center justify-center rounded-xl bg-blue-50/80 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400 border border-blue-200/40 dark:border-blue-900/40">
                    <BookOpen className="h-6 w-6" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-[11px] text-neutral-400 dark:text-neutral-500">
                    <span className="font-medium text-blue-600 dark:text-blue-400">专栏 · {articleCount} 篇</span>
                    {col.pinned && (
                      <span className="inline-flex items-center gap-0.5 rounded bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20 px-1.5 py-px text-[10px] font-medium">
                        <Pin className="h-2.5 w-2.5 rotate-45 text-amber-600 dark:text-amber-400" />
                        置顶
                      </span>
                    )}
                  </div>
                  <h4 className="mt-1 truncate text-sm sm:text-[15px] font-bold tracking-tight text-neutral-900 dark:text-neutral-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                    {col.title || "未命名合辑"}
                  </h4>
                  {col.excerpt && (
                    <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400 line-clamp-1">
                      {col.excerpt}
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-auto flex items-center justify-between border-t border-neutral-100 dark:border-neutral-800/80 px-4 py-2.5 text-xs font-medium text-neutral-500 dark:text-neutral-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors bg-neutral-50/40 dark:bg-neutral-800/20">
                <span>浏览专栏章节索引</span>
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
