const BLOCK = "animate-pulse rounded bg-black/[0.06] dark:bg-white/[0.08]";

export function PostCardSkeleton({ className = "" }: { className?: string }) {
  return (
    <div className={`flex gap-3 px-4 py-4 sm:px-5 md:px-6 ${className}`}>
      {/* Avatar */}
      <div className={`h-10 w-10 shrink-0 rounded-[5px] ${BLOCK}`} />
      {/* Content column */}
      <div className="min-w-0 flex-1 space-y-2">
        {/* Name */}
        <div className={`h-4 w-24 ${BLOCK}`} />
        {/* Content line 1 */}
        <div className={`h-4 w-full ${BLOCK}`} />
        {/* Content line 2 */}
        <div className={`h-4 w-3/5 ${BLOCK}`} />
        {/* Interaction bubble */}
        <div className={`mt-3 h-8 w-full rounded-[4px] ${BLOCK}`} />
      </div>
    </div>
  );
}


export function PostListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="divide-hairline">
      {Array.from({ length: count }).map((_, i) => (
        <PostCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function CommentRowSkeleton() {
  return (
    <div className="flex gap-3 px-4 py-4 sm:px-5 md:px-6">
      <div className={`h-9 w-9 shrink-0 rounded-full ${BLOCK}`} />
      <div className="min-w-0 flex-1 space-y-2">
        <div className={`h-4 w-20 ${BLOCK}`} />
        <div className={`h-4 w-2/3 ${BLOCK}`} />
        <div className={`h-3 w-24 ${BLOCK}`} />
      </div>
    </div>
  );
}

export function CommentListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="divide-hairline">
      {Array.from({ length: count }).map((_, i) => (
        <CommentRowSkeleton key={i} />
      ))}
    </div>
  );
}

export function ArticleCardSkeleton({ className = "" }: { className?: string }) {
  return (
    <div className={`overflow-hidden rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-neutral-900/70 p-5 sm:p-7 shadow-xs ${className}`}>
      <div className="flex flex-col sm:flex-row gap-5 sm:gap-6 items-start justify-between">
        <div className="min-w-0 flex-1 space-y-3.5 w-full">
          <div className="flex items-center gap-2">
            <div className={`h-4 w-16 ${BLOCK}`} />
            <div className={`h-4 w-12 ${BLOCK}`} />
            <div className={`h-4 w-24 ${BLOCK}`} />
          </div>
          <div className={`h-6 w-3/4 ${BLOCK}`} />
          <div className="space-y-2">
            <div className={`h-4 w-full ${BLOCK}`} />
            <div className={`h-4 w-5/6 ${BLOCK}`} />
          </div>
          <div className="pt-3 border-t border-black/[0.04] dark:border-white/[0.05] flex items-center justify-between">
            <div className={`h-3 w-32 ${BLOCK}`} />
            <div className={`h-3 w-16 ${BLOCK}`} />
          </div>
        </div>
        <div className={`hidden sm:block sm:w-44 md:w-52 aspect-[16/10] sm:aspect-[4/3] shrink-0 rounded-xl ${BLOCK}`} />
      </div>
    </div>
  );
}

export function ProjectCardSkeleton({ className = "" }: { className?: string }) {
  return (
    <div className={`overflow-hidden rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-neutral-900/70 p-5 sm:p-6 shadow-xs ${className}`}>
      <div className="flex flex-col sm:flex-row gap-4 sm:gap-5 items-start">
        <div className={`h-20 w-20 sm:h-24 sm:w-24 shrink-0 rounded-xl ${BLOCK}`} />
        <div className="min-w-0 flex-1 space-y-2.5 w-full">
          <div className="flex items-center justify-between">
            <div className={`h-3 w-16 ${BLOCK}`} />
            <div className={`h-3 w-20 ${BLOCK}`} />
          </div>
          <div className={`h-5 w-3/5 ${BLOCK}`} />
          <div className="space-y-1.5 pt-0.5">
            <div className={`h-3.5 w-full ${BLOCK}`} />
            <div className={`h-3.5 w-4/5 ${BLOCK}`} />
          </div>
          <div className="flex items-center gap-2 pt-2">
            <div className={`h-5 w-16 rounded-full ${BLOCK}`} />
            <div className={`h-5 w-14 rounded-full ${BLOCK}`} />
          </div>
        </div>
      </div>
    </div>
  );
}
