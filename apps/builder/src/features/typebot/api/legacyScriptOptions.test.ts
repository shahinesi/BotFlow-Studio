import { afterEach, beforeEach, expect, it, mock } from "bun:test";
import { IntegrationBlockType } from "@typebot.io/blocks-integrations/constants";
import { LogicBlockType } from "@typebot.io/blocks-logic/constants";
import { clientSideActionSchema } from "@typebot.io/chat-api/clientSideAction";
import {
  CollaborationType,
  Plan,
  WorkspaceRole,
} from "@typebot.io/prisma/enum";
import { typebotV6Schema } from "@typebot.io/typebot/schemas/typebot";

process.env.SKIP_ENV_CHECK = "true";
const create = mock();
const update = mock();
const findFirst = mock();
const findWebhooks = mock();
const workspace = {
  id: "workspace",
  plan: Plan.FREE,
  isSuspended: false,
  isPastDue: false,
  members: [{ userId: "owner", role: WorkspaceRole.ADMIN }],
};
const stored = typebotV6Schema.parse({
  id: "bot",
  version: "6.1",
  name: "Script safety",
  workspaceId: workspace.id,
  groups: [],
  variables: [],
  edges: [],
  theme: {},
  settings: {},
  events: [{ id: "start", type: "start", graphCoordinates: { x: 0, y: 0 } }],
  createdAt: new Date(),
  updatedAt: new Date(),
  icon: null,
  folderId: null,
  publicId: null,
  customDomain: null,
  resultsTablePreferences: null,
  selectedThemeTemplateId: null,
  whatsAppCredentialsId: null,
  riskLevel: null,
  spaceId: null,
  isArchived: false,
  isClosed: false,
});
const demoHostTypebot = {
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
const originalFetch = globalThis.fetch;
const originalHostBaseUrl = process.env.HOST_API_BASE_URL;
const originalHostServiceKey = process.env.HOST_SERVICE_AUTH_KEY;
mock.module("@typebot.io/prisma", () => ({
  default: {
    workspace: { findUnique: async () => workspace },
    typebot: { create, update, findFirst },
    webhook: { findMany: findWebhooks },
  },
}));
mock.module("@typebot.io/telemetry/trackEvents", () => ({
  trackEvents: async () => {},
}));
mock.module("@typebot.io/lib/s3/copyObjects", () => ({
  copyObjects: async () => {},
}));
mock.module("@typebot.io/lib/s3/replaceTypebotUploadUrlsWithNewIds", () => ({
  replaceTypebotUploadUrlsWithNewIds: async ({
    typebot,
  }: {
    typebot: unknown;
  }) => ({
    typebot,
    filesToCopy: [],
  }),
}));

const { handleCreateTypebot, createTypebotInputSchema } = await import(
  "./handleCreateTypebot"
);
const { handleUpdateTypebot, updateTypebotInputSchema } = await import(
  "./handleUpdateTypebot"
);
const { handleImportTypebot, importTypebotInputSchema } = await import(
  "./handleImportTypebot"
);

beforeEach(() => {
  create.mockReset();
  update.mockReset();
  findFirst.mockReset();
  findWebhooks.mockReset();
  findWebhooks.mockResolvedValue([]);
  // Stop at the persistence boundary: inspect the exact write, without mocking
  // the sanitizer, authorization, input schema, or import migration.
  create.mockRejectedValue(new Error("persist"));
  update.mockRejectedValue(new Error("persist"));
  findFirst.mockResolvedValue({
    ...stored,
    workspace,
    collaborators: [{ userId: "collaborator", type: CollaborationType.WRITE }],
  });
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  process.env.HOST_API_BASE_URL = originalHostBaseUrl;
  process.env.HOST_SERVICE_AUTH_KEY = originalHostServiceKey;
});

const groups = [
  {
    id: "group",
    title: "Scripts",
    graphCoordinates: { x: 100, y: 0 },
    blocks: [
      {
        id: "code",
        type: LogicBlockType.SCRIPT,
        options: {
          content: 'return "ok"',
          isUnsafe: false,
          isExecutedOnClient: true,
        },
      },
      {
        id: "variable",
        type: LogicBlockType.SET_VARIABLE,
        options: {
          type: "Custom",
          isCode: true,
          expressionToEvaluate: "40 + 2",
          isUnsafe: true,
          isExecutedOnClient: false,
        },
      },
    ],
  },
];

const expectLegacyFlagsRemoved = (value: unknown) => {
  expect(value).toMatchObject([
    {
      blocks: [
        { options: { content: 'return "ok"', isExecutedOnClient: true } },
        {
          options: {
            expressionToEvaluate: "40 + 2",
            isCode: true,
            isExecutedOnClient: false,
          },
        },
      ],
    },
  ]);
  expect(JSON.stringify(value)).not.toContain('"isUnsafe"');
};

it("loads stored bots with or without legacy flags", () => {
  const parsed = typebotV6Schema.parse({ ...stored, groups });
  expectLegacyFlagsRemoved(parsed.groups);
  expect(typebotV6Schema.parse(parsed)).toEqual(parsed);
});

it("create drops legacy flags before persistence", async () => {
  await expect(
    handleCreateTypebot({
      input: createTypebotInputSchema.parse({
        workspaceId: workspace.id,
        typebot: { groups },
      }),
      context: { user: { id: "owner" } },
    }),
  ).rejects.toThrow("persist");
  expectLegacyFlagsRemoved(create.mock.calls[0][0].data.groups);
});

it("WRITE collaborator update drops legacy flags before persistence", async () => {
  await expect(
    handleUpdateTypebot({
      input: updateTypebotInputSchema.parse({
        typebotId: stored.id,
        typebot: { groups },
      }),
      context: { user: { id: "collaborator" } },
    }),
  ).rejects.toThrow("persist");
  expectLegacyFlagsRemoved(update.mock.calls[0][0].data.groups);
});

it("import ignores the retired safety opt-out", async () => {
  const input = importTypebotInputSchema.parse({
    workspaceId: workspace.id,
    typebot: { ...stored, groups },
    enableSafetyFlags: false,
  });
  expect(input).not.toHaveProperty("enableSafetyFlags");
  await expect(
    handleImportTypebot({ input, context: { user: { id: "owner" } } }),
  ).rejects.toThrow("persist");
  expectLegacyFlagsRemoved(create.mock.calls[0][0].data.groups);
});

it("keeps built-in template import independent from Host availability", async () => {
  let hostRequestSent = false;
  globalThis.fetch = Object.assign(async () => {
    hostRequestSent = true;
    throw new Error("Host should not be requested for built-ins");
  }, originalFetch) as typeof fetch;

  const input = importTypebotInputSchema.parse({
    workspaceId: workspace.id,
    templateSlug: "faq",
    folderId: null,
  });
  await expect(
    handleImportTypebot({ input, context: { user: { id: "owner" } } }),
  ).rejects.toThrow("persist");

  expect(hostRequestSent).toBe(false);
  expect(create.mock.calls[0][0].data.name).toBe("FAQ");
});

it("creates an editable Typebot through the official import path for a generic Host template", async () => {
  process.env.HOST_API_BASE_URL = "http://host.internal";
  process.env.HOST_SERVICE_AUTH_KEY = "server-only-host-key";
  globalThis.fetch = Object.assign(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.headers).toEqual({
        "x-host-service-key": "server-only-host-key",
      });
      if (String(input).endsWith("/internal/host/actions/catalog"))
        return Response.json({
          actions: [
            {
              key: "demo.echo",
              title: "Echo",
              description: "Returns the supplied value.",
              inputs: [],
              outputs: [{ key: "text", type: "string" }],
            },
          ],
        });
      expect(String(input)).toBe(
        "http://host.internal/internal/host/templates/demo-template",
      );
      return Response.json({
        template: {
          key: "demo-template",
          name: "Demo template",
          description: "A generic Project B starting point.",
          typebot: demoHostTypebot,
        },
      });
    },
    originalFetch,
  ) as typeof fetch;
  create.mockImplementation(
    async ({ data }: { data: Record<string, unknown> }) => {
      const persistedData = Object.fromEntries(
        Object.entries(data).filter(([, value]) => value !== undefined),
      );
      return typebotV6Schema.parse({
        ...stored,
        ...persistedData,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    },
  );

  const input = importTypebotInputSchema.parse({
    workspaceId: workspace.id,
    hostTemplateKey: "demo-template",
  });
  const result = await handleImportTypebot({
    input,
    context: { user: { id: "owner" } },
  });

  expect(result.typebot.name).toBe("Demo template");
  expect(result.typebot.id).toBeTruthy();
  expect(result.typebot.groups.flatMap(({ blocks }) => blocks)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        type: "host-action",
        options: expect.objectContaining({ actionKey: "demo.echo" }),
      }),
      expect.objectContaining({ type: "choice input" }),
    ]),
  );
  expect(create).toHaveBeenCalledTimes(1);
  expect(create.mock.calls[0][0].data).not.toHaveProperty("hostTemplateKey");
  expect(JSON.stringify(result)).not.toContain("server-only-host-key");
});

