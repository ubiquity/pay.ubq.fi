import * as esbuild from "esbuild";
import { polyfillNode } from "esbuild-plugin-polyfill-node";

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
  bundle: true,
  minify: false,
  define: {
    global: "globalThis",
  },
  external: ["@web3auth/openlogin-adapter/dist/types/openloginAdapter"],
  plugins: [
    polyfillNode({
      polyfills: {
        crypto: true,
        url: true,
        zlib: true,
        http: true,
        https: true,
        buffer: true,
      },
    }),
  ],
  loader: {
    ".png": "dataurl",
    ".woff": "dataurl",
    ".woff2": "dataurl",
    ".eot": "dataurl",
    ".ttf": "dataurl",
    ".svg": "dataurl",
  },
  outdir: "static/out",
} as esbuild.BuildOptions;
