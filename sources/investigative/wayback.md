# Wayback Machine — Backend Reference Card

Used by `/selfinvestigate` to resolve link rot, recover deleted or edited pages, date when content first appeared online, and capture pages that might be changed or removed during an active investigation.

## Base URLs

- **Availability check**: `https://archive.org/wayback/available?url=<url>&timestamp=<YYYYMMDD>`
- **Specific snapshot**: `https://web.archive.org/web/<YYYYMMDDhhmmss>/<original_url>`
- **CDX API** (listing all snapshots): `https://web.archive.org/cdx/search/cdx?url=<url>&output=json&limit=<n>`
- **Save page now**: `https://web.archive.org/save/<url>` (browser-facing; can be triggered via POST)

No API key required for reads. Rate limits are generous but not public; heavy crawling can trigger soft blocks.

## Endpoints used

### 1. Availability check (is there a snapshot near a target date?)

```
GET https://archive.org/wayback/available?url=<urlencoded>&timestamp=<YYYYMMDD>
```

Returns the closest snapshot to the target date:
```json
{
  "url": "<original>",
  "archived_snapshots": {
    "closest": {
      "status": "200",
      "available": true,
      "url": "https://web.archive.org/web/20181215000000/...",
      "timestamp": "20181215000000"
    }
  }
}
```

Use to resolve a link that returns 404, or to recover a page as it existed on a specific date relevant to the investigation.

### 2. CDX — list all snapshots

```
GET https://web.archive.org/cdx/search/cdx?url=<urlencoded>&output=json&limit=100&from=<YYYYMMDD>&to=<YYYYMMDD>
```

Returns every snapshot timestamp for a URL. Useful for:
- Dating when content first appeared online
- Detecting edits: identical-content snapshots vs. changed-content snapshots
- Mapping rapid edit patterns (content published, then modified within hours → investigative signal)

### 3. Snapshot retrieval

```
GET https://web.archive.org/web/<timestamp>/<original_url>
```

Returns the archived HTML exactly as stored on that date. Use standard WebFetch to pull content.

### 4. Save page now (defensive archiving during a run)

When a source is volatile (newsroom under pressure, politically-sensitive blog, corporate press release), archive it immediately so the evidence survives even if the page later disappears.

```
POST https://web.archive.org/save/<url>
```

The page is fetched and archived within ~30 seconds. The resulting snapshot URL becomes the citable version.

## Response → source record mapping

When citing a wayback snapshot as the source:

| Source record field | Derived |
|---|---|
| `canonical_id` | The snapshot URL: `https://web.archive.org/web/<timestamp>/<original>` |
| `canonical_id_type` | `"wayback_snapshot"` |
| `title` | Inferred from snapshot page `<title>`; include original-domain name |
| `authors` | From original byline, else the original domain's publisher |
| `year` | From snapshot timestamp (not original publication date — distinguish) |
| `venue` | Original domain + `" (via Wayback Machine)"` |
| `backend` | `"wayback"` |
| `credibility_tier` | Tier of the **original source**, not of Wayback itself (Wayback is a faithful archive; credibility inherits from what was archived) |
| `abstract` | First 1-2 paragraphs of the archived content |
| `retrieved_at` | When we fetched the snapshot (ISO timestamp) |
| `retrieval_query` | Note: `"wayback snapshot of <original_url> captured <snapshot_timestamp>"` |

Also persist a `snapshot_timestamp` field distinct from `year` to preserve the exact capture date.

## When to invoke Wayback

The wave-search subagent should query Wayback when:

1. **A direct URL returns 404** — try the most recent snapshot before that date.
2. **The content's original date matters to the timeline** — use CDX to find the earliest snapshot, which bounds when the content existed.
3. **A claim references "the website said X"** but the live site says something different — check for edits.
4. **A politically-sensitive page is cited** that could be edited or removed — preemptively save it via Save Page Now for the investigation's evidence record.
5. **Cross-verifying an archived-only claim** — if a source cites Wayback snapshots themselves, verify the snapshots still exist.

## Calling from a subagent

```
WebFetch(
  url="https://archive.org/wayback/available?url=https%3A%2F%2Fexample.com%2Farticle&timestamp=20181215",
  prompt="Parse Wayback availability response. Return: archived_snapshots.closest with status, url, timestamp. If no snapshot found, return null."
)
```

To retrieve the snapshot content:
```
WebFetch(
  url="https://web.archive.org/web/20181215000000/https://example.com/article",
  prompt="Extract the article's title, byline, publication date (as displayed in the page), and body text. Note: this is a Wayback archive; the captured date is 2018-12-15. Return structured JSON."
)
```

To list all snapshots for a URL:
```
WebFetch(
  url="https://web.archive.org/cdx/search/cdx?url=example.com%2Farticle&output=json&limit=50",
  prompt="Parse CDX output. Return an array of snapshots. Each entry is a row where columns are [urlkey, timestamp, original, mimetype, statuscode, digest, length]. Return objects with timestamp, original, statuscode, digest. Group by digest to identify distinct content versions vs. duplicate snapshots."
)
```

## Edit detection via CDX digests

The `digest` field in CDX output is a SHA1 of the response content. Different digests for the same URL across snapshots means the content changed. Use this to:

- Detect silent edits to press releases, policy pages, official statements
- Time when the edit occurred (between the two snapshot timestamps)
- Identify likely edit windows triggered by external events

Example investigative signal: a company's "About Us" page digest changes within 48 hours of a scandal breaking.

## Caveats

- **Not every URL is archived** — Wayback has billions of snapshots but doesn't cover everything. Lack of snapshot isn't proof of absence.
- **JavaScript-rendered sites** archive poorly — dynamic content may appear blank in the snapshot. Check for this when the snapshot seems suspiciously empty.
- **Robots.txt exclusions** — some sites block Wayback via robots.txt, past and present. Excluded sites show "This page is not available" even if they were once crawled.
- **Snapshot sometimes lies** — if the original site returned an error at crawl time, Wayback may have cached the error page, not the real content.
- **Save Page Now latency** — the saved snapshot URL may take up to 60 seconds to become available. Wait and retry before citing.
- **Cite the snapshot, not the live URL** — for any claim grounded in archived content, the citation must be the Wayback snapshot URL with timestamp; the live URL may mislead a future reader if the site has since changed.
- **Original source credibility still applies** — Wayback doesn't launder credibility. A conspiracy blog's archived page is still a tier-5 source, not a primary document.
