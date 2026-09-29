import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { BRAND } from "@/lib/brand";

// Every face ships with the app. The tool runs offline, so nothing loads from a font CDN.
const display = localFont({
  variable: "--font-display",
  display: "block",
  src: [
    { path: "./fonts/big-shoulders-display-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "./fonts/big-shoulders-display-latin-700-normal.woff2", weight: "700", style: "normal" },
    { path: "./fonts/big-shoulders-display-latin-800-normal.woff2", weight: "800", style: "normal" },
  ],
});

const body = localFont({
  variable: "--font-body",
  display: "block",
  src: [
    { path: "./fonts/manrope-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/manrope-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "./fonts/manrope-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "./fonts/manrope-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
});

const code = localFont({
  variable: "--font-code",
  display: "block",
  src: [
    { path: "./fonts/jetbrains-mono-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/jetbrains-mono-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "./fonts/jetbrains-mono-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
});

export const metadata: Metadata = {
  title: BRAND.product,
  description: BRAND.tagline,
};

export const viewport: Viewport = { themeColor: "#0e1012" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${code.variable}`}>
      <body>{children}</body>
    </html>
  );
}
