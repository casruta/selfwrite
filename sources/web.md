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

## Caveats

- **Link rot** — web URLs can change. Record `retrieved_at` timestamp explicitly. For load-bearing claims, prefer sources with stable identifiers (DOIs, docket numbers, SSRN IDs, arXiv IDs).
- **Paywalls** — WebFetch can't bypass them. If a paywalled article is the best source, note the paywall and offer a preprint or OA mirror if one exists.
- **Snippets vs. full text** — always WebFetch the full page before quoting. Search snippets are marketing summaries, not citable content.
- **Archive for volatile sources** — when citing a fast-changing page (e.g., a Wikipedia article used for background, or a rapidly-updated news story), record both the live URL and an `archive.org` snapshot URL if available. Don't rely on the live URL surviving.
- **Generative tools are never citable** — never cite ChatGPT, Bard, Claude, Perplexity answer pages, or similar. They don't have standing as sources; they aggregate others' work.
