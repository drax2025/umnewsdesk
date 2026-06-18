/**
 * F7 Pre-Flight Pack renderer.
 *
 * Pure transformation: data bundle → markdown string. No I/O. The caller
 * (src/lib/actions/pack-render.ts) is responsible for loading the bundle
 * and writing the result to DB / disk.
 *
 * 13-section structure mandated by the pack-language doctrine:
 *
 *   §0  · Failure Log (cross-agent chronological)
 *   §1  · Article identity + tier + framing brief
 *   §2  · F2 Sources
 *   §3  · F2 Quote ledger
 *   §4  · F2 Verdict + NFP footer
 *   §5  · F5 Backdate selection
 *   §6  · F3 Headline options + selected
 *   §7  · F4 Interlinks
 *   §8  · Reasonable-Steps log (Tier 2 only — header present always)
 *   §9  · F6 Gate audit (H1-H11)
 *   §10 · Standing-Rule Compliance sweep
 *   §11 · F7 Active checks (A1-A10)
 *   §12 · F8 Final artefact sweep + publish log + senior verdict
 *   §13 · Stage 13 Corrections register (after publish)
 */

import type { FramingBrief } from "@/lib/spec/f1-triage";
import type {
  ArticleQuoteRow,
  ArticleResearchRow,
  ArticleSourceRow,
} from "@/lib/spec/f2-research";
import type { ArticleReviewRow } from "@/lib/spec/f6-review";
import type {
  ArticlePreFlightRow,
  PreFlightFailureRow,
} from "@/lib/spec/f7-pre-flight";
import type { ArticleStandingRuleSweepRow } from "@/lib/spec/f7-standing-rule";
import type {
  ArticleReasonableStepsRow,
} from "@/lib/spec/f7-reasonable-steps";
import type { ArticleFailureLogRow } from "@/lib/spec/failure-log";
import type {
  ArticleArtefactSweepRow,
  ArticlePublishLogRow,
} from "@/lib/spec/f8-publish";
import {
  CORRECTION_KINDS,
  CORRECTION_STATUSES,
  type ArticleCorrectionRow,
} from "@/lib/spec/stage13-corrections";
import { A_CHECKS } from "@/lib/spec/f7-pre-flight";
import { STANDING_RULES, statusForRule, justificationForRule } from "@/lib/spec/f7-standing-rule";
import {
  ARTEFACTS,
  normaliseSweepResults,
  PUBLISH_TARGET_LABEL,
  PUBLISH_STATUS_LABEL,
} from "@/lib/spec/f8-publish";
import {
  DEFENCES,
  REASONABLE_STEPS_FIELD_LABELS,
  summariseReasonableSteps,
} from "@/lib/spec/f7-reasonable-steps";
import { normaliseNFPFooter, NFP_FOOTER_FIELD_LABELS } from "@/lib/spec/nfp-footer";
import { FAILURE_LOG_EVENTS, FAILURE_LOG_STAGES } from "@/lib/spec/failure-log";

/* -------------------------------------------------------------------------- */
/*  Bundle shape                                                              */
/* -------------------------------------------------------------------------- */

export type ArticleBundle = {
  article: {
    id: string;
    headline: string;
    standfirst: string | null;
    body: string | null;
    slug: string | null;
    state: string;
    primary_frame: string | null;
    geo_tier: string | null;
    sectors: string[];
    published_at: string | null;
    backdate: string | null;
    backdate_kind: string | null;
    backdate_rationale: string | null;
    backdate_set_at: string | null;
  };
  defamation_tier: 1 | 2 | 3 | null;
  framing_brief: FramingBrief | null;
  sources: ArticleSourceRow[];
  quotes: ArticleQuoteRow[];
  research: (ArticleResearchRow & { nfp_footer_fields: unknown | null }) | null;
  headlines: { id?: string; text: string; selected?: boolean; rationale?: string | null }[];
  interlinks: {
    id: string;
    target_url: string;
    anchor_text: string;
    kind: "internal" | "outbound";
    notes: string | null;
  }[];
  review: ArticleReviewRow | null;
  preP: ArticlePreFlightRow | null;
  internal_failures: PreFlightFailureRow[];
  standing_rule: ArticleStandingRuleSweepRow | null;
  reasonable_steps: ArticleReasonableStepsRow | null;
  failure_log: ArticleFailureLogRow[];
  artefact_sweep: ArticleArtefactSweepRow | null;
  publish_log: ArticlePublishLogRow[];
  corrections: ArticleCorrectionRow[];
};

