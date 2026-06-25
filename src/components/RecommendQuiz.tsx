"use client";

import { useEffect, useRef, useState } from "react";

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
  { label: "Emotional" },
  { label: "Action" },
  { label: "Funny" },
  { label: "Mind-bending" },
  { label: "Romantic" },
  { label: "Chill" },
  { label: "Dark" },
  { label: "Wholesome" },
];

export const DISLIKE_OPTIONS = [
  "Romance focus", "Sad endings", "Sports",
  "Heavy violence", "Slice-of-life", "Ecchi/fanservice", "Mecha",
];

const HOOKED_OPTIONS = [
  { value: "story",      label: "The story",      desc: "Plot, world, mystery" },
  { value: "atmosphere", label: "The atmosphere", desc: "Mood, pacing, vibe" },
  { value: "characters", label: "The characters", desc: "Relationships, growth" },
  { value: "other",      label: "Something else", desc: "Tell us in your words" },
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
  // With only one pick, skip the "pick favorite" step entirely.
  const skipFavStep = picks.length <= 1;
  const initialStep = skipFavStep ? 1 : 0;

  const [step, setStep] = useState(initialStep);
  const [favoriteId, setFavoriteId] = useState<number | null>(picks[0]?.id ?? null);
  const [hookedChoice, setHookedChoice] = useState<string>("");
  const [hookedText, setHookedText] = useState<string>("");
  const [mood, setMood] = useState<Set<string>>(new Set());
  const [dislikes, setDislikes] = useState<Set<string>>(new Set());

  const totalSteps = skipFavStep ? 3 : 4;
  // The "visible" step number (1-indexed) for the progress dots + labels.
  const visibleStep = step - initialStep;

  function next() {
    // Last internal step is always step 3; finish when reaching it
    if (step < 3) setStep(step + 1);
    else finish();
  }

  function back() {
    if (step > initialStep) setStep(step - 1);
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
    <div className="rounded-lg border border-line bg-ink-2 p-6 mb-8">
      {/* Progress dots */}
      <div className="flex gap-2 justify-center mb-8">
        {Array.from({ length: totalSteps }).map((_, i) => (
          <div
            key={i}
            className={`h-2 rounded-full transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]
              ${i === visibleStep
                ? "bg-accent w-8"
                : i < visibleStep
                  ? "w-2 bg-accent/40"
                  : "w-2 bg-ink-3"}`}
          />
        ))}
      </div>

      {/* Step content — keyed for liquid-appear animation on each transition */}
      <div key={step} className="liquid-appear">
        {/* ── Step 0: pick favorite ───────────────────────────── */}
        {step === 0 && (
          <>
            <p className="text-xs uppercase tracking-widest text-paper-3 mb-2">Step {visibleStep + 1} of {totalSteps}</p>
            <h2 className="text-2xl font-extrabold mb-6 leading-tight">
              Which is your <span className="text-accent">absolute favorite</span>?
            </h2>
            <FavoriteWheel picks={picks} favoriteId={favoriteId} onSelect={setFavoriteId} />
          </>
        )}

        {/* ── Step 1: what hooked you ─────────────────────────── */}
        {step === 1 && (
          <>
            <p className="text-xs uppercase tracking-widest text-paper-3 mb-2">Step {visibleStep + 1} of {totalSteps}</p>
            <h2 className="text-2xl font-extrabold mb-6 leading-tight">
              What hooked you about{" "}
              <span className="text-accent">
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
                      ? "border-accent bg-accent/10"
                      : "border-line bg-ink-2 hover:border-violet-400/40 hover:-translate-y-0.5"}`}
                >
                  <div className="font-bold text-base mb-1">{opt.label}</div>
                  <div className="text-xs text-paper-2">{opt.desc}</div>
                </button>
              ))}
            </div>
            {hookedChoice === "other" && (
              <input
                value={hookedText}
                onChange={(e) => setHookedText(e.target.value)}
                placeholder="What was it for you?"
                maxLength={200}
                className="mt-3 w-full bg-ink-2 border border-line rounded-xl px-4 py-3 text-sm
                  placeholder:text-paper-3 focus:outline-none focus:border-accent/60
                  focus:bg-ink-3 transition-all duration-200"
              />
            )}
          </>
        )}

        {/* ── Step 2: mood ─────────────────────────────────────── */}
        {step === 2 && (
          <>
            <p className="text-xs uppercase tracking-widest text-paper-3 mb-2">Step {visibleStep + 1} of {totalSteps}</p>
            <h2 className="text-2xl font-extrabold mb-2 leading-tight">
              What are you in the <span className="text-accent">mood for</span>?
            </h2>
            <p className="text-sm text-paper-2 mb-6">Pick any that apply — or none.</p>
            <div className="flex flex-wrap gap-2">
              {MOOD_OPTIONS.map((m) => (
                <button
                  key={m.label}
                  onClick={() => toggle(mood, setMood, m.label)}
                  className={`px-4 py-2.5 rounded-full text-sm font-medium border-2 transition-all duration-200
                    ${mood.has(m.label)
                      ? "border-accent bg-accent/20 text-accent"
                      : "border-line bg-ink-2 text-paper-2 hover:border-accent/40"}`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </>
        )}

        {/* ── Step 3: dislikes ─────────────────────────────────── */}
        {step === 3 && (
          <>
            <p className="text-xs uppercase tracking-widest text-paper-3 mb-2">Step {visibleStep + 1} of {totalSteps}</p>
            <h2 className="text-2xl font-extrabold mb-2 leading-tight">
              Anything you <span className="text-danger">don&apos;t want</span>?
            </h2>
            <p className="text-sm text-paper-2 mb-6">Optional — skip if nothing comes to mind.</p>
            <div className="flex flex-wrap gap-2">
              {DISLIKE_OPTIONS.map((d) => (
                <button
                  key={d}
                  onClick={() => toggle(dislikes, setDislikes, d)}
                  className={`px-4 py-2.5 rounded-full text-sm font-medium border-2 transition-all duration-200
                    ${dislikes.has(d)
                      ? "border-danger-line bg-danger/15 text-danger"
                      : "border-line bg-ink-2 text-paper-2 hover:border-danger-line"}`}
                >
                  {d}
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
          className="px-4 py-2.5 rounded-xl text-sm font-semibold text-paper-2 border border-line
            hover:text-paper hover:border-line-2 transition-all duration-200 disabled:opacity-30"
        >
          {step === 0 ? "← Back to picks" : "← Back"}
        </button>

        <button
          onClick={next}
          disabled={!canContinue || loading}
          className="px-6 py-3 rounded-md text-sm font-bold text-accent-ink
            bg-accent hover:brightness-110
            transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed
            active:scale-[0.98]"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-line-2 border-t-white rounded-full animate-spin" />
              Finding your matches…
            </span>
          ) : step === 3 ? (
            "Get my recommendations →"
          ) : (
            "Continue →"
          )}
        </button>
      </div>
    </div>
  );
}

// Geometry of the wheel.
const CARD_W = 192;          // px (w-48)
const SPACING = 132;         // px between adjacent card centers (cards overlap a bit)

/**
 * An infinite 3D "wheel" for picking the favorite. Cards are absolutely
 * positioned by transforms based on their distance (in card units) from the
 * center, and that distance wraps modulo N — so the card to the LEFT of the
 * first is the LAST one, and the wheel loops forever. Drag it, flick it, or
 * mouse-wheel it; the centered card is the selected favorite.
 *
 * Dragging repositions synchronously on each pointer-move (no rAF needed, so it
 * tracks the finger even under throttling); rAF is used only for the momentum /
 * snap glide after release and stops as soon as the wheel settles.
 */
function FavoriteWheel({
  picks,
  favoriteId,
  onSelect,
}: {
  picks: QuizPick[];
  favoriteId: number | null;
  onSelect: (id: number) => void;
}) {
  const n = picks.length;
  const initIndex = Math.max(0, picks.findIndex((p) => p.id === (favoriteId ?? picks[0]?.id)));

  const stageRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [focusedId, setFocusedId] = useState<number | null>(picks[initIndex]?.id ?? null);

  // Animation state lives in refs so motion never triggers React re-renders.
  const offsetRef = useRef(initIndex);   // current center position (float, in card units)
  const targetRef = useRef(initIndex);   // where we're gliding toward
  const focusedIdRef = useRef(focusedId);
  const suppressClickRef = useRef(false);
  // Bridges so the React onClick handler can drive logic that lives in the effect.
  const centerCardRef = useRef<(i: number) => void>(() => {});

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || n === 0) return;
    let raf = 0;
    let wheelTimer: ReturnType<typeof setTimeout> | undefined;

    // Shortest signed distance from `off` to card `i`, wrapped into (-n/2, n/2].
    const wrappedDelta = (i: number, off: number) => {
      let d = ((i - off) % n + n) % n;
      if (d > n / 2) d -= n;
      return d;
    };

    // Cards visible per side — kept below n/2 so a card fully fades before it
    // wraps to the other side (no popping).
    const span = Math.min(3, n / 2);

    const positionCards = () => {
      const off = offsetRef.current;
      cardRefs.current.forEach((el, i) => {
        if (!el) return;
        const delta = wrappedDelta(i, off);
        const absd = Math.abs(delta);
        if (absd > span + 0.01) {
          el.style.opacity = "0";
          el.style.pointerEvents = "none";
          el.style.transform = "translate(-50%, -50%) scale(0.4)";
          return;
        }
        const x = delta * SPACING;
        const scale = Math.max(0.6, 1 - absd * 0.16);
        const rotateY = Math.max(-52, Math.min(52, -delta * 22));
        const z = -absd * 70;
        el.style.transform =
          `translate(-50%, -50%) translateX(${x}px) translateZ(${z}px) rotateY(${rotateY}deg) scale(${scale})`;
        el.style.opacity = String(Math.max(0.25, 1 - (absd / span) * 0.9));
        el.style.zIndex = String(1000 - Math.round(absd * 10));
        el.style.pointerEvents = "auto";
      });

      const centerIdx = ((Math.round(off) % n) + n) % n;
      const id = picks[centerIdx]?.id ?? null;
      if (id !== null && id !== focusedIdRef.current) {
        focusedIdRef.current = id;
        setFocusedId(id);
        onSelect(id);
      }
    };

    // rAF glide toward target — runs only while there's distance left to cover.
    const glide = () => {
      const diff = targetRef.current - offsetRef.current;
      if (Math.abs(diff) > 0.001) {
        offsetRef.current += diff * 0.2;
        positionCards();
        raf = requestAnimationFrame(glide);
      } else {
        offsetRef.current = targetRef.current;
        positionCards();
        raf = 0;
      }
    };
    const startGlide = () => { if (!raf) raf = requestAnimationFrame(glide); };

    // ── Drag (pointer events) — repositions live on every move ──
    let dragging = false, startX = 0, startOff = 0, moved = 0, vel = 0, lastX = 0, lastT = 0;
    const onDown = (e: PointerEvent) => {
      dragging = true;
      startX = e.clientX; startOff = offsetRef.current;
      moved = 0; vel = 0; lastX = e.clientX; lastT = performance.now();
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      try { stage.setPointerCapture(e.pointerId); } catch {}
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      moved = Math.max(moved, Math.abs(dx));
      const now = performance.now();
      const dt = now - lastT || 16;
      vel = (-(e.clientX - lastX) / SPACING) / dt * 16;
      lastX = e.clientX; lastT = now;
      offsetRef.current = startOff - dx / SPACING;
      targetRef.current = offsetRef.current;
      positionCards(); // synchronous — follows the finger without rAF
    };
    const onUp = () => {
      if (!dragging) return;
      dragging = false;
      const momentum = Math.max(-2, Math.min(2, vel * 6));
      targetRef.current = Math.round(offsetRef.current + momentum);
      if (moved > 6) { // it was a drag, not a tap — swallow the click
        suppressClickRef.current = true;
        setTimeout(() => { suppressClickRef.current = false; }, 60);
      }
      startGlide();
    };

    // Mouse wheel / trackpad → rotate, snapping when it stops.
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const d = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      targetRef.current += d * 0.005;
      clearTimeout(wheelTimer);
      wheelTimer = setTimeout(() => {
        targetRef.current = Math.round(targetRef.current);
        startGlide();
      }, 110);
      startGlide();
    };

    // Tap a card → rotate the short way to center it.
    centerCardRef.current = (i: number) => {
      if (suppressClickRef.current) return;
      let d = ((i - offsetRef.current) % n + n) % n;
      if (d > n / 2) d -= n;
      targetRef.current = offsetRef.current + d;
      startGlide();
    };

    stage.addEventListener("pointerdown", onDown);
    stage.addEventListener("pointermove", onMove);
    stage.addEventListener("pointerup", onUp);
    stage.addEventListener("pointercancel", onUp);
    stage.addEventListener("pointerleave", onUp);
    stage.addEventListener("wheel", onWheel, { passive: false });

    positionCards(); // initial layout (synchronous, no rAF dependency)

    return () => {
      if (raf) cancelAnimationFrame(raf);
      clearTimeout(wheelTimer);
      stage.removeEventListener("pointerdown", onDown);
      stage.removeEventListener("pointermove", onMove);
      stage.removeEventListener("pointerup", onUp);
      stage.removeEventListener("pointercancel", onUp);
      stage.removeEventListener("pointerleave", onUp);
      stage.removeEventListener("wheel", onWheel);
    };
    // picks is stable for the lifetime of this step; intentionally run once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n]);

  if (n === 0) return null;

  return (
    <div className="relative -mx-6 mb-2">
      <div
        ref={stageRef}
        className="relative h-[340px] overflow-hidden cursor-grab active:cursor-grabbing select-none"
        style={{ perspective: "1200px", touchAction: "none" }}
      >
        {picks.map((p, i) => (
          <button
            key={p.id}
            ref={(el) => {
              cardRefs.current[i] = el;
            }}
            onClick={() => centerCardRef.current(i)}
            style={{ width: CARD_W, left: "50%", top: "50%" }}
            className={`absolute rounded-lg border-2 p-2 text-left will-change-transform
              transition-[border-color,box-shadow] duration-200
              ${focusedId === p.id
                ? "border-accent bg-accent/10 shadow-2xl shadow-black/40"
                : "border-line bg-ink-2"}`}
          >
            {p.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={p.imageUrl}
                alt={p.title}
                draggable={false}
                className="w-full aspect-[3/4] object-cover rounded-xl mb-2 pointer-events-none"
              />
            ) : (
              <div className="w-full aspect-[3/4] rounded-xl bg-ink-3 mb-2" />
            )}
            <div className="text-sm font-semibold truncate px-1">{p.title}</div>
          </button>
        ))}
      </div>
      <p className="text-center text-xs text-paper-3">
        Drag, scroll, or tap a poster — the centered one is your favorite
      </p>
    </div>
  );
}
