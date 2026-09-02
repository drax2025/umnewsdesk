# Silicon Scotland â€” House Rules

> **Historical — not the running system.**
> This document describes the V2 editorial pipeline (stages F1–F8: commissioning,
> drafting, sub-editing, legal, pre-flight, WordPress publishing), which was
> retired on 2 September 2026. News Desk now does discovery and hands selected
> candidates to Newsroom V1, which owns everything downstream. Kept as a record
> of what was built and why. See `PROJECT_NOTES.md` and `README.md` for the
> system as it stands.

**Version:** 1.0
**Effective:** 19 May 2026
**Owner:** Senior Editor, Union Media
**Source:** Distilled from `silicon_scotland_editorial_process_v3_0.md` Section B (B0â€“B11) and `silicon_scotland_appendix_rr1_layer1_corporate_newsrooms.md` / RR-2 / RR-3 / RR-4. Where this document and v3.0 disagree, **v3.0 governs**. This file is the daily-operator reference; v3.0 is the source of truth.

---

## 1. Identity and entity

- **Title:** Silicon Scotland (`siliconscotland.news`).
- **Operating company:** Union Media (trading name of Azzurro-Blu Limited, company number 09597161).
- **Registered office:** Solo House, The Courtyard, London Road, Horsham, RH12 1AT.
- **Senior Editor:** Alex Graham (`alex.graham@azzurro.agency`).
- **Editorial contact:** `editorial@unionmedia.news`.
- **Privacy contact:** `privacy@unionmedia.news`.
- **Editorial framework alignment:** **NUJ Code of Conduct only.** Silicon Scotland is **not** signed to IPSO or IMPRESS. No reference to IPSO or IMPRESS appears in any published artefact, footer, policy page or audit trail.

---

## 2. Communication preferences â€” Senior Editor standing rules

These bind every Computer-mediated draft, review, scheduled-task output, and operator dialogue under the Silicon Scotland pipeline.

### 2.1 Language to avoid

- **Honesty performatives:** never use "honestly," "frankly," "candidly," "to be honest." The honesty is assumed.
- **Filler intensifiers â€” use with care, default to deletion:** "clearly," "obviously," "of course," "genuinely," "really," "actually." If the sentence works without the word, the word does not belong.
- **Process euphemisms â€” banned outright:** never use "scrape," "scraping," "crawl," "crawling." Use "collect," "extract," "gather," "read," "fetch," "monitor."
- **Operational jargon â€” banned in operator-facing comms:** never say "cron." Use "scheduled task" or "recurring task."

### 2.2 Honesty and judgement posture

Verbatim from the Senior Editor:

> "Be honest at all times, or to put it away, as accurate as is reasonably possible, with a length of explanation that you feel is relevant to the seriousness of the issue."

> "I don't need you to agree with me. I need your opinion to allow me to analyse the issues."

> "In matters of risk, liability and threat to the business I encourage you to identify any potential risk."

Operating implications:

- Disagreement is the expected default when the evidence warrants it. Concurrence-without-reasoning is not useful and is treated as a failure mode.
- Explanation length scales with the seriousness of the issue, not with operator deference. A one-line answer to a defamation question is a fault.
- On risk, liability and reputational exposure, Computer surfaces the risk first and recommends second â€” even where the operator has not asked.

### 2.3 Decision verbs (Senior Editor at the human gate, F9)

The Senior Editor uses exactly four verbs in review:

- **APPROVE** â€” ship as drafted.
- **MODIFY** â€” ship with specified edits.
- **REJECT** â€” do not ship; reason recorded in the Failure Log.
- **SMELL** â€” something is wrong but I cannot yet name it; hold for Q2 critical-hat review. Pending decision Q2-2 (whether `SMELL` appears in `[PUB]` audit-trail lines) is open as at 19 May 2026.

---

## 3. The eleven standing rules â€” B0â€“B11 (operational summary)

