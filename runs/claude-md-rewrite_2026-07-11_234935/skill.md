# Distilled lessons — writing gate-passing reference docs

1. **Bullets are sentences to the analyzer, so write them as sentences.** A bullet without
   terminal punctuation merges into the next one, and a bullet that opens with a lowercase token
   (`lib/`, a filename, a flag) never terminates the previous sentence — the splitter requires an
   uppercase start. End every bullet with a period and open every bullet with a capitalized
   subject ("Pure logic sits in `lib/` ..."), or a 10-word list becomes one 90-word "sentence".

2. **Move machine text out of prose instead of simplifying it.** Fenced code blocks, tables, and
   headings are excluded from readability analysis. Commands, flags, and invocation syntax belong
   in fences; that alone took this doc from FK 17.66 to about 10 with no meaning lost.

3. **Exemption is not a license.** The reverted iteration hid the loop descriptions in a table:
   the gate passed, and the doc got worse. Score content against the rubric separately from the
   gate — a pass earned by making text invisible to the analyzer earns no credit.

4. **Verify every stated number and flag against its source before keeping.** Duration minimums,
   CLI flags, hook claims, and threshold numbers were each checked against the file that defines
   them (skill prompts, usage strings, settings.json, THRESHOLDS). In a reference doc read by
   future sessions, a plausible-but-wrong detail is worse than an omission.
