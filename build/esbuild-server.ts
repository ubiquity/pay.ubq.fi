import esbuild from "esbuild";
import { esBuildContext } from "./esbuild-build";

startServer().catch((error) => {
  console.error("Server startup error:", error);
  process.exit(1);
});

async function startServer() {
  const context = await esbuild.context(esBuildContext);
  const { port } = await context.serve({
    servedir: "static",
    port: 8080,
  });
  console.log(`Server running at http://localhost:${port}`);
}