What follows is a daily-operator distillation. The full text â€” including failure modes, worked examples, and tightened-v2.7 itemised lists â€” is in v3.0 Section B.

### B0. Three-option production ladder

Each story is routed to one of three production options:

| Option | Output | Conservative-mode default use |
|---|---|---|
| **1 â€” Direct Publish** | Press release published as received | Submitted content only; sense-check gate |
| **2 â€” AI Rewrite** | Clean article rewritten from source | Default for routine submitted content |
| **3 â€” Value-Added Journalistic** | Contextualised article with editorial framing | Default for sourced content with strong editorial angle |

- **Hard rule:** Option 1 never applies to sourced content. Sourced content starts at Option 2 minimum.
- **Hard rule:** Every Silicon Scotland article carries a framing brief (B9.2), regardless of option.
- **Hard rule:** Stories requiring outreach (interview-led pieces, right-of-reply on one-sided Tier 2 public record, single-source verification) **route to the Reject Queue**, not to a production option.
- Option 4 (Original Interview-Led) is **removed** from the agent pipeline. Editors may pursue interview-led pieces manually outside the pipeline at their discretion.

### B1. Verbatim audit (HARD GATE)

Substring-match every quoted paragraph against the Unicode-normalised primary source. Curly quotes â†’ straight; hyphen variants U+2010â€“U+2015 â†’ ASCII; non-breaking spaces â†’ space. MISMATCH stops publication. The audit caught Holyrood's silent sub-editing of the Stewart Miller LinkedIn post and paragraph-compression in L1 drafts. Non-negotiable on every published piece.

### B2. Source independence â€” signal-only outlets (TIGHTENED v2.7)

Three outlets are treated as signal-only:

- **DIGIT** (digit.fyi)
- **Futurescot** (futurescot.com)
- **Scottish Financial News** (scottishfinancialnews.com)

These outlets **must not appear** in any of the **seventeen** prohibited-use artefacts: article body, headline, standfirst, footer summary, source list, verbatim quote audit, interlink list, outbound link list, image attribution, image manifest, companion video script, social copy, Senior Editor Pre-Publish Review Pack (all ten sections), F9 Standing-Rule Compliance table B2 row content, `[PUB]` audit-trail line, `[ESC]` audit-trail line, and `[REJ]` / `[OPS-RR]` lines (with the two narrow OPS-RR / REJ exceptions in v3.0 B2 item 17).

The **only permitted reference** is a Ranger Recon gather-index pointer recording that the outlet flagged a story for independent first-instance verification (Layer 4 â€” see Appendix RR-4).

Substantive rule for all three: Union Media traces independently to a public-domain primary source. If no independent public-domain source exists, the story does not run. This is enforced as a hard gate at F2, F6 H7, F9 A3, F9 A10 (numeric-claim positive trace â€” new v2.7), and Ranger Recon Layer 4.

### B3. Multi-source attribution over single-source rewrites

Multi-source articles are richer, not merely safer. Re-sourcing the Stewart Miller piece to LinkedIn primary + Daily Business Group + Heriot-Watt statement made it independently defensible **and** introduced biographical material absent from the original outlet.

### B4. Interlinking â€” reader-first, no minimum, hard ceiling of three internal links

Locked 18 May 2026 by Senior Editor. Internal links are placed only where they support the article in a constructive and meaningful way. **No minimum, no target.** Zero internal links is a valid outcome.

**Hard ceiling: three internal links per article.** Density above three fragments mobile reading and dilutes per-link value signal.

Per-candidate placement test â€” all three must be YES, otherwise the link is not placed:

1. Does this link give the reader genuinely useful additional context they are likely to want?
2. Is the linked article topically and substantively related, not merely tag-overlapping?
3. Does the anchor text describe what the reader will find, in natural prose?

**Outbound links â€” separate rule:** 3â€“5 contextual outbound links per article to named institutions, funders, regulators and primary sources. Outbound links evidence the work and credit the source; the 3â€“5 range stands.

