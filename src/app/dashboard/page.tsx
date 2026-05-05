"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Label, Sector,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";

// ─── Types ───────────────────────────────────────────────────────────────────

type AnimeStats = {
  num_items_watching: number;
  num_items_completed: number;
  num_items_on_hold: number;
  num_items_dropped: number;
  num_items_plan_to_watch: number;
  num_days_watched: number;
  num_episodes: number;
  mean_score: number;
};

type MALUser = {
  id: number;
  name: string;
  picture?: string;
  anime_statistics?: AnimeStats;
};

type AnimeEntry = {
  node: {
    id: number;
    title: string;
    main_picture?: { medium: string; large: string };
    mean?: number;
    num_episodes?: number;
    genres?: { id: number; name: string }[];
  };
  list_status: { score: number; status: string };
};

// ─── Colors ──────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  Completed:      "#8b5cf6",
  "Plan to Watch": "#06b6d4",
  Watching:       "#f472b6",
  Dropped:        "#f87171",
  "On Hold":      "#f59e0b",
};

function scoreColor(score: number): string {
  if (score >= 9) return "#10b981";
  if (score >= 7) return "#8b5cf6";
  if (score >= 5) return "#6366f1";
  return "#475569";
}

// ─── Donut active shape (pop-out + glow on hover) ────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ActiveDonutSlice(props: any) {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;
  const id = `glow-${fill.replace("#", "")}`;
  return (
    <g className="donut-active-slice">
      <defs>
        <filter id={id} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="6" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {/* Outer glow halo */}
      <Sector cx={cx} cy={cy} innerRadius={outerRadius + 2} outerRadius={outerRadius + 16}
        startAngle={startAngle} endAngle={endAngle} fill={fill} opacity={0.25} />
      {/* Main popped sector */}
      <Sector cx={cx} cy={cy} innerRadius={innerRadius - 2} outerRadius={outerRadius + 9}
        startAngle={startAngle} endAngle={endAngle} fill={fill} filter={`url(#${id})`} />
    </g>
  );
}

