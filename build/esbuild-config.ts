import * as dotenv from "dotenv";
import esbuild from "esbuild";

const typescriptEntries = [
  "static/scripts/rewards/index.ts",
  "static/scripts/audit-report/audit.ts",
  "static/scripts/onboarding/onboarding.ts",
  "static/scripts/key-generator/keygen.ts",
];
const CSSEntries = ["static/styles/rewards/rewards.css", "static/styles/audit-report/audit.css", "static/styles/onboarding/onboarding.css"];
export const entries = [...typescriptEntries, ...CSSEntries];

export let esBuildContext = {
  sourcemap: true,
  entryPoints: entries,
  //plugins: [invertColors],
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
  define: createEnvDefines(["SUPABASE_URL", "SUPABASE_KEY"]),
} as esbuild.BuildOptions;

function createEnvDefines(variableNames: string[]): Record<string, string> {
  const defines: Record<string, string> = {};
  dotenv.config();
  for (const name of variableNames) {
    const envVar = process.env[name];
    if (envVar !== undefined) {
      defines[`process.env.${name}`] = JSON.stringify(envVar);
    } else {
      throw new Error(`Missing environment variable: ${name}`);
    }
  }
  return defines;
}
