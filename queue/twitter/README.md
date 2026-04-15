# Twitter Queue

This directory holds tweets and threads waiting to be posted by `/selfpost`. Each file is one post (single tweet or thread). Files flow through four statuses: `draft` → `ready` → `posted`, with `failed` and `cancelled` as off-ramps.

## Lifecycle

```
/selfpost new "topic"     →  status: draft   (Claude wrote it, you haven't approved)
you edit the file         →  status: ready   (you flipped the flag, it's queued to fire)
/selfpost run             →  status: posted  (Chrome drove x.com, tweet is live, URL captured)
                          →  status: failed  (something went wrong; see error field)
/selfpost cancel <id>     →  status: cancelled
```

The only status transition you make manually is `draft → ready`. The skill handles the rest.

## File naming

`queue/twitter/YYYYMMDD-HHMM-<slug>.md`

- `YYYYMMDD-HHMM` is the created timestamp (local time).
- `<slug>` is 2-4 hyphen-separated lowercase words from the topic.
- Example: `20260414-1545-detection-research.md`.

## Frontmatter fields

```yaml
---
id: 20260414-1545-detection-research   # matches filename, don't edit
status: draft                           # draft | ready | posted | failed | cancelled
type: thread                            # tweet | thread
created: 2026-04-14T15:45:00            # when /selfpost new ran
posted_at: null                         # ISO timestamp, set by run
url: null                               # x.com/.../status/... URL, set by run
error: null                             # failure message, set by run if status=failed
tags: [research, ai]                    # optional, for your own organization
---
```

You edit `status` and `tags`. Everything else is managed by `/selfpost`.

## Body format

**Single tweet** (`type: tweet`): plain body, ≤ 280 chars.

```markdown
Writing on the internet works best when you have a clear, specific point
and you open with it. The rest is just details.
```

**Thread** (`type: thread`): numbered sections with `# N` headers, each section ≤ 280 chars.

```markdown
# 1

Section 1 is a standalone hook. If someone reads only this tweet, they
should get the point. The rest is payoff, not setup.

# 2

Section 2 lands the first piece of evidence. Not a restatement of the
hook. A new thing.

# 3

Section 3 wraps, but not with a CTA. Land the idea, stop.
```

The skill reads these headers to split the thread into separate tweets. Don't change the `# N` pattern — it's the thread boundary.

## Editing rules

- Edit `status`, body text, and `tags`. Don't touch `id`, `created`, `posted_at`, `url`, or `error`.
- If you rewrite the body, double-check each section is still ≤ 280 chars. The skill validates on `run`, but catching it at edit time is faster.
- Changing `status: posted` back to `ready` won't re-post the tweet. The skill treats `posted` as terminal. If you want to repost, create a new draft.

## Cleanup

Nothing auto-deletes. `posted` items accumulate as a natural archive. If the directory gets crowded, move older files into `queue/twitter/archive/` manually. The skill only globs the top level of `queue/twitter/`, so anything in a subdirectory is out of scope.

## See also

- `../../selfpost.md` — the skill spec, including the posting flow, selector table, and failure catalog.
