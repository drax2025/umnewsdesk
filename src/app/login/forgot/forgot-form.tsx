"use client";

import { useState, useTransition } from "react";
import { requestPasswordReset } from "@/lib/actions/password-reset";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Self-service "forgot password" form. The server action deliberately
 * returns `ok: true` whether or not the email exists in auth.users —
 * surfacing the difference would let a stranger enumerate accounts. So
 * the success banner is intentionally vague.
 */
export function ForgotPasswordForm() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  function submit(fd: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await requestPasswordReset(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSent(true);
    });
  }

  if (sent) {
    return (
      <div className="rounded-md border border-success/35 bg-success/10 px-3 py-3 text-[12px] leading-[1.55] text-success">
        <strong className="block font-semibold">Check your inbox</strong>
        <span className="text-success/90">
          If that address has an account, a recovery link is on its way.
          The link works once and expires after 60 minutes.
        </span>
      </div>
    );
  }

  return (
    <form action={submit} className="space-y-3.5" noValidate>
      <div>
        <Label htmlFor="email" className="text-[11.5px] text-fg-2 mb-1.5">
          Work email
        </Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@unionmedia.com"
          required
          className="h-9 text-[13px]"
        />
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12px] text-destructive"
        >
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={pending} className="w-full h-9 font-medium">
        {pending ? "Sending…" : "Send recovery link"}
      </Button>
    </form>
  );
}
