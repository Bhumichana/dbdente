import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    // codec WASM ของ Cornerstone (charls, openjpeg ฯลฯ) มีโค้ดสำหรับ Node ที่ require("fs"/"path")
    // ฝั่ง browser ไม่ได้ใช้ จึงชี้ไปโมดูลว่าง
    resolveAlias: {
      fs: { browser: "./src/lib/empty-module.ts" },
      path: { browser: "./src/lib/empty-module.ts" },
    },
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
