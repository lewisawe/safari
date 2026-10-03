import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Inter, Inter_Tight } from "next/font/google";
import { SyntheticBanner } from "@/components/SyntheticBanner";
import { SiteNav } from "@/components/SiteNav";

// jobyText substitute → Inter (humanist sans with the same weight gradations).
const interText = Inter({
  subsets: ["latin"],
  variable: "--font-jobytext",
  display: "swap",
});

// jobyDisplay substitute → Inter Tight (low-contrast grotesque for the display
// slot; the compressed letterforms echo the brand's tight-tracked headlines).
const interDisplay = Inter_Tight({
  subsets: ["latin"],
  variable: "--font-jobydisplay",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Safari — provably-cheapest award travel",
  description:
    "Award-travel routing agent that constructs the provably-cheapest valid points itinerary and cannot price it until it resolves a Knowledge-Base contradiction.",
  icons: { icon: "/icon.svg" },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${interText.variable} ${interDisplay.variable}`}>
      <body className="min-h-screen">
        {/* FR-11: synthetic-data label on every screen */}
        <SyntheticBanner />
        <SiteNav />
        {children}
      </body>
    </html>
  );
}
