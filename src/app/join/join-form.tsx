"use client";

import { useActionState, useTransition } from "react";

import { joinLeague, leaveLeague, updateDisplayName } from "@/app/actions/league";
import { Button, Input, Notice } from "@/components/ui";

export function NameForm({ current }: { current: string }) {
  const [state, action, pending] = useActionState(updateDisplayName, null);
  return (
    <form action={action} className="space-y-2">
      <label className="block text-sm font-semibold" htmlFor="displayName">
        Your name on leaderboards
      </label>
      <div className="flex gap-2">
        <Input
          id="displayName"
          name="displayName"
          required
          minLength={2}
          maxLength={40}
          defaultValue={current}
          autoComplete="nickname"
        />
        <Button type="submit" variant="secondary" disabled={pending} className="shrink-0">
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
      {state && <Notice tone={state.ok ? "success" : "error"}>{state.message}</Notice>}
    </form>
  );
}

export function JoinForm() {
  const [state, action, pending] = useActionState(joinLeague, null);
  return (
    <form action={action} className="space-y-2">
      <label className="block text-sm font-semibold" htmlFor="code">
        Invite code
      </label>
      <div className="flex gap-2">
        <Input
          id="code"
          name="code"
          required
          autoComplete="off"
          autoCapitalize="none"
          placeholder="From your group admin"
        />
        <Button type="submit" disabled={pending} className="shrink-0">
          {pending ? "Joining…" : "Join"}
        </Button>
      </div>
      {state && !state.ok && <Notice tone="error">{state.message}</Notice>}
    </form>
  );
}

export function LeaveButton({ leagueId, name }: { leagueId: string; name: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (window.confirm(`Leave ${name}? You can rejoin with its invite code.`)) {
          start(async () => {
            await leaveLeague(leagueId);
          });
        }
      }}
      className="text-xs font-semibold text-ink-muted underline hover:text-garnet-500"
    >
      {pending ? "Leaving…" : "Leave"}
    </button>
  );
}
