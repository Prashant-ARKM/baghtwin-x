import type { Metadata } from "next";
import "./globals.css";
import DesktopShell from "@/components/DesktopShell";

export const metadata: Metadata = {
  title: "BaghTwin-X — CSS + SRP Digital Twin (Demo)",
  other: { "color-scheme": "light only" },
  description:
    "Digital twin demo for cyclic steam stimulation + rod-pump wells (SIH 26120, Oil India Limited, Baghewala). Simulation only — not a validated field twin.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" style={{ colorScheme: "light" }}>
      <body>
        <DesktopShell>{children}</DesktopShell>
      </body>
    </html>
  );
}
