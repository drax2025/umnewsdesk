import net from "node:net";
import dnsPromises from "node:dns/promises";

/**
 * Server-side request forgery guard for anything that fetches a URL a user
 * chose. Vercel's runtime exposes credentials on link-local addresses and the
 * app's own API answers on localhost, so "just fetch it" is a real hole.
 *
 * Ported deliberately unchanged from Newsroom V1's `services/safeUrl.ts`. Two
 * copies of a security check are two chances for one to fall behind, so if a
 * range is added there it must be added here — the alternative was a shared
 * package for one 40-line file across two runtimes.
 */
export const isPrivateAddress = (ip: string): boolean => {
  const version = net.isIP(ip);
  if (version === 4) {
    const p = ip.split(".").map(Number);
    if (p[0] === 0 || p[0] === 10 || p[0] === 127) return true; // this-network, RFC1918, loopback
    if (p[0] === 169 && p[1] === 254) return true; // link-local (cloud metadata)
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true; // RFC1918
    if (p[0] === 192 && p[1] === 168) return true; // RFC1918
    if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true; // CGNAT
    if (p[0] === 192 && p[1] === 0 && p[2] === 0) return true; // IETF protocol assignments
    if (p[0] === 198 && (p[1] === 18 || p[1] === 19)) return true; // benchmarking
    if (p[0] >= 224) return true; // multicast + reserved
    return false;
  }
  if (version === 6) {
    const v = ip.toLowerCase();
    if (v === "::1" || v === "::") return true;
    if (v.startsWith("fe80") || v.startsWith("fc") || v.startsWith("fd")) return true;
    if (v.startsWith("::ffff:")) return isPrivateAddress(v.slice(7)); // IPv4-mapped
    return false;
  }
  return true; // not parseable as an IP — refuse
};

export const assertSafeUrl = async (raw: string): Promise<void> => {
  const u = new URL(raw);
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error("Only http and https are allowed");
  }
  const addresses = await dnsPromises.lookup(u.hostname, { all: true });
  if (!addresses.length) throw new Error("Host did not resolve");
  for (const a of addresses) {
    if (isPrivateAddress(a.address)) {
      throw new Error("Target resolves to a private address");
    }
  }
};
