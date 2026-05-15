/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    typedRoutes: true,
  },
  // Workspace-internal packages must be transpiled by Next when imported as TS source.
  transpilePackages: ["@ai-receptionist/contracts"],
};

export default nextConfig;
