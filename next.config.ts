import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // Font tiếng Việt dùng để vẽ PDF báo cáo lưu trữ.
  outputFileTracingIncludes: {
    "/api/cron/reports": ["./assets/fonts/**/*"],
    "/api/reports/archive": ["./assets/fonts/**/*"],
  },
  partialPrefetching: true,
  turbopack: {
    root: import.meta.dirname,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
