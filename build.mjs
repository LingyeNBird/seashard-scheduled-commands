import { build, context } from "esbuild";
import { mkdir, rm } from "node:fs/promises";

const watch = process.argv.includes("--watch");
const outputDirectory = new URL("./bundle/dist/", import.meta.url);

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

const entries = [
  {
    name: "controller",
    options: {
      entryPoints: ["src/controller/index.ts"],
      outfile: "bundle/dist/controller.js",
      platform: "node",
      target: "node24",
    },
  },
  {
    name: "client",
    options: {
      entryPoints: ["src/client/index.ts"],
      outfile: "bundle/dist/client.js",
      platform: "browser",
      target: "chrome142",
    },
  },
];

const common = {
  bundle: true,
  format: "esm",
  logLevel: "info",
  minify: !watch,
  sourcemap: watch ? "inline" : false,
  treeShaking: true,
};

if (watch) {
  const contexts = await Promise.all(
    entries.map(async (entry) => {
      const buildContext = await context({ ...common, ...entry.options });
      await buildContext.watch();
      return buildContext;
    }),
  );
  console.log(`[build] watching ${contexts.length} entry bundles`);
  await new Promise(() => {});
} else {
  await Promise.all(entries.map((entry) => build({ ...common, ...entry.options })));
}
