import { createActionHandler, createFetcherHandler } from "@typebot.io/forge";
import { getHostExecutionContext } from "@typebot.io/runtime-session-store/hostExecutionContext";
import { z } from "zod";
import { hostAction, hostActionsFetcher } from "./hostAction";
import {
  hostCapabilitiesFetcher,
  hostCapabilityCheckAction,
} from "./userAccessCheck";

const capabilityOutcomeSchema = z.enum(["ALLOWED", "DENIED"]);
const hostCapabilityBlockId = "host-capability-check";

const hostBlockMetadataSchema = z.object({
  type: z.literal("CAPABILITY_CHECK"),
  blockId: z.literal(hostCapabilityBlockId),
  capabilities: z
    .array(
      z.object({
        key: z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/),
        title: z.string().trim().min(1).max(120),
        description: z.string().max(500),
      }),
    )
    .max(30),
  palette: z
    .object({
      placement: z.literal("host-section"),
      section: z.object({
        key: z.string().regex(/^[A-Za-z0-9._:-]{1,64}$/),
        title: z.string().trim().min(1).max(80),
        icon: z.enum(["building", "shield", "grid"]).optional(),
        order: z.number().int().min(0).max(1000).optional(),
      }),
    })
    .optional(),
});

export const hostActionCatalogSchema = z.object({
  actions: z.array(
    z.object({
      key: z.string().min(1).max(128),
      title: z.string().min(1).max(120),
      description: z.string().max(1000),
      inputs: z
        .array(
          z.object({
            key: z.string().min(1).max(128),
            type: z.enum(["string", "number", "boolean"]),
            required: z.boolean().optional(),
          }),
        )
        .max(30),
      outputs: z
        .array(
          z.object({
            key: z.string().min(1).max(128),
            type: z.enum(["string", "number", "boolean"]),
          }),
        )
        .max(30),
      hostBlock: hostBlockMetadataSchema.optional(),
    }),
  ),
});

export const getHostActionCatalog = async () => {
  const baseUrl = process.env.HOST_API_BASE_URL;
  const serviceKey = process.env.HOST_SERVICE_AUTH_KEY;
  if (!baseUrl || !serviceKey) return undefined;

  try {
    const response = await fetch(
      new URL("/internal/host/actions/catalog", baseUrl),
      {
        headers: { "x-host-service-key": serviceKey },
        redirect: "error",
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!response.ok) return undefined;
    const parsed = hostActionCatalogSchema.safeParse(await response.json());
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
};

export const hostActionHandler = createActionHandler(hostAction, {
  server: async ({ isPreview, options, variables, logs }) => {
    if (isPreview) {
      if (options.outputVariableId)
        variables.set([
          {
            id: options.outputVariableId,
            value: "Host Action skipped in Preview",
          },
        ]);
      logs.add({
        status: "info",
        description: "Host Actions are not executed in Builder Preview.",
      });
      return;
    }
    try {
      const trusted = getHostExecutionContext();
      const baseUrl = process.env.HOST_API_BASE_URL;
      const serviceKey = process.env.HOST_SERVICE_AUTH_KEY;
      const actionKey = options.actionKey?.trim();
      if (!baseUrl || !serviceKey || !actionKey)
        throw new Error("Host action unavailable");
      const response = await fetch(
        new URL(
          `/internal/host/actions/${encodeURIComponent(actionKey)}`,
          baseUrl,
        ),
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-host-service-key": serviceKey,
            "x-host-execution-context": trusted.signedContext,
          },
          body: JSON.stringify({
            inputs: Object.fromEntries(
              (options.inputs ?? []).map(({ key, type, value }) => {
                const parsed = variables.parse(value ?? "");
                if (type === "number") {
                  if (!parsed.trim())
                    throw new Error("Invalid Host action input");
                  const number = Number(parsed);
                  if (!Number.isFinite(number))
                    throw new Error("Invalid Host action input");
                  return [key, number];
                }
                if (type === "boolean") {
                  if (parsed !== "true" && parsed !== "false")
                    throw new Error("Invalid Host action input");
                  return [key, parsed === "true"];
                }
                return [key, parsed];
              }),
            ),
          }),
          redirect: "error",
          signal: AbortSignal.timeout(5000),
        },
      );
      if (!response.ok) throw new Error("Host action denied request");
      const result: unknown = await response.json();
      if (
        !result ||
        typeof result !== "object" ||
        !("kind" in result) ||
        result.kind !== "TEXT" ||
        !("text" in result) ||
        typeof result.text !== "string"
      )
        throw new Error("Unexpected host action result");
      const outputVariableId = options.outputVariableId;
      if (outputVariableId)
        variables.set([{ id: outputVariableId, value: result.text }]);
    } catch {
      logs.add("Host action unavailable");
      throw new Error("Host action unavailable");
    }
  },
});

