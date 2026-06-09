"use client";

import { useActionState } from "react";
import { signInWithPassword, type LoginState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: LoginState = { error: null };

export function LoginForm() {
  const [state, formAction, pending] = useActionState(
    signInWithPassword,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-3.5" noValidate>
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

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <Label htmlFor="password" className="text-[11.5px] text-fg-2">
            Password
          </Label>
        </div>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          required
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

      <Button
        type="submit"
        disabled={pending}
        className="w-full h-9 font-medium"
      >
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
