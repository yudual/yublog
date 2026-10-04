import { PostCardSkeleton } from "@/components/Skeleton";

const BLOCK = "animate-pulse rounded bg-black/[0.06] dark:bg-white/[0.08]";

export default function Loading() {
  return (
    <div className="relative min-h-screen flex flex-col overflow-x-clip bg-[#faf9f6] dark:bg-[#0a0a0d] text-neutral-900 dark:text-neutral-100 transition-colors">
      {/* 首页 Hero 区域骨架 */}
      <section className="relative flex min-h-[70vh] sm:min-h-[74vh] lg:min-h-[78vh] w-full flex-col items-center justify-between overflow-hidden px-4 sm:px-8 pt-20 sm:pt-28 pb-10">
        <div className="relative z-10 my-auto flex flex-col items-center text-center max-w-2xl mx-auto w-full pt-4">
          {/* 头像占位 */}
          <div className="relative mb-6">
            <div className={`h-24 w-24 sm:h-28 sm:w-28 rounded-full ${BLOCK}`} />
          </div>

          {/* 昵称占位 */}
          <div className={`h-8 w-44 sm:h-10 sm:w-56 mb-3 ${BLOCK}`} />

          {/* 诗意副标占位 */}
          <div className={`h-4 w-64 sm:w-80 mb-6 ${BLOCK}`} />

          {/* 药丸操作按钮占位 */}
          <div className={`h-10 w-36 rounded-full ${BLOCK}`} />
        </div>

        {/* 底部微导引占位 */}
        <div className="relative z-10 mt-6 flex flex-col items-center">
          <div className={`h-5 w-px ${BLOCK}`} />
        </div>
      </section>

      {/* 博客动态流卡片骨架 (与真实页面 1:1 吻合) */}
      <div className="relative z-10 mx-auto w-full flex-1 flex flex-col max-w-4xl xl:max-w-5xl 2xl:max-w-6xl px-3 sm:px-6 lg:px-8 pt-0 sm:pt-4 pb-14">
        <main className="relative w-full flex-1 overflow-hidden rounded-3xl backdrop-blur-xl bg-white/85 dark:bg-[#15161d]/85 shadow-[0_16px_50px_-16px_rgba(0,0,0,0.06)] dark:shadow-[0_20px_60px_-16px_rgba(0,0,0,0.45)] border border-neutral-200/80 dark:border-white/[0.08]">
          {/* 动态卡片顶部栏骨架 */}
          <div className="flex items-center justify-between border-b border-black/[0.05] dark:border-white/[0.06] px-5 sm:px-6 py-3.5 bg-neutral-50/70 dark:bg-neutral-800/40">
            <div className="flex items-center gap-2.5">
              <div className={`h-4 w-32 ${BLOCK}`} />
              <div className={`h-4 w-12 rounded-full ${BLOCK}`} />
            </div>
            <div className={`h-3 w-16 ${BLOCK}`} />
          </div>

          {/* 动态内容列表骨架 */}
          <div className="divide-hairline">
            {Array.from({ length: 3 }).map((_, i) => (
              <PostCardSkeleton key={i} />
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}
