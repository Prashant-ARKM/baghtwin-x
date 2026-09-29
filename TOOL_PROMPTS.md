# Tool Prompts and Night Plan

Time available: about 21:00 to 06:00. Suggested night plan first, then copy-paste prompts.

## Night plan

| Time | Job | Tool |
|---|---|---|
| 21:00-22:00 | Scaffold both projects, hello-world API and page, CORS, README, run once | Freebuff (Prompt 1) |
| 22:00-23:15 | Physics: synthetic well, thermal, viscosity, wellbore, pump, risk | Claude (files delivered here) |
| 23:15-00:15 | API routes wired to physics, tests running | Freebuff (Prompt 2) |
| 00:15-01:15 | Optimizer, constraints, receipt | Claude |
| 01:15-03:45 | Frontend tabs: Well Twin, Risk, Optimizer | Freebuff (Prompts 3-5), styling via ChatGPT |
| 03:45-04:45 | Replay, credibility, audit log, traceability | Freebuff (Prompts 6-7) |
| 04:45-05:30 | Demo mode, bug fixing, full run-through | Freebuff + Claude for hard bugs |
| 05:30-06:00 | Record fallback video, final README | You |

Cut order if behind: ML extras (none required), traceability table, replay accuracy metrics, extra polish. Never cut: the story, the optimizer, the constraint test, the SIMULATION labels.

## Prompt 1: Freebuff scaffold (do this before 22:00)

Read BUILD_BRIEF.md in this repo. Create the project skeleton exactly as described in Sections 3 and 4: a backend folder with FastAPI (Python), an empty physics, optimizer, simdata, api and tests folder structure, and a frontend folder with Next.js, TypeScript, Tailwind and react-plotly.js. Add a GET /api/health endpoint on port 8000 with CORS allowed for localhost:3000. Make the frontend home page call it and show "Backend connected". Add a requirements file, a README with the two commands to run backend and frontend, and a dark theme base layout with a left sidebar (tabs: Well Twin, Risk, Optimizer, Replay and Credibility) and a header containing a permanent SIMULATION badge. Run both and confirm they work. Do not implement physics.

## Prompt 2: Freebuff API wiring (after Claude delivers physics files)

Read BUILD_BRIEF.md Section 5. The physics modules are already in backend/physics and backend/simdata. Implement the FastAPI routes for /api/well, /api/timeline, /api/state, /api/simulate and /api/credibility exactly as specified, calling the physics functions. Do not modify physics files. Add pydantic models matching the contract. Run the tests in backend/tests and report failures.

## Prompt 3: Freebuff Well Twin tab

Read BUILD_BRIEF.md Sections 5 and 7. Build the Well Twin tab against the real API: a day slider with a Play button, an SVG pump animation whose speed follows SPM, temperature and viscosity Plotly charts with a moving marker, a dynamometer card chart, and constraint margin bars. Use the /api/timeline and /api/state endpoints. Match the clean light professional theme.

## Prompt 4: Freebuff Risk tab

Read BUILD_BRIEF.md. Build the Risk tab: float probability over time from /api/timeline, alert threshold line, a marked float event day, the plain-language risk reason, and a toggle comparing fixed baseline settings with twin-recommended settings.

## Prompt 5: Freebuff Optimizer tab (after Claude delivers optimizer)

Read BUILD_BRIEF.md. Build the Optimizer tab: sliders for steam volume, injection pressure, soak days, cut-off day, SPM and stroke that call /api/simulate live, result cards for oil, SOR, energy and risk, an Optimize button calling /api/optimize, a Pareto scatter plot with the recommended point highlighted, active constraint badges, and the engineering receipt panel with Approve and Reject buttons posting to /api/recommendations/approve.

## Prompt 6: Freebuff Replay and Credibility tab

Read BUILD_BRIEF.md. Build the Replay and Credibility tab: baseline vs recommendation chart from /api/replay, error metrics, the modelled-vs-assumed table and parameter tags from /api/credibility, and the audit log from /api/recommendations.

## Prompt 7: Freebuff Demo mode and traceability

Read BUILD_BRIEF.md. Add a Demo mode button that automatically walks through the story in Section 1: it advances the cycle day, highlights the alert moment, opens the optimizer recommendation, and shows the receipt, with short caption text at each step. Add a Traceability section mapping each line of the problem statement to the feature that answers it.

## ChatGPT (Go or standard chat) uses

- Styling: "Give me a Tailwind clean light professional theme palette and card styles for a control-room dashboard."
- Caption text for Demo mode, and the 3-minute spoken script.
- Practice questions from a skeptical petroleum engineer, with answers drawn from the modelled-vs-assumed table.

## Codex (Astra) reserve

Use only for one hard job: a final visual polish pass on the Well Twin tab, or a bug Freebuff and Claude could not solve.
