/**
 * Inbox triage — ported from Newsroom V1 unchanged in behaviour.
 *
 * V1 ran this against real traffic for a week and the rules carry the scars:
 * the narrow HIGH_VALUE list exists because "partnership" once matched an
 * agency's own signature, and `looksLikeAgency` exists because the first
 * preview missed every `…pr.co.uk` sender. Porting it rather than rewriting it
 * keeps that tuning; the alternative was rediscovering it on live mail.
 *
 * News Desk owns the mailbox now, so this is where the sorting happens. V1's
 * copy is removed in the same change — two triage jobs on one INBOX would race
 * exactly as the two pollers did.
 */

export type Category = "pr" | "link-builder" | "high-value" | "wire" | "unknown";

export interface TriageInput {
  fromEmail: string;
  fromName?: string;
  subject: string;
  /** First part of the body is plenty; the intent is always near the top. */
  bodySample: string;
  /** Set when the message is a forward from the desk itself. */
  forwardedByUs?: boolean;
  /**
   * Set when the newsroom sent this message — a digest landing back in the
   * mailbox it was sent from. Distinct from forwardedByUs, which means a person
   * here forwarded a release in.
   */
  sentByTheApp?: boolean;
}

export interface TriageDecision {
  category: Category;
  /** Null means leave it where it is. */
  moveTo: string | null;
  /** Why, in words, for the digest and for arguing with later. */
  reason: string;
}

export const FOLDERS = {
  pr: process.env.IMAP_FOLDER || "PR/To Process",
  linkBuilder: process.env.IMAP_FOLDER_LINK_BUILDERS || "New Commercial/Link Buiders",
  highValue: process.env.IMAP_FOLDER_HIGH_VALUE || "New Commercial/High Value",
};

/** Bulk distribution platforms. Left in the inbox until the volume is understood. */
const WIRE_SENDERS = [
  "prnewswire.com", "cisionone.com", "cision.com", "newsbywire.com",
  "gov.scot", "businesswire.com", "globenewswire.com", "presswire.com",
  "realwire.com", "sourcewire.com", "einpresswire.com", "accesswire.com",
  // Seen in the inbox during the first preview
  "mfn.se", "responsesource.com", "agilitypr.delivery", "mynewsdesk.com",
  "prweb.com", "notified.com", "pressat.co.uk",
];

/**
 * Money or media buying is on the table.
 *
 * Deliberately narrow. The first preview matched "partnership" against The Big
 * Partnership"s own signature and "banner" against email markup, filing two
 * press releases as commercial. Generic business words do not belong here —
 * only phrases that mean someone intends to spend money with us.
 */
const HIGH_VALUE_PHRASES = [
  "advertis", "sponsorship", "sponsoring", "sponsor a", "advertorial",
  "media pack", "rate card", "ratecard", "paid content", "paid post",
  "display ad", "newsletter placement", "insertion order", "book a slot",
  "marketing budget", "campaign budget", "commercial opportunit",
  "recruitment ad", "job advert", "promote our product", "promote our service",
];

/** Someone wants a link, usually for free or for very little. */
const LINK_BUILDER_PHRASES = [
  "guest post", "guest article", "backlink", "link building", "link-building",
  "link exchange", "link insertion", "niche edit", "do-follow", "dofollow",
  "anchor text", "domain authority", "da 50", "da50", "seo agency", "seo services",
  "improve your ranking", "boost your ranking", "collaborate on an article",
  "write for you", "contribute an article", "content collaboration",
  "add a link", "insert a link", "paid guest", "sponsored post opportunity",
];

/** Unambiguous on their own — one is enough, wherever it appears. */
const STRONG_RELEASE_MARKERS = [
  "press release", "for immediate release", "media release", "news release",
  "media alert", "notes to editors", "under embargo", "embargoed until",
  "photo caption", "media enquiries",
];

