"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { RecommendQuiz, type QuizResult } from "@/components/RecommendQuiz";
import { RecommendationsLoadingList } from "@/components/Skeletons";

type SearchItem = {
  id: number;
  title: string;
  synopsis: string | null;
  imageUrl: string | null;
  score: number | null;
  year: number | null;
};

type RecommendationItem = {
  id: number;
  malId: number | null;
  title: string;
  imageUrl: string | null;
  score: number | null;
  year: number | null;
  synopsis: string | null;
  genres: string[];
  reason: string;
};

type SeedItem = {
  id: number;
  title: string;
  imageUrl: string | null;
  score: number;
};

export default function RecommendPage() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [mode, setMode] = useState<"manual" | "mylist">("manual");

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchItem[]>([]);
  const [searchKey, setSearchKey] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<SearchItem[]>([]);
  const [recs, setRecs] = useState<RecommendationItem[]>([]);
  const [thinking, setThinking] = useState<string>("");
  const [seeds, setSeeds] = useState<SeedItem[]>([]);
  const [recLoading, setRecLoading] = useState(false);
  const [userText, setUserText] = useState("");
  const [quizOpen, setQuizOpen] = useState(false);
  const [mylistSeedsLoaded, setMylistSeedsLoaded] = useState(false);
  const [expandedRecIds, setExpandedRecIds] = useState<Set<number>>(new Set());
  const [showDropdown, setShowDropdown] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const selectedIds = useMemo(() => new Set(selected.map((a) => a.id)), [selected]);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setIsLoggedIn(!!d.user))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setRecs([]);
    setThinking("");
    setSeeds([]);
    setQuizOpen(false);
    setMylistSeedsLoaded(false);
    setExpandedRecIds(new Set());
  }, [selectedIds, mode]);

  function toggleExpand(id: number) {
    setExpandedRecIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Debounced typeahead — auto-search 300ms after the user stops typing
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (res.ok) {
          setResults(data.results ?? []);
          setSearchKey((k) => k + 1);
          setShowDropdown(true);
        }
      } catch {
        // Silent — user can keep typing
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  // Close dropdown on outside click
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  // Close dropdown on Esc
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setShowDropdown(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  function addToSelected(item: SearchItem) {
    if (selectedIds.has(item.id)) return;
    if (selected.length >= 10) {
      setError("You can select up to 10 anime.");
      return;
    }
    setError(null);
    setSelected((prev) => [...prev, item]);
  }

  function removeFromSelected(id: number) {
    setError(null);
    setSelected((prev) => prev.filter((a) => a.id !== id));
  }

  function startManualQuiz() {
    if (selected.length === 0) return;
    setError(null);
    setRecs([]);
    setQuizOpen(true);
  }

  async function handleManualRecommend(quiz: QuizResult) {
    if (selected.length === 0) return;
    setRecLoading(true);
    setError(null);
    setSeeds([]);
    try {
      const res = await fetch("/api/recommend/v2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          likedAnimeIds: selected.map((a) => a.id),
          favoriteMalId: quiz.favoriteId,
          quiz: {
            hookedBy: quiz.hookedBy,
            mood: quiz.mood,
            dislikes: quiz.dislikes,
          },
          userText: userText.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError((data?.error ?? "Recommendation failed") + (data?.detail ? `: ${data.detail}` : ""));
        setRecs([]);
        return;
      }
      setRecs(data.results);
      setThinking(data.thinking ?? "");
      setQuizOpen(false);
    } catch {
      setError("Network error while recommending");
      setRecs([]);
    } finally {
      setRecLoading(false);
    }
  }

  async function startListQuiz() {
    if (mylistSeedsLoaded && seeds.length > 0) {
      setQuizOpen(true);
      return;
    }
    setRecLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/recommend/fromlist?seeds_only=1", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Could not load your list");
        return;
      }
      setSeeds(data.seeds ?? []);
      setMylistSeedsLoaded(true);
      setQuizOpen(true);
    } catch {
      setError("Network error while loading your list");
    } finally {
      setRecLoading(false);
    }
  }

  async function handleListRecommend(quiz: QuizResult) {
    setRecLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/recommend/fromlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          favoriteMalId: quiz.favoriteId,
          quiz: {
            hookedBy: quiz.hookedBy,
            mood: quiz.mood,
            dislikes: quiz.dislikes,
          },
          userText: userText.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Recommendation failed");
        setRecs([]);
        return;
      }
      setRecs(data.results);
      setThinking(data.thinking ?? "");
      setSeeds(data.seeds ?? seeds);
      setQuizOpen(false);
    } catch {
      setError("Network error while recommending");
      setRecs([]);
    } finally {
      setRecLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a14] text-white">
      {/* Ambient glows */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 left-1/3 w-[600px] h-[600px] bg-violet-700/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 -right-40 w-[400px] h-[400px] bg-purple-700/8 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-indigo-800/8 rounded-full blur-3xl" />
      </div>

      <main className="relative z-10 max-w-4xl mx-auto px-6 py-12">

        {/* Header */}
        <div className="flex items-center justify-between mb-12">
          <Link href="/" aria-label="Back to home">
            <h1 className="text-4xl font-black tracking-tight bg-gradient-to-r from-violet-400 via-purple-300 to-pink-400 bg-clip-text text-transparent pb-1">
              Animer
            </h1>
          </Link>
          {isLoggedIn ? (
            <Link href="/dashboard"
              className="px-4 py-2 rounded-xl text-sm font-semibold bg-white/10 hover:bg-white/15
                border border-white/10 hover:border-white/20 transition-all duration-200">
              My Dashboard
            </Link>
          ) : (
            <a href="/api/auth/login"
              className="px-4 py-2 rounded-xl text-sm font-semibold
                bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500
                shadow-lg shadow-violet-500/20 hover:shadow-violet-500/30 transition-all duration-200">
              Login with MAL
            </a>
          )}
        </div>

        {/* Mode toggle — only shown when logged in */}
        {isLoggedIn && (
          <div className="relative flex p-1 bg-white/5 rounded-2xl border border-white/10 mb-8 backdrop-blur-md overflow-hidden">
            <div
              className="absolute top-1 bottom-1 w-[calc(50%-0.25rem)] rounded-xl
                bg-gradient-to-r from-violet-600 to-purple-600
                shadow-lg shadow-violet-500/30
                transition-all duration-1000 ease-[cubic-bezier(0.22,1,0.36,1)]"
              style={{
                transform: mode === "manual" ? "translateX(0)" : "translateX(100%)",
              }}
            />
            <button
              onClick={() => setMode("manual")}
              className={`relative z-10 flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors duration-300
                ${mode === "manual" ? "text-white" : "text-slate-400 hover:text-white"}`}
            >
              Pick Your Own
            </button>
            <button
              onClick={() => setMode("mylist")}
              className={`relative z-10 flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors duration-300
                ${mode === "mylist" ? "text-white" : "text-slate-400 hover:text-white"}`}
            >
              From My MAL List
            </button>
          </div>
        )}


        {/* ── MAL LIST MODE ───────────────────────────────────────────── */}
        {mode === "mylist" && !quizOpen && (
          <div key="mylist" className="liquid-appear mb-8 rounded-2xl border border-violet-500/20 bg-violet-500/5 p-6">
            <h2 className="font-bold text-white text-lg mb-1">Recommendations from your list</h2>
            <p className="text-slate-400 text-sm mb-6">
              We&apos;ll use your 5 highest-rated completed anime as seeds, then ask a few quick questions to dial it in.
            </p>

            {seeds.length > 0 && (
              <div className="mb-6">
                <p className="text-xs uppercase tracking-widest text-slate-500 mb-3">Based on</p>
                <div className="flex gap-3 flex-wrap">
                  {seeds.map((s) => (
                    <div key={s.id} className="flex items-center gap-2 bg-white/10 rounded-xl px-3 py-2 border border-white/10">
                      {s.imageUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={s.imageUrl} alt={s.title} className="w-7 object-cover rounded-md flex-shrink-0" style={{ height: "36px" }} />
                      )}
                      <span className="text-sm font-medium max-w-[140px] truncate">{s.title}</span>
                      <span className="text-xs text-violet-300 font-bold ml-1">★ {s.score}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={startListQuiz}
              disabled={recLoading}
              className="w-full py-3 rounded-xl font-semibold text-sm transition-all duration-200
                bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500
                shadow-lg shadow-violet-500/20 hover:shadow-violet-500/40
                disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]"
            >
              {recLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Loading your list…
                </span>
              ) : recs.length > 0 ? "Try a different mood →" : "Start →"}
            </button>
          </div>
        )}

        {/* ── QUIZ — shown for both modes when opened ─────────────────── */}
        {quizOpen && mode === "mylist" && seeds.length > 0 && (
          <RecommendQuiz
            picks={seeds.map((s) => ({ id: s.id, title: s.title, imageUrl: s.imageUrl }))}
            onComplete={(q) => handleListRecommend(q)}
            onCancel={() => setQuizOpen(false)}
            loading={recLoading}
          />
        )}
        {quizOpen && mode === "manual" && selected.length > 0 && (
          <RecommendQuiz
            picks={selected.map((s) => ({ id: s.id, title: s.title, imageUrl: s.imageUrl }))}
            onComplete={(q) => handleManualRecommend(q)}
            onCancel={() => setQuizOpen(false)}
            loading={recLoading}
          />
        )}

        {/* ── MANUAL MODE ─────────────────────────────────────────────── */}
        {mode === "manual" && !quizOpen && recs.length === 0 && (
          <div key="manual" className="liquid-appear">
            <div className="mb-8 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400">Your picks</h2>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300 font-mono">
                    {selected.length}/10
                  </span>
                </div>
                <button onClick={() => setSelected([])} disabled={selected.length === 0}
                  className="text-xs text-slate-500 hover:text-red-400 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                  Clear all
                </button>
              </div>

              {selected.length === 0 ? (
                <p className="text-slate-500 text-sm mb-4">Search and select up to 10 anime you enjoy.</p>
              ) : (
                <div className="flex flex-wrap gap-3 mb-4">
                  {selected.map((a) => (
                    <div key={a.id} className="flex items-center gap-2 bg-white/10 rounded-xl px-3 py-2 border border-white/10">
                      {a.imageUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={a.imageUrl} alt={a.title} className="w-7 object-cover rounded-md flex-shrink-0" style={{ height: "36px" }} />
                      )}
                      <span className="text-sm font-medium max-w-[160px] truncate">{a.title}</span>
                      <button onClick={() => removeFromSelected(a.id)}
                        className="text-slate-400 hover:text-red-400 transition-colors ml-1 text-xl leading-none">
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <button onClick={startManualQuiz} disabled={selected.length === 0 || recLoading}
                className="w-full py-3 rounded-xl font-semibold text-sm transition-all duration-200
                  bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500
                  shadow-lg shadow-violet-500/20 hover:shadow-violet-500/40
                  disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none active:scale-[0.98]">
                {selected.length === 0
                  ? "Pick at least one anime to continue"
                  : "Continue → 4 quick questions"}
              </button>
            </div>

            {/* Typeahead search — dropdown shows live results as you type */}
            <div ref={searchRef} className="relative mb-4">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => { if (results.length > 0) setShowDropdown(true); }}
                placeholder="Type to search: Naruto, Attack on Titan, Frieren…"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm
                  placeholder:text-slate-500 focus:outline-none focus:border-violet-500/60
                  focus:bg-white/10 transition-all duration-200"
              />
              {loading && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin block" />
                </span>
              )}

              {/* Dropdown */}
              {showDropdown && query.trim().length > 0 && results.length > 0 && (
                <div
                  className="absolute left-0 right-0 top-full mt-2 z-50 max-h-[420px] overflow-y-auto
                    rounded-xl border border-white/10 bg-[#13131f]/95 backdrop-blur-md
                    shadow-2xl shadow-black/50 liquid-appear
                    [scrollbar-width:thin] [scrollbar-color:rgba(124,58,237,0.4)_transparent]"
                >
                  {results.slice(0, 10).map((a, i) => {
                    const isSelected = selectedIds.has(a.id);
                    const atCap = !isSelected && selected.length >= 10;
                    return (
                      <button
                        key={`${searchKey}-${i}`}
                        type="button"
                        disabled={atCap}
                        onClick={() => {
                          if (isSelected) removeFromSelected(a.id);
                          else addToSelected(a);
                        }}
                        className={`w-full text-left flex gap-3 items-center px-3 py-2.5 border-b border-white/5 last:border-b-0
                          transition-all duration-150
                          ${atCap
                            ? "opacity-40 cursor-not-allowed"
                            : isSelected
                              ? "bg-violet-500/10 hover:bg-red-500/10"
                              : "hover:bg-violet-500/10"}`}
                      >
                        <div className="flex-shrink-0">
                          {a.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={a.imageUrl} alt={a.title}
                              className="w-10 rounded object-cover"
                              style={{ height: "56px" }} />
                          ) : (
                            <div className="w-10 rounded bg-white/10" style={{ height: "56px" }} />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-white truncate">{a.title}</div>
                          <div className="text-xs text-slate-500">
                            {a.year ?? "?"} · ⭐ {a.score ?? "?"}
                          </div>
                        </div>
                        <span className={`flex-shrink-0 text-xs font-semibold px-2.5 py-1 rounded-md
                          ${isSelected
                            ? "bg-violet-500/20 text-violet-300 border border-violet-500/40"
                            : atCap
                              ? "text-slate-500"
                              : "bg-white/10 text-slate-300 border border-white/10"}`}>
                          {isSelected ? "✓ Added" : atCap ? "Max" : "+ Add"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {error && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {error}
          </div>
        )}

        {recLoading && !quizOpen && <RecommendationsLoadingList />}

        {recs.length > 0 && !recLoading && (
          <section className="mt-2">
            {/* Toolbar — shown only in manual mode where picks editing makes sense.
                MAL List mode already has a "Try a different mood →" button in its own panel. */}
            {mode === "manual" && (
              <div className="liquid-appear mb-8 flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm px-5 py-4">
                <span className="text-xs uppercase tracking-widest text-slate-500">Based on</span>
                <div className="flex gap-2 flex-wrap flex-1 min-w-0">
                  {selected.map((a) => (
                    <span
                      key={a.id}
                      className="text-xs font-medium text-violet-200 bg-violet-500/15 border border-violet-500/30 rounded-full px-2.5 py-1 truncate max-w-[180px]"
                    >
                      {a.title}
                    </span>
                  ))}
                </div>
                <button
                  onClick={() => {
                    // Reopen the quiz with same picks; reusing answers is fine
                    setRecs([]);
                    setThinking("");
                    setQuizOpen(true);
                  }}
                  className="text-xs font-semibold text-violet-300 hover:text-white border border-violet-500/40
                    hover:border-violet-400 rounded-full px-3 py-1.5 transition-all duration-200"
                >
                  Try a different mood →
                </button>
                <button
                  onClick={() => {
                    // Clear recs so the picks panel + search come back
                    setRecs([]);
                    setThinking("");
                  }}
                  className="text-xs text-slate-400 hover:text-white transition-colors"
                >
                  Edit picks
                </button>
              </div>
            )}

            <div className="flex items-center gap-4 mb-6">
              <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
              <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400">Recommendations</h2>
              <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
            </div>

            {thinking && (
              <details className="mb-6 rounded-2xl border border-violet-500/20 bg-violet-500/5 backdrop-blur-sm overflow-hidden card-appear">
                <summary className="cursor-pointer select-none px-5 py-4 flex items-center gap-3 hover:bg-violet-500/10 transition-colors duration-200">
                  <span className="text-sm font-semibold text-violet-200">How Animer thought about your taste</span>
                  <span className="ml-auto text-xs text-violet-400/60">click to expand</span>
                </summary>
                <div className="px-5 pb-5 pt-0">
                  <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-line">{thinking}</p>
                </div>
              </details>
            )}

            <div className="grid gap-4">
              {recs.map((r, i) => {
                const expanded = expandedRecIds.has(r.id);

                return (
                  <div key={r.id}
                    className={`card-appear rounded-2xl border bg-white/5 p-4
                      transition-all duration-300 cursor-pointer
                      ${expanded
                        ? "border-violet-500/40 bg-violet-500/[0.04] shadow-lg shadow-violet-500/10"
                        : "border-white/10 hover:border-white/20 hover:bg-white/8 hover:shadow-lg hover:shadow-black/30 hover:-translate-y-0.5"}`}
                    style={{ animationDelay: `${i * 80}ms` }}
                    onClick={() => toggleExpand(r.id)}
                  >
                    {/* Compact row — always visible */}
                    <div className="flex gap-4">
                      <div className="flex-shrink-0 flex flex-col items-center gap-1.5">
                        <span className="text-xs font-mono text-slate-600">#{i + 1}</span>
                        {r.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={r.imageUrl} alt={r.title}
                            className={`object-cover rounded-lg transition-all duration-300 ${expanded ? "w-44 shadow-xl shadow-black/40" : "w-16"}`}
                            style={{ height: expanded ? "240px" : "88px" }} />
                        ) : (
                          <div className={`rounded-lg bg-white/10 transition-all duration-300 ${expanded ? "w-44" : "w-16"}`}
                            style={{ height: expanded ? "240px" : "88px" }} />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2 mb-1 flex-wrap">
                          {r.malId != null ? (
                            <a
                              href={`https://myanimelist.net/anime/${r.malId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="font-semibold text-white hover:text-violet-300 hover:underline underline-offset-2 transition-colors"
                            >
                              {r.title}
                            </a>
                          ) : (
                            <h3 className="font-semibold text-white">{r.title}</h3>
                          )}
                          <span className="text-xs text-slate-500">
                            {r.year ?? "?"} · ⭐ {r.score != null ? `${r.score}%` : "?"}
                          </span>
                          {r.genres.slice(0, 3).map((g) => (
                            <span key={g} className="text-[10px] uppercase tracking-wide text-slate-500 bg-white/5 border border-white/10 rounded px-1.5 py-0.5">
                              {g}
                            </span>
                          ))}
                        </div>
                        <p className={`text-sm text-slate-400 leading-relaxed ${expanded ? "" : "line-clamp-2"}`}>
                          {r.reason}
                        </p>

                        {/* Expand affordance arrow */}
                        <div className="flex items-center gap-2 mt-2">
                          <span className="text-xs text-slate-500">
                            {expanded ? "Hide details" : "Show details"}
                          </span>
                          <span
                            className={`text-violet-400/70 text-xs transition-transform duration-300 ${expanded ? "rotate-180" : ""}`}
                          >
                            ▾
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Expanded section */}
                    {expanded && (
                      <div className="liquid-appear mt-5 pt-5 border-t border-white/10 space-y-5">
                        {r.synopsis && (
                          <div>
                            <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-2">Synopsis</p>
                            <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-line">
                              {r.synopsis}
                            </p>
                          </div>
                        )}

                        {r.malId != null && (
                          <a
                            href={`https://myanimelist.net/anime/${r.malId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-2 text-sm font-bold text-white
                              bg-gradient-to-r from-violet-600 to-purple-600
                              hover:from-violet-500 hover:to-purple-500
                              shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40
                              rounded-xl px-5 py-3 transition-all duration-200 active:scale-[0.98]"
                          >
                            View on MyAnimeList ↗
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

      </main>
    </div>
  );
}
