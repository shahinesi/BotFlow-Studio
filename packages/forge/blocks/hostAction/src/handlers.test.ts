import { afterEach, expect, it } from "bun:test";
import { runWithHostExecutionContext } from "@typebot.io/runtime-session-store/hostExecutionContext";
import {
  hostAccessChecksFetcherHandler,
  hostActionHandler,
  hostActionsFetcherHandler,
  userAccessCheckHandler,
} from "./handlers";
import { hostActionBlockSchema, userAccessCheckBlockSchema } from "./schemas";

const originalFetch = globalThis.fetch;
const originalUrl = process.env.HOST_API_BASE_URL;
const originalKey = process.env.HOST_SERVICE_AUTH_KEY;

afterEach(() => {
  globalThis.fetch = originalFetch;
  process.env.HOST_API_BASE_URL = originalUrl;
  process.env.HOST_SERVICE_AUTH_KEY = originalKey;
});

const execute = (values: string[], logs: string[]) =>
  hostActionHandler.server!({
    credentials: undefined,
    options: {
      actionKey: "system.whoami",
      inputs: [{ key: "name", value: "{{userName}}" }],
      outputVariableId: "result",
    },
    variables: {
      parse: (value: string) => value.replace("{{userName}}", "synthetic-user"),
      set: (items: { value: unknown }[]) => values.push(String(items[0].value)),
    },
    logs: { add: (entry: unknown) => logs.push(String(entry)) },
  } as never);

const trusted = (signedContext: string) => ({
  signedContext,
  envelope: {
    version: 1 as const,
    iss: "example-host",
    aud: "botflow-host-action" as const,
    flowId: "flow-a",
    executionId: "execution-a",
    iat: 1,
    exp: 2,
    claims: {},
  },
});

it("registers a generic Host Action accepting arbitrary host action keys", () => {
  const block = {
    id: "action-a",
    type: "host-action",
    options: {
      action: "Execute Action",
      actionKey: "invoice.lookup",
      inputs: [{ key: "invoiceId", value: "{{id}}" }],
      outputVariableId: "result",
    },
  };
  const parsed = hostActionBlockSchema.safeParse(block);
  expect(parsed.success).toBe(true);
  if (parsed.success)
    expect(parsed.data.options.actionKey).toBe("invoice.lookup");
});

it("parses a persisted User Access Check block without exposing provider details", () => {
  const parsed = userAccessCheckBlockSchema.safeParse({
    id: "access-check-a",
    type: "host-user-access-check",
    options: {
      action: "بررسی دسترسی کاربر",
      accessKey: "cashier-report-read",
      outputVariableId: "access-result",
    },
  });
  expect(parsed.success).toBe(true);
  if (parsed.success)
    expect(parsed.data.options.accessKey).toBe("cashier-report-read");
});

it("maps primitive input types and Flow variables to JSON values", async () => {
  process.env.HOST_API_BASE_URL = "http://localhost:1234";
  process.env.HOST_SERVICE_AUTH_KEY = "host-service-secret";
  globalThis.fetch = (async (_url, init) => {
    expect(JSON.parse(String(init?.body))).toEqual({
      inputs: { count: 12, active: true, label: "hello" },
    });
    return Response.json({ kind: "TEXT", text: "ok" });
  }) as typeof fetch;
  const variables = {
    parse: (value: string) =>
      value.replace("{{count}}", "12").replace("{{active}}", "true"),
    set: () => {},
  };
  await runWithHostExecutionContext(trusted("signed-context"), () =>
    hostActionHandler.server!({
      credentials: undefined,
      options: {
        actionKey: "demo.echo",
        inputs: [
          { key: "count", type: "number", value: "{{count}}" },
          { key: "active", type: "boolean", value: "{{active}}" },
          { key: "label", type: "string", value: "hello" },
        ],
      },
      variables,
      logs: { add: () => {} },
    } as never),
  );
});