/** Suggestive, but only together — "launches" alone is just a word. */
const WEAK_RELEASE_MARKERS = [
  "announces", "announcement", "launches", "appoints", "appointment",
  "unveils", "reports record", "has been named", "wins contract",
  "for more information contact", "is available for interview",
];

/**
 * A public relations sender. Domains ending in "pr" or containing it as a word
 * are overwhelmingly agencies — paperchasepr, centropypr, cupidpr, engagepr —
 * and the first preview missed every one of them.
 */
const looksLikeAgency = (domain: string): boolean =>
  /(^|[.-])pr[.-]/.test(domain) || /pr\.(co\.uk|com|net|io|agency)$/.test(domain) ||
  /(comms|communications|publicrelations|mediagroup|pragency)/.test(domain);

const domainOf = (address: string): string =>
  String(address || "").split("@")[1]?.toLowerCase().trim() || "";

const hits = (haystack: string, needles: string[]): string[] =>
  needles.filter(n => haystack.includes(n));

export const triage = (input: TriageInput): TriageDecision => {
  const from = String(input.fromEmail || "").toLowerCase();
  const domain = domainOf(from);
  const text = `${input.subject || ""}\n${input.bodySample || ""}`.toLowerCase();

  // Our own automated mail. The digests are sent from the same address the
  // mailbox authenticates as, so without this they would be read as a forward
  // from the desk and ingested as a press release.
  if (input.sentByTheApp) {
    return { category: "unknown", moveTo: null, reason: "sent by the newsroom itself — left alone" };
  }

  // Anything the desk forwarded in is a release by definition — that is what
  // forwarding to this mailbox means.
  if (input.forwardedByUs) {
    return { category: "pr", moveTo: FOLDERS.pr, reason: "forwarded in by the desk" };
  }

  // Wire traffic first: it is bulk, and its releases would otherwise flood the
  // workflow. Left in the inbox by decision, not by accident.
  const wire = WIRE_SENDERS.find(w => domain === w || domain.endsWith("." + w));
  if (wire) {
    return { category: "wire", moveTo: null, reason: `wire service (${wire}) — left for manual review` };
  }

  // Commercial intent outranks press-release wording: a link builder dressing a
  // pitch up as a story is still a link builder.
  const money = hits(text, HIGH_VALUE_PHRASES);
  const links = hits(text, LINK_BUILDER_PHRASES);

  if (links.length && !money.length) {
    return { category: "link-builder", moveTo: FOLDERS.linkBuilder, reason: `outreach language: ${links.slice(0, 3).join(", ")}` };
  }
  if (money.length && !links.length) {
    return { category: "high-value", moveTo: FOLDERS.highValue, reason: `commercial intent: ${money.slice(0, 3).join(", ")}` };
  }
  if (money.length && links.length) {
    // Both present. Money decides, per the rule that budget takes precedence,
    // but say so plainly in the digest because these are the ones to check.
    return {
      category: "high-value",
      moveTo: FOLDERS.highValue,
      reason: `budget language (${money[0]}) alongside outreach language (${links[0]}) — money took precedence`,
    };
  }

  const strong = hits(text, STRONG_RELEASE_MARKERS);
  if (strong.length) {
    return { category: "pr", moveTo: FOLDERS.pr, reason: `release marker: ${strong.slice(0, 2).join(", ")}` };
  }

  const weak = hits(text, WEAK_RELEASE_MARKERS);
  if (looksLikeAgency(domain) && weak.length) {
    return { category: "pr", moveTo: FOLDERS.pr, reason: `agency sender (${domain}) with release wording: ${weak.slice(0, 2).join(", ")}` };
  }
  if (weak.length >= 2) {
    return { category: "pr", moveTo: FOLDERS.pr, reason: `release wording: ${weak.slice(0, 3).join(", ")}` };
  }

  return { category: "unknown", moveTo: null, reason: "no confident match — left in the inbox" };
};