### B5. Backdating discipline

Friday-of-publication-week (or Friday-after for weekend events) gives a consistent timestamp pattern that reads as planned editorial cadence. Search engines weight publication date heavily; consistent Friday backdating creates a credible weekly rhythm.

**Backdating is prohibited for Tier 3 defamation-risk stories** that exceptionally proceed to production. Those publish with full transparency on the live publication date.

### B6. Three-headline generation

Writer agent produces three headline options per article â€” descriptive, narrative, numbers-led. Each â‰¤ 90 characters, each containing the institution/person and the most newsworthy specific. Editor agent picks autonomously per B6.1. The operator sees all three options plus the agent's choice and reasoning in the NOT-FOR-PUBLICATION footer and may override with a single keystroke.

### B6.1 Headline selection â€” click-bait-leaning

Standing instruction: *"Headline should be based on click-bait â€” most likely to attract human eyes for fresh content."*

**Click-bait-leaning means:** lean to narrative or numbers-led (B6 options 2 or 3) over descriptive default; lead with the most specific, concrete, attention-grabbing element (the Â£ amount, the world-first claim, the named individual, the surprising number, the contradiction); active voice and present tense; strong verbs (raises, quits, wins, loses, strips, builds) over weak ones (announces, launches, unveils).

**Hard limits â€” never crossed:**

- No misrepresentation of the story; headline must be factually defensible against the body.
- No vague teasers ("You won't believeâ€¦", "This Edinburgh startup just changed everythingâ€¦").
- No question headlines.
- No clickbait formulas that hide the news.
- No puns or wordplay that obscure the subject.
- **D0 Editorial Escalation stories â€” Senior Editor reviews the headline regardless of B6.1 policy.**

The trade-off: click-bait-leaning trades a small accuracy-of-tone risk for measurable engagement gain. The hard limits keep the accuracy floor non-negotiable. Operator override at publish time catches any agent error.

### B7. Pipeline-opportunity capture

The Earl Nightingale rule in practice. Capture 4â€“5 follow-up ideas per article in a structured ledger with category and priority. The 21-article batch generated 48 follow-up opportunities â€” a 2.3Ã— multiplier. Pipeline-opportunity capture is a required output of every F2 Researcher run, not an optional add-on.

### B8. NOT-FOR-PUBLICATION editorial notes footer

Appended to every draft. Costs the writer 60 seconds, saves the editor 10 minutes. Required fields: primary source URL, independent confirmation URLs, dependency note, audit result, backdate justification, Triage scorecard outcome, Production Option used, framing brief (Geographic tier, Category tags, Primary frame, Scottish anchor, per-story brief), defamation tier classification (Tier 1 / 2 / 3), M3 checklist outcome (Tier 2 only), word count, link inventory, video script.

### B9. Editorial frames â€” six, one Primary per story

Framing applies to **every** Silicon Scotland article, not Option 3 only. F1 Triage picks one Primary frame; F9 review confirms or modifies.

1. **Scottish Context** â€” what this news means specifically for Scotland.
2. **Wider Sector Picture** â€” where this news sits in UK or global sector trend.
3. **Technical or Scientific Depth** â€” what the technology or science actually is.
4. **Policy and Regulation** â€” policy, regulation, public-funding, regulatory-body context.
5. **Human Impact** â€” translation of corporate or technical news into real-world impact.
6. **Comparison or Data Point** â€” anchor on a credible comparator or single compelling statistic from a public source.

**No frame = no story.** If Triage cannot construct a credible primary frame against any of the six, the candidate is DISQUALIFIED under C0.

**No auto-escalation logic in B9.** D0 Editorial Escalation remains the trigger for critical/negative content, Tier 2 ambiguity, source contradiction and operator doubt.

### B9.1 Three-axis framing model

Every story carries three axes. Triage assigns all three; F9 confirms or modifies.

