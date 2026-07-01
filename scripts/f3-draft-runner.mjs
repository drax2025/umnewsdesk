#!/usr/bin/env node
// @ts-check
/**
 * F3 Initial Draft — agent runner spike.
 *
 * Proof-of-concept "execution layer" for one pipeline stage. It finds articles
 * sitting in the `commissioned` state, asks Claude to produce an F3 Initial
 * Draft (three headline options + standfirst + body), and — only with --commit
 * — writes that draft back exactly the way the F3 UI actions do:
 *   • articles.headline_options  (jsonb, 3 × {text, rationale, char_count})
 *   • articles.standfirst, articles.body
 *   • a new article_revisions row (so the write history is preserved)
 *
 * IMPORTANT DESIGN CHOICES (read before extending):
 *   • DRY RUN BY DEFAULT. Nothing is written unless you pass --commit.
 *   • The article is LEFT IN `commissioned`. This runner never advances state.
 *     A human still reviews the draft and files it (commissioned → filed) via
 *     the normal UI. Output is a draft, not a publish — zero new risk surface.
 *   • SIGNAL-ONLY GUARDRAIL. If the originating discovery source is flagged
 *     `signal_only_eligible`, the runner REFUSES to draft (awareness-only
 *     sources are not a drafting basis). Mirrors the inbox badge.
 *   • Uses the Supabase SERVICE ROLE key (bypasses RLS) because it runs outside
 *     a request. Treat this script as a privileged batch job.
 *
 * TWO GENERATION BACKENDS (--via):
 *   --via=cli  (default)  Shells out to the local `claude` CLI in headless mode.
 *                         Reuses whatever auth the CLI is logged in with (e.g. a
 *                         Pro/Max subscription) — NO API key, no extra API
 *                         billing. Depends on the `claude` binary being on PATH.
 *                         Good for running this by hand today.
 *   --via=api             Calls the Anthropic API directly via @anthropic-ai/sdk.
 *                         Needs ANTHROPIC_API_KEY (API-console billed). No CLI
 *                         dependency. This is the right choice for an unattended
 *                         production batch job (cron/server).
 *
 * ENV (loaded via `node --env-file=.env.local`, or export them yourself):
 *   NEXT_PUBLIC_SUPABASE_URL       (present in .env.local)
 *   SUPABASE_SERVICE_ROLE_KEY      (present in .env.local)
 *   ANTHROPIC_API_KEY              (only for --via=api; NOT in .env.local)
 *   ANTHROPIC_MODEL                (optional model override for either backend)
 *
 * USAGE:
 *   npm run f3:draft                 # dry-run via CLI, oldest 1 needing a draft
 *   npm run f3:draft -- --limit=3    # dry-run via CLI, oldest 3
 *   npm run f3:draft -- --id=<uuid>  # dry-run via CLI, one specific article
 *   npm run f3:draft -- --id=<uuid> --commit          # write it (CLI backend)
 *   npm run f3:draft -- --via=api --id=<uuid> --commit # write it (API backend)
 *   npm run f3:draft -- --id=<uuid> --force           # redraft even if it has one
 *   npm run f3:draft -- --model=opus --id=<uuid>
 */

import { execFile } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

/* -------------------------------------------------------------------------- */
/*  F3 spec constants (kept in sync with src/lib/spec/f3-headlines.ts)         */
/* -------------------------------------------------------------------------- */
const MAX_HEADLINE_OPTIONS = 3;
const HEADLINE_CHAR_SOFT_CAP = 90;
const DEFAULT_MODEL = "claude-sonnet-4-5";

/* -------------------------------------------------------------------------- */
/*  Arg parsing                                                                */
/* -------------------------------------------------------------------------- */
function parseArgs(argv) {
  const out = { commit: false, force: false, limit: 1, id: null, model: null, via: "cli", help: false };
  for (const a of argv) {
    if (a === "--commit") out.commit = true;
    else if (a === "--force") out.force = true;
    else if (a === "--help" || a === "-h") out.help = true;
    else if (a.startsWith("--limit=")) out.limit = Math.max(1, Number(a.slice(8)) || 1);
    else if (a.startsWith("--id=")) out.id = a.slice(5).trim() || null;
    else if (a.startsWith("--model=")) out.model = a.slice(8).trim() || null;
    else if (a.startsWith("--via=")) out.via = a.slice(6).trim().toLowerCase();
  }
  return out;
}

