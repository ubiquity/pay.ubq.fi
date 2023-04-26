import esbuild from "esbuild";
import { entries } from "./static/scripts/entries";

const init = async () => {
  const ctx = await esbuild.context({
    entryPoints: entries,
    bundle: true,
    minify: false,
    sourcemap: true,
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

  const { host, port } = await ctx.serve({
    servedir: "static",
    port: 8080,
  });
};
init();