// ─── Tooltip components ───────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function DonutTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#13131f] border border-white/10 rounded-xl px-3 py-2 text-sm shadow-xl">
      <p className="font-semibold text-white">{payload[0].name}</p>
      <p className="text-slate-400">{payload[0].value} anime</p>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function BarTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#13131f] border border-white/10 rounded-xl px-3 py-2 text-sm shadow-xl">
      <p className="font-semibold text-white">Score {label}</p>
      <p className="text-slate-400">{payload[0].value} anime</p>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4">
      <p className="text-xs uppercase tracking-widest text-slate-500 mb-1">{label}</p>
      <p className="text-2xl font-bold text-white">{value}</p>
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const cls =
    score >= 9 ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
    : score >= 7 ? "bg-violet-500/20 text-violet-300 border-violet-500/30"
    : score >= 5 ? "bg-yellow-500/20 text-yellow-300 border-yellow-500/30"
    : "bg-slate-500/20 text-slate-400 border-slate-500/30";
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded-md border ${cls}`}>
      {score > 0 ? score : "—"}
    </span>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser]   = useState<MALUser | null>(null);
  const [anime, setAnime] = useState<AnimeEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [meRes, listRes] = await Promise.all([
        fetch("/api/auth/me"),
        fetch("/api/mal/animelist"),
      ]);
      if (meRes.status === 401) { router.replace("/"); return; }
      const meData   = await meRes.json();
      const listData = listRes.ok ? await listRes.json() : { anime: [] };
      setUser(meData.user);
      setAnime(listData.anime ?? []);
      setLoading(false);
    }
    load();
  }, [router]);

  const stats = user?.anime_statistics;
  const PAGE_SIZE = 50;
  const [page, setPage] = useState(0);
  const [transitioning, setTransitioning] = useState(false);

  function goToPage(n: number) {
    setTransitioning(true);
    setTimeout(() => {
      setPage(n);
      setTransitioning(false);
    }, 180);
  }

  // Donut data — list status breakdown
  const statusData = useMemo(() => {
    if (!stats) return [];
    return [
      { name: "Completed",      value: stats.num_items_completed },
      { name: "Plan to Watch",  value: stats.num_items_plan_to_watch },
      { name: "Watching",       value: stats.num_items_watching },
      { name: "Dropped",        value: stats.num_items_dropped },
      { name: "On Hold",        value: stats.num_items_on_hold },
    ].filter((d) => d.value > 0);
  }, [stats]);

  const statusTotal = useMemo(
    () => statusData.reduce((s, d) => s + d.value, 0),
    [statusData]
  );

  // Bar chart data — score distribution from anime list
  const scoreData = useMemo(() => {
    const counts = new Map<number, number>();
    for (let i = 1; i <= 10; i++) counts.set(i, 0);
    for (const e of anime) {
      const s = e.list_status.score;
      if (s > 0) counts.set(s, (counts.get(s) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([score, count]) => ({ score, count }))
      .reverse();
  }, [anime]);

  // Genre bars
  const genreData = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of anime) {
      for (const g of e.node.genres ?? []) {
        counts.set(g.name, (counts.get(g.name) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, count]) => ({ name, count }));
  }, [anime]);

  const totalPages = Math.ceil(anime.length / PAGE_SIZE);
  const pagedAnime = anime.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  async function handleRecommendFromList() {
    const topIds = anime
      .filter((e) => e.list_status.score >= 8)
      .slice(0, 3)
      .map((e) => e.node.id);
    if (topIds.length === 0) return;
    router.push(`/?recommend=${topIds.join(",")}`);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a14] flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-violet-500/20 border-t-violet-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a14] text-white">
      {/* Ambient glows */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 left-1/3 w-[600px] h-[600px] bg-violet-700/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-cyan-700/8 rounded-full blur-3xl" />
      </div>

      <main className="relative z-10 max-w-5xl mx-auto px-6 py-12">

        {/* Nav */}
        <div className="flex items-center justify-between mb-10">
          <Link href="/" className="text-xl font-black bg-gradient-to-r from-violet-400 to-purple-400 bg-clip-text text-transparent">
            Animer
          </Link>
          <a href="/api/auth/logout" className="text-sm text-slate-400 hover:text-red-400 transition-colors">
            Log out
          </a>
        </div>

        {/* Profile */}
        <div className="flex items-center gap-5 mb-10">
          {user?.picture ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.picture} alt={user.name}
              className="w-20 h-20 rounded-full border-2 border-violet-500/40 object-cover" />
          ) : (
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-violet-600 to-purple-600 border-2 border-violet-500/40 flex items-center justify-center text-2xl font-black text-white">
              {user?.name?.[0]?.toUpperCase()}
            </div>
          )}
          <div>
            <h1 className="text-3xl font-black">{user?.name}</h1>
            <p className="text-slate-400 text-sm mt-0.5">MyAnimeList account</p>
          </div>
        </div>

        {/* Stat cards */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
            <StatCard label="Completed"    value={stats.num_items_completed} />
            <StatCard label="Mean Score"   value={stats.mean_score.toFixed(2)} />
            <StatCard label="Days Watched" value={Math.round(stats.num_days_watched)} />
            <StatCard label="Episodes"     value={stats.num_episodes.toLocaleString()} />
          </div>
        )}

        {/* Charts row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">

          {/* Donut — list status */}
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <p className="text-xs uppercase tracking-widest text-slate-500 mb-4">List Status</p>
            <div className="flex items-center gap-6">
              <div style={{ width: 180, height: 180, overflow: "visible" }} className="flex-shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
                    <Pie data={statusData} dataKey="value" innerRadius={48} outerRadius={72} paddingAngle={2} startAngle={90} endAngle={-270} activeShape={ActiveDonutSlice}>
                      {statusData.map((entry) => (
                        <Cell key={entry.name} fill={STATUS_COLORS[entry.name] ?? "#8b5cf6"} stroke="transparent" />
                      ))}
                      <Label content={({ viewBox }) => {
                        const vb = viewBox as { cx: number; cy: number };
                        return (
                          <text x={vb.cx} y={vb.cy} textAnchor="middle" dominantBaseline="central">
                            <tspan x={vb.cx} dy="-0.4em" fontSize="20" fontWeight="800" fill="white">{statusTotal}</tspan>
                            <tspan x={vb.cx} dy="1.4em" fontSize="10" fill="#475569">total</tspan>
                          </text>
                        );
                      }} position="center" />
                    </Pie>
                    <Tooltip content={<DonutTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-col gap-2.5 flex-1">
                {statusData.map((d) => (
                  <div key={d.name} className="flex items-center gap-2 text-sm">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: STATUS_COLORS[d.name] }} />
                    <span className="text-slate-400 flex-1">{d.name}</span>
                    <span className="font-bold text-white">{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Bar chart — score distribution */}
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <p className="text-xs uppercase tracking-widest text-slate-500 mb-4">Score Distribution</p>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={scoreData} layout="vertical" margin={{ left: 0, right: 16, top: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(255,255,255,0.05)" />
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="score" tick={{ fill: "#64748b", fontSize: 12 }} axisLine={false} tickLine={false} width={24} />
                <Tooltip content={<BarTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                <Bar dataKey="count" radius={[0, 6, 6, 0]} maxBarSize={18}>
                  {scoreData.map((entry) => (
                    <Cell key={entry.score} fill={scoreColor(entry.score)} fillOpacity={0.85} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Genre bars */}
        {genreData.length > 0 && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 mb-6">
            <p className="text-xs uppercase tracking-widest text-slate-500 mb-5">Top Genres</p>
            <ResponsiveContainer width="100%" height={genreData.length * 36}>
              <BarChart data={genreData} layout="vertical" margin={{ left: 0, right: 40, top: 0, bottom: 0 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" tick={{ fill: "#94a3b8", fontSize: 13 }} axisLine={false} tickLine={false} width={90} />
                <Tooltip content={<BarTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                <Bar dataKey="count" radius={[0, 8, 8, 0]} maxBarSize={14}
                  label={{ position: "right", fill: "#475569", fontSize: 12 }}>
                  {genreData.map((_, i) => (
                    <Cell key={i} fill={i < 3 ? "#8b5cf6" : i < 6 ? "#6366f1" : "#475569"} fillOpacity={0.8} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Recommend banner */}
        <div className="rounded-2xl border border-violet-500/20 bg-violet-500/5 p-5 mb-10 flex items-center justify-between gap-4">
          <div>
            <h2 className="font-semibold text-white">Get recommendations from your list</h2>
            <p className="text-sm text-slate-400 mt-0.5">Uses your top-rated completed anime as seeds.</p>
          </div>
          <button onClick={handleRecommendFromList}
            className="flex-shrink-0 px-5 py-2.5 rounded-xl font-semibold text-sm
              bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500
              shadow-lg shadow-violet-500/20 hover:shadow-violet-500/40
              transition-all duration-200 active:scale-[0.97]">
            Recommend →
          </button>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-4 mb-6">
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
          <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400">
            Completed ({anime.length})
          </h2>
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        </div>

        {/* Anime grid */}
        <div key={page} className={`grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4 mb-8 ${transitioning ? "grid-exit" : ""}`}>
          {pagedAnime.map((entry, i) => (
            <div key={entry.node.id}
              className="card-appear group rounded-2xl border border-white/10 bg-white/5
                overflow-hidden transition-all duration-200
                hover:-translate-y-1 hover:border-white/20 hover:shadow-lg hover:shadow-black/40"
              style={{ animationDelay: `${i * 25}ms` }}>
              {entry.node.main_picture ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={entry.node.main_picture.medium} alt={entry.node.title}
                  className="w-full object-cover" style={{ height: "160px" }} />
              ) : (
                <div className="w-full bg-white/10" style={{ height: "160px" }} />
              )}
              <div className="p-3">
                <p className="text-xs font-semibold text-white line-clamp-2 leading-snug mb-2">
                  {entry.node.title}
                </p>
                <ScoreBadge score={entry.list_status.score} />
              </div>
            </div>
          ))}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 pb-12">
            <button
              onClick={() => goToPage(page - 1)}
              disabled={page === 0 || transitioning}
              className="px-4 py-2 rounded-xl text-sm font-semibold bg-white/5 border border-white/10
                hover:bg-white/10 hover:border-white/20 transition-all duration-200
                disabled:opacity-30 disabled:cursor-not-allowed"
            >
              ← Prev
            </button>

            <div className="flex items-center gap-1">
              {Array.from({ length: totalPages }, (_, i) => (
                <button
                  key={i}
                  onClick={() => goToPage(i)}
                  className={`w-8 h-8 rounded-lg text-xs font-bold transition-all duration-200
                    ${i === page
                      ? "bg-violet-600 text-white shadow-lg shadow-violet-500/30"
                      : "bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white border border-white/10"
                    }`}
                >
                  {i + 1}
                </button>
              ))}
            </div>

            <button
              onClick={() => goToPage(page + 1)}
              disabled={page === totalPages - 1 || transitioning}
              className="px-4 py-2 rounded-xl text-sm font-semibold bg-white/5 border border-white/10
                hover:bg-white/10 hover:border-white/20 transition-all duration-200
                disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Next →
            </button>
          </div>
        )}

      </main>
    </div>
  );
}