const HELP = `F3 Initial Draft — agent runner (spike)

  node --env-file=.env.local scripts/f3-draft-runner.mjs [options]

Options:
  --via=<cli|api> Generation backend. cli (default) uses the local claude CLI
                  (subscription auth, no API key). api uses ANTHROPIC_API_KEY.
  --id=<uuid>     Target one specific article (else: oldest commissioned needing a draft)
  --limit=<n>     Draft up to n articles (ignored when --id is set). Default 1.
  --commit        Actually write the draft. Without this it's a DRY RUN.
  --force         Draft even if the article already has headline_options/body.
  --model=<name>  Override model (via=api default ${DEFAULT_MODEL}; via=cli uses
                  the CLI default unless set). Or set $ANTHROPIC_MODEL.
  -h, --help      Show this help.

Env required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
  (+ ANTHROPIC_API_KEY when --via=api)`;

/* -------------------------------------------------------------------------- */
/*  Small helpers                                                              */
/* -------------------------------------------------------------------------- */
function die(msg) {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

function needsDraft(article) {
  const hasBody = typeof article.body === "string" && article.body.trim().length > 0;
  const opts = Array.isArray(article.headline_options) ? article.headline_options : [];
  const hasOptions = opts.some((o) => o && typeof o.text === "string" && o.text.trim());
  return !(hasBody && hasOptions);
}

/** Pull the useful story context out of a candidate row's freeform `raw` blob. */
function candidateContext(candidate) {
  if (!candidate) return "(no originating candidate found)";
  const raw = candidate.raw && typeof candidate.raw === "object" ? candidate.raw : {};
  const bits = [];
  if (candidate.working_headline) bits.push(`Working headline: ${candidate.working_headline}`);
  if (candidate.primary_url) bits.push(`Primary source URL: ${candidate.primary_url}`);
  if (candidate.framing_brief) bits.push(`Framing brief: ${candidate.framing_brief}`);
  // Best-effort scrape of common raw fields without assuming a rigid shape.
  for (const key of ["title", "summary", "description", "content", "body", "snippet", "lead"]) {
    const v = raw[key];
    if (typeof v === "string" && v.trim()) bits.push(`${key}: ${v.trim().slice(0, 2000)}`);
  }
  return bits.length ? bits.join("\n") : "(candidate has no usable text context)";
}

/* -------------------------------------------------------------------------- */
/*  Anthropic call — forced tool-use for a strict JSON shape                   */
/* -------------------------------------------------------------------------- */
const DRAFT_TOOL = {
  name: "submit_f3_draft",
  description: "Submit the F3 Initial Draft for the commissioned article.",
  input_schema: {
    type: "object",
    properties: {
      headline_options: {
        type: "array",
        minItems: MAX_HEADLINE_OPTIONS,
        maxItems: MAX_HEADLINE_OPTIONS,
        description: `Exactly ${MAX_HEADLINE_OPTIONS} distinct headline options, each ≤ ${HEADLINE_CHAR_SOFT_CAP} characters.`,
        items: {
          type: "object",
          properties: {
            text: { type: "string", description: `Headline, ≤ ${HEADLINE_CHAR_SOFT_CAP} chars.` },
            rationale: { type: "string", description: "One line: why this headline works." },
          },
          required: ["text", "rationale"],
        },
      },
      standfirst: {
        type: "string",
        description: "A 1–2 sentence standfirst / dek that sits under the headline.",
      },
      body_markdown: {
        type: "string",
        description: "The article body as Markdown. A complete first draft.",
      },
    },
    required: ["headline_options", "standfirst", "body_markdown"],
  },
};

function buildSystemPrompt() {
  return [
    "You are the F3 Initial Draft agent in an editorial newsroom pipeline.",
    "You write a first-pass draft for a commissioned article: three headline",
    "options, a standfirst, and a full body in Markdown.",
    `Each headline must be a distinct angle and stay at or under ${HEADLINE_CHAR_SOFT_CAP} characters.`,
    "Headlines may lean engaging/click-worthy but must be accurate and not misleading.",
    "The body is a first draft for a human editor to refine — be factual, do not",
    "invent quotes or statistics that aren't supported by the provided context, and",
    "flag anything you had to assume.",
  ].join(" ");
}

function buildUserPrompt(article, candidate) {
  return [
    `Commissioned article headline (working): ${article.headline || "(none yet)"}`,
    article.standfirst ? `Existing standfirst: ${article.standfirst}` : null,
    "",
    "Originating discovery candidate context:",
    candidateContext(candidate),
  ]
    .filter(Boolean)
    .join("\n");
}

/** API backend — forced tool-use guarantees the exact JSON shape. */
async function generateDraftViaApi(client, model, article, candidate) {
  const resp = await client.messages.create({
    model,
    max_tokens: 4096,
    system: buildSystemPrompt() + " Submit via the submit_f3_draft tool only.",
    tools: [DRAFT_TOOL],
    tool_choice: { type: "tool", name: "submit_f3_draft" },
    messages: [{ role: "user", content: buildUserPrompt(article, candidate) }],
  });
  const block = resp.content.find((b) => b.type === "tool_use");
  if (!block) die("Model did not return a tool_use block.");
  return { input: block.input, usage: resp.usage };
}

/**
 * CLI backend — shells out to `claude -p` with --json-schema for structured
 * output. Reuses the CLI's own auth (no API key). Returns the same shape as the
 * API backend so the caller doesn't care which was used.
 */
async function generateDraftViaCli(model, article, candidate) {
  const cliArgs = [
    "-p",
    buildUserPrompt(article, candidate),
    "--output-format",
    "json",
    "--json-schema",
    JSON.stringify(DRAFT_TOOL.input_schema),
    "--system-prompt",
    buildSystemPrompt(),
    ...(model ? ["--model", model] : []),
  ];

  const stdout = await new Promise((resolve, reject) => {
    execFile("claude", cliArgs, { maxBuffer: 32 * 1024 * 1024 }, (err, out, errOut) => {
      if (err) {
        if (err.code === "ENOENT") {
          reject(new Error("`claude` CLI not found on PATH. Install it or use --via=api."));
        } else {
          reject(new Error(`claude CLI failed: ${errOut || err.message}`));
        }
        return;
      }
      resolve(out);
    });
  });

  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    die(`Could not parse claude CLI output as JSON:\n${String(stdout).slice(0, 500)}`);
  }
  if (parsed.is_error) die(`claude CLI reported an error: ${parsed.result ?? "(no detail)"}`);
  const input = parsed.structured_output;
  if (!input) die("claude CLI returned no structured_output (schema not satisfied).");
  return {
    input,
    usage: {
      input_tokens: parsed.usage?.input_tokens,
      output_tokens: parsed.usage?.output_tokens,
    },
  };
}

