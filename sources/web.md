# Web — Fallback Backend Reference Card

Used by `/selfresearch` when a sub-question needs non-academic context: news coverage, policy documents, government reports, blog posts, conference talks, press releases, congressional testimony. Uses the existing `WebSearch` and `WebFetch` tools. This is a fallback — academic backends should be tried first for any sub-question that could plausibly be in the peer-reviewed literature.

## When to use

The planner subagent should tag a sub-question for web backend only if:

- The question concerns **current events** or anything in the last 6 months not yet in indexed journals
- The authoritative source is a **government agency, NGO, or regulatory body** (e.g., FDA guidance, IPCC reports, BIS working papers)
- The question is about **public discourse** (news framing, stakeholder positions, industry reaction)
- Primary sources are **non-academic** by nature (court filings, SEC disclosures, company blogs, GitHub repos for software claims)
- Academic backends returned nothing after two waves on the same sub-question

Do NOT use web fallback for:
- Generic literature review sub-questions
- Method comparisons
- Anything with a plausible peer-reviewed answer

## Discovery

```
WebSearch(query="<query>", allowed_domains=[...], blocked_domains=[...])
```

Returns a list of URLs with titles and short snippets. Use to locate candidate sources before fetching content.

Tips:
- For government sources, scope by domain: `allowed_domains=["*.gov", "*.int", "*.edu"]`
- For news with citation-worthy attribution, prefer wire services and established outlets: Reuters, AP, BBC, FT, NYT, WSJ, Bloomberg, The Economist, Nature news
- For policy documents, search the agency directly (e.g., `site:fda.gov biomarker guidance`)

## Retrieval

```
WebFetch(url="<url>", prompt="<what to extract>")
```

The prompt should match the source record schema. Example:

```
WebFetch(
  url="https://www.congress.gov/116/crec/...",
  prompt="Extract: page title, authors or committee if identifiable, publication date, publishing organization (venue), and the main body text. Return as JSON with fields title, authors (array, empty if none), year, venue, body_text. If the document has a formal citation style or docket number, include it as formal_citation."
)
```

## Response → source record mapping

Web sources don't have structured metadata, so the parsing LLM must infer fields:

| Source record field | How to derive |
|---|---|
| `canonical_id` | Final URL after redirects (prefer stable permalink if page provides one; e.g., DOI embedded in a press release) |
| `canonical_id_type` | `"url"` unless a DOI or formal docket number is present |
| `title` | Page `<title>` or `<h1>` |
| `authors` | Byline if present; organization name as fallback |
| `year` | Publication or last-updated date |
| `venue` | Domain or publisher organization (e.g., "Federal Reserve Board", "Nature News", "Reuters") |
| `backend` | `"web"` |
| `citation_count` | null |
| `open_access_pdf_url` | URL if the content is a PDF; else null |
| `abstract` | First 1-2 paragraphs or lede; for long documents, an extractive summary |
| `snippet_used` | Specific passage quoted or paraphrased in the final report |

## Credibility tiers

When the verifier flags a web source, it also evaluates credibility. Record the tier in the source record as `credibility_tier`:

1. **Primary** — first-party documents: court filings, SEC 10-K filings, government agency reports, official statistical releases, company press releases for factual claims about the company itself, academic conference recordings
2. **Authoritative secondary** — wire services and major newspapers of record (Reuters, AP, BBC, NYT, WSJ, FT, Bloomberg, Nature News, Science News); established think tanks (CBO, IMF, World Bank working papers, Brookings, Rand, Peterson Institute)
3. **Analytical secondary** — reputable trade press, specialist newsletters, long-form magazines (The Atlantic, New Yorker, Economist features), industry analyst notes
4. **Opinion / advocacy** — op-eds, partisan think tanks, advocacy organizations, personal blogs. Cite only when the source IS the claim (e.g., "Heritage Foundation argued X").
5. **Uncertain** — anything else. Avoid unless no better source exists and the claim is load-bearing.

The section writer includes the tier inline when citing a non-academic source, especially for tiers 4-5.

## Calling from a subagent

Two-step pattern:

```
# Step 1: discovery
results = WebSearch(query="FDA AI medical device guidance 2024", allowed_domains=["*.gov"])

# Step 2: fetch the most relevant 1-3 results
for r in results[:3]:
  record = WebFetch(url=r.url, prompt="Extract title, authors or committee, publication date, publisher, and the key passages relevant to 'AI medical device regulation'. Return structured JSON.")
```

