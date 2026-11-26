"use client";

import Link from "next/link";
import { Footer } from "@/components/Footer";
import { useIsLoggedIn } from "@/components/AuthProvider";
import { LandingGraph } from "@/components/LandingGraph";
import type { LandingGraphNode } from "@/lib/landingGraph";

export function LandingHero({ nodes }: { nodes: LandingGraphNode[] }) {
  const isLoggedIn = useIsLoggedIn();

  return (
    <div className="min-h-screen bg-ink text-paper relative overflow-x-clip">
      {/* Subtle darkroom architectural grid hairlines */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.028)_1px,transparent_1px)] bg-[size:120px_100%]"
      />

      {/* Top nav with full-width hairline divider */}
      <header className="relative z-10 border-b border-line">
        <div className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
          <h1 className="text-xl sm:text-2xl font-bold tracking-[0.22em]">
            ANIMER<span className="text-accent">.</span>
          </h1>

          <nav className="flex items-center gap-5">
            <Link
              href="/seasonal"
              className="text-sm font-medium text-paper-2 hover:text-paper transition-colors duration-200"
            >
              Seasonal
            </Link>
            <Link
              href="/about"
              className="text-sm font-medium text-paper-2 hover:text-paper transition-colors duration-200"
            >
              About
            </Link>
            {isLoggedIn ? (
              <Link
                href="/dashboard"
                className="px-4 py-2 rounded-md text-sm font-medium text-paper
                  border border-line-2 hover:bg-ink-2 transition-colors duration-200"
              >
                My Dashboard
              </Link>
            ) : (
              <a
                href="/api/auth/login"
                className="px-4 py-2 rounded-md text-sm font-medium text-paper
                  border border-line-2 hover:bg-ink-2 transition-colors duration-200"
              >
                Login with MAL
              </a>
            )}
          </nav>
        </div>
      </header>

      {/* Asymmetric split hero + horizontal CRT knowledge graph */}
      <main className="relative z-10 max-w-6xl mx-auto px-6 pt-10 pb-6 lg:pt-14 lg:pb-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-6 items-center liquid-appear">
          <div className="lg:col-span-5">
            <h2 className="text-4xl sm:text-5xl lg:text-[3.35rem] font-extrabold leading-[1.06] tracking-tight mb-5">
              What anime 
              <br />
              do I watch next?
            </h2>

            <p className="text-paper-2 text-base sm:text-lg leading-relaxed max-w-md mb-8">
              Find your next watch from how thousands of viewers rate anime
              together.
            </p>

            <div className="flex flex-wrap items-center gap-3 mb-5">
              <Link
                href="/recommend"
                className="inline-flex items-center bg-accent text-accent-ink font-semibold text-sm sm:text-base
                  px-5 py-3 rounded-lg hover:brightness-110 transition-all duration-200 active:scale-[0.98]"
              >
                Find my next anime
              </Link>
            </div>

            {!isLoggedIn && (
              <p className="text-sm text-paper-3">
                <a
                  href="/api/auth/login"
                  className="hover:text-paper transition-colors duration-200"
                >
                  Import your MyAnimeList instead →
                </a>
              </p>
            )}
          </div>

          <div className="lg:col-span-7">
            <LandingGraph nodes={nodes} />
          </div>
        </div>
      </main>

      <Footer width="max-w-6xl" />
    </div>
  );
}
