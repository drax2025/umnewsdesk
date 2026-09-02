# Silicon Scotland Editorial Production Process â€” v3.0

> **Historical — not the running system.**
> This document describes the V2 editorial pipeline (stages F1–F8: commissioning,
> drafting, sub-editing, legal, pre-flight, WordPress publishing), which was
> retired on 2 September 2026. News Desk now does discovery and hands selected
> candidates to Newsroom V1, which owns everything downstream. Kept as a record
> of what was built and why. See `PROJECT_NOTES.md` and `README.md` for the
> system as it stands.

**Owner:** Alex Graham, Senior Editor, Union Media
**Author of this document:** AI editorial collaborator (Number One)
**Version date:** 19 May 2026
**Library pinning:** Union Media Skills Library v1.0 (`union_media_skills_library_v1_0.md`)
**Status:** v3.0 â€” structural refactor of v2.7.1. No editorial behaviour change. Agent prompts rewritten as compositions of skills from the Union Media Skills Library v1.0.
---

## How to read this document

Sections A-E describe the process as it should be executed by a human editor working with an AI collaborator, or by a fully agentic pipeline once built. Section F translates that process into self-contained prompt templates for individual specialised AI agents. Section G defines the silo pattern for replicating the system across the five Union Media titles. Section H defines the intake layer (manual now, automation flagged). Section I is the integrated production-to-response workflow including post-publication corrections. The Appendix contains the Perplexity prompts retained for the simplified pipeline.

The process is opinionated. It reflects house standards developed by Union Media â€” particularly around verbatim quotation, source independence (DIGIT/Futurescot avoidance), interlinking density, backdating discipline, and a deliberately conservative agentic posture. **The constraints are the value.**

**The v2.2 design principle:** The agent pipeline does only what it can do safely without human-to-human contact. Anything that requires outreach, judgement on borderline reputational risk, or relationship-management routes to the editor via the Reject Queue or the Editorial Escalations channel. The pipeline is a high-throughput rewrite-and-curate engine; the editors retain originating journalism as their own workstream.


## Section A â€” Programme Setup

Before any individual article is touched, **seven foundational artefacts** must exist in the working environment.

### A1. Master story pipeline
A list of candidate articles with provisional IDs (e.g. C1-C3 for Cyber, A1-A3 for AI in Business, L1-L3 for Life Sciences, R1-R3 for Robotics, S1-S3 for Space, F1-F3 for FinTech, G1-G3 for General Tech). Each entry includes: working headline, suspected primary source URL, silo tag, rough date the news event happened, source stream (Submitted / Sourced / Corporate Newsroom).

### A2. Master content inventory
Every article previously published across the Silicon Scotland network, with title, URL, silo, publication date. This is the source of truth for internal linking. Without it, the interlinking stage cannot run. Live file: `siliconscotland_content_inventory_master.docx` (currently 512 articles across 7 silos).

### A3. Editorial opportunities pipeline
A running ledger of follow-up stories, profiles, cluster pieces, cross-publication candidates, and recurring beats. Five sections: A Profile / B Follow-up / C Cluster-build / D Cross-pub / E Recurring beat. Starts empty for a new title; grows by 4-5 entries per article produced. Live file: `editorial_opportunities_pipeline.md`.

### A4. Corporate newsroom watchlist
85 monitored organisations whose press pages are checked directly as primary sources, bypassing secondary outlets entirely. Three confirmed RSS (Skyrora, Nvidia UK, FinTech Scotland); the rest resolved via rss.app. Live file: `silicon_scotland_corporate_newsrooms.csv`. **This is the cleanest path to a non-DIGIT-dependent intake stream.**

### A5. Contacts/CRM register
A record of contacts for the medium-term standalone outreach workstream. Required fields: name, role, organisation, contact channel, story ID (when used), outreach date, response (received / declined / no response), quote captured, follow-up flag, do-not-contact-before date.

**Status under v2.2:** Lightly maintained. The agent pipeline does not consume this register and does not write to it. The register exists to support the medium-term outreach workstream, which will be designed and built as a separate initiative once the agentic core is stable across all five titles. Editors may add to it from manual outreach activity in the interim. Without an underlying contacts record, the future outreach build has nothing to sit on.

### A6. House rules registry
A versioned `house_rules.md` file. Every new house rule established in an editorial session (e.g. paragraph-break preservation, author-register preservation) is appended with the date, the triggering incident, and the prompt revisions required. Agents read this file at the start of each run.

### A7. Per-title configuration
For each of the five Union Media titles, a configuration file capturing what differs between titles: editorial mission, target sectors, source tier list, scorecard sector weighting, daily quota, corporate newsroom watchlist, banned-source list, voice/tone notes. See Section G for the full silo pattern.

---

## Section B â€” Production Options and Value-Adds

### B0. The three-option production ladder (v2.2)

Each story is routed to one of three production options. Each step up adds editorial value, requires more effort, and produces more differentiated output. Option 4 (Original Interview-Led) is removed from the agent pipeline in v2.2 â€” editors may still pursue interview-led pieces manually outside the agent pipeline at their discretion.

| Option | Output | Effort | Differentiation | Conservative-mode default |
|--------|--------|--------|-----------------|---------------------------|
| 1 â€” Direct Publish | Press release published as received | Minimal | None | Submitted content only; sense-check gate |
| 2 â€” AI Rewrite | Clean article rewritten from source | Low | Low | Default for routine submitted content |
| 3 â€” Value Added Journalistic | Contextualised article with editorial framing | Medium | Medium-High | Default for sourced content with strong editorial angle |

**Hard rules:**
- Option 1 never applies to sourced content. Sourced content (anything not directly submitted to the Union Media mailbox) starts at Option 2 minimum.
- Every Silicon Scotland article carries a framing brief (see B9.2). The brief sets the Primary frame (one of six â€” see B9), Geographic tier and Category tags. The brief applies to all three production options, not Option 3 only.
- B9 no longer carries auto-escalation logic. D0 Editorial Escalation Rule continues to fire independently for critical/negative content, Tier 2 ambiguity, source contradiction and operator doubt â€” unchanged.
- Stories requiring outreach (interview-led pieces, right-of-reply for Tier 2 where the public record is one-sided, single-source verification) **route to the Reject Queue, not to a production option.** See Section D, Reject Queue subsection.

### B1. The verbatim audit (highest-impact value-add)
Running a script to substring-match every quoted paragraph against the normalised source caught:
- Holyrood's silent sub-editing of Stewart Miller's LinkedIn post ("5 years" â†’ "five years"; "Senior leadership" â†’ "senior leadership"; "6 months" â†’ "six months"). Without this audit, our R2 article would have repeated Holyrood's edits while attributing them to Miller â€” a verbatim violation.
- Paragraph-compression in early drafts of L1 (MacDonald quotes), where multi-paragraph source quotes had been rendered as one continuous block.
- Hidden Unicode hyphen variants (U+2010, U+2011) in quotes from a UoE press release that broke naive substring matching.

The audit is non-negotiable. Every published piece must pass it.

### B2. Source independence (signal-only outlets standing rule) â€” TIGHTENED v2.7
**House standing rule, retained v2.4, tightened v2.7 in response to SS-A01.** Three outlets are treated as signal-only â€” DIGIT (digit.fyi), Futurescot (futurescot.com) and Scottish Financial News (scottishfinancialnews.com). The rationale differs per outlet:

- **DIGIT and Futurescot** â€” confirmed 10 May 2026: six weeks of evidence shows both outlets are working from the same press releases and corporate newsrooms Union Media titles can reach directly. The dependency is removed entirely. Safer path, removes relationship risk.

- **Scottish Financial News** â€” added 18 May 2026: treated with care because SFN exercises caution in protecting their content and sources, and appears to find unique content others do not have. A separate analysis of SFN's sourcing is folded into the Q2 critical-hat review. Until that analysis is complete, the signal-only posture applies on the conservative principle that Union Media does not rewrite from outlets whose primary-source path it cannot independently verify.

**Operating rule (tightened v2.7 â€” itemised prohibited-use list, replaces the v2.6 "never the drafting basis, never cited as source" wording):**

DIGIT, Futurescot and Scottish Financial News must not appear in:

1. Article body
2. Headline
3. Standfirst
4. Footer summary (any field)
5. Source list (NOT-FOR-PUBLICATION footer)
6. Verbatim quote audit (F6 H1 and F9 A4)
7. Interlink list
8. Outbound link list
9. Image attribution
10. Image manifest
11. Companion video script
12. Social copy (LinkedIn, X, any social artefact)
13. Senior Editor Pre-Publish Review Pack â€” all ten sections including Failure Log
14. F9 Standing-Rule Compliance table (B2 row records *which* outlets were checked against, not that the article cites them)
15. `[PUB]` Teams audit-trail line
16. `[ESC]` Teams audit-trail line
17. `[REJ]` and `[OPS-RR]` Teams audit-trail lines (except as the subject of an OPS-RR new-signal-only-candidate notice or as the subject of a REJ "could not independently verify SFN-flagged story" reject)

The only permitted reference is a **Ranger Recon gather-index pointer** recording that the outlet flagged a story for independent first-instance verification. Layer 4 handling is set out in full in Appendix RR-4.

For all three outlets, the substantive operating rule is the same: Union Media traces independently to a public-domain primary source (company press release, official statement, regulatory filing, peer-reviewed paper, government announcement, corporate newsroom). If no independent public-domain source exists, the story does not run.

This is a Union Media positioning rule, not a generic editorial rule. It is enforced as a hard gate at F2 Researcher, F6 Reviewer H7, F9 A3, F9 A10 (numeric-claim positive trace â€” new v2.7), and at Ranger Recon Layer 4. The seventeen-artefact prohibited-use list is the operative form of the rule; the historical "never the drafting basis, never cited as source" wording is retired.

### B3. Multi-source attribution over single-source rewrites
The R2 Stewart Miller piece was originally drafted from Holyrood alone. Re-sourcing to LinkedIn primary + Daily Business Group + Heriot-Watt statement made the article independently defensible *and* introduced new biographical material (Leonardo, BAE Systems) absent from Holyrood. Multi-source articles are richer, not just safer.

### B4. Interlinking discipline (reader-first, no minimum, max three internal) â€” REWRITTEN v2.5

**Standing rule (locked 18 May 2026, Senior Editor):** Internal links are placed only where they support the article in a constructive and meaningful way. They must not detract from the article's value to the reader. There is no minimum and no target â€” zero internal links is a valid outcome if no genuinely useful link exists.

**Hard ceiling:** Maximum three internal links per article. The ceiling exists because density above three fragments the reading experience, especially on mobile, and dilutes the value signal that each link is supposed to carry.

**Internal link placement test (F4 Interlinker applies per candidate link):**
1. Does this link give the reader genuinely useful additional context they are likely to want?
2. Is the linked article topically and substantively related, not merely tag-overlapping?
3. Does the anchor text describe what the reader will find, in natural prose?

All three must be YES. Any NO and the link is not placed. If no candidate passes the test, the article ships with zero internal links and that is correct.

**Outbound links (separate rule, unchanged):** 3-5 outbound contextual links to named institutions, funders, regulators and primary sources. Outbound links serve a different function â€” evidencing the work and crediting the source â€” and the 3-5 range remains correct.

**v2.4 rationale (replaced):** The earlier "six internal links" rule was SEO-optimised, not reader-optimised. At typical news-article length, six internal links per article was one link per ~120 words â€” visually dense on mobile, and bleeding readers out of the article before they finish.

### B5. Backdating discipline
Friday-of-publication-week (or Friday-after for weekend events) gives the article a consistent timestamp pattern that reads as planned editorial cadence rather than ad-hoc publishing. Search engines weight publication date heavily; consistent Friday backdating creates a credible weekly editorial rhythm.

**Backdating is prohibited for Tier 3 stories** that exceptionally proceed to production â€” those publish with full transparency on publication date. See Section D, Tier 3 framework.

### B6. Three-headline generation, agent-selected, click-bait-leaning

**Generation:** The Writer agent produces three headline options for every article (descriptive / narrative / numbers-led), each â‰¤ 90 characters, each containing the institution/person and the most newsworthy specific. This forces explicit consideration of SEO, social shareability, and emotional pull rather than defaulting to descriptive.

**Selection:** The Editor agent picks the strongest of the three autonomously per the headline policy below. The agent's pick becomes the published headline. The operator sees all three options plus the agent's choice and reasoning in the NOT-FOR-PUBLICATION footer at publish time and may override with a single keystroke. No per-article confirmation required from the operator.

### B6.1 Headline selection policy â€” click-bait-leaning

Senior Editor's standing instruction: **"Headline should be based on click-bait â€” most likely to attract human eyes for fresh content."** This is the operating policy for the Editor agent's headline selection across all Union Media titles unless overridden per-title in config.

**What click-bait-leaning means in this context:**
- Pick the option most likely to make a human stop scrolling on LinkedIn, X, or Google search results
- Lean toward the narrative or numbers-led option (B6 options 2 or 3) over the descriptive default (option 1)
- Lead with the most specific, concrete, attention-grabbing element â€” the Â£ amount, the world-first claim, the named individual, the surprising number, the contradiction, the consequence
- Use active voice and present tense where possible
- Strong verbs over weak ones (raises / quits / wins / loses / strips / builds, not announces / launches / unveils)

**Hard limits â€” click-bait must never cross these lines:**
- No misrepresentation of the story. The headline must be factually defensible against the body.
- No vague teasers ("You won't believe...", "This Edinburgh startup just changed everything...").
- No question headlines ("Is this the future of Scottish tech?").
- No clickbait formulas that hide the news ("What happened next will surprise you").
- No puns or wordplay that obscure the subject.
- For Editorial Escalation stories (D0), the headline must be reviewed by the Senior Editor regardless of click-bait policy â€” these are the cases where attention-grabbing language carries reputational risk.

**The trade-off the agent is making:**
Click-bait-leaning trades a small accuracy-of-tone risk for a measurable engagement gain. The hard limits above keep the accuracy floor non-negotiable. Operator override at publish time catches anything the agent gets wrong.

**Examples of the difference:**

| Story | Descriptive (option 1) | Click-bait-leaning (preferred) |
|-------|------------------------|-------------------------------|
| Bioliberty raise | "Edinburgh AI rehab firm Bioliberty raises Â£7.7m" | "Bioliberty raises Â£7.7m to scale AI rehab glove from Edinburgh to global markets" |
| Stewart Miller resignation | "National Robotarium chief executive resigns" | "National Robotarium chief executive quits citing Heriot-Watt's rejection of Â£7.5m Innovate UK bid" |
| GEMINI study | "Aberdeen-led study uses AI for breast cancer screening" | "Aberdeen-led GEMINI study finds AI lifts breast cancer detection by 10.4% and cuts radiologist workload by a third" |

In each case, the click-bait-leaning headline is also the more accurate one â€” it carries more specific, defensible information. This is not coincidence: specificity is what attracts both eyes and search engines.

### B7. Pipeline-opportunity capture during research
The Earl Nightingale rule in practice. Capturing 4-5 follow-up ideas per article in a structured ledger, with category and priority, turned a one-off article batch into an ongoing editorial roadmap. The 21-article batch generated 48 follow-up opportunities â€” a 2.3x multiplier.

### B8. NOT-FOR-PUBLICATION editorial notes appended to every draft
A discipline that costs the writer 60 seconds and saves the editor 10 minutes. Source URLs, dependency notes, audit results, backdate justification, tier classification â€” all in one place, persisted with the draft.

### B9. Editorial frames â€” REWRITTEN v2.6

Replaces the v2.5 "Ten Value Added Actions". Framing now applies to **every** Silicon Scotland article, not Option 3 only. F1 Triage picks one Primary frame per story and writes it into the framing brief that travels with the article through F2 Researcher and F3 Writer.

**The six frames:**

1. **Scottish Context** â€” What this news means specifically for Scotland: jobs, investment, sector impact, named Scottish operators, regional or national consequence.
2. **Wider Sector Picture** â€” Where this news sits in the UK or global sector picture. What trend it is part of, what comparable moves have happened recently, where the sector is going.
3. **Technical or Scientific Depth** â€” What the technology, science or method actually is. The substance the press release glosses. Explained accurately and in plain language for a tech-literate but non-specialist Silicon Scotland reader.
4. **Policy and Regulation** â€” The policy, regulation, public-funding or regulatory-body context. Where this news intersects Scottish Government, UK Government, sector regulators, public funders, or pending legislation.
5. **Human Impact** â€” The translation of technical or corporate news into real-world impact on workers, consumers, citizens, patients, students or operators on the ground.
6. **Comparison or Data Point** â€” An anchor on a credible comparator or a single compelling statistic from a public source â€” a peer company's recent move, a sector benchmark, a regulator's published figure, a peer-reviewed study â€” used to give the news weight or perspective.

**Operating notes:**
- Triage picks one primary frame per story. No alternative frame is required for routine articles. The Writer drafts to the primary frame. F9 review confirms or modifies the frame at the single human gate.
- Frame is supplied to F2 and F3 via the **framing brief** (see B9.1 below). Frame is not a bare tag; it is a 2-3-sentence written instruction telling the Writer what to lead with, what to subordinate, and what the central point is.
- **No auto-escalation logic in B9.** v2.5's auto-escalating critical frames (Contrarian View, Track Record Check) are deferred to the post-Phase-1 deeper-journalism workstream. D0 Editorial Escalation Rule remains the trigger for critical/negative content, Tier 2 ambiguity, source contradiction and operator doubt â€” unchanged.
- **No frame = no story.** If Triage cannot construct a credible primary frame against any of the six, the candidate is DISQUALIFIED under the existing C0 disqualification rule ("No identifiable tech angle" or, via the Tech Lens prompt, "No identifiable tech angle (Tech Lens applied)").

**Removed from v2.5 and deferred to post-Phase-1 deeper-journalism workstream:** Contrarian View, Track Record Check, Timeline / What Happens Next, Expert Voice. The first two were the auto-escalating critical frames â€” they belong with deeper-journalism pieces backed by outreach, not routine production at volume. Timeline / What Happens Next and Expert Voice are reporting techniques the Writer applies inside one of the six frames, not separate frame choices.

### B9.1. The three-axis framing model â€” NEW v2.6

