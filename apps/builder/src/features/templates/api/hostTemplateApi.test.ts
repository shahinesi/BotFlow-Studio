import { afterEach, expect, it } from "bun:test";
import { findHostBlockAction } from "../helpers/hostBlockMetadata";
import {
  assertHostTemplateActionsAvailable,
  getHostActionCatalog,
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

it("resolves stable Host block identity independently from presentation metadata", () => {
  const flowOptions = {
    action: "hostCapability",
    capabilityKey: "identity.userAccessCheck",
    accessKey: "cashier-report-read",
    outputVariableId: "accessOutcome",
  };
  const action = {
    key: flowOptions.capabilityKey,
    title: "بررسی دسترسی کاربر",
    description: "Checks access.",
    inputs: [],
    outputs: [],
    hostBlock: { type: "USER_ACCESS_CHECK", blockId: "host-user-access-check" },
  };
  const renamed = { ...action, title: "کنترل دسترسی کاربر" };
  const localized = { ...action, title: "User Access Check" };

  expect(
    findHostBlockAction([renamed], {
      blockType: "host-user-access-check",
      capabilityKey: flowOptions.capabilityKey,
    }),
  ).toMatchObject({
    key: flowOptions.capabilityKey,
    title: "کنترل دسترسی کاربر",
  });
  expect(
    findHostBlockAction([localized], {
      blockType: "host-user-access-check",
      capabilityKey: flowOptions.capabilityKey,
    })?.title,
  ).toBe("User Access Check");
  expect(flowOptions).toEqual({
    action: "hostCapability",
    capabilityKey: "identity.userAccessCheck",
    accessKey: "cashier-report-read",
    outputVariableId: "accessOutcome",
  });
  expect(
    findHostBlockAction([action], {
      blockType: "host-user-access-check",
      capabilityKey: "identity.retiredCapability",
    }),
  ).toBeUndefined();
});

it("normalizes only a unique explicit legacy Host action alias", () => {
  const catalogAction = {
    key: "identity.userAccessCheck",
    title: "Access Check",
    description: "Checks access.",
    inputs: [],
    outputs: [],
    hostBlock: {
      type: "USER_ACCESS_CHECK",
      blockId: "host-user-access-check",
      legacyActionNames: ["بررسی دسترسی کاربر"],
    },
  };
  expect(
    findHostBlockAction([catalogAction], {
      blockType: "host-user-access-check",
      legacyActionName: "بررسی دسترسی کاربر",
    })?.key,
  ).toBe("identity.userAccessCheck");
  expect(
    findHostBlockAction([catalogAction, catalogAction], {
      blockType: "host-user-access-check",
      legacyActionName: "بررسی دسترسی کاربر",
    }),
  ).toBeUndefined();
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
            collection: {
              key: "project-b",
              title: "Project B",
              icon: "building",
              order: 20,
            },
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
      collection: {
        key: "project-b",
        title: "Project B",
        icon: "building",
        order: 20,
      },
    },
  ]);
  expect(JSON.stringify(result)).not.toContain("host-service-secret");
  expect(JSON.stringify(result)).not.toContain("not-for-builder");
});

it("loads only safe Host palette metadata from the existing Action Catalog", async () => {
  setupHost();
  setFetch(
    Object.assign(
      async () =>
        Response.json({
          actions: [
            {
              key: "identity.accessCheck",
              title: "Check user access",
              description: "Checks access for the trusted user.",
              inputs: [{ key: "accessKey", type: "string" }],
              outputs: [{ key: "outcome", type: "string" }],
              hostBlock: {
                type: "USER_ACCESS_CHECK",
                blockId: "host-user-access-check",
                palette: {
                  placement: "host-section",
                  section: {
                    key: "project-b",
                    title: "Project B",
                    icon: "building",
                    order: 20,
                  },
                },
                accessChecks: [
                  {
                    key: "records.read",
                    title: "Read records",
                    description: "View permitted records.",
                  },
                ],
                outcomes: ["AUTHORIZED", "DENIED"],
                authorizationState: "private",
              },
              serviceSecret: "never-returned",
            },
          ],
        }),
      originalFetch,
    ),
  );
  const result = await getHostActionCatalog();
  expect(result.actions[0]?.hostBlock?.palette?.section?.title).toBe(
    "Project B",
  );
  expect(JSON.stringify(result)).not.toContain("never-returned");
  expect(JSON.stringify(result)).not.toContain("authorizationState");
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
