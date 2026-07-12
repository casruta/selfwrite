# Distilled lessons — professional README rewrites

1. **Converting tables to prose trades one gate failure for another.** Table text is invisible
   to the readability analyzer, so a table-heavy baseline can show a flattering average while
   failing on stray run-ons. Unpacking those tables into sentences made every fact visible at
   once and pushed the average over the cap (13 → 21.09 here). Plan the split pass up front:
   one long sentence broken per dense paragraph, each half kept above the 8-word tricolon
   threshold.

2. **A sentence that opens with inline code never starts.** The splitter requires an uppercase
   or digit start, and backticks are stripped before it runs, so a mid-paragraph sentence
   beginning with `/selfwrite` or `lib/` silently merges into its predecessor. Openers like
   "Point `/selfwrite` at..." or "The `run-integrity.mjs` script..." keep command names
   prominent without feeding the analyzer run-ons. Paragraph-initial code is safe — paragraphs
   are segmented first.

3. **Relocating content is a completeness probe.** Moving the AI-detector note next to
   `/selfwrite` exposed that the rewrite had dropped the skill's detector-evasion purpose —
   the note had no antecedent in its new home. When a moved paragraph reads like a non
   sequitur, the missing link is usually a fact the rewrite lost; restore the fact rather than
   abandoning the move.

4. **Fold numbers into prose only after reading their defining file.** Budget guidance, stance
   semantics, tier meanings, and gate thresholds each came from a different source of truth
   (skill prompts, selfinvestigate.md's wave-search rules, selfresearch.md's tag table,
   THRESHOLDS in lib/readability.mjs). Prose absorbs numbers so smoothly that a wrong one
   looks authoritative; in a README, that failure ships to every new user.