- **Axis 1 â€” Geographic tier:** Scottish-origin Â· UK-origin Â· Global-origin. Determines framing job, not story gating.
- **Axis 2 â€” Category tags (up to three, priority-ordered):** sixteen-tag fixed taxonomy â€” AI Â· Cyber Â· Fintech Â· Biotech Â· Space Â· Robotics Â· Games Â· IT Â· Science Â· HealthTech Â· EdTech Â· CleanTech / Renewables Â· Quantum Â· Semiconductor Â· GovTech Â· Data / Analytics.
- **Axis 3 â€” Editorial frame:** one of the six in B9.

Edge cases: closest fit plus free-text note; F9 handles at sign-off, no separate routing.

### B9.2 Framing brief

Triage hands F2 and F3 a five-field brief, not a bare tag:

```
FRAMING BRIEF â€” <article-id>

Geographic tier:    Scottish-origin | UK-origin | Global-origin
Category tags:      <primary>, <secondary>, <tertiary>
Primary frame:      <one of the six in B9>
Scottish anchor:    <named company / institution / regulator / market / person>
Per-story brief:    <2-3 sentences telling the Writer what to lead with,
                     what to subordinate, and what the central point is>
```

A bag of tags produces a press-release rewrite with a Scottish word stapled on. The brief forces Triage to commit to a specific construction.

### B10. Single-source handling

When a story appears on only one monitored outlet and no primary source can be traced â€” and the public-domain threshold is not met â€” the story does not proceed in the agent pipeline. It routes to the Reject Queue under one of two reasons, assigned at Triage:

- **"Single source â€” outreach candidate if desired."** Editorial merit exists; Senior Editor reviews in weekly sweep and decides PURSUE-MANUAL / HOLD / DROP.
- **"Single source â€” drop."** No editorial merit beyond the originating outlet's interest.

### B11. Operating platform and model configuration

**The agent pipeline operates inside Perplexity Computer with default model configuration.** Subagents spawned for each pipeline stage (F-RR, F1, F2, F3, F4, F5, F6, F9, F8) run on the platform's default model for whichever subagent type they map to. **No per-stage model overrides are applied in routine production.**

Rationale: risk minimisation (pinning to platform defaults closes nine independent variance vectors exposed by the SS-A01 incident); scaling discipline (single rule survives addition of new operators and titles without training overhead); quality is already high (marginal gain from deliberate per-stage selection is small relative to operational risk).

**Override path â€” experiments only, not routine production.** Per-run `model` parameter on the subagent call, recorded in Failure Log as *"Standing-rule check added late: B11 model-override applied â€” reason: <reason>"*.

**This rule binds Computer-based production only.** The v3.0 n8n-on-Claude implementation operated by a Union Media colleague is out of scope.

---

## 4. Operating posture (as at 19 May 2026)

- **Phase A.** Computer-mediated daily production. n8n-on-Claude in build for Phase B.
- **Search window:** 48 hours.
- **Cadence:** AM-only weekday sweep at 07:00 UK.
- **Pack cap:** three articles per pack, hard ceiling.
- **Interim output destination:** workspace files in `/home/user/workspace/` (naming convention `silicon_pub_YYYY-MM-DD_AM_packN.md`, `silicon_rec_YYYY-MM-DD_AM.md`, `silicon_ops_rr_YYYY-MM-DD.md`, `silicon_rej_YYYY-MM-DD.md`). First line of each file is the tag in square brackets â€” `[PUB]`, `[REC]`, `[OPS-RR]`, `[REJ]`. Teams reinstatement is a single-line edit per master prompt when the Microsoft Teams connector is restored.
- **Daily scheduled task** (Silicon daily F-RR sweep) and **monthly housekeeping task** (Union Media monthly housekeeping) are **not currently active.** They are to be recreated inside the new Silicon Scotland Space after cold-start verification.

---

## 5. Open Q2 critical-hat review items

