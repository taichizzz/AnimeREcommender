"use client";

import * as React from "react";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

/**
 * Shader-accurate CRT screen effect ported to Next.js / React 19 from
 * "CRT Screen as Figma" (CRTFigma.js) by Touhid Bin Alam Khan.
 *
 * Uses offscreen canvas PNG displacement maps + SVG <feDisplacementMap> for
 * real barrel curvature, radial RGB chromatic dispersion, and scanline jitter,
 * plus blended cosine scanlines, rolling refresh band, phosphor mask, static
 * grain, mains-hum flicker, curvature-matched vignette, and CRT power flash.
 */

export type CRTScreenProps = {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  /** Optional fixed dimensions to skip ResizeObserver and share cached warp maps. */
  fixedWidth?: number;
  fixedHeight?: number;
  enabled?: boolean;
  animateOnHover?: boolean;
  reducedMotion?: boolean;
  power?: boolean;
  playPowerOnOnMount?: boolean;
  powerDuration?: number;
  mask?: number;
  maskType?: 0 | 1 | 2;
  maskPitch?: number;
  curvature?: number;
  clipToCurve?: boolean;
  scanlines?: number;
  scanlineSize?: number;
  aberration?: number;
  aberrationScheme?: 0 | 1 | 2;
  flicker?: number;
  noise?: number;
  noiseSize?: number;
  rollSpeed?: number;
  jitter?: number;
  vignette?: number;
  brightness?: number;
  speed?: number;
};

type WarpMap = { uri: string; scale: number };

const CACHE_MAX = 24;
const barrelCache = new Map<string, WarpMap>();
const radialCache = new Map<string, { uri: string }>();

const KEEP_R = "1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0";
const KEEP_G = "0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0";
const KEEP_B = "0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0";
const SEEDS = Array.from({ length: 24 }, (_, i) => i + 1).join(";");

const NOISE_SVG = `<svg xmlns='http://www.w3.org/2000/svg' width='256' height='256'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/><feComponentTransfer><feFuncR type='linear' slope='1.6' intercept='-0.3'/><feFuncG type='linear' slope='1.6' intercept='-0.3'/><feFuncB type='linear' slope='1.6' intercept='-0.3'/></feComponentTransfer></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>`;
const NOISE_URI = `url("data:image/svg+xml;utf8,${encodeURIComponent(NOISE_SVG)}")`;

const BASE_LAYER: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  pointerEvents: "none",
};

const REDUCE_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeNoop() {
  return () => {};
}

