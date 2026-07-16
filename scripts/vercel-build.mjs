import { execSync } from "child_process";
import { copyFileSync, cpSync, mkdirSync, writeFileSync } from "fs";
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
// Reusa package.json + lockfile da raiz para instalar versões exatas com npm ci
// (npm install sem lock resolve versões soltas e quebra quando o registro
// diverge do lockfile). --omit=dev instala apenas as dependências de produção.
copyFileSync(resolve(root, "package.json"), resolve(fnDir, "package.json"));
copyFileSync(resolve(root, "package-lock.json"), resolve(fnDir, "package-lock.json"));
console.log("Installing production dependencies in function directory...");
execSync("npm ci --omit=dev --prefer-offline --no-audit --no-fund", { cwd: fnDir, stdio: "inherit" });

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
      // Cache imutável para assets com hash no nome
      {
        src: "^/assets/(.*)$",
        headers: { "cache-control": "public, max-age=31536000, immutable" },
        continue: true,
      },
      // Serve qualquer arquivo estático existente (assets, favicon, etc.)
      { handle: "filesystem" },
      // Todo o resto vai para a função SSR
      {
        src: "/(.*)",
        dest: "/index",
      },
    ],
  }, null, 2)
);

console.log("✓ Vercel output ready at .vercel/output/");
