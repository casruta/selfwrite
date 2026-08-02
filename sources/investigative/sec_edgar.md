# SEC EDGAR — Backend Reference Card

Used by `/selfinvestigate` for U.S. corporate filings: annual and quarterly reports, material event disclosures, proxy statements with executive compensation, insider trading, and institutional holdings. All public; no API key required.

## v0.3 evidence contract

Run symmetric searches across issuer names/CIKs, form types, accession numbers, amendments, date ranges, and contrary disclosures; record failures. Record the source in schema-3 `sources.json` and store/hash normalized authoritative filing text at `documents/<S-ID>.txt`, retaining endpoint parameters and pagination. Search text and third-party summaries are not evidence. Only exact original filing text/fields from a provenance-PASS stored document may enter `evidence.jsonl`. Distinguish issuer assertions from established facts and do not infer intent or misconduct from timing alone.

## Base URLs

- JSON data API: `https://data.sec.gov`
- Full-text search: `https://efts.sec.gov/LATEST/search-index`
- Web filings browser: `https://www.sec.gov/cgi-bin/browse-edgar`

SEC asks automated clients to send a declared `User-Agent` header with application and contact information. Use a header-capable HTTP client; a WebFetch prompt cannot set this header. Follow the SEC's current [EDGAR access guidance](https://www.sec.gov/search-filings/edgar-search-assistance/accessing-edgar-data).

## Endpoints used

### 1. Company lookup (CIK)

A company's Central Index Key (CIK) is the stable ID for SEC purposes. Find it via:

```
GET https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&company=<name>&type=&dateb=&owner=include&count=40
```

Returns an HTML page with matching companies and their CIKs. Parse out CIKs (10-digit zero-padded numbers).

Or search the ticker-to-CIK JSON map:

```
GET https://www.sec.gov/files/company_tickers.json
```

### 2. Company submissions (all filings)

```
GET https://data.sec.gov/submissions/CIK<10-digit-CIK>.json
```

Returns the full filing history for a company: form type (10-K, 10-Q, 8-K, DEF 14A, 4, etc.), filing date, accession number, primary document URL.

### 3. Specific filing retrieval

```
GET https://www.sec.gov/Archives/edgar/data/<CIK>/<accession_number_no_dashes>/<primary_document>
```

Fetches the filing itself (typically HTML). For 10-Ks, the primary document is often 200+ pages; use targeted extraction rather than full download when possible.

### 4. Full-text search across filings

```
GET https://efts.sec.gov/LATEST/search-index?q=<query>&dateRange=custom&startdt=<YYYY-MM-DD>&enddt=<YYYY-MM-DD>&forms=<form_types>
```

Full-text searches the primary document of every filing since 2001. Use for keyword-driven discovery (e.g., find every 8-K that mentions a specific person or event).

### 5. XBRL company facts (financial data)

```
GET https://data.sec.gov/api/xbrl/companyfacts/CIK<CIK>.json
```

Returns structured financial data: revenue, cost of goods, executive compensation line items, dates, etc. Use for financial trajectory analysis without downloading full 10-Ks.

## Form types worth querying

| Form | What it is | Why investigators care |
|---|---|---|
| **10-K** | Annual report | Business description, risk factors, executive pay (ExecComp section), material litigation, related-party transactions |
| **10-Q** | Quarterly report | Same as 10-K but condensed; catches intra-year changes |
| **8-K** | Material event disclosure | Forced-disclosure trigger: acquisitions, CEO change, bankruptcy, material contracts. Most investigative. |
| **DEF 14A** | Proxy statement | Detailed executive compensation, board member bios, related-party transactions |
| **4** | Insider transactions | Every stock purchase/sale by officers, directors, 10%+ holders |
| **13F** | Institutional holdings | Quarterly disclosure by hedge funds and managers with $100M+ AUM; shows what they own |
| **SC 13D / 13G** | 5%+ beneficial ownership | Activist and passive large-holder disclosures |
| **S-1** | Initial registration | IPO prospectus; contains detailed business history and insider lists |

