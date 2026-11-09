import { readFile } from "node:fs/promises";
import { build } from "esbuild";

const { dependencies } = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);
const bundled = new Set([
  "@simon-says/contracts",
  "@simon-says/domain",
  "server-only",
]);
await build({
  entryPoints: ["server/index.ts"],
  outfile: "dist/index.js",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  // Node cannot load workspace .ts exports. Bundle them AND their transitive
  // dependencies (Zod); external imports must be direct web dependencies.
  external: Object.keys(dependencies).filter((name) => !bundled.has(name)),
  plugins: [
    {
      name: "node-server-only",
      setup(build) {
        // Next enforces this guard in app builds. This entry point is Node-only.
        build.onResolve({ filter: /^server-only$/ }, () => ({
          path: "server-only",
          namespace: "guard",
        }));
        build.onLoad({ filter: /.*/, namespace: "guard" }, () => ({
          contents: "",
        }));
      },
    },
  ],
});
