# PolicyDiff AI

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Insurance analysts reviewing two editions of the same policy, and technical interviewers evaluating the application as a portfolio project.

## Product purpose

Identify wording changes, locate the matching sections across editions, and let an analyst inspect the original PDF page behind each finding.

## Operating context

Analysts load a text PDF, select two indexed editions, ask a comparison question and review the findings and their source excerpts. Saved comparisons can be reopened from history. The bundled demo uses the public OAP 1 editions from 2022 and 2026.

## Capabilities and constraints

Local comparison uses keyword and semantic retrieval and compares wording. The optional ClauseLens explanation via OpenRouter sends the question and selected excerpts to the model when configured. Missing or ambiguous evidence is flagged for review. Preserve the upload, ingestion retry, history and source-viewing workflows.

## Brand commitments

The product is named PolicyDiff AI. The requested palette is dark blue, beige-grey, white and light blue.

## Evidence on hand

The demo PDFs live in `demo/`. Reproducible local search measurements and labeled questions live in `evals/`.

## Product principles

- Keep the older and newer editions distinct throughout the workflow.
- Place supporting evidence beside the finding it supports.
- Make missing evidence and model availability explicit.
- Keep the comparison usable on narrow screens and with a keyboard.
