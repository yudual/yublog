import DesktopDecorations from "@/components/DesktopDecorations";
import { ProjectCardSkeleton } from "@/components/Skeleton";

export default function ProjectDetailLoading() {
  return (
    <div className="relative min-h-screen flex flex-col overflow-x-clip bg-wechat-white md:bg-wechat-bg">
      <DesktopDecorations />

      <div className="relative mx-auto w-full max-w-2xl flex-1 px-4 sm:px-6 pt-20 sm:pt-24 pb-12">
        <div className="mb-6 h-8 w-24 rounded-full bg-black/[0.06] dark:bg-white/[0.08] animate-pulse" />
        <main className="space-y-4">
          <ProjectCardSkeleton />
          <div className="rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-neutral-900/70 shadow-xs p-5 sm:p-7 space-y-3">
            <div className="h-5 w-2/5 rounded bg-black/[0.06] dark:bg-white/[0.08] animate-pulse" />
            <div className="h-4 w-full rounded bg-black/[0.06] dark:bg-white/[0.08] animate-pulse" />
            <div className="h-4 w-5/6 rounded bg-black/[0.06] dark:bg-white/[0.08] animate-pulse" />
            <div className="h-4 w-3/4 rounded bg-black/[0.06] dark:bg-white/[0.08] animate-pulse" />
          </div>
        </main>
      </div>
    </div>
  );
}
