import extraRpcs from "../lib/chainlist/constants/extraRpcs";
import esbuild from "esbuild";
import * as dotenv from "dotenv";
const typescriptEntries = [
  "static/scripts/rewards/index.ts",
  "static/scripts/audit-report/audit.ts",
  "static/scripts/onboarding/onboarding.ts",
  "static/scripts/key-generator/keygen.ts",
];
const cssEntries = ["static/styles/rewards/rewards.css", "static/styles/audit-report/audit.css", "static/styles/onboarding/onboarding.css"];
export const entries = [...typescriptEntries, ...cssEntries];

const allNetworkUrls: Record<string, string[]> = {};
// this flattens all the rpcs into a single object, with key names that match the networkIds. The arrays are just of URLs per network ID.

Object.keys(extraRpcs).forEach((networkId) => {
  const officialUrls = extraRpcs[networkId].rpcs.filter((rpc) => typeof rpc === "string");
  const extraUrls: string[] = extraRpcs[networkId].rpcs.filter((rpc) => rpc.url !== undefined).map((rpc) => rpc.url);
  allNetworkUrls[networkId] = [...officialUrls, ...extraUrls];
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
  define: createEnvDefines(["SUPABASE_URL", "SUPABASE_ANON_KEY"], { allNetworkUrls }),
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

function createEnvDefines(envVarNames: string[], extras: Record<string, unknown>): Record<string, string> {
  const defines: Record<string, string> = {};
  dotenv.config();
  for (const name of envVarNames) {
    const envVar = process.env[name];
    if (envVar !== undefined) {
      defines[name] = JSON.stringify(envVar);
    } else {
      throw new Error(`Missing environment variable: ${name}`);
    }
  }
  for (const key in extras) {
    if (Object.prototype.hasOwnProperty.call(extras, key)) {
      defines[key] = JSON.stringify(extras[key]);
    }
  }
  defines["extraRpcs"] = JSON.stringify(extraRpcs);
  return defines;
}
