# PolicyDiff AI evaluation

Thirty labeled questions on the bundled 2022 and 2026 OAP 1 PDFs. Retrieval uses each original question and checks whether each labeled section appears in the first five chunks of its edition. Sides without a labeled section are excluded from this rate. Both methods use the same corpus and exact section lookup when present. Timings are from a warm local run and include the query embedding for hybrid search.

| Retrieval | Edition-side hit@5 | Median | P95 |
| --- | ---: | ---: | ---: |
| Keyword only | 25/53 (47.2%) | 8.9 ms | 20.8 ms |
| Keyword + MiniLM / RRF | 36/53 (67.9%) | 18.5 ms | 34.9 ms |

- Targeted comparison outcome agreement: 30/30.
- Original-question labeled outcome agreement: 26/30. This separate end-to-end measurement uses each original question without inserting its labeled section number.
- Original-question scoring requires a finding for the labeled section or renumbered pair, or the labeled section in the comparison's persisted unchanged_sections metadata. Empty results alone do not count as unchanged. For insufficient-evidence cases, all returned findings must require review. Other unmatched results are unresolved. Extra unrelated findings are not scored for precision by this metric.
- Changed cases with citations on both labeled PDF pages: 7/7. This measures page support against the hand-labeled references, not semantic entailment.
- Targeted local comparison median: 21.7 ms. P95: 35.9 ms.
- Original-question local comparison median: 56.1 ms. P95: 96.4 ms.
- ClauseLens output quality and latency require a separate run with an API key. The measurements here are for local analysis.
- The optional --check gate requires all labeled targeted outcomes and changed-case page references to match. Retrieval must retain at least 25/53 keyword hits and 36/53 hybrid hits, and original-question outcomes at least 26/30, the recorded corpus baseline. The labels are preserved when the gate fails.

| Case | Question | Keyword old/new | Hybrid old/new | Expected | Targeted actual | Original-question actual | Page support |
| ---: | --- | --- | --- | --- | --- | --- | --- |
| 1 | How did the procedures and deadlines for applying for accident benefits change? | hit/hit | hit/hit | changed | changed | changed | both labeled pages |
| 2 | How did the process for choosing among multiple weekly benefits change? | hit/miss | hit/hit | changed | changed | changed | both labeled pages |
| 3 | What changed about the cost of damage covered by direct compensation for property damage? | miss/miss | miss/miss | changed | changed | changed | both labeled pages |
| 4 | What changed in the introductory text about when direct compensation for property damage applies? | miss/hit | miss/miss | changed | changed | unresolved | both labeled pages |
| 5 | What changed in the general introduction to the insured's responsibilities? | miss/miss | miss/miss | changed | changed | unresolved | both labeled pages |
| 6 | How did the wording about where to make a claim change? | hit/hit | hit/hit | changed | changed | changed | both labeled pages |
| 7 | How is the territory where the automobile is covered described? | miss/miss | miss/miss | unchanged | unchanged | unresolved | — |
| 8 | How does the rule for installment payment of premiums change? | hit/hit | hit/hit | unchanged | unchanged | unchanged | — |
| 9 | How soon does the insurer pay a legitimate claim after receiving proof of loss? | hit/miss | hit/hit | unchanged | unchanged | unchanged | — |
| 10 | Can I end my coverage at my own request, and what changed in that rule? | miss/miss | miss/miss | unchanged | unchanged | unresolved | — |
| 11 | Did the exclusions for garage employees change? | hit/hit | hit/hit | unchanged | unchanged | unchanged | — |
| 12 | What changed in the rule about drivers excluded or using the vehicle without permission? | hit/hit | hit/hit | unchanged | unchanged | unchanged | — |
| 13 | How do the editions differ about notifying the insurer of significant changes in risk? | miss/miss | hit/hit | unchanged | unchanged | unchanged | — |
| 14 | What changed about informing the insurer of a new lien or mortgage? | miss/miss | hit/miss | unchanged | unchanged | unchanged | — |
| 15 | Did the duty to report an accident involving injury or property damage change? | hit/miss | hit/hit | unchanged | unchanged | unchanged | — |
| 16 | How does coverage for a newly acquired replacement vehicle compare? | hit/hit | hit/hit | unchanged | unchanged | unchanged | — |
| 17 | What changes for a temporary replacement automobile when the described car is out of service? | hit/hit | hit/hit | unchanged | unchanged | unchanged | — |
| 18 | Do the provisions for radioactive contamination and nuclear hazards in liability coverage differ? | hit/hit | hit/hit | changed | changed | changed | both labeled pages |
| 19 | Did the liability exclusion for damage to property being transported change? | miss/miss | hit/hit | unchanged | unchanged | unchanged | — |
| 20 | What is different in the definition of an uninsured automobile? | miss/miss | miss/miss | unchanged | unchanged | unchanged | — |
| 21 | Did the definition of an unidentified automobile change for hit-and-run cases? | miss/miss | miss/miss | unchanged | unchanged | unchanged | — |
| 22 | Do the medical examination requirements change for uninsured automobile claims? | hit/hit | hit/hit | unchanged | unchanged | unchanged | — |
| 23 | How did the process for resolving disputes by arbitration change in uninsured coverage? | hit/hit | hit/hit | unchanged | unchanged | unchanged | — |
| 24 | Does the deadline to sue for loss or damage to the automobile differ under uninsured coverage? | miss/miss | miss/miss | unchanged | unchanged | unchanged | — |
| 25 | Does the way the insurer calculates the degree of fault change under direct compensation? | miss/miss | hit/hit | unchanged | unchanged | unchanged | — |
| 26 | Where does the election not to recover appear under direct compensation for property damage? | —/hit | —/hit | review | review | review | — |
| 27 | What changed in the optional loss-of-use benefit after theft? | miss/miss | hit/hit | unchanged | unchanged | unchanged | — |
| 28 | What does section 99.9 say about drone liability? | —/— | —/— | review | review | review | — |
| 29 | Is there a section 88.1 about losses caused by software subscriptions? | —/— | —/— | review | review | review | — |
| 30 | How did section 77.4 change the waiting period for dental claims? | —/— | —/— | review | review | review | — |