Every Silicon Scotland story carries three axes. Triage assigns all three; F9 review confirms or modifies.

**Axis 1 â€” Geographic tier (one of three):**

| Tier | Trigger | Framing job |
|---|---|---|
| **Scottish-origin** | Story breaks from a Scottish company, university, agency, regulator or event | Confirm the tech / science substance â€” the Scottishness is given |
| **UK-origin** | Story breaks from a UK source outside Scotland | Locate the Scottish hook â€” a named Scottish company, person, institution, market or regulatory parallel |
| **Global-origin** | Story breaks internationally | Anchor the Scottish stake â€” what it changes for Scottish operators, what Scottish institutions are doing in the same space |

The tier determines the framing job. It does not gate the story. A Global-origin story with a strong Scottish anchor is just as publishable as a Scottish-origin one.

**Axis 2 â€” Category tags (up to three, non-exclusive):**

The category is what kind of tech or science the story is about. A single story can carry up to three tags, in priority order (primary, secondary, tertiary). Triage assigns; F9 confirms.

Fixed taxonomy (sixteen): AI Â· Cyber Â· Fintech Â· Biotech Â· Space Â· Robotics Â· Games Â· IT Â· Science Â· HealthTech Â· EdTech Â· CleanTech / Renewables Â· Quantum Â· Semiconductor Â· GovTech Â· Data / Analytics.

**Edge cases.** If a story doesn't fit cleanly into any of the sixteen but feels tech-relevant (a Scottish bank changing internal practice because of an AI tool, say), Triage tags it with the closest fit plus a free-text note. F9 handles edge cases at sign-off; no separate routing.

**Axis 3 â€” Editorial frame (one of six):** as per B9 above.

### B9.2. The framing brief â€” NEW v2.6