export type PackBundle = {
  pack_ref: string;
  rendered_at: string;
  rendered_by_name: string | null;
  origin_sweep_id: string | null;
  senior_verdict: string | null;
  senior_verdict_at: string | null;
  senior_verdict_by: string | null;
  senior_verdict_notes: string | null;
  articles: ArticleBundle[];
};

/* -------------------------------------------------------------------------- */
/*  Public entry point                                                        */
/* -------------------------------------------------------------------------- */

export function renderPackMarkdown(bundle: PackBundle): string {
  const lines: string[] = [];

  lines.push(`# Pre-Publish Pack · ${bundle.pack_ref}`);
  lines.push("");
  lines.push(`> Rendered at ${bundle.rendered_at}${bundle.rendered_by_name ? ` by ${bundle.rendered_by_name}` : ""}.`);
  if (bundle.origin_sweep_id) {
    lines.push(`> Origin sweep · \`${bundle.origin_sweep_id}\``);
  }
  if (bundle.senior_verdict) {
    lines.push(
      `> Admin verdict · **${bundle.senior_verdict.toUpperCase()}**${bundle.senior_verdict_at ? ` at ${bundle.senior_verdict_at}` : ""}`,
    );
  }
  lines.push("");
  lines.push(
    `**Pack contains ${bundle.articles.length} article${bundle.articles.length === 1 ? "" : "s"}.** Read pack §0 (cross-agent failure log) before the article body sections.`,
  );
  lines.push("");
  lines.push("---");
  lines.push("");

  bundle.articles.forEach((a, idx) => {
    if (bundle.articles.length > 1) {
      lines.push(`## Article ${idx + 1} of ${bundle.articles.length} · \`${a.article.id.slice(0, 8)}\``);
      lines.push("");
    }
    lines.push(...section0_FailureLog(a));
    lines.push(...section1_Identity(a));
    lines.push(...section2_Sources(a));
    lines.push(...section3_Quotes(a));
    lines.push(...section4_VerdictNFP(a));
    lines.push(...section5_Backdate(a));
    lines.push(...section6_Headlines(a));
    lines.push(...section7_Interlinks(a));
    lines.push(...section8_ReasonableSteps(a));
    lines.push(...section9_F6Gates(a));
    lines.push(...section10_StandingRule(a));
    lines.push(...section11_F7Checks(a));
    lines.push(...section12_PostPublish(a));
    lines.push(...section13_Corrections(a));
    lines.push("");
    lines.push("---");
    lines.push("");
  });

  if (bundle.senior_verdict_notes) {
    lines.push("## Admin verdict notes");
    lines.push("");
    lines.push(quoteBlock(bundle.senior_verdict_notes));
    lines.push("");
  }

  return lines.join("\n").trimEnd() + "\n";
}

/* -------------------------------------------------------------------------- */
/*  Section helpers                                                           */
/* -------------------------------------------------------------------------- */

function tierLabel(t: 1 | 2 | 3 | null): string {
  if (t === 1) return "Tier 1 · Reportage / public record";
  if (t === 2) return "Tier 2 · Reasonable steps required";
  if (t === 3) return "Tier 3 · Defamation risk / no backdate";
  return "Tier unset";
}

function dateOnly(iso: string | null): string {
  if (!iso) return "—";
  return iso.slice(0, 10);
}

function fmtTs(iso: string | null): string {
  if (!iso) return "—";
  return iso.replace("T", " ").slice(0, 19) + "Z";
}

function quoteBlock(s: string): string {
  return s
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
}

function bullet(label: string, value: string | null | undefined): string {
  return `- **${label}**: ${value ?? "—"}`;
}

