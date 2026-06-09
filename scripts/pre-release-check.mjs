#!/usr/bin/env node

/**
 * Pre-release check script
 * Run before tagging to catch common issues that cause CI build failures.
 *
 * Usage:
 *   npm run release:check
 *   npm run release:check -- --tag    (also creates the git tag after checks pass)
 */

import { readFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

let hasError = false;
let hasWarning = false;

function ok(msg) { console.log(`  ✅ ${msg}`); }
function warn(msg) { console.log(`  ⚠️  ${msg}`); hasWarning = true; }
function fail(msg) { console.log(`  ❌ ${msg}`); hasError = true; }
function header(msg) { console.log(`\n── ${msg} ──`); }

// ── 1. Read versions from all three files ──
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
  for (const [file, ver] of Object.entries(versions)) {
    console.log(`       ${file}: ${ver}`);
  }
}

// ── 2. Check git status ──
header('Git Status');

try {
  const status = execSync('git status --porcelain', { cwd: ROOT, encoding: 'utf-8' }).trim();
  if (status) {
    warn('Uncommitted changes detected:');
    status.split('\n').slice(0, 10).forEach(line => console.log(`       ${line}`));
    if (status.split('\n').length > 10) console.log('       ... and more');
  } else {
    ok('Working directory is clean');
  }
} catch {
  warn('Could not check git status');
}

// ── 3. Check if tag already exists ──
header('Tag Check');

const tagName = `v${pkg.version}`;

try {
  const existingTags = execSync('git tag --list', { cwd: ROOT, encoding: 'utf-8' });
  if (existingTags.split('\n').map(t => t.trim()).includes(tagName)) {
    fail(`Tag ${tagName} already exists! Bump version or delete the old tag.`);
  } else {
    ok(`Tag ${tagName} is available`);
  }
} catch {
  warn('Could not check existing tags');
}

// ── 4. Check node_modules exists ──
header('Dependencies');

if (existsSync(resolve(ROOT, 'node_modules'))) {
  ok('node_modules exists');
} else {
  fail('node_modules missing — run npm install first');
}

// ── 5. Check TypeScript compilation ──
header('TypeScript Check');

try {
  execSync('npx tsc --noEmit', { cwd: ROOT, encoding: 'utf-8', stdio: 'pipe' });
  ok('TypeScript compilation passed');
} catch (e) {
  fail('TypeScript compilation errors:');
  const output = (e.stdout || '') + (e.stderr || '');
  output.split('\n').slice(0, 15).forEach(line => console.log(`       ${line}`));
}

// ── 6. Check Rust compilation ──
header('Rust Check (cargo check)');

try {
  execSync('cargo check', { cwd: resolve(ROOT, 'src-tauri'), encoding: 'utf-8', stdio: 'pipe' });
  ok('Rust cargo check passed');
} catch (e) {
  fail('Rust compilation errors:');
  const output = (e.stdout || '') + (e.stderr || '');
  output.split('\n').filter(l => l.includes('error')).slice(0, 15).forEach(line => console.log(`       ${line}`));
}

// ── Summary ──
header('Summary');

if (hasError) {
  console.log('\n  🚫 Pre-release checks FAILED. Fix the issues above before tagging.\n');
  process.exit(1);
} else if (hasWarning) {
  console.log(`\n  ⚠️  Checks passed with warnings. You can proceed to tag.`);
  console.log(`  Run: git tag ${tagName} && git push origin ${tagName}\n`);
} else {
  console.log(`\n  🎉 All checks passed!`);
  console.log(`  Run: git tag ${tagName} && git push origin ${tagName}\n`);
}

// ── Optional: auto-tag ──
if (process.argv.includes('--tag')) {
  if (hasError) {
    console.log('  Skipping auto-tag due to errors.\n');
  } else {
    try {
      console.log(`  Creating tag ${tagName}...`);
      execSync(`git tag ${tagName}`, { cwd: ROOT, encoding: 'utf-8' });
      console.log(`  Pushing tag ${tagName}...`);
      execSync(`git push origin ${tagName}`, { cwd: ROOT, encoding: 'utf-8' });
      console.log(`  ✅ Tag ${tagName} pushed successfully!\n`);
    } catch (e) {
      console.log(`  ❌ Failed to create/push tag: ${e.message}\n`);
      process.exit(1);
    }
  }
}