it.each([
  true,
  false,
])("legacy update preserves script isolation and webhook ownership (owned: %s)", async (isOwned) => {
  findWebhooks.mockResolvedValue(isOwned ? [{ id: "legacy-webhook" }] : []);

  const updating = handleUpdateTypebot({
    input: updateTypebotInputSchema.parse({
      typebotId: stored.id,
      typebot: {
        version: "5",
        groups: [
          ...groups,
          {
            id: "legacy-webhooks",
            title: "Legacy webhooks",
            graphCoordinates: { x: 0, y: 0 },
            blocks: [
              {
                id: "legacy-http",
                type: IntegrationBlockType.HTTP_REQUEST,
                webhookId: "legacy-webhook",
              },
            ],
          },
        ],
      },
    }),
    context: { user: { id: "collaborator" } },
  });

  if (isOwned) {
    await expect(updating).rejects.toThrow("persist");
    expectLegacyFlagsRemoved(update.mock.calls[0][0].data.groups.slice(0, 1));
    expect(update.mock.calls[0][0].data.groups[1].blocks[0]).toMatchObject({
      webhookId: "legacy-webhook",
    });
  } else {
    await expect(updating).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Invalid legacy webhook reference",
    });
    expect(update).not.toHaveBeenCalled();
  }
  expect(findWebhooks).toHaveBeenCalledWith({
    where: { id: { in: ["legacy-webhook"] }, typebotId: stored.id },
    select: { id: true },
  });
});

it("still rejects a read-only collaborator", async () => {
  findFirst.mockResolvedValue({
    ...stored,
    workspace,
    collaborators: [{ userId: "collaborator", type: CollaborationType.READ }],
  });
  await expect(
    handleUpdateTypebot({
      input: { typebotId: stored.id, typebot: { groups: [] } },
      context: { user: { id: "collaborator" } },
    }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(update).not.toHaveBeenCalled();
});

it("accepts legacy action flags for clients on either side of the rollout", () => {
  for (const action of [
    {
      type: "scriptToExecute",
      scriptToExecute: { content: "40 + 2", args: [], isUnsafe: false },
    },
    {
      type: "setVariable",
      setVariable: {
        scriptToExecute: { content: "40 + 2", args: [], isUnsafe: true },
      },
    },
  ]) {
    const parsed = clientSideActionSchema.parse(action);
    expect(parsed).toEqual(action);
    expect(JSON.stringify(parsed)).toContain('"content":"40 + 2"');
  }
});