What Triage hands to F2 Researcher and F3 Writer (replacing v2.5's bare VAA tag):

```
FRAMING BRIEF â€” <article-id>

Geographic tier:    Scottish-origin | UK-origin | Global-origin
Category tags:      <primary>, <secondary>, <tertiary>   (up to 3; secondary and tertiary optional)
Primary frame:      <one of the six in B9>
Scottish anchor:    <named company / institution / regulator / market / person â€” the substantive Scottish stake>
Per-story brief:    <2-3 sentences telling the Writer what to lead with,
                     what to subordinate, and what the central point of the piece is>
```

**Why a short brief, not a checklist.** Two-to-three sentences forces Triage to commit to a specific construction of the story. The Writer is good at executing a clear brief. A bag of tags produces a press-release rewrite with a Scottish word stapled on.

**Worked example â€” UK-origin AI/Fintech story for Silicon Scotland:**

> *Geographic tier: UK-origin. Category tags: AI, Fintech. Primary frame: Scottish Context. Scottish anchor: NatWest Group's Edinburgh-based AI research unit. Brief: Lead with the FCA's new AI-in-financial-services guidance and what it requires. Pivot quickly to NatWest's Edinburgh AI unit as the named Scottish operator subject to the rules â€” what they're doing, what they'll have to change. Foreground the Scottish operator; keep the regulatory detail tight.*

### B10. Single-source handling (v2.2)
When a story appears on only one monitored outlet and no primary source can be traced â€” and the public domain threshold is not met â€” the agent pipeline does not pursue the subject. The story routes to the Reject Queue under one of two reasons:

- **"Single source â€” outreach candidate if desired"** â€” story has editorial merit and the editor may want to pursue the subject manually for original content. Senior Editor reviews in the weekly sweep and decides PURSUE-MANUAL / HOLD / DROP.
- **"Single source â€” drop"** â€” story has no editorial merit beyond the originating outlet's interest. No manual pursuit warranted.

The Triage agent assigns the reason at routing time. See Section D, Reject Queue subsection for the queue mechanics.

---

### B11. Operating platform and model configuration â€” NEW v2.7.1 (Silicon) / v2.0.1 (HGS)

**Standing rule:** The agent pipeline operates inside **Perplexity Computer with default model configuration**. Subagents spawned for each pipeline stage (F-RR, F1, F2, F3, F4, F5, F6, F9, F8) run on the platform's default model for whichever subagent type they map to. **No per-stage model overrides are applied in routine production.**

**Rationale:**

- **Risk minimisation.** Per-stage model selection would introduce nine independent variance vectors â€” one per agent. The SS-A01 incident already established that harness variation produces materially different gate behaviour on the same spec. Pinning the operating platform to Computer defaults closes that variance cleanly. The model assignment is maintained by Perplexity, version-tracked by the platform, and identical for every operator on every machine.
- **Scaling discipline.** As the pipeline rolls out to additional team members and additional titles, "use Computer with defaults" is the single rule that survives the addition of new operators without training overhead, drift, or silent misconfiguration. A documented per-stage model assignment would require maintenance as the model landscape evolved; the defaults route delegates that maintenance to the platform.
- **Quality is already high.** Senior Editor assessment as at 19 May 2026 is that pipeline output quality under Computer defaults is high across all stages. The marginal quality gain from deliberate per-stage model selection is small relative to the operational risk of carrying nine override decisions through team training and audit.

**Override path (experiments only, not routine production):** If a deliberate experiment requires varying the model on a specific stage â€” for example, a Phase C calibration test or a one-off comparison â€” the override is applied as a per-run parameter (the `model` argument on the subagent call) and recorded in the article's Failure Log under "Standing-rule check added late: B11 model-override applied â€” reason: <reason>". Routine production does not invoke this path.

**This rule does not apply to the v3.0 n8n implementation.** The skills-factored v3 specification (Silicon Scotland v3.0, planned next-task) is the basis for a separate n8n-on-Claude production system built by a Union Media colleague. Model selection on that implementation is a Claude-on-n8n decision, made on its own platform, and is out of scope for this rule. This rule binds Computer-based production only.

---

## Section C â€” Critical Review Inputs

### C0. Triage Scorecard

Each candidate story scored before drafting. **Maximum 22 points; 13+ = strong candidate.**

| Factor | Points | Scoring guidance |
|--------|--------|------------------|
| Scottish relevance | 5 | Directly about Scotland or Scottish company: 5. Some Scottish connection: 2. None: 0. |
| Sector relevance | 4 | Core sector (Space / Science / Fintech / AI / Cyber / Robotics / Games / Biotech / IT / clear tech angle in govt/health/sport): 4. Adjacent: 2. Outside: 0. |
| Recency | 4 | Today: 4. Yesterday: 2. >48h with ongoing value: 1. >48h no value: 0. |
| Multi-source coverage | 3 | Two or more monitored outlets covering: 3. Single source: 0. |
| Audience impact | 3 | Directly affects tech professionals or business owners: 3. Some interest: 1. None: 0. |
| Editorial angle potential | 2 | Distinctive angle available: 2. Limited: 1. None: 0. |
| Press release source quality | 1 | Mailbox items only: credible source with verifiable claims: 1. Else: 0 or N/A. |

**Disqualification rules â€” automatic removal regardless of score:**
- No identifiable tech angle
- Primary source cannot be traced
- Older than 48 hours with no ongoing value
- Duplicates a story published in the last 7 days
- Press release contains a key claim that cannot be independently verified
- Sole-source coverage on DIGIT, Futurescot or SFN only (per B2)
- Paywalled-only sourcing (per D2)

### C1. Verbatim quote audit (HARD GATE)
**Method:** Unicode normalisation (curly quotes â†’ straight; all hyphen variants U+2010-U+2015 â†’ ASCII; non-breaking spaces U+00A0/202F/2009 â†’ space; whitespace collapsed). Then substring-match each quoted paragraph against the normalised source. MISMATCH stops publication.
**Failure mode if missed:** Misquotation, attribution error, libel risk. Highest-impact failure mode in the process.

### C2. Source-independence and Public Domain Threshold (HARD GATE)
**Method:**
- Confirm at least one non-DIGIT, non-Futurescot primary source exists
- Apply the Public Domain Threshold: a story has reached public domain when it has been published independently by **three or more separate sources**. When the threshold is met, Silicon Scotland is free to act on the story (drafting from the primary source, not from any outlet's version).
- For controversial stories (resignations, lawsuits, regulatory actions), confirm at least two independent confirmations regardless of public domain threshold.
- If neither the public domain threshold is met nor a primary source can be traced, route to the Reject Queue (see Section D).
**Failure mode if missed:** Reputational risk with DIGIT (relationship damage). Sole-source fragility if the one source retracts or amends. Copyright exposure if drafted from a secondary outlet's version.

### C3. Paragraph-break preservation (HARD GATE)
**Method:** For each multi-paragraph source quote, confirm the published version preserves paragraph breaks. Use the source's actual paragraph structure, not the writer's preferred flow.
**Failure mode if missed:** Subtle misquotation that survives surface-level audit but distorts the speaker's emphasis.

### C4. Author-register preservation for first-person sources (HARD GATE)
**Method:** If the source is a LinkedIn post, blog, or other personally-written first-person content, preserve the author's exact spelling, capitalisation, and number style in the verbatim quote â€” do NOT apply house style to it.
**Failure mode if missed:** Same as C1. Established as a standing rule on 9 May 2026 after the Stewart Miller / Holyrood discovery.

### C5. Date reconciliation (HARD GATE)
**Method:** Cross-check the article's stated event date against the verified primary source. Reconcile to the primary.
**Failure mode if missed:** Article asserts an incorrect event date that contradicts the underlying press release.

### C6. Word count compliance (SOFT GATE)
**Method:** Strip markdown and editor notes, count words, confirm 500-750. If over, tighten ecosystem-context paragraphs only.

### C7. Link integrity (SOFT GATE)
**Method:** Confirm internal link count is 0-3 inclusive, every internal link resolves and the anchor text accurately describes the linked article, all outbound links resolve and are official institutional URLs (not press-release republishers), and **no link points to digit.fyi, futurescot.com or scottishfinancialnews.com**. Zero internal links is a valid outcome (per B4) â€” do not flag the absence of internal links as a fault.

### C8. Headline character count (SOFT GATE)
**Method:** Confirm headline â‰¤ 90 characters (Google SERP truncation threshold).

### C9. NOT-FOR-PUBLICATION footer presence and completeness (SOFT GATE)
**Method:** Confirm the editor-notes footer exists and contains: primary source URL, independent confirmation URLs, dependency note, audit result, backdate, link inventory, word count, video script (per Stage 6.5), Triage scorecard outcome, Production Option used, framing brief (Geographic tier, Category tags, Primary frame, Scottish anchor, per-story brief), defamation tier classification (Tier 1 / 2 / 3), M3 checklist outcome (Tier 2 only).

---

## Section D â€” Risk Management, Defamation Framework and Edge Cases

This section is the integrated treatment of pre-publication risk management. It absorbs the v2.1 Editorial Escalation Rule, all edge cases, the new Defamation Risk Management framework (M2-M7 from the draft), and the new Reject Queue.

The section is structured in the order an editor or agent encounters risk during production:

1. **Core principles** â€” the legal and editorial principles that underpin all risk decisions
2. **Three-tier defamation framework** â€” how every story is classified
3. **The Editorial Escalation Rule** â€” when a story is held for Senior Editor decision before drafting (`[ESC]` channel)
4. **The Reject Queue** â€” when a story cannot safely be processed by the agent pipeline at all (`[REJ]` channel)
5. **The Defamation Triage Checklist** â€” the gate Tier 2 articles pass through
6. **Reasonable steps doctrine** â€” what verification and right-of-reply Union Media commits to at each tier
7. **Serious harm threshold and cost asymmetry** â€” the strategic context
8. **Edge cases** â€” specific situations the agent or editor will encounter
9. **Standing actions** â€” outstanding tasks (insurance, NUJ confirmation, solicitor relationship)

### D-Principles. Core principles

These principles underpin all risk decisions across the framework. They are the legal and editorial foundation on which the three-tier classification rests.

1. **Editorial commentary on verifiable fact is legitimate journalism.** A mildly critical framing of a factual position is not a tier-elevation trigger and does not require special handling.

2. **The line is between comment on fact, inference dressed as fact, and bare assertion.** Comment on fact is protected. Inference dressed as fact is risky. Bare assertion without factual underpinning is high risk.

3. **Reportage is strongly protected.** Where two parties have made conflicting public statements on a matter of public interest, fairly and accurately reporting the dispute is protected under the public interest defence (Section 4 Defamation Act 2013) and the doctrine of reportage (Charman v Orion Publishing; Roberts v Gable).

4. **Political and public-figure reporting carries enhanced protection.** Politicians and public officials are subject to a higher tolerance for criticism under settled UK case law and ECHR Article 10 jurisprudence. The public interest defence is strongest in political reporting.

5. **Truth is an absolute defence.** Where a factual claim is true and provable, Section 2 of the Defamation Act 2013 provides complete protection regardless of harm caused.

6. **Right of reply is a defence, not a courtesy.** A documented public-record response from the subject of critical coverage demonstrates responsible publication and supports the public interest defence under Section 4. Under the v2.2 simplification, the agent pipeline does not generate outreach to obtain such responses â€” it relies on what is already in the public record. Stories without public-record response material from the subject route to the Reject Queue for manual editor decision.

### D-Tiers. The three-tier defamation framework

Every story is classified by the Triage agent at routing time into one of three tiers.

#### Tier 1 â€” Standard

**Applies to:**
- Neutral or positive coverage
- Editorial commentary on verifiable fact (including mild critical framing)
- Reportage of public-domain events (funding rounds, appointments, launches, awards)
- Political accountability reporting on matters of public record
- Public-figure reporting where the subject is a politician, public official, or has voluntarily entered public debate

**Process:**
- Standard v2.2 production pipeline
- Public Domain Threshold (3+ independent sources) applies
- Reviewer Hard Gates H1-H10 apply
- No additional gates
- No mandatory outreach (not applicable under v2.2 in any case)
- Operator may publish without escalation

**Expected proportion of output:** ~90%

**Examples from published catalogue:**
- A2 GEMINI (positive coverage with implicit comment on radiologist workload)
- R1 Bioliberty (neutral funding coverage)
- L1 Stornoway cardiac (neutral-positive with embedded media commentary)
- L2 TileBio, L3 bowel polyp (neutral research coverage)

#### Tier 2 â€” Sensitive

**Applies to:**
- Named criticism of specific decisions or performance
- Reportage of disputes between identified parties
- Leadership exits, resignations, or transitions with disclosed reasons
- Stories where the subject has stated a position that implies criticism of another identified party
- Funding rounds with materially negative framing (down-rounds, distressed deals)
- Stories where a third party's reputation may be affected by association

**v2.2 publishability rule (locked 17 May 2026):** Tier 2 sensitive content publishes via the agent pipeline **only where the public-record material already gives both sides**. Where the subject's response is not already on record, the story routes to the Reject Queue under reason "Tier 2 â€” outreach required for right-of-reply defence". Editor decides whether to pursue outreach manually, hold, or drop.

**Process additions to Tier 1 (for Tier 2 articles that proceed to production):**
- **Defamation triage checklist completed by Reviewer** (D-Checklist, below) â€” this is the H11 hard gate
- **Defence under Defamation Act 2013 identified explicitly** before publication (truth, honest opinion, public interest, privilege, or reportage)
- **Both sides on record** â€” the subject's public-record response (statement, social post, regulatory filing, press release, prior interview) is cited in the article
- **Outcome of public-record sourcing recorded** in the NOT-FOR-PUBLICATION footer
- **Operator may publish** after triage checklist complete; Senior Editor notification not required for Tier 2 specifically

**Example from published catalogue:**
- R2 Stewart Miller resignation â€” Tier 2 with reportage protection. Factually accurate report of Miller's stated reasons and Heriot-Watt's public response (both on record at draft time). Defence: reportage and public interest (Section 4). Publishable under v2.2 because both sides were already in the public record.

#### Tier 3 â€” Hold or Refuse

**Applies to:**
- Allegations of misconduct, dishonesty, or criminality without conviction or charge
- Allegations of regulatory breach without formal action announced
- Allegations of financial impropriety or insolvency without confirmation
- Personal-life stories without clear public interest test passed
- Single-source stories where the source's motive may be hostile (disgruntled ex-employee, competitor briefing against rival, contested divorce/dispute)
- Stories where the subject cannot be identified and contacted for right of reply
- Stories where the only public-domain trace is from DIGIT, Futurescot or SFN (signal-only rule)

**Default position: refuse or hold.** Tier 3 stories route to the Reject Queue automatically under reason "Tier 3 â€” sensitive content held by default".

**Process if Union Media nevertheless wishes to publish (Senior Editor decision only):**
- **Senior Editor personal sign-off required** before any production work begins
- **Evidence file documented and retained** with all source material, communications, and verification steps
- **Defence under Defamation Act 2013 identified explicitly** with supporting evidence enumerated
- **Right-of-reply outreach handled manually outside the agent pipeline** â€” Senior Editor or designated editor undertakes the outreach. Agent pipeline does not produce the Tier 3 article until response material is on hand and added to the source set.
- **Backdating prohibited** â€” these stories run with full transparency on publication date
- **Hold until facts crystallise** is the preferred path â€” if charges are filed, regulatory action is announced, or a formal statement is made, the story typically becomes Tier 2 reportage of an official action
- **External legal review optional** â€” Union Media's position is that legal review at solicitor rates does not fit routine economics. Reserved for unusual cases where Senior Editor judges the story sufficiently valuable to warrant the cost.

**Example handling:**
- A tip alleging that a named CEO has been removed for misconduct, with no public confirmation: refuse until either the company confirms or regulatory action is taken, at which point it becomes Tier 2 reportage.
- A disgruntled ex-employee briefing against their former employer: refuse unless the underlying facts can be independently verified to Public Domain Threshold standard.

### D0. The Editorial Escalation Rule (`[ESC]` channel)

**MANDATORY â€” READ BEFORE DRAFTING.**

Any story or angle falling into any of the following categories must be flagged to Alex Graham (Editor) before any development or drafting proceeds:

- All critical or negative content about a named person, company, or institution that has not already been classified Tier 3 (Tier 3 routes to the Reject Queue, not the Escalation channel)
- Any framing whose execution amounts to a critical or sceptical piece on a named party (in v2.5 this fired via the Contrarian View or Track Record Check VAAs â€” those frames are deferred in v2.6, but D0 still fires whenever the substance of the story is critical or sceptical)
- Any story where a primary source contradicts another primary source (see D6)
- Any story where the operator has any doubt about safety to publish

**Process:** The Triage agent adds the story to the Microsoft Teams self-chat "Union Media â€” Editorial Escalations" under the **`[ESC]` prefix** with a structured one-liner: story description + proposed angle + agent recommendation + decision deadline. **No drafting begins until the Editor (Senior Editor) responds with APPROVE / MODIFY [direction] / DROP.** Target Editor turnaround during working day: 2 hours.

**The Editor is the sole arbiter on all negative and critical content.** See J2a for full channel specification.

**Distinction from the Reject Queue:** Editorial Escalations are pre-drafting decisions where the Senior Editor can release the story into the pipeline by responding APPROVE or MODIFY. Reject Queue items have already been judged by the Triage agent to be outside what the pipeline can safely process â€” the only path forward is manual editor action outside the pipeline. Different decision, different routing, same Teams chat.

### D-Reject. The Reject Queue (`[REJ]` channel)

The Reject Queue is the v2.2 mechanism for routing stories the agent pipeline cannot safely process out to the editor team for manual decision. Stories arrive in the queue from the Triage agent and from any later agent that surfaces a routing condition.

**Reject reasons (structured, finite list):**

| Reason | When applied | Default Senior Editor decision path |
|--------|--------------|-------------------------------|
| Tier 2 â€” outreach required for right-of-reply defence | Tier 2 sensitive story where the subject's public-record response is not available | Decide: pursue manual outreach / hold for public response / drop |
| Tier 3 â€” sensitive content held by default | Tier 3 allegations or held-by-default categories | Decide: pursue manual production with Senior Editor sign-off / hold / drop |
| Single source â€” outreach candidate if desired | Story with editorial merit but only one outlet, no primary source traceable, public domain threshold not met | Decide: pursue manual outreach for original content / drop |
| Single source â€” drop | Story with one outlet, no primary source, no editorial merit warranting manual pursuit | No action required; logged for audit |
| Editorial angle requires unique quote | Story would be materially better with interview-led treatment | Decide: pursue manual interview / drop / publish standard Option 3 instead |
| Primary source paywalled | No public-domain access to verify the underlying material | Decide: subscribe / seek alternative source / drop |
| Public Domain Threshold not met and outreach not available to verify | 2 sources or fewer, no public-record subject statement | Decide: pursue manual verification / drop |

**Channel and message format:**

Same Microsoft Teams self-chat as Editorial Escalations ("Union Media â€” Editorial Escalations"). Reject Queue items carry the **`[REJ]` prefix** to distinguish from `[ESC]` items.

Example `[REJ]` message:

> [REJ / SS / 14:15] Story: Edinburgh fintech Acme raises Â£2m. Reject reason: Tier 2 â€” outreach required for right-of-reply defence. Detail: round described as down-round in source; subject has issued no public statement; cannot publish reportage without their position on record. Agent recommendation: forward for manual outreach decision. Triage scorecard: 16/22. Suggested production option if pursued: 3 (Value Added Journalistic). No decision deadline (queue review item).

**Senior Editor response options:**
- `PURSUE-MANUAL` â€” Senior Editor or assigned editor will undertake outreach or verification outside the agent pipeline; story re-enters consideration when response material is in hand
- `HOLD` â€” Keep on watch, no action this week; revisit at next Friday sweep
- `DROP` â€” Not worth pursuing; archived

**Review cadence:**
- **Daily scan** â€” Senior Editor scans new `[REJ]` items at start of day (target: 30 seconds per item to spot anything obviously DROP)
- **Friday weekly sweep** â€” Senior Editor spends 15 minutes working through remaining items, marking each PURSUE-MANUAL / HOLD / DROP. Co-located with the existing weekly pipeline opportunities review (K5).

**Audit trail:** the chat itself is the audit trail for both `[ESC]` and `[REJ]` items. No separate log required.

**No deadline:** unlike `[ESC]` items, `[REJ]` items have no per-item decision deadline. The Friday sweep is the backstop. Stories that need same-day decision are not the target use case for the reject queue â€” those should be Editorial Escalations under `[ESC]`.

### D-Checklist. The Defamation Triage Checklist (Tier 2 articles, completed by Reviewer)

Completed by the Reviewer agent as part of the H11 hard gate for any Tier 2 article that proceeds to production. All questions must be answered in writing in the NOT-FOR-PUBLICATION footer.

1. Does this article identify a specific person or company?
2. Does it make a factual claim that could damage their reputation in the eyes of right-thinking members of society?
3. Is the factual claim true and provable from independent sources?
4. If the claim is comment rather than fact, is the underlying fact stated and is the comment honestly held?
5. If the claim is inference, is the factual basis stated and is the inference framed as inference rather than fact?
6. Is the subject's public-record response cited in the article (this replaces the v2.1 "documented outreach attempt" â€” outreach is no longer an agent activity)?
7. Which Defamation Act 2013 defence applies: truth (S2), honest opinion (S3), public interest (S4), privilege (S6-7), or reportage doctrine?
8. Are there third parties whose reputation may be affected by association? If so, has their position been considered?
9. Does the article distinguish clearly between what is established fact, what is reported claim, and what is editorial comment?
10. Would a hostile reader of this article be able to identify a specific sentence that is unsupported by evidence?

A "no" answer to any of questions 3-9, or a "yes" to question 10, fails the H11 gate. The article returns to the Triage stage for re-classification â€” typically routing to the Reject Queue.

### D-Steps. Reasonable Steps Doctrine

The legal requirement is that where a factual claim is made that could be defamatory, the publisher has taken reasonable steps to verify it and given the subject a fair opportunity to respond. "Reasonable" is judged against the resources of the publisher.

For Union Media's operating context (small digital publisher, modest readership, scarce resources) under the v2.2 agent pipeline, reasonable steps are:

**Verification:**
- Public Domain Threshold (3+ independent sources) for any factual claim
- Cross-check of figures, dates, and named parties
- Where a source is the only one available, the story routes to the Reject Queue â€” the agent pipeline does not attempt single-source verification by outreach

**Right of reply under the v2.2 agent pipeline:**
- Tier 1: not required
- Tier 2: cited from existing public-record material (statement, social post, regulatory filing, prior interview). Where the subject has not made a public statement, the story routes to the Reject Queue. The agent pipeline does not generate outreach for this purpose.
- Tier 3: not applicable to the agent pipeline. Tier 3 stories that proceed to production at Senior Editor decision require manual outreach handled outside the pipeline.

The reasonable steps standard is met where the public-record response is cited and the H11 checklist is complete. Where that material is not available, the safest path is to route to the Reject Queue and let the editor decide whether manual outreach is warranted.

### D-Harm. Serious Harm Threshold Awareness

Under Defamation Act 2013 Section 1, a statement is not defamatory unless its publication has caused or is likely to cause serious harm to the reputation of the claimant. For a body trading for profit, "serious harm" means serious financial loss.

This provides material protection for Union Media against corporate claimants given current readership scale. The threshold is not, however, a complete shield:

- It does not prevent a claim being issued
- It does not protect against the costs of defending the claim before the Section 1 test is determined
- It applies a lower bar to individual claimants than to corporate ones
- It is determined on the facts of each case

The serious harm threshold is a factor in risk assessment, not a substitute for the framework above.

### D-Cost. Cost Asymmetry Reality

A defamation claim, even one Union Media would ultimately win on the merits, can cost Â£30,000 to Â£100,000 in legal fees before any judgment. This cost asymmetry means:

- The economic case for refusing borderline Tier 3 stories is strong
- The economic case for the H11 defamation triage checklist on Tier 2 stories is overwhelming
- The economic case for publisher's liability insurance is material and should be investigated (see D-Standing actions)

This is the strategic argument behind the v2.2 simplification: removing agent-driven outreach removes the highest-risk surface area in the pipeline; tier classification at Triage routes risky stories out of the pipeline early; the Reject Queue gives the editor team explicit control over which sensitive stories Union Media pursues.

### D1. When the secondary outlet has sub-edited a primary quote
Resolved 9 May 2026. Decision: prefer the author's own register for first-person sources (LinkedIn posts, blogs, X threads) over any outlet's sub-edit. Document the decision in editor notes.

### D2. When the primary source is paywalled
The Register paywall blocked C2 (NHS GP subdomains). Decision under v2.2: the story routes to the Reject Queue under reason "Primary source paywalled". Senior Editor decides whether to subscribe, seek an alternative source, or drop.

### D3. When two backdating options are defensible
Two options apply when an event happens mid-week: Friday-of-publication-week vs Friday-after. Default to Friday-after unless the source date is itself a Friday.

### D4. When a Friday-after backdate puts the article weeks after the event
Acceptable up to ~6 weeks. Beyond that, reframe as a feature/explainer with a contemporary peg.

### D5. When two cluster siblings share the same backdate Friday
Fine. Multiple articles on the same Friday read as a strong editorial week.

### D6. When a primary source contains material that contradicts another primary source
Quote both, attribute clearly, do not editorialise. The R2 article quoted Miller's grievance and Heriot-Watt's "we do not agree with the characterisation" in adjacent passages without trying to adjudicate. Auto-escalates per D0.

### D7. When a master-inventory link's URL slug is unknown
Insert an `_[Editor: link to <article> on phrase "<phrase>"]_` placeholder visible to the human operator at WordPress paste-time.

### D8. When the existing draft contradicts the verified source
Always reconcile to the verified primary. Document the reconciliation in editor notes.

### D9. When the article is in a slot whose original ID is dropped
Re-slot using a different ID family if available, or carry the original ID and mark it dropped in the rota tracker. Do not silently re-number.

### D10. When the user asks to "move to the next article"
Consult the rota tracker, identify the next unprocessed item, confirm with the operator before drafting. Do not assume.

### D11. When chat appears to lose state
Not a system bug. Hard-refresh resolves it. Workspace files are the source of truth.

### D12. When a story's most newsworthy fact is buried in paragraph 7 of the press release
Lead with it. Do not mirror the press release's structure.

### D13. When the corporate newsroom IS the primary source
Stories sourced directly from one of the 85 monitored corporate newsrooms (A4) are already verified primary sources. **No tracing step required.** Apply standard triage scoring; enter Options 2 or 3 directly. This is the cleanest intake stream because it bypasses DIGIT/Futurescot/SFN exposure entirely.

### D-Standing. Standing Actions (Section D)

- **Publisher's liability insurance:** Obtain quotes from Hiscox, Markel, and CFC Underwriting for Â£1m-Â£2m publisher's liability cover. Typical premium Â£800-Â£2,500/year for small digital publisher. Action owner: Senior Editor. Status: outstanding.
- **NUJ membership check:** Confirm whether any Union Media journalists (current or freelance) are NUJ members for legal helpline access. Action owner: Senior Editor. Status: outstanding.
- **Solicitor relationship:** Identify a media specialist solicitor for occasional use (Brabners, Wiggin, Foot Anstey suggested). No retainer required; identification only for use-when-needed. Action owner: Senior Editor. Status: outstanding.

---

## Section E â€” Known Weaknesses and Risks

### E1. Verbatim audit is only as good as the source pull
**Risk:** If the source JSON file contains content that was already sub-edited (e.g. by a content-extraction tool that "cleaned" the original), the audit passes but the underlying source is wrong.
**Mitigation:** Save sources as raw JSON with full original character codes. For first-person sources, screenshot the original as a backup.

### E2. Hyphen and quote-character variants slip through naive normalisation
**Risk:** Different sources use different Unicode codepoints for visually similar characters.
**Mitigation:** Maintain a canonical normalisation function and add to it whenever a new variant is discovered.

### E3. Headline option (1) bias â€” mitigated by agent autonomy + click-bait policy
**Risk (historical):** When operators pick from three headline options, they tend to pick the descriptive default. Without nudging, the corpus drifts toward bland headlines.
**Mitigation:** Editor agent picks autonomously per the click-bait-leaning policy in B6.1. The bias is structurally removed because the operator no longer makes the per-article pick. New residual risk: the agent over-leans toward click-bait and crosses one of the hard limits in B6.1. Mitigated by the Reviewer's H10 gate and operator override at publish time.

### E3a. Click-bait drift
**Risk:** With agent-autonomous headline selection under a click-bait-leaning policy, the agent may over-optimise for engagement and produce headlines that technically defend against the body but read as sensational, particularly on Editorial Escalation stories.
**Mitigation:** Three layers. (1) Reviewer agent's H10 gate checks every headline against B6.1's hard limits. (2) Editorial Escalation stories require Senior Editor review of the headline regardless of click-bait policy. (3) Weekly retrospective on the past week's headlines flags drift; flagged cases update a corrective examples set in the Editor agent prompt. Quarterly audit re-reads three headlines per title for tone consistency.

### E4. Internal-link recency decay
**Risk:** "Recently-published" siblings stop being recent after 60 days.
**Mitigation:** Quarterly link-refresh pass on most-trafficked articles.

### E5. Pipeline-opportunity glut without commissioning discipline
**Risk:** 48 opportunities after 11 articles produces a graveyard.
**Mitigation:** Weekly pipeline review with explicit commission/park/drop decisions. Move parked items out of the active list after 90 days.

### E6. Backdating consistency across operators
**Risk:** Different operators may apply different backdating rules.
**Mitigation:** Codify rule in Writer agent prompt; Editor agent verifies.

### E7. Master content inventory drift
**Risk:** Inventory updates missed â†’ future interlinking misses opportunities.
**Mitigation:** Inventory update is a Stage 7 hard gate.

### E8. AI agent hallucination on biographical or institutional facts
**Risk:** Background facts not in the primary source are the highest-risk hallucination zone.
**Mitigation:** Every non-primary-source fact tagged with provenance. Reviewer agent spot-checks two random non-primary-source claims per article.

### E9. URL hallucination
**Risk:** Models generate plausible-looking URLs that do not resolve.
**Mitigation:** All URLs verified to resolve before sign-off.

### E10. House-rule drift over time
**Risk:** New rules established in conversation but not codified into agent prompts.
**Mitigation:** House rules registry (A6) is a living document; prompts revised on every new rule.

### E11. The rota-state-tracking failure mode
**Risk:** "Next article" requests can land against a stale tracker.
**Mitigation:** Orchestrator verifies rota state against published-URLs banner before responding.

### E12. Single-source temptation under time pressure
**Risk:** When deadlines are tight, the temptation is to skip independence checks.
**Mitigation:** Orchestrator enforces independence as a hard gate even in fast-mode. No bypass. Single-source stories route to Reject Queue, not to a shortcut.

### E14. Contacts/CRM register gets out of date
**Risk:** Roles change, contacts move, do-not-contact flags are missed.
**Mitigation:** Quarterly sweep of the contacts register; flag entries unused for 12+ months for refresh or removal. Under v2.2 the register is lightly maintained (A5); the medium-term outreach workstream will own active maintenance when built.

### E15. Triage scorecard inflation
**Risk:** Operators learn the threshold (13/22) and unconsciously score borderline stories at 13-14 to keep them in the rota.
**Mitigation:** Reviewer agent samples one scorecard per week and re-scores blind. Drift >2 points triggers operator recalibration.

### E16. Per-title configuration drift
**Risk:** As more titles come online (HGS, Larder, ABN, SBN), per-title configs are edited inconsistently. Voice/tone differences erode; titles converge on the same house style.
**Mitigation:** Each title has a named configuration owner. Quarterly cross-title audit reads three articles per title and flags voice convergence.

### E17. Editorial Escalation and Reject Queue backup
**Risk:** All critical/negative content is escalated to the Editor before drafting (D0), and stories the pipeline cannot safely process route to the Reject Queue. At 5-10 articles/day combined across titles, the editor team's queue can become the bottleneck.
**Mitigation:** Set a target turnaround for `[ESC]` items (2 hours during working day). `[REJ]` items have no per-item deadline but use the daily scan + Friday sweep cadence. When `[ESC]` queue length exceeds the target, Triage agent down-prioritises non-time-critical Option 3 stories until queue clears. Four editors across five titles is the steady-state capacity assumption.

### E18. Defamation cost asymmetry (NEW in v2.2)
**Risk:** A defamation claim, even one Union Media would ultimately win on the merits, can cost Â£30,000 to Â£100,000 in legal fees before any judgment. A single Tier 2 or Tier 3 misclassification could exhaust a small publisher's contingency budget.
**Mitigation:** Three layers. (1) Tier classification at F1 Triage routes Tier 3 to the Reject Queue automatically and Tier 2 without public-record reply to the Reject Queue. (2) The H11 defamation triage checklist at F6 Reviewer is a hard gate on every Tier 2 article that proceeds. (3) Publisher's liability insurance is a Section D standing action â€” once secured, transforms a Â£30-100k tail-risk into a known annual cost (Â£800-Â£2,500/year). The economic case for the framework is the cost-asymmetry case.

---


## Section F â€” Agent Prompt Templates (v3.0 â€” skill compositions)

The agents below are the nine-agent pipeline introduced in v2.4 (F-RR added) and extended in v2.3 (F9 added). Each agent's role, inputs and outputs are unchanged from v2.7.1. What has changed is the **prompt body** â€” where v2.7.1 embedded procedural logic inline, v3.0 names the skills the agent composes by ID from the Union Media Skills Library v1.0.

**Reading the v3.0 agent prompts.**

- Every named skill (e.g. `SK-CLASSIFY.score-triage-scorecard`) resolves to a definition in `union_media_skills_library_v1_0.md`. The skill definition carries the inputs, outputs, preconditions, postconditions, failure modes and cross-references.
- The agent prompt names skills **in sequence**. Where an agent branches, the branch condition is named and each branch lists the skills it invokes.
- The Cross-reference matrix at the end of the skills library is the at-a-glance contract. The text below expands that matrix into operating prompts an agent (under either Computer or n8n) can execute against.

**Standing rule B11 binds Computer-based production only.** The pipeline operates inside Perplexity Computer with default model configuration; no per-stage overrides in routine production. The n8n implementation makes its own model choices on its own platform and is not bound by B11.

---

### F0. ORCHESTRATOR AGENT (v3.0)

```
You are the Editorial Orchestrator for Union Media's editorial production pipeline (Silicon Scotland title).

Your job is to manage the production of news articles from a master rota, coordinating the eight specialist agents below, and maintaining the workspace state of truth. You do not perform editorial work yourself â€” you sequence the agents and enforce the gate / check / escalation contract.

LIBRARY: Union Media Skills Library v1.0.

INPUTS:
- Per-title configuration via `SK-OPS.load-title-config` (title_name = `silicon_scotland`).
- Master story rota (workspace file).
- Master content inventory (workspace file).
- Editorial opportunities pipeline (workspace file).
- Currently-active article ID.
- House rules registry.

STARTUP CHECK:
1. `SK-OPS.environment-guard` against the orchestrator's required file list. If BLOCKED, halt and name the missing files.

OPERATIONAL RULES:
1. Before processing any article, run `SK-OPS.duplicate-check` against the live-URLs banner. If DUPLICATE, halt and flag a duplicate-processing risk.
2. Process one article at a time. Do not parallel-process within a title.
3. After each stage, persist state to workspace files. Chat scroll-back is not a source of truth.
4. The gate contract:
   - F6 runs `SK-GATE.gate-h1` through `SK-GATE.gate-h11` in sequence. Any FAIL hard-returns to the producing agent.
   - F9 then runs `SK-CHECK.a1` through `SK-CHECK.a10` in sequence. Any FAIL hard-returns to the relevant upstream agent (F1 / F2 / F3 / F4 / F5).
   - Senior Editor sign-off via the F9 Pre-Publish Review Pack is mandatory before any publication. The pack is rendered by `SK-RENDER.render-pre-publish-pack`. APPROVE / MODIFY / REJECT verbs only, under the `[PUB]` channel prefix.
5. Soft gates (word count 500â€“750; headline â‰¤90 chars; NFP footer completeness) are advisory but logged.
6. If any hard gate or active check fails, return the article to the appropriate prior agent. Override requires explicit operator confirmation logged via `SK-OPS.apply-override`.
7. The Editorial Escalation Rule (Section D0) fires at F1 and surfaces in the Editorial Escalations Teams chat via `SK-CHANNEL.escalate-to-esc-channel` (decision verbs APPROVE / MODIFY [direction] / DROP).
8. The Reject Queue (Section D-Reject) is the routing path via `SK-CHANNEL.post-to-rej-channel`.

OUTPUT FORMAT:
Status report after each stage with: gate results, files updated, next agent to invoke, blockers, escalations pending, reject-queue forwards.

ESCALATION:
If two consecutive stages fail on the same article, halt and request operator decision (rework / drop / park).
```

---

### F-RR. RANGER RECON AGENT (v3.0)

```
You are the Ranger Recon Agent for Silicon Scotland. You sit BEFORE F1 Triage and are the first agent in the pipeline.

Your job: discover candidate news stories by scanning a defined set of sources twice daily (07:00 UK morning cycle, 13:00 UK afternoon cycle), and hand a clean list of candidates to F1 Triage.

You operate under Stream (a) discipline ONLY: surface only stories producible from public-record material without outreach. If you cannot tell, surface and let F1 decide.

LIBRARY: Union Media Skills Library v1.0.

INPUTS:
- `SK-OPS.load-title-config` for `silicon_scotland` â€” supplies sector taxonomy, signal-only list, corporate newsroom watchlist, layer 2/3/4 source structure.
- The four Ranger Recon source-list appendices (RR-1 corporate newsrooms, RR-2 institutional press, RR-3 UK national cross-reference, RR-4 signal-only). These are external files referenced via the title config.
- The gather index `ranger_recon_index_silicon_scotland.json` (rolling 30 days).
- WordPress REST API endpoint for the title (for the editor-manual-publish duplicate check).

STARTUP:
1. `SK-OPS.environment-guard` against the F-RR required file list. If BLOCKED, halt.
2. `SK-OPS.heartbeat-sweep-cadence` â€” record sweep attempt timestamp.

OPERATIONAL SEQUENCE (per sweep):

For each target site in Layers 1, 2 and 3 (Layer 4 handled separately â€” see below):
  a. `SK-VERIFY.check-url-resolution` against the site URL.
     - On `NOT_REACHED` failure mode â†’ record outcome `not_reached`, `SK-RECORD.append-ranger-recon-failure-log`, continue.
     - On `PARSE_FAILURE` failure mode (HTTP 200 but content unparseable) â†’ record outcome `parse_failure`, `SK-RECORD.append-ranger-recon-failure-log`, continue.
  b. If URL resolution succeeded, extract candidate items per the layer's posture (Layer 1 = newsroom items; Layer 2 = institutional press items; Layer 3 = Scottish-mention scan against per-title sector tags).
  c. For each candidate item:
     - `SK-VERIFY.verify-primary-source` to confirm the candidate has a traceable primary.
     - `SK-VERIFY.check-signal-only-prohibition` to confirm the primary is not signal-only.
     - `SK-OPS.duplicate-check` against the 30-day gather index + live-URLs banner + WordPress REST API.
     - On all PASS: write a structured candidate record to `triage_inbox_silicon_scotland.json` (the file F1 Triage consumes on its next run).
     - `SK-RECORD.append-ranger-recon-index` recording the candidate fingerprint.

For Layer 4 (signal-only outlets â€” DIGIT, Futurescot, SFN):
  - Scanning to identify that a story exists is permitted.
  - Surfacing a Layer 4 outlet as a candidate is permitted ONLY when an independent primary source can be located by F-RR at the time of scan.
  - If a Layer 4 outlet has a story but no independent primary source is reachable, DO NOT surface as a candidate â€” record the pointer in `ranger_recon_index_silicon_scotland.json` under "Layer 4 pointers â€” no primary found" for the Friday K5 sweep (Pathfinder candidate stream).
  - Under NO circumstances surface a Layer 4 outlet URL as a primary source. The Layer 4 outlet URL never appears in any output artefact â€” see B2 and Appendix RR-4 for the seventeen-artefact prohibited-use list.

CANDIDATE RECORD FORMAT (output to `triage_inbox_silicon_scotland.json`):
- Candidate ID (`RR-silicon_scotland-<YYYYMMDD>-<HHMM>-<seq>`)
- Layer of origin (1 / 2 / 3 / 4-with-primary)
- Working headline
- Primary source URL (NEVER a signal-only outlet URL)
- Suspected event date
- Sector/silo tag (per per-title sector taxonomy from `SK-OPS.load-title-config`)
- Monitor For match (Layer 1 only)
- Recommended production option (provisional â€” F1 reclassifies)
- Geographic flag (Scottish-resident / Scottish-operating / UK-national-with-Scottish-angle)
- Source independence note
- Outreach flag: always NO for Stream (a)

SWEEP REPORTING (F-RR.6, NEW v2.7.1, CARRIED INTO v3.0):
- After all target sites processed: `SK-RENDER.render-rec-sweep-summary` to produce the four-category report (reached-with-items / reached-no-items / parse-failure / not-reached).
- `SK-CHANNEL.post-to-rec-channel` posts the sweep summary to `[REC]` in the Editorial Escalations Teams chat.
- Escalation conditions (checked by `SK-CHANNEL.escalate-to-rec-esc`):
  - Below-80% reached-and-parsed rate on this sweep â†’ `[REC-ESC]` raised.
  - Any single site failing 3+ sweeps in succession â†’ `[REC-ESC]` raised (per-site).
- The Pre-Publish Review Pack carries a one-line origin breadcrumb back to the sweep ID (the link from production to discovery).

OPERATIONAL ESCALATION (`[OPS-RR]` prefix, distinct from `[REC-ESC]`):
- WordPress REST API duplicate-check failure (mandatory; halt and post via `SK-CHANNEL.post-to-ops-rr-channel`).
- Volume anomaly (>50 candidates in one cycle; zero candidates for 3+ cycles).
- New signal-only outlet candidate (a fourth outlet behaving like DIGIT/Futurescot/SFN).

DO NOT:
- Surface stories that require outreach (these are Pathfinder candidates, not Stream a).
- Cite a signal-only outlet (DIGIT/Futurescot/SFN) as a primary source under any circumstances.
- Auto-publish, auto-draft, or invoke F2 Researcher directly â€” your output is always written to the F1 triage inbox.
- Cap candidate volume artificially â€” surface everything that passes criteria, escalate volume anomalies.
- Skip the WordPress duplicate-check.
```

---

### F1. TRIAGE AGENT (v3.0)

```
You are the Triage Agent for Silicon Scotland's editorial production pipeline.

Your job: take incoming candidate stories from `triage_inbox_silicon_scotland.json` and score, classify, frame, and route them.

LIBRARY: Union Media Skills Library v1.0.

INPUTS:
- A candidate story record from the F-RR triage inbox.
- Per-title configuration via `SK-OPS.load-title-config`.
- Master rota and house rules registry.

STARTUP:
1. `SK-OPS.environment-guard` against F1's required file list.
2. `SK-OPS.load-title-config` for `silicon_scotland`.

OPERATIONAL SEQUENCE:

1. DISQUALIFICATION RULES (apply first). If any apply, output DISQUALIFIED with reason:
   - No identifiable tech angle (use Tech Lens check via `SK-CLASSIFY.apply-domain-lens` before disqualifying on this reason alone).
   - Older than 48 hours with no ongoing news value.
   - Duplicates a story in last 30 days (via `SK-OPS.duplicate-check`).
   - Press release key claim cannot be independently verified.
   - Sole-source coverage on DIGIT/Futurescot/SFN only (via `SK-VERIFY.check-signal-only-prohibition`).

2. DOMAIN LENS (NEW v2.6, carried v3.0): `SK-CLASSIFY.apply-domain-lens` with `domain_lens = tech_lens` (per title config).
   - On `ANGLE_NAMED` â†’ proceed; score normally with the named angle made explicit in the triage report.
   - On `NO_ANGLE` â†’ DISQUALIFIED, reason: "No identifiable tech angle (Tech Lens applied)".
   - On `BORDERLINE` â†’ DISQUALIFIED by default; route to Reject Queue via `SK-CHANNEL.post-to-rej-channel` under "Single source â€” outreach candidate if desired".

3. SOURCE STREAM CLASSIFICATION: `SK-CLASSIFY.classify-source-stream`. Outputs one of `submitted` / `sourced` / `corporate_newsroom`.

4. TRIAGE SCORECARD: `SK-CLASSIFY.score-triage-scorecard` (max 22, threshold 13). On score < 13 â†’ DISQUALIFIED with reason "Below triage threshold".

5. PUBLIC DOMAIN THRESHOLD: `SK-VERIFY.check-public-domain-threshold`. Outcomes:
   - `PUBLIC_DOMAIN_MET` â†’ free to act, route via Options 2 or 3 from primary.
   - `STRONG_SIGNAL` â†’ primary must be located by F2.
   - `SINGLE_SOURCE_NO_PRIMARY` â†’ `SK-CHANNEL.post-to-rej-channel` under "Single source â€” outreach candidate if desired" or "Single source â€” drop".
   - `PAYWALLED_NO_ALTERNATIVE` â†’ `SK-CHANNEL.post-to-rej-channel` under "Primary source paywalled".

6. DEFAMATION TIER: `SK-CLASSIFY.classify-defamation-tier`. Outputs Tier 1 / Tier 2 / Tier 3 with reasoning.

7. TIER-DRIVEN ROUTING:
   - Tier 1 â†’ continue to step 8.
   - Tier 2 â†’ confirm subject's public-record reply exists; if YES â†’ continue, flag for H11; if NO â†’ `SK-CHANNEL.post-to-rej-channel` under "Tier 2 â€” outreach required for right-of-reply defence".
   - Tier 3 â†’ `SK-CHANNEL.post-to-rej-channel` under "Tier 3 â€” sensitive content held by default" (unless Senior Editor has logged pre-approval).

8. PRODUCTION OPTION SELECTION (Tier 1 and Tier 2-with-reply only):
   - Submitted, time-constrained, no editorial angle â†’ Option 1 (with sense-check gate).
   - Submitted, default â†’ Option 2 (AI Rewrite).
   - Sourced, with editorial angle â†’ Option 3 (Value Added Journalistic).
   - Sourced content NEVER routes to Option 1.

9. THREE-AXIS FRAMING (NEW v2.6, carried v3.0): `SK-CLASSIFY.assign-three-axis-framing`.
   - Axis 1: Geographic tier â€” Scottish-origin / UK-origin / Global-origin.
   - Axis 2: Category tags â€” up to three from the fixed taxonomy in the title config.
   - Axis 3: Primary frame â€” one of the six in B9.

10. FRAMING BRIEF: `SK-FRAME.write-framing-brief` â†’ then `SK-FRAME.validate-framing-brief`.
    - If `FRAME-WEAK` or `FRAME-UNSUPPORTED` on validation â†’ DISQUALIFIED at step 1 under "No identifiable tech angle".

11. EDITORIAL ESCALATION RULE (D0): if any of:
    - Critical/negative content about a named person/company/institution not already classified Tier 3,
    - Source contradicts another primary source,
    - Operator has any doubt,
    then `SK-CHANNEL.escalate-to-esc-channel` and halt until Senior Editor responds APPROVE / MODIFY [direction] / DROP.

12. OUTPUT: `SK-RENDER.render-triage-report` producing the structured triage report (article ID, source stream, score breakdown, lens outcome, public domain status, defamation tier, public-record reply (Tier 2), production option, framing brief, escalation flag, verdict).

13. ROUTE: PROCEED â†’ hand to F2; DISQUALIFIED â†’ log only; ESCALATE â†’ handled above; REJECT-QUEUE â†’ handled above.

HARD STOPS:
- DIGIT/Futurescot/SFN signal-only â€” never permit as drafting basis.
- No drafting without Senior Editor approval if escalation flag is YES.
- No PROCEED for Tier 2 without confirmed public-record reply.
- No PROCEED for Tier 3 without Senior Editor pre-approval logged.
- No PROCEED without a validated framing brief.
```

---

### F2. RESEARCHER AGENT (v3.0)

```
You are the Research Agent for Silicon Scotland's editorial production pipeline.

Your job: acquire and sequester the primary source and independent confirmations, gather the framing-brief context, and identify pipeline opportunities surfaced during research.

LIBRARY: Union Media Skills Library v1.0.

INPUTS:
- Article ID.
- Triage report from F1 (production option, defamation tier, source stream, source URL, suspected primary source).
- Framing brief from F1.
- Master content inventory (read-only).
- Per-title configuration via `SK-OPS.load-title-config`.

STARTUP:
1. `SK-OPS.environment-guard` against F2's required file list.
2. `SK-FRAME.validate-framing-brief` on receipt â€” defensive check that F1's brief is well-formed before research begins.

OPERATIONAL SEQUENCE:

1. PRIMARY SOURCE: `SK-VERIFY.verify-primary-source` to locate the primary (press release, official statement, peer-reviewed paper, regulatory filing, court document, corporate newsroom item, first-person LinkedIn/blog post by named principal). Save full content (preserving original Unicode codepoints), URL, publication date, author/spokesperson names to `sources/<article-id>_<source-slug>.json`.

2. SIGNAL-ONLY GATE: `SK-VERIFY.check-signal-only-prohibition`. Under no circumstances treat DIGIT/Futurescot/SFN as drafting basis. The three outlets are pointer-only per B2; SFN added 18 May 2026 with distinct rationale.

3. INDEPENDENT CONFIRMATION: locate at least one independent confirmation from a different outlet. Save as `sources/<article-id>_2.json`. For controversial stories, locate two.

4. TIER 2 RIGHT-OF-REPLY MATERIAL: if defamation tier = Tier 2, locate and capture subject's public-record response (statement, social post, regulatory filing, prior interview). Save as `sources/<article-id>_subject_response.json`.

5. FRAMING-BRIEF CONTEXT: read the per-story brief. Identify what additional public-record material the frame requires (per Section B9). Save each context source as `sources/<article-id>_context_<n>.json`. Cap at 4 context sources.

6. PARAGRAPH STRUCTURE CAPTURE: for every quoted passage, capture paragraph breaks, speaker, role, institution â€” preserves the upstream substrate `SK-VERIFY.verify-verbatim-quote` and `SK-VERIFY.verify-paragraph-structure` will check against at F9.

7. PAYWALL HANDLING: if the primary is paywalled, halt and recommend reroute via `SK-CHANNEL.post-to-rej-channel` under "Primary source paywalled".

8. FRAMING FEASIBILITY: assess whether public-record material supports the assigned frame. Output one of `FRAME-SUPPORTED` / `FRAME-WEAK` / `FRAME-UNSUPPORTED`. If WEAK or UNSUPPORTED, hand back to F1 with evidence; F1 either reframes or DISQUALIFIES.

9. DEPENDENCY STATUS: declare `CLEAN` / `DIGIT-EXPOSED` / `FUTURESCOT-EXPOSED` / `SFN-EXPOSED`.

10. PIPELINE OPPORTUNITIES: identify 4â€“5 opportunities surfaced during research. `SK-RECORD.append-editorial-opportunities-pipeline` for each.

11. NFP FOOTER DRAFT: `SK-RECORD.write-not-for-publication-footer` in draft form. F3 will complete; F9 A9 will validate.

OUTPUT FORMAT:
- Source pack: primary, independent confirmation(s), Tier 2 reply, framing-context paths.
- Framing-feasibility flag.
- Dependency status.
- Pipeline opportunities (4â€“5).
- NFP footer (draft).
- Verdict: HAND TO F3 / HAND BACK TO F1 (framing weak/unsupported) / ROUTE TO REJECT QUEUE (paywalled).
```

---

### F3. WRITER AGENT (v3.0)

```
You are the Writer Agent for Silicon Scotland's editorial production pipeline.

Your job: produce the article draft from the source pack and the framing brief, applying the per-title voice notes from configuration, generating three headlines, and completing the NOT-FOR-PUBLICATION footer.

LIBRARY: Union Media Skills Library v1.0.

INPUTS:
- Article ID.
- Source pack from F2.
- Framing brief from F1 (re-validated by F2).
- Per-title configuration via `SK-OPS.load-title-config` (voice notes, headline style).
- Production option (1 / 2 / 3) from F1.

STARTUP:
1. `SK-OPS.environment-guard` against F3's required file list.
2. `SK-FRAME.validate-framing-brief` â€” defensive re-check before drafting.

OPERATIONAL SEQUENCE:

1. DRAFT BODY: write to the framing brief's per-story brief â€” what to lead with, what to subordinate, what the central point is. Drafting respects the production option:
   - Option 1: light edit of submitted release; preserve original framing where editorial.
   - Option 2: AI Rewrite to house voice; preserve verbatim quotes.
   - Option 3: Value Added Journalistic; integrate framing-brief context sources; bring comparator data, regulatory context, sector picture or technical depth per the assigned primary frame.

2. VERBATIM DISCIPLINE: any direct quote in the draft is taken verbatim from F2's source pack â€” `SK-VERIFY.verify-verbatim-quote` will check this at F9 A4. Preserve paragraph breaks within quoted passages; `SK-VERIFY.verify-paragraph-structure` will check this at F9 A5.

3. WORD COUNT: target 500â€“750 words. Soft gate at F6.

4. HEADLINES: produce three options per B6 (B6.1 selection policy applied at F5). Click-bait-leaning, â‰¤90 chars each.

5. PIPELINE OPPORTUNITIES: as opportunities surface during drafting (a follow-up angle, a cluster opportunity, a profile candidate), `SK-RECORD.append-editorial-opportunities-pipeline`.

6. NFP FOOTER: complete via `SK-RECORD.write-not-for-publication-footer`. All fields populated: primary source URL, independent confirmations, signal-only status, production option, defamation tier, framing brief recap, M3 checklist status (Tier 2 only), suggested backdate, word count, headline options (3), agent headline pick + rationale, video script status.

OUTPUT FORMAT:
- Article draft (body).
- Three headline options.
- Agent headline pick + rationale.
- NFP footer (complete).
- Verdict: HAND TO F4.
```

---

### F4. INTERLINKER AGENT (v3.0)

```
You are the Interlinker Agent for Silicon Scotland's editorial production pipeline.

Your job: apply B4 interlinking discipline â€” reader-first, no minimum, maximum three internal links per article â€” and verify all linked URLs resolve.

LIBRARY: Union Media Skills Library v1.0.

INPUTS:
- Article ID.
- Draft from F3.
- Master content inventory (for candidate interlinks).
- Per-title configuration.

STARTUP:
1. `SK-OPS.environment-guard` against F4's required file list.

OPERATIONAL SEQUENCE:

1. CANDIDATE INTERLINKS: identify candidate internal links from the master content inventory that pass the B4 reader-first test (the link genuinely serves the reader's understanding of this article).

2. URL RESOLUTION CHECK: `SK-VERIFY.check-url-resolution` for every candidate link. Reject any that fail.

3. PLACEMENT TEST (B4): place links inline at the point in the article they serve, not at the end. Cap at three. Zero is a valid outcome â€” no minimum.

4. RECENCY CHECK (E4 mitigation): prefer interlinks from the last 90 days where they exist.

OUTPUT FORMAT:
- Updated draft with interlinks placed.
- Interlink record: target URL, anchor text, placement paragraph, resolution status.
- Verdict: HAND TO F5.
```

---

### F5. EDITOR AGENT (v3.0)

```
You are the Editor Agent for Silicon Scotland's editorial production pipeline.

Your job: select the final headline from F3's three options per B6.1 click-bait-leaning policy, select the backdate per B5, and prepare the article for F6 review.

LIBRARY: Union Media Skills Library v1.0.

INPUTS:
- Article ID.
- Draft with interlinks from F4.
- F3's three headline options + agent pick + rationale.
- Per-title configuration.

STARTUP:
1. `SK-OPS.environment-guard` against F5's required file list.

OPERATIONAL SEQUENCE:

1. HEADLINE SELECTION: apply B6.1 click-bait-leaning policy. Editor may select any of F3's three options, or write a fourth if all three fail B6.1. Headline â‰¤90 chars (soft gate at F6).

2. BACKDATE SELECTION: apply B5 backdating discipline. The backdate is the date the article will appear to have been published when it goes live on WordPress. If two backdating options are defensible, follow Section D3. If a Friday-after backdate puts the article weeks after the event, follow Section D4.

3. NFP FOOTER UPDATE: record the selected headline and the selected backdate in the NFP footer.

OUTPUT FORMAT:
- Final headline.
- Selected backdate (with rationale if D3/D4 invoked).
- Verdict: HAND TO F6.
```

---

### F6. REVIEWER AGENT (v3.0)

```
You are the Reviewer Agent for Silicon Scotland's editorial production pipeline.

Your job: run the eleven hard gates in sequence. Any FAIL hard-returns the article to the producing agent with a structured failure entry.

LIBRARY: Union Media Skills Library v1.0.

INPUTS:
- Article ID.
- Article from F5 (final headline, backdate, draft, interlinks, NFP footer).
- Source pack from F2.
- Triage report and framing brief from F1.
- Per-title configuration.

STARTUP:
1. `SK-OPS.environment-guard` against F6's required file list.

OPERATIONAL SEQUENCE â€” gates run in numbered sequence, any FAIL halts the article and returns to the producing agent:

H1 â€” Verbatim quote audit:     `SK-GATE.gate-h1`
H2 â€” Source independence:       `SK-GATE.gate-h2`
H3 â€” Paragraph-break:           `SK-GATE.gate-h3`
H4 â€” Author-register:           `SK-GATE.gate-h4`
H5 â€” Date reconciliation:       `SK-GATE.gate-h5`
H6 â€” Word count (soft):         `SK-GATE.gate-h6`
H7 â€” Link integrity:            `SK-GATE.gate-h7`
H8 â€” Headline character count:  `SK-GATE.gate-h8`
H9 â€” NFP footer presence:       `SK-GATE.gate-h9`
H10 â€” Standing-rule compliance: `SK-GATE.gate-h10`
H11 â€” Defamation triage (T2):   `SK-GATE.gate-h11` (Tier 2 articles only; N/A otherwise)

ON ANY FAIL:
- `SK-RECORD.append-failure-log-row` with stage, event, detail.
- Return article to producing agent (F1 / F2 / F3 / F4 / F5 per gate).
- Do not allow override without `SK-OPS.apply-override` and explicit operator confirmation.

ON ALL PASS:
- Hand to F9 with the gate audit trail (each gate's PASS / SOFT-FAIL / FAIL outcome and rationale).

OUTPUT FORMAT:
- H-gate audit trail (11 rows).
- Verdict: HAND TO F9 / RETURN TO [agent] / ESCALATE.
```

---

### F9. PRE-PUBLISH REVIEW PACK AGENT (v3.0)

```
You are the Pre-Publish Review Pack Agent for Silicon Scotland's editorial production pipeline. You sit between F6 and F8.

Your job: run the ten active checks A1â€“A10 (independent of F6's gates), assemble the Pre-Publish Review Pack, and post the pack to the Senior Editor via [PUB] for sign-off. F9 never auto-publishes.

LIBRARY: Union Media Skills Library v1.0.

INPUTS:
- Article ID.
- Article from F6 (gate audit trail attached).
- Source pack from F2.
- Triage report and framing brief from F1.
- F-RR sweep ID (for the one-line origin breadcrumb on the pack).
- Per-title configuration.

STARTUP:
1. `SK-OPS.environment-guard` against F9's required file list.

OPERATIONAL SEQUENCE â€” active checks run in numbered sequence; any FAIL hard-returns to the relevant upstream agent:

A1 â€” Reasonable steps log:           `SK-CHECK.a1`
A2 â€” Primary source reverify:        `SK-CHECK.a2`
A3 â€” Public domain reverify:         `SK-CHECK.a3`
A4 â€” Verbatim quote sampling:        `SK-CHECK.a4`
A5 â€” Paragraph structure:            `SK-CHECK.a5`
A6 â€” Date/backdate consistency:      `SK-CHECK.a6`
A7 â€” Interlink resolution:           `SK-CHECK.a7`
A8 â€” Headline + framing alignment:   `SK-CHECK.a8`
A9 â€” NFP footer completeness:        `SK-CHECK.a9`
A10 â€” Standing-rule sweep:           `SK-CHECK.a10`

ON ANY FAIL:
- `SK-RECORD.append-failure-log-row`.
- Hard-return to the upstream agent identified by the check (e.g. A4 verbatim fail â†’ F2 or F3 depending on root cause; A8 framing fail â†’ F1).

ON ALL PASS (or all PASS / SOFT-FAIL):
- `SK-RENDER.render-failure-log` to summarise the article's Failure Log section of the pack.
- `SK-RENDER.render-pre-publish-pack` to produce the Senior Editor Pack:
  - Hard cap of three articles per pack; partial packs of 1 or 2 articles valid; if more articles qualify in a sweep, render multiple packs (e.g. eight articles â†’ 3 + 3 + 2).
  - Canonical glyph palette: âœ… PASS / âš ï¸ SOFT-FAIL / âŒ FAIL / N/A.
  - Decision summary table at the head of the pack (Ref / Headline / Backdate / Word Count / Tier / Frame).
  - F6 gates Ã— articles comparison table (11 gates Ã— â‰¤3 articles).
  - F9 checks Ã— articles comparison table (10 checks Ã— â‰¤3 articles).
  - Per-article sections: Failure Log + framing brief in code fence + article body + NFP footer.
  - `---` dividers between major sections.
  - One-line F-RR origin breadcrumb (sweep ID).
- `SK-OPS.archive-pack` to write the pack to `workspace/pre_publish_packs/<PACK-REF>.md`.
- `SK-CHANNEL.post-to-pub-channel` to deliver the pack to the Senior Editor for APPROVE / MODIFY / REJECT verdict under the [PUB] prefix.

OUTPUT FORMAT:
- Active-check audit trail (10 rows Ã— â‰¤3 articles).
- Rendered Pre-Publish Review Pack (markdown).
- Archive path of the pack.
- Verdict: HAND TO SENIOR EDITOR via [PUB] / RETURN TO [upstream agent].

DO NOT:
- Auto-publish.
- Lower an A-check from FAIL to SOFT-FAIL without `SK-OPS.apply-override`.
- Exceed the three-article cap per pack.
```

---

### F8. POST-PUBLISH AGENT (v3.0)

```
You are the Post-Publish Agent for Silicon Scotland's editorial production pipeline. You run after Senior Editor APPROVE on the F9 pack.

Your job: publish the article to WordPress at the selected backdate, confirm the publication artefacts, and update the workspace state.

LIBRARY: Union Media Skills Library v1.0.

INPUTS:
- Article ID.
- Senior-Editor-approved pack from F9.
- WordPress credentials / endpoint per environment config.
- Per-title configuration.

STARTUP:
1. `SK-OPS.environment-guard` against F8's required file list.

OPERATIONAL SEQUENCE:

1. FINAL SIGNAL-ONLY SWEEP: `SK-VERIFY.check-signal-only-prohibition` against the seventeen-artefact prohibited-use list â€” the article body, all interlinks, source pack, NFP footer, framing brief, gate audit trail and pack itself must contain no DIGIT/Futurescot/SFN URL as a drafting basis. This is the last gate before publication.

2. LINK RESOLUTION FINAL CHECK: `SK-VERIFY.check-url-resolution` against every URL in the article (body links, interlinks, source citations, NFP footer URLs).

3. DUPLICATE CHECK ONE LAST TIME: `SK-OPS.duplicate-check` against the live-URLs banner â€” guards against an editor-manual-publish duplicate slipping in between F9 and F8.

4. PUBLISH: paste the article into WordPress at the selected backdate. Confirm the backdate is correctly applied (this is a frequent error mode; verify the published date matches F5's selection).

5. POST-PUBLISH RECORDS:
   - Update master content inventory with the new live URL.
   - Update live-URLs banner.
   - Update master rota: mark the article complete.
   - Record the F-RR origin breadcrumb (sweep ID) against the published article for the K5 retrospective.

6. CONFIRM: post a brief confirmation to the same Teams chat as the [PUB] approval, naming the live URL.

OUTPUT FORMAT:
- Live URL.
- Backdate confirmed match.
- Master inventory updated.
- Verdict: PUBLISHED / HALT (any final-stage failure routes back to F9 with reason).
```

---

### Cross-reference back to skills library

Every skill referenced in the prompts above resolves to its definition in `union_media_skills_library_v1_0.md`. The Cross-reference matrix at the end of that document carries the at-a-glance composition table for each agent and is the authoring contract for any future title spec.


## Pre-Publish Review Pack â€” legacy field contract (preserved from v2.7.1)

The block below is the per-article Pre-Publish Review Pack template inherited from v2.7.1. **In v3.0 the pack is rendered by `SK-RENDER.render-pre-publish-pack`**, which formalises the green-tick visual format proven in the 18 May 2026 SS-MORNING-BATCH-001 pilot â€” multi-article packs (cap of three), comparison tables for gates and checks, canonical glyph palette (âœ… / âš ï¸ / âŒ / N/A), and a decision summary table at the head of the pack. The legacy single-article template below is retained as the canonical **field contract** â€” every field a per-article section must carry. It is what `SK-RENDER.render-pre-publish-pack` composes from.

---


# Pre-Publish Review Pack

**Article ID:** <id>
**Title:** <publication title â€” Silicon Scotland / HGS / Larder / ABN / SBN>
**Headline:** <proposed headline>
**Dek:** <proposed dek>
**Byline:** <byline>
**Proposed publish slot:** <date/time, with backdate flag if any>
**Article wordcount:** <n>
**Pack assembled:** <timestamp> by F9
**F6 rework count entering F9:** <n of 3>
**Origin (NEW v2.7.1):** Ranger Recon sweep <SWEEP-ID> â€” <pct>% sites reached and parsed â€” full [REC] report posted <time>.

## 0. Failure Log â€” NEW v2.7 (Fix 5, mandatory section)

Chronological raw event record from this article's path through the pipeline. Read this BEFORE the article content sections. An empty log is valid (clean run); the section is mandatory regardless.

| # | Timestamp | Stage / Agent | Event | Detail |
|---|-----------|--------------|-------|--------|
| 1 | <ts> | <F1/F2/F3/F4/F5/F6/F9> | <reject / hard-gate return / A-check return / rework / standing-rule check added late / figure revised / quote revised / source added / source removed / other> | <one-line> |
| ... | | | | |

**Summary:**
- F1 rejects on this article: <n>
- F6 hard-gate returns: <n> (gates: <list>)
- F9 A-check returns: <n> (checks: <list>)
- Total rework count entering F9: <n of 3>
- Standing-rule checks added late in pipeline (i.e. after Stage 5): <n> (rules: <list>)
- Figures revised after appearing in earlier draft: <n>
- Quotes revised after appearing in earlier draft: <n>
- Sources added after Stage 4: <n>
- Sources removed after Stage 4: <n>

**Clean-run declaration (if applicable):** "This article moved through F1 â†’ F9 without rework, without F6 hard-gate failure, without F9 A-check failure, and without standing-rule check added late. Failure Log is empty."

## 1. Classification

- **Defamation tier:** <Tier 1 / 2 / 3> â€” <one-line justification>
- **Production option:** <Option 1 / 2 / 3>
- **Framing brief (NEW v2.6):**
  - Geographic tier: <Scottish-origin / UK-origin / Global-origin>
  - Category tags: <primary>, <secondary>, <tertiary>
  - Primary frame: <one of the six in B9>
  - Scottish anchor: <named entity>
  - Per-story brief: <2-3 sentences>
- **Triage scorecard outcome:** <score and route>

## 2. Sources

| # | Source | URL | Independence | Public-record reply (T2) |
|---|--------|-----|--------------|--------------------------|
| 1 | <name> | <url> | Primary | N/A or URL |
| 2 | <name> | <url> | Independent | N/A or URL |
| 3 | <name> | <url> | Independent | N/A or URL |

**Public Domain Threshold met:** YES / NO (must be YES to proceed)
**DIGIT/Futurescot/SFN exclusion:** CLEAN / FLAGGED â€” <detail>

## 3. Verbatim quote audit

| Quote | Source URL | Match status |
|-------|-----------|--------------|
| "<quote>" | <url> | EXACT / FAIL |

## 4. Interlinks

| # | Anchor text | Target URL | Status |
|---|-------------|-----------|--------|
| 1 | <anchor> | <url> | LIVE / FAIL |
| ... up to 3 (B4 ceiling) ... |

**Interlink count:** <n> (B4 ceiling: 0-3 inclusive; zero is a valid pass)

## 5. Backdate decision

- **Proposed timestamp:** <date/time>
- **Live-publish time:** <date/time>
- **Backdate applied:** YES / NO
- **Backdate sanity:** PASS / FAIL â€” <one-line>
- **Tier 3 no-backdate rule:** RESPECTED / N/A

## 6. H-gate audit trail (from F6)

| Gate | Status | Detail |
|------|--------|--------|
| H1 Verbatim audit | PASS/FAIL | <detail> |
| H2 Source independence + PDT | PASS/FAIL | <detail> |
| H3 Paragraph-break preservation | PASS/FAIL | <detail> |
| H4 Author-register preservation | PASS/FAIL | <detail> |
| H5 Date reconciliation | PASS/FAIL | <detail> |
| H6 Link integrity | PASS/FAIL | <detail> |
| H7 No DIGIT/Futurescot/SFN drafting basis | PASS/FAIL | <detail> |
| H8 Editorial Escalation compliance | PASS/FAIL/N/A | <detail> |
| H9 Reserved | N/A | â€” |
| H10 Headline hard limits | PASS/FAIL | <detail> |
| H11 Defamation triage (T2 only) | PASS/FAIL/N/A | <detail> |

**Soft gates S1-S10:** <n passed of 10> â€” <flags listed>

## 7. F9 active-check pass

| Check | Status | Detail |
|-------|--------|--------|
| A1 Headline/dek defamation re-read | PASS/FAIL/N/A | <detail> |
| A2 Link-rot and live-URL | PASS/FAIL | <count of URLs checked, any failures listed> |
| A3 Source independence final sweep | PASS/FAIL | <detail> |
| A4 Verbatim quote integrity (extended scope v2.7 â€” all artefacts) | PASS/FAIL | <count verified across artefacts, any failures listed> |
| A5 House-style final sweep | PASS/FAIL | <detail> |
| A6 Interlink target validation | PASS/FAIL | <detail> |
| A7 Backdate sanity | PASS/FAIL | <detail> |
| A8 Tier 2 reasonable-steps log | PASS/FAIL/N/A | <detail> |
| A9 Image rights and caption | PASS/FAIL/N/A | <detail> |
| A10 Numeric-claim positive trace (NEW v2.7) | PASS/FAIL | <count of claims traced, any failures listed> |

### 7a. Numeric-claim positive trace (A10) â€” full table

| # | Claim (verbatim, with artefact) | F2 source row | Primary URL | Source figure (verbatim) | Match |
|---|---------------------------------|---------------|-------------|--------------------------|-------|
| 1 | <claim and artefact> | <row #> | <url> | <source figure> | EXACT / EXACT-EQUIVALENT / FAIL |
| ... | | | | | |

## 8. Reasonable-steps log (Tier 2 only)

- **Subject(s) named:** <names>
- **Public-record response URL:** <url>
- **Date of public-record response:** <date>
- **Defamation Act 2013 defence identified:** <truth / honest opinion / public interest / privilege / reportage>
- **Defence justification:** <one sentence>
- **Tier classifier:** <editor name>

## 9. Open risks and editor-attention items

- <bullet â€” any soft gates failed>
- <bullet â€” any items flagged by upstream agents requiring editor judgement>
- <bullet â€” any A-check soft flags worth raising>

## 10. Standing-Rule Compliance â€” NEW v2.7 (Fix 4, mandatory)

F9 cannot return PASS without this table fully populated. A missing row makes the overall verdict INCOMPLETE and routes the pack back to F9 for completion.

| Standing rule | Status | Justification / detail |
|---|---|---|
| B1 â€” Verbatim audit (extended scope) | CHECKED-PASS / CHECKED-FAIL / N/A | <detail> |
| B2 â€” Source independence (signal-only outlets, seventeen-artefact prohibited-use list) | CHECKED-PASS / CHECKED-FAIL / N/A | <detail â€” including which artefacts were swept for DIGIT/Futurescot/SFN> |
| B3 â€” Multi-source attribution over single-source rewrites | CHECKED-PASS / CHECKED-FAIL / N/A | <detail> |
| B4 â€” Interlinking discipline (reader-first, 0-3 ceiling) | CHECKED-PASS / CHECKED-FAIL / N/A | <detail> |
| B5 â€” Backdating discipline | CHECKED-PASS / CHECKED-FAIL / N/A | <detail> |
| B6 â€” Three-headline generation, click-bait-leaning selection | CHECKED-PASS / CHECKED-FAIL / N/A | <detail> |
| B7 â€” Audit footer convention | CHECKED-PASS / CHECKED-FAIL / N/A | <detail> |
| Section M â€” Defamation framework (Tier classification, Defamation Act 2013 defence, reasonable-steps log) | CHECKED-PASS / CHECKED-FAIL / N/A-with-justification | <detail> |
| Section L â€” Lifts and verbatim handling | CHECKED-PASS / CHECKED-FAIL / N/A | <detail> |

A row marked N/A must carry an explicit one-line justification (e.g. "Tier 1 article, M3 checklist not required" or "no quoted material in article, L not engaged"). N/A without justification = INCOMPLETE.

## 11. Verdict and sign-off

- **F9 verdict:** READY FOR EDITOR SIGN-OFF / HARD RETURN TO <agent> ON <A-check> / INCOMPLETE (Standing-Rule Compliance row missing â€” route back to F9)
- **Editor decision:** [ ] APPROVE  [ ] MODIFY  [ ] REJECT
- **Editor name:** _______________________
- **Decision timestamp:** _______________________
- **MODIFY notes (if any):**
- **REJECT reason (if any):**

---
END OF PACK
```

---

### F9-Protocol. EDITOR RESPONSE PROTOCOL

The Pre-Publish Review Pack is delivered to the editor under the `[PUB]` prefix in the Editorial Escalations Teams self-chat (see J2a). The editor responds with one of three verbs:

**APPROVE**
- Article goes to F8 Post-Publish for live URL verification, inventory update, cross-pub queueing.
- Pack archived in the article's audit folder.
- No further action required.

**MODIFY**
- Editor specifies the modification required (a sentence or two â€” not a rewrite).
- F9 routes the article back to the appropriate upstream agent based on the nature of the modification:
  â€¢ Body or quote changes â†’ F3 Writer
  â€¢ Interlinking changes â†’ F4 Interlinker
  â€¢ Headline/dek/copy edits â†’ F5 Editor
  â€¢ Tier reclassification â†’ F1 Triage
- MODIFY counts as a rework attempt against the F6 rework cap.
- The modified article re-enters the pipeline at the relevant agent and proceeds through F5 â†’ F6 â†’ F9 again. The editor sees a fresh pack on the second pass.

**REJECT**
- The editor declines to publish. Reason recorded.
- Article routes to the Reject Queue under `[REJ]` prefix with reason captured in the pack's section 10.
- No further pipeline action. The reject is logged in the K5 weekly opportunities review.

**No response within editor SLA:**
- Default SLA for Pre-Publish sign-off: same as `[ESC]` Editorial Escalations â€” two-hour response target during working hours.
- After SLA expiry, F9 surfaces the pending pack as a follow-up nudge in the Pre-Publish channel. Maximum three nudges, four-hour intervals.
- After third nudge ignored, F9 escalates as ESCALATE TO OPERATOR (article held; no auto-publish under any circumstances).
- The hard rule: F9 NEVER auto-publishes. Editor sign-off is mandatory.

---

### F9-Integration. INPUTS, OUTPUTS, DOWNSTREAM TRIGGERS

**Inputs F9 reads:**
- All F1-F6 structured outputs (consumed via the article's audit folder)
- Per-title configuration (house style, banned words, image-rights register)
- Per-title interlink target inventory (live Union Media URLs by title)
- Master content inventory (for cross-checking duplicate coverage)
- Subject public-record response JSON (Tier 2 only)
- Image manifest (where images attached)

**Outputs F9 produces:**
- Pre-Publish Review Pack (markdown, archived in audit folder, delivered to editor)
- F9 verdict block (structured, machine-readable, used by orchestrator)
- A-check pass/fail record (added to article audit log)

**Downstream triggers F9 emits:**
- On APPROVE â†’ F8 Post-Publish invoked
- On MODIFY â†’ relevant upstream agent re-invoked (F3 / F4 / F5 / F1) with editor's modification note
- On REJECT â†’ Reject Queue entry posted to `[REJ]` channel with reason; K5 weekly opportunities review picks it up
- On hard return (A-check fail) â†’ relevant upstream agent re-invoked with A-check failure detail
- On rework cap hit â†’ ESCALATE TO OPERATOR in `[ESC]` channel

**K5 weekly opportunities review:**
- F9 REJECT outcomes flow into the K5 Friday sweep alongside `[REJ]` queue items.
- F9 hard-return-then-escalate outcomes flow into K5 as process-learning items (recurring failure on the same A-check indicates a systemic gap, not a one-off).

**Corrections Register (Section I Stages 10-13):**
- F9 has no direct interaction with the Corrections Register. Corrections happen post-publication; F9 is pre-publication.
- However: a post-publication correction traceable to an A-check failure that F9 missed (e.g. a quote-drift correction where A4 should have caught the drift) is logged in the Corrections Register with a process-learning tag. The K5 review surfaces these as F9 calibration issues.

## Section G â€” Per-Title Configuration (Silo Pattern)

The system was designed for Silicon Scotland as the pilot. v2.2 deploys the same pipeline against five Union Media titles via per-title configuration files. **Shared infrastructure; title-specific personality.**

### G1. The five titles

| Title | Status | URL |
|-------|--------|-----|
| Silicon Scotland | Pilot â€” system fully defined | siliconscotland.news |
| High Growth Scotland | Pending â€” phase 2 launch | (URL TBC) |
| Larder | Pending â€” phase 2 launch | (URL TBC) |
| Aberdeen Business News | Pending â€” phase 3 launch (flagship, peak 1M page views/month) | (URL TBC) |
| Scottish Business News | Pending â€” phase 3 launch | (URL TBC) |

### G2. What every title inherits unchanged

These are the bits that make Union Media output recognisable across all five titles. They are **not** per-title configurable.

- The seven foundational artefacts (Section A)
- The three-option production ladder (B0)
- The six Editorial frames and the three-axis framing model (B9, B9.1, B9.2) (NEW v2.6 â€” replaces the v2.5 Ten Value Added Actions)
- The verbatim audit method (C1)
- The DIGIT/Futurescot/SFN signal-only rule (B2)
- The public domain threshold (3+ sources) (C2)
- Paragraph-break preservation (C3)
- Author-register preservation (C4)
- Date reconciliation (C5)
- The three-tier defamation framework (Section D)
- The Editorial Escalation Rule and Reject Queue (Section D)
- All nine agent prompt templates (Section F), with title-specific config injected at runtime
- The companion video script requirement (Stage 6.5)
- Backdating discipline (B5)
- Six-link interlinking (B4)
- Three-headline option discipline (B6)
- NOT-FOR-PUBLICATION footer convention (B8)
- The corrections and right-of-reply framework (Section I, Stages 10-13)
- House rules registry (A6) is shared across all titles

### G3. What each title configures

Per-title configuration file (`config_<title>.yaml`):

```yaml
title:
  name: <title name>
  url: <title url>
  founded: <year>
  publisher: Union Media
  cms: WordPress

editorial:
  mission: <one-sentence mission>
  audience: <one-sentence audience description>
  tone: <authoritative-factual-direct | conversational-curious | analytical-expert | warm-storytelling>
  content_ratio: <e.g. 85% news / 15% opinion>
  byline_default: <named journalist or "editorial team">

quota:
  weekday: <number>
  weekend: <number>
  combined_daily_target: <Union Media-wide; SS+HGS+Larder = 5-10/day Phase 1>

triage_weights:
  scottish_relevance: 5
  sector_relevance: <override per title â€” e.g. SS=tech sectors, Larder=food/drink/hospitality>
  recency: 4
  multi_source: 3
  audience_impact: 3
  editorial_angle: 2
  press_release_quality: 1

source_tiers:
  tier_1: <list of primary outlets for this title>
  tier_2: <list of secondary>
  tier_3: <list of supplementary>

banned_sources:
  - digit.fyi  # signal-only â€” never the basis (since 10 May 2026)
  - futurescot.com  # signal-only â€” never the basis (since 10 May 2026)
  - scottishfinancialnews.com  # signal-only â€” never the basis (since 18 May 2026; distinct rationale, see B2)
  - <any title-specific bans>

corporate_newsroom_watchlist:
  file: <path to title-specific newsroom CSV>
  
voice_notes:
  - <e.g. "use 'Silicon Scotland' on first reference, never 'we' or 'the site'">
  - <title-specific style notes>

cross_pub_targets:
  - <list of sister titles this title's content can cross-pub to, with angle-shift notes>
```

### G4. Phasing â€” UPDATED v2.6

**Phase 1 (v2.6 â€” from 18 May 2026):** Silicon Scotland only. 3-articles-per-day minimum, no maximum. HGS, Larder, ABN and SBN are out of scope for Phase 1 production (see K1). The agent pipeline, silo pattern and per-title configuration architecture stay in place as forward-looking infrastructure; they are not active for those titles under v2.6.

**Phase 2 (deferred):** Reintroduce one of HGS / Larder onto the pipeline once Silicon Scotland is operating reliably at 3+ articles/day. Sequencing and trigger criteria are not committed under v2.6 â€” the Senior Editor takes that decision when the Phase 1 floor is consistently held.

**Phase 3 (deferred):** ABN onboarding. ABN is the historical flagship (peak 1M page views/month) â€” treat its onboarding as a major integration test, not a routine roll-out.

**Phase 4 (deferred):** SBN onboarding. All five Union Media titles operational on the same agent pipeline.

### G5. Cross-title cross-pub queue

When Post-Publish flags an article for cross-pub potential, the cross-pub queue records:
- Source title and source URL
- Target title
- Angle-shift required (e.g. "ABN cross-pub of L1 Stornoway: lead with the family business angle, demote the gene-therapy science")
- Cross-pub priority

The Triage agent for the target title picks up the cross-pub queue items as candidate stories, applying the target title's per-title config.

---

## Section H â€” Intake (manual now, automation flagged)

### H1. The intake reality

Press releases and pitches do not magically arrive in front of the agent pipeline. They land in a Zoho mailbox (Zoho Corporation's own product, runs on Zoho infrastructure â€” IMAP/SMTP supported, Zoho API available). The April spec assumed press releases would somehow pre-sort themselves into a triage queue. They don't.

v2 acknowledged this; v2.2 retains the same intake structure. **Today's operating model is manual intake.** A future intake automation layer is flagged as a separate workstream.

### H2. The three intake streams

Three streams feed into the Triage agent:

**Stream 1 â€” Submitted (mailbox).**
Press releases and pitches sent to the Union Media shared Zoho mailbox. Today: a human operator opens Zoho once or twice a day, reviews the inbox, and pulls candidate items into a working shortlist. Tomorrow: automated intake agent (see H4) reads Zoho directly and pre-sorts.

**Stream 2 â€” Sourced (RSS / news monitoring).**
Stories identified through monitored RSS feeds via rss.app. Today: a human operator scans the rss.app dashboard once or twice a day. Tomorrow: a sourced-content monitoring agent that polls feeds and applies the public domain threshold automatically.

**Stream 3 â€” Corporate newsroom (direct).**
Press releases identified directly on the 85 monitored corporate newsrooms (A4). Three confirmed RSS (Skyrora, Nvidia UK, FinTech Scotland); the rest manually checked or via rss.app feed resolution. **Treated as primary sources directly â€” no tracing step.**

### H3. The Triage agent input contract (source-agnostic)

The Triage agent accepts a list of candidate items with the following structure regardless of which stream produced them:

```json
{
  "candidate_id": "<provisional id>",
  "source_stream": "submitted | sourced | corporate_newsroom",
  "source_url": "<URL>",
  "source_text": "<press release or article body>",
  "source_subject": "<named organisation or person>",
  "source_date": "<ISO date>",
  "intake_timestamp": "<ISO timestamp when item arrived>",
  "intake_handler": "<operator name | automation_agent_name>",
  "metadata": {
    "originating_outlet": "<for sourced stream only>",
    "monitored_count": "<for sourced stream â€” how many outlets so far>",
    "pr_contact": "<for submitted stream â€” sender email and org if known>"
  }
}
```

Why this matters: when the intake automation layer is built later, it plugs into the existing Triage agent without any pipeline changes. The Triage agent doesn't care whether a human or an automation produced the candidate item.

### H4. Future automation â€” the flagged Zoho intake layer

**Status: deferred. Scoping to begin once core process is in production (Phase 1 stable).**

When ready to build, the intake automation layer should:

1. Read Zoho directly via Zoho's API (IMAP/SMTP fallback if API throttled)
2. Apply a category sort to incoming mail (PR / event invitation / pitch / spam / other / personal-not-for-publication)
3. Discard categories that are not editorial candidates (spam, personal, event invites that aren't stories)
4. Convert qualifying press releases into the Triage agent input contract (H3)
5. Queue them for Triage with `intake_handler = automation_agent_name`
6. Route ambiguous items to a human review queue rather than discarding
7. Maintain a daily intake report visible to the operator: count by category, anything routed to human review, any errors

**Critical:** Final human approval still gates publishing, per conservative posture. The intake automation layer is about reducing the operator's mailbox time, not removing the operator from the publish decision.

### H5. The two deferred April Automation Review Points

The April spec flagged two automation decisions (Option 1 to WordPress autonomy; Option 3 angle selection autonomy). v2 parked both pending intake automation; v2.2 retains the parked status:

> The right level of autonomy at the publishing end depends on what the intake end looks like. Both questions are deferred until the intake workstream is scoped. Default conservative behaviour applies until reviewed â€” human gate on Option 1 publish, human pick on Option 3 angle.

â€” Senior Editor's call, 10 May 2026.

---

## Section I â€” The Production-to-Response Workflow

Section I is the integrated end-to-end workflow. Stages 0-9 cover the production pipeline from intake to post-publish. Stages 10-13 cover the post-publication response workflow â€” corrections, clarifications, right of reply, and retractions â€” that absorbs the v2.1 Section L draft. The full lifecycle of an article sits in one section.

### Stage 0 â€” Discovery and Programme setup (updated v2.4)
The seven artefacts (Section A) must exist. Per-title configuration loaded for the title being produced.

**Operational first step (new v2.4):** Ranger Recon (F-RR) runs twice daily per title â€” 07:00 UK and 13:00 UK â€” sweeping the four-layer source structure (L1 corporate newsrooms, L2 institutional press feeds, L3 UK national tech cross-reference, L4 signal-only outlets DIGIT / Futurescot / SFN). For each candidate it runs the Stream (a) test ("can this be produced without outreach?"), the public WordPress REST API duplicate-check (front-only, 30-day look-back) and the in-flight queue re-check, then files surviving candidates into the F1 Triage inbox. Volume anomalies escalate to the Senior Editor under `[OPS-RR]`. Full agent prompt, source layers and Phase 2/3 / Pathfinder appendices are in Section F (Ranger Recon) and Appendices RR-1, RR-2, RR-3.

### Stage 1 â€” Intake (updated v2.4)
A candidate item arrives in the F1 Triage inbox via one of three routes: (1) Ranger Recon's Stage 0 sweep â€” the primary operational route under v2.4, (2) Senior Editor-direct injection (human pick from any source, including the three streams in Section H), (3) the historical Section H streams retained for manual completeness. F1 consumes the inbox in arrival order. Intake handler (Ranger Recon for route 1; human or automation for routes 2-3) packages each item into the Triage input contract.

### Stage 2 â€” Triage and routing
Triage agent (F1) applies disqualification rules, fires the Tech Lens prompt (v2.6) on borderline-tech candidates, scores against the triage scorecard (C0), classifies source stream, applies public domain threshold, **classifies defamation tier (Section D)**, selects production option (1/2/3), **writes the framing brief (NEW v2.6 â€” Geographic tier, Category tags, Primary frame, Scottish anchor, per-story brief)**, checks Editorial Escalation Rule (D0), and routes Reject Queue cases (D-Reject) out of the pipeline. Output: PROCEED / DISQUALIFIED / ESCALATE / REJECT-QUEUE [reason] / DROP.

### Stage 3 â€” Source acquisition and sequestration
Researcher agent (F2) locates primary source, saves as JSON with original Unicode codepoints, locates independent confirmations, runs DIGIT/Futurescot/SFN signal-only check, captures paragraph structure of quotes, captures pipeline opportunities. For Tier 2 articles, locates and captures the subject's public-record response.

### Stage 4 â€” Draft construction
Writer agent (F3) drafts according to assigned production option, produces three headline options, standfirst, body with verbatim quotes preserved, NOT-FOR-PUBLICATION footer including defamation tier and (Tier 2) Defamation Act defence.

### Stage 5 â€” Interlinking, editing, video script
- Interlinker agent (F4) inserts 0-3 internal links (per B4 placement test â€” reader value first, no minimum) + 3-5 outbound contextual links
- Editor agent (F5) sub-edits, selects headline, sets backdate (no backdate for Tier 3 exceptional production), reconciles dates, confirms word count
- **Stage 5.5 â€” Companion video script:** Editor appends a 90-120-second / 225-300-word video script to the NOT-FOR-PUBLICATION footer. Format: opening hook + body in plain conversational language + closing call to action ("For the full story, visit [Title] dot news. Like and subscribe."). Labelled "VIDEO SCRIPT â€” [headline] â€” [date]" on its own line.

### Stage 6 â€” Quality gates
Reviewer agent (F6) runs hard gates H1-H11 and soft gates S1-S10. H11 is the defamation triage checklist gate for Tier 2 articles. Verdict: APPROVED / RETURN / HALT.

### Stage 7 â€” Pre-Publish Review Pack and editor sign-off (NEW in v2.3)
F9 Pre-Publish Review Pack agent assembles the single human-readable pack (template per F9-Template) and runs the A1-A9 independent active-check pass. On any A-check FAIL, hard-return to the relevant upstream agent (F1 / F2 / F3 / F4 / F5) and re-enter the pipeline. On A-check PASS, the pack posts to the editor under the `[PUB]` prefix in the Editorial Escalations Teams chat (see J2a). Editor returns APPROVE / MODIFY / REJECT within the two-hour working-hours target. F9 never auto-publishes. APPROVE releases the article for Stage 8. MODIFY routes back to the appropriate agent and re-enters at Stage 5/6/7. REJECT files the story into the Reject Queue under `[REJ]` and the K5 Friday sweep picks it up.

### Stage 8 â€” Operator publish
Following F9 APPROVE, operator publishes manually in WordPress. Live URL captured.

### Stage 9 â€” Post-publish
Post-Publish agent (F8) verifies URL, updates inventory (including defamation tier), formalises pipeline opportunities, updates cross-pub queue, hands off video script.

---

The agent pipeline ends at Stage 9. The remaining stages (10-13) describe the post-publication response workflow that activates only when a complaint, error, or amendment request surfaces. These stages are operator-driven and Senior Editor-decided, not agent-driven.

### Stage 10 â€” Trigger reception

A correction, clarification, right of reply, retraction, or takedown is considered when any of the following occurs:

- A reader contacts Union Media to identify an error
- The subject of an article contacts Union Media to dispute its content
- A third party identified in an article contacts Union Media regarding their reference
- A legal representative contacts Union Media on behalf of any party
- An internal review identifies an error in published content
- New information emerges that materially changes the factual basis of a published article
- A regulator, court, or other authority requires action

**Trigger reception channel:** `editorial@unionmedia.news`, marked "For the Urgent Attention of the Editor" by external complainants. Internal triggers (operator-identified errors) raised by direct message to Senior Editor.

**Definitions (used throughout Stages 10-13):**

- **Correction:** A change to an article to fix a factual error (incorrect figure, name, date, attribution, or other verifiable fact).
- **Clarification:** A change to an article to remove ambiguity or address a misleading impression where the underlying facts were not strictly inaccurate.
- **Right of Reply:** A response from the subject of an article, published either as an addition to the original article or as a separate response piece, addressing the subject's position on the article's content.
- **Retraction:** The withdrawal of an article in whole or in part, with a published notice explaining the withdrawal. Used where the underlying premise of the article cannot be supported.
- **Takedown:** The complete removal of an article from publication, with or without a published explanation. Used where the article should not have been published or where legal compulsion requires removal.

These are distinct actions with distinct triggers and processes.

### Stage 11 â€” Acknowledge (within two working days of receipt)

All contact is acknowledged in writing within two working days. The acknowledgement:
- Confirms receipt
- States that the matter will be reviewed
- Does not admit error or commit to a specific action
- Does not engage substantively with the complaint at this stage

### Stage 12 â€” Review and determine (within five working days of acknowledgement)

Senior Editor (or designated deputy where established) reviews:
- The complaint or concern as stated
- The original article
- The source material in the evidence file
- The Reviewer Hard Gate record (H1-H11)
- The M3 Defamation Triage Checklist (Tier 2 only)

Review concludes with one of five determinations:

1. **No action required.** Article is accurate and properly framed. Response declines amendment with brief reasoning.
2. **Correction.** Factual error confirmed. Proceed to Stage 13a.
3. **Clarification.** No factual error but ambiguity or misleading impression confirmed. Proceed to Stage 13b.
4. **Right of Reply.** Subject's position is substantive and warrants publication. Proceed to Stage 13c.
5. **Retraction or Takedown.** Article cannot be supported. Proceed to Stage 13d.

### Stage 13 â€” Action and respond

**Stage 13a. Correction:**
- Specific error identified and corrected in the article body
- Correction notice added at the top of the article: "Correction (date): An earlier version of this article stated [X]. This has been corrected to [Y]."
- Correction logged in Corrections Register
- Where the subject was named, subject notified of the correction
- Where the error was material and the article was widely shared, consideration given to publishing a standalone correction notice

**Stage 13b. Clarification:**
- Ambiguous or misleading passage rewritten for clarity
- Clarification notice added at the top of the article: "Clarification (date): This article has been updated to clarify [aspect]. The original version may have given the impression that [X]; the position is [Y]."
- Logged in Corrections Register

**Stage 13c. Right of Reply:**
- Subject's response received in writing
- Response added to the article either as an inline update or as a "Response from [subject]" section appended to the original article
- Original article text not altered (the response addresses, not replaces, the original)
- Where the response is substantial or the matter is significant, a separate response article may be commissioned
- Logged in Corrections Register

**Stage 13d. Retraction or Takedown:**
- Senior Editor decision required â€” no delegation
- Retraction notice published in place of the article (or alongside, depending on circumstances)
- Notice states the fact of retraction and the date; does not necessarily restate the retracted claims
- Where takedown is required, the URL returns a notice explaining the article has been removed
- Search engine de-indexing requested where appropriate
- Logged in Corrections Register
- Where the matter relates to a complaint that may proceed to legal action, all communications logged and retained

**Final response to complainant (within seven working days of original contact):**
Written response stating:
- The determination
- The action taken
- The reasoning where action was declined
- Information on further recourse (NUJ Code, ICO for data protection matters, legal advice)

### Stage 13-Timelines (summary)

- **Acknowledgement:** within two working days
- **Review concluded:** within five working days of acknowledgement
- **Final response to complainant:** within seven working days of original contact
- **Correction or clarification published:** within one working day of determination
- **Retraction or takedown:** within one working day of determination, subject to legal advice where applicable

### Stage 13-Register. Corrections Register

A single register maintained across all titles, recording for each entry:
- Date of complaint or trigger
- Article URL and title
- Title of publication
- Nature of complaint
- Determination
- Action taken
- Date action completed
- Person making complaint (where known)
- Whether legal representation was involved

The register serves three purposes:
- Audit trail for any future legal claim
- Pattern detection (recurring issues with particular writers, sources, or topics)
- Evidence of responsible publication practice

Reviewed quarterly by Senior Editor.

### Stage 13-Authority

- **Acknowledge:** Operator (or journalist for HGS when handed off)
- **Review and determine:** Senior Editor (or designated deputy)
- **Correction or clarification action:** Operator on Senior Editor's instruction
- **Right of Reply publication:** Operator on Senior Editor's instruction
- **Retraction or takedown:** Senior Editor decision only, no delegation
- **Legal correspondence:** Senior Editor only, no delegation

### Stage 13-Public. Public-facing policy text

The following text is to be published on each Union Media title's website as a dedicated "Editorial Standards and Corrections" page accessible from the site footer:

---

#### Editorial Standards and Corrections

[Title] is committed to accurate, fair, and responsible journalism. We take our editorial responsibilities seriously and apply the following standards to our work.

**Our standards**

We verify factual claims against multiple independent sources before publication. We distinguish clearly between established fact, reported claim, and editorial comment. Where our reporting is critical of an identified person or organisation, we cite their public-record position in our article so readers see both sides.

Our editorial work is informed by the National Union of Journalists Code of Conduct.

**If you believe we have got something wrong**

We welcome contact from readers, subjects of coverage, and other parties who believe an article on this site contains an error, is misleading, or requires a response.

Please contact us at editorial@unionmedia.news, marked **"For the Urgent Attention of the Editor"**, with:
- The URL of the article concerned
- The specific passage or claim in question
- The nature of your concern
- Any supporting information you wish to provide
- Your contact details

**What happens next**

- We will acknowledge your contact in writing within two working days
- We will review the matter and reach a determination within five working days of acknowledgement
- We will respond to you in writing within seven working days of your original contact
- Where we determine that a correction, clarification, right of reply, or retraction is appropriate, we will action this within one working day of the determination

**Possible outcomes**

After review, we may:
- Determine that no action is required and explain our reasoning
- Issue a correction where a factual error is confirmed
- Issue a clarification where the article may have given a misleading impression
- Publish a right of reply where the subject's position warrants it
- Retract or remove the article where its underlying premise cannot be supported

**Our corrections record**

We maintain an internal corrections register and review it quarterly. Where corrections are issued, they are clearly marked on the original article with the date and nature of the correction.

**Further recourse**

If you are not satisfied with our response, you may pursue further recourse through:
- The Information Commissioner's Office (for data protection matters): ico.org.uk
- Legal advice from a qualified solicitor

We aim to resolve concerns directly wherever possible.

---

**Last updated:** [date of publication]

**Published by:** Union Media (trading name of Azzurro-Blu Limited, company no. 09597161). Solo House, The Courtyard, London Road, Horsham, West Sussex, RH12 1AT.

---

### Stage 13-Implementation. Implementation notes

- The public-facing text above is published on all five Union Media titles
- Single email address per title â€” `editorial@unionmedia.news` â€” marked "For the Urgent Attention of the Editor"
- Privacy inbox is separate â€” `privacy@unionmedia.news` marked "Data Protection Request" â€” and covered by the Privacy Policy, not this section
- Footer link wording on each site: "Editorial Standards" or "Corrections Policy"
- The page should be reachable from every article in two clicks maximum
- Annual review of the policy text to ensure it remains current

### Stage 13-Standing. Standing Actions (Section I)

- **Editorial email address deployment:** Confirm `editorial@unionmedia.news` is live and monitored, with auto-acknowledgement reply set. Action owner: Senior Editor. Status: outstanding.
- **Corrections page deployment:** Publish the Stage 13-Public text on each Union Media site. Action owner: Senior Editor. Status: outstanding.
- **Corrections Register creation:** Establish the register (likely a shared spreadsheet or database) before next article published under v2.2. Action owner: Senior Editor. Status: outstanding.
- **Press regulator membership:** Closed as not applicable. Union Media's editorial standards are framed against the NUJ Code of Conduct only; no IMPRESS/IPSO membership is sought.

---

## Section J â€” Implementation Notes for the Pipeline Build

### J1. Persistent state, not chat state
The pipeline operates against persistent workspace files, not chat history. Files of record: `sources/`, `master_inventory.docx`, `editorial_opportunities_pipeline.md`, `<article-id>_FINAL.md`, `contacts_register.csv` (lightly maintained), `house_rules.md`, `config_<title>.yaml`, `corrections_register.csv`. Chat scroll-back is volatile.

### J2. Operator decisions per article
- **Triage routing override** (rare): operator can override Triage's production option choice, framing brief or Tech Lens outcome. Default: trust the agent.
- **Editorial Escalation response (`[ESC]`)** (per-article when triggered): approve / modify direction / drop. Channel: Teams self-chat "Union Media â€” Editorial Escalations" under `[ESC]` prefix. Target turnaround: 2 hours during working day.
- **Reject Queue response (`[REJ]`)** (per-item, batched): PURSUE-MANUAL / HOLD / DROP. Same Teams chat under `[REJ]` prefix. Daily scan + Friday weekly sweep.
- **Pre-Publish Pack response (`[PUB]`)** (per-article when triggered, the single human gate): APPROVE / MODIFY / REJECT. Same Teams chat under `[PUB]` prefix. Target turnaround: 2 hours during working day. This is also the single human gate at which the framing brief is reviewed and confirmed or modified (NEW v2.6).
- **Headline pick: NOT IN PER-ARTICLE FLOW.** Editor agent picks autonomously per the click-bait policy (B6.1). Operator may override at publish time with one keystroke if desired â€” not required.
- **Backdate confirmation: NOT IN PER-ARTICLE FLOW.** Editor agent picks per rule. Operator may override on exception.
- **APPROVE / REWORK** after Reviewer's verdict (only when Reviewer escalates after auto-rework): 1-minute decision.
- **Publish** in WordPress: 60-second sense check + click.

Per-article human time at steady state (v2.6 â€” Silicon Scotland only):
- Option 1: 1-2 minutes (publish click + sense check)
- Option 2: 2-3 minutes (publish click + sense check + occasional override + framing brief glance at `[PUB]`)
- Option 3: 4-6 minutes (framing brief confirmation at `[PUB]` + escalation if flagged + publish) â€” v2.6 reduces the v2.5 5-8 minute Option 3 budget because the VAA-pick decision is folded into the single F9 human gate rather than appearing twice (Triage + Publish).

At the 3-per-day floor: operator time budget ~10-20 minutes per day on article processing, plus Editorial Escalations and Reject Queue Friday sweeps. Headroom is wide â€” the cadence ceiling under v2.6 is bounded by candidate flow and risk-machinery throughput, not operator time.

### J2a. Editorial Escalation, Reject Queue, Pre-Publish and Ranger Recon ops channel (updated v2.4)

The channel for Triage agent escalations (per D0), Reject Queue items (per D-Reject), Pre-Publish Review Packs (per F9), and Ranger Recon operational alerts (per F-RR):

- **Primary channel:** Microsoft Teams self-chat titled "Union Media â€” Editorial Escalations". One chat for all Union Media titles, chronological feed.
- **Prefix scheme:** Four prefixes share the channel:
  - **`[ESC]`** â€” Editorial Escalations: pre-drafting decisions where the Senior Editor can release the story into the pipeline by responding APPROVE / MODIFY / DROP. 2-hour target turnaround during working day. Drafting blocked until response.
  - **`[REJ]`** â€” Reject Queue: stories the agent pipeline has judged outside what it can safely process. Senior Editor decides PURSUE-MANUAL / HOLD / DROP. No per-item deadline; daily scan + Friday weekly sweep.
  - **`[PUB]`** â€” Pre-Publish Review Pack: F9-assembled human-readable pack awaiting editor sign-off before publication. Senior Editor decides APPROVE / MODIFY / REJECT. 2-hour target turnaround during working day. F9 never auto-publishes.
  - **`[OPS-RR]`** (new v2.4) â€” Ranger Recon operational alerts: source failures, REST API failures, duplicate-check halts, volume anomalies, layer additions/removals. Operational not editorial â€” different SLA. No per-item editor deadline; Senior Editor reviews within one working day. Ranger Recon never blocks on `[OPS-RR]` resolution except where the alert is a duplicate-check failure, in which case the affected cycle halts until the Senior Editor acknowledges (see Section F / Ranger Recon failure handling). Senior Editor response verbs: `ACKNOWLEDGE` / `INVESTIGATE` / `ADJUST [direction]`.
- **Message format ([ESC] example):**
  > [ESC / SS / OP-049 / 11:42] Story: Highland Council outsourcing IT to consortium that includes a Senior-Editor-personal-network individual. Proposed framing: Policy and Regulation, with critical / sceptical substance. Agent recommendation: ESCALATE before drafting due to potential conflict-of-interest exposure. Decision deadline: 13:42 (2 hours).
- **Message format ([REJ] example):**
  > [REJ / SS / 14:15] Story: Edinburgh fintech Acme raises Â£2m. Reject reason: Tier 2 â€” outreach required for right-of-reply defence. Detail: round described as down-round in source; subject has issued no public statement; cannot publish reportage without their position on record. Agent recommendation: forward for manual outreach decision. Triage scorecard: 16/22. Suggested production option if pursued: 3. No decision deadline (queue review item).
- **Message format ([PUB] example):**
  > [PUB / SS / OP-061 / 09:14] Article: Stewart Miller resigns from Heriot-Watt. Tier: 2 (reportage). F6 H1-H11 all PASS. F9 A1-A9 all PASS. Verdict: READY FOR EDITOR SIGN-OFF. Pack: /audit/OP-061/prepublish_pack.md. Decision deadline: 11:14 (2 hours). Verbs: APPROVE / MODIFY / REJECT.
- **Message format ([OPS-RR] example) (new v2.4):**
  > [OPS-RR / SS / RR-SS-20260518-1300-03 / 13:14] Alert: WordPress REST API timeout on duplicate-check, cycle halted. Layer affected: all. Cycle ID: RR-SS-20260518-1300. Candidates held in pre-triage cache: 7. Recommendation: confirm site health, then issue `ACKNOWLEDGE` to release cache or `INVESTIGATE` to hold further. No editorial deadline.
- **Senior Editor response formats:**
  - For `[ESC]`: `APPROVE` / `MODIFY [direction]` / `DROP`
  - For `[REJ]`: `PURSUE-MANUAL` / `HOLD` / `DROP`
  - For `[PUB]`: `APPROVE` / `MODIFY [direction]` / `REJECT [reason]`
  - For `[OPS-RR]`: `ACKNOWLEDGE` / `INVESTIGATE` / `ADJUST [direction]`
- **`[PUB]` no-response handling:** F9 surfaces a follow-up nudge in the chat after SLA expiry. Maximum three nudges, four-hour intervals. After the third nudge ignored, F9 escalates as ESCALATE TO OPERATOR. Article held; no auto-publish.
- **`[OPS-RR]` no-response handling:** duplicate-check-failure `[OPS-RR]` alerts hold the affected Ranger Recon cycle indefinitely until acknowledged â€” no auto-resume. All other `[OPS-RR]` alerts are informational and do not block subsequent cycles.
- **Audit trail:** the chat itself is the audit trail for all four prefixes. No separate log required.
- **Mobile reachability:** Teams works on iPhone, so escalations, reject items and Pre-Publish packs are reachable when Senior Editor is away from the Mac.
- **Fallback:** if Teams integration becomes awkward (rate limits, API constraints), fall back to a dedicated Outlook email folder "Union Media Escalations" with the same prefix scheme and one-liner format. This keeps the audit trail intact even on the fallback path.

### J3. House rule registry
`house_rules.md` is a versioned file. Every new house rule established in a session is appended with date, triggering incident, and prompt revisions required. All agents read it at start of run.

### J4. Audit script as a shared utility
The Unicode normalisation function used in the verbatim audit must be a shared library, not duplicated in each agent's prompt. Writer, Editor, Reviewer all use the same canonical implementation. Adding a new character variant updates the library; all agents inherit.

### J5. Cost discipline on the Reviewer
The Reviewer is the most-invoked agent (multiple times per article on rework loops). Use a smaller/cheaper model for routine gate checks; escalate to a larger model only when a hard gate fails ambiguously.

### J6. Operator-facing dashboard (updated v2.4)
The operator should see a single dashboard with: rota status, hard-gate failures requiring decision, blocked articles, Editorial Escalations awaiting response, Reject Queue items awaiting Friday sweep, **Pre-Publish Review Packs awaiting editor sign-off (with SLA countdown and nudge counter)**, pipeline opportunities awaiting commission, Corrections Register entries open, **Ranger Recon cycle status per title (last 07:00 / 13:00 sweep timestamp, candidates surfaced, candidates held in pre-triage cache, in-flight queue size, current `[OPS-RR]` queue with halt-vs-informational flag)** (new v2.4). This replaces ad-hoc chat-based status.

### J7. Contacts/CRM as a future force multiplier
Under v2.2 the contacts register is lightly maintained (A5) â€” the agent pipeline does not consume it. The medium-term standalone outreach workstream, when built, will sit on top of this register. Until then, editors add to it from any manual outreach activity. The register is the foundation the future outreach build sits on.

### J8. Wiki integration as a probable necessity at 6 months
Senior Editor is Apple/iCloud native today; no Notion/GDrive/Obsidian/GitHub experience. As the system scales to five titles and 5-10 articles/day, file-based state will hit a navigability wall. Recommend introducing Obsidian (local-first, Markdown-native, works on Mac and iPhone, bidirectional links between articles/sources/contacts/opportunities) as the operator-facing interface around month 6. Underlying agent state remains file-based; Obsidian sits on top as the human navigation layer.

---

## Section K â€” Resolved Operating Decisions

This section records the locked operating decisions and their reasoning so the audit trail is intact. K1-K8 carry forward from v2.1; K5 and K8 are updated for v2.2; K9 is new for v2.2.

### K1. Cadence target â€” SILICON SCOTLAND ONLY, 3-PER-DAY MINIMUM, NO MAXIMUM (UPDATED v2.6)

**Decision (locked 18 May 2026, v2.6):** Phase 1 cadence is **three published Silicon Scotland articles per working day minimum, no maximum.** v2.5's "3/day weeks 1-4, 5/day weeks 5-8" cadence cap is removed in full. HGS, Larder, ABN and SBN are out of scope for Phase 1 production; their per-title quotas are not set or enforced under v2.6.

**Floor:** the pilot is considered operating when Silicon Scotland publishes at least three articles per working day, every working day.

**Ceiling:** none. The agent pipeline produces as many publishable Silicon Scotland articles per day as the discovery layer (F-RR Ranger Recon, twice daily) surfaces and the risk machinery (F6 + F9 + Senior Editor sign-off) clears. If Ranger Recon surfaces ten viable candidates and F6/F9 clear nine of them, nine publish.

**Reasoning:**
- The previous cadence cap was an artificial brake. The bottleneck is candidate-quality and risk-machinery throughput, not a self-imposed daily limit.
- The 3-per-day floor matters because below it, the pilot's audience and SEO signals decay; above it, every additional article is upside.
- Phase 1 scope locked to Silicon Scotland only (v2.6 change 2) means there is no competing title load against operator time. The operator capacity that v2.5 split across SS / HGS / Larder is, in v2.6, available entirely to Silicon Scotland.

**Implementation:** Silicon Scotland's `config_siliconscotland.yaml` sets `quota.weekday_minimum: 3` and `quota.weekday_maximum: none`. Triage agent enforces the floor (does not de-prioritise candidates because a daily quota is hit). Operator dashboard shows the daily count against the 3-per-day floor with a count-up rather than a count-down. Multi-title cadences (HGS, Larder, ABN, SBN) remain in the silo-pattern architecture (Section G) as forward-looking infrastructure but are not active under v2.6.

**Out-of-scope titles under v2.6:** HGS, Larder, ABN, SBN. Reintroduction sequencing is a Phase 2 decision, not a v2.6 commitment.

### K2. Cross-pub automation â€” AUTO-QUEUE NEVER AUTO-PUBLISH

**Decision:** Post-Publish agent auto-queues cross-pub candidates to the target title's queue with angle-shift required. Target title's Triage agent picks them up as candidates on the next run, applies that title's per-title config, produces a draft. The cross-pub draft awaits operator APPROVE / REWORK before publication exactly like any other article. Never auto-publish a cross-pub.

**Reasoning:** queuing is free; publishing is the moment of risk. Get the throughput benefit without removing the human gate.

**Implementation:** F8 Post-Publish agent updated. Cross-pub queue is a per-title file (`cross_pub_queue_<title>.md`).

### K3. Backdate approval â€” AGENT-CHOSEN, OVERRIDE ON EXCEPTION

**Decision:** Editor agent picks the backdate per the rule in B5/D3. Operator does not confirm per article. Operator may override on exception by editing before publish. **Tier 3 stories that exceptionally proceed to production are not backdated** â€” they publish with full transparency on publication date.

**Reasoning:** the rule is mechanical and unambiguous. Per-article confirmation is the kind of friction that breaks 5-10/day at scale. Footer makes every choice auditable.

**Implementation:** F5 Editor agent prompt updated.

### K4. Headline approval â€” AGENT-CHOSEN AUTONOMOUSLY, CLICK-BAIT-LEANING POLICY

**Decision:** Editor agent picks the headline autonomously per the click-bait-leaning policy in B6.1. Operator does not pick per article. Operator may override at publish time with one keystroke if desired.

**Senior Editor's standing instruction:** "Headline should be based on click-bait â€” most likely to attract human eyes for fresh content."

**Reasoning:** removes the option-(1) bias structurally. Trades a small accuracy-of-tone risk for a measurable engagement gain. Hard limits in B6.1 keep accuracy floor non-negotiable. New residual risk (E3a) mitigated by Reviewer H10 gate, Editorial Escalation override, and weekly retrospective.

**Implementation:** B6 + B6.1 retained. F5 Editor agent prompt retains autonomous selection. F6 Reviewer agent retains H10 gate.

### K5. Pipeline opportunity commissioning and Reject Queue review â€” ALWAYS OPERATOR COMMISSION, FRIDAY SWEEP

**Decision (updated v2.2):** No auto-promotion. Weekly pipeline review (15-30 min, Friday) where Senior Editor scans the active opportunities list and explicitly marks commission / park / drop, **and works through the Reject Queue marking PURSUE-MANUAL / HOLD / DROP**. Items parked >90 days auto-archive. Reject Queue items not actioned within four Friday sweeps default to DROP.

**Reasoning:** opportunities are aspirational; the rota is committed work. Reject Queue is a holding area for stories the pipeline cannot safely process. Both belong in the same weekly editorial review because both are "what could we do that we are not doing". Co-locating the two reviews keeps the operator's weekly editorial discretion in one slot.

**Implementation:** Editorial opportunities pipeline retains current structure. Recurring schedule item: Friday weekly review of opportunities pipeline and Reject Queue combined. Daily scan of new `[REJ]` items at start of day to spot obvious DROPs.

### K6. Reviewer escalation policy â€” AUTO-REWORK ONCE, THEN ESCALATE, MAX 3

**Decision:**
- On hard-gate failure, Writer (or relevant prior agent) re-runs with Reviewer's specific feedback. This counts as rework attempt 1.
- If the SAME hard gate fails again, escalate to operator. Do not auto-rework the same gate twice.
- If a DIFFERENT hard gate fails on the second pass, treat as rework attempt 2 and return for fix.
- Hard cap: maximum 3 reworks per article before mandatory operator escalation regardless of which gate failed.

**Reasoning:** most hard-gate failures are minor (one quote not normalised, one date not reconciled). Auto-rework handles those without operator time. Repeated failure on the same gate signals a real problem worth attention.

**Implementation:** F6 Reviewer agent prompt updated with rework policy. Rework counter tracked in NOT-FOR-PUBLICATION footer.

### K7. (Reserved.)

The v2.1 K7 decision (outreach contact preference order) is removed as outreach is no longer an agent function under v2.2. The slot is reserved to keep K8 numbering stable for cross-references; future operating decisions may take the slot.

### K8. Editorial Escalation and Reject Queue channel â€” TEAMS SELF-CHAT, TWO PREFIXES

**Decision (updated v2.2):** Microsoft Teams self-chat titled "Union Media â€” Editorial Escalations". One chat for all Union Media titles, chronological feed. Two prefixes:
- `[ESC]` for Editorial Escalations under D0 â€” Senior Editor responds APPROVE / MODIFY / DROP, target 2-hour turnaround
- `[REJ]` for Reject Queue items under D-Reject â€” Senior Editor responds PURSUE-MANUAL / HOLD / DROP, daily scan + Friday sweep

The chat itself is the audit trail.

**Fallback:** dedicated Outlook email folder "Union Media Escalations" with the same prefix scheme and one-liner format if Teams integration becomes awkward.

**Reasoning:** Senior Editor uses Teams daily, works on iPhone and Mac, single chat keeps audit trail in one place. Two prefixes preserve the distinction between blocking pre-drafting decisions and queued post-triage decisions without splitting the channel.

**Implementation:** D0 Editorial Escalation Rule and D-Reject Queue both reference this channel and prefix scheme. F0 Orchestrator and F1 Triage agents publish messages to this channel under the correct prefix.

### K9. Outreach as a separate workstream â€” DEFERRED MEDIUM-TERM BUILD (NEW v2.2; cross-ref added v2.4)

**Cross-reference (added v2.4, appendix label updated v2.7):** When the outreach workstream is commissioned, the discovery half is already specified in **Appendix RR-C (Pathfinder)** â€” the deferred Stream (b) sister agent to Ranger Recon, originally numbered RR-3 in v2.4â€“v2.6 and renumbered v2.7 to avoid collision with the new external Appendix RR-3 (Layer 3 cross-reference outlets). Pathfinder identifies candidates that require outreach (the inverse of Ranger Recon's Stream (a) test) and feeds them into whatever outreach pipeline K9 builds. Pathfinder activation is tied to K9 commission; the two decisions move together.

**Decision (locked 17 May 2026):** Outreach is removed as an agentic function in v2.2. Stories requiring outreach (interview-led pieces, right-of-reply for Tier 2 where the public record is one-sided, single-source verification) route to the Reject Queue for editor decision. In the short term, editors decide manually whether to pursue outreach outside the agent pipeline. In the medium term, a separate outreach workstream will be designed and built â€” editor-triggered, opportunity-driven, sitting alongside the agent pipeline rather than inside it. Build trigger: agentic core stable across all five titles.

**Senior Editor's reasoning:** "I want the safest possible agentic process that will give us a steady flow of good quality content with minimal risk. Once we have done this for Silicon we will build the same system for the other titles. We have four editors. These processes will free up time for them to focus on value-add outreach where the opportunity arises."

**Reasoning (operational):** Agent-driven outreach is the highest-failure-mode activity in agent pipelines â€” relationship damage on the contact side, response decay on the tracking side, fabrication risk on transcript handoff, contacts-register drift on the storage side. Removing it removes the highest-risk surface area in one move. The editor team has the human capacity (four editors across five titles) to handle outreach as a discretionary, value-add activity rather than a routine pipeline function. Outreach becomes a way editors differentiate Union Media output from competitors, not a chore the agents handle.

**Implementation:** F4 Outreach Agent deleted. F1 Triage routes Tier 2 (no public reply) and single-source to Reject Queue. F6 Reviewer adds H11 defamation gate. Option 4 production option removed from agent pipeline. Stage 4 of the process map (outreach) removed. Appendix prompts P3-P6 removed. Contacts/CRM register (A5) status updated to "lightly maintained". Standing actions for the standalone outreach workstream are not opened until the agentic core is stable across all five titles.

---

## Appendix â€” Perplexity Prompts

The v2.2 pipeline retains two of the v2.1 appendix prompts. P3, P4, P5, and P6 (Option 4 question generation, Option 4 follow-up, SSP question generation, SSP outreach email template) are removed because the underlying activities are no longer agent functions.

### P1. Option 2 prompt â€” AI Rewrite from press release

```
You are an Option 2 Rewrite Agent for Union Media's [TITLE NAME].

Take the following press release as your only source. Produce a clean news article in [TITLE NAME] house style:
- 500-700 words, default 500
- Inverted pyramid structure
- Lead under 50 words: who, what, where, when, why
- Preserve every direct quote EXACTLY as written in the source â€” no paraphrasing, no sub-editing of quotes
- Apply British house style to writer-voice prose only, never to verbatim quotes
- Spell out one to nine, numerals for 10+
- Â£ amounts in figures (Â£4.5 million)
- No Oxford comma
- Universities and institutions in full on first mention
- Numbers in writer voice: spell out below 10
- Dates: Monday 13 April 2026 (no ordinal suffixes)
- No internal links â€” those come later
- No editorial framing or context not present in the source â€” that's Option 3 territory
- Append three headline options at the top: (1) descriptive, (2) narrative, (3) numbers-led â€” each â‰¤ 90 characters

PRESS RELEASE SOURCE:
[paste here]

OUTPUT: 3 headlines + standfirst (30-50 words) + body (500-700 words) + a NOT-FOR-PUBLICATION footer with: source URL, source date, quote count, word count, defamation tier (default Tier 1 â€” flag for re-classification if any criticism or negative framing emerges).
```

### P2. Framing-brief prompt â€” REWRITTEN v2.6 (replaces P2 "Option 3 Value Added Journalistic angle")

```
You are the Framing Agent for Silicon Scotland â€” a sub-prompt of F1 Triage that writes the framing brief for a given candidate.

Take the following press release or candidate source. Your job is to write a complete framing brief in the three-axis model (Geographic tier Ã— Category tags Ã— Primary frame) plus a Scottish anchor and a 2-3-sentence per-story brief.

The six Primary frames (pick ONE):
- Scottish Context â€” what this means specifically for Scotland: jobs, investment, sector impact, named operators
- Wider Sector Picture â€” where this sits in the UK or global sector picture, what trend it's part of
- Technical or Scientific Depth â€” what the technology, science or method actually is
- Policy and Regulation â€” the policy, regulation, public-funding or regulatory-body context
- Human Impact â€” real-world impact on workers, consumers, citizens, patients, students or operators on the ground
- Comparison or Data Point â€” anchor on a credible comparator or a single compelling statistic from a public source

The Geographic tiers (pick ONE):
- Scottish-origin â€” story breaks from a Scottish company, university, agency, regulator or event
- UK-origin â€” story breaks from a UK source outside Scotland (find the Scottish hook)
- Global-origin â€” story breaks internationally (anchor the Scottish stake)

The Category taxonomy (pick UP TO THREE, primary first):
AI Â· Cyber Â· Fintech Â· Biotech Â· Space Â· Robotics Â· Games Â· IT Â· Science Â· HealthTech Â· EdTech Â· CleanTech / Renewables Â· Quantum Â· Semiconductor Â· GovTech Â· Data / Analytics

PRESS RELEASE / CANDIDATE:
[paste here]

OUTPUT FORMAT (exact):

FRAMING BRIEF â€” <article-id>
Geographic tier:    Scottish-origin | UK-origin | Global-origin
Category tags:      <primary>, <secondary>, <tertiary>   (up to 3)
Primary frame:      <one of the six>
Scottish anchor:    <named company / institution / regulator / market / person>
Per-story brief:    <2-3 sentences telling the Writer what to lead with, what to subordinate, and what the central point of the piece is>

DISQUALIFICATION:
If no credible Primary frame can be constructed against any of the six â€” i.e. there is no identifiable tech, science, digital, AI, cyber, data, biotech or research angle that makes this a Silicon Scotland story â€” return DISQUALIFIED with reason "No identifiable tech angle (Tech Lens applied)". Do not stretch a frame to fit a press release that doesn't belong in Silicon Scotland.

If the press release contains any material that would trigger Tier 2 or Tier 3 classification (criticism of named parties, allegations, disputes), flag this in the output for the Triage agent to handle defamation tiering. The framing brief itself does not select critical / sceptical substance â€” those frames (Contrarian View, Track Record Check) are deferred to the post-Phase-1 deeper-journalism workstream; D0 Editorial Escalation Rule continues to handle critical / negative substance separately.
```

---

**END OF DOCUMENT v2.6**

Next revision triggers:
- New house rule established in editorial session â†’ Section A6 update + relevant prompt revision
- Pipeline build surfaces a process gap â†’ relevant agent prompt + section update
- Audit failure pattern recurs across multiple articles â†’ C-section or D-Tiers gate strengthened
- New title onboarded â†’ Section G5 cross-pub queue updated; per-title config added
- Intake automation layer scoped â†’ Section H4 expanded into operational sub-section
- April Automation Review Points 1 and 2 reopened â†’ Section H5 resolved
- Defamation framework stress-tested in production â†’ Section D updated with operating evidence
- Corrections Register entry triggers a process learning â†’ Section I Stages 10-13 updated
- Standalone outreach workstream scoped â†’ K9 reopened, new section drafted, A5 status changed

