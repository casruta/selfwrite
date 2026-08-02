# FEC (openFEC) — Backend Reference Card

Used by `/selfinvestigate` for U.S. federal campaign finance data: donations, expenditures, PAC filings, super PAC independent expenditures. Covers presidential, Senate, and House races plus party committees.

## v0.3 evidence contract

Run symmetric searches across aliases, IDs, date windows, amendments, refunds, and opposite hypotheses; record empty results. Record the source in schema-3 `sources.json` and retain/hash normalized authoritative response or filing text at `documents/<S-ID>.txt`. An API response may be an original record only when endpoint, parameters, retrieval time, pagination, and raw response are stored. Extract exact original fields/text into `evidence.jsonl`; UI snippets and third-party summaries are not evidence. A transaction does not establish motive, coordination, control, or illegality.

## Base URL

```
https://api.open.fec.gov/v1
```

OpenFEC supports a public `DEMO_KEY` for exploration and free API keys for regular use. Use a query-capable HTTP helper that reads `FEC_API_KEY` from the environment and redacts it from logs; this repository does not inject secrets into WebFetch calls. Confirm access and limits in the [official OpenFEC developer documentation](https://api.open.fec.gov/developers/).

## Endpoints used

### 1. Candidate search

```
GET /candidates/search/?q=<name>&api_key=<REDACTED>
```

Returns candidate_id, party, office sought, state/district, election years. Use this to resolve a person's name to a stable `candidate_id` before querying contributions.

### 2. Individual contributions (Schedule A)

```
GET /schedules/schedule_a/?contributor_name=<name>&two_year_transaction_period=<year>&per_page=100&api_key=<REDACTED>
```

Returns itemized receipts. A committee generally itemizes a contribution when a receipt exceeds $200 or the contributor's aggregate crosses $200; later smaller transactions may therefore appear. See the FEC's [reporting guidance](https://www.fec.gov/help-candidates-and-committees/filing-reports/individual-contributions/). Fields include contributor name, employer, occupation, amount, date, and recipient committee.

Other filters:
- `contributor_employer=<string>` — donations from employees of a specific company (fuzzy match)
- `contributor_occupation=<string>` — donations by occupation
- `contributor_city=<string>` / `contributor_state=<string>`
- `committee_id=<id>` — donations to a specific committee
- `min_amount=<n>` / `max_amount=<n>`
- `min_date=<YYYY-MM-DD>` / `max_date=<YYYY-MM-DD>`

### 3. Committee search

```
GET /committees/?q=<name>&api_key=<REDACTED>
```

Returns committee_id, treasurer name, designation (Principal Campaign, PAC, Super PAC, Party). Use to identify super PACs and their filers.

### 4. Disbursements (Schedule B)

```
GET /schedules/schedule_b/?committee_id=<id>&per_page=100&api_key=<REDACTED>
```

Returns committee spending: consultant payments, advertising buys, transfers to other committees. Fields: recipient, purpose description, amount, date.

### 5. Independent expenditures (Schedule E)

```
GET /schedules/schedule_e/?support_oppose_indicator=<S|O>&candidate_id=<id>&api_key=<REDACTED>
```

Super PAC spending for or against a specific candidate. The key signal for independent-expenditure networks.

### 6. Totals by employer (follow-the-money)

```
GET /schedules/schedule_a/by_employer/?employer=<string>&api_key=<REDACTED>
```

Aggregates donations from employees of a specific company. The classic "follow the money" query — reveals which companies' employees fund which candidates in aggregate.

## Response → source record mapping

Every FEC endpoint returns:
```json
{
  "api_version": "1.0",
  "pagination": {"page": 1, "per_page": 100, "count": 12345, "pages": 124},
  "results": [...]
}
```

For each donation record, build a temporary discovery candidate, then persist the raw authoritative response and schema-3 document record:

| Source record field | FEC field |
|---|---|
| `canonical_id` | `sub_id` (stable FEC transaction ID) |
| `canonical_id_type` | `"fec_sub_id"` |
| `title` | Synthesized: `"{contributor_name} → {committee_name}: ${amount} ({contribution_receipt_date})"` |
| `authors` | `["FEC (Federal Election Commission)"]` |
| `year` | year portion of `contribution_receipt_date` |
| `venue` | `"FEC Schedule A filing"` (or Schedule B / E) |
| `backend` | `"fec"` |
| `credibility_tier` | `1` (primary) — FEC is first-party government filings |
| `abstract` | Concatenated: `"{contributor_name} ({contributor_employer}, {contributor_occupation}) contributed ${amount} to {committee_name} on {contribution_receipt_date}. Committee type: {committee_type}."` |
| `discovery_excerpt` | Relevance-only normalized fields; never evidence |

Also persist each FEC record as a **timeline event** (`timeline.json`) with:
- `event_type`: `"donation"` (or `"disbursement"`, `"independent_expenditure"`)
- `date`: contribution_receipt_date
- `actors_involved`: [contributor_actor_id, recipient_actor_id, employer_actor_id_if_entity]
- `financial_amount`: amount
- `evidence_ids`: [E-ID extracted from the stored FEC response]

## Calling from a subagent

Fetch with a credential-aware helper, then pass only the redacted response to the parsing subagent. Ask it to return `sub_id`, contributor identity fields, receipt date and amount, committee fields, and pagination. Never place the real query key in a model prompt or persisted URL.

For large result sets (>100 records), iterate through pages by incrementing `&page=N` until `pagination.pages` is reached or the retrieval ceiling is hit.

## Financial-flow tracer usage

The financial-flow tracer subagent (Stage 3 of `/selfinvestigate`) uses FEC to link timeline events. For each significant non-financial event in the timeline (policy announcement, appointment, public statement), it queries:

```
GET /schedules/schedule_a/?
  contributor_name=<donor_of_interest>
  &min_date=<event_date - 90 days>
  &max_date=<event_date + 90 days>
  &per_page=50
  &api_key=<REDACTED>
```

Any donations in the ±90-day window are surfaced as potentially correlated with the event. The causal-chain analyzer in Stage 4 then evaluates whether the timing is coincidental or suggestive.

## Caveats

- **Itemization is cumulative.** A receipt at or below $200 can appear after the contributor's aggregate crosses the reporting threshold. Do not infer that every listed row individually exceeded $200.
- **State races aren't covered** — FEC is federal only. State campaign finance requires state-level systems (FollowTheMoney.org aggregates many, or direct state SoS databases).
- **Dark money** — 501(c)(4)s and some LLCs don't disclose donors. FEC shows the LLC name as contributor; the actual beneficial owner may be hidden. Cross-reference with OpenSecrets for partial disclosure.
- **Disbursement descriptions are freeform text** — "consulting services" could be anything. Pair with disbursement recipient research to interpret.
- **Access limits can change.** Read the current OpenFEC documentation, throttle, and batch aggregation queries.
- **Aggregation endpoints are your friend** — use `/by_employer/`, `/by_size/`, `/totals/` when you need summaries; don't download every row and aggregate locally.

## Security

Before any URL reaches `trace.md` or any other run artifact, the query string must be scrubbed so `api_key=`, `apikey=`, `token=`, and similar auth parameters show `<REDACTED>` as the value. Wave-search subagents run this redaction before emitting URLs to their trace. Examples in this card already use `<REDACTED>` placeholders and must stay that way. If you see a literal API key in any run artifact, that is a bug — report and rotate.
