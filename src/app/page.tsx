"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function LandingPage() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setIsLoggedIn(!!d.user))
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-ink text-paper">
      <main className="max-w-4xl mx-auto px-6 py-12 min-h-screen flex flex-col">

        {/* Top nav */}
        <div className="flex items-center justify-between mb-12">
          <h1 className="text-2xl font-bold tracking-[0.22em]">
            ANIMER<span className="text-accent">.</span>
          </h1>

          {isLoggedIn ? (
            <Link href="/dashboard"
              className="px-4 py-2 rounded-md text-sm font-medium text-paper
                border border-line-2 hover:bg-ink-2 transition-colors duration-200">
              My dashboard
            </Link>
          ) : (
            <a href="/api/auth/login"
              className="px-4 py-2 rounded-md text-sm font-medium text-paper
                border border-line-2 hover:bg-ink-2 transition-colors duration-200">
              Login with MAL
            </a>
          )}
        </div>

        {/* Hero — vertically centered in the remaining space */}
        <div className="flex-1 flex flex-col justify-center liquid-appear">

          <p className="text-xs uppercase tracking-[0.3em] text-accent font-mono mb-5">
            A taste-aware recommender
          </p>

          <h2 className="text-5xl md:text-6xl font-extrabold leading-[1.05] mb-6 tracking-tight">
            Find anime you&rsquo;ll{" "}
            <span className="text-accent">actually love.</span>
          </h2>

          <p className="text-paper-2 text-lg md:text-xl mb-10 max-w-2xl leading-relaxed">
            Not a popularity ranker. Animer learns from how thousands of real viewers co-rate
            things, then runs your picks through a language model that explains every match in
            your terms.
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

          {/* CTA */}
          <div className="flex flex-col items-start gap-4 mb-10">
            <Link
              href="/recommend"
              className="inline-flex items-center gap-2 bg-accent text-accent-ink font-bold text-base
                px-7 py-3.5 rounded-md hover:brightness-110 transition-all duration-200 active:scale-[0.98]"
            >
              Get started <span aria-hidden="true">→</span>
            </Link>

            {!isLoggedIn && (
              <p className="text-sm text-paper-3">
                or{" "}
                <a href="/api/auth/login" className="text-accent hover:brightness-110 underline underline-offset-2">
                  log in with MAL
                </a>{" "}
                for personalization from your full rating history
              </p>
            )}
          </div>

          {/* Differentiators */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-xs text-paper-3 mt-8 pt-8 border-t border-line">
            <Diff text="Collaborative filtering on millions of ratings" />
            <Diff text="Synopsis-aware fallback for niche picks" />
            <Diff text="Filters watched, sequels, dislikes" />
            <Diff text="No popularity bias" />
          </div>
        </div>

      </main>
    </div>
  );
}

function Step({ number, title, body }: { number: number; title: string; body: string }) {
  return (
    <li className="rounded-lg border border-line bg-ink-2 p-5">
      <div className="flex items-baseline gap-3 mb-2">
        <span className="text-xl font-bold text-accent font-mono leading-none">
          {String(number).padStart(2, "0")}
        </span>
        <h3 className="font-semibold text-paper text-sm">{title}</h3>
      </div>
      <p className="text-sm text-paper-2 leading-relaxed">{body}</p>
    </li>
  );
}

function Diff({ text }: { text: string }) {
  return (
    <span className="flex items-center gap-2">
      <span className="w-1 h-1 rounded-full bg-accent" />
      {text}
    </span>
  );
}
