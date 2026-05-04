import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const baselinePath = join(root, 'knip-baseline.json');
const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));

const knipBin = join(root, 'node_modules', 'knip', 'bin', 'knip.js');
const result = spawnSync(
  process.execPath,
  [knipBin, '--reporter', 'json', '--no-exit-code'],
  {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  },
);

if (result.error) {
  console.error(`Failed to run knip: ${result.error.message}`);
  process.exit(1);
}

if (result.status !== 0) {
  process.stderr.write(result.stderr);
  process.stdout.write(result.stdout);
  process.exit(result.status ?? 1);
}

const output = result.stdout.trim();
if (!output) {
  console.error('Knip returned no JSON output.');
  process.exit(1);
}

let report;
try {
  report = JSON.parse(output);
} catch (err) {
  console.error('Knip returned invalid JSON.');
  console.error(err instanceof Error ? err.message : String(err));
  process.stdout.write(result.stdout);
  process.exit(1);
}

const categories = [
  'files',
  'dependencies',
  'devDependencies',
  'optionalPeerDependencies',
  'unlisted',
  'unresolved',
  'binaries',
  'exports',
  'types',
  'enumMembers',
  'namespaceMembers',
  'catalog',
];

const current = Object.fromEntries(categories.map(category => [category, 0]));

for (const issue of report.issues ?? []) {
  for (const category of categories) {
    current[category] += issue[category]?.length ?? 0;
  }
}

const regressions = [];
const improvements = [];

for (const category of categories) {
  const allowed = baseline.categories[category] ?? 0;
  const actual = current[category];

  if (actual > allowed) {
    regressions.push({ category, allowed, actual });
  } else if (actual < allowed) {
    improvements.push({ category, allowed, actual });
  }
}

console.log('Knip baseline check');
console.log('Category                 Current  Baseline');
for (const category of categories) {
  console.log(
    `${category.padEnd(24)} ${String(current[category]).padStart(7)} ${String(
      baseline.categories[category] ?? 0,
    ).padStart(9)}`,
  );
}

if (improvements.length > 0) {
  console.log('\nCategories below baseline; lower knip-baseline.json when ready:');
  for (const { category, allowed, actual } of improvements) {
    console.log(`- ${category}: ${actual} current, ${allowed} baseline`);
  }
}

if (regressions.length > 0) {
  console.error('\nKnip regressions detected:');
  for (const { category, allowed, actual } of regressions) {
    console.error(`- ${category}: ${actual} current, ${allowed} baseline`);
  }
  process.exit(1);
}

console.log('\nKnip baseline passed: no category regressed.');