it("fetches a generic Host catalog and exposes only selector metadata", async () => {
  process.env.HOST_API_BASE_URL = "http://host.internal";
  process.env.HOST_SERVICE_AUTH_KEY = "host-service-secret";
  globalThis.fetch = (async (url, init) => {
    expect(String(url)).toBe(
      "http://host.internal/internal/host/actions/catalog",
    );
    expect(init?.headers).toEqual({
      "x-host-service-key": "host-service-secret",
    });
    expect(init?.redirect).toBe("error");
    return Response.json({
      actions: [
        {
          key: "demo.echo",
          title: "Echo",
          description: "Returns a value.",
          inputs: [{ key: "value", type: "string", required: true }],
          outputs: [{ key: "value", type: "string" }],
          internalSecret: "catalog-secret-must-not-reach-builder",
        },
        {
          key: "demo.lookup",
          title: "Lookup",
          description: "Looks up a record.",
          inputs: [{ key: "id", type: "number" }],
          outputs: [{ key: "found", type: "boolean" }],
        },
      ],
    });
  }) as typeof fetch;

  const result = await hostActionsFetcherHandler.fetch({
    credentials: undefined,
    options: {},
  });
  expect(result).toMatchObject({
    data: [
      {
        value: "demo.echo",
        label: expect.stringContaining("value: string (required)"),
      },
      {
        value: "demo.lookup",
        label: expect.stringContaining("found: boolean"),
      },
    ],
  });
  expect(JSON.stringify(result)).not.toContain("host-service-secret");
  expect(JSON.stringify(result)).not.toContain(
    "catalog-secret-must-not-reach-builder",
  );
});

it("keeps Host access choices out of the generic action picker and exposes safe labels", async () => {
  process.env.HOST_API_BASE_URL = "http://host.internal";
  process.env.HOST_SERVICE_AUTH_KEY = "host-service-secret";
  globalThis.fetch = Object.assign(
    async () =>
      Response.json({
        actions: [
          {
            key: "demo.echo",
            title: "Echo",
            description: "Returns a value.",
            inputs: [],
            outputs: [],
          },
          {
            key: "identity.userAccessCheck",
            title: "بررسی دسترسی کاربر",
            description: "Host-owned access capability.",
            inputs: [{ key: "accessKey", type: "string", required: true }],
            outputs: [{ key: "outcome", type: "string" }],
            hostBlock: {
              type: "USER_ACCESS_CHECK",
              accessChecks: [
                {
                  key: "feature-read",
                  title: "دسترسی ویژه",
                  description: "بررسی مجوز.",
                },
              ],
              outcomes: ["AUTHORIZED", "DENIED", "ACCOUNT_NOT_FOUND"],
            },
            internalRoute: "/private/report",
          },
        ],
      }),
    { preconnect: originalFetch.preconnect },
  );

  const generic = await hostActionsFetcherHandler.fetch({
    credentials: undefined,
    options: {},
  });
  const choices = await hostAccessChecksFetcherHandler.fetch({
    credentials: undefined,
    options: {},
  });
  expect(generic.data).toHaveLength(1);
  expect(generic.data).toMatchObject([{ value: "demo.echo" }]);
  expect(choices).toEqual({
    data: [
      {
        value: "feature-read",
        label: "دسترسی ویژه — بررسی مجوز.",
      },
    ],
  });
  expect(JSON.stringify(choices)).not.toMatch(
    /identity\.userAccessCheck|host-service-secret|internalRoute|private\/report/,
  );
});

it("executes only the configured access choice and stores a normalized result", async () => {
  process.env.HOST_API_BASE_URL = "http://localhost:1234";
  process.env.HOST_SERVICE_AUTH_KEY = "host-service-secret";
  const values: string[] = [];
  globalThis.fetch = (async (url, init) => {
    expect(String(url)).toBe(
      "http://localhost:1234/internal/host/actions/identity.userAccessCheck",
    );
    expect(init?.headers).toMatchObject({
      "x-host-service-key": "host-service-secret",
      "x-host-execution-context": "signed-host-context",
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      inputs: { accessKey: "feature-read" },
    });
    return Response.json({ kind: "TEXT", text: "AUTHORIZED" });
  }) as typeof fetch;
  await runWithHostExecutionContext(trusted("signed-host-context"), () =>
    userAccessCheckHandler.server!({
      credentials: undefined,
      options: {
        accessKey: "feature-read",
        outputVariableId: "access-result",
      },
      variables: {
        set: (items: { value: unknown }[]) =>
          values.push(String(items[0].value)),
      },
      logs: { add: () => {} },
    } as never),
  );
  expect(values).toEqual(["AUTHORIZED"]);
});

it("rejects malformed access outcomes and does not store them", async () => {
  process.env.HOST_API_BASE_URL = "http://localhost:1234";
  process.env.HOST_SERVICE_AUTH_KEY = "host-service-secret";
  const values: string[] = [];
  globalThis.fetch = Object.assign(
    async () => Response.json({ kind: "TEXT", text: "FORGED_AUTHORIZED" }),
    { preconnect: originalFetch.preconnect },
  );
  const logs: string[] = [];
  await expect(
    runWithHostExecutionContext(trusted("signed-context"), () =>
      userAccessCheckHandler.server!({
        credentials: undefined,
        options: {
          accessKey: "feature-read",
          outputVariableId: "access-result",
        },
        variables: {
          set: (items: { value: unknown }[]) =>
            values.push(String(items[0].value)),
        },
        logs: { add: (entry: unknown) => logs.push(String(entry)) },
      } as never),
    ),
  ).rejects.toThrow("Host access check unavailable");
  expect(values).toEqual([]);
  expect(logs).toEqual(["Host access check unavailable"]);
});

