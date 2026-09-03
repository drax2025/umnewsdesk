import { ImapFlow } from "imapflow";
import { simpleParser, type ParsedMail } from "mailparser";

/**
 * Reading the PR mailbox directly over IMAP.
 *
 * Ported from Newsroom V1, which retired its Postmark inbound webhook on
 * 24 August 2026 for the reason that matters here: a webhook only ever sees
 * what somebody *forwarded* to it, so the sender, date and Message-ID all have
 * to be reconstructed out of a quoted wrapper. Reading the mailbox gets the
 * original message intact. V2's own Postmark path stopped delivering on
 * 3 July 2026 and every candidate it ever produced arrived as a "Fwd:" with
 * `verification_state = 'unverified'` — exactly the failure this avoids.
 *
 * One folder is watched rather than the whole inbox, so triage stays a human
 * act in Zoho and the app only sees what someone has decided is a release.
 */

export interface MailboxConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  /** Watched for new releases. */
  inbox: string;
  /** Messages are moved here once safely stored. */
  done: string;
  /** Messages that cannot be parsed, so one bad message cannot block the queue. */
  failed: string;
}

export function mailboxConfigFromEnv(): MailboxConfig | null {
  const { IMAP_HOST, IMAP_USER, IMAP_PASSWORD } = process.env;
  if (!IMAP_HOST || !IMAP_USER || !IMAP_PASSWORD) return null;
  return {
    host: IMAP_HOST,
    port: Number(process.env.IMAP_PORT) || 993,
    user: IMAP_USER,
    pass: IMAP_PASSWORD,
    inbox: process.env.IMAP_FOLDER || "PR/To Process",
    done: process.env.IMAP_FOLDER_DONE || "PR/Ingested",
    failed: process.env.IMAP_FOLDER_FAILED || "PR/Failed",
  };
}

/**
 * Every connection is built here.
 *
 * ImapFlow is an EventEmitter, and an unhandled 'error' event takes the whole
 * process down — in V1 a socket timeout while filing a message crashed the app
 * in production. A try/catch does not cover it, because the event arrives
 * asynchronously rather than as a rejected promise. So each client gets a
 * listener, plus explicit timeouts so a wedged connection fails rather than
 * hanging (which on a serverless function means burning the whole budget).
 */
function newClient(config: MailboxConfig, label: string): ImapFlow {
  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: true,
    auth: { user: config.user, pass: config.pass },
    logger: false,
    greetingTimeout: 15_000,
    socketTimeout: 60_000,
  });
  client.on("error", (err: unknown) => {
    const e = err as { code?: string; message?: string };
    console.error(`[MAILBOX] connection error during ${label}: ${e?.code ?? ""} ${e?.message ?? String(err)}`);
  });
  return client;
}

export interface FetchedMessage {
  uid: number;
  parsed: ParsedMail;
}

export interface PollOutcome {
  found: number;
  ingested: number;
  skipped: number;
  failed: number;
  results: string[];
  errors: string[];
}

/**
 * Fetch everything waiting, hand each message to `handle`, and move it on
 * according to the result. Moving rather than flagging means the folder *is*
 * the queue: what remains is what still needs attention, and a re-run cannot
 * double-process. `dryRun` fetches and reports without storing or moving.
 *
 * `handle` returns a short description of what it did, for the response body.
 */
export async function pollMailbox(
  config: MailboxConfig,
  handle: (message: FetchedMessage, context: { dryRun: boolean }) => Promise<string>,
  options: { dryRun?: boolean; limit?: number } = {},
): Promise<PollOutcome> {
  const limit = options.limit ?? 25;
  const outcome: PollOutcome = {
    found: 0, ingested: 0, skipped: 0, failed: 0, results: [], errors: [],
  };

  const client = newClient(config, "poll");
  await client.connect();
  try {
    const lock = await client.getMailboxLock(config.inbox);
    try {
      // {uid: true} matters: without it search returns sequence numbers, which
      // shift as messages are moved out and only coincide with UIDs while a
      // folder has never had anything removed. Every later call here is
      // UID-based, so mixing the two silently reads the wrong messages.
      const uids = (await client.search({ all: true }, { uid: true })) || [];
      outcome.found = uids.length;

      for (const uid of uids.slice(0, limit)) {
        let parsed: ParsedMail;
        try {
          const raw = await client.download(String(uid), undefined, { uid: true });
          parsed = await simpleParser(raw.content);
        } catch (e) {
          outcome.failed++;
          outcome.errors.push(`uid ${uid}: unreadable — ${(e as Error).message}`);
          if (!options.dryRun) {
            try {
              await client.messageMove(String(uid), config.failed, { uid: true });
            } catch (moveError) {
              outcome.errors.push(
                `uid ${uid}: could not move to ${config.failed} — ${(moveError as Error).message}`,
              );
            }
          }
          continue;
        }

        // A dry run still hands the message to the caller — reporting what
        // *would* be created is the point, not merely proving the fetch worked.
        // The caller is responsible for not writing anything.
        if (options.dryRun) {
          try {
            outcome.results.push(await handle({ uid, parsed }, { dryRun: true }));
          } catch (e) {
            outcome.failed++;
            outcome.errors.push(`uid ${uid}: ${(e as Error).message}`);
          }
          continue;
        }

        try {
          const result = await handle({ uid, parsed }, { dryRun: false });
          if (result.startsWith("duplicate")) outcome.skipped++;
          else outcome.ingested++;
          outcome.results.push(result);
          // A failure here would leave a stored item still sitting in the
          // queue, so it is reported rather than swallowed.
          try {
            await client.messageMove(String(uid), config.done, { uid: true });
          } catch (moveError) {
            outcome.errors.push(
              `uid ${uid}: stored but not moved — ${(moveError as Error).message}`,
            );
          }
        } catch (e) {
          outcome.failed++;
          outcome.errors.push(`uid ${uid}: ${(e as Error).message}`);
          // Left where it is deliberately: a storage failure is usually
          // transient, and the next poll should retry rather than quarantine
          // a good release.
        }
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => client.close());
  }

  return outcome;
}

/** Confirms credentials and that the folders exist, without touching any mail. */
export async function testMailbox(config: MailboxConfig) {
  const client = newClient(config, "connection test");
  await client.connect();
  try {
    const boxes = await client.list();
    const names = boxes.map((b) => b.path);
    const status = await client.status(config.inbox, { messages: true }).catch(() => null);
    return {
      connected: true,
      folders: names,
      watching: config.inbox,
      watchedFolderExists: names.includes(config.inbox),
      doneFolderExists: names.includes(config.done),
      failedFolderExists: names.includes(config.failed),
      waiting: status?.messages ?? null,
    };
  } finally {
    await client.logout().catch(() => client.close());
  }
}
