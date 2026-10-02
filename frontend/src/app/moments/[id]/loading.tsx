import DesktopDecorations from "@/components/DesktopDecorations";
import { PostListSkeleton } from "@/components/Skeleton";

export default function MomentDetailLoading() {
  return (
    <div className="relative min-h-screen flex flex-col overflow-x-clip bg-wechat-white md:bg-wechat-bg">
      <DesktopDecorations />

      <div className="relative mx-auto w-full max-w-2xl flex-1 px-4 sm:px-6 pt-20 sm:pt-24 pb-12">
        <div className="mb-6 h-8 w-24 rounded-full bg-black/[0.06] dark:bg-white/[0.08] animate-pulse" />
        <main className="rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-neutral-900/70 shadow-xs">
          <PostListSkeleton count={1} />
          <div className="px-4 pb-6 sm:px-5 md:px-6 space-y-2">
            <div className="h-4 w-full rounded bg-black/[0.06] dark:bg-white/[0.08] animate-pulse" />
            <div className="h-4 w-2/3 rounded bg-black/[0.06] dark:bg-white/[0.08] animate-pulse" />
          </div>
        </main>
      </div>
    </div>
  );
}