it("returns a controlled catalog error for bad service auth or an unavailable Host", async () => {
  process.env.HOST_API_BASE_URL = "http://host.internal";
  process.env.HOST_SERVICE_AUTH_KEY = "host-service-secret";
  globalThis.fetch = Object.assign(
    async () => new Response("unauthorized", { status: 401 }),
    { preconnect: originalFetch.preconnect },
  );
  const denied = await hostActionsFetcherHandler.fetch({
    credentials: undefined,
    options: {},
  });
  expect(denied.error?.description).toBe("Host action catalog unavailable");
  expect(JSON.stringify(denied)).not.toContain("host-service-secret");

  globalThis.fetch = Object.assign(
    async () => {
      throw new Error("network details");
    },
    { preconnect: originalFetch.preconnect },
  );
  const unavailable = await hostActionsFetcherHandler.fetch({
    credentials: undefined,
    options: {},
  });
  expect(unavailable.error?.description).toBe(
    "Host action catalog unavailable",
  );
  expect(JSON.stringify(unavailable)).not.toContain("network details");
});

it("rejects malformed Host catalog metadata instead of inventing selector items", async () => {
  process.env.HOST_API_BASE_URL = "http://host.internal";
  process.env.HOST_SERVICE_AUTH_KEY = "host-service-secret";
  globalThis.fetch = Object.assign(
    async () => Response.json({ actions: [{ key: "demo.invalid" }] }),
    { preconnect: originalFetch.preconnect },
  );
  const result = await hostActionsFetcherHandler.fetch({
    credentials: undefined,
    options: {},
  });
  expect(result.error?.description).toBe("Host action catalog unavailable");
  expect(result.data).toBeUndefined();
});

it("fails closed on public execution without sending a request", async () => {
  let called = false;
  globalThis.fetch = Object.assign(
    async () => {
      called = true;
      throw new Error();
    },
    { preconnect: originalFetch.preconnect },
  );
  await expect(execute([], [])).rejects.toThrow("Host action unavailable");
  expect(called).toBe(false);
});

it("calls the configured Host Action endpoint and stores only controlled output", async () => {
  process.env.HOST_API_BASE_URL = "http://localhost:1234";
  process.env.HOST_SERVICE_AUTH_KEY = "host-service-secret";
  const values: string[] = [];
  const logs: string[] = [];
  globalThis.fetch = (async (url, init) => {
    expect(String(url)).toBe(
      "http://localhost:1234/internal/host/actions/system.whoami",
    );
    expect(init?.redirect).toBe("error");
    expect(init?.headers).toMatchObject({
      "x-host-service-key": "host-service-secret",
      "x-host-execution-context": "signed-host-context",
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      inputs: { name: "synthetic-user" },
    });
    return Response.json({ kind: "TEXT", text: "controlled-result" });
  }) as typeof fetch;
  await runWithHostExecutionContext(trusted("signed-host-context"), () =>
    execute(values, logs),
  );
  expect(values).toEqual(["controlled-result"]);
  expect(logs).toEqual([]);
  expect(JSON.stringify({ values, logs })).not.toContain("signed-host-context");
  expect(JSON.stringify({ values, logs })).not.toContain("host-service-secret");
});

it("isolates concurrent Host contexts and logs only a generic failure", async () => {
  process.env.HOST_API_BASE_URL = "http://localhost:1234";
  process.env.HOST_SERVICE_AUTH_KEY = "host-service-secret";
  globalThis.fetch = (async (_url, init) => {
    const context = (init?.headers as Record<string, string>)[
      "x-host-execution-context"
    ];
    await new Promise((resolve) =>
      setTimeout(resolve, context === "signed-a" ? 10 : 1),
    );
    if (context === "signed-b") return new Response("denied", { status: 403 });
    return Response.json({ kind: "TEXT", text: "host-a" });
  }) as typeof fetch;
  const a: string[] = [];
  const b: string[] = [];
  const logs: string[] = [];
  const [first, second] = await Promise.allSettled([
    runWithHostExecutionContext(trusted("signed-a"), () => execute(a, [])),
    runWithHostExecutionContext(trusted("signed-b"), () => execute(b, logs)),
  ]);
  expect(first.status).toBe("fulfilled");
  expect(second.status).toBe("rejected");
  expect(a).toEqual(["host-a"]);
  expect(b).toEqual([]);
  expect(logs).toEqual(["Host action unavailable"]);
});
