/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The mocked Web3 layer and shared package are TS source; transpile the
  // workspace package so Next can consume it without a prebuild step.
  transpilePackages: ["@nftickets/shared"],
  webpack(config) {
    // @nftickets/shared uses `verbatimModuleSyntax` and imports its own modules
    // with explicit `.js` extensions (e.g. `./eip712.js`) that resolve to `.ts`
    // source. Teach webpack to map `.js` -> `.ts`/`.tsx` so it can resolve the
    // raw TS source without a prebuild step (tsc/vitest already handle this).
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },
  // The PWA service worker lives in /public/sw.js and is registered client-side
  // (see src/components/service-worker-register.tsx). Ensure the SW scope and
  // manifest are served with sensible headers.
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
