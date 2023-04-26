import esbuild from "esbuild";
import { entries } from "./static/scripts/entries";

esbuild.build({
  entryPoints: entries,
  bundle: true,
  minify: true,
  loader: {
    ".png": "dataurl",
    ".woff": "dataurl",
    ".woff2": "dataurl",
    ".eot": "dataurl",
    ".ttf": "dataurl",
    ".svg": "dataurl",
  },
  outdir: "static/out",
});
