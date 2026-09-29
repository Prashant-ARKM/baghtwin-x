/** @type {import('next').NextConfig} */
const nextConfig = {
  // react-plotly.js ships untranspiled ESM/CJS mixed sources; Next.js
  // recommends transpiling it.
  transpilePackages: ["react-plotly.js"],
};

export default nextConfig;
