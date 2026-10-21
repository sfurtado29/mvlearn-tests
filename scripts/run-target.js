// Runs Playwright against one site without leaving TARGET set in your terminal.
// Usage: node scripts/run-target.js <dev|staging> [playwright test arguments...]
import { spawnSync } from 'child_process';

const [target, ...args] = process.argv.slice(2);
if (!['dev', 'staging'].includes(target)) {
  console.error('Usage: node scripts/run-target.js <dev|staging> [playwright test arguments...]');
  process.exit(1);
}
const result = spawnSync('npx', ['playwright', 'test', ...args], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, TARGET: target },
});
process.exit(result.status ?? 1);