Carried into the v3.0 operating window; not yet closed.

- **Q2-1.** Harness rigour after SS-A01. Pinned by B11 (Computer defaults).
- **Q2-2.** `SMELL` decision verb at `[PUB]`. Whether `SMELL` appears in the published audit-trail line, or only in pre-publish review, remains open. House Rules current default: `SMELL` is a pre-publish review verb only.

---

## 6. House style guide â€” TO BE AUTHORED

A formal Silicon Scotland house style guide does **not yet exist** as a standalone document. The Senior Editor has flagged this as a forthcoming authoring task.

**Until the formal style guide is published, the operative style rules are:**

1. The communication preferences in Section 2 of this document (avoid honesty performatives, watch filler intensifiers, banned euphemisms).
2. C4 author-register preservation for first-person sources (LinkedIn posts, blog posts, personally-written content) â€” preserve the author's exact spelling, capitalisation, and number style in verbatim quotes. Do **not** apply house style to first-person verbatim quotes.
3. Standard UK English spelling and punctuation outside verbatim quotes.
4. â‰¤ 90 characters for headlines (Google SERP truncation threshold).
5. 500â€“750 words per article (soft gate C6). If over, tighten ecosystem-context paragraphs only.

**Items to be addressed in the formal style guide when authored:**

- Number style (digits vs words; thresholds; currency formatting).
- Date format (`19 May 2026` vs `May 19, 2026` vs `2026-05-19`).
- Capitalisation conventions for sector terms (AI vs A.I.; HealthTech vs Health-Tech; CleanTech / Renewables canonical form).
- Treatment of acronyms on first use.
- Quote attribution placement (before, after, mid-sentence).
- Punctuation inside vs outside quotation marks.
- Use of Oxford comma.
- Italics policy (publication names, foreign-language terms, emphasis).
- Hyperlink anchor-text conventions (per B4 placement test).
- Image caption format and credit line format.
- Company-name and product-name capitalisation reference list.
- Treatment of LinkedIn post quotations vs press-release quotations.

This is the authoring backlog for the standalone Silicon Scotland Style Guide. It is **not** stub content â€” it is the explicit forward agenda flagged by the Senior Editor.

---

## 7. Where this document fits in the operating set

- **Master prompt:** `silicon_master_prompt_v1_0.md` â€” daily orchestration entry point. References this file and `config_siliconscotland.yaml` as required workspace files.
- **Ad-hoc prompt:** `silicon_adhoc_prompt_v1_0.md` â€” operator-initiated single-story production outside the daily sweep.
- **Operational spec:** `silicon_scotland_editorial_process_v3_0.md` â€” full editorial process, Sections Aâ€“N. Source of truth for all rules summarised here.
- **Skills library:** `union_media_skills_library_v1_0.md` â€” agent capability definitions used by the master and ad-hoc prompts.
- **Per-title config:** `config_siliconscotland.yaml` â€” values referenced by name in this document (sixteen-sector taxonomy, three geographic tiers, six editorial frames, B11 default-model rule, signal-only outlets, etc.).
- **Ranger Recon appendices:** `silicon_scotland_appendix_rr1_layer1_corporate_newsrooms.md` (Layer 1), `_rr2_layer2_institutional_press.md` (Layer 2), `_rr3_layer3_uk_national_cross_reference.md` (Layer 3), `_rr4_layer4_signal_only_outlets.md` (Layer 4).
- **Incident note:** `union_media_incident_note_ss_a01_18may2026.md` â€” SS-A01 incident record. The reason B11 is pinned to Computer defaults and the reason B2 was tightened v2.7.
- **Corrections and retractions:** `section_L_corrections_retractions.md`.
- **Link register:** `siliconscotland_content_inventory_master.docx` â€” 512 articles, seven silos.
- **Live-URL banner:** `silicon_all_urls.txt`.

---

**End of House Rules v1.0.**

