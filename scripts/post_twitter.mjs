#!/usr/bin/env node
// scripts/post_twitter.mjs
//
// Unattended Twitter poster (Tier 2). Complement to the Chrome-MCP
// interactive flow — this one runs a Playwright browser against a
// persistent profile so the skill can post a queued item end-to-end
// without Claude driving each DOM interaction.
//
// Usage:
//   node scripts/post_twitter.mjs --id <id> [flags]
//
// Flags:
//   --id <id>           required; matches queue/twitter/<id>.md
//   --dry-run           fill the composer, screenshot, then stop before Post
//   --profile-dir PATH  persistent Chromium profile (default: .playwright-profile)
//   --headless          run headless (default: headed for first-run visibility)
//   --queue-dir PATH    queue directory (default: queue/twitter)
//   --selectors PATH    selectors config (default: config/selectors.twitter.yaml)
//   --json              JSON stdout (one line at end summarizing the run)
//   --skip-validation   skip the preflight validation suite (use only if you've
//                       already validated via selfpost-q validate)
//
// Exit codes:
//   0   success (live post, or dry-run completed)
//   1   content/validation error (fixable by editing the queue file)
//   2   environment / browser / selector error
//   3   rate limit or CAPTCHA / platform intervention
//
// Stdout on success (JSON when --json):
//   { ok: true, id, status, url?, screenshot?, sections, durationMs }
// Stdout on failure:
//   { ok: false, error, code }
//
// Note: Playwright uses the `fallback` CSS selectors from the YAML config
// directly. The `primary` natural-language queries are intended for Chrome
// MCP's `find` tool and have no equivalent in Playwright. When a selector
// rotates, update the YAML and the Playwright script picks it up on next
// run without any code changes.

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { chromium } from 'playwright';

import {
  parseYamlFrontmatter,
  runValidationSuite,
} from '../lib/validate.mjs';

const QUEUE_DIR_DEFAULT = 'queue/twitter';
const SELECTORS_CONFIG_DEFAULT = 'config/selectors.twitter.yaml';
const PROFILE_DIR_DEFAULT = '.playwright-profile';
const NAVIGATION_TIMEOUT_MS = 20000;
const SELECTOR_TIMEOUT_MS = 5000;
const POST_REDIRECT_TIMEOUT_MS = 15000;

// ------------------------------------------------------------------
// Arg parsing
// ------------------------------------------------------------------

function parseArgs(argv) {
  const args = argv.slice(2);
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith('--')) continue;
    const [k, v] = a.slice(2).split('=');
    if (v !== undefined) {
      flags[k] = v;
    } else if (args[i + 1] && !args[i + 1].startsWith('--')) {
      flags[k] = args[++i];
    } else {
      flags[k] = true;
    }
  }
  return flags;
}

// ------------------------------------------------------------------
// Output helpers
// ------------------------------------------------------------------

function emitJson(asJson, data) {
  if (asJson) process.stdout.write(JSON.stringify(data) + '\n');
}
function emitText(asJson, text) {
  if (!asJson) process.stdout.write(text + '\n');
}

function fail(asJson, code, message, extra = {}) {
  const payload = { ok: false, error: message, code, ...extra };
  if (asJson) process.stdout.write(JSON.stringify(payload) + '\n');
  else process.stderr.write(`error [${code}]: ${message}\n`);
  return code === 'validation' ? 1 : (code === 'rate_limit' || code === 'captcha') ? 3 : 2;
}

// ------------------------------------------------------------------
// Section splitting (mirror of lib/validate.mjs logic; duplicated locally to
// avoid re-importing)
// ------------------------------------------------------------------

function splitSections(body, type) {
  const trimmed = (body ?? '').trim();
  if (type === 'tweet') return [trimmed];
  const headerRegex = /^#\s+\d+\s*$/gm;
  const matches = [];
  let m;
  while ((m = headerRegex.exec(trimmed)) !== null) {
    matches.push({ index: m.index, length: m[0].length });
  }
  const sections = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index + matches[i].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : trimmed.length;
    sections.push(trimmed.slice(start, end).trim());
  }
  return sections;
}

// ------------------------------------------------------------------
// Selector helpers
// ------------------------------------------------------------------

async function findByFallbacks(page, element, sectionIndex = 0) {
  const fallbacks = (element.fallback ?? []).map(s =>
    s.replaceAll('{n}', String(sectionIndex))
  );
  const triedSelectors = [];
  for (const selector of fallbacks) {
    triedSelectors.push(selector);
    try {
      const locator = page.locator(selector).first();
      await locator.waitFor({ state: 'visible', timeout: SELECTOR_TIMEOUT_MS });
      return { locator, selector };
    } catch {
      // continue to next fallback
    }
  }
  throw new Error(
    `no selector matched for ${element.description ?? 'element'}; tried: ${triedSelectors.join(', ')}`
  );
}

