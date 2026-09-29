import { expect, it, mock } from "bun:test";
import { createHmac } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

process.env.SKIP_ENV_CHECK = "true";
mock.module("isolated-vm", () => ({
  default: {},
  Isolate: class {},
  Context: class {},
  Reference: class {},
}));

let persistedState: unknown;
const prisma = {
  publicTypebot: {
    findFirst: async () => ({ id: "published-a", typebotId: "typebot-a" }),
  },
};
mock.module("@typebot.io/prisma", () => ({ default: prisma }));
mock.module("@typebot.io/runtime-session-store", () => ({
  withSessionStore: async (
    _id: string,
    run: (store: object) => Promise<unknown>,
  ) => run({}),
}));
mock.module(
  import.meta.resolve("@typebot.io/bot-engine/saveStateToDatabase"),
  () => ({
    saveStateToDatabase: async ({
      session,
      sessionId,
    }: {
      session: { state: unknown };
      sessionId: { id: string };
    }) => {
      persistedState = session.state;
      return { id: sessionId.id };
    },
  }),
);
mock.module("@typebot.io/chat-session/queries/getSession", () => ({
  getSession: async (id: string) => ({
    id,
    state: persistedState,
    updatedAt: new Date(),
  }),
}));

const { walkFlowForward } = await import(
  "@typebot.io/bot-engine/walkFlowForward"
);
const group = {
  id: "group-a",
  blocks: [
    {
      id: "before",
      type: "text",
      content: { richText: [{ type: "p", children: [{ text: "before" }] }] },
    },
    {
      id: "action",
      type: "host-action",
      options: {
        action: "Execute Action",
        actionKey: "system.whoami",
        inputs: [],
        outputVariableId: "diagnostic",
      },
    },
    {
      id: "after",
      type: "text",
      content: { richText: [{ type: "p", children: [{ text: "after" }] }] },
    },
  ],
};
const makeState = () => ({
  version: "3",
  workspaceId: "workspace-a",
  publicTypebotId: "published-a",
  typebotsQueue: [
    {
      answers: [],
      typebot: {
        version: "6.1",
        id: "typebot-a",
        groups: [group],
        events: [],
        edges: [],
        variables: [{ id: "diagnostic", name: "diagnostic" }],
      },
    },
  ],
});

mock.module(import.meta.resolve("@typebot.io/bot-engine/startSession"), () => ({
  startSession: async () => {
    const flow = await walkFlowForward({ type: "group", group } as never, {
      version: 2,
      state: makeState() as never,
      sessionStore: {} as never,
      setVariableHistory: [],
      textBubbleContentFormat: "markdown",
    });
    return {
      typebot: { id: "typebot-a", version: "6.1", theme: {}, settings: {} },
      ...flow,
    };
  },
}));
mock.module(
  import.meta.resolve("@typebot.io/bot-engine/continueBotFlow"),
  () => ({
    continueBotFlow: async () => ({
      messages: [
        { type: "text", content: { type: "markdown", markdown: "continued" } },
      ],
      newSessionState: persistedState,
      logs: [],
      visitedEdges: [],
      setVariableHistory: [],
    }),
  }),
);

const { startHostChat, continueHostChat } = await import(
  "../../app/api/internal/host/bridge"
);
const biSource = resolve(
  process.env.SHAHRFARSH_REPO_ROOT ??
    resolve(import.meta.dir, "../../../../..", "../shahrfarsh-credit-web"),
  "backend/src/bots",
);
const crossRepoTest = existsSync(
  resolve(biSource, "botflow-action-gateway.service.ts"),
)
  ? it
  : it.skip;
const signingKey = "test-signing-key-with-at-least-32-bytes";
const signed = () => {
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({
      version: 1,
      iss: "shahrfarsh-web",
      aud: "botflow-host-action",
      flowId: "flow-a",
      executionId: "execution-a",
      iat: now,
      exp: now + 60,
      claims: {
        botUserId: "user-a",
        connectionId: "connection-a",
        botAppId: "app-a",
      },
    }),
  ).toString("base64url");
  return `${payload}.${createHmac("sha256", signingKey).update(payload).digest("base64url")}`;
};
const request = (token: string, binding?: string) =>
  new Request("http://localhost/private", {
    method: "POST",
    headers: {
      "x-host-service-key": "bridge-service-secret",
      "x-host-execution-context": token,
      ...(binding ? { "x-host-session-binding": binding } : {}),
    },
    body: JSON.stringify({ flowId: "flow-a" }),
  });

