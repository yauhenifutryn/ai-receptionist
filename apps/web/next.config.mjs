/** @type {import('next').NextConfig} */
const nextConfig = {
  // Next.js 16 promoted typedRoutes out of `experimental`.
  typedRoutes: true,
  // Both workspace packages ship as pre-built .js via their `exports` maps
  // (built to dist/). No transpilePackages needed.

  // Trace ontology markdown into the deploy bundle so the operator-only
  // /dashboard/ontology page can readFile() them at runtime on Vercel. The
  // files live in apps/backend/ontology/ (one level up + over). Without
  // this include, the lambda's filesystem doesn't contain them.
  outputFileTracingIncludes: {
    "/dashboard/ontology": ["../backend/ontology/**/*.md"],
  },
};

export default nextConfig;
