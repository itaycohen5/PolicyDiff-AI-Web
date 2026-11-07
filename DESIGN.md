---
name: PolicyDiff AI
description: A workbench for comparing policy editions and inspecting their source pages.
colors:
  navy: "#142941"
  navy-raised: "#213b55"
  navy-current: "#284761"
  ink: "#182c41"
  muted: "#526170"
  ground: "#f3f1ed"
  beige: "#eae7e1"
  surface: "#fff"
  line: "#dddcd7"
  control: "#808f9d"
  sky: "#bce2fa"
  sky-soft: "#eaf5fc"
  link: "#205d8a"
  newer-paper: "#f3f8fc"
  marker: "#ffeb3b"
  error: "#7c302f"
  error-surface: "#fff3ef"
typography:
  display:
    fontFamily: 'Geist, "Segoe UI", sans-serif'
    fontSize: "32px"
    fontWeight: 630
    lineHeight: 1.24
    letterSpacing: "-0.035em"
  headline:
    fontFamily: 'Geist, "Segoe UI", sans-serif'
    fontSize: "17px"
    fontWeight: 650
    lineHeight: 1.24
    letterSpacing: "-0.018em"
  title:
    fontFamily: 'Geist, "Segoe UI", sans-serif'
    fontSize: "14px"
    fontWeight: 650
    lineHeight: 1.24
  body:
    fontFamily: 'Geist, "Segoe UI", sans-serif'
    fontSize: "14px"
    lineHeight: 1.5
  excerpt:
    fontFamily: 'Geist, "Segoe UI", sans-serif'
    fontSize: "13px"
    lineHeight: 1.6
  label:
    fontFamily: 'Geist, "Segoe UI", sans-serif'
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.5
rounded:
  mark: "2px"
  tag: "4px"
  control: "6px"
  panel: "8px"
spacing:
  inline: "8px"
  excerpt-gap: "12px"
  panel-gap: "16px"
  panel-inset: "20px"
  canvas-medium: "24px"
  canvas-desktop: "34px"
components:
  button-primary:
    backgroundColor: "{colors.navy}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "8px 13px"
  button-primary-hover:
    backgroundColor: "{colors.navy-raised}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "8px 13px"
  button-secondary-hover:
    backgroundColor: "{colors.sky-soft}"
  button-viewer-close:
    backgroundColor: "{colors.navy-raised}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    size: "36px"
  question-field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "7px 9px"
  workspace-nav:
    backgroundColor: "{colors.navy}"
    textColor: "{colors.surface}"
  workspace-nav-current:
    backgroundColor: "{colors.navy-current}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
  finding-tag:
    backgroundColor: "{colors.sky-soft}"
    textColor: "{colors.navy}"
    rounded: "{rounded.tag}"
    padding: "2px 6px"
  finding-tag-review:
    backgroundColor: "{colors.beige}"
  pair-panel:
    backgroundColor: "{colors.beige}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
    padding: "19px 17px"
  comparison-panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
  older-passage:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "13px"
  newer-passage:
    backgroundColor: "{colors.newer-paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "13px"
  mode-option-selected:
    backgroundColor: "{colors.sky-soft}"
    rounded: "{rounded.control}"
    padding: "10px 9px"
  source-dialog:
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
---

# Design System for PolicyDiff AI

## Overview

**Creative North Star: "The Policy Comparison Workbench"**

PolicyDiff AI is a professional reading workspace. A dark navy frame anchors navigation, with a warm neutral canvas behind white working panels. The beige-grey document pair keeps the selected editions in view while the user works through the comparison setup.

Findings give the clause reference, change label and short explanation first, then place the older and newer wording together. The source viewer carries the same hierarchy into the original document, keeping the supporting excerpt close to the rendered PDF page.

**Key Characteristics:**

- Navy navigation with white working surfaces and a beige-grey document pair.
- Compact Geist typography with distinct roles for headings, evidence and metadata.
- Older-to-newer reading order with visible labels, word-level marks and page-specific source links.

## Colors

### Primary

- **Deep Navy** (`navy`) anchors navigation, the primary action and the source viewer header. Raised and current shades identify hover and the current workspace destination.
- **Sky Blue** (`sky`) marks inserted wording, text selection and keyboard focus on dark surfaces. **Soft Sky** (`sky-soft`) backs selected options, current filters and changed or added labels.
- **Link Blue** (`link`) identifies source links, field focus, selected control borders and document icons.

