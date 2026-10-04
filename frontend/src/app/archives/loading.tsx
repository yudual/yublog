import DesktopDecorations from "@/components/DesktopDecorations";

const BLOCK = "animate-pulse rounded bg-black/[0.06] dark:bg-white/[0.08]";

export default function Loading() {
  return (
    <div id="scroll-root" className="relative min-h-screen flex flex-col overflow-x-hidden bg-wechat-white md:bg-wechat-bg transition-colors">
      <DesktopDecorations />

      <div className="relative mx-auto w-full flex-1 flex flex-col max-w-[640px] md:max-w-2xl lg:max-w-3xl px-3 sm:px-4 pt-20 sm:pt-24 pb-12">
        <main className="relative w-full flex-1 flex flex-col overflow-hidden rounded-3xl bg-wechat-white shadow-[0_8px_40px_-12px_rgba(0,0,0,0.08)] dark:shadow-[0_8px_40px_-12px_rgba(0,0,0,0.3)] border border-neutral-200/60 dark:border-neutral-800/80 pb-8 md:pb-12">
          {/* Cover Header 骨架 */}
          <div className="relative h-[280px] sm:h-[320px] w-full">
            <div className={`absolute inset-0 ${BLOCK}`} />
            <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/15 to-transparent" />
            <div className="absolute bottom-0 right-4 sm:right-6 flex items-end gap-3 pb-2">
              <div className={`h-5 w-24 ${BLOCK}`} />
              <div className={`h-16 w-16 shrink-0 translate-y-3 rounded-2xl ${BLOCK}`} />
            </div>
          </div>

          {/* 签名骨架 */}
          <div className="flex justify-end px-4 pt-6 pb-4 sm:px-6">
            <div className={`h-3.5 w-36 ${BLOCK}`} />
          </div>

          {/* 年份/时间线骨架 */}
          <div className="px-4 sm:px-6 pt-4 space-y-6">
            <div className={`h-6 w-20 ${BLOCK}`} />
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex gap-4 items-start">
                <div className={`h-4 w-12 shrink-0 ${BLOCK}`} />
                <div className="flex-1 space-y-2">
                  <div className={`h-4 w-3/4 ${BLOCK}`} />
                  <div className={`h-16 w-full rounded-xl ${BLOCK}`} />
                </div>
              </div>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}
