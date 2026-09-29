export type IconName = "overview" | "well" | "risk" | "optimizer" | "replay" | "credibility" | "audit" | "arrow";
const paths: Record<IconName, string> = {
  overview: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  well: "M4 20h16 M8 20l4-12 4 12 M4 7l15-3 M18 4v10 M5 7v5 M10 12h4",
  risk: "M12 3 2 21h20L12 3z M12 9v5 M12 17v1",
  optimizer: "M4 7h16 M4 17h16 M9 4v6 M16 14v6",
  replay: "M4 10a8 8 0 1 1 1 8 M4 4v6h6 M11 8l5 4-5 4z",
  credibility: "M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6l-8-3z M8 12l3 3 5-6",
  audit: "M7 3h10v4H7z M7 5H4v16h16V5h-3 M8 12h8 M8 16h6",
  arrow: "M4 12h16 M14 6l6 6-6 6",
};
export default function Icon({ name, className = "" }: { name: IconName; className?: string }) {
  return <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
