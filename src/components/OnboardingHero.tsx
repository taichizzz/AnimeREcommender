"use client";

/**
 * The hero shown to first-time / pre-engagement users.
 * Disappears smoothly once the user has picks or recommendations.
 */
export function OnboardingHero({ isLoggedIn }: { isLoggedIn: boolean }) {
  return (
    <section className="liquid-appear mb-10 rounded-3xl border border-white/10 bg-gradient-to-br from-violet-500/5 via-purple-500/5 to-transparent backdrop-blur-md p-8 md:p-10 overflow-hidden relative">
      {/* Subtle decorative glow inside the hero */}
      <div className="absolute -top-20 -right-20 w-72 h-72 bg-violet-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -left-24 w-72 h-72 bg-pink-500/5 rounded-full blur-3xl pointer-events-none" />

      <div className="relative">
        <p className="text-xs uppercase tracking-[0.3em] text-violet-300/70 mb-3">
          A taste-aware recommender
        </p>
        <h2 className="text-3xl md:text-4xl font-black leading-tight mb-3">
          Find anime <span className="bg-gradient-to-r from-violet-300 via-purple-200 to-pink-300 bg-clip-text text-transparent">you&apos;ll actually love</span>
        </h2>
        <p className="text-slate-400 text-base md:text-lg mb-8 max-w-2xl">
          Not a popularity ranker. Animer learns from how 233,000 real viewers co-rate things,
          then runs your picks through a language model that explains every match in your terms.
        </p>

        {/* 3-step rail */}
        <ol className="grid gap-4 md:grid-cols-3 mb-8">
          <Step
            number={1}
            title="Tell us what you love"
            body={
              isLoggedIn
                ? "Connect your MAL list, or hand-pick a few anime that matter to you."
                : "Search and pick a handful of anime you'd rewatch tomorrow."
            }
          />
          <Step
            number={2}
            title="Answer a few questions"
            body="Mood, themes you want, themes you don't. Short, no busywork."
          />
          <Step
            number={3}
            title="See matches with reasoning"
            body="Each pick gets a personal one-liner explaining why it fits you."
          />
        </ol>

        {/* Subtle "what makes it different" row */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-xs text-slate-500 border-t border-white/5 pt-5">
          <span className="flex items-center gap-2">
            <span className="w-1 h-1 rounded-full bg-violet-400" />
            Collaborative filtering on 25M ratings
          </span>
          <span className="flex items-center gap-2">
            <span className="w-1 h-1 rounded-full bg-violet-400" />
            Synopsis-aware fallback for niche picks
          </span>
          <span className="flex items-center gap-2">
            <span className="w-1 h-1 rounded-full bg-violet-400" />
            Filters watched, sequels, dislikes
          </span>
          <span className="flex items-center gap-2">
            <span className="w-1 h-1 rounded-full bg-violet-400" />
            No popularity bias
          </span>
        </div>
      </div>
    </section>
  );
}

function Step({ number, title, body }: { number: number; title: string; body: string }) {
  return (
    <li className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 backdrop-blur-sm">
      <div className="flex items-baseline gap-3 mb-2">
        <span className="text-2xl font-black text-violet-300/80 leading-none">
          {String(number).padStart(2, "0")}
        </span>
        <h3 className="font-bold text-white text-sm">{title}</h3>
      </div>
      <p className="text-sm text-slate-400 leading-relaxed">{body}</p>
    </li>
  );
}