async function detectPlatformIntervention(page) {
  // Returns { type, evidence } or null.
  // Heuristics for common X.com intervention points.
  const html = await page.content();
  if (/\/i\/flow\/login/i.test(page.url()) || /log in to x/i.test(html)) {
    return { type: 'session_expired', evidence: 'login page detected' };
  }
  if (/You're doing that too much|try again later/i.test(html)) {
    return { type: 'rate_limit', evidence: '"doing that too much" toast' };
  }
  if (/captcha|unusual traffic|verify you are human/i.test(html)) {
    return { type: 'captcha', evidence: 'captcha/verification wording' };
  }
  return null;
}

// ------------------------------------------------------------------
// Queue file update (line-level status edit, mirrors selfpost-q.mjs style)
// ------------------------------------------------------------------

function updateFrontmatter(path, updates) {
  const raw = readFileSync(path, 'utf8');
  const fmMatch = raw.match(/^(---\r?\n)([\s\S]*?)(\r?\n---\r?\n?)/);
  if (!fmMatch) throw new Error('frontmatter block not found in queue file');

  let fm = fmMatch[2];
  for (const [key, value] of Object.entries(updates)) {
    const serialized = serializeValue(value);
    const keyRegex = new RegExp(`^(\\s*${key}:\\s*).*$`, 'm');
    if (keyRegex.test(fm)) {
      fm = fm.replace(keyRegex, `$1${serialized}`);
    } else {
      fm = fm.replace(/\s*$/, `\n${key}: ${serialized}`);
    }
  }
  return writeFileSync(path, raw.replace(fmMatch[0], fmMatch[1] + fm + fmMatch[3]), 'utf8');
}

function serializeValue(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'string') {
    // only quote if the string has YAML-confusing chars
    if (/^[\w./:@+-]+$/.test(v)) return v;
    return JSON.stringify(v);
  }
  return String(v);
}

// ------------------------------------------------------------------
// Posted-archive collector (for duplicate-guard validation)
// ------------------------------------------------------------------

function collectPostedArchive(queueDir, excludeId) {
  const abs = resolve(queueDir);
  if (!existsSync(abs)) return [];
  const files = readdirSync(abs).filter(f => f.endsWith('.md') && f !== 'README.md');
  const posted = [];
  for (const f of files) {
    if (f === `${excludeId}.md`) continue;
    try {
      const raw = readFileSync(join(abs, f), 'utf8');
      const { frontmatter, body } = parseYamlFrontmatter(raw);
      if (frontmatter && frontmatter.status === 'posted') {
        posted.push({ id: f.replace(/\.md$/, ''), body, posted_at: frontmatter.posted_at });
      }
    } catch {
      // skip malformed
    }
  }
  posted.sort((a, b) => String(b.posted_at ?? '').localeCompare(String(a.posted_at ?? '')));
  return posted;
}

// ------------------------------------------------------------------
// Main
// ------------------------------------------------------------------

