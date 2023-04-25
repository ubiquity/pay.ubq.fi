import esbuild from "esbuild";

const init = async () => {
  const ctx = await esbuild.context({
    entryPoints: ["static/scripts/app.ts", "static/scripts/audit.ts", "static/styles/app.css", "static/styles/audit.css", "static/styles/toast.css"],
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
