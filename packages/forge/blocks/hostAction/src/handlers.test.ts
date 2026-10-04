import { afterEach, expect, it } from "bun:test";
import { runWithHostExecutionContext } from "@typebot.io/runtime-session-store/hostExecutionContext";
import { hostActionHandler, hostActionsFetcherHandler } from "./handlers";
import { hostActionBlockSchema } from "./schemas";

const originalFetch = globalThis.fetch;
const originalUrl = process.env.HOST_API_BASE_URL;
const originalKey = process.env.HOST_SERVICE_AUTH_KEY;

afterEach(() => {
  globalThis.fetch = originalFetch;
  process.env.HOST_API_BASE_URL = originalUrl;
  process.env.HOST_SERVICE_AUTH_KEY = originalKey;
});

const execute = (values: string[], logs: string[], isPreview = false) =>
  hostActionHandler.server!({
    credentials: undefined,
    options: {
      actionKey: "example.echo",
      inputs: [{ key: "name", value: "{{userName}}" }],
      outputVariableId: "result",
    },
    variables: {
      parse: (value: string) => value.replace("{{userName}}", "synthetic-user"),
      set: (items: { value: unknown }[]) => values.push(String(items[0].value)),
    },
    logs: { add: (entry: unknown) => logs.push(String(entry)) },
    isPreview,
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

it("does not call the Host from Builder preview", async () => {
  let called = false;
  globalThis.fetch = Object.assign(
    async () => {
      called = true;
      throw new Error();
    },
    { preconnect: originalFetch.preconnect },
  );
  const logs: string[] = [];
  await execute([], logs, true);
  expect(called).toBe(false);
  expect(logs).toEqual([]);
});

it("calls the configured Host Action endpoint and stores only controlled output", async () => {
  process.env.HOST_API_BASE_URL = "http://localhost:1234";
  process.env.HOST_SERVICE_AUTH_KEY = "host-service-secret";
  const values: string[] = [];
  const logs: string[] = [];
  globalThis.fetch = (async (url, init) => {
    expect(String(url)).toBe(
      "http://localhost:1234/internal/host/actions/example.echo",
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
