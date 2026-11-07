import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite", "postgres"],
  experimental: { serverActions: { bodySizeLimit: "10mb" } },
};

export default nextConfig;
