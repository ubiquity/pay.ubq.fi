const encoder = new TextEncoder();
const markerPath = "dist/build-source-hash.txt";
const sourceRoots = [
	"index.html",
	"package.json",
	"deno.jsonc",
	"deno.lock",
	"vite.config.ts",
	"tsconfig.json",
	"src",
	"public",
	"lib",
	"scripts/build.ts",
];

async function listFiles(path: string): Promise<string[]> {
	const stat = await Deno.stat(path);
	if (stat.isFile) {
		return [path];
	}
	if (!stat.isDirectory) {
		return [];
	}

	const entries: string[] = [];
	for await (const entry of Deno.readDir(path)) {
		entries.push(`${path}/${entry.name}`);
	}

	const files = await Promise.all(
		entries.sort().map((entry) => listFiles(entry)),
	);
	return files.flat();
}

async function sourceHash() {
	const chunks: Uint8Array[] = [];
	for (const root of sourceRoots) {
		try {
			for (const file of await listFiles(root)) {
				chunks.push(encoder.encode(`${file}\0`));
				chunks.push(await Deno.readFile(file));
				chunks.push(encoder.encode("\0"));
			}
		} catch (error) {
			if (!(error instanceof Deno.errors.NotFound)) {
				throw error;
			}
		}
	}

	const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
	const input = new Uint8Array(length);
	let offset = 0;
	for (const chunk of chunks) {
		input.set(chunk, offset);
		offset += chunk.length;
	}

	const digest = await crypto.subtle.digest("SHA-256", input);
	return Array.from(new Uint8Array(digest), (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("");
}

async function hasCurrentDist(hash: string) {
	try {
		const [marker] = await Promise.all([
			Deno.readTextFile(markerPath),
			Deno.stat("dist/index.html"),
		]);
		return marker.trim() === hash;
	} catch (error) {
		if (error instanceof Deno.errors.NotFound) {
			return false;
		}
		throw error;
	}
}

const hash = await sourceHash();
if (await hasCurrentDist(hash)) {
	console.log("dist is already built for this source; skipping Vite build.");
	Deno.exit(0);
}

const command = new Deno.Command(Deno.execPath(), {
	args: [
		"run",
		"-A",
		"--v8-flags=--max-old-space-size=736",
		"npm:vite@^6.2.0",
		"build",
	],
	stdin: "inherit",
	stdout: "inherit",
	stderr: "inherit",
});
const status = await command.spawn().status;
if (!status.success) {
	Deno.exit(status.code);
}

await Deno.writeTextFile(markerPath, `${hash}\n`);
