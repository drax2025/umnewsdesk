/**
 * Our own domains.
 *
 * Triage uses this to spot a release the desk forwarded in; CRM sync uses it to
 * make sure we never file ourselves as a client PR agency. Both were reading
 * the same env var separately, and a list that drifts between two readers is
 * the kind of thing that only shows up as a strange record months later.
 */
export const INTERNAL_DOMAINS = (
  process.env.INTERNAL_DOMAINS || "unionmedia.news,unionmedianews.com,unionmediainc.com"
)
  .split(",")
  .map((d) => d.trim().toLowerCase())
  .filter(Boolean);

/** True for a bare host or a full address. */
export function isInternalDomain(value: string | null | undefined): boolean {
  const v = String(value || "").toLowerCase().trim();
  if (!v) return false;
  const domain = v.includes("@") ? v.split("@")[1] ?? "" : v;
  return INTERNAL_DOMAINS.includes(domain);
}
