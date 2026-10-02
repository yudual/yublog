import DesktopDecorations from "@/components/DesktopDecorations";
import { PostListSkeleton } from "@/components/Skeleton";

export default function MomentsLoading() {
  return (
    <div className="relative min-h-screen flex flex-col overflow-x-clip bg-wechat-white md:bg-wechat-bg">
      <DesktopDecorations />

      {/* 栏目头部骨架 */}
      <div className="relative mx-auto w-full max-w-5xl xl:max-w-6xl 2xl:max-w-7xl px-4 sm:px-6 lg:px-8 pt-20 sm:pt-24 pb-8 sm:pb-12">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-2xl bg-black/[0.06] dark:bg-white/[0.08] animate-pulse" />
          <div className="space-y-2">
            <div className="h-7 w-32 rounded bg-black/[0.06] dark:bg-white/[0.08] animate-pulse" />
            <div className="h-4 w-48 rounded bg-black/[0.06] dark:bg-white/[0.08] animate-pulse" />
          </div>
        </div>
      </div>

      {/* 动态列表骨架主体 */}
      <div className="relative mx-auto w-full flex-1 flex flex-col max-w-5xl xl:max-w-6xl 2xl:max-w-7xl px-4 sm:px-6 lg:px-8 pb-12">
        <main className="relative w-full flex-1">
          <PostListSkeleton count={5} />
        </main>
      </div>
    </div>
  );
}
