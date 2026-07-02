#!/usr/bin/env node

/**
 * Pre-release check script.
 *
 * Usage:
 *   npm run release:check
 *   npm run release:check -- --tag
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { execSync } from 'child_process';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

let hasError = false;
let hasWarning = false;

function ok(msg) {
  console.log(`  OK ${msg}`);
}

function warn(msg) {
  console.log(`  WARN ${msg}`);
  hasWarning = true;
}

function fail(msg) {
  console.log(`  FAIL ${msg}`);
  hasError = true;
}

function header(msg) {
  console.log(`\n-- ${msg} --`);
}

function dirSize(path) {
  if (!existsSync(path)) return 0;

  let total = 0;
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const child = resolve(path, entry.name);
    total += entry.isDirectory() ? dirSize(child) : statSync(child).size;
  }
  return total;
}

function formatMB(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

header('Version Consistency');

const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf-8'));
const tauriConf = JSON.parse(readFileSync(resolve(ROOT, 'src-tauri/tauri.conf.json'), 'utf-8'));

const cargoToml = readFileSync(resolve(ROOT, 'src-tauri/Cargo.toml'), 'utf-8');
const cargoVersionMatch = cargoToml.match(/^version\s*=\s*"([^"]+)"/m);
const cargoVersion = cargoVersionMatch ? cargoVersionMatch[1] : 'NOT_FOUND';

const versions = {
  'package.json': pkg.version,
  'tauri.conf.json': tauriConf.version,
  'Cargo.toml': cargoVersion,
};

const uniqueVersions = new Set(Object.values(versions));

if (uniqueVersions.size === 1) {
  ok(`All versions match: ${pkg.version}`);
} else {
  fail('Version mismatch detected:');
  for (const [file, version] of Object.entries(versions)) {
    console.log(`       ${file}: ${version}`);
  }
}

header('Git Status');

try {
  const status = execSync('git status --porcelain', { cwd: ROOT, encoding: 'utf-8' }).trim();
  if (status) {
    warn('Uncommitted changes detected:');
    status.split('\n').slice(0, 10).forEach((line) => console.log(`       ${line}`));
    if (status.split('\n').length > 10) console.log('       ... and more');
  } else {
    ok('Working directory is clean');
  }
} catch {
  warn('Could not check git status');
}

header('Tag Check');

const tagName = `v${pkg.version}`;

try {
  const existingTags = execSync('git tag --list', { cwd: ROOT, encoding: 'utf-8' });
  if (existingTags.split('\n').map((tag) => tag.trim()).includes(tagName)) {
    fail(`Tag ${tagName} already exists. Bump version or delete the old tag.`);
  } else {
    ok(`Tag ${tagName} is available`);
  }
} catch {
  warn('Could not check existing tags');
}

header('Dependencies');

if (existsSync(resolve(ROOT, 'node_modules'))) {
  ok('node_modules exists');
} else {
  fail('node_modules missing. Run npm install first.');
}

header('Bundle Size Guards');

const resources = tauriConf.bundle?.resources ?? [];
if (resources.includes('../scripts') || resources.includes('..\\scripts')) {
  fail('bundle.resources includes the whole scripts directory. List only runtime files instead.');
} else {
  ok('bundle.resources does not include the whole scripts directory');
}

try {
  const trackedArtifacts = execSync('git ls-files scripts/build scripts/dist public/models', {
    cwd: ROOT,
    encoding: 'utf-8',
  }).trim();

  if (trackedArtifacts) {
    fail('Large generated artifacts are tracked by git:');
    trackedArtifacts.split('\n').slice(0, 10).forEach((line) => console.log(`       ${line}`));
    if (trackedArtifacts.split('\n').length > 10) console.log('       ... and more');
  } else {
    ok('No tracked PyInstaller build artifacts');
  }
} catch {
  warn('Could not check tracked PyInstaller artifacts');
}

for (const artifactDir of ['scripts/build', 'scripts/dist']) {
  const size = dirSize(resolve(ROOT, artifactDir));
  if (size > 0) {
    warn(`${artifactDir} exists locally (${formatMB(size)}). It is ignored and must not be bundled.`);
  }
}

header('TypeScript Check');

try {
  execSync('npx tsc --noEmit', { cwd: ROOT, encoding: 'utf-8', stdio: 'pipe' });
  ok('TypeScript compilation passed');
} catch (error) {
  fail('TypeScript compilation errors:');
  const output = (error.stdout || '') + (error.stderr || '');
  output.split('\n').slice(0, 15).forEach((line) => console.log(`       ${line}`));
}

header('Rust Check (cargo check)');

try {
  execSync('cargo check', { cwd: resolve(ROOT, 'src-tauri'), encoding: 'utf-8', stdio: 'pipe' });
  ok('Rust cargo check passed');
} catch (error) {
  fail('Rust compilation errors:');
  const output = (error.stdout || '') + (error.stderr || '');
  output
    .split('\n')
    .filter((line) => line.includes('error'))
    .slice(0, 15)
    .forEach((line) => console.log(`       ${line}`));
}

header('Summary');

if (hasError) {
  console.log('\n  Pre-release checks FAILED. Fix the issues above before tagging.\n');
  process.exit(1);
}

if (hasWarning) {
  console.log('\n  Checks passed with warnings. You can proceed to tag after reviewing them.');
  console.log(`  Run: git tag ${tagName} && git push origin ${tagName}\n`);
} else {
  console.log('\n  All checks passed.');
  console.log(`  Run: git tag ${tagName} && git push origin ${tagName}\n`);
}

if (process.argv.includes('--tag')) {
  try {
    console.log(`  Creating tag ${tagName}...`);
    execSync(`git tag ${tagName}`, { cwd: ROOT, encoding: 'utf-8' });
    console.log(`  Pushing tag ${tagName}...`);
    execSync(`git push origin ${tagName}`, { cwd: ROOT, encoding: 'utf-8' });
    console.log(`  Tag ${tagName} pushed successfully.\n`);
  } catch (error) {
    console.log(`  Failed to create/push tag: ${error.message}\n`);
    process.exit(1);
  }
}
