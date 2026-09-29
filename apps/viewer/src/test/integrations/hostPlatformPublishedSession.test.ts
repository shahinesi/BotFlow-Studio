import { expect, it } from "bun:test";
import { createHmac, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import prisma from "@typebot.io/prisma";
import { WorkspaceRole } from "@typebot.io/prisma/enum";

process.env.SKIP_ENV_CHECK = "true";

const root = resolve(import.meta.dir, "../../../../..");
const biSource = resolve(root, "../shahrfarsh-credit-web/backend/src/bots");
const marker = () => randomUUID().replaceAll("-", "");

const isDisposableDatabase = (value: string | undefined) => {
  if (!value) return false;
  const url = new URL(value);
  return (
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
    url.pathname.startsWith("/botflow_phase1b_")
  );
};

const integrationTest =
  isDisposableDatabase(process.env.BOTFLOW_PHASE1B_DATABASE_URL) &&
  process.env.PHASE1B_NODE_BINARY &&
  existsSync(resolve(biSource, "botflow-action-gateway.service.ts"))
    ? it
    : it.skip;

integrationTest(
  "publishes, persists, restarts and continues a trusted flow without persisting credentials",
  async () => {
    const databaseUrl = process.env.BOTFLOW_PHASE1B_DATABASE_URL!;
    const id = marker();
    const userId = `phase1b-user-${id}`;
    const workspaceId = `phase1b-workspace-${id}`;
    const typebotId = `phase1b-typebot-${id}`;
    const publicFlowId = `phase1b-${id}`;
    const contextMarker = `TRUSTED_CONTEXT_MUST_NOT_PERSIST_${id}`;
    const bridgeKey = `BRIDGE_SERVICE_MUST_NOT_PERSIST_${id}`;
    const actionKey = `ACTION_SERVICE_MUST_NOT_PERSIST_${id}`;
    const signingKey = `SIGNING_SECRET_MUST_NOT_PERSIST_${id}`;
    const bindingKey = `SESSION_BINDING_MUST_NOT_PERSIST_${id}`;
    const diagnosticId = `diagnostic-${id}`;
    const inputId = `input-${id}`;
    const event = {
      id: `event-${id}`,
      type: "start",
      graphCoordinates: { x: 0, y: 0 },
      outgoingEdgeId: `edge-${id}`,
    };
    const group = {
      id: `group-${id}`,
      title: "Phase 1B",
      graphCoordinates: { x: 100, y: 0 },
      blocks: [
        textBlock(`before-${id}`, "phase-1b-start"),
        {
          id: `action-${id}`,
          type: "host-action",
          options: {
            action: "Execute Action",
            actionKey: "system.whoami",
            inputs: [],
            outputVariableId: diagnosticId,
          },
        },
        textBlock(`prompt-${id}`, "یک مقدار وارد کنید"),
        {
          id: `input-block-${id}`,
          type: "text input",
          options: { variableId: inputId },
        },
        textBlock(`complete-${id}`, "phase-1b-complete"),
      ],
    };
    const graph = {
      version: "6.1",
      events: [event],
      groups: [group],
      edges: [
        {
          id: event.outgoingEdgeId,
          from: { eventId: event.id },
          to: { groupId: group.id },
        },
      ],
      variables: [
        { id: diagnosticId, name: "diagnostic" },
        { id: inputId, name: "input" },
      ],
      theme: {},
      settings: {},
    };

    await prisma.user.create({
      data: {
        id: userId,
        email: `${id}@example.invalid`,
        onboardingCategories: [],
      },
    });
    await prisma.workspace.create({
      data: { id: workspaceId, name: "Phase 1B disposable", isVerified: true },
    });
    await prisma.memberInWorkspace.create({
      data: { userId, workspaceId, role: WorkspaceRole.ADMIN },
    });
    await prisma.typebot.create({
      data: {
        id: typebotId,
        publicId: publicFlowId,
        workspaceId,
        name: "Phase 1B diagnostic",
        ...graph,
      },
    });
    expect((await publish(databaseUrl, typebotId, userId)).message).toBe(
      "success",
    );
    const published = await prisma.publicTypebot.findUniqueOrThrow({
      where: { typebotId },
    });
    await prisma.publicTypebot.update({
      where: { id: published.id },
      data: { lastActivityAt: new Date() },
    });

    const [
      { BotFlowActionGatewayService },
      { BotActionRegistry, InternalActionProvider },
    ] = await Promise.all([
      import(
        pathToFileURL(resolve(biSource, "botflow-action-gateway.service.ts"))
          .href
      ),
      import(
        pathToFileURL(resolve(biSource, "bot-app-framework.service.ts")).href
      ),
    ]);
    let actionCalls = 0;
    let gatewayMode: "normal" | "deny" | "timeout" = "normal";
    const admittedUsers = new Set(["bi-user-a", "bi-user-b"]);
    const gateway = new BotFlowActionGatewayService(
      {
        get: (key: string) =>
          ({
            BOTFLOW_ACTION_SERVICE_KEY: actionKey,
            BOTFLOW_CONTEXT_SIGNING_KEY: signingKey,
          })[
            key as "BOTFLOW_ACTION_SERVICE_KEY" | "BOTFLOW_CONTEXT_SIGNING_KEY"
          ],
      } as never,
      {
        botUser: {
          findUnique: async ({ where }: { where: { id: string } }) =>
            admittedUsers.has(where.id)
              ? {
                  id: where.id,
                  connectionId: "bi-connection",
                  platform: "TELEGRAM",
                  externalUserId: where.id,
                  role: "USER",
                  status: "ACTIVE",
                  phoneVerifiedAt: new Date(),
                }
              : null,
        },
        botConnection: {
          findUnique: async () => ({
            id: "bi-connection",
            platform: "TELEGRAM",
            status: "ACTIVE",
          }),
        },
        botAppConnection: {
          findUnique: async () => ({
            enabled: true,
            botApp: { id: "bi-app", status: "ACTIVE" },
          }),
        },
        botCommand: {
          findMany: async () => [{ policy: "ALL_VERIFIED_USERS" }],
        },
      } as never,
      new BotActionRegistry(new InternalActionProvider()),
    );
    const server = Bun.serve({
      port: 0,
      fetch: async (request) => {
        if (gatewayMode === "deny")
          return new Response("denied", { status: 403 });
        if (gatewayMode === "timeout")
          await new Promise((resolve) => setTimeout(resolve, 6_000));
        try {
          const actionKey = new URL(request.url).pathname.split("/").at(-1)!;
          const result = await gateway.execute(
            request.headers.get("x-host-service-key") ?? undefined,
            request.headers.get("x-host-execution-context") ?? undefined,
            actionKey,
            await request.json(),
          );
          actionCalls++;
          return Response.json(result);
        } catch {
          return new Response("denied", { status: 403 });
        }
      },
    });
    const workerEnv = {
      ...process.env,
      DATABASE_URL: databaseUrl,
      SKIP_ENV_CHECK: "true",
      HOST_BRIDGE_SERVICE_KEY: bridgeKey,
      HOST_EXECUTION_CONTEXT_SIGNING_KEY: signingKey,
      HOST_SESSION_BINDING_KEY: bindingKey,
      HOST_API_BASE_URL: server.url.origin,
      HOST_SERVICE_AUTH_KEY: actionKey,
    };
    const signed = (
      botUserId: string,
      overrides: Record<string, unknown> = {},
    ) => {
      const now = Math.floor(Date.now() / 1000);
      const {
        flowId: overrideFlowId,
        claims: overrideClaims,
        ...rest
      } = overrides;
      const payload = Buffer.from(
        JSON.stringify({
          version: 1,
          iss: "shahrfarsh-web",
          aud: "botflow-host-action",
          flowId: overrideFlowId ?? publicFlowId,
          executionId: `execution-${id}-${botUserId}`,
          iat: now,
          exp: now + 60,
          ...rest,
          claims: {
            botUserId,
            connectionId: "bi-connection",
            botAppId: "bi-app",
            marker: contextMarker,
            ...(overrideClaims as Record<string, unknown> | undefined),
          },
        }),
      ).toString("base64url");
      return `${payload}.${createHmac("sha256", signingKey).update(payload).digest("base64url")}`;
    };
    const signedTokens: string[] = [];
    const call = (
      mode: "start" | "continue",
      botUserId: string,
      sessionId?: string,
      sessionBinding?: string,
      overrides?: Record<string, unknown>,
    ) => {
      const token = signed(botUserId, overrides);
      signedTokens.push(token);
      return runWorker(workerEnv, {
        mode,
        sessionId,
        headers: {
          "x-host-service-key": bridgeKey,
          "x-host-execution-context": token,
          ...(sessionBinding
            ? { "x-host-session-binding": sessionBinding }
            : {}),
        },
        body: {
          flowId: (overrides?.flowId as string | undefined) ?? publicFlowId,
          ...(mode === "continue" ? { message: "phase-1b-input" } : {}),
        },
      });
    };
    const bindingFor = (
      sessionId: string,
      botUserId: string,
      flowId = publicFlowId,
    ) => {
      const claims = JSON.stringify(
        Object.fromEntries(
          Object.entries({
            botUserId,
            connectionId: "bi-connection",
            botAppId: "bi-app",
            marker: contextMarker,
          }).sort(([left], [right]) => left.localeCompare(right)),
        ),
      );
      return createHmac("sha256", bindingKey)
        .update(JSON.stringify([sessionId, flowId, claims]))
        .digest("base64url");
    };
    try {
      const startedA = await call("start", "bi-user-a");
      expect(startedA.status).toBe(200);
      expect(
        startedA.body.messages.some((m: unknown) =>
          JSON.stringify(m).includes("phase-1b-start"),
        ),
      ).toBe(true);
      expect(startedA.body.input?.id).toBe(`input-block-${id}`);
      expect(actionCalls).toBe(1);
      const sessionA = startedA.body.sessionId as string;
      const persisted = await prisma.chatSession.findUniqueOrThrow({
        where: { id: sessionA },
      });
      expect(JSON.stringify(persisted.state)).toContain("phase-1b-complete");
      expect(JSON.stringify(persisted.state)).toContain("TELEGRAM");
      expect(
        await scanPersistedMarkers([
          contextMarker,
          bridgeKey,
          actionKey,
          signingKey,
          bindingKey,
          ...signedTokens,
        ]),
      ).toEqual([]);

      const [startedB, publicStart] = await Promise.all([
        call("start", "bi-user-b"),
        runWorker(workerEnv, {
          mode: "public",
          headers: {},
          body: { flowId: publicFlowId },
        }),
      ]);
      expect(startedB.status).toBe(200);
      expect(publicStart.status).toBe(403);
      expect(actionCalls).toBe(2);
      expect(
        (
          await runWorker(workerEnv, {
            mode: "continue",
            sessionId: sessionA,
            headers: {
              "x-host-service-key": bridgeKey,
              "x-host-session-binding": startedA.body.sessionBinding,
            },
            body: { flowId: publicFlowId, message: "input" },
          })
        ).status,
      ).toBe(401);
      expect(
        (
          await call(
            "continue",
            "bi-user-a",
            startedB.body.sessionId,
            startedB.body.sessionBinding,
          )
        ).status,
      ).toBe(401);
      expect(
        (
          await call(
            "continue",
            "bi-user-b",
            sessionA,
            startedA.body.sessionBinding,
          )
        ).status,
      ).toBe(401);
      expect(
        (
          await call(
            "continue",
            "bi-user-a",
            sessionA,
            startedA.body.sessionBinding,
            { flowId: "wrong-flow" },
          )
        ).status,
      ).toBe(401);
      expect(
        (
          await call(
            "continue",
            "bi-user-a",
            sessionA,
            startedA.body.sessionBinding,
            { exp: 1 },
          )
        ).status,
      ).toBe(401);
      expect(
        (
          await call(
            "continue",
            "bi-user-a",
            sessionA,
            startedA.body.sessionBinding,
            { aud: "wrong-audience" },
          )
        ).status,
      ).toBe(401);
      expect(
        (
          await runWorker(workerEnv, {
            mode: "continue",
            sessionId: sessionA,
            headers: {
              "x-host-service-key": bridgeKey,
              "x-host-execution-context": `${signed("bi-user-a")}tampered`,
              "x-host-session-binding": startedA.body.sessionBinding,
            },
            body: { flowId: publicFlowId, message: "input" },
          })
        ).status,
      ).toBe(401);
      expect(
        (
          await call(
            "continue",
            "bi-user-a",
            "missing-session",
            bindingFor("missing-session", "bi-user-a"),
          )
        ).status,
      ).toBe(401);

      const otherPublicFlowId = `phase1b-other-${id}`;
      const otherTypebotId = `phase1b-other-typebot-${id}`;
      await prisma.typebot.create({
        data: {
          id: otherTypebotId,
          publicId: otherPublicFlowId,
          workspaceId,
          name: "Phase 1B other flow",
          ...graph,
        },
      });
      await publish(databaseUrl, otherTypebotId, userId);
      const otherBinding = bindingFor(sessionA, "bi-user-a", otherPublicFlowId);
      expect(
        (
          await runWorker(workerEnv, {
            mode: "continue",
            sessionId: sessionA,
            headers: {
              "x-host-service-key": bridgeKey,
              "x-host-execution-context": signed("bi-user-a", {
                flowId: otherPublicFlowId,
              }),
              "x-host-session-binding": otherBinding,
            },
            body: { flowId: otherPublicFlowId, message: "input" },
          })
        ).status,
      ).toBe(401);

      await prisma.typebot.update({
        where: { id: typebotId },
        data: {
          groups: [
            {
              ...group,
              blocks: [
                ...group.blocks.slice(0, -1),
                textBlock(`changed-${id}`, "phase-1b-republished"),
              ],
            },
          ],
        },
      });
      await publish(databaseUrl, typebotId, userId);
      const continued = await call(
        "continue",
        "bi-user-a",
        sessionA,
        startedA.body.sessionBinding,
      );
      expect(continued.status).toBe(200);
      expect(JSON.stringify(continued.body)).toContain("phase-1b-complete");
      expect(JSON.stringify(continued.body)).not.toContain(
        "phase-1b-republished",
      );
      expect(
        await prisma.chatSession.findUnique({ where: { id: sessionA } }),
      ).toBeNull();
      expect(
        await prisma.result.findFirst({ where: { typebotId } }),
      ).not.toBeNull();

      let httpActionCount = 0;
      if (process.env.BOTFLOW_PHASE1B_HTTP === "true") {
        const probe = Bun.serve({
          port: 0,
          hostname: "127.0.0.1",
          fetch: () => new Response(),
        });
        const port = new URL(probe.url).port;
        probe.stop();
        const baseUrl = `http://127.0.0.1:${port}`;
        let viewer = await launchViewer(workerEnv, port);
        try {
          const startToken = signed("bi-user-a");
          signedTokens.push(startToken);
          const httpStart = await fetch(`${baseUrl}/api/internal/host/start`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-host-service-key": bridgeKey,
              "x-host-execution-context": startToken,
            },
            body: JSON.stringify({ flowId: publicFlowId }),
          });
          expect(httpStart.status).toBe(200);
          const startedHttp = await httpStart.json();
          expect(startedHttp.input?.id).toBe(`input-block-${id}`);
          expect(
            await prisma.chatSession.findUnique({
              where: { id: startedHttp.sessionId },
            }),
          ).not.toBeNull();
          httpActionCount = 1;
          await stopViewer(viewer, [bridgeKey, actionKey, startToken]);
          viewer = await launchViewer(workerEnv, port);
          const continueToken = signed("bi-user-a");
          signedTokens.push(continueToken);
          const httpContinue = await fetch(
            `${baseUrl}/api/internal/host/sessions/${startedHttp.sessionId}/continue`,
            {
              method: "POST",
              headers: {
                "content-type": "application/json",
                "x-host-service-key": bridgeKey,
                "x-host-execution-context": continueToken,
                "x-host-session-binding": startedHttp.sessionBinding,
              },
              body: JSON.stringify({
                flowId: publicFlowId,
                message: "http-input",
              }),
            },
          );
          expect(httpContinue.status).toBe(200);
          expect(JSON.stringify(await httpContinue.json())).toContain(
            "phase-1b-republished",
          );
          expect(
            await prisma.chatSession.findUnique({
              where: { id: startedHttp.sessionId },
            }),
          ).toBeNull();
          console.log(JSON.stringify({ httpSessionId: startedHttp.sessionId }));
        } finally {
          await stopViewer(viewer, [bridgeKey, actionKey, signingKey]);
        }
      }

      gatewayMode = "deny";
      expect((await call("start", "bi-user-a")).status).toBe(401);
      gatewayMode = "timeout";
      expect((await call("start", "bi-user-a")).status).toBe(401);
      gatewayMode = "normal";
      expect(
        (
          await runWorker(workerEnv, {
            mode: "start",
            headers: {
              "x-host-service-key": bridgeKey,
              "x-host-execution-context": signed("bi-user-a", {
                flowId: "phase1b-not-published",
              }),
            },
            body: { flowId: "phase1b-not-published" },
          })
        ).status,
      ).toBe(401);
      expect(
        (
          await runWorker(
            {
              ...workerEnv,
              DATABASE_URL:
                "postgresql://shahineskandari@127.0.0.1:1/botflow_phase1b_unavailable",
            },
            {
              mode: "start",
              headers: {
                "x-host-service-key": bridgeKey,
                "x-host-execution-context": signed("bi-user-a"),
              },
              body: { flowId: publicFlowId },
            },
          )
        ).status,
      ).toBe(401);

      const forbidden = [
        contextMarker,
        bridgeKey,
        actionKey,
        signingKey,
        bindingKey,
        "x-host-execution-context",
        ...signedTokens,
      ];
      const serialized = JSON.stringify({
        startedA: startedA.body,
        continued: continued.body,
        session: await prisma.chatSession.findUnique({
          where: { id: sessionA },
        }),
        result: await prisma.result.findFirst({ where: { typebotId } }),
      });
      for (const secret of forbidden) expect(serialized).not.toContain(secret);
      expect(await scanPersistedMarkers(forbidden)).toEqual([]);
      expect(actionCalls).toBe(3 + httpActionCount);
      console.log(
        JSON.stringify({
          publicFlowId,
          typebotId,
          publishedId: published.id,
          sessionA,
          sessionB: startedB.body.sessionId,
          actionCalls,
          processRestart:
            "start and continue used separate viewer route processes",
        }),
      );
    } finally {
      server.stop();
    }
  },
  480_000,
);