export const hostActionsFetcherHandler = createFetcherHandler(
  hostAction,
  hostActionsFetcher.id,
  async () => {
    try {
      const catalog = await getHostActionCatalog();
      if (!catalog)
        return { error: { description: "Host action catalog unavailable" } };

      return {
        data: catalog.actions
          .filter((action) => !action.hostBlock)
          .map((action) => ({
            value: action.key,
            label: `${action.title} (${action.key}) — ${action.description}${
              action.inputs.length
                ? ` · Inputs: ${action.inputs
                    .map(
                      ({ key, type, required }) =>
                        `${key}: ${type}${required ? " (required)" : ""}`,
                    )
                    .join(", ")}`
                : " · No inputs"
            } · Outputs: ${action.outputs.map(({ key, type }) => `${key}: ${type}`).join(", ")}`,
          })),
      };
    } catch {
      return { error: { description: "Host action catalog unavailable" } };
    }
  },
);

export const hostCapabilityCheckHandler = createActionHandler(
  hostCapabilityCheckAction,
  {
    server: async ({ isPreview, options, variables, logs }) => {
      if (isPreview) {
        if (options.outputVariableId)
          variables.set([{ id: options.outputVariableId, value: "DENIED" }]);
        logs.add({
          status: "info",
          description: "Host capability checks do not run in Preview.",
        });
        return;
      }
      try {
        const trusted = getHostExecutionContext();
        const baseUrl = process.env.HOST_API_BASE_URL;
        const serviceKey = process.env.HOST_SERVICE_AUTH_KEY;
        const hostActionKey = options.hostActionKey?.trim();
        const capabilityKey = options.capabilityKey?.trim();
        if (!baseUrl || !serviceKey || !hostActionKey || !capabilityKey)
          throw new Error("Host capability check unavailable");

        const response = await fetch(
          new URL(
            `/internal/host/actions/${encodeURIComponent(hostActionKey)}`,
            baseUrl,
          ),
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-host-service-key": serviceKey,
              "x-host-execution-context": trusted.signedContext,
            },
            body: JSON.stringify({ inputs: { capabilityKey } }),
            redirect: "error",
            signal: AbortSignal.timeout(5000),
          },
        );
        if (!response.ok) throw new Error("Host capability check denied");
        const result: unknown = await response.json();
        if (
          !result ||
          typeof result !== "object" ||
          !("kind" in result) ||
          result.kind !== "TEXT" ||
          !("text" in result) ||
          !capabilityOutcomeSchema.safeParse(result.text).success
        )
          throw new Error("Unexpected Host capability result");
        if (options.outputVariableId)
          variables.set([{ id: options.outputVariableId, value: result.text }]);
      } catch {
        logs.add("Host capability check unavailable");
        throw new Error("Host capability check unavailable");
      }
    },
  },
);

export const hostCapabilitiesFetcherHandler = createFetcherHandler(
  hostCapabilityCheckAction,
  hostCapabilitiesFetcher.id,
  async () => {
    try {
      const parsed = await getHostActionCatalog();
      if (!parsed)
        return { error: { description: "Host capabilities unavailable" } };
      const capabilities = parsed.actions.flatMap((action) =>
        action.hostBlock?.type === "CAPABILITY_CHECK"
          ? action.hostBlock.capabilities
          : [],
      );
      if (
        new Set(capabilities.map(({ key }) => key)).size !== capabilities.length
      )
        return { error: { description: "Host capabilities unavailable" } };
      return {
        data: capabilities.map(({ key, title, description }) => ({
          value: key,
          label: description ? `${title} — ${description}` : title,
        })),
      };
    } catch {
      return { error: { description: "Host capabilities unavailable" } };
    }
  },
);

export default [
  hostActionsFetcherHandler,
  hostActionHandler,
  hostCapabilitiesFetcherHandler,
  hostCapabilityCheckHandler,
];