/* -------------------------------------------------------------------------- */
/*  Write-back (mirrors saveHeadlineOptions + saveArticleDraft)                */
/* -------------------------------------------------------------------------- */
async function nextRevisionNo(supabase, articleId) {
  const { data } = await supabase
    .from("article_revisions")
    .select("revision_no")
    .eq("article_id", articleId)
    .order("revision_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.revision_no ?? 0) + 1;
}

async function commitDraft(supabase, article, draft) {
  const options = (draft.headline_options ?? []).slice(0, MAX_HEADLINE_OPTIONS).map((o) => ({
    text: String(o.text ?? "").trim(),
    rationale: String(o.rationale ?? "").trim(),
    char_count: String(o.text ?? "").trim().length,
  }));
  const headline = options[0]?.text || article.headline || "";
  const standfirst = String(draft.standfirst ?? "").trim() || null;
  const body = String(draft.body_markdown ?? "").trim() || null;

  const { error: upErr } = await supabase
    .from("articles")
    .update({ headline, standfirst, body, headline_options: options })
    .eq("id", article.id);
  if (upErr) die(`Failed to update article: ${upErr.message}`);

  const revNo = await nextRevisionNo(supabase, article.id);
  const { error: revErr } = await supabase.from("article_revisions").insert({
    article_id: article.id,
    revision_no: revNo,
    headline,
    standfirst,
    body,
    summary: "F3 Initial Draft (agent runner)",
  });
  if (revErr) die(`Failed to insert revision: ${revErr.message}`);

  return { revNo, headline };
}

/* -------------------------------------------------------------------------- */
/*  Main                                                                       */
/* -------------------------------------------------------------------------- */
async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(HELP);
    return;
  }

  if (args.via !== "cli" && args.via !== "api") {
    die(`Unknown --via=${args.via}. Use --via=cli or --via=api.`);
  }

  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  // API backend defaults to a known model; CLI backend uses its own default
  // unless the user explicitly overrides it.
  const model =
    args.model ||
    process.env.ANTHROPIC_MODEL ||
    (args.via === "api" ? DEFAULT_MODEL : null);

  if (!SUPABASE_URL || !SERVICE_KEY) die("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.");

  let anthropic = null;
  if (args.via === "api") {
    if (!ANTHROPIC_KEY) {
      die(
        "Missing ANTHROPIC_API_KEY (required for --via=api). It is not in\n" +
          "  .env.local — add it there (ANTHROPIC_API_KEY=sk-ant-...) or export it,\n" +
          "  or run with --via=cli to use the local claude CLI instead.",
      );
    }
    anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });

  console.log(
    `\nF3 draft runner — ${args.commit ? "COMMIT" : "DRY RUN"} · via ${args.via} · model ${model ?? "(cli default)"}\n`,
  );

  // 1. Select target articles.
  let query = supabase
    .from("articles")
    .select("id, title_id, headline, standfirst, body, state, headline_options, created_at")
    .eq("state", "commissioned")
    .order("created_at", { ascending: true });
  if (args.id) query = query.eq("id", args.id);
  else query = query.limit(Math.max(args.limit * 4, 8)); // over-fetch, filter below

  const { data: articles, error } = await query;
  if (error) die(`Query failed: ${error.message}`);
  if (!articles || articles.length === 0) die("No commissioned articles found.");

  const candidates = args.force ? articles : articles.filter(needsDraft);
  const targets = args.id ? candidates : candidates.slice(0, args.limit);
  if (targets.length === 0) {
    console.log("Nothing to do — all commissioned articles already have a draft (use --force to redraft).\n");
    return;
  }

  let done = 0;
  for (const article of targets) {
    console.log(`── ${article.id}`);
    console.log(`   working headline: ${article.headline || "(none)"}`);

    // 2. Resolve commission → candidate → source; enforce signal-only guardrail.
    const { data: comm } = await supabase
      .from("commissions")
      .select("candidate_id")
      .eq("article_id", article.id)
      .maybeSingle();

    let candidate = null;
    if (comm?.candidate_id) {
      const { data: cand } = await supabase
        .from("candidates")
        .select("working_headline, primary_url, framing_brief, raw, source_id")
        .eq("id", comm.candidate_id)
        .maybeSingle();
      candidate = cand ?? null;

      if (candidate?.source_id) {
        const { data: src } = await supabase
          .from("discovery_sources")
          .select("name, signal_only_eligible")
          .eq("id", candidate.source_id)
          .maybeSingle();
        if (src?.signal_only_eligible) {
          console.log(
            `   ⚠ SKIPPED — source "${src.name}" is signal-only (awareness only, not a drafting basis).\n`,
          );
          continue;
        }
      }
    }

    // 3. Generate (backend chosen by --via).
    console.log("   generating…");
    const { input: draft, usage } =
      args.via === "api"
        ? await generateDraftViaApi(anthropic, model, article, candidate)
        : await generateDraftViaCli(model, article, candidate);

    // 4. Report / write.
    console.log(`   → ${draft.headline_options?.length ?? 0} headline options:`);
    for (const o of draft.headline_options ?? []) {
      const len = String(o.text ?? "").length;
      const flag = len > HEADLINE_CHAR_SOFT_CAP ? ` ⚠${len}c` : ` (${len}c)`;
      console.log(`      • ${o.text}${flag}`);
    }
    console.log(`   → standfirst: ${draft.standfirst}`);
    console.log(`   → body: ${String(draft.body_markdown ?? "").length} chars`);
    console.log(`   tokens: in ${usage?.input_tokens ?? "?"} / out ${usage?.output_tokens ?? "?"}`);

    if (args.commit) {
      const { revNo, headline } = await commitDraft(supabase, article, draft);
      console.log(`   ✓ written — revision ${revNo}, headline "${headline}". State left at 'commissioned' for human review.`);
    } else {
      console.log("   (dry run — nothing written; pass --commit to persist)");
    }
    console.log("");
    done++;
  }

  console.log(`Done. ${done} article(s) ${args.commit ? "drafted + written" : "previewed"}.\n`);
}

main().catch((e) => die(e?.stack || String(e)));
