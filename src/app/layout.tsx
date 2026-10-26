import type { Metadata, Viewport } from "next";
import "@fontsource/orbitron/500.css";
import "@fontsource/orbitron/700.css";
import "@fontsource/orbitron/900.css";
import "@fontsource/rajdhani/latin-400.css";
import "@fontsource/rajdhani/latin-500.css";
import "@fontsource/rajdhani/latin-600.css";
import "@fontsource/rajdhani/latin-700.css";
import "@fontsource-variable/jetbrains-mono";
import "./globals.css";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: { default: "SYSTEM IRL", template: "%s · SYSTEM IRL" },
  description: "A real-life RPG progression system. Every real-world action contributes to the evolution of the Player.",
  applicationName: "SYSTEM IRL",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "SYSTEM IRL", statusBarStyle: "black-translucent" },
  icons: { icon: "/icons/icon.svg", apple: "/icons/apple-icon" },
};

export const viewport: Viewport = {
  themeColor: "#04060d",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body className="min-h-dvh antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
