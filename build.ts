import esbuild from "esbuild";

esbuild.build({
  entryPoints: ["static/scripts/app.ts", "static/styles/app.css"],
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
