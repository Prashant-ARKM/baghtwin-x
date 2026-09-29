import type { EngineeringReceipt } from "@/lib/api";

export default function WellSchematic({ state }: { state: EngineeringReceipt["current_state"] }) {
  return <div className="well-schematic">
    <div className="flex items-center justify-between px-6 pt-5"><span className="eyebrow">Well-to-surface twin</span><span className="schematic-tag">SCHEMATIC · NOT TO SCALE</span></div>
    <svg viewBox="0 0 620 330" role="img" aria-label={`Well schematic. Near-wellbore temperature ${state.temperature_c.toFixed(1)} degrees Celsius. Pump ${Math.round(state.fillage * 100)} percent full.`}>
      <defs>
        <pattern id="well-grid" width="22" height="22" patternUnits="userSpaceOnUse"><path d="M22 0H0V22" fill="none" stroke="#e6edf4" strokeWidth=".6" /></pattern>
        <linearGradient id="reservoir-heat"><stop stopColor="#c6ddfa" stopOpacity=".1"/><stop offset=".5" stopColor="#9bbde8" stopOpacity=".65"/><stop offset="1" stopColor="#c6ddfa" stopOpacity=".1"/></linearGradient>
      </defs>
      <rect width="620" height="330" fill="url(#well-grid)"/>
      <path d="M0 145Q100 139 190 148T370 145T620 147V330H0Z" fill="#edf2f7"/>
      <path d="M0 198Q130 180 280 206T620 197M0 246Q130 228 280 251T620 243M0 294Q130 276 280 299T620 290" fill="none" stroke="#dce5ee" strokeWidth="1.2"/>
      <ellipse cx="292" cy="279" rx="118" ry="36" fill="url(#reservoir-heat)"/>
      <ellipse cx="292" cy="279" rx="86" ry="24" fill="none" stroke="#95b8e5" strokeDasharray="4 5"/>
      <path d="M271 145V285H311V145" fill="#fbfdff" stroke="#8c9eb5" strokeWidth="2"/>
      <path d="M282 148V278H300V148" fill="#dfecfc" stroke="#6588b9" strokeWidth="2"/>
      <path d="M291 100V282" stroke="#2459a7" strokeWidth="3"/>
      <rect x="279" y="251" width="24" height="24" rx="3" fill="#2459a7"/>
      <path d="m288 233 4-7 4 7m-8-22 4-7 4 7m-8-22 4-7 4 7" stroke="#3874c5" fill="none" strokeWidth="2"/>
      <path d="M185 141h143M211 139l28-65 28 65M221 115h36" stroke="#58728e" strokeWidth="5" fill="none" strokeLinejoin="round"/>
      <path d="m194 77 96-24 10 20-104 17Z" fill="#244e82"/>
      <path d="M292 53Q315 62 308 93l-16 9Z" fill="#3267ad"/>
      <path d="M294 94v52" stroke="#285b99" strokeWidth="2"/>
      <circle cx="241" cy="73" r="7" fill="#f6f9fd" stroke="#244e82" strokeWidth="3"/>
      <circle cx="204" cy="121" r="12" fill="#c9d8e9" stroke="#58728e" strokeWidth="3"/>
      <path d="m204 121 4-36" stroke="#58728e" strokeWidth="3"/>
      <rect x="315" y="131" width="26" height="14" rx="2" fill="#d2e0ef" stroke="#7b96b7"/>
      <path d="M301 147h71v-30h36" stroke="#5c85b9" strokeWidth="3" fill="none"/>
      <g fontFamily="Segoe UI, sans-serif" fill="#66788f" fontSize="10">
        <path d="M319 65h67" stroke="#a5b7cd"/><circle cx="319" cy="65" r="3" fill="#2b62ad"/>
        <text x="395" y="59" letterSpacing="1">PUMP SETTING</text><text x="395" y="80" fill="#223b5b" fontSize="16" fontWeight="600">{state.spm.toFixed(1)} SPM × {state.stroke_m.toFixed(1)} m</text>
        <path d="M267 204h-65" stroke="#a5b7cd"/><circle cx="267" cy="204" r="3" fill="#2b62ad"/>
        <text x="58" y="196" letterSpacing="1">TUBING VISCOSITY</text><text x="58" y="218" fill="#223b5b" fontSize="17" fontWeight="600">{state.tubing_viscosity_cp.toFixed(0)} cP</text>
        <path d="M307 263h79" stroke="#a5b7cd"/><circle cx="307" cy="263" r="3" fill="#2b62ad"/>
        <text x="395" y="255" letterSpacing="1">NEAR-WELLBORE</text><text x="395" y="278" fill="#223b5b" fontSize="20" fontWeight="600">{state.temperature_c.toFixed(1)} °C</text>
        <text x="20" y="135" fontSize="9" letterSpacing="1.5">SURFACE</text><text x="20" y="316" fontSize="9" letterSpacing="1.5">RESERVOIR</text>
      </g>
    </svg>
    <div className="schematic-legend"><span><i className="bg-accent"/>Rod & pump</span><span><i className="bg-blue-200"/>Thermal region</span><span className="ml-auto capitalize">{state.phase} phase</span></div>
  </div>;
}
