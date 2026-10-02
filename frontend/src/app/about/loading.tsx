import DesktopDecorations from "@/components/DesktopDecorations";

function TextBlock({ widths }: { widths: string[] }) {
  return (
    <div className="space-y-2.5">
      {widths.map((w, i) => (
        <div
          key={i}
          className={`h-4 ${w} rounded bg-black/[0.06] dark:bg-white/[0.08] animate-pulse`}
        />
      ))}
    </div>
  );
}

export default function AboutLoading() {
  return (
    <div className="relative min-h-screen flex flex-col overflow-x-clip bg-wechat-white md:bg-wechat-bg">
      <DesktopDecorations />

      <div className="relative mx-auto w-full max-w-2xl flex-1 px-4 sm:px-6 pt-20 sm:pt-24 pb-12">
        <main className="rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-neutral-900/70 shadow-xs p-6 sm:p-8 space-y-8">
          <div className="h-8 w-32 rounded bg-black/[0.06] dark:bg-white/[0.08] animate-pulse" />
          <TextBlock widths={["w-3/4", "w-full", "w-5/6"]} />
          <TextBlock widths={["w-1/2", "w-full", "w-4/5"]} />
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-20 rounded-xl bg-black/[0.06] dark:bg-white/[0.08] animate-pulse"
              />
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}