const textBlock = (id: string, text: string) => ({
  id,
  type: "text",
  content: { richText: [{ type: "p", children: [{ text }] }] },
});

const publish = async (
  databaseUrl: string,
  typebotId: string,
  userId: string,
) => {
  const worker = Bun.spawn(
    workerCommand(
      "apps/builder/src/features/typebot/api/hostPlatformPublishWorker.ts",
    ),
    {
      cwd: resolve(root, "apps/builder"),
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
  worker.stdin.write(JSON.stringify({ typebotId, userId }));
  worker.stdin.end();
  const [output, error, exit] = await Promise.all([
    new Response(worker.stdout).text(),
    new Response(worker.stderr).text(),
    worker.exited,
  ]);
  expect(exit, error).toBe(0);
  return JSON.parse(output) as { message: string };
};

const runWorker = async (
  env: Record<string, string | undefined>,
  input: unknown,
) => {
  const worker = Bun.spawn(
    workerCommand("apps/viewer/src/test/integrations/hostPlatformWorker.ts"),
    { cwd: root, env, stdin: "pipe", stdout: "pipe", stderr: "pipe" },
  );
  worker.stdin.write(JSON.stringify(input));
  worker.stdin.end();
  const [output, error, exit] = await Promise.all([
    new Response(worker.stdout).text(),
    new Response(worker.stderr).text(),
    worker.exited,
  ]);
  expect(exit).toBe(0);
  const headers = (input as { headers: Record<string, string> }).headers;
  for (const secret of [
    env.HOST_BRIDGE_SERVICE_KEY,
    env.HOST_SERVICE_AUTH_KEY,
    env.HOST_EXECUTION_CONTEXT_SIGNING_KEY,
    env.HOST_SESSION_BINDING_KEY,
    headers["x-host-execution-context"],
  ]) {
    if (secret) expect(error).not.toContain(secret);
  }
  return JSON.parse(output) as {
    status: number;
    body: {
      sessionId: string;
      sessionBinding: string;
      messages: unknown[];
      input?: { id: string };
    };
  };
};

const workerCommand = (script: string) => [
  process.env.PHASE1B_NODE_BINARY!,
  "--import",
  "tsx",
  resolve(root, script),
];

const launchViewer = async (
  env: Record<string, string | undefined>,
  port: string,
) => {
  const child = Bun.spawn(
    [
      process.env.PHASE1B_NODE_BINARY!,
      resolve(root, "node_modules/next/dist/bin/next"),
      "start",
      "-p",
      port,
      "-H",
      "127.0.0.1",
    ],
    {
      cwd: resolve(root, "apps/viewer"),
      env: {
        ...env,
        NEXTAUTH_URL: "http://localhost:3000",
        NEXT_PUBLIC_VIEWER_URL: `http://127.0.0.1:${port}`,
      },
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const logs = Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      const response = await fetch(
        `http://127.0.0.1:${port}/api/internal/host/start`,
        { method: "POST" },
      );
      if (response.status === 401) return { child, logs };
    } catch {
      // The loopback server is still starting.
    }
    if (child.exitCode !== null) break;
    await Bun.sleep(500);
  }
  child.kill();
  await child.exited;
  throw new Error("Local viewer did not start");
};

const stopViewer = async (
  viewer: Awaited<ReturnType<typeof launchViewer>>,
  secrets: string[],
) => {
  viewer.child.kill();
  await viewer.child.exited;
  const output = (await viewer.logs).join("\n");
  for (const secret of secrets) expect(output).not.toContain(secret);
};

const scanPersistedMarkers = async (markers: string[]) => {
  const pattern = markers
    .map((marker) => marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  const tables = await prisma.$queryRawUnsafe<{ table_name: string }[]>(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'",
  );
  const leakingTables: string[] = [];
  for (const { table_name: name } of tables) {
    const table = name.replaceAll('"', '""');
    const [{ leaked }] = await prisma.$queryRawUnsafe<{ leaked: boolean }[]>(
      `SELECT EXISTS (SELECT 1 FROM public."${table}" t WHERE to_jsonb(t)::text ~ $1) AS leaked`,
      pattern,
    );
    if (leaked) leakingTables.push(name);
  }
  return leakingTables;
};
