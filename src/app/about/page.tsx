"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Footer } from "@/components/Footer";

export default function AboutPage() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setIsLoggedIn(!!d.user))
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-ink text-paper">
      <main className="max-w-3xl mx-auto px-6 py-12">

        {/* Top nav */}
        <div className="flex items-center justify-between mb-16">
          <Link href="/">
            <h1 className="text-2xl font-bold tracking-[0.22em]">
              ANIMER<span className="text-accent">.</span>
            </h1>
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

        <div className="liquid-appear">
          <p className="text-xs uppercase tracking-[0.3em] text-accent font-mono mb-5">
            About Animer
          </p>

          <h2 className="text-3xl md:text-4xl font-extrabold leading-[1.15] mb-6 tracking-tight">
            A recommender that is actually accurate.
          </h2>

          <p className="text-paper-2 text-lg leading-relaxed mb-16 max-w-2xl">
            Most anime recommendations are popularity charts with extra steps.
            They show you picks based on what genres you like, or what other people with similar taste have rated highly. 
            But they don&rsquo;t explain why each pick fits you. And most likely, most of the picks won&rsquo;t fit you at all.
            Animer is different. The recommendations are based on real data from both you and other anime fans, and each pick comes with a specific reason why it fits you.
          </p>
          {/* Three things that set it apart */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10 mb-20">
            <Feature
              title="Accuracy"
              body="Picks come from how real anime fans vote on things together, so you get what people like you loved."
              icon={
                <>
                  <circle cx="12" cy="12" r="9" />
                  <circle cx="12" cy="12" r="5" />
                  <circle cx="12" cy="12" r="1.5" />
                </>
              }
            />
            <Feature
              title="A reason for every pick"
              body="Each recommendation comes with a specific reason why it fits your taste, so you can see exactly what makes it a good match."
              icon={
                <>
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </>
              }
            />
            <Feature
              title="Learns and improves"
              body="Connect to your MyAnimeList and your whole rating history becomes the input. Low scores count too, steering picks away from what you disliked."
              icon={
                <>
                  <polyline points="3 17 9 11 13 15 21 7" />
                  <polyline points="15 7 21 7 21 13" />
                </>
              }
            />
          </div>

          {/* What it filters */}
          <Section title="What it filters out">
            <ul className="space-y-3">
              <Bullet text="Sequels, prequels and spin offs of anime you already named" />
              <Bullet text="Anything you flagged as a dislike" />
              <Bullet text="Shows already on your MAL list" />
              <Bullet text="Recaps, compilations and side stories" />
            </ul>
          </Section>

          <div className="pt-4">
            <Link
              href="/recommend"
              className="inline-flex items-center bg-accent text-accent-ink font-bold text-base
                px-7 py-3.5 rounded-md hover:brightness-110 transition-all duration-200 active:scale-[0.98]"
            >
              Try It Now
            </Link>
          </div>

          {/* Someone who has just read all this is the likeliest to want to reach out. */}
          <p className="mt-12 pb-4 text-sm text-paper-2">
            Questions, ideas or a bug to report?{" "}
            <a
              href="https://github.com/taichizzz"
              target="_blank"
              rel="noopener noreferrer"
              className="text-paper underline underline-offset-2 hover:text-paper-2 transition-colors"
            >
              Get in touch
            </a>
            .
          </p>
        </div>

      </main>
      <Footer width="max-w-3xl" />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-16">
      <h3 className="text-base uppercase tracking-[0.18em] font-semibold text-paper mb-6 pb-3 border-b border-line-2">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Bullet({ text }: { text: string }) {
  return (
    <li className="flex gap-3 text-paper-2 leading-relaxed">
      <span className="mt-2 w-1 h-1 rounded-full bg-accent flex-shrink-0" />
      <span>{text}</span>
    </li>
  );
}

function Feature({
  title,
  body,
  icon,
}: {
  title: string;
  body: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center text-center">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="44"
        height="44"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="text-accent mb-5"
      >
        {icon}
      </svg>
      <h4 className="font-semibold text-paper mb-2">{title}</h4>
      <p className="text-sm text-paper-2 leading-relaxed">{body}</p>
    </div>
  );
}
