# arXiv — Backend Reference Card

Used by `/selfresearch` for preprints in physics, CS, math, stats, quant-bio, and econ. Essential for timely ML and theory work. No peer review; cross-reference with Semantic Scholar or OpenAlex for citation validation.

## v0.3 evidence contract

Use this backend for discovery and original retrieval. Run direct, terminology-variant, and disconfirming counterqueries; persist exact queries and failures. Record accepted sources in schema-3 `sources.json`, then store and hash the normalized original arXiv text at `documents/<S-ID>.txt`. Metadata, snippets, abstracts standing in for available full text, and generated summaries are not evidence. Only exact text from the stored original may enter `evidence.jsonl`, after provenance PASS. Record version history and prefer the version of record when available.

## Base URL

```
https://export.arxiv.org/api/query
```

No API key. The official [arXiv API manual](https://info.arxiv.org/help/api/user-manual.html#3112-start-and-max-results-paging) asks clients to wait three seconds between sequential calls. Serialize calls and back off on service errors; do not infer a separate hard-limit policy.

## Endpoint

```
GET /query?search_query=<q>&start=<offset>&max_results=<n>&sortBy=<s>&sortOrder=<o>
```

- `search_query`: uses arXiv's field-prefixed syntax. Combine terms with `AND`, `OR`, `ANDNOT`. Prefixes:
  - `ti:` — title
  - `abs:` — abstract
  - `au:` — author
  - `cat:` — category (e.g., `cs.CL`, `cs.LG`, `stat.ML`, `q-bio.NC`)
  - `all:` — search all fields (default if no prefix)
- `start`: pagination offset (0-indexed)
- `max_results`: max 2000 per call (use 20-50 for targeted sub-questions)
- `sortBy`: `relevance` (default), `lastUpdatedDate`, `submittedDate`
- `sortOrder`: `ascending` or `descending`

Example:
```
https://export.arxiv.org/api/query?search_query=abs:%22reward+hacking%22+AND+cat:cs.LG&max_results=30&sortBy=submittedDate&sortOrder=descending
```

## Response format

arXiv returns **Atom XML**, not JSON. Structure:

```xml
<feed>
  <opensearch:totalResults>1234</opensearch:totalResults>
  <entry>
    <id>https://arxiv.org/abs/2305.12345v2</id>
    <updated>2024-01-15T...</updated>
    <published>2023-05-20T...</published>
    <title>Paper title here</title>
    <summary>Abstract text here...</summary>
    <author><name>First Author</name></author>
    <author><name>Second Author</name></author>
    <arxiv:primary_category term="cs.LG" />
    <link title="pdf" href="https://arxiv.org/pdf/2305.12345v2" />
    <arxiv:doi>10.xxxx/yyyy</arxiv:doi>  <!-- optional; only if formally published -->
  </entry>
  ...
</feed>
```

## Response → source record mapping

| Source record field | arXiv field |
|---|---|
| `canonical_id` | `arxiv:doi` if present, else arXiv ID from `<id>` (strip the `https://arxiv.org/abs/` prefix and version suffix such as `v2`) |
| `canonical_id_type` | `"doi"` or `"arxiv"` |
| `title` | `<title>` (strip whitespace and newlines) |
| `authors` | `<author><name>` array |
| `year` | year from `<published>` |
| `venue` | `"arXiv"` (or `"arXiv ({primary_category})"` for more specificity) |
| `backend` | `"arxiv"` |
| `citation_count` | null (arXiv doesn't track citations; cross-reference S2 or OpenAlex by arXiv ID for this) |
| `open_access_pdf_url` | `<link title="pdf" href=...>` |
| `abstract` | `<summary>` (strip whitespace and newlines) |

## Calling from a subagent

```
WebFetch(
  url="https://export.arxiv.org/api/query?search_query=<urlencoded>&max_results=30&sortBy=relevance",
  prompt="Parse this Atom XML feed. Return a JSON array of entries. For each <entry>: arxiv_id (from <id>, strip prefix and version), doi (from <arxiv:doi> if present), title (strip whitespace), authors as array from <author><name>, published_year from <published>, primary_category from <arxiv:primary_category term>, pdf_url from <link title='pdf'>, abstract from <summary>."
)
```

## Category cheat-sheet (common for research)

| Category | Topic |
|---|---|
| cs.AI | Artificial intelligence (general) |
| cs.LG | Machine learning |
| cs.CL | Computation and language (NLP) |
| cs.CV | Computer vision |
| cs.CR | Cryptography and security |
| cs.DC | Distributed, parallel computing |
| stat.ML | Machine learning (statistics perspective) |
| stat.ME | Statistics methodology |
| math.OC | Optimization and control |
| econ.EM | Econometrics |
| q-bio.NC | Neurons and cognition |
| q-bio.QM | Quantitative methods (biology) |
| physics.soc-ph | Physics and society |

Combine with `cat:` prefix: `cat:cs.LG AND abs:"transformer"`.

## Caveats

- **No peer review** — include an explicit caveat when citing arXiv preprints alone. Prefer to pair with the published version when available (cross-check DOI via OpenAlex).
- **Versioning** — arXiv IDs carry versions (e.g., `v1`, `v2`). Strip for canonical ID; note the specific version used in `retrieved_at` context.
- **XML parsing** — don't regex. Ask the parsing LLM to structure it.
- **3-second pacing** — for multi-node waves, either serialize arXiv calls through one subagent or expect sporadic 503s and retry with backoff.
- **Citation counts absent** — for relevance scoring by citations, re-query Semantic Scholar using the arXiv ID: `GET /paper/ARXIV:2305.12345`.
- **Retraction / withdrawal check** — before a claim citing this source reaches the verifier, check for withdrawal: an arXiv paper whose latest version comment says "withdrawn" is treated as retracted. For papers with a published DOI, also check OpenAlex `is_retracted`. A retracted or withdrawn source forces the claim's confidence to SPECULATIVE with an inline caveat; the verifier FAILs any HIGH/MODERATE claim resting on one.
- **Credibility tier** — set `credibility_tier: 3` for an arXiv preprint with no published version. If the DOI cross-check finds a peer-reviewed published version, cite that instead at tier 1. Never leave the field null: the verifier's downgrade rules key off it, and a tier-3 preprint is never sole support for a HIGH-confidence claim.
