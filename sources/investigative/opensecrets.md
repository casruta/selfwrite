# OpenSecrets — Backend Reference Card

Used by `/selfinvestigate` for money-in-politics synthesis: industry and sector totals, candidate summaries, organization profiles, lobbying expenditures. OpenSecrets reprocesses FEC data plus Senate LDA lobbying filings into analyst-ready aggregates. Use it when you want the synthesized view; use FEC directly for raw transactional data.

## v0.3 evidence contract

OpenSecrets is normally a discovery/secondary aggregation source. Run neutral, confirming, and disconfirming searches and record failures. Record the source in schema-3 `sources.json`, preserve methodology/date/scope, and trace consequential figures to FEC or Senate LDA originals when feasible. Store/hash normalized page text at `documents/<S-ID>.txt`. Snippets, charts without underlying values/methods, and summaries are not evidence; only exact original text/values from a provenance-PASS stored document may enter `evidence.jsonl`. Association does not establish motive or coordination.

## Current access

OpenSecrets discontinued self-service public API registration in April 2025. Use the [OpenSecrets website](https://www.opensecrets.org/) as a secondary discovery source, preserve the page and its methodology, and trace consequential amounts to OpenFEC or Senate lobbying filings. Do not design a new run around API access.

The endpoint descriptions below are retained only to interpret old run artifacts or a response obtained with separately confirmed legacy access. They are not a current onboarding guide. Never place a legacy key in a prompt or trace.

## Legacy endpoint reference

### 1. Candidate summary

```
GET /?method=candSummary&cid=<cid>&cycle=<year>&apikey=<REDACTED>&output=json
```

Returns total raised, total spent, cash on hand, debts, source-breakdown (individual / PAC / self-financed / other). `cid` is OpenSecrets' candidate ID (not the FEC candidate ID).

To find `cid`: use `method=getLegislators&id=<state>&apikey=<REDACTED>` for state delegations, or cross-reference with FEC candidate name.

### 2. Top contributors to a candidate

```
GET /?method=candContrib&cid=<cid>&cycle=<year>&apikey=<REDACTED>&output=json
```

Returns top 10 contributor organizations (including PACs attributed to parent companies). This is the bundled-by-employer view — more informative than FEC's individual-donation list for most investigative questions.

### 3. Top industries funding a candidate

```
GET /?method=candIndustry&cid=<cid>&cycle=<year>&apikey=<REDACTED>&output=json
```

Industry-level breakdown: how much from oil & gas, from finance, from tech, etc. Useful for identifying structural funding patterns.

### 4. Top industries by sector

```
GET /?method=candSector&cid=<cid>&cycle=<year>&apikey=<REDACTED>&output=json
```

Same as industry but rolled up into broader sectors (e.g., energy vs. finance).

### 5. Organization profile

```
GET /?method=orgSummary&id=<orgid>&apikey=<REDACTED>&output=json
```

Given an organization ID, returns total contributions, employees' total donations, PAC contributions, party split, candidates supported. To find `orgid`: `method=getOrgs&org=<name>&apikey=<REDACTED>`.

### 6. Lobbying expenditures

```
GET /?method=orgLobbying&id=<orgid>&year=<year>&apikey=<REDACTED>&output=json
```

Returns total lobbying spend by year and top lobbyists. Cross-references Senate LDA filings.

### 7. Top contributors overall (cycle-wide)

```
GET /?method=getOrgs&org=<search>&apikey=<REDACTED>&output=json
```

Search for organizations by name fragment. Returns orgid and basic profile — needed before deeper queries.

## Response → source record mapping

OpenSecrets response shape (JSON mode):
```json
{
  "response": {
    "candidate": {
      "@attributes": {
        "cid": "...",
        "cycle": "2020",
        "first_elected": "2014",
        "source": "Center for Responsive Politics"
      },
      "contributors": {
        "contributor": [
          {"@attributes": {"org_name": "...", "total": "1250000", "indivs": "480000", "pacs": "770000"}},
          ...
        ]
      }
    }
  }
}
```

Map into a source record:

| Source record field | OpenSecrets field |
|---|---|
| `canonical_id` | Synthesized: `"opensecrets:{method}:{cid_or_orgid}:{cycle}"` |
| `canonical_id_type` | `"opensecrets_query"` |
| `title` | Synthesized: `"{method} for {entity_name} ({cycle})"` |
| `authors` | `["Center for Responsive Politics / OpenSecrets"]` |
| `year` | cycle |
| `venue` | `"OpenSecrets API ({method})"` |
| `backend` | `"opensecrets"` |
| `credibility_tier` | `2` (authoritative secondary) — reprocessed from FEC primaries |
| `abstract` | Serialized summary of the returned data (top 10 contributors, industry rollup, etc.) |
| `discovery_excerpt` | Relevance-only structured summary; never evidence |

For individual contributor rows inside a response, don't create separate sources — they're aggregated views. Extract as **actor records** (for `actors.json`) with funding_in / funding_out populated from the OpenSecrets relationships.

## Calling from a subagent

Fetch public OpenSecrets pages for discovery. If an operator has separately verified legacy API access, a credential-aware HTTP helper may fetch the response and pass only redacted data to the parsing subagent. WebFetch does not inject `OPENSECRETS_API_KEY`.

## Actor extraction from OpenSecrets

Each unique organization in a contributor response becomes (or enriches) an actor record:

```
For each org_name in response.contributors:
  Look up or create A<id> in actors.json
  Set actor.type = "organization"
  Append funding_out: {target_cid: candidate_cid, amount: total, cycle: cycle, via: "opensecrets"}
  Set affiliations from industry/sector tags (if available via subsequent orgSummary call)
```

This builds the actor map faster than waiting for individual FEC contributions to accumulate and dedupe.

## Caveats

- **Aggregation hides individuals** — OpenSecrets rolls up to organizations; individual executive donations are invisible here. Use FEC for specific person → candidate tracking.
- **Employer attribution is heuristic** — organization totals depend on matching free-text employer fields and parent organizations. Treat the result as an aggregation to verify, not an exact transactional fact.
- **Industry codes are coarse** — "Hedge Funds & Private Equity" bundles many distinct actors. For precision, drill into the constituent organizations.
- **Aggregation can lag originals.** Check the relevant filing system for the latest available record.
- **No state or local** — federal only. For state lobbying or state campaign finance, use FollowTheMoney.org or state-level systems.
- **Legacy API access is not assumed.** New users should use public pages and primary filing systems.

## Security

Before any URL reaches `trace.md` or any other run artifact, the query string must be scrubbed so `apikey=`, `api_key=`, `token=`, and similar auth parameters show `<REDACTED>` as the value. Wave-search subagents run this redaction before emitting URLs to their trace. Examples in this card already use `<REDACTED>` placeholders and must stay that way. If you see a literal API key in any run artifact, that is a bug — report and rotate.
