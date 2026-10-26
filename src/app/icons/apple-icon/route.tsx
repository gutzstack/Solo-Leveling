import { ImageResponse } from "next/og";
import { AppIcon } from "../icon-art";

export async function GET() {
  return new ImageResponse(<AppIcon size={180} />, { width: 180, height: 180 });
}
