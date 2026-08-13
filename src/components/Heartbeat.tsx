"use client";

import { useSyncExternalStore } from "react";

const REDUCE_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void) {
  const mq = window.matchMedia(REDUCE_MOTION_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/** Tracks the OS "reduce motion" setting. Returns false during SSR. */
function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(REDUCE_MOTION_QUERY).matches,
    () => false
  );
}

/**
 * Heartbeat loader — an ECG trace sweeping across a monitor.
 *
 * Used instead of a spinner because it says something a spinner can't: while
 * you wait, the recommender is reading a pulse.
 *
 * The animation is native SVG (SMIL) rather than a CSS class, so the component
 * is self-contained: it needs nothing from globals.css and can't be broken by
 * stylesheet build/caching issues. Colour comes from currentColor.
 */
export function Heartbeat({
  className = "",
  label = "Loading",
}: {
  className?: string;
  label?: string;
}) {
  // Honour the OS "reduce motion" setting: draw a static trace instead.
  const reduceMotion = useReducedMotion();

  return (
    <span role="status" aria-label={label} className={`inline-block ${className}`}>
      <svg viewBox="0 0 64 32" className="w-16 h-8 overflow-visible" fill="none" aria-hidden="true">
        <polyline
          points="0,16 16,16 24,4 32,28 40,16 64,16"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          strokeDasharray="100"
          strokeDashoffset={reduceMotion ? 0 : 100}
        >
          {!reduceMotion && (
            <animate
              attributeName="stroke-dashoffset"
              from="100"
              to="-100"
              dur="2s"
              repeatCount="indefinite"
            />
          )}
        </polyline>
      </svg>
    </span>
  );
}

/** Heartbeat with a caption beneath, for full-panel waits. */
export function HeartbeatWithLabel({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-10">
      <Heartbeat className="text-accent" label={text} />
      <p className="text-sm text-paper-2">{text}</p>
    </div>
  );
}
