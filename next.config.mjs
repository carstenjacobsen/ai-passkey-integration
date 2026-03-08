import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    "passkey-kit",
    "passkey-factory-sdk",
    "passkey-kit-sdk",
    "sac-sdk",
  ],
  webpack: (config) => {
    // The stellar-sdk bindings module (CLI code-generation tool) tries to
    // require '../../package.json' with a wrong relative path at build time.
    // We don't need BindingGenerator at runtime — replace it with an empty stub.
    config.resolve.alias = {
      ...config.resolve.alias,
      // Only stub config.js (which requires '../../package.json' with wrong path)
      // Keep utils.js intact — contract/client.js depends on it
      [path.resolve(
        __dirname,
        "node_modules/@stellar/stellar-sdk/lib/minimal/bindings/config"
      )]: path.resolve(__dirname, "stubs/stellar-sdk-bindings-config.js"),
    };
    return config;
  },
};

export default nextConfig;
