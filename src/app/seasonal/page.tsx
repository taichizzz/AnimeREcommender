"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Footer } from "@/components/Footer";
import { CRTScreen } from "@/components/CRTScreen";
import { HeartbeatWithLabel } from "@/components/Heartbeat";
import { useIsLoggedIn } from "@/components/AuthProvider";
import { DISLIKE_OPTIONS, MOOD_OPTIONS } from "@/components/RecommendQuiz";
import {
  formatSeasonLabel,
  getCurrentSeason,
  SEASONS,
  type AnimeSeason,
  type SeasonalAnime,
} from "@/lib/malSeasonal";

type TunedSeasonalAnime = SeasonalAnime & {
  reason: string;
};

type ActiveModal = {
  item: SeasonalAnime;
  reason?: string;
  fromX: number;
  fromY: number;
  fromScale: number;
};

const LIST_STATUS_LABELS: Record<string, string> = {
  watching: "Watching",
  completed: "Completed",
  on_hold: "On Hold",
  dropped: "Dropped",
  plan_to_watch: "Plan to Watch",
};

function formatMembers(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
}

function formatBroadcast(b: SeasonalAnime["broadcast"], uppercaseDay = false): string | null {
  if (!b) return null;
  const short = b.day.slice(0, 3);
  const day = uppercaseDay ? short.toUpperCase() : short.charAt(0).toUpperCase() + short.slice(1);
  return b.time ? `${day} ${b.time} JST` : day;
}

function stepSeason(
  year: number,
  season: AnimeSeason,
  delta: -1 | 1
): { year: number; season: AnimeSeason } {
  const idx = SEASONS.indexOf(season) + delta;
  if (idx < 0) return { year: year - 1, season: SEASONS[SEASONS.length - 1] };
  if (idx >= SEASONS.length) return { year: year + 1, season: SEASONS[0] };
  return { year, season: SEASONS[idx] };
}

function StarScore({ score }: { score: number | null }) {
  if (score == null) {
    return <span className="text-[11px] text-paper-3">N/A</span>;
  }
  return (
    <span className="inline-flex items-center gap-[4px] text-[11px] leading-none whitespace-nowrap">
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="currentColor"
        className="shrink-0 text-star"
        aria-hidden="true"
      >
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
      <span className="sr-only">MyAnimeList score </span>
      <span className="font-semibold tabular-nums leading-none text-paper">
        {score.toFixed(2)}
      </span>
    </span>
  );
}

