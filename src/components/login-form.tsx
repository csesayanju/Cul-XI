"use client";

import { useActionState } from "react";

import { signInWithMagicLink } from "@/app/actions/auth";

import { Button, Input, Notice } from "./ui";

export function LoginForm() {
  const [state, action, pending] = useActionState(signInWithMagicLink, null);

  return (
    <form action={action} className="space-y-3">
      <label className="block text-sm font-medium" htmlFor="email">
        Email
      </label>
      <Input
        id="email"
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        required
        placeholder="you@example.com"
      />
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Sending…" : "Email me a sign-in link"}
      </Button>
      {state && <Notice tone={state.ok ? "success" : "error"}>{state.message}</Notice>}
    </form>
  );
}
