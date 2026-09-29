import type { Metadata } from "next";
import "./globals.css";
import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";

export const metadata: Metadata = {
  title: "BaghTwin-X — CSS + SRP Digital Twin (Demo)",
  description:
    "Digital twin demo for cyclic steam stimulation + rod-pump wells (SIH 26120, Oil India Limited, Baghewala). Simulation only — not a validated field twin.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <Header />
        <div className="flex min-h-[calc(100vh-3.5rem)]">
          <Sidebar />
          <main className="flex-1 px-8 py-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
