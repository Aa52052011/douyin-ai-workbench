import { PrismaClient } from "@prisma/client";

const PROJECT_ID = "01a08b3f-9638-7fd1-a1ee-344682fb4809";
const SCRIPT_ID = "01a08c1d-46ce-7951-82ed-2eddd2394faa";
const prisma = new PrismaClient({ log: [] });

try {
  const script = await prisma.script.findFirst({
    where: { id: SCRIPT_ID },
    select: {
      id: true,
      title: true,
      status: true,
      version: true,
      topicId: true,
      contentPlanId: true,
      sourceAgentRunId: true,
      createdAt: true,
      updatedAt: true,
      projectId: true,
      deletedAt: true,
    },
  });
  const run = script?.sourceAgentRunId
    ? await prisma.agentRun.findFirst({
        where: { id: script.sourceAgentRunId },
        select: { id: true, status: true, agentId: true, startedAt: true, completedAt: true, createdAt: true, requestId: true },
      })
    : null;
  const confirmed = await prisma.script.findMany({
    where: { projectId: PROJECT_ID, status: "CONFIRMED", deletedAt: null },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      version: true,
      topicId: true,
      contentPlanId: true,
      sourceAgentRunId: true,
      createdAt: true,
      updatedAt: true,
      status: true,
    },
  });
  const allScripts = await prisma.script.findMany({
    where: { projectId: PROJECT_ID, deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      status: true,
      version: true,
      topicId: true,
      createdAt: true,
      updatedAt: true,
      sourceAgentRunId: true,
    },
  });
  const jobsForScript = await prisma.job.findMany({
    where: { OR: [{ scriptId: SCRIPT_ID }, { projectId: PROJECT_ID }] },
    orderBy: { createdAt: "desc" },
    take: 40,
    select: {
      id: true,
      kind: true,
      status: true,
      scriptId: true,
      videoId: true,
      createdAt: true,
      startedAt: true,
      completedAt: true,
      requestId: true,
      projectId: true,
    },
  });
  const videos = await prisma.video.findMany({
    where: { projectId: PROJECT_ID, deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true, scriptId: true, status: true, createdAt: true, sourceJobId: true },
  });
  const pendingVideos = videos.filter((v) => v.status === "PENDING");
  process.stdout.write(
    `${JSON.stringify(
      {
        script,
        run,
        deltaCreatedToUpdatedMs: script ? script.updatedAt.getTime() - script.createdAt.getTime() : null,
        confirmedScripts: confirmed,
        allScripts,
        jobsLinkedToThisScript: jobsForScript.filter((j) => j.scriptId === SCRIPT_ID),
        otherProjectJobs: jobsForScript
          .filter((j) => j.scriptId !== SCRIPT_ID)
          .map((j) => ({
            id: j.id,
            kind: j.kind,
            status: j.status,
            scriptId: j.scriptId,
            videoId: j.videoId,
            createdAt: j.createdAt,
          })),
        videosForThisScript: videos.filter((v) => v.scriptId === SCRIPT_ID),
        pendingVideosInProject: pendingVideos.map((v) => ({
          id: v.id,
          scriptId: v.scriptId,
          status: v.status,
          createdAt: v.createdAt,
        })),
      },
      null,
      2,
    )}\n`,
  );
} finally {
  await prisma.$disconnect();
}
