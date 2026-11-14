import type { NextConfig } from "next";
const config: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  transpilePackages: [
    "@x-intelligence/db",
    "@x-intelligence/shared",
    "@x-intelligence/x",
    "@x-intelligence/classifier",
  ],
  images: {
    remotePatterns: [{ protocol: "https", hostname: "pbs.twimg.com" }],
  },
};
export default config;
