// output: 'export' produces a plain static HTML/CSS/JS bundle instead of
// Next's normal server build — that's what Capacitor wraps into the Android
// app (it has no Node server to run against). Gated behind CAPACITOR_BUILD
// so the live Vercel deployment of taskezy.in (a normal `next build`, no env
// var set) is completely unaffected — only `npm run build:capacitor` opts in.
const isCapacitorBuild = process.env.CAPACITOR_BUILD === "true";

/** @type {import('next').NextConfig} */
const nextConfig = {
  ...(isCapacitorBuild ? { output: "export" } : {})
};

export default nextConfig;
