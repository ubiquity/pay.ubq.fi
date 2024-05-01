import { execSync } from "child_process";
const commitHash = execSync("git rev-parse --short HEAD").toString().trim();

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    COMMIT_HASH: commitHash,
    SALT: process.env.SALT,
  },
};

export default nextConfig;
