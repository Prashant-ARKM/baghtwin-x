"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { label: "Overview", href: "/", ready: true },
  { label: "Well Twin", href: "/well-twin", ready: true },
  { label: "Risk", href: "/risk", ready: true },
  { label: "Optimizer", href: "/optimizer", ready: true },
  { label: "Replay", href: "/replay", ready: true },
  { label: "Credibility", href: "/credibility", ready: true },
  { label: "Audit", href: "/audit", ready: true },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-60 shrink-0 border-r border-line bg-white">
      <nav className="flex flex-col p-3" aria-label="Main navigation">
        {tabs.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={`mb-1 flex items-center justify-between rounded-md px-3 py-2 text-sm ${
                active
                  ? "bg-accent/10 font-medium text-accent"
                  : "text-muted hover:bg-page hover:text-ink"
              }`}
            >
              {tab.label}
              {!tab.ready && (
                <span className="text-[10px] uppercase tracking-wide text-line">
                  soon
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
