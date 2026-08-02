# Semantic Scholar — Backend Reference Card

Used by `/selfresearch` for academic paper discovery, citation traversal, and reference chasing.

## v0.3 evidence contract

Semantic Scholar is for discovery and citation traversal. Run direct, terminology-variant, and disconfirming counterqueries; persist queries/failures. Record accepted sources in schema-3 `sources.json`, follow DOI/open-access links to the authoritative full text, and store/hash it at `documents/<S-ID>.txt`. API abstracts, TLDRs, snippets, citation labels, and generated summaries are not evidence. Only exact text from a provenance-PASS stored original may enter `evidence.jsonl`.

## Base URL

```
https://api.semanticscholar.org/graph/v1
```

Basic endpoints can be called without a key, but unauthenticated traffic shares a pool and may be throttled. Individual keys normally begin at one request per second. Handle `429` responses with backoff and confirm current terms in Semantic Scholar's [official API tutorial](https://www.semanticscholar.org/product/api/tutorial).

## Endpoints used

### 1. Paper search (planner + wave dispatch)

```
GET /paper/search?query=<q>&limit=<n>&fields=<f>&offset=<o>
```

- `query`: URL-encoded free-text query
- `limit`: max 100 per call (default 100; use 10-20 for targeted sub-questions, 50-100 for breadth passes)
- `offset`: pagination cursor
- `fields`: comma-separated. Use this set:
  `paperId,title,abstract,authors,year,venue,citationCount,referenceCount,externalIds,openAccessPdf,tldr`

Example call:
```
https://api.semanticscholar.org/graph/v1/paper/search?query=RLHF+reward+hacking&limit=20&fields=paperId,title,abstract,authors,year,venue,citationCount,externalIds,openAccessPdf
```

### 2. Paper lookup by ID (for deepen waves)

```
GET /paper/{paperId}?fields=<f>
```

Accepts `paperId`, `DOI:<doi>`, `ARXIV:<arxivId>`, `CorpusID:<id>`. Use when a prior wave returned a partial record and you need the full metadata.

### 3. Reference chase (deepen: upstream)

```
GET /paper/{paperId}/references?fields=<f>&limit=<n>
```

Returns the papers this paper cites. Use when the reflector says DEEPEN on a high-relevance source to chase its intellectual lineage.

### 4. Citation chase (deepen: downstream)

```
GET /paper/{paperId}/citations?fields=<f>&limit=<n>
```

Returns papers that cite this one. Use to find newer work that builds on a key source.

## Response → source record mapping

Semantic Scholar `/search` response shape:
```json
{
  "total": 1234,
  "offset": 0,
  "next": 20,
  "data": [
    {
      "paperId": "abc123...",
      "title": "...",
      "abstract": "...",
      "authors": [{"authorId": "...", "name": "..."}, ...],
      "year": 2024,
      "venue": "NeurIPS",
      "citationCount": 412,
      "externalIds": {"DOI": "10.xxxx/...", "ArXiv": "2305.12345", "CorpusId": 123},
      "openAccessPdf": {"url": "https://...", "status": "GREEN"},
      "tldr": {"text": "..."}
    }
  ]
}
```

Map into a temporary discovery candidate as follows, then record a retrieved original in schema-3 `sources.json` and `documents/<S-ID>.txt`:

| Source record field | Semantic Scholar field |
|---|---|
| `canonical_id` | `externalIds.DOI` if present, else `externalIds.ArXiv` if present, else `paperId` |
| `canonical_id_type` | `"doi"` / `"arxiv"` / `"s2_paper_id"` |
| `title` | `title` |
| `authors` | `authors[].name` (array) |
| `year` | `year` |
| `venue` | `venue` |
| `backend` | `"semantic_scholar"` |
| `citation_count` | `citationCount` |
| `open_access_pdf_url` | `openAccessPdf.url` (null if absent) |
| `abstract` | `abstract` (null if absent) |
| `discovery_excerpt` | `tldr.text` if present, else first 500 chars of `abstract`; relevance only, never evidence |

## Calling from a subagent

Use `WebFetch` with the URL and a parsing prompt:

```
WebFetch(
  url="https://api.semanticscholar.org/graph/v1/paper/search?query=<urlencoded>&limit=20&fields=paperId,title,abstract,authors,year,venue,citationCount,externalIds,openAccessPdf,tldr",
  prompt="Return a JSON array of papers. For each paper include: paperId, title, abstract, authors as array of names, year, venue, citationCount, externalIds object, openAccessPdf.url if present, tldr.text if present. Omit any paper without both a title and an abstract."
)
```

## Caveats

- **Abstracts can be missing.** Retrieve the publisher record or accessible full text instead of treating missing API text as evidence.
- **Limits vary by access mode.** Throttle centrally, honor `429`, and use the current official policy rather than a hard-coded quota.
- **Citation graph has incomplete coverage** for pre-2000 and non-English works.
- **`tldr`** is generated and may oversimplify. Use it only for relevance scoring. Neither it nor the API abstract is evidence; retrieve the original full text before extraction.
- **Field selection matters**: always pass `fields=` explicitly. The default is stingy.
- **Retraction check** — Semantic Scholar does not reliably flag retractions. For any paper supporting a HIGH or MODERATE confidence claim, cross-check its DOI against OpenAlex `is_retracted`. A retracted paper forces the claim to SPECULATIVE; the verifier FAILs any HIGH/MODERATE claim resting on one.
- **Credibility tier** — set `credibility_tier: 1` when `venue` is a peer-reviewed journal or conference, `3` when the record is preprint-only (e.g., an arXiv external ID with no venue). Never leave the field null.
- **Citation counts are context, not proof.** Do not use a numerical citation floor as a substitute for source quality or direct evidence.
