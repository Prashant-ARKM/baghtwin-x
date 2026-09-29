"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import Icon, { type IconName } from "@/components/Icon";
import GuidedTour from "@/components/GuidedTour";
const groups: { title: string; tabs: { label: string; href: string; icon: IconName }[] }[] = [
  { title: "Workspace", tabs: [
    { label: "Overview", href: "/", icon: "overview" },
    { label: "Well Twin", href: "/well-twin", icon: "well" },
    { label: "Risk intelligence", href: "/risk", icon: "risk" },
    { label: "Optimizer", href: "/optimizer", icon: "optimizer" },
  ] },
  { title: "Validation & records", tabs: [
    { label: "Cycle replay", href: "/replay", icon: "replay" },
    { label: "Model credibility", href: "/credibility", icon: "credibility" },
    { label: "Decision audit", href: "/audit", icon: "audit" },
  ] },
];
export default function DesktopShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("baghtwin.sidebar.collapsed") === "true");
      setTourOpen(localStorage.getItem("baghtwin.tour.v1") !== "seen");
    } catch { /* The interface also works when browser storage is unavailable. */ }
  }, []);
  useEffect(() => {
    // Plotly listens for window resizing; the sidebar also changes chart widths.
    const timer = window.setTimeout(() => window.dispatchEvent(new Event("resize")), 240);
    return () => window.clearTimeout(timer);
  }, [collapsed]);
  function toggleSidebar() {
    const value = !collapsed;
    setCollapsed(value);
    try { localStorage.setItem("baghtwin.sidebar.collapsed", String(value)); } catch { /* Optional preference. */ }
  }
  function closeTour() {
    setTourOpen(false);
    try { localStorage.setItem("baghtwin.tour.v1", "seen"); } catch { /* Optional preference. */ }
  }
  const active = groups.flatMap(g => g.tabs).find(t => t.href === pathname);
  return <>
    <a href="#workspace" className="skip-link">Skip to workspace</a>
    <aside id="desktop-navigation" className={`desktop-sidebar ${collapsed ? "sidebar-collapsed" : ""}`}>
      <Link href="/" className="brand-lockup" aria-label="BaghTwin-X overview"><span className="brand-symbol"><Icon name="well" /></span><span><strong>BaghTwin<span className="text-accent">-X</span></strong><small>INTEGRATED WELL INTELLIGENCE</small></span></Link>
      <div className="asset-label"><span className="asset-initial">BW</span><div><b>Baghewala</b><small>Heavy-oil field · Well A</small></div></div>
      <nav aria-label="Main navigation" className="sidebar-nav">
        {groups.map(group => <div key={group.title} className="nav-group"><p className="eyebrow">{group.title}</p>{group.tabs.map(tab => <Link key={tab.href} href={tab.href} aria-label={tab.label} title={collapsed ? tab.label : undefined} aria-current={pathname === tab.href ? "page" : undefined} className={`nav-item ${pathname === tab.href ? "is-active" : ""}`}><Icon name={tab.icon} /><span>{tab.label}</span>{pathname === tab.href && <span className="active-mark" />}</Link>)}</div>)}
      </nav>
      <div className="sidebar-bottom"><div className="flex items-center gap-2"><Icon name="credibility" /><b>Engineer in control</b></div><p>Recommendations reviewed by a human. Every decision recorded.</p><span className="eyebrow">L2 · Recommend only</span></div>
      <div className="sidebar-foot">SIH 26120 <span>Oil India Limited</span></div>
    </aside>
    <div className={`desktop-workspace ${collapsed ? "workspace-expanded" : ""}`}>
      <header className="desktop-header"><div className="flex items-center gap-4"><button type="button" className="sidebar-toggle" onClick={toggleSidebar} aria-expanded={!collapsed} aria-controls="desktop-navigation" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} title={collapsed ? "Expand sidebar" : "Collapse sidebar"}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/><path d={collapsed ? "m13 9 3 3-3 3" : "m17 9-3 3 3 3"}/></svg></button><div className="breadcrumb"><span>Workspace</span><span className="text-slate-300">/</span><strong>{active?.label ?? "BaghTwin-X"}</strong></div></div><div className="flex items-center gap-5"><button type="button" className="tour-launch" onClick={() => setTourOpen(true)}><span aria-hidden="true">?</span>Take a tour</button><span className="simulation-badge"><span />Simulation · synthetic data</span><span className="header-context">CSS + SRP</span></div></header>
      <main id="workspace" className="workspace-content">{children}</main>
      <footer className="workspace-footer"><span>BaghTwin-X · Integrated CSS + SRP digital twin</span><span>Synthetic simulation · Not field-validated</span></footer>
    </div>
    {tourOpen && <GuidedTour onClose={closeTour} />}
  </>;
}
