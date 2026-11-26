"use client";

import * as React from "react";
import { useState } from "react";

export type SmartCropImageProps = {
  sources: string[];
  alt: string;
  targetAspect?: number;
  className?: string;
  fallbackNode?: React.ReactNode;
};

const CROP_CACHE_MAX = 200;
const cropCache = new Map<string, string>();

function setBoundedCropCache(key: string, val: string) {
  if (cropCache.size >= CROP_CACHE_MAX) {
    const oldest = cropCache.keys().next().value;
    if (oldest !== undefined) cropCache.delete(oldest);
  }
  cropCache.set(key, val);
}

/**
 * Computes an object-position CSS percentage string by scoring a scaled-down
 * copy of the image for edge detail, color saturation, and warm character/skin
 * cues, then sliding a `targetAspect` crop window across candidate offsets.
 */
function computeSmartObjectPosition(
  img: HTMLImageElement,
  targetAspect: number
): string {
  const natW = img.naturalWidth;
  const natH = img.naturalHeight;
  if (!natW || !natH) return "50% 42%";

  const natAspect = natW / natH;
  if (Math.abs(natAspect - targetAspect) < 0.08) return "50% 50%";

  const fallback = natAspect > targetAspect ? "50% 50%" : "50% 45%";

  const maxDim = 72;
  const scale = maxDim / Math.max(natW, natH);
  const sw = Math.max(8, Math.round(natW * scale));
  const sh = Math.max(8, Math.round(natH * scale));

  const canvas = document.createElement("canvas");
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return fallback;

  let data: Uint8ClampedArray;
  try {
    ctx.drawImage(img, 0, 0, sw, sh);
    data = ctx.getImageData(0, 0, sw, sh).data;
  } catch {
    return fallback;
  }

  const luma = new Float32Array(sw * sh);
  for (let i = 0; i < sw * sh; i++) {
    const o = i * 4;
    luma[i] = 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2];
  }

  const isPortrait = natAspect < targetAspect;
  const score = new Float32Array(sw * sh);
  const marginX = Math.max(1, Math.floor(sw * 0.06));
  const topTitleBand = Math.max(1, Math.floor(sh * (isPortrait ? 0.16 : 0.06)));
  const botTitleBand = Math.max(1, Math.floor(sh * (isPortrait ? 0.14 : 0.06)));

  for (let y = 0; y < sh; y++) {
    const yUp = Math.max(0, y - 1);
    const yDn = Math.min(sh - 1, y + 1);
    const inTitleBand = y < topTitleBand || y >= sh - botTitleBand;

    for (let x = 0; x < sw; x++) {
      const idx = y * sw + x;
      const xLt = Math.max(0, x - 1);
      const xRt = Math.min(sw - 1, x + 1);

      const dx = Math.abs(luma[y * sw + xRt] - luma[y * sw + xLt]);
      const dy = Math.abs(luma[yDn * sw + x] - luma[yUp * sw + x]);
      const detail = (dx + dy) / 255;

      const o = idx * 4;
      const r = data[o];
      const g = data[o + 1];
      const b = data[o + 2];
      const mx = Math.max(r, g, b);
      const mn = Math.min(r, g, b);
      const sat = (mx - mn) / (mx + 1);

      // Warm human/anime character skin tone weighted by local detail so plain backgrounds don't dominate.
      const isSkin =
        r > 130 &&
        g > 85 &&
        b > 65 &&
        r > g &&
        g > b * 0.85 &&
        r - b > 18 &&
        r - b < 135;
      const skinBoost = isSkin ? 1.45 * (0.35 + Math.min(1, detail * 2.5)) : 0;

      const inMarginX = x < marginX || x >= sw - marginX;
      const bandWeight =
        isPortrait && inTitleBand ? 0.38 : inMarginX || inTitleBand ? 0.45 : 1;

      score[idx] = (detail * 1.35 + sat * 0.45 + skinBoost) * bandWeight;
    }
  }

  const steps = 24;
  if (natAspect > targetAspect) {
    // Wide image -> slide window horizontally.
    const winW = Math.max(1, Math.min(sw, Math.round(sh * targetAspect)));
    const maxStart = sw - winW;
    if (maxStart <= 0) return "50% 50%";

    let bestT = 0.5;
    let bestVal = -1;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const x0 = Math.round(t * maxStart);
      let sum = 0;
      for (let y = 0; y < sh; y++) {
        const row = y * sw;
        for (let x = x0; x < x0 + winW; x++) {
          sum += score[row + x];
        }
      }
      const centerPrior = 1 - 0.12 * Math.abs(t - 0.5);
      const weighted = sum * centerPrior;
      if (weighted > bestVal) {
        bestVal = weighted;
        bestT = t;
      }
    }
    return `${Math.round(bestT * 100)}% 50%`;
  }

  // Tall image -> slide window vertically.
  const winH = Math.max(1, Math.min(sh, Math.round(sw / targetAspect)));
  const maxStart = sh - winH;
  if (maxStart <= 0) return "50% 50%";

  let bestT = 0.48;
  let bestVal = -1;
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const y0 = Math.round(t * maxStart);
    let sum = 0;
    for (let y = y0; y < y0 + winH; y++) {
      const row = y * sw;
      for (let x = 0; x < sw; x++) {
        sum += score[row + x];
      }
    }
    const midPrior = 1 - 0.12 * Math.abs(t - 0.48);
    const weighted = sum * midPrior;
    if (weighted > bestVal) {
      bestVal = weighted;
      bestT = t;
    }
  }
  return `50% ${Math.round(bestT * 100)}%`;
}

