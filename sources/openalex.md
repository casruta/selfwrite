# OpenAlex — Backend Reference Card

Used by `/selfresearch` as a citation-graph backbone and broad metadata source. OpenAlex describes hundreds of millions of scholarly entities and their relationships; consult the [official developer documentation](https://developers.openalex.org/) for the current data model and access terms.

## v0.3 evidence contract

OpenAlex is a discovery/citation-graph service, not evidence text. Run direct, terminology-variant, and disconfirming counterqueries and persist queries/failures. Record accepted sources in schema-3 `sources.json`, follow DOI/location fields to the authoritative original, and store/hash it at `documents/<S-ID>.txt`. OpenAlex abstracts, concepts, citation counts, snippets, and generated summaries must not enter `evidence.jsonl`; only exact text from a provenance-PASS original may do so.

## Base URL

```
https://api.openalex.org
```

The API requires a free key. As of the current [authentication and pricing documentation](https://developers.openalex.org/), a free key includes a daily usage allowance and operations have different costs. Source the key from an environment variable such as `OPENALEX_API_KEY`; never put it in prompts or trace artifacts. Treat allowances as changeable service policy rather than a workflow invariant. The downloadable snapshot is a separate access path.

## Endpoints used

### 1. Works search (planner + wave dispatch)

```
GET /works?search=<q>&per-page=<n>&page=<p>
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
https://api.openalex.org/works?search=mechanistic+interpretability+transformer&per-page=50&filter=publication_year:2020-2026,type:article
```

### 2. Citation chase (deepen)

```
GET /works?filter=cites:W<id>&per-page=<n>
```
Returns works this work cites (references).

```
GET /works?filter=cited_by:W<id>&per-page=<n>
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
      "primary_location": {"source": {"display_name": "..."}, "pdf_url": "..."},
      "open_access": {"is_oa": true, "oa_status": "green", "oa_url": "..."},
      "abstract_inverted_index": {...},
      "cited_by_count": 412,
      "referenced_works_count": 58,
      "is_retracted": false
    }
  ]
}
```

Map into a temporary discovery candidate as follows, then record a retrieved original in schema-3 `sources.json` and `documents/<S-ID>.txt`:

| Source record field | OpenAlex field |
|---|---|
| `canonical_id` | `doi` stripped of `https://doi.org/` prefix, else OpenAlex ID suffix (e.g., `W2741809807`) |
| `canonical_id_type` | `"doi"` or `"openalex_id"` |
| `title` | `title` |
| `authors` | `authorships[].author.display_name` |
| `year` | `publication_year` |
| `venue` | `primary_location.source.display_name` |
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

A parser can reconstruct the index after an authenticated client returns the response:
> "For each result, reconstruct the abstract from abstract_inverted_index by placing each word at every listed position, then joining in order."

## Calling from a subagent

Use a query-capable HTTP helper that reads `OPENALEX_API_KEY` from the environment and adds it outside the prompt. Do not put the key in a WebFetch URL, model message, or persisted trace. Give the subagent only the redacted request, returned discovery data, and the parsing instructions above. Check the current [authentication guide](https://developers.openalex.org/guides/authentication) before relying on an allowance or field.

## Caveats

- **Abstract availability varies.** Treat a missing abstract as a discovery limitation and retrieve the publisher record or accessible full text.
- **Preprint overlap**: OpenAlex often has both the arXiv preprint AND the published version as separate works with different IDs. Dedupe by DOI where available; if only arXiv IDs match, prefer the published version.
- **Schema changes matter.** `host_venue` was removed and `concepts` is deprecated; consult the official [deprecations page](https://developers.openalex.org/guides/deprecations) before changing field mappings.
- **Retraction check** — request `is_retracted` in the field list for every works query. `is_retracted: true` forces the claim's confidence to SPECULATIVE with an inline caveat; the verifier FAILs any HIGH/MODERATE claim resting on a retracted work.
- **Credibility tier** — set `credibility_tier: 1` for works in a peer-reviewed venue, `3` for preprint/repository-only works. Never leave an academic record with a null tier: the verifier's downgrade rules key off this field.
- **Citation counts are context, not proof.** Do not use a numerical citation floor as a substitute for source quality or direct evidence.

## Security

Never persist the OpenAlex key. The HTTP helper must redact `api_key` before logging a URL or response diagnostic. If a literal key reaches a run artifact, treat it as a credential incident and rotate it.
