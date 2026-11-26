"use client";

import { useState, useSyncExternalStore } from "react";
import { CRTScreen } from "@/components/CRTScreen";
import { SmartCropImage } from "@/components/SmartCropImage";
import type { LandingGraphNode } from "@/lib/landingGraph";
import { getPairConnectionReason } from "@/lib/landingGraphReasons";

const REDUCE_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void) {
  const mq = window.matchMedia(REDUCE_MOTION_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

type SlotGeometry = {
  cx: number;
  cy: number;
  widthPct: number;
};

// Stage dimensions in SVG user units (horizontal 4:3 CRT TVs arranged organically).
const STAGE_W = 660;
const STAGE_H = 540;

const HERO_SLOT: SlotGeometry = { cx: 325, cy: 272, widthPct: 37.5 };

const SATELLITE_SLOTS: SlotGeometry[] = [
  { cx: 96, cy: 86, widthPct: 20.5 }, // 1: Upper-left
  { cx: 446, cy: 66, widthPct: 20.5 }, // 2: High top-right
  { cx: 580, cy: 226, widthPct: 20.5 }, // 3: Far mid-right
  { cx: 538, cy: 432, widthPct: 20.5 }, // 4: Lower-right
  { cx: 294, cy: 476, widthPct: 20.5 }, // 5: Bottom-center-left
];

type WireSpec = {
  slot: number;
  d: string;
  start: [number, number];
  end: [number, number];
};

// Clean text-free curved filaments connecting Hero (slot 0) bezel edge to satellites 1..5.
const PRIMARY_WIRES: WireSpec[] = [
  {
    slot: 1,
    start: [210, 178],
    end: [148, 137],
    d: "M 210 178 C 188 148, 172 162, 148 137",
  },
  {
    slot: 2,
    start: [392, 170],
    end: [432, 117],
    d: "M 392 170 C 402 140, 424 148, 432 117",
  },
  {
    slot: 3,
    start: [449, 254],
    end: [512, 232],
    d: "M 449 254 C 476 254, 484 232, 512 232",
  },
  {
    slot: 4,
    start: [449, 344],
    end: [478, 392],
    d: "M 449 344 C 474 352, 462 378, 478 392",
  },
  {
    slot: 5,
    start: [314, 382],
    end: [298, 425],
    d: "M 314 382 C 322 404, 294 402, 298 425",
  },
];

// Secondary subtle cross-mesh paths between neighboring satellite monitors.
const SECONDARY_WIRES: string[] = [
  "M 164 82 C 254 40, 298 96, 378 68",
  "M 508 106 C 546 132, 548 144, 566 175",
  "M 588 277 C 594 332, 554 332, 550 381",
  "M 470 448 C 426 490, 404 452, 362 476",
];

function slotPositionStyle(slot: SlotGeometry): React.CSSProperties {
  return {
    left: `${(slot.cx / STAGE_W) * 100}%`,
    top: `${(slot.cy / STAGE_H) * 100}%`,
    width: `${slot.widthPct}%`,
    transform: "translate(-50%, -50%)",
  };
}

function TvScreenArtwork({ node }: { node: LandingGraphNode }) {
  return (
    <SmartCropImage
      sources={node.imageSources}
      alt={node.title}
      targetAspect={4 / 3}
      className="w-full h-full object-cover select-none"
      fallbackNode={
        <div className="w-full h-full bg-gradient-to-br from-[#232328] to-[#111114] flex items-center justify-center p-2">
          <span className="text-[10px] font-mono text-paper-3 text-center leading-tight">
            {node.shortTitle}
          </span>
        </div>
      }
    />
  );
}

/**
 * Interactive horizontal 4:3 CRT TV anime knowledge graph for the landing hero.
 * Hovering a satellite illuminates its filament and updates the floating card;
 * clicking a satellite swaps it into the center CRT monitor with a power-on flash.
 */
export function LandingGraph({ nodes }: { nodes: LandingGraphNode[] }) {
  const [order, setOrder] = useState<number[]>(() => nodes.map((_, i) => i));
  const [hoveredSlot, setHoveredSlot] = useState<number | null>(null);

  const prefersReduced = useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCE_MOTION_QUERY).matches,
    () => false
  );

  if (nodes.length === 0) return null;

  const heroIdx = order[0] ?? 0;
  const heroNode = nodes[heroIdx] ?? nodes[0];
  const targetSlot = hoveredSlot ?? 1;
  const targetNode = nodes[order[targetSlot]] ?? nodes[1] ?? heroNode;
  const highlightedSlot = targetSlot;
  const pairReason =
    getPairConnectionReason(heroNode.malId, targetNode.malId) ||
    targetNode.connectionNote;

  function swapWithHero(slotNumber: number) {
    setOrder((prev) => {
      if (slotNumber <= 0 || slotNumber >= prev.length) return prev;
      const next = [...prev];
      const tmp = next[0];
      next[0] = next[slotNumber];
      next[slotNumber] = tmp;
      return next;
    });
  }

  return (
    <div className="w-full">
      <div
        className="relative w-full mx-auto select-none"
        style={{ aspectRatio: "660 / 540", maxWidth: "680px" }}
      >
        {/* Subtle neutral darkroom ambient halo behind the hero CRT */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute rounded-full bg-white/[0.045] blur-3xl"
          style={{
            left: "49%",
            top: "50%",
            width: "52%",
            height: "46%",
            transform: "translate(-50%, -50%)",
          }}
        />

        {/* Pure text-free curved Bezier knowledge graph wires */}
        <svg
          aria-hidden="true"
          viewBox={`0 0 ${STAGE_W} ${STAGE_H}`}
          className="pointer-events-none absolute inset-0 w-full h-full z-0"
        >
          {SECONDARY_WIRES.map((d, idx) => (
            <path
              key={idx}
              d={d}
              fill="none"
              stroke="rgba(255,255,255,0.18)"
              strokeWidth={1}
              strokeDasharray="2 4"
            />
          ))}

          {PRIMARY_WIRES.map((wire) => {
            const isHovered = hoveredSlot === wire.slot;
            const isActiveAtRest = hoveredSlot == null && wire.slot === 1;
            const isHighlighted = isHovered || isActiveAtRest;
            const strokeColor = isHovered
              ? "rgba(255,255,255,0.9)"
              : isActiveAtRest
                ? "rgba(255,255,255,0.72)"
                : hoveredSlot != null
                  ? "rgba(255,255,255,0.14)"
                  : "rgba(255,255,255,0.34)";

            return (
              <g key={wire.slot}>
                <path
                  d={wire.d}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth={isHovered ? 1.7 : isActiveAtRest ? 1.5 : 1.15}
                  className="transition-all duration-300"
                />
                <circle
                  cx={wire.start[0]}
                  cy={wire.start[1]}
                  r={isHighlighted ? 2.5 : 1.9}
                  fill={isHighlighted ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.45)"}
                />
                <circle
                  cx={wire.end[0]}
                  cy={wire.end[1]}
                  r={isHighlighted ? 3.2 : 2.6}
                  fill={isHighlighted ? "#ffffff" : "rgba(255,255,255,0.8)"}
                />
                {!prefersReduced && wire.slot === highlightedSlot && (
                  <circle r={isHovered ? 2.6 : 2.1} fill="#ffffff" opacity={0.92}>
                    <animateMotion
                      dur={isHovered ? "1.8s" : "3.6s"}
                      repeatCount="indefinite"
                      path={wire.d}
                    />
                  </circle>
                )}
              </g>
            );
          })}
        </svg>

        {/* Center Hero Horizontal 4:3 CRT TV */}
        <div
          style={slotPositionStyle(HERO_SLOT)}
          className="absolute z-10"
        >
          <div className="rounded-[18px] bg-gradient-to-b from-[#222226] to-[#0f0f12] p-[6px] sm:p-[7px] border border-white/15 shadow-[0_28px_70px_rgba(0,0,0,0.85),0_0_55px_rgba(255,255,255,0.06),inset_0_1px_0_rgba(255,255,255,0.18)]">
            <CRTScreen
              key={heroNode.malId}
              fixedWidth={264}
              fixedHeight={198}
              playPowerOnOnMount
              curvature={22}
              clipToCurve
              aberration={18}
              aberrationScheme={0}
              scanlines={22}
              scanlineSize={3}
              mask={22}
              maskPitch={5}
              vignette={44}
              noise={14}
              rollSpeed={3.4}
              flicker={30}
              jitter={1}
              className="w-full rounded-[11px] border border-black/60"
              style={{ aspectRatio: "4 / 3" }}
            >
              <TvScreenArtwork node={heroNode} />
            </CRTScreen>
            <div className="pt-1.5 pb-0.5 text-center">
              <span className="text-[9px] sm:text-[10px] font-mono uppercase tracking-[0.22em] text-paper-3">
                {heroNode.shortTitle}
              </span>
            </div>
          </div>
        </div>

        {/* 5 Organic Satellite Horizontal 4:3 CRT TVs */}
        {SATELLITE_SLOTS.map((slot, idx) => {
          const slotNumber = idx + 1;
          const node = nodes[order[slotNumber]];
          if (!node) return null;

          return (
            <button
              key={slotNumber}
              type="button"
              onClick={() => swapWithHero(slotNumber)}
              onMouseEnter={() => setHoveredSlot(slotNumber)}
              onMouseLeave={() =>
                setHoveredSlot((cur) => (cur === slotNumber ? null : cur))
              }
              aria-label={`Inspect ${node.title}`}
              style={slotPositionStyle(slot)}
              className="group absolute z-10 cursor-pointer text-left focus:outline-none"
            >
              <div className="rounded-[12px] sm:rounded-[13px] bg-gradient-to-b from-[#1e1e22] to-[#0e0e11] p-[4px] sm:p-[5px] border border-white/12 group-hover:border-white/35 shadow-[0_14px_34px_rgba(0,0,0,0.72),inset_0_1px_0_rgba(255,255,255,0.12)] transition-all duration-300 group-hover:scale-[1.04]">
                <CRTScreen
                  key={node.malId}
                  fixedWidth={144}
                  fixedHeight={108}
                  animateOnHover
                  curvature={18}
                  clipToCurve
                  aberration={12}
                  aberrationScheme={0}
                  scanlines={20}
                  scanlineSize={3}
                  mask={20}
                  maskPitch={4}
                  vignette={38}
                  noise={12}
                  rollSpeed={3.2}
                  flicker={26}
                  jitter={0}
                  className="w-full rounded-[8px] border border-black/60"
                  style={{ aspectRatio: "4 / 3" }}
                >
                  <TvScreenArtwork node={node} />
                </CRTScreen>
              </div>
              <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-full mt-1.5 whitespace-nowrap rounded-md border border-line bg-[#18181b]/90 px-2 py-0.5 text-[10px] font-mono text-paper opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                {node.shortTitle}
              </span>
            </button>
          );
        })}

        {/* Desktop floating frosted-glass card overlapping bottom-left of Hero TV */}
        <div
          className="hidden sm:block absolute z-20 rounded-xl border border-white/15 bg-[#19191c]/82 backdrop-blur-xl px-4 py-3.5 shadow-[0_20px_50px_rgba(0,0,0,0.65),inset_0_1px_0_rgba(255,255,255,0.14)]"
          style={{ left: "1%", top: "51%", width: "39%", maxWidth: "260px" }}
        >
          <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-paper-3 mb-1">
            WHY THEY CONNECT
          </p>
          <p className="text-[11px] font-medium text-paper-2 truncate mb-1.5">
            {heroNode.shortTitle} &amp; {targetNode.shortTitle}
          </p>
          <p className="text-xs text-paper/90 leading-relaxed">
            {pairReason}
          </p>
          <p className="text-[10px] text-paper-3 mt-2">
            {hoveredSlot != null
              ? `Click to center ${targetNode.shortTitle}`
              : "Hover or click any TV to explore"}
          </p>
        </div>
      </div>

      {/* Mobile companion card below stage so small viewports stay uncrowded */}
      <div className="sm:hidden mt-4 rounded-xl border border-white/15 bg-[#19191c]/82 backdrop-blur-xl px-4 py-3.5">
        <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-paper-3 mb-1">
          WHY THEY CONNECT
        </p>
        <p className="text-[11px] font-medium text-paper-2 truncate mb-1.5">
          {heroNode.shortTitle} &amp; {targetNode.shortTitle}
        </p>
        <p className="text-xs text-paper/90 leading-relaxed">
          {pairReason}
        </p>
        <p className="text-[10px] text-paper-3 mt-2">
          Tap any TV to switch seed
        </p>
      </div>
    </div>
  );
}
