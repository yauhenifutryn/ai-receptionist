---
name: AI Receptionist · Schematic Print
register: brand
description: >
  Visual identity for the public landing surface of the AI Receptionist
  project. Reads like a printed engineering manual rather than a SaaS
  marketing page. Single-ink palette (deep ink on warm paper) with one
  blueprint-blue accent. Schematic line drawings, generous negative space,
  editorial typography. Distinct from competing voice-AI vendors who all
  default to dark-mode neon or rounded-emerald SaaS aesthetic.

colors:
  paper: "#F6F4EE" # warm off-white background (printed page)
  paper-edge: "#EBE7DD" # slightly darker bg for inset blocks
  ink: "#0F1418" # near-black with cool cast (heading + body)
  ink-mid: "#4A5358" # secondary body / captions
  ink-faint: "#8E9499" # tertiary labels, dividers, axis ticks
  rule: "#1A1F24" # heavy rule lines (section separators)
  blue: "#1A4FB8" # single accent — blueprint ink
  blue-deep: "#0F3690" # accent hover / pressed
  blue-tint: "#E6ECF6" # very faint accent fill (callouts)
  red-mark: "#B43A2E" # editorial proof-mark red (only for "do not" callouts)

typography:
  display:
    fontFamily: "var(--font-display), ui-serif, Georgia, serif"
    fontWeight: 400
    fontSize: "clamp(3rem, 9vw, 7.5rem)"
    lineHeight: "0.92"
    letterSpacing: "-0.025em"
    notes: >
      Instrument Serif at near-maximum scale. Italic available for one or
      two pull-quotes per page; never for body. No gradient text.
  display-sub:
    fontFamily: "var(--font-display), ui-serif, Georgia, serif"
    fontWeight: 400
    fontSize: "clamp(2rem, 4vw, 3rem)"
    lineHeight: "1.05"
    letterSpacing: "-0.015em"
  body:
    fontFamily: "var(--font-sans), ui-sans-serif, system-ui"
    fontWeight: 400
    fontSize: "1.0625rem" # 17px
    lineHeight: "1.65"
    letterSpacing: "0"
    notes: >
      Geist at slightly larger than default with editorial line-height.
      Body sets in single columns no wider than 60ch.
  caption:
    fontFamily: "var(--font-mono), ui-monospace, monospace"
    fontSize: "0.6875rem" # 11px
    letterSpacing: "0.08em"
    textTransform: "uppercase"
    color: "{colors.ink-faint}"
  number-display:
    fontFamily: "var(--font-mono), ui-monospace, monospace"
    fontSize: "0.75rem"
    fontWeight: 500
    letterSpacing: "0.04em"
  marginalia:
    fontFamily: "var(--font-mono), ui-monospace, monospace"
    fontSize: "0.625rem"
    color: "{colors.ink-faint}"

rounded:
  none: "0px"
  sm: "0px" # the system commits to sharp corners; sm exists as alias
  pill: "9999px" # only for the single sign-in button motif

spacing:
  hairline: "1px"
  rule: "2px"
  gutter: "1.5rem"
  block: "5rem"
  section: "8rem"

borders:
  hairline: "1px solid {colors.ink-faint}"
  rule: "2px solid {colors.rule}"
  blue: "1px solid {colors.blue}"

shadows: {} # the design explicitly avoids drop shadows; depth via rules + ink weight

components:
  body:
    backgroundColor: "{colors.paper}"
    color: "{colors.ink}"
    fontFamily: "{typography.body.fontFamily}"

  header:
    borderBottom: "{borders.hairline}"
    paddingY: "1rem"

  wordmark:
    fontFamily: "{typography.body.fontFamily}"
    fontWeight: 600
    fontSize: "0.9375rem"
    letterSpacing: "0.02em"

  serial:
    fontFamily: "{typography.caption.fontFamily}"
    fontSize: "{typography.caption.fontSize}"
    color: "{colors.ink-faint}"
    notes: >
      Editorial conceit: every page bears a serial like "DOC-2026-001 · REV 6".
      Reinforces the "this is a manual, not marketing" frame.

  rule-heavy:
    height: "{spacing.rule}"
    backgroundColor: "{colors.rule}"

  hairline:
    height: "{spacing.hairline}"
    backgroundColor: "{colors.ink-faint}"

  callout-blue:
    border: "{borders.blue}"
    backgroundColor: "{colors.blue-tint}"
    color: "{colors.blue-deep}"
    paddingX: "1rem"
    paddingY: "0.75rem"

  button-primary:
    backgroundColor: "{colors.ink}"
    color: "{colors.paper}"
    paddingX: "1.5rem"
    paddingY: "0.75rem"
    borderRadius: "{rounded.pill}"
    fontFamily: "{typography.caption.fontFamily}"
    fontSize: "{typography.caption.fontSize}"
    letterSpacing: "{typography.caption.letterSpacing}"
    textTransform: "{typography.caption.textTransform}"

  button-ghost:
    border: "{borders.hairline}"
    color: "{colors.ink}"
    paddingX: "1.5rem"
    paddingY: "0.75rem"
    borderRadius: "{rounded.pill}"
    fontFamily: "{typography.caption.fontFamily}"
    fontSize: "{typography.caption.fontSize}"
    letterSpacing: "{typography.caption.letterSpacing}"
    textTransform: "{typography.caption.textTransform}"

