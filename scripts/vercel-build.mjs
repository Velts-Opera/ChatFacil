import { execSync } from "child_process";
import { cpSync, mkdirSync, writeFileSync, readFileSync } from "fs";
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

// 5. Incluir package.json de produção na função para que o Node.js resolva módulos externos
//    (react, @tanstack/react-router etc. são importados como externos nas chunks SSR)
const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const prodPkg = {
  name: pkg.name,
  version: pkg.version,
  type: "module",
  dependencies: pkg.dependencies,
};
writeFileSync(resolve(fnDir, "package.json"), JSON.stringify(prodPkg, null, 2));
console.log("Installing production dependencies in function directory...");
execSync("npm install --omit=dev --prefer-offline", { cwd: fnDir, stdio: "inherit" });

// 6. Node.js runtime com WebWorker launcher — suporta fetch handler + node_modules
writeFileSync(
  resolve(fnDir, ".vc-config.json"),
  JSON.stringify({
    runtime: "nodejs22.x",
    handler: "server.js",
    launcherType: "WebWorker",
  }, null, 2)
);

// 7. Write Vercel output config
writeFileSync(
  resolve(outDir, "config.json"),
  JSON.stringify({
    version: 3,
    routes: [
      { src: "^/assets/(.*)$", dest: "/assets/$1" },
      { src: "/(.*)", dest: "/index" },
    ],
  }, null, 2)
);

console.log("✓ Vercel output ready at .vercel/output/");
