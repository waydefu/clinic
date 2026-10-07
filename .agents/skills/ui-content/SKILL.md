---
name: "ui-content"
description: "Write and organise plain Traditional Chinese interface content for the clinic, including article reading order, action labels, source-preserving medical copy and accessible comparisons or complete-figure explanations. Use for wording and information design; use ui-design for composition and ui-check for implementation verification. Does not authorise new medical claims, booking flows or publication."
metadata:
  generated: "true"
  generator: "scripts/generate-agent-skills.mjs"
  source: ".claude/skills/ui-content/SKILL.md"
---
# Make the clinic content understandable

Use this skill when wording or information order is the problem. Read the
affected content, current user request and source/review record. Start from
what a visitor needs to understand or do at this point, rather than filling
a predetermined hero/card template. For a small label fix, inspect its action
and neighbours; do not rewrite the whole article.
Existing copy can supply sourced facts without dictating the new wording or
information order. Judge the rewrite by meaning preservation and the visitor's
task, not by resemblance to the current page. Do not invent demonstration copy
and promote it to an approved model; use actual source-backed content and
professionally inspected information design.

Read [content patterns](../../../.claude/skills/ui-content/reference/content-patterns.md)
for meaning-preserving rewrites, reading structures and comparison/figure handling.
[Sources and rights](../../../.claude/skills/ui-design/reference/sources-and-rights.md)
owns the existing medical-source, asset and authority boundaries; do not create
a second clinical approval policy in this skill.

## Preserve meaning before simplifying

Separate administrative/brand facts, medical statements and interaction labels.
For each medical claim retain the source locator, exact meaning and review
state, including numbers/units, comparison basis, conditions and uncertainty.
Use the existing record or handoff rather than inventing another registry.
If absent or ambiguous, leave it pending medical review and identify the gap.
A polished rewrite, an old official page or an AI score is not clinical approval.

Translate unfamiliar terms near their first use only when their explanation
has a source. Shorten sentence structure; do not strengthen “may” into “will”,
turn a relative comparison into a guarantee, omit an eligibility condition or
infer a diagnosis from a visitor's symptom. Source research can clarify a gap
when authorised, but cannot substitute for the clinic's review.

## Give each section one reading job

Define the section's question and what existing material answers it. Put the
answer or useful orientation before detail, then provide a clear continuation.
Use headings that name the actual topic or question, short connected paragraphs
and lists for genuine groups/sequences. Preserve the article's own rhythm;
not every topic needs five parallel blocks or an FAQ.

For first-screen wording, connect the reader's situation to the page's purpose
without an unsupported promise. Keep source and implementation commentary in
the review record rather than patient-facing labels. Long evidence and technical
detail can follow the first useful explanation; necessary safety/eligibility
information must not be hidden merely to make the page shorter.

## Make actions and mobile text specific

Name what happens after activation: read an introduction, jump to a comparison,
enlarge a whole figure or open transport directions. Remove vague repeated
“learn more” when several destinations coexist. Keep the visible and accessible
names consistent. Preserve `/booking` as the separate boundary and do not add
individual physician booking or imply that the visitor chooses a treating doctor.

Read headings aloud and inspect rendered Chinese wrapping at 375px and 200%
text. A word split or short tail line may need a shorter equivalent sentence
or wider measure, not a smaller font. Give physicians' names, roles and long
credentials a coherent reading order rather than trapping prose beside a portrait.

## Keep comparisons and full figures readable

Start from the question the comparison answers and identify its row/column
axes. Keep like-for-like criteria, units and conditions visible. Use real HTML
table semantics when relationships are tabular; cards do not preserve that axis.
On mobile, provide an accessible labelled scroll region and a visible initial
summary of sourced content, with the full comparison still available.

Keep protected whole graphics intact. A short alt identifies the figure; a
normal readable explanation/table supplies its essential information and
relationships. Do not transcribe only the title or make enlargement the sole
way to obtain first-level knowledge. Resolve unreadable or conflicting source
labels through review, not plausible guessing. “Unavailable in source” and
“not applicable” are different entries.

## Review the actual outcome

Compare original and revised meanings, then inspect the rendered reading order,
links, headings, table axes and full-figure equivalence. Check whether a visitor
can find the topic, understand the first explanation and identify the next
action. Test actionable labels against their real destinations.

Hand [ui-design](../ui-design/SKILL.md) the content hierarchy and preserved
meaning constraints. Hand [ui-check](../ui-check/SKILL.md) implemented semantics
and unverified states. Report changed copy, source/review gaps and what was
actually inspected. This procedure does not replace R-1–R-26/§5 or create a
new gate, approve medical content, alter booking or grant deployment authority.