## Response → source record mapping

For each filing identified:

| Source record field | SEC field / derived |
|---|---|
| `canonical_id` | Accession number (format: `XXXXXXXXXX-XX-XXXXXX`) |
| `canonical_id_type` | `"sec_accession"` |
| `title` | `"{form_type}: {company_name} ({filing_date})"` |
| `authors` | `[company_name]` (the filer) |
| `year` | year portion of filing_date |
| `venue` | `"SEC EDGAR ({form_type})"` |
| `backend` | `"sec_edgar"` |
| `credibility_tier` | `1` (primary issuer filing; assertion and certification status depends on the form) |
| `abstract` | Form-specific summary (e.g., for 8-K: the Item number and brief description; for 10-K: the Business Overview section first 500 chars) |
| `discovery_excerpt` | Relevance-only passage; never evidence |
| `open_access_pdf_url` | `https://www.sec.gov/Archives/edgar/data/{CIK}/{accession_no_dashes}/{primary_doc}` |

## Calling from a subagent

The examples below describe parsing tasks. Retrieve each URL first with a header-capable client that follows SEC access policy, then provide the saved response to the subagent. Do not assume a prompt changes outbound HTTP headers.

For company history:
```
WebFetch(
  url="https://data.sec.gov/submissions/CIK0001318605.json",
  prompt="Parse SEC submissions JSON. Return: company name, CIK, ticker, former_names if any, business_address, and recent_filings array containing accessionNumber, form, filingDate, primaryDocument for the last 40 filings."
)
```

For targeted filing content:
```
WebFetch(
  url="https://www.sec.gov/Archives/edgar/data/1318605/000101862425000002/0001018624-25-000002-index.htm",
  prompt="This is an SEC 8-K filing. Extract: the Item number(s), brief description of the event reported, any named counterparties or individuals, the date of the event, and the filing date. Quote any material contract terms verbatim."
)
```

For full-text discovery:
```
WebFetch(
  url="https://efts.sec.gov/LATEST/search-index?q=%22Sheldon+Adelson%22&forms=DEF+14A,8-K&dateRange=custom&startdt=2017-01-01&enddt=2020-12-31",
  prompt="Parse SEC full-text search results. Return array of hits: accession_number, company_name, form_type, filing_date, cik, excerpt (the matched passage)."
)
```

## Actor and timeline extraction

- **8-Ks** often disclose meeting participants, counterparties to material contracts, and people resigning / joining — extract each as an actor record and the event as a timeline entry.
- **DEF 14A proxy statements** list board members, their other directorships, and executive compensation — major actor-map enrichment. Related-party-transactions section is investigative gold.
- **Form 4** filings give insider trade timestamps — for thesis work, insider trades in advance of material announcements are a strong signal. Build timeline edges from `form4.transaction_date → 8K.event_date`.
- **Schedule 13D** filings from activist investors include their stated purpose and any coordination agreements — actor-map edges between affiliated investors.

## Caveats

- **Identify automated requests.** Set the declared User-Agent in the HTTP client and follow the current SEC access policy.
- **Filings can be long.** Prefer section-targeted retrieval while retaining enough surrounding text for exact evidence verification.
- **XBRL structured data** — for financial facts (revenue, expenses, exec comp), XBRL companyfacts is far better than parsing the 10-K text. Use it for any quantitative claim.
- **Insider definitions** — Form 4 insiders are Section 16 officers and directors. It excludes beneficial owners below 10% and many consultants. Don't assume "insider" in investigative sense == Section 16 filer.
- **Rate limits** — 10 req/sec per IP (per SEC fair use policy). Exceed this and they throttle. Coordinator should serialize SEC calls or insert brief delays.
- **Historical depth** — EDGAR goes back to 1993 for most forms. Older filings exist only as paper records.
- **Foreign private issuers** file 20-F instead of 10-K (annually) and 6-K instead of 8-K (material events). Different schema.
