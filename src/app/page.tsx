"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { WobblyRing } from "@/components/WobblyRing";

export default function LandingPage() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setIsLoggedIn(!!d.user))
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-[#0a0a14] text-white">
      {/* Ambient glows */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 left-1/3 w-[600px] h-[600px] bg-violet-700/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 -right-40 w-[400px] h-[400px] bg-purple-700/8 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-indigo-800/8 rounded-full blur-3xl" />
      </div>

      <main className="relative z-10 max-w-4xl mx-auto px-6 py-12 min-h-screen flex flex-col">

        {/* Top nav */}
        <div className="flex items-center justify-between mb-12">
          <h1 className="text-4xl font-black tracking-tight bg-gradient-to-r from-violet-400 via-purple-300 to-pink-400 bg-clip-text text-transparent pb-1">
            Animer
          </h1>

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

        {/* Hero — vertically centered in the remaining space */}
        <div className="flex-1 flex flex-col justify-center liquid-appear">

          <p className="text-xs uppercase tracking-[0.3em] text-violet-300/70 mb-4">
            A taste-aware anime recommender
          </p>

          <h2 className="text-5xl md:text-6xl font-black leading-[1.05] mb-6 tracking-tight">
            Find anime{" "}
            <span className="bg-gradient-to-r from-violet-300 via-purple-200 to-pink-300 bg-clip-text text-transparent">
              you&apos;ll actually love
            </span>
          </h2>

          <p className="text-slate-400 text-lg md:text-xl mb-10 max-w-2xl leading-relaxed">
            Not a popularity ranker. Animer learns from how 233,000 real viewers co-rate things,
            then runs your picks through a language model that explains every match in your terms.
          </p>

          {/* 3-step rail */}
          <ol className="grid gap-4 md:grid-cols-3 mb-12">
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

          {/* CTA — centered. Ring is the clickable target. */}
          <div className="flex flex-col items-center gap-8 text-center mt-4 mb-8">
            <Link
              href="/recommend"
              aria-label="Get Started"
              className="relative inline-flex items-center justify-center cursor-pointer group"
            >
              {/* Invisible hit-area so the whole ring interior is clickable */}
              <span className="absolute inset-[-18px] z-0 rounded-full" aria-hidden="true" />
              <WobblyRing
                className="relative z-10"
                shape="auto"
                strokeColor="rgb(196, 181, 253)"
                strokeWidth={1.5}
                wobbleAmp={3}
                cursorReach={180}
                cursorPull={12}
                padX={14}
                padY={10}
              >
                <span
                  className="block px-10 py-4 text-base font-bold tracking-wide text-white
                    rounded-full transition-colors duration-200 group-hover:text-violet-200"
                >
                  Get Started →
                </span>
              </WobblyRing>
            </Link>

            {!isLoggedIn && (
              <p className="text-sm text-slate-500">
                or{" "}
                <a href="/api/auth/login" className="text-violet-300 hover:text-violet-200 underline underline-offset-2">
                  log in with MAL
                </a>{" "}
                for personalization from your full rating history
              </p>
            )}
          </div>

          {/* Differentiators */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-xs text-slate-500 mt-12 pt-8 border-t border-white/5">
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

      </main>
    </div>
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
