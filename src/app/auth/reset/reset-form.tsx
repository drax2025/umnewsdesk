"use client";

import { useActionState } from "react";
import { confirmNewPassword } from "@/lib/actions/password-reset";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: { error: string | null; ok?: boolean } = { error: null };

/**
 * Two-field new-password form. The matching check happens server-side
 * inside confirmNewPassword() — we don't dupe that logic on the client
 * because the server action is the security boundary anyway and a small
 * latency on the "passwords don't match" path is fine.
 *
 * On success the server action `redirect()`s to /login?reset=1 so this
 * component never sees an `ok: true` state — keeps the UI honest.
 */
export function ResetPasswordForm() {
  const [state, formAction, pending] = useActionState(
    confirmNewPassword,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-3.5" noValidate>
      <div>
        <Label htmlFor="password" className="text-[11.5px] text-fg-2 mb-1.5">
          New password
        </Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          placeholder="At least 10 characters"
          required
          minLength={10}
          className="h-9 text-[13px]"
        />
      </div>

      <div>
        <Label htmlFor="confirm" className="text-[11.5px] text-fg-2 mb-1.5">
          Confirm new password
        </Label>
        <Input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          placeholder="Type it again"
          required
          minLength={10}
          className="h-9 text-[13px]"
        />
      </div>

      {state.error ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12px] text-destructive"
        >
          {state.error}
        </p>
      ) : null}

      <Button type="submit" disabled={pending} className="w-full h-9 font-medium">
        {pending ? "Saving…" : "Save new password"}
      </Button>
    </form>
  );
}
