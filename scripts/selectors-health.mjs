#!/usr/bin/env node
// scripts/selectors-health.mjs
//
// Selector health smoke test. Launches Playwright against the persistent
// profile, navigates to x.com/compose/post, and verifies that every
// selector in config/selectors.twitter.yaml still finds a live element.
// Run this daily (or on demand) to detect X.com DOM drift before it
// breaks a real posting run.
//
// Usage:
//   node scripts/selectors-health.mjs [flags]
//
// Flags:
//   --profile-dir PATH  persistent Chromium profile (default: .playwright-profile)
//   --headless          run headless (default: true)
//   --selectors PATH    selectors config (default: config/selectors.twitter.yaml)
//   --json              structured JSON output
//   --timeout-ms N      per-selector wait timeout (default: 3000)
//
// Exit codes:
//   0   healthy — every element's primary selector (first fallback) matched
//   1   degraded — elements found, but only via non-primary fallbacks
//   2   critical — at least one element couldn't be matched by any fallback
//   3   session_expired — must log into the profile before a meaningful check
//
// Output (JSON): { ok, exitCode, elements: [{ name, status, matchedSelector, triedSelectors }], ... }
//
// Recommended cadence: once per day via Windows Task Scheduler or a scheduled
// cron (outside the posting window, e.g. 08:00 local). If it reports degraded
// or critical, update config/selectors.twitter.yaml and bump rotationHistory
// before the next posting run.

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { chromium } from 'playwright';

const SELECTORS_CONFIG_DEFAULT = 'config/selectors.twitter.yaml';
const PROFILE_DIR_DEFAULT = '.playwright-profile';
const NAVIGATION_TIMEOUT_MS = 20000;
const SELECTOR_TIMEOUT_DEFAULT = 3000;

// ------------------------------------------------------------------

function parseArgs(argv) {
  const flags = {};
  const args = argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith('--')) continue;
    const [k, v] = a.slice(2).split('=');
    if (v !== undefined) flags[k] = v;
    else if (args[i + 1] && !args[i + 1].startsWith('--')) flags[k] = args[++i];
    else flags[k] = true;
  }
  return flags;
}

function emit(asJson, obj) {
  if (asJson) process.stdout.write(JSON.stringify(obj) + '\n');
}
function log(asJson, msg) {
  if (!asJson) process.stdout.write(msg + '\n');
}

async function detectLoginRedirect(page) {
  const html = await page.content();
  return /\/i\/flow\/login/i.test(page.url()) || /log in to x/i.test(html);
}

// ------------------------------------------------------------------

async function probeElement(page, name, element, timeout, sectionIndex = 0) {
  const fallbacks = (element.fallback ?? []).map(s =>
    s.replaceAll('{n}', String(sectionIndex))
  );
  const tried = [];
  let matchedSelector = null;
  let matchedIndex = -1;

  for (let i = 0; i < fallbacks.length; i++) {
    const sel = fallbacks[i];
    tried.push(sel);
    try {
      const locator = page.locator(sel).first();
      await locator.waitFor({ state: 'visible', timeout });
      matchedSelector = sel;
      matchedIndex = i;
      break;
    } catch {
      // try next
    }
  }

  let status;
  if (matchedSelector === null) {
    status = 'missing';
  } else if (matchedIndex === 0) {
    status = 'primary';
  } else {
    status = `fallback[${matchedIndex}]`;
  }

  return {
    name,
    description: element.description ?? null,
    status,
    matchedSelector,
    matchedFallbackIndex: matchedIndex,
    triedSelectors: tried,
    sectionIndex,
  };
}

// ------------------------------------------------------------------

