# CourtListener — Backend Reference Card

Used by `/selfinvestigate` for U.S. federal (and some state) court filings, opinions, oral arguments, and PACER-backed docket entries. Run by the Free Law Project.

## Base URL

```
https://www.courtlistener.com/api/rest/v3
```

**Free API key required** — register at `courtlistener.com/sign-up/`. Include as header: `Authorization: Token <your_token>`. Pass through WebFetch via the prompt (WebFetch doesn't support arbitrary headers directly, so note the token in the call or fall back to the public endpoint where available).

Rate limits: 5,000 req/hour with a token; lower without.

## Endpoints used

### 1. Universal search

```
GET /search/?q=<query>&type=<type>&court=<court>&filed_after=<YYYY-MM-DD>&filed_before=<YYYY-MM-DD>
```

`type` values:
- `o` — opinions (court decisions)
- `r` — RECAP documents (PACER docket entries; briefs, motions, exhibits)
- `d` — dockets (case-level metadata)
- `oa` — oral arguments (audio transcripts)
- `p` — judges / parties

`court` can be a specific court code (e.g., `scotus`, `ca9`, `dcd` for D.D.C.) or left blank for all.

### 2. Docket detail

```
GET /dockets/<id>/
```

Returns case metadata: case name, court, filing date, nature of suit, judge, party names, docket number, PACER link.

### 3. Docket entries (RECAP)

```
GET /docket-entries/?docket=<docket_id>
```

Returns every PACER docket entry for a case: filing date, entry number, description, and (where uploaded) the document URLs. RECAP is the public archive of PACER documents that someone has paid to retrieve.

### 4. Opinions

```
GET /opinions/?q=<query>&type=010combined&court=<court>
```

Full-text court opinions. Fields: author_id (judge), plain_text (the opinion text), date_filed, type (published, unpublished, per curiam).

### 5. Judges and parties

```
GET /people/?name=<name>
```

Returns judge profiles including appointment history, positions held, education, political affiliation (where known). Useful for actor-map enrichment.

## Response → source record mapping

For a docket:

| Source record field | CourtListener field |
|---|---|
| `canonical_id` | `absolute_url` (or `docket_number` + court code) |
| `canonical_id_type` | `"courtlistener_docket"` |
| `title` | `case_name` |
| `authors` | `[court_full_name]` |
| `year` | year of `date_filed` |
| `venue` | `court_full_name` |
| `backend` | `"courtlistener"` |
| `credibility_tier` | `1` (primary — court records) |
| `abstract` | `case_name_full + " (" + court + ", " + date_filed + "). Nature of suit: " + nature_of_suit + ". Judge: " + assigned_to_str` |
| `snippet_used` | Specific docket entry text or opinion passage relevant to the investigation |

For an opinion:

| Source record field | CourtListener field |
|---|---|
| `canonical_id` | opinion `id` or `absolute_url` |
| `canonical_id_type` | `"courtlistener_opinion"` |
| `title` | case_name + " — Opinion" |
| `authors` | [judge name] from `author_str` |
| `year` | year of `date_filed` |
| `venue` | court |
| `abstract` | First 500 chars of `plain_text` |
| `snippet_used` | The specific passage relevant to the claim |

## Calling from a subagent

Search for a specific case:
```
WebFetch(
  url="https://www.courtlistener.com/api/rest/v3/search/?q=%22specific+case+name%22&type=d",
  prompt="Parse CourtListener docket search results. Return a JSON array. For each docket: id, case_name, case_name_full, court, docket_number, date_filed, date_terminated (if present), nature_of_suit, assigned_to_str, cause, absolute_url."
)
```

Retrieve opinion text:
```
WebFetch(
  url="https://www.courtlistener.com/api/rest/v3/opinions/<opinion_id>/",
  prompt="Parse the CourtListener opinion response. Return: id, case_name, court, date_filed, author_str, type, plain_text (the full opinion), and absolute_url. If plain_text is longer than 5000 chars, return the first 5000 chars and note plain_text_truncated: true."
)
```

Find docket entries for a case:
```
WebFetch(
  url="https://www.courtlistener.com/api/rest/v3/docket-entries/?docket=<docket_id>&ordering=date_filed",
  prompt="Parse docket entries. Return an array. For each entry: entry_number, date_filed, description, recap_documents array (each with filepath_ia, document_number, pacer_doc_id, description)."
)
```

## Actor and timeline extraction from filings

- **Parties** in a docket are actors by definition — plaintiffs, defendants, intervenors, amici. Each becomes an actor record with affiliation to the case.
- **Judge** is an actor; enrich with the `/people/` endpoint to get appointment history.
- **Filing dates** become timeline events: `complaint filed`, `motion to dismiss`, `summary judgment`, `verdict`, `appeal`, etc.
- **Counsel** (attorney names) appear in dockets — actors worth tracking for patterns of representation.
- **Related cases** often appear as cited precedent in opinions — graph edges between cases.

## Caveats

- **RECAP is not complete** — only documents someone paid to retrieve from PACER end up in RECAP. Absence from RECAP doesn't mean the document doesn't exist on PACER.
- **PACER documents cost money** — if a filing isn't in RECAP, retrieving from PACER costs $0.10/page. CourtListener doesn't cover that; you have to pay directly via PACER if you need the document.
- **State courts are spotty** — CourtListener's state coverage varies wildly. Some states are near-complete; others have almost nothing. Federal coverage is comprehensive.
- **Opinion publication lag** — unpublished opinions may take months to index. Recent decisions may not appear immediately.
- **Sealed filings** are invisible — the docket will show "SEALED DOCUMENT" as the description; the content isn't available. Note these in `missing_evidence.md` as deliberate gaps.
- **OCR quality varies** — older filings scanned from paper may have OCR errors in plain_text. For exact quotes, cross-reference the PDF if available.
- **Title case mismatches** — "United States v. Smith" and "U.S. v. Smith" may not match a naive search. Use variations.
