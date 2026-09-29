export default function Header() {
  return (
    <header className="flex h-16 items-center justify-between border-b border-line/90 bg-white/95 px-4 shadow-[0_1px_0_rgba(15,23,42,0.02)] backdrop-blur sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#123e8a] text-xs font-bold tracking-tight text-white shadow-sm">BX</span>
        <div className="min-w-0">
          <span className="block text-sm font-bold tracking-tight text-ink">BaghTwin-X</span>
          <span className="hidden text-[11px] text-muted md:block">CSS + SRP decision support</span>
        </div>
        <span className="hidden text-xs text-muted sm:inline">
          <span className="mx-1.5 text-line">/</span> Baghewala field
        </span>
      </div>
      <span
        title="All data is synthetic; outputs are simulated and not field-validated."
        className="shrink-0 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.09em] text-amber-800"
      >
        Simulation — synthetic data
      </span>
    </header>
  );
}
