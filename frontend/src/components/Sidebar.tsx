"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { label: "Well Twin", href: "/well-twin", ready: true },
  { label: "Risk", href: "/risk", ready: false },
  { label: "Optimizer", href: "/optimizer", ready: false },
  { label: "Replay", href: "/replay", ready: false },
  { label: "Credibility", href: "/credibility", ready: false },
  { label: "Audit", href: "/audit", ready: false },
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
