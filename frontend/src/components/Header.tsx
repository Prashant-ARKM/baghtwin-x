export default function Header() {
  return (
    <header className="flex h-14 items-center justify-between border-b border-line bg-white px-6">
      <div className="flex items-baseline gap-3">
        <span className="text-sm font-semibold tracking-tight">BaghTwin-X</span>
        <span className="hidden text-xs text-muted sm:inline">
          Well-to-surface digital twin, Baghewala (demo)
        </span>
      </div>
      <span
        title="All data is synthetic; outputs are simulated and not field-validated."
        className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-800"
      >
        Simulation — synthetic data
      </span>
    </header>
  );
}
