/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    // !! ATTENZIONE !!
    // Disabilita i controlli TypeScript durante la build su Vercel
    ignoreBuildErrors: true,
  },
  eslint: {
    // Disabilita i controlli ESLint durante la build su Vercel
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
