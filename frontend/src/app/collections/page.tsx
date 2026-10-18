import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, BookOpen, Layers, ArrowRight, Eye, Calendar, BookMarked, Pin } from "lucide-react";
import DesktopDecorations from "@/components/DesktopDecorations";
import ChannelHeader from "@/components/channel/ChannelHeader";
import Footer from "@/components/Footer";
import FloatingActions from "@/components/FloatingActions";
import DesktopFooter from "@/components/DesktopFooter";
import EditPostModal from "@/components/EditPostModal";
import ScrollReveal from "@/components/ui/ScrollReveal";
import { fetchPostsPage } from "@/lib/server-data";
import { resolveCoverImage } from "@/lib/post-image";
import { resolveAvatarFromHash } from "@/lib/avatar";
import { formatArticleTime } from "@/lib/time-format";
import type { Post } from "@/lib/types";

export const revalidate = 10;

export const metadata: Metadata = {
  title: "系列专栏合辑 - 个人博客",
  description: "结构化连载、成体系的知识沉淀与深度专栏合辑",
};

async function getCollections() {
  try {
    const result = await fetchPostsPage("page=1&limit=20&type=collection");
    return result;
  } catch {
    return { data: [], hasMore: false, total: 0, error: true };
  }
}

export default async function CollectionsPage() {
  const result = await getCollections();
  const collections = result.data;

  return (
    <div id="scroll-root" className="relative min-h-screen flex flex-col overflow-x-clip bg-wechat-white md:bg-wechat-bg transition-colors">
      <DesktopDecorations />

      {/* 栏目头部 */}
      <ChannelHeader
        title="系列专栏合辑"
        subtitle="结构化连载、成体系的知识沉淀与深度专栏"
        icon={<BookOpen className="h-6 w-6 text-blue-500 dark:text-blue-400" />}
        count={result.total}
        maxWidth="max-w-5xl xl:max-w-6xl 2xl:max-w-7xl"
      />

      <div className="relative mx-auto w-full flex-1 flex flex-col max-w-5xl xl:max-w-6xl 2xl:max-w-7xl px-4 sm:px-6 lg:px-8 pb-14">
        {/* 返回文章主列表导航条 */}
        <div className="mb-6 flex items-center justify-between">
          <Link
            href="/articles"
            className="group/back inline-flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs sm:text-sm font-medium text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white bg-white/80 hover:bg-white dark:bg-neutral-900/60 dark:hover:bg-neutral-800 border border-neutral-200/80 dark:border-neutral-800 backdrop-blur-md shadow-2xs hover:shadow-xs active:scale-[0.97] transition-all"
          >
            <ArrowLeft className="h-3.5 w-3.5 text-neutral-400 group-hover/back:text-neutral-700 dark:group-hover/back:text-neutral-200 group-hover/back:-translate-x-0.5 transition-transform" />
            <span>返回单篇长文列表</span>
          </Link>
          <span className="text-xs text-neutral-400 dark:text-neutral-500 font-normal">
            共收录 {result.total} 个精品专栏
          </span>
        </div>

        {collections.length === 0 ? (
          <div className="rounded-3xl border border-neutral-200/70 dark:border-neutral-800 bg-white/70 dark:bg-neutral-900/40 p-12 text-center backdrop-blur-md shadow-xs">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-300 mb-4">
              <BookOpen className="h-7 w-7" />
            </div>
            <h3 className="text-lg font-bold text-neutral-800 dark:text-neutral-200">暂无系列合辑</h3>
            <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400 max-w-md mx-auto">
              目前还没有打包发布系列专栏。博主可在管理后台选中多篇关联文章一键打包创建。
            </p>
            <div className="mt-6">
              <Link
                href="/articles"
                className="group/go inline-flex items-center gap-2 rounded-xl bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 px-5 py-2.5 text-xs font-semibold shadow-xs hover:opacity-90 active:scale-[0.97] transition-all"
              >
                <span>浏览全部单篇博文</span>
                <ArrowRight className="h-3.5 w-3.5 text-neutral-400 group-hover/go:translate-x-0.5 transition-transform" />
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:gap-8">
            {collections.map((col: Post, index: number) => {
              const coverUrl = resolveCoverImage(col.cover, "");
              const articles = col.collectionArticles || [];
              const articleCount = articles.length;
              const authorName = col.author?.nickname || "博主";
              const authorAvatar = resolveAvatarFromHash(col.author?.avatar, col.author?.avatarHash, 80);
              const formattedDate = formatArticleTime(col.createdAt);
              const collectionHref = `/articles/${col.shortId || col.id}`;
              const firstArticleHref = articles.length > 0 ? `/articles/${articles[0].shortId || articles[0].id}` : collectionHref;

              return (
                <ScrollReveal key={col.id} delay={Math.min(index * 60, 240)}>
                  <article className="group relative overflow-hidden rounded-2xl sm:rounded-3xl border border-neutral-200/70 dark:border-neutral-800/80 bg-white/90 dark:bg-neutral-900/80 backdrop-blur-md p-6 sm:p-8 shadow-[0_1px_3px_rgba(0,0,0,0.02),0_8px_24px_-6px_rgba(0,0,0,0.04)] dark:shadow-[0_1px_3px_rgba(0,0,0,0.3),0_10px_28px_-6px_rgba(0,0,0,0.5)] transition-all duration-300 hover:border-neutral-300 dark:hover:border-neutral-700 hover:shadow-[0_4px_24px_-4px_rgba(0,0,0,0.07)] hover:-translate-y-1">
                    {/* 顶部微高光线 */}
                    <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-neutral-300/40 dark:via-neutral-700/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                    <div className="flex flex-col lg:flex-row gap-6 sm:gap-8 items-start">
                      {/* 封面区 */}
                      <Link
                        href={collectionHref}
                        className="relative w-full lg:w-72 xl:w-80 aspect-video lg:aspect-[4/3] shrink-0 overflow-hidden rounded-xl sm:rounded-2xl border border-black/5 dark:border-white/10 shadow-2xs bg-neutral-100 dark:bg-neutral-800"
                      >
                        {coverUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={coverUrl}
                            alt={col.title || "合辑封面"}
                            className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-blue-50/80 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400">
                            <BookOpen className="h-12 w-12" />
                          </div>
                        )}
                        <span className="absolute top-3 left-3 inline-flex items-center gap-1 rounded-md bg-black/60 backdrop-blur-md px-2.5 py-1 text-[11px] font-semibold text-white">
                          <Layers className="h-3 w-3" />
                          <span>共 {articleCount} 章</span>
                        </span>
                      </Link>

                      {/* 详情主体 */}
                      <div className="min-w-0 flex-1 flex flex-col justify-between self-stretch">
                        <div>
                          <div className="flex items-center gap-2 mb-2.5">
                            <span className="inline-flex items-center gap-1 rounded-md bg-blue-50/80 dark:bg-blue-950/50 border border-blue-200/60 dark:border-blue-900/50 px-2.5 py-0.5 text-[11px] font-medium text-blue-700 dark:text-blue-300">
                              <BookOpen className="h-3 w-3 text-blue-500 dark:text-blue-400" />
                              系列专栏
                            </span>
                            {col.pinned && (
                              <span className="inline-flex items-center gap-0.5 rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20 px-2 py-0.5 text-[11px] font-medium">
                                <Pin className="h-2.5 w-2.5 rotate-45 text-amber-600 dark:text-amber-400" />
                                置顶推荐
                              </span>
                            )}
                          </div>

                          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors leading-snug">
                            <Link href={collectionHref}>{col.title || "未命名系列合辑"}</Link>
                          </h2>

                          {col.excerpt && (
                            <p className="mt-2.5 text-sm sm:text-[15px] leading-[1.68] text-neutral-600 dark:text-neutral-400 font-normal line-clamp-2 sm:line-clamp-3">
                              {col.excerpt}
                            </p>
                          )}

                          {/* 章节精选目录 */}
                          {articles.length > 0 && (
                            <div className="mt-5 space-y-1.5 border-t border-neutral-100 dark:border-neutral-800/80 pt-4">
                              <span className="block text-xs font-medium text-neutral-400 dark:text-neutral-500 mb-2">
                                章节索引目录：
                              </span>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {articles.slice(0, 4).map((art, idx) => (
                                  <Link
                                    key={art.id}
                                    href={`/articles/${art.shortId || art.id}`}
                                    className="group/art flex items-center justify-between gap-2.5 rounded-xl bg-neutral-50/70 hover:bg-neutral-100/90 dark:bg-neutral-800/40 dark:hover:bg-neutral-800/90 px-3 py-2 text-xs text-neutral-700 dark:text-neutral-300 hover:text-blue-600 dark:hover:text-blue-400 border border-transparent hover:border-neutral-200/60 dark:hover:border-neutral-700/60 transition-all"
                                  >
                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                      <span className="w-5 text-center font-mono text-[11px] font-semibold text-neutral-400 dark:text-neutral-500 group-hover/art:text-blue-600 dark:group-hover/art:text-blue-400 transition-colors">
                                        {String(idx + 1).padStart(2, "0")}
                                      </span>
                                      <span className="truncate font-medium">{art.title}</span>
                                    </div>
                                    <ArrowRight className="h-3 w-3 text-neutral-400 group-hover/art:text-blue-600 dark:group-hover/art:text-blue-400 group-hover/art:translate-x-0.5 transition-all shrink-0" />
                                  </Link>
                                ))}
                              </div>
                              {articles.length > 4 && (
                                <p className="text-[11px] text-neutral-400 dark:text-neutral-500 pt-1">
                                  还有另外 {articles.length - 4} 篇章节，点击专栏进入完整章节索引...
                                </p>
                              )}
                            </div>
                          )}
                        </div>

                        {/* 底部元数据与操作按钮 */}
                        <div className="mt-6 pt-4 border-t border-neutral-100 dark:border-neutral-800/80 flex flex-wrap items-center justify-between gap-4">
                          <div className="flex items-center gap-3">
                            <div className="relative h-8 w-8 overflow-hidden rounded-full border border-black/5 dark:border-white/10">
                              <Image
                                src={authorAvatar}
                                alt={authorName}
                                fill
                                className="object-cover"
                                sizes="32px"
                                unoptimized={authorAvatar.endsWith(".svg")}
                              />
                            </div>
                            <div className="text-xs">
                              <span className="font-semibold text-neutral-800 dark:text-neutral-200">{authorName}</span>
                              <div className="flex items-center gap-2 text-neutral-400 text-[11px]">
                                <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {formattedDate}</span>
                                <span>·</span>
                                <span className="flex items-center gap-1"><Eye className="h-3 w-3" /> {col.viewCount || 0} 次浏览</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <Link
                              href={collectionHref}
                              className="group/btn inline-flex items-center gap-1.5 rounded-xl border border-neutral-200/80 dark:border-neutral-700/80 bg-neutral-50/80 dark:bg-neutral-800/70 px-3.5 py-2 text-xs font-semibold text-neutral-700 dark:text-neutral-200 shadow-2xs hover:border-neutral-300 dark:hover:border-neutral-600 hover:bg-white dark:hover:bg-neutral-700 hover:text-neutral-900 dark:hover:text-white hover:shadow-xs active:scale-[0.97] transition-all"
                            >
                              <span>查看专栏目录</span>
                            </Link>

                            {articles.length > 0 && (
                              <Link
                                href={firstArticleHref}
                                className="group/first inline-flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-xs font-semibold shadow-xs hover:shadow-sm active:scale-[0.97] transition-all"
                              >
                                <span>开始阅读第一章</span>
                                <ArrowRight className="h-3.5 w-3.5 text-blue-200 group-hover/first:text-white group-hover/first:translate-x-0.5 transition-all" />
                              </Link>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </article>
                </ScrollReveal>
              );
            })}
          </div>
        )}
      </div>

      <Footer />
      <FloatingActions />
      <DesktopFooter />
      <EditPostModal />
    </div>
  );
}
