"use client";

import { isUpper, mesialOnRight, STATUS_STYLE } from "@/lib/fdi";
import type { Surface, ToothRecord } from "@/lib/types";

type Region = "top" | "bottom" | "left" | "right" | "center";

/** แปลงตำแหน่งบนรูปเป็นด้านของฟัน ตามตำแหน่งซี่ในปาก */
export function regionToSurface(tooth: number, region: Region): Surface {
  if (region === "center") return "O";
  const upper = isUpper(tooth);
  if (region === "top") return upper ? "B" : "L";
  if (region === "bottom") return upper ? "L" : "B";
  const mRight = mesialOnRight(tooth);
  if (region === "right") return mRight ? "M" : "D";
  return mRight ? "D" : "M";
}

const REGIONS: { region: Region; points: (s: number) => string }[] = [
  { region: "top", points: (s) => `0,0 ${s},0 ${s * 0.7},${s * 0.3} ${s * 0.3},${s * 0.3}` },
  { region: "bottom", points: (s) => `0,${s} ${s},${s} ${s * 0.7},${s * 0.7} ${s * 0.3},${s * 0.7}` },
  { region: "left", points: (s) => `0,0 ${s * 0.3},${s * 0.3} ${s * 0.3},${s * 0.7} 0,${s}` },
  { region: "right", points: (s) => `${s},0 ${s * 0.7},${s * 0.3} ${s * 0.7},${s * 0.7} ${s},${s}` },
  {
    region: "center",
    points: (s) => `${s * 0.3},${s * 0.3} ${s * 0.7},${s * 0.3} ${s * 0.7},${s * 0.7} ${s * 0.3},${s * 0.7}`,
  },
];

export function ToothGlyph({
  tooth,
  record,
  size = 36,
  onSurface,
  showLetters = false,
  fluid = false,
}: {
  tooth: number;
  record?: ToothRecord;
  size?: number;
  onSurface?: (s: Surface) => void;
  showLetters?: boolean;
  /** ยืดตามความกว้างกล่อง (ใช้ในผังฟัน) */
  fluid?: boolean;
}) {
  const missing = record?.whole === "missing";
  const s = size;
  return (
    <svg
      width={fluid ? "100%" : s}
      height={fluid ? undefined : s}
      viewBox={`-1 -1 ${s + 2} ${s + 2}`}
      className="block aspect-square overflow-visible"
    >
      {REGIONS.map(({ region, points }) => {
        const surface = regionToSurface(tooth, region);
        const st = record?.surfaces?.[surface];
        return (
          <g key={region}>
            <polygon
              points={points(s)}
              fill={st ? STATUS_STYLE[st].fill : "#ffffff"}
              stroke="#94a3b8"
              strokeWidth={1}
              opacity={missing ? 0.35 : 1}
              onClick={
                onSurface
                  ? (e) => {
                      e.stopPropagation();
                      onSurface(surface);
                    }
                  : undefined
              }
              className={onSurface ? "cursor-pointer hover:opacity-80" : undefined}
            />
            {showLetters && (
              <text
                x={region === "left" ? s * 0.15 : region === "right" ? s * 0.85 : s / 2}
                y={region === "top" ? s * 0.17 : region === "bottom" ? s * 0.87 : s / 2 + 5}
                textAnchor="middle"
                fontSize={s * 0.11}
                fontWeight={600}
                fill={st ? "#fff" : "#475569"}
                pointerEvents="none"
              >
                {surface}
              </text>
            )}
          </g>
        );
      })}
      {missing && (
        <g stroke="#0f172a" strokeWidth={2.5} strokeLinecap="round" pointerEvents="none">
          <line x1={3} y1={3} x2={s - 3} y2={s - 3} />
          <line x1={s - 3} y1={3} x2={3} y2={s - 3} />
        </g>
      )}
    </svg>
  );
}