/**
 * Renders the first loadable image source and computes a content-aware
 * `object-position` crop so characters stay framed inside arbitrary aspect ratios.
 */
export function SmartCropImage({
  sources,
  alt,
  targetAspect = 4 / 3,
  className = "",
  fallbackNode = null,
}: SmartCropImageProps) {
  const sourcesKey = sources.join("|");
  const [loadState, setLoadState] = useState<{
    sourcesKey: string;
    idx: number;
    useCors: boolean;
  }>({ sourcesKey, idx: 0, useCors: true });
  const [crops, setCrops] = useState<Record<string, string>>({});

  const activeIdx = loadState.sourcesKey === sourcesKey ? loadState.idx : 0;
  const useCors = loadState.sourcesKey === sourcesKey ? loadState.useCors : true;
  const activeSrc = sources[activeIdx];

  if (!activeSrc) {
    return <>{fallbackNode}</>;
  }

  const cacheKey = `${activeSrc}|${targetAspect.toFixed(2)}`;
  const resolvedPos = crops[cacheKey] ?? cropCache.get(cacheKey) ?? "50% 45%";

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      key={`${activeSrc}|${useCors ? "cors" : "nocors"}`}
      src={activeSrc}
      alt={alt}
      crossOrigin={useCors ? "anonymous" : undefined}
      draggable={false}
      onLoad={(e) => {
        if (cropCache.has(cacheKey)) return;
        const img = e.currentTarget;
        const pos = useCors
          ? computeSmartObjectPosition(img, targetAspect)
          : img.naturalWidth / (img.naturalHeight || 1) > targetAspect
            ? "50% 50%"
            : "50% 45%";
        setBoundedCropCache(cacheKey, pos);
        setCrops((prev) =>
          prev[cacheKey] === pos ? prev : { ...prev, [cacheKey]: pos }
        );
      }}
      onError={() => {
        if (useCors) {
          setLoadState({ sourcesKey, idx: activeIdx, useCors: false });
        } else {
          setLoadState({ sourcesKey, idx: activeIdx + 1, useCors: true });
        }
      }}
      className={`${className} transition-[object-position] duration-300 ease-out`}
      style={{ objectPosition: resolvedPos }}
    />
  );
}
