import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node18",
  clean: true,
  outDir: "dist",
  shims: true,
  dts: true,
  // Bundle `ora` into dist/index.js instead of leaving it as an external
  // import. Without this, a consumer project whose `api18n.config.ts` does
  // `import { defineConfig } from "@api18n/cli"` causes bundle-require to
  // load the installed copy of the CLI, which then tries to resolve `ora`
  // from the *consumer's* node_modules — and fails when nothing else in the
  // consumer's tree pulls it in. Inlining ora removes that resolution step.
  noExternal: ["ora"],
});
