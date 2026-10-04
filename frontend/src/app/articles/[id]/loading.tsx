import DesktopDecorations from "@/components/DesktopDecorations";

const BLOCK = "animate-pulse rounded bg-black/[0.06] dark:bg-white/[0.08]";

export default function Loading() {
  return (
    <div id="scroll-root" className="relative min-h-screen flex flex-col overflow-x-clip bg-wechat-white md:bg-wechat-bg transition-colors">
      <DesktopDecorations />

      {/* 居中自适应博客阅读容器与右侧目录骨架 */}
      <div className="relative mx-auto w-full flex-1 max-w-[1440px] xl:max-w-[1600px] 2xl:max-w-[1720px] px-3 sm:px-6 lg:px-8 pt-18 sm:pt-24 pb-12 flex justify-center items-start gap-8 xl:gap-10">
        <div className="w-full flex-1 min-w-0 max-w-[980px] xl:max-w-[1100px] 2xl:max-w-[1200px] flex flex-col">
          {/* 返回按钮占位 */}
          <div className="mb-4 sm:mb-6">
            <div className={`h-8 w-32 rounded-xl ${BLOCK}`} />
          </div>

          <main className="relative flex min-h-[calc(100vh-10rem)] w-full flex-col overflow-hidden rounded-2xl sm:rounded-3xl bg-wechat-white p-4 sm:p-8 md:p-10 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.08)] dark:shadow-[0_8px_40px_-12px_rgba(0,0,0,0.3)] border border-neutral-200/60 dark:border-neutral-800/80">
            {/* 分类标签占位 */}
            <div className={`mb-3 h-5 w-16 ${BLOCK}`} />

            {/* 文章大标题占位 */}
            <div className={`h-8 w-3/4 sm:h-9 ${BLOCK}`} />
            <div className={`mt-2 h-8 w-1/2 sm:h-9 ${BLOCK}`} />

            {/* 作者元信息行占位 */}
            <div className="mt-4 flex items-center gap-2">
              <div className={`h-4 w-12 ${BLOCK}`} />
              <div className={`h-4 w-20 ${BLOCK}`} />
              <div className={`h-4 w-16 ${BLOCK}`} />
            </div>

            {/* 正文段落占位 */}
            <div className="mt-8 space-y-3.5">
              <div className={`h-4 w-full ${BLOCK}`} />
              <div className={`h-4 w-full ${BLOCK}`} />
              <div className={`h-4 w-5/6 ${BLOCK}`} />
              <div className={`h-4 w-full ${BLOCK}`} />
              <div className={`h-4 w-2/3 ${BLOCK}`} />
              <div className="h-4" />
              <div className={`h-4 w-full ${BLOCK}`} />
              <div className={`h-4 w-4/5 ${BLOCK}`} />
              <div className={`h-4 w-full ${BLOCK}`} />
              <div className={`h-4 w-3/4 ${BLOCK}`} />
            </div>
          </main>
        </div>

        {/* 桌面端右侧章节目录骨架 */}
        <aside className="hidden lg:block sticky top-24 z-20 w-64 xl:w-72 2xl:w-80 shrink-0 self-start">
          <div className="rounded-2xl border border-neutral-200/60 dark:border-neutral-800/80 bg-white/70 dark:bg-neutral-900/60 p-4 shadow-xs">
            <div className={`h-4 w-20 mb-4 ${BLOCK}`} />
            <div className="space-y-2.5">
              <div className={`h-3 w-4/5 ${BLOCK}`} />
              <div className={`h-3 w-3/5 ${BLOCK}`} />
              <div className={`h-3 w-2/3 ${BLOCK}`} />
              <div className={`h-3 w-1/2 ${BLOCK}`} />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
