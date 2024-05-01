import { execSync } from "child_process";
const commitHash = execSync("git rev-parse --short HEAD").toString().trim();

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    COMMIT_HASH: commitHash,
    SALT: process.env.SALT,
  },
};

export default nextConfig;
