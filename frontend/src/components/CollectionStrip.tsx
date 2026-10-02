import Link from "next/link";
import { BookMarked, ChevronRight, Layers, Pin } from "lucide-react";
import type { Post } from "@/lib/types";
import { resolveCoverImage } from "@/lib/post-image";
import { fetchPostsPage } from "@/lib/server-data";

/**
 * 文章页顶部的"系列合辑"入口横条。
 *
 * 合辑卡片在首页信息流中会随时间沉底，子文章阅读页又只有单点入口，
 * 导致合辑几乎无法被发现——这里提供一个始终稳定可达的列表入口。
 * 服务端获取（与页面同 revalidate），无合辑时整块不渲染。
 */
export default async function CollectionStrip() {
  const result = await fetchPostsPage("page=1&limit=10&type=collection");
  const collections = result.data;
  if (collections.length === 0) return null;

  return (
    <section aria-label="系列合辑" className="mb-6">
      <div className="flex items-center justify-between px-1 pb-2.5">
        <div className="flex items-center gap-1.5 text-[15px] font-semibold text-neutral-900 dark:text-neutral-100">
          <Layers className="h-4 w-4 text-neutral-400 dark:text-neutral-500" />
          <span>系列合辑</span>
          <span className="text-xs font-normal text-neutral-400 dark:text-neutral-500">
            共 {result.total} 个
          </span>
        </div>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-1.5 [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5">
        {collections.map((col: Post) => {
          const articleCount = Array.isArray(col.collectionArticles) ? col.collectionArticles.length : 0;
          const cover = resolveCoverImage(col.cover, "");
          return (
            <Link
              key={col.id}
              href={`/articles/${col.shortId || col.id}`}
              className="group flex w-64 shrink-0 flex-col overflow-hidden rounded-2xl border border-neutral-200/70 dark:border-neutral-800/80 bg-white dark:bg-neutral-900/50 shadow-xs transition-all duration-200 hover:shadow-md hover:border-neutral-300 dark:hover:border-neutral-700"
            >
              <div className="flex items-center gap-3 p-3.5">
                {cover ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={cover}
                    alt={col.title || "合辑封面"}
                    className="h-12 w-12 shrink-0 rounded-xl border border-black/5 dark:border-white/10 object-cover"
                  />
                ) : (
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-neutral-100 text-neutral-400 dark:bg-neutral-800 dark:text-neutral-500">
                    <BookMarked className="h-5 w-5" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-[11px] text-neutral-400 dark:text-neutral-500">
                    <span>系列合辑 · {articleCount} 篇</span>
                    {col.pinned && (
                      <span className="inline-flex items-center gap-0.5 rounded bg-neutral-100 dark:bg-neutral-800 px-1 py-px font-medium text-neutral-500 dark:text-neutral-400">
                        <Pin className="h-2.5 w-2.5" />
                        置顶
                      </span>
                    )}
                  </div>
                  <h3 className="mt-0.5 truncate text-sm font-semibold text-neutral-800 dark:text-neutral-200 group-hover:text-neutral-950 dark:group-hover:text-white transition-colors">
                    {col.title || "未命名合辑"}
                  </h3>
                </div>
              </div>
              {col.excerpt && (
                <p className="px-3.5 pb-2.5 text-xs leading-5 text-neutral-400 dark:text-neutral-500 line-clamp-2">
                  {col.excerpt}
                </p>
              )}
              <div className="mt-auto flex items-center justify-between border-t border-neutral-100 dark:border-neutral-800/70 px-3.5 py-2 text-xs text-neutral-400 dark:text-neutral-500">
                <span>查看合辑目录</span>
                <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
