import { afterEach, expect, it } from "bun:test";
import {
  assertHostTemplateActionsAvailable,
  getHostTemplate,
  getHostTemplateCatalog,
} from "./hostTemplateApi";

const originalFetch = globalThis.fetch;
const originalBaseUrl = process.env.HOST_API_BASE_URL;
const originalServiceKey = process.env.HOST_SERVICE_AUTH_KEY;

afterEach(() => {
  globalThis.fetch = originalFetch;
  process.env.HOST_API_BASE_URL = originalBaseUrl;
  process.env.HOST_SERVICE_AUTH_KEY = originalServiceKey;
});

const setupHost = () => {
  process.env.HOST_API_BASE_URL = "http://host.internal";
  process.env.HOST_SERVICE_AUTH_KEY = "host-service-secret";
};

const setFetch = (fetcher: typeof fetch) => {
  globalThis.fetch = fetcher;
};

it("fetches only safe template metadata from a generic Host", async () => {
  setupHost();
  setFetch(
    Object.assign(async (url: URL, init?: RequestInit) => {
      expect(String(url)).toBe("http://host.internal/internal/host/templates");
      expect(init?.headers).toEqual({
        "x-host-service-key": "host-service-secret",
      });
      expect(init?.redirect).toBe("error");
      return Response.json({
        templates: [
          {
            key: "demo-template",
            name: "Demo template",
            description: "A generic Project B starting point.",
            internalSecret: "not-for-builder",
          },
        ],
      });
    }, originalFetch),
  );

  const result = await getHostTemplateCatalog();
  expect(result.templates).toEqual([
    {
      key: "demo-template",
      name: "Demo template",
      description: "A generic Project B starting point.",
    },
  ]);
  expect(JSON.stringify(result)).not.toContain("host-service-secret");
  expect(JSON.stringify(result)).not.toContain("not-for-builder");
});

it("loads and validates a selected generic Host template server-side", async () => {
  setupHost();
  const calls: string[] = [];
  setFetch(
    Object.assign(async (url: URL, init?: RequestInit) => {
      calls.push(String(url));
      expect(init?.headers).toEqual({
        "x-host-service-key": "host-service-secret",
      });
      if (String(url).endsWith("/internal/host/actions/catalog"))
        return Response.json({
          actions: [
            {
              key: "demo.echo",
              title: "Echo",
              description: "Returns the input.",
              inputs: [{ key: "value", type: "string" }],
              outputs: [{ key: "value", type: "string" }],
            },
            {
              key: "demo.lookup",
              title: "Lookup",
              description: "Finds a demo record.",
              inputs: [{ key: "id", type: "number" }],
              outputs: [{ key: "found", type: "boolean" }],
            },
          ],
        });
      return Response.json({
        template: {
          key: "demo-template",
          name: "Demo template",
          description: "A generic Project B starting point.",
          typebot: {
            version: "6.1",
            groups: [],
            internalSecret: "server-only-definition-field",
          },
        },
      });
    }, originalFetch),
  );

  const template = await getHostTemplate("demo-template");
  expect(template.key).toBe("demo-template");
  await assertHostTemplateActionsAvailable(["demo.echo", "demo.lookup"]);
  expect(calls).toEqual([
    "http://host.internal/internal/host/templates/demo-template",
    "http://host.internal/internal/host/actions/catalog",
  ]);
  expect(JSON.stringify(template)).not.toContain("host-service-secret");
});

it("fails safely for unavailable Hosts, invalid payloads and missing actions", async () => {
  setupHost();
  setFetch(
    Object.assign(
      async () => new Response("secret error", { status: 503 }),
      originalFetch,
    ),
  );
  await expect(getHostTemplateCatalog()).rejects.toThrow(
    "Host templates unavailable",
  );
  await expect(
    assertHostTemplateActionsAvailable(["demo.missing"]),
  ).rejects.toThrow("Host templates unavailable");
  expect(
    JSON.stringify(await Promise.resolve("Host templates unavailable")),
  ).not.toContain("secret error");
});

it("rejects a template response for a different key and an unregistered Action", async () => {
  setupHost();
  setFetch(
    Object.assign(async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/internal/host/actions/catalog"))
        return Response.json({
          actions: [
            {
              key: "demo.echo",
              title: "Echo",
              description: "Returns the supplied value.",
              inputs: [],
              outputs: [],
            },
          ],
        });
      return Response.json({
        template: {
          key: "another-template",
          name: "Mismatched template",
          description: "The key does not match the request.",
          typebot: {},
        },
      });
    }, originalFetch),
  );
  await expect(getHostTemplate("demo-template")).rejects.toThrow(
    "Host templates unavailable",
  );

  setFetch(
    Object.assign(
      async () =>
        Response.json({
          actions: [
            {
              key: "demo.echo",
              title: "Echo",
              description: "Returns the supplied value.",
              inputs: [],
              outputs: [],
            },
          ],
        }),
      originalFetch,
    ),
  );
  await expect(
    assertHostTemplateActionsAvailable(["demo.removed"]),
  ).rejects.toThrow("Host templates unavailable");
});
