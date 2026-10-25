"use client";

import { useActionState } from "react";

import { joinLeague } from "@/app/actions/league";
import { Button, Input, Notice } from "@/components/ui";

export function JoinForm({ defaultName }: { defaultName: string }) {
  const [state, action, pending] = useActionState(joinLeague, null);

  return (
    <form action={action} className="space-y-3">
      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="code">
          Invite code
        </label>
        <Input id="code" name="code" required autoComplete="off" autoCapitalize="none" />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="displayName">
          Your name on the leaderboard
        </label>
        <Input
          id="displayName"
          name="displayName"
          required
          maxLength={40}
          defaultValue={defaultName}
        />
      </div>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Joining…" : "Join"}
      </Button>
      {state && !state.ok && <Notice tone="error">{state.message}</Notice>}
    </form>
  );
}
