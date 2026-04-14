# OpenSecrets — Backend Reference Card

Used by `/selfinvestigate` for money-in-politics synthesis: industry and sector totals, candidate summaries, organization profiles, lobbying expenditures. OpenSecrets reprocesses FEC data plus Senate LDA lobbying filings into analyst-ready aggregates. Use it when you want the synthesized view; use FEC directly for raw transactional data.

## Base URL

```
https://www.opensecrets.org/api
```

**Free API key required** — register at `opensecrets.org/api`. Include `&apikey=<key>` on every request. Also include `&output=json` (default is XML, which is harder to parse).

## Endpoints used

### 1. Candidate summary

```
GET /?method=candSummary&cid=<cid>&cycle=<year>&apikey=<key>&output=json
```

Returns total raised, total spent, cash on hand, debts, source-breakdown (individual / PAC / self-financed / other). `cid` is OpenSecrets' candidate ID (not the FEC candidate ID).

To find `cid`: use `method=getLegislators&id=<state>&apikey=<key>` for state delegations, or cross-reference with FEC candidate name.

### 2. Top contributors to a candidate

```
GET /?method=candContrib&cid=<cid>&cycle=<year>&apikey=<key>&output=json
```

Returns top 10 contributor organizations (including PACs attributed to parent companies). This is the bundled-by-employer view — more informative than FEC's individual-donation list for most investigative questions.

### 3. Top industries funding a candidate

```
GET /?method=candIndustry&cid=<cid>&cycle=<year>&apikey=<key>&output=json
```

Industry-level breakdown: how much from oil & gas, from finance, from tech, etc. Useful for identifying structural funding patterns.

### 4. Top industries by sector

```
GET /?method=candSector&cid=<cid>&cycle=<year>&apikey=<key>&output=json
```

Same as industry but rolled up into broader sectors (e.g., energy vs. finance).

### 5. Organization profile

```
GET /?method=orgSummary&id=<orgid>&apikey=<key>&output=json
```

Given an organization ID, returns total contributions, employees' total donations, PAC contributions, party split, candidates supported. To find `orgid`: `method=getOrgs&org=<name>&apikey=<key>`.

### 6. Lobbying expenditures

```
GET /?method=orgLobbying&id=<orgid>&year=<year>&apikey=<key>&output=json
```

Returns total lobbying spend by year and top lobbyists. Cross-references Senate LDA filings.

### 7. Top contributors overall (cycle-wide)

```
GET /?method=getOrgs&org=<search>&apikey=<key>&output=json
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
| `snippet_used` | Same; typically 200-600 chars of structured summary |

For individual contributor rows inside a response, don't create separate sources — they're aggregated views. Extract as **actor records** (for `actors.json`) with funding_in / funding_out populated from the OpenSecrets relationships.

## Calling from a subagent

```
WebFetch(
  url="https://www.opensecrets.org/api/?method=candContrib&cid=N00036346&cycle=2020&apikey=<key>&output=json",
  prompt="Parse OpenSecrets candidate contributor response. Return a JSON object with: candidate_cid, cycle, source, and contributors array. Each contributor has org_name, total, indivs (individual contributions), pacs (PAC contributions). Sort contributors by total desc."
)
```

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
- **Employer attribution is heuristic** — OpenSecrets attributes donations to the parent company based on employer text on FEC filings. Free-text employer fields are noisy; attributions have a few percent error rate.
- **Industry codes are coarse** — "Hedge Funds & Private Equity" bundles many distinct actors. For precision, drill into the constituent organizations.
- **Lobbying data lags** — quarterly LDA filings appear in OpenSecrets 1-2 months after the filing deadline.
- **No state or local** — federal only. For state lobbying or state campaign finance, use FollowTheMoney.org or state-level systems.
- **API key required** — without it, every call fails. Store the key in env var and pass via the WebFetch URL; never hardcode.
- **Rate limits** — 200 calls/day on the free tier. Plan wave budgets accordingly; cache aggressively.
