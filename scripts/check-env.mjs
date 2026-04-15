#!/usr/bin/env node
// scripts/check-env.mjs
//
// Preflight environment check for the selfpost skill. The skill runs this
// once per session (caches the result) before any interactive work, so
// Claude doesn't re-derive availability of Node, the queue dir, the
// selectors config, the validators library, or cadence state.
//
// Invocation:
//   node scripts/check-env.mjs [--queue-dir=PATH] [--json]
//
// Exit codes:
//   0   all checks passed
//   1   critical failure (something the user must fix before posting)
//   2   warning-level issue (informational, posting still possible)
//
// Stdout is JSON when --json is set, text otherwise. Errors go to stderr
// only for truly structural failures (e.g. unhandled exceptions in this
// script itself). Check results always go to stdout.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parse as parseYaml } from 'yaml';

const QUEUE_DIR_DEFAULT = 'queue/twitter';
const SELECTORS_CONFIG_PATH = 'config/selectors.twitter.yaml';
const VALIDATE_LIB_PATH = 'lib/validate.mjs';
const NODE_REQUIRED = '>=20.0.0';
const STALE_SELECTORS_DAYS = 90;
const CADENCE_WARN_MIN_GAP_SECONDS = 30;  // if last post was <30s ago, warn

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

function parseArgs(argv) {
  const args = argv.slice(2);
  const flags = {};
  for (const a of args) {
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      flags[k] = v === undefined ? true : v;
    }
  }
  return flags;
}

function okCheck(name, extra = {}) {
  return { name, ok: true, ...extra };
}

function failCheck(name, reason, extra = {}) {
  return { name, ok: false, reason, ...extra };
}

function warnCheck(name, reason, extra = {}) {
  return { name, ok: true, warning: reason, ...extra };
}

// node semver compare (very minimal, just for >=x.y.z)
function meetsNodeVersion(actual, required) {
  const req = required.replace(/^>=/, '').split('.').map(Number);
  const act = actual.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < req.length; i++) {
    const a = act[i] ?? 0;
    const r = req[i] ?? 0;
    if (a > r) return true;
    if (a < r) return false;
  }
  return true;
}

function daysBetween(dateStr) {
  const t = Date.parse(dateStr);
  if (Number.isNaN(t)) return Infinity;
  return (Date.now() - t) / (1000 * 60 * 60 * 24);
}

// ------------------------------------------------------------------
// Individual checks
// ------------------------------------------------------------------

function checkNodeVersion() {
  const version = process.versions.node;
  if (meetsNodeVersion(`v${version}`, NODE_REQUIRED)) {
    return okCheck('node_version', { version, required: NODE_REQUIRED });
  }
  return failCheck('node_version', `Node ${version} is below required ${NODE_REQUIRED}`, { version, required: NODE_REQUIRED });
}

function checkQueueDir(queueDir) {
  const abs = resolve(queueDir);
  if (!existsSync(abs)) {
    return failCheck('queue_dir', `Queue directory not found: ${abs}`, { path: abs });
  }
  try {
    const s = statSync(abs);
    if (!s.isDirectory()) {
      return failCheck('queue_dir', `Path exists but is not a directory: ${abs}`, { path: abs });
    }
  } catch (err) {
    return failCheck('queue_dir', `Cannot stat queue directory: ${err.message}`, { path: abs });
  }
  return okCheck('queue_dir', { path: abs });
}

function checkSelectorsConfig() {
  const abs = resolve(SELECTORS_CONFIG_PATH);
  if (!existsSync(abs)) {
    return warnCheck('selectors_config', `Selectors config not found; skill will use the inline safety table`, { path: abs });
  }
  let parsed;
  try {
    parsed = parseYaml(readFileSync(abs, 'utf8'));
  } catch (err) {
    return failCheck('selectors_config', `Malformed YAML: ${err.message}`, { path: abs });
  }
  if (!parsed || typeof parsed !== 'object') {
    return failCheck('selectors_config', `Config is not a YAML object`, { path: abs });
  }
  if (!parsed.elements || typeof parsed.elements !== 'object') {
    return failCheck('selectors_config', `Config missing 'elements' section`, { path: abs });
  }
  const lastVerified = parsed.lastVerified ? String(parsed.lastVerified) : null;
  const extra = { path: abs, version: parsed.version ?? null, lastVerified, elementCount: Object.keys(parsed.elements).length };
  if (lastVerified) {
    const age = daysBetween(lastVerified);
    if (age > STALE_SELECTORS_DAYS) {
      return warnCheck('selectors_config', `lastVerified is ${Math.round(age)} days old (> ${STALE_SELECTORS_DAYS}); selectors may be stale`, extra);
    }
  }
  return okCheck('selectors_config', extra);
}

function checkValidatorsInstalled() {
  const libAbs = resolve(VALIDATE_LIB_PATH);
  if (!existsSync(libAbs)) {
    return failCheck('validators_installed', `lib/validate.mjs not found`, { path: libAbs });
  }
  const nodeModulesAbs = resolve('node_modules');
  if (!existsSync(nodeModulesAbs)) {
    return failCheck('validators_installed', `node_modules/ missing — run \`npm install\` at the repo root`, { path: nodeModulesAbs });
  }
  const twitterTextPath = join(nodeModulesAbs, 'twitter-text');
  const yamlPath = join(nodeModulesAbs, 'yaml');
  const missing = [];
  if (!existsSync(twitterTextPath)) missing.push('twitter-text');
  if (!existsSync(yamlPath)) missing.push('yaml');
  if (missing.length > 0) {
    return failCheck('validators_installed', `missing npm deps: ${missing.join(', ')} — run \`npm install\``, { missing });
  }
  return okCheck('validators_installed', { libPath: libAbs });
}