function subscribeReducedMotion(onChange: () => void) {
  const mq = window.matchMedia(REDUCE_MOTION_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

function normalisedAspect(w: number, h: number): { x: number; y: number } {
  const ax = w / h;
  const ay = 1;
  const len = Math.sqrt(ax * ax + ay * ay) / Math.SQRT2;
  return { x: ax / len, y: ay / len };
}

function encodeMap(off: Float32Array, scale: number, mapN: number): string {
  const canvas = document.createElement("canvas");
  canvas.width = mapN;
  canvas.height = mapN;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  const img = ctx.createImageData(mapN, mapN);
  const d = img.data;
  for (let p = 0; p < mapN * mapN; p++) {
    const r = clamp(0.5 + off[p * 2] / scale, 0, 1);
    const g = clamp(0.5 + off[p * 2 + 1] / scale, 0, 1);
    d[p * 4] = Math.round(r * 255);
    d[p * 4 + 1] = Math.round(g * 255);
    d[p * 4 + 2] = 128;
    d[p * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL("image/png");
}

function setBoundedCache<K, V>(cache: Map<K, V>, key: K, val: V) {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, val);
}

function makeBarrelMap(
  w: number,
  h: number,
  curvature: number,
  clip: boolean,
  jitter: number
): WarpMap | null {
  if (typeof document === "undefined") return null;
  const mapN = Math.max(w, h) <= 160 ? 128 : 256;
  const key = `${w}x${h}:${curvature.toFixed(3)}:${clip ? 1 : 0}:${jitter.toFixed(3)}:${mapN}`;
  const hit = barrelCache.get(key);
  if (hit) return hit;

  const a = normalisedAspect(w, h);
  const k = curvature * 0.35;
  const edgeFit = {
    x: 1 / (1 + k * a.x * a.x),
    y: 1 / (1 + k * a.y * a.y),
  };
  const texel = { x: 1 / w, y: 1 / h };
  const reserve = {
    x: jitter * 3.9 * texel.x + 0.5 * texel.x,
    y: 0.5 * texel.y,
  };
  const avail = {
    x: Math.max(1 - 2 * reserve.x, 0.05),
    y: Math.max(1 - 2 * reserve.y, 0.05),
  };
  const rect = 1 / (1 + 0.7 * curvature);
  const sx = clip ? edgeFit.x / avail.x : rect;
  const sy = clip ? edgeFit.y / avail.y : rect;

  const off = new Float32Array(mapN * mapN * 2);
  let max = 0;
  for (let j = 0; j < mapN; j++) {
    const v = (j + 0.5) / mapN;
    for (let i = 0; i < mapN; i++) {
      const u = (i + 0.5) / mapN;
      const cx = (u * 2 - 1) * a.x;
      const cy = (v * 2 - 1) * a.y;
      const r2 = cx * cx + cy * cy;
      const f = 1 + k * r2;
      const wx = ((cx * f * sx) / a.x) * 0.5 + 0.5;
      const wy = ((cy * f * sy) / a.y) * 0.5 + 0.5;
      const ox = (wx - u) * w;
      const oy = (wy - v) * h;
      const idx = (j * mapN + i) * 2;
      off[idx] = ox;
      off[idx + 1] = oy;
      max = Math.max(max, Math.abs(ox), Math.abs(oy));
    }
  }

  const scale = Math.max(2 * max, 1);
  const uri = encodeMap(off, scale, mapN);
  if (!uri) return null;
  const result = { uri, scale };
  setBoundedCache(barrelCache, key, result);
  return result;
}

function makeRadialMap(w: number, h: number): { uri: string } | null {
  if (typeof document === "undefined") return null;
  const mapN = Math.max(w, h) <= 160 ? 128 : 256;
  const key = `${w}x${h}:${mapN}`;
  const hit = radialCache.get(key);
  if (hit) return hit;

  const a = normalisedAspect(w, h);
  const off = new Float32Array(mapN * mapN * 2);
  for (let j = 0; j < mapN; j++) {
    const v = (j + 0.5) / mapN;
    for (let i = 0; i < mapN; i++) {
      const u = (i + 0.5) / mapN;
      const cx = (u * 2 - 1) * a.x;
      const cy = (v * 2 - 1) * a.y;
      const r = Math.sqrt(cx * cx + cy * cy);
      const dx = r > 1e-4 ? cx / r : 1;
      const dy = r > 1e-4 ? cy / r : 0;
      const level = clamp(r / Math.SQRT2, 0, 1);
      const m = 0.72 + 0.48 * level;
      const idx = (j * mapN + i) * 2;
      off[idx] = dx * m;
      off[idx + 1] = dy * m;
    }
  }

  const uri = encodeMap(off, 2.4, mapN);
  if (!uri) return null;
  const result = { uri };
  setBoundedCache(radialCache, key, result);
  return result;
}

function makeToneTable(gain: number): string {
  const N = 64;
  const out: string[] = [];
  for (let i = 0; i <= N; i++) {
    let y = (i / N) * gain;
    if (y > 0.8) y = 0.8 + 0.2 * (1 - Math.exp(-(y - 0.8) / 0.2));
    out.push(clamp(y, 0, 1).toFixed(4));
  }
  return out.join(" ");
}

function vignetteGradient(v: number, curvature: number): string {
  const strength = 3 * v * v * (0.35 + 0.65 * v);
  const spread = clamp(v * v * (0.6 + 0.4 * curvature), 0, 1);
  const inner = 1.4 * (1 - spread);
  const stops = ["rgba(0,0,0,0) 0%"];
  const steps = 10;
  for (let i = 0; i <= steps; i++) {
    const r2 = inner + ((2 - inner) * i) / steps;
    const dark = clamp(strength * smoothstep(inner, 2, r2), 0, 1);
    const pos = Math.sqrt(r2 / 2) * 100;
    stops.push(`rgba(0,0,0,${dark.toFixed(3)}) ${pos.toFixed(2)}%`);
  }
  return `radial-gradient(ellipse farthest-corner at 50% 50%, ${stops.join(", ")})`;
}

export function CRTScreen({
  children,
  className = "",
  style,
  fixedWidth,
  fixedHeight,
  enabled = true,
  animateOnHover = false,
  reducedMotion = true,
  power = true,
  playPowerOnOnMount = false,
  powerDuration = 0.65,
  mask = 30,
  maskType = 0,
  maskPitch = 6,
  curvature = 28,
  clipToCurve = true,
  scanlines = 28,
  scanlineSize = 4,
  aberration = 32,
  aberrationScheme = 0,
  flicker = 45,
  noise = 18,
  noiseSize = 1,
  rollSpeed = 3.8,
  jitter = 0,
  vignette = 50,
  brightness = 0,
  speed = 0.78,
}: CRTScreenProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const hasFixedSize = fixedWidth != null && fixedHeight != null;
  const [measuredSize, setMeasuredSize] = useState({ w: 0, h: 0 });
  const [onscreen, setOnscreen] = useState(true);
  const [hovered, setHovered] = useState(false);
  const [powerAnim, setPowerAnim] = useState<"none" | "on" | "off">(() =>
    !power ? "off" : playPowerOnOnMount ? "on" : "none"
  );
  const prevPowerRef = useRef(power);

  const isClient = useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false
  );

  const prefersReduced = useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCE_MOTION_QUERY).matches,
    () => false
  );

  const rawId = useId();
  const fid = "crtfx" + rawId.replace(/[^a-zA-Z0-9]/g, "");

  useEffect(() => {
    if (hasFixedSize) return;
    const el = containerRef.current;
    if (!el) return;

    const update = () => {
      const r = el.getBoundingClientRect();
      const w = Math.max(1, Math.round(r.width));
      const h = Math.max(1, Math.round(r.height));
      setMeasuredSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    };

    update();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [hasFixedSize]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) setOnscreen(entry.isIntersecting);
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!animateOnHover) return;
    const el = containerRef.current;
    if (!el) return;
    const target = (el.closest(".group") as HTMLElement | null) ?? el;
    const onEnter = () => setHovered(true);
    const onLeave = () => setHovered(false);
    const raf = requestAnimationFrame(() => {
      setHovered(target.matches(":hover"));
    });
    target.addEventListener("mouseenter", onEnter);
    target.addEventListener("mouseleave", onLeave);
    return () => {
      cancelAnimationFrame(raf);
      target.removeEventListener("mouseenter", onEnter);
      target.removeEventListener("mouseleave", onLeave);
    };
  }, [animateOnHover]);

  useEffect(() => {
    if (prevPowerRef.current === power) return;
    prevPowerRef.current = power;
    const raf = requestAnimationFrame(() => {
      setPowerAnim(power ? "on" : "off");
    });
    return () => cancelAnimationFrame(raf);
  }, [power]);

  const size = useMemo(
    () =>
      hasFixedSize
        ? { w: fixedWidth as number, h: fixedHeight as number }
        : measuredSize,
    [hasFixedSize, fixedWidth, fixedHeight, measuredSize]
  );

  const spd = Math.max(0, speed);
  const motionAllowed = !(reducedMotion && prefersReduced);
  const isLive = !animateOnHover || hovered;
  const animate = spd > 0 && motionAllowed && isLive;

  const curvature01 = clamp(curvature / 100, 0, 1);
  const jitter01 = clamp(jitter / 100, 0, 1);
  const mask01 = clamp(mask / 100, 0, 1);
  const noise01 = clamp(noise / 100, 0, 1);
  const flicker01 = clamp(flicker / 100, 0, 1);
  const vig01 = clamp(vignette / 100, 0, 1);
  const aberrPx = clamp(aberration / 100, 0, 1) * 12;
  const gain = Math.pow(2, clamp(brightness, -1, 1));
  const scanSize = Math.max(1, scanlineSize);
  const scanAmt =
    clamp(scanlines / 100, 0, 1) * (0.6 + 0.4 * smoothstep(1, 2.5, scanSize));
  const pitch = clamp(maskPitch, 2, 12);
  const grain = Math.max(1, noiseSize);

  const barrel = useMemo(
    () =>
      isClient && enabled && size.w > 0 && size.h > 0 && curvature01 > 0
        ? makeBarrelMap(size.w, size.h, curvature01, clipToCurve, jitter01)
        : null,
    [isClient, enabled, size.w, size.h, curvature01, clipToCurve, jitter01]
  );

  const radial = useMemo(
    () =>
      isClient &&
      enabled &&
      size.w > 0 &&
      size.h > 0 &&
      aberrPx > 0 &&
      aberrationScheme === 0
        ? makeRadialMap(size.w, size.h)
        : null,
    [isClient, enabled, size.w, size.h, aberrPx, aberrationScheme]
  );

  const toneTable = useMemo(() => makeToneTable(gain), [gain]);

  const filterReady =
    isClient &&
    enabled &&
    size.w > 0 &&
    (curvature01 <= 0 || !!barrel) &&
    (aberrPx <= 0 || aberrationScheme !== 0 || !!radial);

  if (!enabled) {
    return (
      <div
        ref={containerRef}
        className={`relative overflow-hidden ${className}`}
        style={style}
      >
        {children}
      </div>
    );
  }

  const layers: React.ReactElement<{
    style?: React.CSSProperties;
    [key: string]: unknown;
  }>[] = [];

  if (scanAmt > 0) {
    const P = scanSize;
    const n = 16;
    const stops: string[] = [];
    for (let i = 0; i <= n; i++) {
      const v = 1 - scanAmt * 0.5 * (1 - Math.cos((2 * Math.PI * i) / n));
      const g = Math.round(v * 255);
      stops.push(`rgb(${g},${g},${g}) ${((i / n) * P).toFixed(3)}px`);
    }
    const drift = animate ? P / (6 * spd) : 0;
    const dodge = Math.round(scanAmt * 0.5 * 255);
    layers.push(
      <div
        key="scan"
        style={
          {
            ...BASE_LAYER,
            backgroundImage: `repeating-linear-gradient(to bottom, ${stops.join(", ")})`,
            backgroundSize: `100% ${P}px`,
            mixBlendMode: "multiply",
            "--crt-period": `${-P}px`,
            animation: drift > 0 ? `crtfx-scan-v ${drift}s linear infinite` : "none",
          } as React.CSSProperties
        }
      />,
      <div
        key="scan-norm"
        style={{
          ...BASE_LAYER,
          background: `rgb(${dodge},${dodge},${dodge})`,
          mixBlendMode: "color-dodge",
        }}
      />
    );
  }

  if (rollSpeed > 0.001 && animate) {
    const stops: string[] = [];
    const n = 22;
    for (let i = 0; i <= n; i++) {
      const p = (i / n) * 0.22;
      const band = smoothstep(0, 0.06, p) * (1 - smoothstep(0.06, 0.22, p));
      const g = Math.round((1 - 1 / (1 + 0.35 * band)) * 255);
      stops.push(`rgb(${g},${g},${g}) ${((i / n) * 100).toFixed(2)}%`);
    }
    const bandStyle: React.CSSProperties = {
      position: "absolute",
      left: 0,
      right: 0,
      height: "11%",
      background: `linear-gradient(to bottom, ${stops.join(", ")})`,
    };
    const cycle = animate ? 1 / (rollSpeed * 0.12 * spd) : 0;
    layers.push(
      <div
        key="roll"
        style={{
          ...BASE_LAYER,
          overflow: "hidden",
          mixBlendMode: "color-dodge",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 0,
            height: "200%",
            animation:
              cycle > 0 ? `crtfx-roll-track ${cycle}s linear infinite` : "none",
          }}
        >
          <div style={{ ...bandStyle, top: "0%" }} />
          <div style={{ ...bandStyle, top: "50%" }} />
        </div>
      </div>
    );
  }

  if (mask01 > 0) {
    const sub = pitch / 3;
    const grille = `repeating-linear-gradient(to right, rgb(255,0,0) 0px, rgb(0,255,0) ${sub}px, rgb(0,0,255) ${sub * 2}px, rgb(255,0,0) ${pitch}px)`;
    const grilleOpacity = mask01 * (maskType === 2 ? 0.4 : 0.7);
    layers.push(
      <div
        key="grille"
        style={{
          ...BASE_LAYER,
          backgroundImage: grille,
          backgroundSize: `${pitch}px 100%`,
          opacity: grilleOpacity,
          mixBlendMode: "overlay",
        }}
      />
    );

    if (maskType === 1) {
      const period = pitch * 2;
      const tie = Math.max(0.5, pitch * 0.35);
      layers.push(
        <div
          key="slot"
          style={{
            ...BASE_LAYER,
            backgroundImage: `repeating-linear-gradient(to bottom, rgba(0,0,0,1) 0px, rgba(0,0,0,1) ${tie}px, rgba(0,0,0,0) ${tie}px, rgba(0,0,0,0) ${period}px)`,
            backgroundSize: `100% ${period}px`,
            opacity: mask01 * 0.6,
            mixBlendMode: "multiply",
          }}
        />
      );
    } else if (maskType === 2) {
      const rowH = pitch * 0.8660254;
      const dot = `radial-gradient(circle at center, rgba(0,0,0,0) 0px, rgba(0,0,0,0) ${pitch * 0.3}px, rgba(0,0,0,1) ${pitch * 0.42}px)`;
      layers.push(
        <div
          key="shadow"
          style={{
            ...BASE_LAYER,
            backgroundImage: `${dot}, ${dot}`,
            backgroundSize: `${pitch}px ${rowH * 2}px, ${pitch}px ${rowH * 2}px`,
            backgroundPosition: `0px 0px, ${pitch / 2}px ${rowH}px`,
            opacity: mask01 * 0.7,
            mixBlendMode: "multiply",
          }}
        />
      );
    }
  }

  if (flicker01 > 0 && animate) {
    layers.push(
      <div
        key="flicker"
        style={
          {
            ...BASE_LAYER,
            background: "#000",
            "--crt-flicker": String(flicker01 * 0.12),
            animation: `crtfx-flicker ${1 / spd}s linear infinite`,
          } as React.CSSProperties
        }
      />
    );
  }

  if (noise01 > 0) {
    const dur = animate ? 10 / (24 * spd) : 0;
    layers.push(
      <div
        key="noise"
        style={{
          ...BASE_LAYER,
          backgroundImage: NOISE_URI,
          backgroundSize: `${256 * grain}px ${256 * grain}px`,
          opacity: noise01 * 0.45,
          animation: dur > 0 ? `crtfx-noise ${dur}s steps(1) infinite` : "none",
        }}
      />
    );
  }

  if (vig01 > 0) {
    layers.push(
      <div
        key="vignette"
        style={{
          ...BASE_LAYER,
          background: vignetteGradient(vig01, curvature01),
        }}
      />
    );
  }

  if (powerAnim !== "none") {
    const d = Math.max(0.1, powerDuration);
    const off = powerAnim === "off";
    layers.push(
      <div
        key="power"
        style={{
          ...BASE_LAYER,
          background: "#000",
          opacity: off ? 1 : 0,
          animation: motionAllowed
            ? `${off ? "crtfx-off-bg" : "crtfx-on-bg"} ${d}s ease-in-out forwards`
            : "none",
        }}
        onAnimationEnd={(e) => {
          if (e.target === e.currentTarget && !off) setPowerAnim("none");
        }}
      >
        {motionAllowed && (
          <div
            style={{
              ...BASE_LAYER,
              background:
                "radial-gradient(ellipse at center, #ffffff 0%, #dfe9ff 60%, transparent 100%)",
              transformOrigin: "50% 50%",
              animation: `${off ? "crtfx-off-line" : "crtfx-on-line"} ${d}s ease-in-out forwards`,
            }}
          />
        )}
      </div>
    );
  }

  const filterPrims: React.ReactNode[] = [];
  if (filterReady) {
    let src = "SourceGraphic";

    if (curvature01 > 0 && barrel) {
      filterPrims.push(
        <feImage
          key="bmap"
          href={barrel.uri}
          preserveAspectRatio="none"
          result="bmap"
        />,
        <feDisplacementMap
          key="warp"
          in={src}
          in2="bmap"
          scale={barrel.scale}
          xChannelSelector="R"
          yChannelSelector="G"
          result="warp"
        />
      );
      src = "warp";
    }

    if (aberrPx > 0) {
      filterPrims.push(
        <feColorMatrix key="r0" in={src} type="matrix" values={KEEP_R} result="r0" />,
        <feColorMatrix key="g0" in={src} type="matrix" values={KEEP_G} result="g0" />,
        <feColorMatrix key="b0" in={src} type="matrix" values={KEEP_B} result="b0" />
      );

      if (aberrationScheme === 0 && radial) {
        filterPrims.push(
          <feImage
            key="rmap"
            href={radial.uri}
            preserveAspectRatio="none"
            result="rmap"
          />,
          <feDisplacementMap
            key="r1"
            in="r0"
            in2="rmap"
            scale={2.4 * aberrPx}
            xChannelSelector="R"
            yChannelSelector="G"
            result="r1"
          />,
          <feDisplacementMap
            key="b1"
            in="b0"
            in2="rmap"
            scale={-2.4 * aberrPx}
            xChannelSelector="R"
            yChannelSelector="G"
            result="b1"
          />
        );
      } else {
        const dx = aberrationScheme === 2 ? 0.95 * aberrPx : 1.15 * aberrPx;
        const dy = aberrationScheme === 2 ? -0.55 * aberrPx : 0;
        filterPrims.push(
          <feOffset key="r1" in="r0" dx={dx} dy={dy} result="r1" />,
          <feOffset key="b1" in="b0" dx={-dx} dy={-dy} result="b1" />
        );
      }

      filterPrims.push(
        <feComposite
          key="rg"
          in="r1"
          in2="g0"
          operator="arithmetic"
          k1={0}
          k2={1}
          k3={1}
          k4={0}
          result="rg"
        />,
        <feComposite
          key="rgb"
          in="rg"
          in2="b1"
          operator="arithmetic"
          k1={0}
          k2={1}
          k3={1}
          k4={0}
          result="rgb"
        />
      );
      src = "rgb";
    }

    if (jitter01 > 0) {
      const frames = 24;
      const dur = frames / (24 * spd || 1);
      filterPrims.push(
        <feTurbulence
          key="turb"
          type="fractalNoise"
          baseFrequency="0 0.9"
          numOctaves={1}
          seed={1}
          result="turb"
        >
          {animate && onscreen && (
            <animate
              attributeName="seed"
              values={SEEDS}
              dur={`${dur}s`}
              calcMode="discrete"
              repeatCount="indefinite"
            />
          )}
        </feTurbulence>,
        <feColorMatrix
          key="jmap"
          in="turb"
          type="matrix"
          values="1 0 0 0 0  0 0 0 0 0.5  0 0 0 0 0  0 0 0 0 1"
          result="jmap"
        />,
        <feDisplacementMap
          key="jit"
          in={src}
          in2="jmap"
          scale={jitter01 * 16}
          xChannelSelector="R"
          yChannelSelector="G"
          result="jit"
        />
      );
      src = "jit";
    }

    filterPrims.push(
      <feComponentTransfer key="tone" in={src} result="tone">
        <feFuncR type="table" tableValues={toneTable} />
        <feFuncG type="table" tableValues={toneTable} />
        <feFuncB type="table" tableValues={toneTable} />
      </feComponentTransfer>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden bg-[#060608] ${className}`}
      style={style}
    >
      {filterReady && (
        <svg
          aria-hidden="true"
          style={{
            position: "absolute",
            width: 0,
            height: 0,
            overflow: "hidden",
            pointerEvents: "none",
          }}
        >
          <defs>
            <filter
              id={fid}
              x="0"
              y="0"
              width="100%"
              height="100%"
              colorInterpolationFilters="sRGB"
            >
              {filterPrims}
            </filter>
          </defs>
        </svg>
      )}

      {/* Children + blended CRT layers share the same parent so mix-blend-mode
          reaches the artwork, and the parent applies the SVG barrel/RGB warp. */}
      <div
        className="relative w-full h-full"
        style={{ filter: filterReady ? `url(#${fid})` : undefined }}
      >
        {children}
        {layers.map((el) =>
          React.cloneElement(el, {
            "data-crt-layer": "",
            ...(onscreen ? {} : { "data-crt-paused": "" }),
          })
        )}
      </div>
    </div>
  );
}
