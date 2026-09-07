-- ═══════════════════════════════════════════════════════════════════════════
-- 0046_candidate_rejection.sql
--
-- Rejection: how a candidate leaves the inbox without being sent onward.
-- Ported from Newsroom V1's rejection process (spec, 7 September 2026).
--
-- Replaces the reason-less "Dismiss" as the way to close a candidate. The
-- point of the port is that a closure has to explain itself: a story closed
-- today has to be answerable for in six weeks, which is why the reason is
-- mandatory and the note is preserved.
--
-- Attribution and timestamp are taken from the session inside `reject_candidate`
-- below, never from the caller. A client that lies about who rejected something
-- is not the threat; a client that is simply wrong — a stale session, a retried
-- request — is ordinary, and the server already knows the answer.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── terminal state ────────────────────────────────────────────────────────
-- Distinct from 'archived', which is restorable. A rejection is terminal.
alter type candidate_triage_state add value if not exists 'rejected';