async function checkCadenceFromQueue(queueDir) {
  const abs = resolve(queueDir);
  if (!existsSync(abs)) {
    return warnCheck('cadence', `Queue dir not found; skipping cadence check`);
  }

  // dynamic import so this script still runs before npm install (gracefully degrading)
  let checkCadence, DAILY_CAP;
  try {
    const mod = await import('../lib/validate.mjs');
    checkCadence = mod.checkCadence;
    DAILY_CAP = mod.DAILY_CAP;
  } catch (err) {
    return warnCheck('cadence', `Could not load validators lib; run \`npm install\` for cadence checks`, { reason: err.message });
  }

  let files;
  try {
    files = readdirSync(abs).filter(f => f.endsWith('.md') && f !== 'README.md');
  } catch (err) {
    return warnCheck('cadence', `Could not read queue dir: ${err.message}`);
  }

  const posted = [];
  for (const f of files) {
    try {
      const raw = readFileSync(join(abs, f), 'utf8');
      const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
      if (!match) continue;
      const fm = parseYaml(match[1]);
      if (fm && fm.status === 'posted' && fm.posted_at) {
        posted.push({ id: f.replace(/\.md$/, ''), posted_at: fm.posted_at });
      }
    } catch {
      // skip malformed files silently; that's check_selectors_config's job
    }
  }

  const result = checkCadence(posted);
  const extra = { postsIn24h: result.postsIn24h, dailyCap: DAILY_CAP, canPost: result.canPost };

  // also check most-recent-post-recency — if <30s, warn (human pacing)
  if (posted.length > 0) {
    const latestMs = Math.max(...posted.map(p => Date.parse(p.posted_at)).filter(n => !Number.isNaN(n)));
    const secondsSince = (Date.now() - latestMs) / 1000;
    extra.lastPostedAt = new Date(latestMs).toISOString();
    extra.secondsSinceLast = Math.round(secondsSince);
    if (secondsSince < CADENCE_WARN_MIN_GAP_SECONDS) {
      return warnCheck('cadence', `Last post was ${Math.round(secondsSince)}s ago; pacing looks bot-like`, extra);
    }
  }

  if (!result.canPost) {
    return failCheck('cadence', result.error ?? `At daily cap (${DAILY_CAP})`, extra);
  }
  return okCheck('cadence', extra);
}

function checkGitClean(queueDir) {
  try {
    const res = spawnSync('git', ['status', '--porcelain', queueDir, 'config/'], {
      encoding: 'utf8',
      shell: false,
    });
    if (res.error || res.status !== 0) {
      return okCheck('git_clean', { note: 'git unavailable or not a repo; skipped' });
    }
    const lines = res.stdout.split('\n').filter(Boolean);
    if (lines.length === 0) {
      return okCheck('git_clean', { details: 'queue/ and config/ clean' });
    }
    return warnCheck('git_clean', `Uncommitted changes in tracked areas`, { files: lines });
  } catch {
    return okCheck('git_clean', { note: 'git check raised; skipped' });
  }
}

// ------------------------------------------------------------------
// Main
// ------------------------------------------------------------------

async function main() {
  const flags = parseArgs(process.argv);
  const queueDir = flags['queue-dir'] ?? QUEUE_DIR_DEFAULT;

  const checks = [];
  checks.push(checkNodeVersion());
  checks.push(checkQueueDir(queueDir));
  checks.push(checkSelectorsConfig());
  checks.push(checkValidatorsInstalled());
  checks.push(await checkCadenceFromQueue(queueDir));
  checks.push(checkGitClean(queueDir));

  const errors = checks.filter(c => !c.ok).map(c => ({ name: c.name, reason: c.reason }));
  const warnings = checks.filter(c => c.ok && c.warning).map(c => ({ name: c.name, reason: c.warning }));
  const allOk = errors.length === 0;
  const readyToPost = allOk;

  const result = {
    ok: allOk,
    readyToPost,
    checks,
    warnings,
    errors,
  };

  if (flags.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else {
    for (const c of checks) {
      const symbol = c.ok ? (c.warning ? '!' : '✓') : '✗';
      const tail = c.warning ? ` — ${c.warning}` : (c.reason ? ` — ${c.reason}` : '');
      process.stdout.write(`${symbol} ${c.name}${tail}\n`);
    }
    process.stdout.write('\n');
    if (errors.length) {
      process.stdout.write(`${errors.length} error(s); posting blocked until resolved.\n`);
    } else if (warnings.length) {
      process.stdout.write(`${warnings.length} warning(s); posting allowed.\n`);
    } else {
      process.stdout.write(`All checks pass. Ready to post.\n`);
    }
  }

  if (!allOk) return 1;
  if (warnings.length) return 2;
  return 0;
}

main().then(code => process.exit(code)).catch(err => {
  process.stderr.write(`check-env: unhandled error: ${err.stack ?? err.message ?? String(err)}\n`);
  process.exit(1);
});