function AnimeDetailModal({
  modal,
  onClose,
}: {
  modal: ActiveModal;
  onClose: () => void;
}) {
  const { item, reason } = modal;
  const broadcast = formatBroadcast(item.broadcast, true);
  const statusLabel = item.myListStatus
    ? LIST_STATUS_LABELS[item.myListStatus] ?? item.myListStatus
    : null;

  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);

  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      el.style.transform = "";
      return;
    }

    el.style.transform = `translate3d(${modal.fromX}px, ${modal.fromY}px, 0px) scale(${modal.fromScale}) rotateY(0deg)`;

    const DURATION = 820;
    let startTime: number | null = null;

    const tick = (now: number) => {
      if (closingRef.current) return;
      if (startTime === null) startTime = now;

      const t = Math.min(1, (now - startTime) / DURATION);
      const flightEase = 1 - Math.pow(1 - t, 3.2);
      const spinEase = 1 - Math.pow(1 - t, 2.4);

      const x = modal.fromX * (1 - flightEase);
      const y = modal.fromY * (1 - flightEase);
      const z = Math.sin(t * Math.PI) * 50;
      const scale = modal.fromScale + (1 - modal.fromScale) * flightEase;
      const angle = spinEase * 720;

      el.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, ${z.toFixed(2)}px) scale(${scale.toFixed(4)}) rotateY(${angle.toFixed(2)}deg)`;

      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        el.style.transform = "";
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [modal.item.id, modal.fromX, modal.fromY, modal.fromScale]);

  const handleClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    cancelAnimationFrame(rafRef.current);
    setClosing(true);

    const el = cardRef.current;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!el || reduceMotion) {
      onClose();
      return;
    }

    const DURATION = 240;
    let startTime: number | null = null;

    const tick = (now: number) => {
      if (startTime === null) startTime = now;
      const t = Math.min(1, (now - startTime) / DURATION);
      const ease = t * t;

      const x = modal.fromX * ease;
      const y = modal.fromY * ease;
      const scale = 1 - (1 - modal.fromScale) * ease;
      const angle = -180 * ease;

      el.style.opacity = String(1 - ease);
      el.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0px) scale(${scale.toFixed(4)}) rotateY(${angle.toFixed(2)}deg)`;

      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        onClose();
      }
    };

    rafRef.current = requestAnimationFrame(tick);
  }, [modal.fromX, modal.fromY, modal.fromScale, onClose]);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") handleClose();
    }
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
      cancelAnimationFrame(rafRef.current);
    };
  }, [handleClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <>
      {/* Sibling 1: Backdrop (kept separate so backdrop-blur/opacity never flatten 3D preserve-3d) */}
      <div
        aria-hidden="true"
        onClick={handleClose}
        className={`fixed inset-0 z-50 bg-black/75 backdrop-blur-sm ${
          closing ? "modal-backdrop-exit" : "modal-backdrop-appear"
        }`}
      />

      {/* Sibling 2: 3D Perspective Stage */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={item.title}
        onClick={handleClose}
        style={{ perspective: "1400px", WebkitPerspective: "1400px" }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
      >
        <div
          ref={cardRef}
          key={item.id}
          onClick={(e) => e.stopPropagation()}
          style={{
            transformStyle: "preserve-3d",
            WebkitTransformStyle: "preserve-3d",
            willChange: "transform",
          }}
          className="relative w-full max-w-2xl"
        >
          {/* Back face FIRST in DOM — visible only during the two 180° flips */}
          <div
            aria-hidden="true"
            style={{
              backfaceVisibility: "hidden",
              WebkitBackfaceVisibility: "hidden",
              transform: "rotateY(180deg) translateZ(1px)",
            }}
            className="pointer-events-none absolute inset-0 rounded-2xl border border-line-2 bg-[#161616] flex items-center justify-center shadow-2xl"
          >
            <span className="text-xl font-bold tracking-[0.26em] text-paper/80">
              ANIMER.
            </span>
          </div>

          {/* Front face SECOND in DOM — scroll lives on the inner wrapper, not on the backface-hidden element */}
          <div
            style={{
              backfaceVisibility: "hidden",
              WebkitBackfaceVisibility: "hidden",
              transform: "rotateY(0deg) translateZ(1px)",
            }}
            className="relative rounded-2xl border border-line-2 bg-[#1c1c1c] shadow-2xl"
          >
            <div className="relative max-h-[82vh] overflow-y-auto p-6">
              <button
                type="button"
                onClick={handleClose}
                aria-label="Close"
                className="cursor-pointer absolute top-4 right-4 w-8 h-8 rounded-full border border-line bg-ink-2
                  text-paper-2 hover:text-paper hover:border-line-2 transition-colors flex items-center justify-center text-lg leading-none"
              >
                ×
              </button>

              <div className="flex flex-col sm:flex-row gap-5 pr-8">
                <CRTScreen
                  playPowerOnOnMount
                  curvature={28}
                  clipToCurve
                  aberration={36}
                  aberrationScheme={0}
                  scanlines={28}
                  scanlineSize={4}
                  mask={32}
                  maskPitch={6}
                  vignette={50}
                  noise={20}
                  rollSpeed={4}
                  flicker={50}
                  jitter={2.5}
                  className="w-36 sm:w-44 aspect-[3/4] rounded-xl border border-line-2 shadow-xl flex-shrink-0"
                >
                  {item.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.imageUrl}
                      alt={item.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-ink-3" />
                  )}
                </CRTScreen>

                <div className="flex-1 min-w-0">
                  <h3 className="text-xl font-bold text-paper leading-snug mb-1">
                    {item.title}
                  </h3>
                  {item.romajiTitle !== item.title && (
                    <p className="text-xs text-paper-3 mb-2">{item.romajiTitle}</p>
                  )}

                  <div className="flex items-center gap-2.5 flex-wrap text-xs text-paper-2 mb-3">
                    <StarScore score={item.score} />
                    <span className="text-paper-3">{formatMembers(item.members)} members</span>
                    {item.episodes != null && (
                      <span className="text-paper-3">{item.episodes} eps</span>
                    )}
                    {item.episodeDurationMin != null && (
                      <span className="text-paper-3">{item.episodeDurationMin}m / ep</span>
                    )}
                    {item.mediaType && (
                      <span className="uppercase tracking-wide text-paper-3">
                        {item.mediaType}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-wrap text-xs text-paper-2 mb-3">
                    {item.studios.length > 0 && <span>{item.studios.join(", ")}</span>}
                    {item.source && (
                      <span className="text-[10px] uppercase tracking-wide text-paper bg-ink-3 border border-line-2 rounded px-1.5 py-0.5">
                        {item.source}
                      </span>
                    )}
                    {broadcast && (
                      <span className="text-[10px] font-mono uppercase tracking-wide text-paper-2 bg-ink-2 border border-line rounded px-1.5 py-0.5">
                        {broadcast}
                      </span>
                    )}
                    {statusLabel && (
                      <span className="text-[10px] uppercase tracking-wide text-accent bg-accent/10 border border-accent/30 rounded px-1.5 py-0.5">
                        {statusLabel}
                      </span>
                    )}
                  </div>

                  {item.genres.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {item.genres.map((g) => (
                        <span
                          key={g}
                          className="text-[10px] uppercase tracking-wide text-paper-2 bg-ink-2 border border-line rounded px-2 py-0.5"
                        >
                          {g}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {reason && (
                <div className="mt-5 pt-4 border-t border-line">
                  <p className="text-[10px] uppercase tracking-widest text-paper-3 mb-1.5">
                    Why it fits you
                  </p>
                  <p className="text-sm text-paper leading-relaxed">{reason}</p>
                </div>
              )}

              <div className="mt-5 pt-4 border-t border-line">
                <p className="text-[10px] uppercase tracking-widest text-paper-3 mb-2">
                  Synopsis
                </p>
                <p className="text-sm text-paper-2 leading-relaxed whitespace-pre-line">
                  {item.synopsis || "No synopsis available yet."}
                </p>
              </div>

              <div className="mt-6">
                <a
                  href={`https://myanimelist.net/anime/${item.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm font-bold text-accent-ink
                    bg-accent hover:brightness-110 rounded-md px-5 py-2.5 transition-all duration-200 active:scale-[0.98]"
                >
                  View on MyAnimeList
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}

export default function SeasonalPage() {
  const isLoggedIn = useIsLoggedIn();
  const initial = useMemo(() => getCurrentSeason(), []);

  const [year, setYear] = useState(initial.year);
  const [season, setSeason] = useState<AnimeSeason>(initial.season);
  const [currentSeason, setCurrentSeason] = useState(initial);
  const [tab, setTab] = useState<"browse" | "foryou">("browse");

  const [items, setItems] = useState<SeasonalAnime[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Personalized curation state
  const [selectedMoods, setSelectedMoods] = useState<Set<string>>(new Set());
  const [selectedDislikes, setSelectedDislikes] = useState<Set<string>>(new Set());
  const [tuning, setTuning] = useState(false);
  const [tuneError, setTuneError] = useState<string | null>(null);
  const [tunedResults, setTunedResults] = useState<TunedSeasonalAnime[] | null>(null);
  const [tunedThinking, setTunedThinking] = useState("");
  const [tunedMalUsed, setTunedMalUsed] = useState(false);

  // Enlarge flip modal
  const [activeModal, setActiveModal] = useState<ActiveModal | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setTunedResults(null);
    setTunedThinking("");
    setTuneError(null);
    setActiveModal(null);

    fetch(`/api/seasonal?year=${year}&season=${season}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.error ?? "Failed to load seasonal anime");
        }
        setItems(data.items ?? []);
        if (data.current) setCurrentSeason(data.current);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Failed to load seasonal anime");
        setItems([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [year, season]);

  const displayItems = useMemo(() => {
    const newOnly = items.filter((item) => item.isNewThisSeason);
    return newOnly.length >= 8 ? newOnly : items;
  }, [items]);

  function toggleSet(set: Set<string>, setFn: (next: Set<string>) => void, value: string) {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    setFn(next);
  }

  function openModal(item: SeasonalAnime, el: HTMLElement, reason?: string) {
    const rect = el.getBoundingClientRect();
    const fromX = Math.round(rect.left + rect.width / 2 - window.innerWidth / 2);
    const fromY = Math.round(rect.top + rect.height / 2 - window.innerHeight / 2);
    const fromScale = Math.max(
      0.35,
      Math.min(0.72, rect.width / Math.min(672, window.innerWidth - 48))
    );
    setActiveModal({ item, reason, fromX, fromY, fromScale });
  }

  async function handleTuneSeason() {
    setTuning(true);
    setTuneError(null);
    try {
      const res = await fetch("/api/recommend/seasonal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year,
          season,
          mood: Array.from(selectedMoods),
          dislikes: Array.from(selectedDislikes),
          newOnly: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setTuneError(data?.error ?? "Could not curate this season");
        return;
      }
      setTunedResults(data.results ?? []);
      setTunedThinking(data.thinking ?? "");
      setTunedMalUsed(Boolean(data.malUsed));
    } catch {
      setTuneError("Network error while curating seasonal anime");
    } finally {
      setTuning(false);
    }
  }

  const isViewingCurrent = year === currentSeason.year && season === currentSeason.season;
  const seasonLabel = formatSeasonLabel(year, season);

  return (
    <div className="min-h-screen bg-ink text-paper">
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-12">
        {/* Top nav */}
        <div className="flex items-center justify-between mb-12 gap-2">
          <Link href="/" aria-label="Back to home" className="shrink-0">
            <h1 className="text-lg sm:text-2xl font-bold tracking-[0.18em] sm:tracking-[0.22em] text-paper whitespace-nowrap shrink-0">
              ANIMER<span className="text-accent">.</span>
            </h1>
          </Link>
          <div className="flex items-center gap-3 sm:gap-5 shrink-0">
            <Link
              href="/recommend"
              className="text-xs sm:text-sm font-medium text-paper-2 hover:text-paper transition-colors duration-200 whitespace-nowrap"
            >
              Recommend
            </Link>
            <Link
              href="/seasonal"
              className="text-xs sm:text-sm font-medium text-paper transition-colors duration-200 whitespace-nowrap"
            >
              Seasonal
            </Link>
            <Link
              href="/about"
              className="hidden sm:inline text-xs sm:text-sm font-medium text-paper-2 hover:text-paper transition-colors duration-200 whitespace-nowrap"
            >
              About
            </Link>
            {isLoggedIn ? (
              <Link
                href="/dashboard"
                className="px-2.5 py-1.5 sm:px-4 sm:py-2 rounded-md text-xs sm:text-sm font-medium text-paper
                  border border-line-2 hover:bg-ink-2 transition-colors duration-200 whitespace-nowrap"
              >
                <span className="sm:hidden">Dashboard</span>
                <span className="hidden sm:inline">My Dashboard</span>
              </Link>
            ) : (
              <a
                href="/api/auth/login"
                className="px-2.5 py-1.5 sm:px-4 sm:py-2 rounded-md text-xs sm:text-sm font-medium text-paper
                  border border-line-2 hover:bg-ink-2 transition-colors duration-200 whitespace-nowrap"
              >
                <span className="sm:hidden">MAL Login</span>
                <span className="hidden sm:inline">Login with MAL</span>
              </a>
            )}
          </div>
        </div>

        {/* Minimal season switcher */}
        <header className="mb-8 liquid-appear flex flex-col items-center gap-2">
          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => {
                const prev = stepSeason(year, season, -1);
                setYear(prev.year);
                setSeason(prev.season);
              }}
              aria-label="Previous season"
              className="cursor-pointer w-9 h-9 rounded-xl border border-line bg-ink-2 text-paper-2
                hover:text-paper hover:border-line-2 transition-colors flex items-center justify-center"
            >
              ←
            </button>
            <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-center">
              {seasonLabel}
            </h2>
            <button
              type="button"
              onClick={() => {
                const next = stepSeason(year, season, 1);
                setYear(next.year);
                setSeason(next.season);
              }}
              aria-label="Next season"
              className="cursor-pointer w-9 h-9 rounded-xl border border-line bg-ink-2 text-paper-2
                hover:text-paper hover:border-line-2 transition-colors flex items-center justify-center"
            >
              →
            </button>
          </div>
          {!isViewingCurrent && (
            <button
              type="button"
              onClick={() => {
                setYear(currentSeason.year);
                setSeason(currentSeason.season);
              }}
              className="cursor-pointer text-xs font-medium px-3 py-1.5 rounded-full border border-line-2
                bg-ink-2 text-paper hover:bg-ink-3 transition-colors"
            >
              Current
            </button>
          )}
        </header>

        {/* Sliding tab toggle — exact pattern from /recommend */}
        <div className="glass relative flex p-1 bg-ink-2 rounded-2xl border border-line mb-8 overflow-hidden">
          <div
            className="absolute top-1 bottom-1 w-[calc(50%-0.25rem)] rounded-xl
              bg-accent transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
            style={{
              transform: tab === "browse" ? "translateX(0)" : "translateX(100%)",
            }}
          />
          <button
            type="button"
            onClick={() => setTab("browse")}
            className={`cursor-pointer relative z-10 flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors duration-300
              ${tab === "browse" ? "text-accent-ink" : "text-paper-2 hover:text-paper"}`}
          >
            All anime
          </button>
          <button
            type="button"
            onClick={() => setTab("foryou")}
            className={`cursor-pointer relative z-10 flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors duration-300
              ${tab === "foryou" ? "text-accent-ink" : "text-paper-2 hover:text-paper"}`}
          >
            For you
          </button>
        </div>

        {/* ── TAB 1: ALL ANIME ───────────────────────────────────────────── */}
        <div
          className={tab === "browse" ? "" : "hidden"}
          aria-hidden={tab !== "browse"}
        >
            {error && (
              <div className="mb-6 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                {error}
              </div>
            )}

            {loading ? (
              <HeartbeatWithLabel text={`Loading ${seasonLabel}`} />
            ) : displayItems.length === 0 ? (
              <div className="glass rounded-2xl border border-line bg-ink-2 p-8 text-center text-sm text-paper-2">
                No seasonal anime found for {seasonLabel}.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {displayItems.map((item) => {
                  const broadcast = formatBroadcast(item.broadcast);
                  const statusLabel = item.myListStatus
                    ? LIST_STATUS_LABELS[item.myListStatus] ?? item.myListStatus
                    : null;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={(e) => openModal(item, e.currentTarget)}
                      style={{
                        contentVisibility: "auto",
                        containIntrinsicSize: "auto 148px",
                      }}
                      className="group glass glass-hover text-left rounded-2xl border border-line bg-ink-2 p-4
                        hover:border-line-2 cursor-pointer transition-colors"
                    >
                      <div className="flex gap-4">
                        <CRTScreen
                          fixedWidth={80}
                          fixedHeight={114}
                          animateOnHover
                          curvature={22}
                          clipToCurve
                          aberration={26}
                          aberrationScheme={0}
                          scanlines={30}
                          scanlineSize={3}
                          mask={32}
                          maskPitch={4}
                          vignette={45}
                          noise={18}
                          rollSpeed={3.5}
                          flicker={35}
                          jitter={0}
                          className="w-20 rounded-lg border border-line flex-shrink-0"
                          style={{ height: "114px" }}
                        >
                          {item.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={item.imageUrl}
                              alt={item.title}
                              loading="lazy"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full bg-ink-3" />
                          )}
                        </CRTScreen>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <span className="font-semibold text-sm text-paper leading-snug line-clamp-2">
                              {item.title}
                            </span>
                            {statusLabel && (
                              <span className="flex-shrink-0 text-[10px] uppercase tracking-wide text-accent bg-accent/10 border border-accent/30 rounded px-1.5 py-0.5">
                                {statusLabel}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2.5 flex-wrap text-xs text-paper-2 mb-1.5">
                            <StarScore score={item.score} />
                            <span className="text-[11px] text-paper-3">
                              {formatMembers(item.members)} members
                            </span>
                            {item.episodes != null && (
                              <span className="text-[11px] text-paper-3">
                                {item.episodes} eps
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2 flex-wrap text-xs text-paper-2 mb-2">
                            {item.studios.length > 0 && (
                              <span className="truncate max-w-[180px]">
                                {item.studios.join(", ")}
                              </span>
                            )}
                            {item.source === "Original" && (
                              <span className="text-[10px] uppercase tracking-wide text-paper bg-ink-3 border border-line-2 rounded px-1.5 py-0.5">
                                Original
                              </span>
                            )}
                            {broadcast && (
                              <span className="text-[11px] font-mono text-paper-3">
                                {broadcast}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 flex-wrap">
                            {item.genres.slice(0, 3).map((g) => (
                              <span
                                key={g}
                                className="text-[10px] uppercase tracking-wide text-paper-3 bg-ink-2 border border-line rounded px-1.5 py-0.5"
                              >
                                {g}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
        </div>

        {/* ── TAB 2: FOR YOU ─────────────────────────────────────────────── */}
        {tab === "foryou" && (
          <div key="foryou" className="liquid-appear">
            <section className="glass rounded-2xl border border-line bg-ink-2 p-6 mb-8">
              <h3 className="text-lg font-bold text-paper">
                Find your picks for {seasonLabel}
              </h3>
              <p className="text-sm text-paper-2 mt-1 mb-5 max-w-2xl">
                {isLoggedIn
                  ? "Uses your MAL watch history, studio preferences, and current mood to pick standout shows for you."
                  : "Pick a mood or dislikes to curate this season — or log in with MAL for full taste matching."}
              </p>

              <div className="space-y-4 mb-6">
                <div>
                  <p className="text-[11px] uppercase tracking-widest text-paper-3 mb-2">
                    Mood (optional)
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {MOOD_OPTIONS.map((m) => {
                      const active = selectedMoods.has(m.label);
                      return (
                        <button
                          key={m.label}
                          type="button"
                          onClick={() => toggleSet(selectedMoods, setSelectedMoods, m.label)}
                          className={`cursor-pointer px-3.5 py-1.5 rounded-full text-xs font-medium border transition-all duration-150
                            ${
                              active
                                ? "border-accent bg-accent/20 text-accent"
                                : "border-line bg-ink-2 text-paper-2 hover:border-line-2 hover:text-paper"
                            }`}
                        >
                          {m.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <p className="text-[11px] uppercase tracking-widest text-paper-3 mb-2">
                    Exclude (optional)
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {DISLIKE_OPTIONS.map((d) => {
                      const active = selectedDislikes.has(d);
                      return (
                        <button
                          key={d}
                          type="button"
                          onClick={() => toggleSet(selectedDislikes, setSelectedDislikes, d)}
                          className={`cursor-pointer px-3.5 py-1.5 rounded-full text-xs font-medium border transition-all duration-150
                            ${
                              active
                                ? "border-danger-line bg-danger/15 text-danger"
                                : "border-line bg-ink-2 text-paper-2 hover:border-danger-line hover:text-paper"
                            }`}
                        >
                          {d}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleTuneSeason}
                  disabled={tuning || loading || items.length === 0}
                  className="cursor-pointer px-6 py-3 rounded-xl font-bold text-sm bg-accent text-accent-ink
                    hover:brightness-110 transition-all duration-200 active:scale-[0.98]
                    disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isLoggedIn
                    ? `Pick for me`
                    : `Curate ${seasonLabel}`}
                </button>
                {tunedResults && (
                  <button
                    type="button"
                    onClick={() => {
                      setTunedResults(null);
                      setTunedThinking("");
                    }}
                    className="cursor-pointer px-4 py-2.5 rounded-xl text-xs font-semibold text-paper-2
                      border border-line hover:text-paper hover:border-line-2 transition-colors"
                  >
                    Clear picks
                  </button>
                )}
              </div>

              {tuneError && (
                <div className="mt-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                  {tuneError}
                </div>
              )}

              {tuning && (
                <HeartbeatWithLabel
                  text={
                    isLoggedIn
                      ? `Matching ${seasonLabel} to your MAL`
                      : `Curating ${seasonLabel}`
                  }
                />
              )}
            </section>

            {tunedResults && !tuning && (
              <section>
                <div className="flex items-center gap-4 mb-6">
                  <div className="h-px flex-1 bg-line" />
                  <h3 className="text-xs font-semibold uppercase tracking-widest text-paper-2">
                    Picked for you · {seasonLabel}
                    {tunedMalUsed ? " (MAL-matched)" : ""}
                  </h3>
                  <div className="h-px flex-1 bg-line" />
                </div>

                {tunedThinking && (
                  <details className="glass mb-6 rounded-2xl border border-line bg-ink-2 overflow-hidden card-appear">
                    <summary className="cursor-pointer select-none px-5 py-4 flex items-center gap-3 hover:bg-white/5 transition-colors duration-200">
                      <span className="text-sm font-semibold text-paper">
                        How Animer read {seasonLabel} for you
                      </span>
                      <span className="ml-auto text-xs text-paper-3">click to expand</span>
                    </summary>
                    <div className="px-5 pb-5 pt-0">
                      <p className="text-sm text-paper-2 leading-relaxed whitespace-pre-line">
                        {tunedThinking}
                      </p>
                    </div>
                  </details>
                )}

                {tunedResults.length === 0 ? (
                  <div className="glass rounded-2xl border border-line bg-ink-2 p-6 text-sm text-paper-2">
                    No unwatched matches left in {seasonLabel} with your current dislikes.
                  </div>
                ) : (
                  <div className="grid gap-4">
                    {tunedResults.map((r, i) => {
                      const broadcast = formatBroadcast(r.broadcast, true);
                      const statusLabel = r.myListStatus
                        ? LIST_STATUS_LABELS[r.myListStatus] ?? r.myListStatus
                        : null;

                      return (
                        <button
                          key={r.id}
                          type="button"
                          onClick={(e) => openModal(r, e.currentTarget, r.reason)}
                          style={{ animationDelay: `${i * 70}ms` }}
                          className="group glass glass-hover card-appear text-left rounded-2xl border border-line bg-ink-2 p-4
                            hover:border-line-2 cursor-pointer transition-colors"
                        >
                          <div className="flex gap-4">
                            <div className="flex-shrink-0 flex flex-col items-center gap-1.5">
                              <span className="text-xs font-mono text-paper-3">#{i + 1}</span>
                              <CRTScreen
                                fixedWidth={64}
                                fixedHeight={88}
                                animateOnHover
                                curvature={22}
                                clipToCurve
                                aberration={26}
                                aberrationScheme={0}
                                scanlines={30}
                                scanlineSize={3}
                                mask={32}
                                maskPitch={4}
                                vignette={45}
                                noise={18}
                                rollSpeed={3.5}
                                flicker={35}
                                jitter={0}
                                className="w-16 rounded-lg border border-line"
                                style={{ height: "88px" }}
                              >
                                {r.imageUrl ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={r.imageUrl}
                                    alt={r.title}
                                    loading="lazy"
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <div className="w-full h-full bg-ink-3" />
                                )}
                              </CRTScreen>
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <span className="font-semibold text-paper">{r.title}</span>
                                <StarScore score={r.score} />
                                {r.studios.length > 0 && (
                                  <span className="text-xs text-paper-2">
                                    {r.studios.slice(0, 2).join(", ")}
                                  </span>
                                )}
                                {broadcast && (
                                  <span className="text-[10px] font-mono uppercase tracking-wide text-paper-2 bg-ink-2 border border-line rounded px-1.5 py-0.5">
                                    {broadcast}
                                  </span>
                                )}
                                {r.source === "Original" && (
                                  <span className="text-[10px] uppercase tracking-wide text-paper bg-ink-3 border border-line-2 rounded px-1.5 py-0.5">
                                    Original
                                  </span>
                                )}
                                {statusLabel && (
                                  <span className="text-[10px] uppercase tracking-wide text-accent bg-accent/10 border border-accent/30 rounded px-1.5 py-0.5">
                                    {statusLabel}
                                  </span>
                                )}
                              </div>

                              <p className="text-sm text-paper-2 leading-relaxed line-clamp-2">
                                {r.reason}
                              </p>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>
            )}
          </div>
        )}
      </main>

      {activeModal && (
        <AnimeDetailModal
          modal={activeModal}
          onClose={() => setActiveModal(null)}
        />
      )}

      <Footer />
    </div>
  );
}
