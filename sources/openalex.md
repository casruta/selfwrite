# OpenAlex — Backend Reference Card

Used by `/selfresearch` as the primary citation-graph backbone and broad metadata source. OpenAlex covers 250M+ scholarly works with strong open metadata.

## Base URL

```
https://api.openalex.org
```

No API key required. Include `mailto=<your_email>` as a query parameter to land in the "polite pool" (100,000 req/day, better latency). Without mailto: best-effort, lower priority, rate limits can tighten without warning.

## Endpoints used

### 1. Works search (planner + wave dispatch)

```
GET /works?search=<q>&per-page=<n>&page=<p>&mailto=<email>
```

- `search`: free-text query over title, abstract, fulltext (when indexed)
- `per-page`: max 200 (default 25)
- `page`: 1-indexed page cursor
- `filter`: structured filters, compose with commas. Common ones:
  - `publication_year:2015-2026`
  - `type:article`
  - `is_oa:true` (open access only)
  - `cited_by_count:>50`
  - `authorships.institutions.country_code:US`

Example search:
```
https://api.openalex.org/works?search=mechanistic+interpretability+transformer&per-page=50&filter=publication_year:2020-2026,type:article&mailto=you@example.com
```

### 2. Citation chase (deepen)

```
GET /works?filter=cites:W<id>&per-page=<n>&mailto=<email>
```
Returns works this work cites (references).

```
GET /works?filter=cited_by:W<id>&per-page=<n>&mailto=<email>
```
Returns works that cite this one.

OpenAlex IDs are strings like `W2741809807`. Always include the `W` prefix.

### 3. Work by DOI (cross-referencing Semantic Scholar hits)

```
GET /works/doi:10.xxxx/yyyy
```

Use when a Semantic Scholar result has a DOI but thin metadata. OpenAlex usually has a richer concept / institution / open-access record.

## Response → source record mapping

OpenAlex `/works` response shape:
```json
{
  "meta": {"count": 1234, "page": 1, "per_page": 50},
  "results": [
    {
      "id": "https://openalex.org/W2741809807",
      "doi": "https://doi.org/10.xxxx/...",
      "title": "...",
      "publication_year": 2024,
      "type": "article",
      "authorships": [{"author": {"display_name": "..."}}, ...],
      "host_venue": {"display_name": "Nature"},
      "primary_location": {"source": {"display_name": "..."}, "pdf_url": "..."},
      "open_access": {"is_oa": true, "oa_status": "green", "oa_url": "..."},
      "abstract_inverted_index": {...},
      "cited_by_count": 412,
      "referenced_works_count": 58,
      "concepts": [{"display_name": "...", "score": 0.92}]
    }
  ]
}
```

Map into the source record schema as follows:

| Source record field | OpenAlex field |
|---|---|
| `canonical_id` | `doi` stripped of `https://doi.org/` prefix, else OpenAlex ID suffix (e.g., `W2741809807`) |
| `canonical_id_type` | `"doi"` or `"openalex_id"` |
| `title` | `title` |
| `authors` | `authorships[].author.display_name` |
| `year` | `publication_year` |
| `venue` | `host_venue.display_name` or `primary_location.source.display_name` |
| `backend` | `"openalex"` |
| `citation_count` | `cited_by_count` |
| `open_access_pdf_url` | `open_access.oa_url` or `primary_location.pdf_url` |
| `abstract` | Reconstruct from `abstract_inverted_index` (see below); null if absent |

### Reconstructing the abstract

OpenAlex stores abstracts as **inverted indexes** (`{word: [positions]}`) for legal reasons. To reconstruct:

```
For each (word, positions) in abstract_inverted_index:
  For each p in positions:
    tokens[p] = word
Join tokens[0..max(positions)] with spaces.
```

A wave subagent can ask its parsing LLM to do this directly in the WebFetch prompt:
> "For each result, reconstruct the abstract from abstract_inverted_index by placing each word at every listed position, then joining in order."

## Calling from a subagent

```
WebFetch(
  url="https://api.openalex.org/works?search=<urlencoded>&per-page=50&filter=publication_year:2018-2026,type:article&mailto=<email>",
  prompt="Return a JSON array of works. For each: doi (strip URL prefix), openalex_id (strip URL prefix), title, authorships as array of author display_name, publication_year, host_venue.display_name, cited_by_count, open_access.oa_url, abstract reconstructed from abstract_inverted_index by placing words at their position indices and joining."
)
```

## Caveats

- **Abstract coverage** is ~70% for post-2000 works; lower for older material.
- **Preprint overlap**: OpenAlex often has both the arXiv preprint AND the published version as separate works with different IDs. Dedupe by DOI where available; if only arXiv IDs match, prefer the published version.
- **Concept tags** (`concepts[]`) are LLM-derived and noisy. Usable for relevance signal, not for strict filtering.
- **No fulltext search by default** — only titles and abstracts are indexed for `search`. For specific phrases, consider using multiple quoted terms.
- **Include `mailto`** — without it, you're rate-limited and deprioritized. With it, you get 100k req/day.
