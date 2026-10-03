import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Sanity Studio (sanity/) has its own tsconfig and is not part of the
  // Next.js type-check surface; the embedded Studio is mounted separately.
};

export default nextConfig;
