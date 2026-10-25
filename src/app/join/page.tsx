import type { Metadata } from "next";

import { Card, PageTitle } from "@/components/ui";
import { requireUser } from "@/lib/auth";

import { JoinForm } from "./join-form";

export const metadata: Metadata = { title: "Join" };

export default async function JoinPage() {
  const user = await requireUser();

  return (
    <>
      <PageTitle subtitle="Ask the group admin for the invite code.">Join the league</PageTitle>
      <Card>
        <JoinForm defaultName={user.profile?.display_name ?? ""} />
      </Card>
    </>
  );
}
