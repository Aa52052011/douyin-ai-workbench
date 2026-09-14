import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const RUN_IDS = [
  "01a08be0-9815-7b31-932a-c2efb9b7f7c2",
  "01a08be4-d4cc-7c81-8a33-1b39446450af",
];

async function main() {
  const runs = await prisma.agentRun.findMany({
    where: { id: { in: RUN_IDS } },
    select: { id: true, input: true },
  });
  for (const run of runs) {
    const input = run.input as Record<string, unknown>;
    console.log(
      JSON.stringify(
        {
          id: run.id,
          learningContext: input.learningContext ?? null,
          performanceFeedback: input.performanceFeedback ?? null,
          hasPositioning: Boolean(input.positioning),
          strategyKeys: input.campaignStrategy
            ? Object.keys(input.campaignStrategy as object).slice(0, 12)
            : [],
          planningDays: input.planningDays,
          postsPerDay: input.postsPerDay,
          platform: input.platform,
        },
        null,
        2,
      ),
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
