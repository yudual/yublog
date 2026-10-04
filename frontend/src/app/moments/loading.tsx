import DesktopDecorations from "@/components/DesktopDecorations";
import { PostListSkeleton } from "@/components/Skeleton";

const BLOCK = "animate-pulse rounded bg-black/[0.06] dark:bg-white/[0.08]";

export default function MomentsLoading() {
  return (
    <div className="relative min-h-screen flex flex-col overflow-x-clip bg-wechat-white md:bg-wechat-bg">
      <DesktopDecorations />

      {/* 栏目头部骨架 */}
      <div className="relative mx-auto w-full max-w-[1400px] xl:max-w-[1560px] 2xl:max-w-[1680px] px-4 sm:px-6 lg:px-8 pt-20 sm:pt-24 pb-8 sm:pb-12">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-2xl bg-black/[0.06] dark:bg-white/[0.08] animate-pulse" />
          <div className="space-y-2">
            <div className="h-7 w-32 rounded bg-black/[0.06] dark:bg-white/[0.08] animate-pulse" />
            <div className="h-4 w-48 rounded bg-black/[0.06] dark:bg-white/[0.08] animate-pulse" />
          </div>
        </div>
      </div>

      {/* 动态列表主体（桌面端三栏对应骨架） */}
      <div className="relative mx-auto w-full flex-1 flex flex-col max-w-[1400px] xl:max-w-[1560px] 2xl:max-w-[1680px] px-4 sm:px-6 lg:px-8 pb-12">
        <div className="flex justify-center items-start gap-6 xl:gap-8 flex-1">
          {/* 左侧个人信息骨架 (桌面端) */}
          <aside className="hidden lg:block w-72 xl:w-80 shrink-0 self-start">
            <div className="rounded-2xl border border-neutral-200/60 dark:border-neutral-800/80 bg-white/70 dark:bg-neutral-900/60 p-5 shadow-xs space-y-4">
              <div className="flex items-center gap-3">
                <div className={`h-12 w-12 rounded-full ${BLOCK}`} />
                <div className="space-y-1.5 flex-1">
                  <div className={`h-4 w-24 ${BLOCK}`} />
                  <div className={`h-3 w-16 ${BLOCK}`} />
                </div>
              </div>
              <div className={`h-12 w-full rounded-xl ${BLOCK}`} />
              <div className="pt-2 border-t border-black/[0.04] dark:border-white/[0.05] space-y-2">
                <div className={`h-3 w-16 ${BLOCK}`} />
                <div className="flex flex-wrap gap-1.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className={`h-6 w-14 rounded-lg ${BLOCK}`} />
                  ))}
                </div>
              </div>
            </div>
          </aside>

          {/* 中间动态流主体骨架 */}
          <main className="w-full flex-1 min-w-0 max-w-[720px] xl:max-w-[780px]">
            <PostListSkeleton count={4} />
          </main>

          {/* 右侧侧边栏骨架 (超大屏) */}
          <aside className="hidden 2xl:block w-72 shrink-0 self-start">
            <div className="rounded-2xl border border-neutral-200/60 dark:border-neutral-800/80 bg-white/70 dark:bg-neutral-900/60 p-5 shadow-xs space-y-3">
              <div className={`h-4 w-28 ${BLOCK}`} />
              <div className={`h-16 w-full rounded-xl ${BLOCK}`} />
              <div className={`h-16 w-full rounded-xl ${BLOCK}`} />
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
