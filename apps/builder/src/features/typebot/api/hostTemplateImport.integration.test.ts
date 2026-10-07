import { afterAll, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { createServer, type Server } from "node:http";
import { resolve } from "node:path";
import { WorkspaceRole } from "@typebot.io/prisma/enum";

const originalBaseUrl = process.env.HOST_API_BASE_URL;
const originalServiceKey = process.env.HOST_SERVICE_AUTH_KEY;
const originalDatabaseUrl = process.env.DATABASE_URL;
const databaseUrl = process.env.BOTFLOW_PHASE2D_DATABASE_URL;
const serviceKey = `phase2d-host-key-${randomUUID()}`;
const disposableTarget = (value: string | undefined) => {
  if (!value) return false;
  try {
    const url = new URL(value);
    const databaseName = decodeURIComponent(url.pathname.slice(1));
    return ["localhost", "127.0.0.1", "::1"].includes(url.hostname)
      ? { host: url.hostname, port: url.port || "5432", databaseName }
      : false;
  } catch {
    return false;
  }
};
const intendedTarget = disposableTarget(databaseUrl);
const runtimeTarget = disposableTarget(process.env.DATABASE_URL);
if (
  databaseUrl &&
  (!intendedTarget ||
    !runtimeTarget ||
    !intendedTarget.databaseName.startsWith("botflow_phase2d_") ||
    intendedTarget.host !== runtimeTarget.host ||
    intendedTarget.port !== runtimeTarget.port ||
    intendedTarget.databaseName !== runtimeTarget.databaseName)
)
  throw new Error(
    "Phase 2D integration requires DATABASE_URL and BOTFLOW_PHASE2D_DATABASE_URL to target the same local disposable database.",
  );
const nodeBinary = process.env.BOTFLOW_PHASE2D_NODE_BINARY;
const integrationTest = intendedTarget && nodeBinary ? it : it.skip;
let server: Server | undefined;
let prisma: Awaited<typeof import("@typebot.io/prisma")>["default"];
let importedTypebotId: string | undefined;
let userId: string | undefined;
let workspaceId: string | undefined;

process.env.SKIP_ENV_CHECK = "true";
const demoTypebot = {
  version: "6.1",
  name: "Demo template",
  icon: null,
  folderId: null,
  events: [
    {
      id: "demo-start",
      type: "start",
      graphCoordinates: { x: 0, y: 0 },
      outgoingEdgeId: "demo-start-edge",
    },
  ],
  groups: [
    {
      id: "demo-main",
      title: "Demo",
      graphCoordinates: { x: 100, y: 0 },
      blocks: [
        {
          id: "demo-action",
          type: "host-action",
          options: {
            action: "Execute Action",
            actionKey: "demo.echo",
            inputs: [],
            outputVariableId: "demo-output",
          },
        },
        {
          id: "demo-choice",
          type: "choice input",
          options: { variableId: "demo-answer" },
          items: [
            {
              id: "demo-option-one",
              content: "First option",
              value: "first",
              outgoingEdgeId: "demo-option-one-edge",
            },
            {
              id: "demo-option-two",
              content: "Second option",
              value: "second",
              outgoingEdgeId: "demo-option-two-edge",
            },
          ],
        },
      ],
    },
    {
      id: "demo-first-result",
      title: "First result",
      graphCoordinates: { x: 400, y: -100 },
      blocks: [],
    },
    {
      id: "demo-second-result",
      title: "Second result",
      graphCoordinates: { x: 400, y: 100 },
      blocks: [],
    },
  ],
  edges: [
    {
      id: "demo-start-edge",
      from: { eventId: "demo-start" },
      to: { groupId: "demo-main" },
    },
    {
      id: "demo-option-one-edge",
      from: { blockId: "demo-choice", itemId: "demo-option-one" },
      to: { groupId: "demo-first-result" },
    },
    {
      id: "demo-option-two-edge",
      from: { blockId: "demo-choice", itemId: "demo-option-two" },
      to: { groupId: "demo-second-result" },
    },
  ],
  variables: [
    { id: "demo-output", name: "output" },
    { id: "demo-answer", name: "answer" },
  ],
  theme: {},
  settings: {},
};

integrationTest(
  "imports a generic Host template as an independent editable Typebot in disposable PostgreSQL",
  async () => {
    if (!databaseUrl) throw new Error("Disposable database URL is missing.");
    process.env.DATABASE_URL = databaseUrl;
    process.env.HOST_SERVICE_AUTH_KEY = serviceKey;
    prisma = (await import("@typebot.io/prisma")).default;
    const { handleImportTypebot, importTypebotInputSchema } = await import(
      "./handleImportTypebot"
    );

    server = createServer((request, response) => {
      if (request.headers["x-host-service-key"] !== serviceKey) {
        response.writeHead(401).end();
        return;
      }
      response.setHeader("content-type", "application/json");
      if (request.url === "/internal/host/actions/catalog") {
        response.end(
          JSON.stringify({
            actions: [
              {
                key: "demo.echo",
                title: "Echo",
                description: "Returns a generic value.",
                inputs: [],
                outputs: [{ key: "text", type: "string" }],
              },
            ],
          }),
        );
        return;
      }
      if (request.url === "/internal/host/templates/demo-template") {
        response.end(
          JSON.stringify({
            template: {
              key: "demo-template",
              name: "Demo template",
              description: "A generic Project B starting point.",
              typebot: demoTypebot,
            },
          }),
        );
        return;
      }
      response.writeHead(404).end();
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("Host fixture failed to bind.");
    process.env.HOST_API_BASE_URL = `http://127.0.0.1:${address.port}`;

    const marker = randomUUID().replaceAll("-", "");
    userId = `phase2d-user-${marker}`;
    workspaceId = `phase2d-workspace-${marker}`;
    await prisma.user.create({
      data: {
        id: userId,
        email: `${marker}@example.invalid`,
        onboardingCategories: [],
      },
    });
    await prisma.workspace.create({
      data: {
        id: workspaceId,
        name: `Phase 2D ${marker}`,
        isVerified: true,
      },
    });
    await prisma.memberInWorkspace.create({
      data: { userId, workspaceId, role: WorkspaceRole.ADMIN },
    });

    const result = await handleImportTypebot({
      input: importTypebotInputSchema.parse({
        workspaceId,
        hostTemplateKey: "demo-template",
        folderId: null,
      }),
      context: { user: { id: userId } },
    });
    importedTypebotId = result.typebot.id;
    const persisted = await prisma.typebot.findUniqueOrThrow({
      where: { id: importedTypebotId },
    });

    expect(result.typebot.name).toBe("Demo template");
    expect(persisted.workspaceId).toBe(workspaceId);
    expect(persisted.groups.flatMap(({ blocks }) => blocks)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "host-action",
          options: expect.objectContaining({ actionKey: "demo.echo" }),
        }),
        expect.objectContaining({ type: "choice input" }),
      ]),
    );
    expect(JSON.stringify(persisted)).not.toContain(serviceKey);

    const publisher = Bun.spawn(
      [
        nodeBinary!,
        "--import",
        "tsx",
        resolve(import.meta.dir, "hostPlatformPublishWorker.ts"),
      ],
      {
        cwd: import.meta.dir,
        env: {
          ...process.env,
          DATABASE_URL: databaseUrl,
          SKIP_ENV_CHECK: "true",
        },
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    publisher.stdin.write(
      JSON.stringify({ typebotId: importedTypebotId, userId }),
    );
    publisher.stdin.end();
    const [publishOutput, publishError, publishExitCode] = await Promise.all([
      new Response(publisher.stdout).text(),
      new Response(publisher.stderr).text(),
      publisher.exited,
    ]);
    expect(publishExitCode, publishError).toBe(0);
    expect(JSON.parse(publishOutput)).toMatchObject({ message: "success" });
    const published = await prisma.publicTypebot.findUniqueOrThrow({
      where: { typebotId: importedTypebotId },
    });
    expect(JSON.stringify(published.groups)).toContain("demo.echo");
    expect(JSON.stringify(published.groups)).toContain("choice input");
    expect(JSON.stringify(published)).not.toContain(serviceKey);
  },
  480_000,
);

afterAll(async () => {
  if (server)
    await new Promise<void>((resolve) => server?.close(() => resolve()));
  if (prisma) {
    if (importedTypebotId) {
      await prisma.publicTypebot.deleteMany({
        where: { typebotId: importedTypebotId },
      });
      await prisma.typebot.deleteMany({ where: { id: importedTypebotId } });
    }
    if (userId && workspaceId)
      await prisma.memberInWorkspace.deleteMany({
        where: { userId, workspaceId },
      });
    if (workspaceId)
      await prisma.workspace.deleteMany({ where: { id: workspaceId } });
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  }
  process.env.HOST_API_BASE_URL = originalBaseUrl;
  process.env.HOST_SERVICE_AUTH_KEY = originalServiceKey;
  process.env.DATABASE_URL = originalDatabaseUrl;
});
