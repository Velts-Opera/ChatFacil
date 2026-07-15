import { execSync } from "child_process";
import { cpSync, mkdirSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";

const root = process.cwd();

// 1. Run the normal vite build
console.log("Building...");
execSync("npx vite build", { stdio: "inherit" });

// 2. Build .vercel/output structure
const outDir = resolve(root, ".vercel/output");
const staticDir = resolve(outDir, "static");
const fnDir = resolve(outDir, "functions/index.func");

mkdirSync(staticDir, { recursive: true });
mkdirSync(fnDir, { recursive: true });

// 3. Copy client assets to static
cpSync(resolve(root, "dist/client"), staticDir, { recursive: true });

// 4. Copy server bundle to function
cpSync(resolve(root, "dist/server"), fnDir, { recursive: true });

// 5. Write edge function config (uses Web API fetch handler)
writeFileSync(
  resolve(fnDir, ".vc-config.json"),
  JSON.stringify({
    runtime: "edge",
    entrypoint: "server.js",
  }, null, 2)
);

// 6. Write Vercel output config
writeFileSync(
  resolve(outDir, "config.json"),
  JSON.stringify({
    version: 3,
    routes: [
      // Serve static assets directly
      {
        src: "^/assets/(.*)$",
        dest: "/assets/$1",
      },
      // All other routes go to the edge SSR function
      {
        src: "/(.*)",
        dest: "/index",
      },
    ],
  }, null, 2)
);

console.log("✓ Vercel output ready at .vercel/output/");
