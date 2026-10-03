import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SyntheticBanner } from "@/components/SyntheticBanner";

export const metadata: Metadata = {
  title: "Safari — provably-cheapest award travel",
  description:
    "Award-travel routing agent that constructs the provably-cheapest valid points itinerary and cannot price it until it resolves a Knowledge-Base contradiction.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          background: "#0b0b0c",
          color: "#e8e8ea",
          minHeight: "100vh",
        }}
      >
        {/* FR-11: synthetic-data label on every screen */}
        <SyntheticBanner />
        {children}
      </body>
    </html>
  );
}
