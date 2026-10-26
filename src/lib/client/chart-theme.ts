"use client";
import { ATTRIBUTES } from "@/lib/domain/attributes";
import type { AttributeCode } from "@/lib/domain/types";

/** Chart tokens per theme. Series hues come from the validated categorical palette (fixed order). */
export interface ChartTheme {
  surface: string;
  text: string;
  textDim: string;
  grid: string;
  axis: string;
  series: string[];
  accent: string;
  attribute: Record<AttributeCode, string>;
}

const DARK_SERIES = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"];
const LIGHT_SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];

export function chartTheme(theme: "dark" | "light"): ChartTheme {
  const dark = theme === "dark";
  return {
    surface: dark ? "#0b1328" : "#ffffff",
    text: dark ? "#e6f0ff" : "#0b1328",
    textDim: dark ? "#93a4c8" : "#364566",
    grid: dark ? "rgba(147,164,200,0.12)" : "rgba(54,69,102,0.12)",
    axis: dark ? "rgba(147,164,200,0.35)" : "rgba(54,69,102,0.35)",
    series: dark ? DARK_SERIES : LIGHT_SERIES,
    accent: dark ? "#38bdf8" : "#0369a1",
    attribute: Object.fromEntries(ATTRIBUTES.map((a) => [a.code, dark ? a.color : a.colorLight])) as Record<AttributeCode, string>,
  };
}
