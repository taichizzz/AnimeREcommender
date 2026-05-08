"use client";

import { useState } from "react";

export type QuizPick = {
  id: number;
  title: string;
  imageUrl: string | null;
};

export type QuizResult = {
  favoriteId: number;
  hookedBy: string;        // "story" | "atmosphere" | "characters" | freeform text
  mood: string[];
  dislikes: string[];
};

export const MOOD_OPTIONS = [
  { label: "Emotional", icon: "🎭" },
  { label: "Action",    icon: "⚔️" },
  { label: "Funny",     icon: "😂" },
  { label: "Mind-bending", icon: "🧠" },
  { label: "Romantic",  icon: "💞" },
  { label: "Chill",     icon: "🌙" },
  { label: "Dark",      icon: "😱" },
  { label: "Wholesome", icon: "🌸" },
];

export const DISLIKE_OPTIONS = [
  "Romance focus", "Sad endings", "Sports",
  "Heavy violence", "Slice-of-life", "Ecchi/fanservice", "Mecha",
];

const HOOKED_OPTIONS = [
  { value: "story",      icon: "📖", label: "The story",      desc: "Plot, world, mystery" },
  { value: "atmosphere", icon: "💭", label: "The atmosphere", desc: "Mood, pacing, vibe" },
  { value: "characters", icon: "👥", label: "The characters", desc: "Relationships, growth" },
  { value: "other",      icon: "✨", label: "Something else", desc: "Tell us in your words" },
];

