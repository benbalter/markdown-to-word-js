import { execFileSync } from 'child_process';
import { existsSync, readdirSync, statSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Vitest global setup: test/cli.test.ts and test/mcp.test.ts spawn the built
// CLI (build/cli.js), and build/ is gitignored. Build it once, before any
// test file runs, when it's missing or older than any source it compiles, so
// a fresh `npm test` works without a prior `npm run build:lib` and the two
// files never race to build it.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const cliPath = path.join(root, 'build/cli.js');

function isStale(): boolean {
  if (!existsSync(cliPath)) return true;
  const built = statSync(cliPath).mtimeMs;
  return readdirSync(path.join(root, 'src'))
    .filter((file) => file.endsWith('.ts') && file !== 'index.ts')
    .some((file) => statSync(path.join(root, 'src', file)).mtimeMs > built);
}

export default function setup(): void {
  if (!isStale()) return;
  execFileSync(
    process.execPath,
    [
      path.join(root, 'node_modules/typescript/bin/tsc'),
      '-p',
      'tsconfig.build.json',
    ],
    { cwd: root, stdio: 'inherit' }
  );
}
