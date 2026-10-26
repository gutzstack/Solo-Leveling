import { ImageResponse } from "next/og";
import { AppIcon } from "../icon-art";

const SIZES = new Set(["192", "512"]);

export async function GET(_req: Request, ctx: { params: Promise<{ size: string }> }) {
  const { size } = await ctx.params;
  const px = SIZES.has(size) ? Number(size) : 192;
  return new ImageResponse(<AppIcon size={px} />, { width: px, height: px });
}