async function main() {
  const startedAt = Date.now();
  const flags = parseArgs(process.argv);
  const asJson = !!flags.json;

  if (!flags.id) {
    return fail(asJson, 'arg_error', 'missing --id');
  }

  const queueDir = resolve(flags['queue-dir'] ?? QUEUE_DIR_DEFAULT);
  const selectorsPath = resolve(flags.selectors ?? SELECTORS_CONFIG_DEFAULT);
  const profileDir = resolve(flags['profile-dir'] ?? PROFILE_DIR_DEFAULT);
  const queuePath = join(queueDir, `${flags.id}.md`);
  const dryRun = !!flags['dry-run'];
  const headless = !!flags.headless;

  if (!existsSync(queuePath)) {
    return fail(asJson, 'not_found', `queue file missing: ${queuePath}`);
  }
  if (!existsSync(selectorsPath)) {
    return fail(asJson, 'not_found', `selectors config missing: ${selectorsPath}`);
  }

  // Parse queue file
  const raw = readFileSync(queuePath, 'utf8');
  const { frontmatter, body, error: parseError } = parseYamlFrontmatter(raw);
  if (parseError || !frontmatter) {
    return fail(asJson, 'parse_error', parseError ?? 'frontmatter missing');
  }

  // Only 'ready' items may be posted
  if (frontmatter.status !== 'ready') {
    return fail(asJson, 'not_ready', `status is '${frontmatter.status}', not 'ready'`);
  }

  // Validation
  if (!flags['skip-validation']) {
    const archive = collectPostedArchive(queueDir, flags.id);
    const v = runValidationSuite({ frontmatter, body }, 'preflight', archive);
    if (!v.valid) {
      return fail(asJson, 'validation', v.errors.join('; '), { errors: v.errors, warnings: v.warnings });
    }
  }

  // Parse selectors config
  let selectors;
  try {
    selectors = parseYaml(readFileSync(selectorsPath, 'utf8'));
  } catch (err) {
    return fail(asJson, 'selectors_parse', `selectors YAML parse error: ${err.message}`);
  }
  const el = selectors?.elements;
  if (!el?.tweetTextarea || !el?.postButton) {
    return fail(asJson, 'selectors_shape', 'selectors config missing tweetTextarea or postButton');
  }

  // Split sections for threads
  const sections = splitSections(body, frontmatter.type);
  if (sections.length === 0 || sections.some(s => !s)) {
    return fail(asJson, 'validation', 'no usable sections after split');
  }
  if (frontmatter.type === 'thread' && !el.addPostButton) {
    return fail(asJson, 'selectors_shape', 'thread requested but addPostButton missing from selectors');
  }

  // Ensure profile dir exists
  if (!existsSync(profileDir)) mkdirSync(profileDir, { recursive: true });

  // Launch browser
  emitText(asJson, `Launching ${headless ? 'headless' : 'headed'} Chromium (profile: ${profileDir})...`);
  let context;
  try {
    context = await chromium.launchPersistentContext(profileDir, {
      headless,
      viewport: { width: 1280, height: 900 },
    });
  } catch (err) {
    return fail(asJson, 'browser_launch', `failed to launch Chromium: ${err.message}`);
  }

  let page;
  let exitCode = 0;
  let postedUrl = null;
  let screenshotPath = null;

  try {
    page = await context.newPage();

    // Navigate
    emitText(asJson, 'Navigating to x.com/compose/post...');
    await page.goto('https://x.com/compose/post', {
      timeout: NAVIGATION_TIMEOUT_MS,
      waitUntil: 'domcontentloaded',
    });
    await page.waitForTimeout(1500); // let SPA hydrate

    // Intervention check before we even try to find the composer
    const pre = await detectPlatformIntervention(page);
    if (pre) {
      const code = pre.type === 'session_expired' ? 'session_expired' :
                   pre.type === 'rate_limit' ? 'rate_limit' : 'captcha';
      try {
        updateFrontmatter(queuePath, { status: 'failed', error: `${pre.type}: ${pre.evidence}` });
      } catch {}
      throw Object.assign(new Error(`${pre.type}: ${pre.evidence}`), { code });
    }

    // Fill each section
    for (let i = 0; i < sections.length; i++) {
      emitText(asJson, `Filling section ${i + 1}/${sections.length} (${sections[i].length} chars)...`);
      const { locator } = await findByFallbacks(page, el.tweetTextarea, i);
      await locator.click();
      // use fill() which replaces content; for contenteditable, Playwright types
      await locator.fill(sections[i]);
      await page.waitForTimeout(200);

      if (i + 1 < sections.length) {
        const { locator: addLoc } = await findByFallbacks(page, el.addPostButton);
        await addLoc.click();
        await page.waitForTimeout(400); // new textarea renders
      }
    }

    // Screenshot for audit trail
    const tempDir = resolve('temp');
    if (!existsSync(tempDir)) mkdirSync(tempDir, { recursive: true });
    screenshotPath = join(tempDir, `${flags.id}-${Date.now()}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: false });

    if (dryRun) {
      emitText(asJson, `Dry-run complete. Composer filled; screenshot saved to ${screenshotPath}.`);
      const durationMs = Date.now() - startedAt;
      emitJson(asJson, {
        ok: true,
        id: flags.id,
        status: 'dry-run',
        url: null,
        screenshot: screenshotPath,
        sections: sections.length,
        durationMs,
      });
      return 0;
    }

    // Actual post
    emitText(asJson, 'Clicking Post...');
    const { locator: postLoc } = await findByFallbacks(page, el.postButton);
    await postLoc.click();

    // Wait for the URL to change to the posted tweet's canonical URL.
    // X redirects to /{username}/status/{tweetId} after a successful post.
    await page.waitForURL(/\/status\/\d+/, { timeout: POST_REDIRECT_TIMEOUT_MS }).catch(async () => {
      // If URL didn't change, recheck for intervention
      const post = await detectPlatformIntervention(page);
      if (post) throw Object.assign(new Error(`${post.type}: ${post.evidence}`), { code: post.type });
      throw Object.assign(new Error('post click did not navigate to /status/... within timeout'), { code: 'post_timeout' });
    });

    postedUrl = page.url();
    emitText(asJson, `Posted: ${postedUrl}`);

    // Update queue frontmatter -> posted
    updateFrontmatter(queuePath, {
      status: 'posted',
      posted_at: new Date().toISOString(),
      url: postedUrl,
      error: null,
    });

    const durationMs = Date.now() - startedAt;
    emitJson(asJson, {
      ok: true,
      id: flags.id,
      status: 'posted',
      url: postedUrl,
      screenshot: screenshotPath,
      sections: sections.length,
      durationMs,
    });
    return 0;

  } catch (err) {
    const code = err.code ?? 'unknown';
    emitText(asJson, `Error: ${err.message}`);
    // best-effort frontmatter update if we got at least to ready state
    if (code !== 'validation' && code !== 'not_ready') {
      try {
        updateFrontmatter(queuePath, { status: 'failed', error: err.message });
      } catch {}
    }
    return fail(asJson, code, err.message, { screenshot: screenshotPath });
  } finally {
    if (context) await context.close().catch(() => {});
  }
}

main().then(code => process.exit(code ?? 0)).catch(err => {
  process.stderr.write(`post_twitter: unhandled error: ${err.stack ?? err.message}\n`);
  process.exit(2);
});
