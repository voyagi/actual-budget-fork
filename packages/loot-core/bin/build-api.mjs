#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { cpSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const apiDir = resolve(root, '..', 'api');

const run = (cmd) => execSync(cmd, { cwd: root, stdio: 'inherit' });

// 1. Generate type declarations
run('npx tsc -p tsconfig.api.json --outDir ../api/@types/loot-core/');

// 2. Copy handwritten .d.ts files that tsc doesn't move
const srcDir = join(root, 'src');
const destDir = join(apiDir, '@types', 'loot-core');

function copyDtsFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      copyDtsFiles(full);
    } else if (entry.name.endsWith('.d.ts')) {
      const rel = full.slice(srcDir.length);
      const target = join(destDir, rel);
      mkdirSync(dirname(target), { recursive: true });
      cpSync(full, target);
    }
  }
}
copyDtsFiles(srcDir);

// 3. Build the API bundle
run('npx vite build --config ./vite.api.config.ts');

// 4. Copy migrations
const migDest = join(apiDir, 'migrations');
rmSync(migDest, { recursive: true, force: true });
mkdirSync(migDest, { recursive: true });
for (const f of readdirSync(join(root, 'migrations'))) {
  cpSync(join(root, 'migrations', f), join(migDest, f));
}
cpSync(join(root, 'default-db.sqlite'), join(apiDir, 'default-db.sqlite'));
