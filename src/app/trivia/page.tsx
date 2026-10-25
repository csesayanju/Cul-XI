import type { Metadata } from "next";

import { Card, PageTitle } from "@/components/ui";

export const metadata: Metadata = { title: "Trivia" };

export default function TriviaPage() {
  return (
    <>
      <PageTitle>Trivia</PageTitle>
      <Card className="text-center">
        <p className="text-4xl" aria-hidden>
          🧠
        </p>
        <p className="mt-2 text-lg font-bold">Coming soon</p>
        <p className="mt-1 text-sm text-ink-muted">
          Barça trivia quizzes for the group are on the roadmap. Stay tuned, culé.
        </p>
      </Card>
    </>
  );
}
