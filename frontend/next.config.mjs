import { PHASE_DEVELOPMENT_SERVER } from "next/constants.js";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // react-plotly.js ships untranspiled ESM/CJS mixed sources; Next.js
  // recommends transpiling it.
  transpilePackages: ["react-plotly.js"],
};

// Keep production builds from overwriting chunks served by `npm run dev`.
export default (phase) => ({
  ...nextConfig,
  distDir: phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next",
});
