import { execSync } from "child_process";
import * as dotenv from "dotenv";
import esbuild from "esbuild";
import extraRpcs from "../lib/chainlist/constants/extraRpcs";

import * as dotenv from "dotenv";
import esbuild from "esbuild";
import chainlist from "../lib/chainlist/constants/extraRpcs";
const typescriptEntries = [
  "static/scripts/rewards/init.ts",
  "static/scripts/audit-report/audit.ts",
  "static/scripts/onboarding/onboarding.ts",
  "static/scripts/key-generator/keygen.ts",
];
const cssEntries = ["static/styles/rewards/rewards.css", "static/styles/audit-report/audit.css", "static/styles/onboarding/onboarding.css"];
export const entries = [...typescriptEntries, ...cssEntries];

const extraRpcs: Record<string, string[]> = {};
// this flattens all the rpcs into a single object, with key names that match the networkIds. The arrays are just of URLs per network ID.

Object.keys(chainlist).forEach((networkId) => {
  const officialUrls = chainlist[networkId].rpcs.filter((rpc) => typeof rpc === "string");
  const extraUrls: string[] = chainlist[networkId].rpcs.filter((rpc) => rpc.url !== undefined && rpc.tracking === "none").map((rpc) => rpc.url);
  extraRpcs[networkId] = [...officialUrls, ...extraUrls];
});

export const esBuildContext: esbuild.BuildOptions = {
  sourcemap: true,
  entryPoints: entries,
  bundle: true,
  minify: false,
  loader: {
    ".png": "dataurl",
    ".woff": "dataurl",
    ".woff2": "dataurl",
    ".eot": "dataurl",
    ".ttf": "dataurl",
    ".svg": "dataurl",
  },
  outdir: "static/out",
  define: createEnvDefines(["SUPABASE_URL", "SUPABASE_ANON_KEY"], {
    extraRpcs,
    commitHash: execSync(`git rev-parse --short HEAD`).toString().trim(),
  }),
};

esbuild
  .build(esBuildContext)
  .then(() => {
    console.log("\tesbuild complete");
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

function createEnvDefines(environmentVariables: string[], generatedAtBuild: Record<string, unknown>): Record<string, string> {
  const defines: Record<string, string> = {};
  dotenv.config();
  for (const name of environmentVariables) {
    const envVar = process.env[name];
    if (envVar !== undefined) {
      defines[name] = JSON.stringify(envVar);
    } else {
      throw new Error(`Missing environment variable: ${name}`);
    }
  }
  for (const key in generatedAtBuild) {
    if (Object.prototype.hasOwnProperty.call(generatedAtBuild, key)) {
      defines[key] = JSON.stringify(generatedAtBuild[key]);
    }
  }
  return defines;
}