## Security: URL filtering and redirect policy

WebFetch follows HTTP redirects silently by default. The wave-search subagent treats every web fetch as untrusted until both the requested URL and the post-redirect final URL pass deny-list checks.

### Deny-list categories

Reject the fetch if the host or URL matches any of these patterns:

- **Credential-harvesting domain patterns.** Hosts that look like auth-provider typosquats or phishing kits: `login-*`, `*.secure-verify.*`, `*-signin.*`, common typosquats of major auth providers (e.g., `g00gle.*`, `paypa1.*`, `microsft.*`, `app1e.*`).
- **Public pastebin / ephemeral-storage hosts.** Treat as DATA-ONLY, never as a redirect target: `pastebin.com`, `hastebin.com`, `0bin.net`, `rentry.co`, `paste.ee`, `ghostbin.co`. A poisoned source can use these to "escape" into attacker-controlled content. If the original cited source is one of these, read-only is acceptable with operator approval; if a redirect lands here, discard.
- **File-upload / malware-distribution patterns.** Reject URLs whose path ends in executable or script suffixes: `*.exe`, `*.scr`, `*.bat`, `*.cmd`, `*.msi`, `*.dll`, `*.jar`, `*.ps1`. PDFs and common document formats are allowed but still pass through the redirect check.
- **Known redirect-chain abuse patterns.** URL shorteners and redirect wrappers: `bit.ly`, `tinyurl.com`, `t.co`, `ow.ly`, `goo.gl`, `buff.ly`, `is.gd`, `tiny.cc`, `rebrand.ly`. Shorteners are always resolved first (HEAD or follow-without-parse) and then the final URL is re-checked against the full deny-list. Never treat a shortener URL as the final canonical source.

### Redirect policy

- **Log both endpoints.** For every WebFetch call, the wave-search subagent records the requested URL and the final URL after redirects in `trace.md`. One line per fetch; both URLs present even when they're identical.
- **Capture the chain in sources.json.** If the final URL differs from the requested URL, add a `redirect_chain` field to the source record: `[requested_url, final_url]`. If there were intermediate hops (e.g., shortener → aggregator → publisher), include them in order.
- **Deny-list check runs on the final URL.** If the post-redirect URL matches any deny-list pattern, discard the response, don't record the body, and emit a warning line to trace.md tagged `REDIRECT_DENIED`.
- **Shorteners are always resolved first.** Never store a shortener URL as `canonical_id`. Resolve, re-check, then fetch.

### Redacted trace entry

Example `trace.md` line for a cross-host redirect that passed checks:

```
2026-04-14T10:32:11Z fetch requested=https://bit.ly/3xYz9Qp final=https://www.federalreserve.gov/econres/feds/files/2024045pap.pdf redirect_chain=[bit.ly,www.federalreserve.gov] denylist=pass status=200
```

Example line for a fetch that was denied after redirect:

```
2026-04-14T10:34:07Z fetch requested=https://t.co/aB3dEf final=https://login-secure-verify.example/paper.pdf redirect_chain=[t.co,login-secure-verify.example] denylist=REDIRECT_DENIED action=discarded
```

### Extending the deny-list

The lists above are a starting point, not exhaustive. Operators can extend them by adding an optional `sources/denylist.md` file. The wave-search subagent reads it if present and merges its entries with the defaults. Entries in `sources/denylist.md` take the same pattern syntax (glob-style host matches and URL suffix matches). One pattern per line; lines starting with `#` are comments.

## Caveats

- **Link rot** — web URLs can change. Record `retrieved_at` timestamp explicitly. For load-bearing claims, prefer sources with stable identifiers (DOIs, docket numbers, SSRN IDs, arXiv IDs).
- **Paywalls** — WebFetch can't bypass them. If a paywalled article is the best source, note the paywall and offer a preprint or OA mirror if one exists.
- **Snippets vs. full text** — always WebFetch the full page before quoting. Search snippets are marketing summaries, not citable content.
- **Archive for volatile sources** — when citing a fast-changing page (e.g., a Wikipedia article used for background, or a rapidly-updated news story), record both the live URL and an `archive.org` snapshot URL if available. Don't rely on the live URL surviving.
- **Generative tools are never citable** — never cite ChatGPT, Bard, Claude, Perplexity answer pages, or similar. They don't have standing as sources; they aggregate others' work.