### Neutral

- **White Paper** (`surface`) holds the comparison form, findings, library and history.
- **Warm Ground** (`ground`) frames the workspace and backs older passages. **Pairing Beige** (`beige`) groups the document pair and backs neutral counts and review labels.
- **Cool Paper** (`newer-paper`) gives newer passages a subtle blue tint, with a stronger sky fill reserved for inserted words.
- **Ink** (`ink`) carries primary text. **Slate** (`muted`) carries descriptions, captions and metadata. Use the soft `line` for panel boundaries and the stronger `control` stroke for fields and outlined actions.
- **Removed Wording** (`removed-mark`) uses a warm fill on the older wording. The error palette pairs `error` ink with `error-surface` for failed states.

**The Evidence Mark Rule.** Use yellow marker (`#ffeb3b`) with dark ink for changed words in both editions. The older/newer labels and surfaces identify the side. Compare full matched sections in document order before projecting highlights back into the page-bound excerpts, including additions, removals and expanded excerpts. Suppress unchanged moved excerpts and leave insufficient-evidence findings unmarked. Keep source text intact and explain the yellow mark with a short legend.

## Typography

Geist Sans runs throughout the workspace, with Segoe UI and sans-serif fallbacks. Page titles are compact and closely tracked. Policy excerpts have more line spacing than the surrounding interface.

- **Display** identifies the active workspace view at 32px, reducing to 25px on mobile.
- **Headline and title** distinguish panel headings and labels inside a panel. Finding references use 18px and tabular numerals. Counts also use tabular numerals.
- **Body and excerpt** use 14px for general UI copy and 13px at 1.6 line height for quoted wording. Excerpts preserve source whitespace and allow long text to wrap.
- **Label** uses 13px at weight 600 for field labels. Page links and supporting metadata use the smaller 11–12px roles.

## Layout

On desktop, the sticky navy rail is 212px wide. The main canvas uses 34px horizontal insets and an inner measure capped at 1160px. The comparison setup and 250px document-pair panel sit in a 16px-gap grid. Findings span the content width, with two equal excerpt columns separated by 12px.

- At 1110px and below, the rail narrows to 177px, canvas insets to 24px and the pairing column to 207px.
- At 890px and below, setup and pairing stack. The two edition tiles sit side by side inside the pairing panel.
- At 680px and below, the rail becomes a top bar with a single row of three destinations, the canvas uses 16px horizontal insets and excerpts stack older above newer. The viewer becomes nearly full-screen, with the excerpt above the PDF page.
- At 430px and below, the edition selectors and form footer also stack, with the compare action spanning the available width.

## Elevation & Depth

The workspace is flat. Surface tones and one-pixel strokes distinguish the canvas, white panels and inset evidence. The source dialog uses a translucent navy scrim to separate the original page and excerpt from the workspace underneath.

## Shapes

Panels and the viewer use 8px corners. Controls, inset excerpts and edition tiles use 6px corners. Status labels and counts use 4px corners, and inline wording marks use 2px corners.

## Components

### Buttons and fields

The main action uses navy fill and a small outline icon. Secondary actions use white fill with a stronger control stroke. Main buttons and text fields have a 40px minimum height. Buttons use a short 140ms color transition and respect reduced motion. Keyboard focus is a 2px blue outline with a 3px offset, switching to sky on navy surfaces. Selected analysis mode cards pair a checked radio with a blue outline and soft sky fill.

### Navigation

The rail groups Compare, Documents and History below the wordmark. The active view has a lighter navy row, white label and sky icon. On narrow screens, the same three labeled items form the top navigation.

### Pairing and findings

The beige-grey pair panel uses white edition tiles with explicit older and newer labels. Findings put the clause reference and change label above the explanation, then group each excerpt with its own page-specific preview link. A text label distinguishes finding states, including when a passage needs review or lacks supporting evidence. Additional excerpts expand inside the same passage.

### Source viewer

The navy dialog header names the edition and page, with an action to open the original PDF and a separate close button. The desktop layout uses a 250px excerpt column beside an independently scrolling pane with a rendered single-page preview. The narrow layout stacks them and caps the excerpt row at 110px. The viewer retains the excerpt and original-PDF action while the page loads or when the preview is unavailable.

## Do's and Don'ts

- **Do** keep the older edition first and the newer edition second in both the paired setup and the evidence layout.
- **Do** place the source page link inside the passage it supports.
- **Do** pair color with explicit edition and status labels.
