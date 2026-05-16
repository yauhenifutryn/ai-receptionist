/** @type {import('next').NextConfig} */
const nextConfig = {
  // Next.js 16 promoted typedRoutes out of `experimental`.
  typedRoutes: true,
  // Workspace-internal packages must be transpiled by Next when imported as TS source.
  transpilePackages: ["@ai-receptionist/contracts"],
};

export default nextConfig;
