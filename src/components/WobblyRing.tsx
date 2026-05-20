"use client";

import { useEffect, useRef } from "react";

/**
 * A hand-drawn-looking ring that wobbles continuously and stretches toward
 * the cursor when you hover near it. Wraps any child element.
 *
 * Usage:
 *   <WobblyRing>
 *     <button>Get Started</button>
 *   </WobblyRing>
 */
export function WobblyRing({
  children,
  className = "",
  strokeColor = "currentColor",
  strokeWidth = 1.5,
  wobbleAmp = 7,
  cursorReach = 240,         // pixels — how far the cursor influences the ring
  cursorPull = 16,           // how much the cursor distorts (in px) at max
  shape = "auto",            // "circle" forces equal rx/ry so the ring is round
  padX: propPadX,
  padY: propPadY,
}: {
  children: React.ReactNode;
  className?: string;
  strokeColor?: string;
  strokeWidth?: number;
  wobbleAmp?: number;
  cursorReach?: number;
  cursorPull?: number;
  shape?: "auto" | "circle";
  padX?: number;
  padY?: number;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const mouseRef = useRef({ x: 0, y: 0, active: false });

  useEffect(() => {
    let raf = 0;
    const POINTS = 12;

    // Random phases & frequencies — each point oscillates independently so the
    // ring never looks symmetric.
    const phases = Array.from({ length: POINTS }, () => Math.random() * Math.PI * 2);
    const freqs  = Array.from({ length: POINTS }, () => 0.4 + Math.random() * 0.4);

    // Mouse position relative to viewport (we'll translate to ring-center per frame).
    function onMouseMove(e: MouseEvent) {
      mouseRef.current.x = e.clientX;
      mouseRef.current.y = e.clientY;
      mouseRef.current.active = true;
    }
    function onLeave() {
      mouseRef.current.active = false;
    }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseleave", onLeave);

    function update(t: number) {
      const wrap = wrapRef.current;
      const path = pathRef.current;
      if (!wrap || !path) {
        raf = requestAnimationFrame(update);
        return;
      }

      const rect = wrap.getBoundingClientRect();
      // ring center in viewport coords
      const cx = rect.width / 2;
      const cy = rect.height / 2;

      // base ellipse radii — inset so the ring sits around (not over) the child
      const padX = propPadX ?? 22, padY = propPadY ?? 14;
      let rx = rect.width / 2 + padX;
      let ry = rect.height / 2 + padY;
      // shape="circle" → force equal radii using the larger of the two,
      // producing a near-perfect round ring even around wide text.
      if (shape === "circle") {
        const r = Math.max(rx, ry);
        rx = ry = r;
      }

      const ts = t / 1000;

      // mouse position relative to the wrap's center
      const mx = mouseRef.current.x - (rect.left + cx);
      const my = mouseRef.current.y - (rect.top  + cy);
      const mouseDist = Math.hypot(mx, my);
      const mouseAngle = Math.atan2(my, mx);
      const cursorActive = mouseRef.current.active && mouseDist < cursorReach;
      const cursorFalloff = cursorActive ? (1 - mouseDist / cursorReach) : 0;

      // Build points along the ellipse with per-point sine wobble + cursor pull.
      const pts: [number, number][] = [];
      for (let i = 0; i < POINTS; i++) {
        const ang = (i / POINTS) * Math.PI * 2;

        const wobble = Math.sin(ts * freqs[i] + phases[i]) * wobbleAmp;

        // Smooth attraction toward cursor angle — peaks for the point facing
        // the cursor, falls off cosine-style around the circle.
        let pull = 0;
        if (cursorActive) {
          const dot = Math.cos(ang - mouseAngle);
          pull = Math.max(0, dot) * cursorPull * cursorFalloff;
        }

        const radialOffset = wobble + pull;
        const x = cx + Math.cos(ang) * (rx + radialOffset);
        const y = cy + Math.sin(ang) * (ry + radialOffset);
        pts.push([x, y]);
      }

      path.setAttribute("d", smoothClosedPath(pts));
      raf = requestAnimationFrame(update);
    }

    raf = requestAnimationFrame(update);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseleave", onLeave);
    };
  }, [wobbleAmp, cursorReach, cursorPull, shape, propPadX, propPadY]);

  return (
    <div ref={wrapRef} className={`relative inline-block ${className}`}>
      <svg
        className="absolute pointer-events-none"
        // Overflow the wrap so the ring (which lives outside the child's box)
        // is fully visible without clipping.
        style={{ inset: "-40px", width: "calc(100% + 80px)", height: "calc(100% + 80px)" }}
        preserveAspectRatio="none"
        overflow="visible"
      >
        <path
          ref={pathRef}
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
          strokeLinecap="round"
          transform="translate(40 40)"
          opacity={0.75}
        />
      </svg>
      {children}
    </div>
  );
}

/**
 * Convert a sequence of points into a smooth closed Bezier curve via the
 * Catmull-Rom → Cubic-Bezier conversion. Produces an organic, looped shape
 * (no straight edges between points).
 */
function smoothClosedPath(pts: [number, number][]): string {
  if (pts.length === 0) return "";
  const n = pts.length;
  let d = `M ${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`;

  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];

    const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
    const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
    const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
    const cp2y = p2[1] - (p3[1] - p1[1]) / 6;

    d += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)} ${cp2x.toFixed(2)} ${cp2y.toFixed(2)} ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
  }
  return d + " Z";
}