export function RecommendQuiz({
  picks,
  onComplete,
  onCancel,
  loading,
}: {
  picks: QuizPick[];
  onComplete: (q: QuizResult) => void;
  onCancel: () => void;
  loading?: boolean;
}) {
  const [step, setStep] = useState(0);  // 0..3 (4 steps total)
  const [favoriteId, setFavoriteId] = useState<number | null>(picks[0]?.id ?? null);
  const [hookedChoice, setHookedChoice] = useState<string>("");
  const [hookedText, setHookedText] = useState<string>("");
  const [mood, setMood] = useState<Set<string>>(new Set());
  const [dislikes, setDislikes] = useState<Set<string>>(new Set());

  const totalSteps = 4;

  function next() {
    if (step < totalSteps - 1) setStep(step + 1);
    else finish();
  }

  function back() {
    if (step > 0) setStep(step - 1);
    else onCancel();
  }

  function toggle(set: Set<string>, setSet: (s: Set<string>) => void, val: string) {
    const next = new Set(set);
    if (next.has(val)) next.delete(val);
    else next.add(val);
    setSet(next);
  }

  function finish() {
    if (!favoriteId) return;
    const hookedBy =
      hookedChoice === "other"
        ? hookedText.trim() || "something else"
        : hookedChoice;
    onComplete({
      favoriteId,
      hookedBy,
      mood: Array.from(mood),
      dislikes: Array.from(dislikes),
    });
  }

  // Validation per step
  const canContinue = (() => {
    if (step === 0) return favoriteId != null;
    if (step === 1) return hookedChoice && (hookedChoice !== "other" || hookedText.trim().length > 0);
    if (step === 2) return true;  // mood is optional
    if (step === 3) return true;  // dislikes are optional
    return true;
  })();

  const favorite = picks.find((p) => p.id === favoriteId);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md p-6 mb-8">
      {/* Progress dots */}
      <div className="flex gap-2 justify-center mb-8">
        {Array.from({ length: totalSteps }).map((_, i) => (
          <div
            key={i}
            className={`h-2 rounded-full transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]
              ${i === step
                ? "bg-gradient-to-r from-violet-500 to-purple-500 w-8 shadow-lg shadow-violet-500/40"
                : i < step
                  ? "w-2 bg-violet-500/40"
                  : "w-2 bg-white/15"}`}
          />
        ))}
      </div>

      {/* Step content — keyed for liquid-appear animation on each transition */}
      <div key={step} className="liquid-appear">
        {/* ── Step 0: pick favorite ───────────────────────────── */}
        {step === 0 && (
          <>
            <p className="text-xs uppercase tracking-widest text-slate-500 mb-2">Step 1 of {totalSteps}</p>
            <h2 className="text-2xl font-extrabold mb-6 leading-tight">
              Which is your <span className="bg-gradient-to-r from-violet-400 to-purple-300 bg-clip-text text-transparent">absolute favorite</span>?
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-2 max-h-[60vh] overflow-y-auto pr-1
              [scrollbar-width:thin] [scrollbar-color:rgba(124,58,237,0.4)_transparent]">
              {picks.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setFavoriteId(p.id)}
                  className={`group rounded-xl border-2 p-3 text-left transition-all duration-200
                    ${favoriteId === p.id
                      ? "border-violet-500 bg-violet-500/10 shadow-lg shadow-violet-500/20"
                      : "border-white/10 bg-white/5 hover:border-violet-400/40 hover:-translate-y-0.5"}`}
                >
                  {p.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.imageUrl} alt={p.title} className="w-full aspect-[3/4] object-cover rounded-lg mb-2" />
                  ) : (
                    <div className="w-full aspect-[3/4] rounded-lg bg-white/10 mb-2" />
                  )}
                  <div className="text-sm font-semibold truncate">{p.title}</div>
                </button>
              ))}
            </div>
          </>
        )}

        {/* ── Step 1: what hooked you ─────────────────────────── */}
        {step === 1 && (
          <>
            <p className="text-xs uppercase tracking-widest text-slate-500 mb-2">Step 2 of {totalSteps}</p>
            <h2 className="text-2xl font-extrabold mb-6 leading-tight">
              What hooked you about{" "}
              <span className="bg-gradient-to-r from-violet-400 to-purple-300 bg-clip-text text-transparent">
                {favorite?.title ?? "your pick"}
              </span>?
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {HOOKED_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setHookedChoice(opt.value)}
                  className={`group rounded-xl border-2 p-5 text-left transition-all duration-200
                    ${hookedChoice === opt.value
                      ? "border-violet-500 bg-violet-500/10"
                      : "border-white/10 bg-white/5 hover:border-violet-400/40 hover:-translate-y-0.5"}`}
                >
                  <div className="text-3xl mb-2">{opt.icon}</div>
                  <div className="font-bold text-base">{opt.label}</div>
                  <div className="text-xs text-slate-400">{opt.desc}</div>
                </button>
              ))}
            </div>
            {hookedChoice === "other" && (
              <input
                value={hookedText}
                onChange={(e) => setHookedText(e.target.value)}
                placeholder="What was it for you?"
                maxLength={200}
                className="mt-3 w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm
                  placeholder:text-slate-500 focus:outline-none focus:border-violet-500/60
                  focus:bg-white/10 transition-all duration-200"
              />
            )}
          </>
        )}

        {/* ── Step 2: mood ─────────────────────────────────────── */}
        {step === 2 && (
          <>
            <p className="text-xs uppercase tracking-widest text-slate-500 mb-2">Step 3 of {totalSteps}</p>
            <h2 className="text-2xl font-extrabold mb-2 leading-tight">
              What are you in the <span className="bg-gradient-to-r from-violet-400 to-purple-300 bg-clip-text text-transparent">mood for</span>?
            </h2>
            <p className="text-sm text-slate-400 mb-6">Pick any that apply — or none.</p>
            <div className="flex flex-wrap gap-2">
              {MOOD_OPTIONS.map((m) => (
                <button
                  key={m.label}
                  onClick={() => toggle(mood, setMood, m.label)}
                  className={`px-4 py-2.5 rounded-full text-sm font-medium border-2 transition-all duration-200
                    ${mood.has(m.label)
                      ? "border-violet-500 bg-violet-500/20 text-white"
                      : "border-white/10 bg-white/5 text-slate-300 hover:border-violet-400/40"}`}
                >
                  {m.icon} {m.label}
                </button>
              ))}
            </div>
          </>
        )}

        {/* ── Step 3: dislikes ─────────────────────────────────── */}
        {step === 3 && (
          <>
            <p className="text-xs uppercase tracking-widest text-slate-500 mb-2">Step 4 of {totalSteps}</p>
            <h2 className="text-2xl font-extrabold mb-2 leading-tight">
              Anything you <span className="bg-gradient-to-r from-rose-400 to-red-400 bg-clip-text text-transparent">don&apos;t want</span>?
            </h2>
            <p className="text-sm text-slate-400 mb-6">Optional — skip if nothing comes to mind.</p>
            <div className="flex flex-wrap gap-2">
              {DISLIKE_OPTIONS.map((d) => (
                <button
                  key={d}
                  onClick={() => toggle(dislikes, setDislikes, d)}
                  className={`px-4 py-2.5 rounded-full text-sm font-medium border-2 transition-all duration-200
                    ${dislikes.has(d)
                      ? "border-rose-500/50 bg-rose-500/15 text-rose-200"
                      : "border-white/10 bg-white/5 text-slate-300 hover:border-rose-400/30"}`}
                >
                  ❌ {d}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Nav buttons */}
      <div className="flex items-center justify-between gap-3 mt-8">
        <button
          onClick={back}
          disabled={loading}
          className="px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-400 border border-white/10
            hover:text-white hover:border-white/30 transition-all duration-200 disabled:opacity-30"
        >
          {step === 0 ? "← Back to picks" : "← Back"}
        </button>

        <button
          onClick={next}
          disabled={!canContinue || loading}
          className="px-6 py-3 rounded-xl text-sm font-bold text-white
            bg-gradient-to-r from-violet-600 to-purple-600
            hover:from-violet-500 hover:to-purple-500
            shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40
            transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed
            disabled:shadow-none active:scale-[0.98]"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Finding your matches…
            </span>
          ) : step === totalSteps - 1 ? (
            "Get my recommendations →"
          ) : (
            "Continue →"
          )}
        </button>
      </div>
    </div>
  );
}