motion:
  curve: "cubic-bezier(0.2, 0.7, 0.2, 1)" # ease-out-expo-ish
  draw-in-ms: 1200 # SVG schematic stroke-dasharray draw-in
  fade-in-ms: 700
  hover-ms: 200
  notes: >
    Motion is sparing. Schematics draw themselves on load via stroke-dasharray.
    Body text fades in over 700ms (opacity only, never transform). No looping
    background animations. Honors prefers-reduced-motion: all motion collapses
    to a single static frame.

decoration:
  schematic-stroke: "1.25px"
  schematic-color: "{colors.ink}"
  schematic-accent: "{colors.blue}"
  notes: >
    Hand-drawn-feeling SVG line schematics replace SaaS-cliché icon grids.
    A telephone-pole-to-clinic call flow diagram is the page's centerpiece.
    Smaller schematics decorate each methodology numbered statement.

bans:
  - "Gradient text. Use solid ink color, never background-clip: text."
  - "Drop shadows. Depth comes from rules and weight contrast, not blur."
  - "Rounded cards. Every block has sharp corners except the two pill buttons."
  - "Stock SaaS icon grid (3x2 of icon+title+blurb). Use schematics or no decoration."
  - "Fake live counters. No 'X calls answered' numerics until they're verifiable."
  - "Em dashes anywhere in copy. Use commas, colons, semicolons, periods, parens."
  - "Animated background loops (canvas dot-clouds, particle fields). Motion is reserved for explicit moments."
---

# Rationale

## Why this register

The product is a piece of operational software for a clinic. Treating its
public face like a piece of marketing is a category error: clinic owners
respond to printed reference material more readily than to gradient
landing pages. Schematic Print frames the agent as a printed user-manual
specimen: serious, dated, technical, calm.

It also creates strategic distance from competitors. Every voice-AI
vendor on the market converges on one of two looks: dark-mode neon
(receptionist.ai, retell, vocode) or rounded-emerald SaaS (synthflow,
vapi-style demos). A printed-paper aesthetic is instantly recognisable
as different and signals "this team has taste" before a visitor has read
a word of copy.

## Color logic

Single-ink design with one blueprint blue. The paper background is not
pure white but a warm off-white ("paper" #F6F4EE) — pure white burns out
on phone screens at night, paper warmth doesn't. The ink color (#0F1418)
is not pure black; it has a faint cool cast that pairs with the blueprint
accent and reads softer at large display sizes.

Blue is rationed strictly. It marks schematics, the single pull-quote per
section, and the secondary callout block ("do not do" items use red-mark,
not blue, because they're editorial proof marks not data callouts).

## Type system

Two fonts, three roles. Instrument Serif covers everything display-scale
including pull-quotes and section heads. Geist Sans handles body. Geist
Mono handles only captions, page serial numbers, and the marginalia at
section edges. Setting body in mono is a category error here (it screams
"developer tool"); reserving mono for editorial labels reinforces the
manual frame.

Display sizes go larger than they need to. The hero headline tops out
near 7.5rem on wide screens. This isn't decorative — it forces a visitor
to confront the brand statement without the visual noise SaaS landings
use to compensate for unclear positioning.

## Layout philosophy

Sharp corners on everything except two pill buttons. Heavy 2px rules
separate sections instead of background-color swaps. The grid is editorial:
12 columns with generous gutters, and body text routinely overhangs by
one column into a "marginalia" channel that holds dates, sources, and
captions in mono. This is the printed-page move that SaaS layouts can't
copy because it requires a strong opinion about what's on the page.

## Anti-decoration

No icon grids, no testimonial carousels, no rotating logo bars. Schematic
line drawings carry decoration where it's needed. Each numbered methodology
statement gets a small accompanying schematic that diagrams the action
literally (a calendar grid, a forking call path, a tooth cross-section
with annotation arrows). These are illustrations, not stickers.

## Motion

Motion is rare and intentional. The hero schematic draws itself on first
view via stroke-dasharray over 1.2 seconds. Body copy fades in over 700ms
on initial paint. Nothing loops. There is no canvas particle system. The
page is mostly still, the way a printed page is still. Hover reveals are
typographic: a single character flips weight or a rule extends by one
gutter. Anything that violates prefers-reduced-motion collapses to a
single static frame on first paint.
