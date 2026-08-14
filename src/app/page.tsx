"use client";

import Link from "next/link";
import { Footer } from "@/components/Footer";
import { useIsLoggedIn } from "@/components/AuthProvider";

export default function LandingPage() {
  const isLoggedIn = useIsLoggedIn();

  return (
    <div className="min-h-screen bg-ink text-paper">
      <main className="max-w-4xl mx-auto px-6 py-12">

        {/* Top nav */}
        <div className="flex items-center justify-between mb-12">
          <h1 className="text-2xl font-bold tracking-[0.22em]">
            ANIMER<span className="text-accent">.</span>
          </h1>

          <div className="flex items-center gap-5">
            <Link href="/about"
              className="text-sm font-medium text-paper-2 hover:text-paper transition-colors duration-200">
              About
            </Link>
            {isLoggedIn ? (
              <Link href="/dashboard"
                className="px-4 py-2 rounded-md text-sm font-medium text-paper
                  border border-line-2 hover:bg-ink-2 transition-colors duration-200">
                My Dashboard
              </Link>
            ) : (
              <a href="/api/auth/login"
                className="px-4 py-2 rounded-md text-sm font-medium text-paper
                  border border-line-2 hover:bg-ink-2 transition-colors duration-200">
                Login with MAL
              </a>
            )}
          </div>
        </div>

        {/* Hero */}
        <div className="liquid-appear">

          <p className="text-xs uppercase tracking-[0.3em] text-accent font-mono mb-5">
            A taste-aware recommender
          </p>

          <h2 className="text-3xl md:text-5xl font-extrabold leading-[1.1] mb-6 tracking-tight whitespace-nowrap">
            Find anime you&rsquo;ll{" "}
            <span className="text-accent">actually love.</span>
          </h2>

          <p className="text-paper-2 text-lg md:text-xl mb-10 max-w-2xl leading-relaxed">
            Animer learns from how thousands of real viewers co-rate anime, then chooses the best matches for you.
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
              title="See matches"
              body="Each pick gets a reason explaining why it fits you."
            />
          </ol>

          {/* CTA */}
          <div className="flex flex-col items-start gap-4 mb-10">
            <Link
              href="/recommend"
              className="inline-flex items-center gap-2 bg-accent text-accent-ink font-bold text-base
                px-7 py-3.5 rounded-md hover:brightness-110 transition-all duration-200 active:scale-[0.98]"
            >
              Get started
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
        </div>

      </main>
      <Footer />
    </div>
  );
}

function Step({ number, title, body }: { number: number; title: string; body: string }) {
  return (
    <li className="glass glass-hover rounded-2xl border border-line bg-ink-2 p-5">
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
