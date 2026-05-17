/** @type {import('next').NextConfig} */
const nextConfig = {
  // Next.js 16 promoted typedRoutes out of `experimental`.
  typedRoutes: true,
  // Both workspace packages ship as pre-built .js via their `exports` maps
  // (built to dist/). No transpilePackages needed.
};

export default nextConfig;
