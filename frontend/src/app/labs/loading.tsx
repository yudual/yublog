import DesktopDecorations from "@/components/DesktopDecorations";
import { ProjectCardSkeleton } from "@/components/Skeleton";

export default function CatalogLoading() {
  return (
    <div className="relative min-h-screen flex flex-col overflow-x-clip bg-wechat-white md:bg-wechat-bg">
      <DesktopDecorations />

      {/* 栏目头部骨架 */}
      <div className="relative mx-auto w-full max-w-5xl xl:max-w-6xl 2xl:max-w-7xl px-4 sm:px-6 lg:px-8 pt-20 sm:pt-24 pb-8 sm:pb-12">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-2xl bg-black/[0.06] dark:bg-white/[0.08] animate-pulse" />
          <div className="space-y-2">
            <div className="h-7 w-24 rounded bg-black/[0.06] dark:bg-white/[0.08] animate-pulse" />
            <div className="h-4 w-56 rounded bg-black/[0.06] dark:bg-white/[0.08] animate-pulse" />
          </div>
        </div>
      </div>

      {/* 目录条目骨架主体 */}
      <div className="relative mx-auto w-full flex-1 flex flex-col max-w-5xl xl:max-w-6xl 2xl:max-w-7xl px-4 sm:px-6 lg:px-8 pb-12">
        <main className="relative w-full flex-1 space-y-4 sm:space-y-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <ProjectCardSkeleton key={i} />
          ))}
        </main>
      </div>
    </div>
  );
}
