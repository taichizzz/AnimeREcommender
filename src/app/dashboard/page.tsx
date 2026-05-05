"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

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
  list_status: {
    score: number;
    status: string;
  };
};

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4">
      <p className="text-xs uppercase tracking-widest text-slate-500 mb-1">{label}</p>
      <p className="text-2xl font-bold text-white">{value}</p>
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 9
      ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
      : score >= 7
      ? "bg-violet-500/20 text-violet-300 border-violet-500/30"
      : score >= 5
      ? "bg-yellow-500/20 text-yellow-300 border-yellow-500/30"
      : "bg-slate-500/20 text-slate-400 border-slate-500/30";

  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded-md border ${color}`}>
      {score > 0 ? score : "—"}
    </span>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<MALUser | null>(null);
  const [anime, setAnime] = useState<AnimeEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [meRes, listRes] = await Promise.all([
        fetch("/api/auth/me"),
        fetch("/api/mal/animelist"),
      ]);

      if (meRes.status === 401) {
        router.replace("/");
        return;
      }

      const meData = await meRes.json();
      const listData = listRes.ok ? await listRes.json() : { anime: [] };

      setUser(meData.user);
      setAnime(listData.anime ?? []);
      setLoading(false);
    }

    load();
  }, [router]);

  async function handleRecommendFromList() {
    // Use top 3 highest-scored anime as seeds
    const topIds = anime
      .filter((e) => e.list_status.score >= 8)
      .slice(0, 3)
      .map((e) => e.node.id);

    if (topIds.length === 0) return;

    const params = new URLSearchParams({ ids: topIds.join(",") });
    router.push(`/?recommend=${params}`);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a14] flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-violet-500/20 border-t-violet-500 rounded-full animate-spin" />
      </div>
    );
  }

  const stats = user?.anime_statistics;

  return (
    <div className="min-h-screen bg-[#0a0a14] text-white">
      {/* Ambient glows */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 left-1/3 w-[600px] h-[600px] bg-violet-700/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-purple-700/8 rounded-full blur-3xl" />
      </div>

      <main className="relative z-10 max-w-5xl mx-auto px-6 py-12">
        {/* Nav */}
        <div className="flex items-center justify-between mb-10">
          <Link
            href="/"
            className="text-xl font-black bg-gradient-to-r from-violet-400 to-purple-400 bg-clip-text text-transparent"
          >
            Animer
          </Link>
          <a
            href="/api/auth/logout"
            className="text-sm text-slate-400 hover:text-red-400 transition-colors"
          >
            Log out
          </a>
        </div>

        {/* Profile */}
        <div className="flex items-center gap-5 mb-10">
          {user?.picture ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.picture}
              alt={user.name}
              className="w-20 h-20 rounded-full border-2 border-violet-500/40 object-cover"
            />
          ) : (
            <div className="w-20 h-20 rounded-full bg-violet-500/20 border-2 border-violet-500/40 flex items-center justify-center text-2xl font-bold text-violet-300">
              {user?.name?.[0]?.toUpperCase()}
            </div>
          )}
          <div>
            <h1 className="text-3xl font-black">{user?.name}</h1>
            <p className="text-slate-400 text-sm mt-0.5">MyAnimeList account</p>
          </div>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-10">
            <StatCard label="Completed" value={stats.num_items_completed} />
            <StatCard label="Mean Score" value={stats.mean_score.toFixed(2)} />
            <StatCard label="Days Watched" value={Math.round(stats.num_days_watched)} />
            <StatCard label="Episodes" value={stats.num_episodes.toLocaleString()} />
          </div>
        )}

        {/* Recommend from list */}
        <div className="rounded-2xl border border-violet-500/20 bg-violet-500/5 p-5 mb-10 flex items-center justify-between gap-4">
          <div>
            <h2 className="font-semibold text-white">Get recommendations from your list</h2>
            <p className="text-sm text-slate-400 mt-0.5">
              Uses your top-rated completed anime as seeds.
            </p>
          </div>
          <button
            onClick={handleRecommendFromList}
            className="flex-shrink-0 px-5 py-2.5 rounded-xl font-semibold text-sm
              bg-gradient-to-r from-violet-600 to-purple-600
              hover:from-violet-500 hover:to-purple-500
              shadow-lg shadow-violet-500/20 hover:shadow-violet-500/40
              transition-all duration-200 active:scale-[0.97]"
          >
            Recommend →
          </button>
        </div>

        {/* Anime list */}
        <div className="mb-6 flex items-center gap-4">
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
          <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400">
            Completed ({anime.length})
          </h2>
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {anime.map((entry, i) => (
            <div
              key={entry.node.id}
              className="card-appear group rounded-2xl border border-white/10 bg-white/5
                overflow-hidden transition-all duration-200
                hover:-translate-y-1 hover:border-white/20 hover:shadow-lg hover:shadow-black/40"
              style={{ animationDelay: `${i * 30}ms` }}
            >
              {entry.node.main_picture ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={entry.node.main_picture.medium}
                  alt={entry.node.title}
                  className="w-full object-cover"
                  style={{ height: "160px" }}
                />
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
      </main>
    </div>
  );
}
