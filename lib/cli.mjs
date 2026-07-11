// lib/cli.mjs
//
// Shared CLI plumbing for the scripts/ entry points, so the arg parser and
// exit-2 error reporter exist in exactly one place (previously five
// byte-identical copies plus a divergent sixth). Error-as-value where
// applicable; fail() exits the process by design — it is CLI-only and must
// never be imported by other lib modules.

/**
 * Tiny argv parser: `--flag`, `--flag=value`, and positionals.
 *
 * @param {string[]} argv process.argv
 * @returns {{ positional: string[], flags: Record<string, string|true> }}
 */
export function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (const a of argv.slice(2)) {
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      flags[k] = v === undefined ? true : v;
    } else {
      positional.push(a);
    }
  }
  return { positional, flags };
}

/**
 * Report an input/arg error per the repo convention and exit 2.
 * JSON mode writes structured output to stdout; otherwise stderr text.
 *
 * @param {string} msg
 * @param {boolean} json
 */
export function fail(msg, json) {
  if (json) process.stdout.write(JSON.stringify({ ok: false, error: msg }) + '\n');
  else process.stderr.write(`error: ${msg}\n`);
  process.exit(2);
}
