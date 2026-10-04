export default function SpatialAuroraBackground() {
  return (
    <>
      {/* ── 1. 实体特种艺术纸微肌理层 (Organic Fine Paper Grain) ── */}
      <div
        className="pointer-events-none fixed inset-0 z-0 paper-grain-texture opacity-80 dark:opacity-50 select-none mix-blend-multiply dark:mix-blend-screen"
        aria-hidden="true"
      />

      {/* ── 2. 空间纵深极光弥散层 (绝对固定稳固，零晃动、零边缘裁切) ── */}
      <div
        className="pointer-events-none absolute inset-0 z-0 overflow-hidden select-none"
        aria-hidden="true"
      >
        {/* 左上主星云 - 蓝紫极光 (原位慢呼吸，两翼渐变自然平滑过渡) */}
        <div className="absolute -top-32 -left-24 h-[600px] w-[600px] sm:h-[800px] sm:w-[800px] rounded-full bg-gradient-to-br from-indigo-500/[0.18] via-purple-500/[0.14] to-transparent dark:from-indigo-600/[0.22] dark:via-purple-700/[0.16] to-transparent blur-[140px] animate-aurora-primary" />

        {/* 右上副星云 - 暖杏落日 (原位反向呼吸，保持右侧渐变稳定充盈) */}
        <div className="absolute -top-24 -right-24 h-[560px] w-[560px] sm:h-[760px] sm:w-[760px] rounded-full bg-gradient-to-bl from-amber-400/[0.18] via-rose-400/[0.14] to-transparent dark:from-amber-500/[0.20] dark:via-rose-600/[0.14] to-transparent blur-[140px] animate-aurora-secondary" />

        {/* 中部地平过渡星云 - 青碧冷星光 (居中原位微波) */}
        <div className="absolute top-[600px] sm:top-[660px] left-1/2 -translate-x-1/2 h-[420px] w-[92%] max-w-5xl rounded-full bg-gradient-to-r from-teal-400/[0.11] via-cyan-400/[0.10] to-transparent dark:from-cyan-600/[0.16] dark:via-teal-700/[0.12] to-transparent blur-[130px] animate-aurora-horizon" />

        {/* 动态流中深空星云 - 薰衣草微光 (随着滚动探索逐渐显现) */}
        <div className="absolute top-[1350px] -right-28 h-[520px] w-[520px] sm:h-[720px] sm:w-[720px] rounded-full bg-gradient-to-l from-purple-400/[0.12] via-pink-400/[0.09] to-transparent dark:from-purple-800/[0.16] dark:via-pink-800/[0.11] to-transparent blur-[130px] animate-aurora-ambient" />

        {/* 底部深空回响星云 */}
        <div className="absolute bottom-[200px] -left-28 h-[480px] w-[480px] sm:h-[660px] sm:w-[660px] rounded-full bg-gradient-to-tr from-indigo-400/[0.11] via-purple-400/[0.09] to-transparent dark:from-indigo-900/[0.16] dark:via-purple-950/[0.11] to-transparent blur-[130px] animate-aurora-secondary" />
      </div>
    </>
  );
}