function table(headers: string[], rows: (string | null)[][]): string[] {
  const out: string[] = [];
  out.push(`| ${headers.join(" | ")} |`);
  out.push(`| ${headers.map(() => "---").join(" | ")} |`);
  for (const r of rows) {
    out.push(`| ${r.map((c) => (c == null ? "—" : c.replace(/\|/g, "\\|").replace(/\n/g, " "))).join(" | ")} |`);
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/*  §0 · Cross-agent failure log                                              */
/* -------------------------------------------------------------------------- */

function section0_FailureLog(a: ArticleBundle): string[] {
  const out: string[] = ["### §0 · Failure Log (cross-agent)"];
  if (a.failure_log.length === 0) {
    out.push("");
    out.push("> Clean run — no failure events recorded across F1–F7.");
    out.push("");
    return out;
  }
  out.push("");
  const rows = a.failure_log.map((r) => {
    const stage = FAILURE_LOG_STAGES.find((s) => s.value === r.stage)?.label ?? r.stage;
    const event = FAILURE_LOG_EVENTS.find((e) => e.value === r.event)?.label ?? r.event;
    return [
      fmtTs(r.created_at),
      stage,
      event,
      r.gate_code ?? "",
      r.detail,
      r.override_applied ? `OVERRIDE: ${r.override_reason ?? ""}` : "",
    ];
  });
  out.push(...table(
    ["When", "Stage", "Event", "Gate", "Detail", "Override"],
    rows,
  ));
  out.push("");
  return out;
}

/* -------------------------------------------------------------------------- */
/*  §1 · Identity + framing brief                                             */
/* -------------------------------------------------------------------------- */

function section1_Identity(a: ArticleBundle): string[] {
  const out: string[] = ["### §1 · Identity + framing brief"];
  out.push("");
  out.push(bullet("Headline", a.article.headline));
  out.push(bullet("Standfirst", a.article.standfirst));
  out.push(bullet("Slug", a.article.slug));
  out.push(bullet("State", a.article.state));
  out.push(bullet("Defamation tier", tierLabel(a.defamation_tier)));
  out.push(bullet("Primary frame", a.article.primary_frame));
  out.push(bullet("Geo tier", a.article.geo_tier));
  out.push(bullet("Sectors", a.article.sectors.length ? a.article.sectors.join(", ") : null));
  out.push("");
  if (a.framing_brief) {
    out.push("**F1 framing brief**");
    out.push("");
    out.push(bullet("Geographic tier", a.framing_brief.geographic_tier));
    out.push(bullet("Primary frame", a.framing_brief.primary_frame));
    out.push(bullet("Category tags", a.framing_brief.category_tags?.join(", ") ?? null));
    out.push(bullet("Scottish anchor", a.framing_brief.scottish_anchor));
    if (a.framing_brief.per_story_brief) {
      out.push("");
      out.push("**Per-story brief**");
      out.push("");
      out.push(quoteBlock(a.framing_brief.per_story_brief));
    }
    out.push("");
  } else {
    out.push("> No F1 framing brief on file.");
    out.push("");
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/*  §2 · Sources                                                              */
/* -------------------------------------------------------------------------- */

function section2_Sources(a: ArticleBundle): string[] {
  const out: string[] = ["### §2 · F2 Source pack"];
  out.push("");
  if (a.sources.length === 0) {
    out.push("> No sources on file.");
    out.push("");
    return out;
  }
  const rows = a.sources.map((s) => [
    s.kind,
    s.title ?? s.url,
    s.publisher ?? "",
    dateOnly(s.published_at),
    s.is_signal_only ? "signal-only" : s.is_paywalled ? "paywall" : "",
    s.url,
  ]);
  out.push(...table(["Kind", "Title", "Publisher", "Date", "Notes", "URL"], rows));
  out.push("");
  return out;
}

/* -------------------------------------------------------------------------- */
/*  §3 · Quote ledger                                                         */
/* -------------------------------------------------------------------------- */

function section3_Quotes(a: ArticleBundle): string[] {
  const out: string[] = ["### §3 · F2 Verbatim quote ledger"];
  out.push("");
  if (a.quotes.length === 0) {
    out.push("> No verbatim quotes ledgered.");
    out.push("");
    return out;
  }
  for (const q of a.quotes) {
    const attribution = [q.speaker, q.role, q.institution].filter(Boolean).join(" · ");
    out.push(`> "${q.quote_text}"`);
    out.push(`> — ${attribution || "(speaker not set)"}`);
    out.push("");
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/*  §4 · F2 Verdict + NFP footer                                              */
/* -------------------------------------------------------------------------- */

function section4_VerdictNFP(a: ArticleBundle): string[] {
  const out: string[] = ["### §4 · F2 Verdict + NFP footer"];
  out.push("");
  if (a.research) {
    out.push(bullet("Framing feasibility", a.research.framing_feasibility));
    out.push(bullet("Feasibility evidence", a.research.feasibility_evidence));
    out.push(bullet("Dependency status", a.research.dependency_status));
    out.push(bullet("Primary paywalled", a.research.primary_paywalled ? "yes" : "no"));
    out.push(bullet("Verdict", a.research.verdict));
    out.push(bullet("Verdict at", fmtTs(a.research.verdict_at)));
    if (a.research.verdict_rationale) {
      out.push("");
      out.push("**Verdict rationale**");
      out.push("");
      out.push(quoteBlock(a.research.verdict_rationale));
    }
    if (a.research.nfp_footer_draft) {
      out.push("");
      out.push("**NFP footer · free-text draft**");
      out.push("");
      out.push(quoteBlock(a.research.nfp_footer_draft));
    }
  } else {
    out.push("> No F2 research record on file.");
  }
  out.push("");

  if (a.research?.nfp_footer_fields) {
    const fields = normaliseNFPFooter(a.research.nfp_footer_fields);
    out.push("**NFP footer · structured fields**");
    out.push("");
    for (const key of Object.keys(NFP_FOOTER_FIELD_LABELS) as (keyof typeof NFP_FOOTER_FIELD_LABELS)[]) {
      const label = NFP_FOOTER_FIELD_LABELS[key];
      const raw = (fields as Record<string, unknown>)[key];
      let display: string;
      if (Array.isArray(raw)) display = raw.length ? raw.map(String).join(" · ") : "—";
      else if (raw === null || raw === undefined || raw === "") display = "—";
      else display = String(raw);
      out.push(`- **${label}**: ${display}`);
    }
    out.push("");
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/*  §5 · Backdate                                                             */
/* -------------------------------------------------------------------------- */

function section5_Backdate(a: ArticleBundle): string[] {
  const out: string[] = ["### §5 · F5 Backdate selection"];
  out.push("");
  if (a.defamation_tier === 3) {
    out.push("> **Tier 3 · NO BACKDATE permitted.** Article appears at real publish time.");
    out.push("");
    return out;
  }
  out.push(bullet("Backdate", a.article.backdate));
  out.push(bullet("Rule kind", a.article.backdate_kind));
  out.push(bullet("Set at", fmtTs(a.article.backdate_set_at)));
  if (a.article.backdate_rationale) {
    out.push("");
    out.push("**Rationale**");
    out.push("");
    out.push(quoteBlock(a.article.backdate_rationale));
  }
  out.push("");
  return out;
}

/* -------------------------------------------------------------------------- */
/*  §6 · Headlines                                                            */
/* -------------------------------------------------------------------------- */

function section6_Headlines(a: ArticleBundle): string[] {
  const out: string[] = ["### §6 · F3 Headline options"];
  out.push("");
  if (a.headlines.length === 0) {
    out.push("> No headline options on file (B6.1 violation).");
    out.push("");
    return out;
  }
  for (const h of a.headlines) {
    out.push(`- ${h.selected ? "**[LIVE]** " : ""}${h.text}${h.rationale ? ` · _${h.rationale}_` : ""}`);
  }
  out.push("");
  return out;
}

/* -------------------------------------------------------------------------- */
/*  §7 · Interlinks                                                           */
/* -------------------------------------------------------------------------- */

function section7_Interlinks(a: ArticleBundle): string[] {
  const out: string[] = ["### §7 · F4 Interlinks"];
  out.push("");
  if (a.interlinks.length === 0) {
    out.push("> Zero interlinks — valid (B4 reader-first allows zero).");
    out.push("");
    return out;
  }
  const rows = a.interlinks.map((l) => [l.kind, l.anchor_text, l.target_url, l.notes ?? ""]);
  out.push(...table(["Kind", "Anchor", "Target", "Notes"], rows));
  out.push("");
  return out;
}

/* -------------------------------------------------------------------------- */
/*  §8 · Reasonable-steps log (Tier 2 only)                                   */
/* -------------------------------------------------------------------------- */

function section8_ReasonableSteps(a: ArticleBundle): string[] {
  const out: string[] = ["### §8 · Reasonable-steps log"];
  out.push("");
  if (a.defamation_tier !== 2) {
    out.push("> Not applicable — Tier 2 only.");
    out.push("");
    return out;
  }
  const summary = summariseReasonableSteps(a.reasonable_steps, a.defamation_tier);
  if (summary.status === "incomplete") {
    out.push(`> **INCOMPLETE** — missing: ${summary.missing.join(", ")}`);
    out.push("");
  } else if (summary.status === "complete") {
    out.push("> Complete.");
    out.push("");
  }
  const r = a.reasonable_steps;
  out.push(bullet(REASONABLE_STEPS_FIELD_LABELS.subjects_named, r?.subjects_named ?? null));
  out.push(bullet(REASONABLE_STEPS_FIELD_LABELS.public_record_response_url, r?.public_record_response_url ?? null));
  out.push(bullet(REASONABLE_STEPS_FIELD_LABELS.public_record_response_date, r?.public_record_response_date ?? null));
  const defLabel = DEFENCES.find((d) => d.value === r?.defence)?.label ?? r?.defence ?? null;
  out.push(bullet(REASONABLE_STEPS_FIELD_LABELS.defence, defLabel));
  out.push(bullet(REASONABLE_STEPS_FIELD_LABELS.defence_justification, r?.defence_justification ?? null));
  out.push(bullet(REASONABLE_STEPS_FIELD_LABELS.tier_classifier_name, r?.tier_classifier_name ?? null));
  out.push("");
  return out;
}

/* -------------------------------------------------------------------------- */
/*  §9 · F6 Gate audit                                                        */
/* -------------------------------------------------------------------------- */

function section9_F6Gates(a: ArticleBundle): string[] {
  const out: string[] = ["### §9 · F6 Gate audit (H1-H11)"];
  out.push("");
  if (!a.review) {
    out.push("> No F6 audit on file.");
    out.push("");
    return out;
  }
  const codes = ["H1", "H2", "H3", "H4", "H5", "H6", "H7", "H8", "H9", "H10", "H11"];
  const rows = codes.map((code) => {
    const k = code.toLowerCase();
    const r = a.review as unknown as Record<string, unknown>;
    return [
      code,
      String(r[`${k}_status`] ?? "—"),
      (r[`${k}_detail`] as string | undefined) ?? "",
    ];
  });
  out.push(...table(["Gate", "Status", "Detail"], rows));
  if (a.review.verdict) {
    out.push("");
    out.push(bullet("Verdict", a.review.verdict));
    out.push(bullet("Verdict at", fmtTs(a.review.verdict_at)));
    if (a.review.verdict_rationale) {
      out.push("");
      out.push(quoteBlock(a.review.verdict_rationale));
    }
  }
  out.push("");
  return out;
}

/* -------------------------------------------------------------------------- */
/*  §10 · Standing-rule sweep                                                 */
/* -------------------------------------------------------------------------- */

function section10_StandingRule(a: ArticleBundle): string[] {
  const out: string[] = ["### §10 · Standing-Rule Compliance sweep"];
  out.push("");
  const rows = STANDING_RULES.map((def) => {
    const status = statusForRule(a.standing_rule, def.code);
    const j = justificationForRule(a.standing_rule, def.code);
    return [def.code, status, j ?? ""];
  });
  out.push(...table(["Rule", "Status", "Justification"], rows));
  if (a.standing_rule?.b2_artefacts_swept) {
    out.push("");
    out.push("**B2 artefacts swept**");
    out.push("");
    out.push(quoteBlock(a.standing_rule.b2_artefacts_swept));
  }
  out.push("");
  return out;
}

/* -------------------------------------------------------------------------- */
/*  §11 · F7 Active checks                                                    */
/* -------------------------------------------------------------------------- */

function section11_F7Checks(a: ArticleBundle): string[] {
  const out: string[] = ["### §11 · F7 Active checks (A1-A10)"];
  out.push("");
  if (!a.preP) {
    out.push("> No F7 audit on file.");
    out.push("");
    return out;
  }
  const rows = A_CHECKS.map((c) => {
    const k = c.code.toLowerCase();
    const r = a.preP as unknown as Record<string, unknown>;
    return [
      c.code,
      String(r[`${k}_status`] ?? "—"),
      (r[`${k}_detail`] as string | undefined) ?? "",
    ];
  });
  out.push(...table(["Check", "Status", "Detail"], rows));
  if (a.preP.verdict) {
    out.push("");
    out.push(bullet("Verdict", a.preP.verdict));
    out.push(bullet("Verdict at", fmtTs(a.preP.verdict_at)));
    if (a.preP.verdict_rationale) {
      out.push("");
      out.push(quoteBlock(a.preP.verdict_rationale));
    }
  }
  if (a.internal_failures.length > 0) {
    out.push("");
    out.push("**F7 internal failure log**");
    out.push("");
    const rows2 = a.internal_failures.map((f) => [
      f.check_code,
      f.status,
      f.root_cause_agent ?? "",
      f.description,
      f.remediation ?? "",
    ]);
    out.push(...table(["Check", "Status", "Root cause", "Description", "Remediation"], rows2));
  }
  out.push("");
  return out;
}

/* -------------------------------------------------------------------------- */
/*  §12 · F8 sweep + publish log                                              */
/* -------------------------------------------------------------------------- */

function section12_PostPublish(a: ArticleBundle): string[] {
  const out: string[] = ["### §12 · F8 Final sweep + publish log"];
  out.push("");
  if (a.artefact_sweep) {
    const results = normaliseSweepResults(a.artefact_sweep.results);
    const rows = ARTEFACTS.map((def) => {
      const entry = results[def.code];
      return [def.code, entry?.status ?? "pending", entry?.note ?? ""];
    });
    out.push(...table(["Artefact", "Status", "Note"], rows));
  } else {
    out.push("> No artefact sweep on file.");
  }
  out.push("");
  if (a.publish_log.length === 0) {
    out.push("> No publish attempts logged.");
    out.push("");
    return out;
  }
  out.push("**Publish history**");
  out.push("");
  const logRows = a.publish_log.map((l) => [
    fmtTs(l.attempted_at),
    PUBLISH_TARGET_LABEL[l.target],
    PUBLISH_STATUS_LABEL[l.status],
    l.external_url ?? "",
    l.error ?? "",
  ]);
  out.push(...table(["Attempted", "Target", "Status", "URL", "Error"], logRows));
  out.push("");
  return out;
}

/* -------------------------------------------------------------------------- */
/*  §13 · Stage 13 Corrections register                                       */
/* -------------------------------------------------------------------------- */

function section13_Corrections(a: ArticleBundle): string[] {
  const out: string[] = ["### §13 · Stage 13 Corrections register"];
  out.push("");
  if (a.corrections.length === 0) {
    out.push(
      "> Clean post-publication — no corrections, clarifications, updates, or retractions filed.",
    );
    out.push("");
    return out;
  }
  // Sort sequence asc so the trail reads chronologically.
  const sorted = [...a.corrections].sort((x, y) => x.sequence - y.sequence);
  const kindLabel = (k: string) =>
    CORRECTION_KINDS.find((d) => d.value === k)?.short ?? k.toUpperCase();
  const statusLabel = (s: string) =>
    CORRECTION_STATUSES.find((d) => d.value === s)?.short ?? s.toUpperCase();
  const rows = sorted.map((c) => [
    `#${c.sequence}`,
    kindLabel(c.kind),
    statusLabel(c.status),
    fmtTs(c.filed_at),
    fmtTs(c.approved_at),
    c.description.replace(/\n/g, " ").slice(0, 240),
  ]);
  out.push(
    ...table(
      ["Seq", "Kind", "Status", "Filed", "Approved", "Description"],
      rows,
    ),
  );
  out.push("");
  out.push("**Public notices appended to the live article**");
  out.push("");
  const approved = sorted.filter((c) => c.status === "approved");
  if (approved.length === 0) {
    out.push(
      "> No approved corrections — no public notice appears on the article footer.",
    );
    out.push("");
    return out;
  }
  for (const c of approved) {
    out.push(`**#${c.sequence} · ${kindLabel(c.kind)}**`);
    out.push("");
    out.push(quoteBlock(c.public_notice));
    if (c.source) {
      out.push("");
      out.push(`_Source: ${c.source}_`);
    }
    out.push("");
  }
  // Withdrawn entries are still part of the audit even though they don't
  // render to the public.
  const withdrawn = sorted.filter((c) => c.status === "withdrawn");
  if (withdrawn.length > 0) {
    out.push("**Withdrawn (audit only — not on reader-facing surface)**");
    out.push("");
    for (const c of withdrawn) {
      out.push(
        `- #${c.sequence} ${kindLabel(c.kind)} · withdrawn ${fmtTs(c.withdrawn_at)}${c.withdrawn_reason ? ` · ${c.withdrawn_reason}` : ""}`,
      );
    }
    out.push("");
  }
  return out;
}
