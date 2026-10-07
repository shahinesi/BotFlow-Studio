import { createActionHandler, createFetcherHandler } from "@typebot.io/forge";
import { getHostExecutionContext } from "@typebot.io/runtime-session-store/hostExecutionContext";
import { z } from "zod";
import { hostAction, hostActionsFetcher } from "./hostAction";
import {
  hostAccessChecksFetcher,
  legacyUserAccessCheckAction,
  legacyUserAccessCheckActionName,
  userAccessCheckAction,
} from "./userAccessCheck";

const accessOutcomeSchema = z.enum([
  "AUTHORIZED",
  "DENIED",
  "ACCOUNT_NOT_FOUND",
  "VERIFICATION_REQUIRED",
  "ERROR",
]);

const hostBlockMetadataSchema = z.object({
  type: z.literal("USER_ACCESS_CHECK"),
  blockId: z.string().min(1).max(128).optional(),
  legacyActionNames: z.array(z.string().min(1).max(120)).max(10).optional(),
  accessChecks: z
    .array(
      z.object({
        key: z.string().min(1).max(128),
        title: z.string().min(1).max(120),
        description: z.string().max(500),
      }),
    )
    .max(30),
  outcomes: z.array(accessOutcomeSchema).min(1).max(5),
});

const userAccessCheckCatalogSchema = z.object({
  actions: z.array(
    z.object({
      key: z.string().min(1).max(128),
      hostBlock: hostBlockMetadataSchema.optional(),
    }),
  ),
});

const hostCatalogSchema = z.object({
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

export const hostActionHandler = createActionHandler(hostAction, {
  server: async ({ isPreview, options, variables, logs }) => {
    if (isPreview) {
      if (options.outputVariableId)
        variables.set([
          {
            id: options.outputVariableId,
            value: "This action runs only in a live bot session.",
          },
        ]);
      logs.add({
        status: "info",
        description: "This action runs only in a live bot session.",
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
    const baseUrl = process.env.HOST_API_BASE_URL;
    const serviceKey = process.env.HOST_SERVICE_AUTH_KEY;
    if (!baseUrl || !serviceKey)
      return { error: { description: "Host action catalog unavailable" } };

    try {
      const response = await fetch(
        new URL("/internal/host/actions/catalog", baseUrl),
        {
          headers: { "x-host-service-key": serviceKey },
          redirect: "error",
          signal: AbortSignal.timeout(5000),
        },
      );
      if (!response.ok)
        return { error: { description: "Host action catalog unavailable" } };
      const parsed = hostCatalogSchema.safeParse(await response.json());
      if (!parsed.success)
        return { error: { description: "Host action catalog unavailable" } };

      return {
        data: parsed.data.actions
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

const createUserAccessCheckHandler = (
  action: typeof userAccessCheckAction | typeof legacyUserAccessCheckAction,
  legacy = false,
) =>
  createActionHandler(action, {
    server: async ({ isPreview, options, variables, logs }) => {
      if (isPreview) {
        if (options.outputVariableId)
          variables.set([
            { id: options.outputVariableId, value: "VERIFICATION_REQUIRED" },
          ]);
        logs.add({
          status: "info",
          description: "Host access checks require a real Bot runtime.",
        });
        return;
      }
      try {
        const trusted = getHostExecutionContext();
        const baseUrl = process.env.HOST_API_BASE_URL;
        const serviceKey = process.env.HOST_SERVICE_AUTH_KEY;
        const accessKey = options.accessKey?.trim();
        if (!baseUrl || !serviceKey || !accessKey)
          throw new Error("Host access check unavailable");

        let capabilityKey = options.capabilityKey?.trim();
        if (!capabilityKey && legacy) {
          const catalog = await fetchHostCatalog(baseUrl, serviceKey);
          const matches =
            catalog?.actions.filter(
              (candidate) =>
                candidate.hostBlock?.type === "USER_ACCESS_CHECK" &&
                candidate.hostBlock.legacyActionNames?.includes(
                  legacyUserAccessCheckActionName,
                ),
            ) ?? [];
          if (matches.length === 1) capabilityKey = matches[0].key;
        }
        if (!capabilityKey) throw new Error("Host access check unavailable");

        const response = await fetch(
          new URL(
            `/internal/host/actions/${encodeURIComponent(capabilityKey)}`,
            baseUrl,
          ),
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-host-service-key": serviceKey,
              "x-host-execution-context": trusted.signedContext,
            },
            body: JSON.stringify({ inputs: { accessKey } }),
            redirect: "error",
            signal: AbortSignal.timeout(5000),
          },
        );
        if (!response.ok) throw new Error("Host access check denied");
        const result: unknown = await response.json();
        if (
          !result ||
          typeof result !== "object" ||
          !("kind" in result) ||
          result.kind !== "TEXT" ||
          !("text" in result) ||
          !accessOutcomeSchema.safeParse(result.text).success
        )
          throw new Error("Unexpected Host access result");
        if (options.outputVariableId)
          variables.set([{ id: options.outputVariableId, value: result.text }]);
      } catch {
        logs.add("Host access check unavailable");
        throw new Error("Host access check unavailable");
      }
    },
  });

export const userAccessCheckHandler = createUserAccessCheckHandler(
  userAccessCheckAction,
);
export const legacyUserAccessCheckHandler = createUserAccessCheckHandler(
  legacyUserAccessCheckAction,
  true,
);

const fetchHostCatalog = async (baseUrl: string, serviceKey: string) => {
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
    const parsed = userAccessCheckCatalogSchema.safeParse(
      await response.json(),
    );
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
};

export const hostAccessChecksFetcherHandler = createFetcherHandler(
  userAccessCheckAction,
  hostAccessChecksFetcher.id,
  async () => {
    const baseUrl = process.env.HOST_API_BASE_URL;
    const serviceKey = process.env.HOST_SERVICE_AUTH_KEY;
    if (!baseUrl || !serviceKey)
      return { error: { description: "Host access options unavailable" } };

    try {
      const parsed = await fetchHostCatalog(baseUrl, serviceKey);
      if (!parsed)
        return { error: { description: "Host access options unavailable" } };
      const checks = parsed.actions.flatMap((action) =>
        action.hostBlock?.type === "USER_ACCESS_CHECK"
          ? action.hostBlock.accessChecks
          : [],
      );
      if (new Set(checks.map(({ key }) => key)).size !== checks.length)
        return { error: { description: "Host access options unavailable" } };
      return {
        data: checks.map(({ key, title, description }) => ({
          value: key,
          label: description ? `${title} — ${description}` : title,
        })),
      };
    } catch {
      return { error: { description: "Host access options unavailable" } };
    }
  },
);

export default [
  hostActionsFetcherHandler,
  hostActionHandler,
  hostAccessChecksFetcherHandler,
  userAccessCheckHandler,
  legacyUserAccessCheckHandler,
];
