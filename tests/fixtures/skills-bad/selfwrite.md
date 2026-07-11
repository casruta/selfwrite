# Fake skill for lint tests

Run `node tools/tokenize_text.py` on the draft (phantom path).

<!-- SHARED:budget-stop -->
At the start of every iteration compute elapsed/phase_budget; at or past 110% of the phase budget, force STOP.
<!-- /SHARED:budget-stop -->

The readability gate uses FK <= 12.0 by default.
