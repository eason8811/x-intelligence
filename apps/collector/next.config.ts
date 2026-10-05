import type { NextConfig } from "next";
const config: NextConfig = {
  transpilePackages: [
    "@x-intelligence/shared",
    "@x-intelligence/x",
    "@x-intelligence/classifier",
  ],
};
export default config;
