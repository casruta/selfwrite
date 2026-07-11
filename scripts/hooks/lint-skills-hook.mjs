#!/usr/bin/env node
// scripts/hooks/lint-skills-hook.mjs
//
// PostToolUse hook: whenever an Edit/Write touches one of the four skill
// prompt files, run the skill-file consistency lint and feed violations
// back into the editing session (exit 2 surfaces stderr to Claude).
// Wired up in .claude/settings.json. No-op for every other file.

import { execSync } from 'node:child_process';

let input = '';
process.stdin.on('data', (c) => { input += c; });
process.stdin.on('end', () => {
  let filePath = '';
  try {
    filePath = JSON.parse(input)?.tool_input?.file_path ?? '';
  } catch {
    process.exit(0); // unparseable hook payload: never block
  }
  if (!/(^|\/)self(write|research|investigate|post)\.md$/.test(filePath)) {
    process.exit(0);
  }
  const cwd = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  try {
    execSync('npm run --silent lint:skills', { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    process.exit(0);
  } catch (err) {
    process.stderr.write(
      'skill-lint failed after this edit — fix before continuing:\n' +
      `${err.stdout ?? ''}${err.stderr ?? ''}`
    );
    process.exit(2);
  }
});
