import esbuild from "esbuild";
const typescriptEntries = [
  "static/scripts/devpool-claims/index.ts",
  "static/scripts/audit-report/audit.ts",
  "static/scripts/onboarding/onboarding.ts",
  "static/scripts/key-generator/keygen.ts",
];
const CSSEntries = ["static/styles/devpool-claims/devpool-claims.css", "static/styles/audit-report/audit.css", "static/styles/onboarding/onboarding.css"];
export const entries = [...typescriptEntries, ...CSSEntries];

export let esBuildContext = {
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
} as esbuild.BuildOptions;