async function main() {
  const flags = parseArgs(process.argv);
  const asJson = !!flags.json;
  const selectorsPath = resolve(flags.selectors ?? SELECTORS_CONFIG_DEFAULT);
  const profileDir = resolve(flags['profile-dir'] ?? PROFILE_DIR_DEFAULT);
  const headless = flags.headless === false ? false : true; // default true
  const selectorTimeout = Number(flags['timeout-ms'] ?? SELECTOR_TIMEOUT_DEFAULT);

  if (!existsSync(selectorsPath)) {
    emit(asJson, { ok: false, error: `selectors config not found: ${selectorsPath}`, code: 'not_found' });
    log(asJson, `error: selectors config not found: ${selectorsPath}`);
    return 2;
  }

  let config;
  try {
    config = parseYaml(readFileSync(selectorsPath, 'utf8'));
  } catch (err) {
    emit(asJson, { ok: false, error: `YAML parse error: ${err.message}`, code: 'parse_error' });
    log(asJson, `error: ${err.message}`);
    return 2;
  }

  const elements = config?.elements ?? {};
  const elementNames = Object.keys(elements);
  if (elementNames.length === 0) {
    emit(asJson, { ok: false, error: 'config has no elements', code: 'empty_config' });
    return 2;
  }

  log(asJson, `Launching ${headless ? 'headless' : 'headed'} Chromium (profile: ${profileDir})...`);
  let context;
  try {
    context = await chromium.launchPersistentContext(profileDir, {
      headless,
      viewport: { width: 1280, height: 900 },
    });
  } catch (err) {
    emit(asJson, { ok: false, error: `failed to launch Chromium: ${err.message}`, code: 'browser_launch' });
    log(asJson, `error: ${err.message}`);
    return 2;
  }

  let page;
  let exitCode = 0;
  const results = [];
  const startedAt = Date.now();

  try {
    page = await context.newPage();

    log(asJson, 'Navigating to x.com/compose/post...');
    await page.goto('https://x.com/compose/post', {
      timeout: NAVIGATION_TIMEOUT_MS,
      waitUntil: 'domcontentloaded',
    });
    await page.waitForTimeout(1500);

    if (await detectLoginRedirect(page)) {
      const out = {
        ok: false,
        error: 'session_expired: login page detected',
        code: 'session_expired',
        hint: `Log in once to the profile at ${profileDir}, then re-run.`,
        elements: elementNames.map(n => ({ name: n, status: 'skipped', reason: 'session_expired' })),
      };
      emit(asJson, out);
      log(asJson, `error: session expired; log in to the profile first (${profileDir})`);
      return 3;
    }

    // probe each element; use sectionIndex 0 for tweetTextarea
    for (const name of elementNames) {
      log(asJson, `Probing ${name}...`);
      const res = await probeElement(page, name, elements[name], selectorTimeout, 0);
      results.push(res);
      log(asJson, `  ${res.status === 'primary' ? '✓' : res.status === 'missing' ? '✗' : '!'} ${name}: ${res.status}${res.matchedSelector ? ` (${res.matchedSelector})` : ''}`);
    }

    // summarize
    const missing = results.filter(r => r.status === 'missing').map(r => r.name);
    const degraded = results.filter(r => r.status.startsWith('fallback[')).map(r => ({ name: r.name, via: r.status }));
    if (missing.length > 0) exitCode = 2;
    else if (degraded.length > 0) exitCode = 1;
    else exitCode = 0;

    const summary = {
      ok: exitCode === 0,
      code: exitCode === 0 ? 'healthy' : exitCode === 1 ? 'degraded' : 'critical',
      exitCode,
      lastVerified: config.lastVerified ?? null,
      version: config.version ?? null,
      elementCount: elementNames.length,
      primaryMatches: results.filter(r => r.status === 'primary').length,
      fallbackMatches: degraded.length,
      missing,
      degraded,
      durationMs: Date.now() - startedAt,
      elements: results,
    };
    emit(asJson, summary);

    if (!asJson) {
      log(asJson, '');
      if (exitCode === 0) log(asJson, `✓ Healthy: all ${elementNames.length} elements matched their primary selector.`);
      else if (exitCode === 1) log(asJson, `! Degraded: ${degraded.length} element(s) matched only via fallback — consider rotating primary selectors.`);
      else log(asJson, `✗ Critical: ${missing.length} element(s) not found — update config/selectors.twitter.yaml before the next posting run.`);
    }

    return exitCode;
  } catch (err) {
    emit(asJson, { ok: false, error: err.message, code: 'unknown', elements: results });
    log(asJson, `error: ${err.message}`);
    return 2;
  } finally {
    if (context) await context.close().catch(() => {});
  }
}

main().then(code => process.exit(code ?? 0)).catch(err => {
  process.stderr.write(`selectors-health: unhandled error: ${err.stack ?? err.message}\n`);
  process.exit(2);
});
