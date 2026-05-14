/**
 * Skeleton loaders that mirror the actual content shape — feels smoother
 * than a generic spinner because the layout doesn't jump when real data arrives.
 */

export function Skeleton({
  className = "",
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return <div className={`skeleton ${className}`} style={style} />;
}

// ── Search-result card skeleton (matches the search results in manual mode) ──
export function SearchResultSkeleton() {
  return (
    <div className="flex gap-4 rounded-2xl border border-white/10 bg-white/5 p-4">
      <Skeleton className="w-16 flex-shrink-0" style={{ height: "88px" }} />
      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex items-baseline gap-2">
          <Skeleton className="h-4 w-3/5 rounded" />
          <Skeleton className="h-3 w-16 rounded" />
        </div>
        <Skeleton className="h-3 w-full rounded" />
        <Skeleton className="h-3 w-11/12 rounded" />
        <Skeleton className="h-3 w-4/5 rounded" />
      </div>
      <Skeleton className="h-7 w-20 rounded-lg flex-shrink-0" />
    </div>
  );
}

// ── Recommendation card skeleton (matches the recs section) ──
export function RecommendationSkeleton({ delay = 0 }: { delay?: number }) {
  return (
    <div
      className="card-appear flex gap-4 rounded-2xl border border-white/10 bg-white/5 p-4"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex-shrink-0 flex flex-col items-center gap-1.5">
        <Skeleton className="h-3 w-6 rounded" />
        <Skeleton className="w-16" style={{ height: "88px" }} />
      </div>
      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex items-baseline gap-2">
          <Skeleton className="h-4 w-2/5 rounded" />
          <Skeleton className="h-3 w-20 rounded" />
        </div>
        <Skeleton className="h-3 w-full rounded" />
        <Skeleton className="h-3 w-5/6 rounded" />
      </div>
    </div>
  );
}

// ── Seed chip skeleton (MAL list mode while fetching the user's list) ──
export function SeedChipSkeleton() {
  return (
    <div className="flex items-center gap-2 bg-white/10 rounded-xl px-3 py-2 border border-white/10">
      <Skeleton className="w-7 rounded-md flex-shrink-0" style={{ height: "36px" }} />
      <Skeleton className="h-3 w-24 rounded" />
      <Skeleton className="h-3 w-8 rounded ml-1" />
    </div>
  );
}

// ── Whole-section skeletons for convenience ──
export function SearchResultsLoadingList({ count = 5 }: { count?: number }) {
  return (
    <div className="grid gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <SearchResultSkeleton key={i} />
      ))}
    </div>
  );
}

export function RecommendationsLoadingList({ count = 10 }: { count?: number }) {
  return (
    <section className="mt-14">
      <div className="flex items-center gap-4 mb-6">
        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">
          Finding your matches…
        </span>
        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      </div>
      <div className="grid gap-4">
        {Array.from({ length: count }).map((_, i) => (
          <RecommendationSkeleton key={i} delay={i * 60} />
        ))}
      </div>
    </section>
  );
}

export function SeedChipsLoadingRow({ count = 5 }: { count?: number }) {
  return (
    <div className="flex gap-3 flex-wrap">
      {Array.from({ length: count }).map((_, i) => (
        <SeedChipSkeleton key={i} />
      ))}
    </div>
  );
}
