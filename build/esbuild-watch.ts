import esbuild from "esbuild";
import { esBuildContext } from "./esbuild-build";

async function watch() {
  const ctx = await esbuild.context(esBuildContext);
  await ctx.watch();
  console.log("Watching...");
}

// The following expression MUST NOT be awaited.
void watch().catch((err) => {
  console.error("Error watching:", err);
});
