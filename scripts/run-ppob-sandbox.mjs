import { spawnSync } from 'node:child_process';
const args = ['--test', 'tests/e2e-sandbox/*.test.mjs'];
const result = spawnSync(process.execPath, args, { stdio: 'inherit', shell: true });
process.exit(result.status ?? 1);
