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

  // F6: security headers. Applied globally at the edge.
  //
  // CSP notes:
  // - 'unsafe-inline' on script-src remains because Next.js 16 still emits
  //   some inline bootstrap scripts. Tighten to nonces in a follow-up PR
  //   (requires switching to nonce-based middleware) once the rest of
  //   the security work has settled.
  // - 'unsafe-inline' on style-src is for Tailwind CSS-in-JS at runtime.
  // - connect-src includes wss://*.elevenlabs.io for ConvAI WebSocket.
  // - frame-ancestors 'none' blocks the dashboard from being iframed
  //   (clickjacking defense; pairs with X-Frame-Options below).
  //
  // microphone=(self) in Permissions-Policy is REQUIRED for the in-browser
  // test widget (mic capture). camera/geolocation explicitly denied.
  async headers() {
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://*.elevenlabs.io https://va.vercel-scripts.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.elevenlabs.io wss://*.elevenlabs.io",
      "media-src 'self' blob:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; ");

    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(self), geolocation=(), payment=()",
          },
          { key: "Content-Security-Policy", value: csp },
        ],
      },
    ];
  },
};

export default nextConfig;