crossRepoTest(
  "runs private start through the real BI Action Gateway and registry",
  async () => {
    process.env.HOST_BRIDGE_SERVICE_KEY = "bridge-service-secret";
    process.env.HOST_EXECUTION_CONTEXT_SIGNING_KEY = signingKey;
    process.env.HOST_SESSION_BINDING_KEY =
      "test-binding-key-with-at-least-32-bytes";
    process.env.HOST_API_BASE_URL = "http://localhost";
    process.env.HOST_SERVICE_AUTH_KEY = "action-service-secret";
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
    const biPrisma = {
      botUser: {
        findUnique: async () => ({
          id: "user-a",
          connectionId: "connection-a",
          platform: "TELEGRAM",
          externalUserId: "telegram-a",
          role: "USER",
          status: "ACTIVE",
          phoneVerifiedAt: new Date(),
        }),
      },
      botConnection: {
        findUnique: async () => ({
          id: "connection-a",
          platform: "TELEGRAM",
          status: "ACTIVE",
        }),
      },
      botAppConnection: {
        findUnique: async () => ({
          enabled: true,
          botApp: {
            id: "app-a",
            status: "ACTIVE",
            executionProvider: "BOTFLOW",
            externalFlowId: "flow-a",
          },
        }),
      },
      botFlowSession: { findUnique: async () => null },
      botCommand: {
        findMany: async () => [
          {
            actionKey: "system.whoami",
            policy: "ALL_VERIFIED_USERS",
            enabled: true,
          },
        ],
      },
    };
    const config = {
      get: (key: string) =>
        ({
          BOTFLOW_ACTION_SERVICE_KEY: "action-service-secret",
          BOTFLOW_CONTEXT_SIGNING_KEY: signingKey,
        })[key as "BOTFLOW_ACTION_SERVICE_KEY" | "BOTFLOW_CONTEXT_SIGNING_KEY"],
    };
    const gateway = new BotFlowActionGatewayService(
      config as never,
      biPrisma as never,
      new BotActionRegistry(new InternalActionProvider()),
    );
    const server = Bun.serve({
      port: 0,
      fetch: async (incoming) => {
        try {
          const result = await gateway.execute(
            incoming.headers.get("x-host-service-key") ?? undefined,
            incoming.headers.get("x-host-execution-context") ?? undefined,
            new URL(incoming.url).pathname.split("/").at(-1)!,
            await incoming.json(),
          );
          return Response.json(result);
        } catch {
          return new Response("denied", { status: 403 });
        }
      },
    });
    process.env.HOST_API_BASE_URL = server.url.origin;
    const token = signed();
    try {
      const start = await startHostChat(request(token));
      expect(start.status).toBe(200);
      const response = await start.json();
      expect(response.messages).toHaveLength(2);
      expect(JSON.stringify(persistedState)).not.toContain(token);
      expect(JSON.stringify(persistedState)).not.toContain(
        "action-service-secret",
      );
      expect(JSON.stringify(persistedState)).toContain("TELEGRAM");
      expect(JSON.stringify(response)).not.toContain(token);
      const continued = await continueHostChat(
        request(token, response.sessionBinding),
        response.sessionId,
      );
      expect(continued.status).toBe(200);
      expect((await continued.json()).messages[0].content.markdown).toBe(
        "continued",
      );
    } finally {
      server.stop();
    }
  },
);

it("denies public startChat for the same flow before contacting BI", async () => {
  const { handleStartChat, startChatInputSchema } = await import(
    "@typebot.io/bot-engine/api/handleStartChat"
  );
  let called = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    called = true;
    throw new Error("unexpected BI call");
  }) as typeof fetch;
  try {
    await expect(
      handleStartChat({
        input: startChatInputSchema.parse({ publicId: "flow-a" }),
        context: {},
      }),
    ).rejects.toThrow("Host action unavailable");
    expect(called).toBe(false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
