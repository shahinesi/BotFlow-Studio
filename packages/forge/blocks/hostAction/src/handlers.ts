import { createActionHandler, createFetcherHandler } from "@typebot.io/forge";
import { getHostExecutionContext } from "@typebot.io/runtime-session-store/hostExecutionContext";
import { z } from "zod";
import { hostAction, hostActionsFetcher } from "./hostAction";

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
    }),
  ),
});

export const hostActionHandler = createActionHandler(hostAction, {
  server: async ({ options, variables, logs, isPreview }) => {
    if (isPreview) return;
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
        data: parsed.data.actions.map((action) => ({
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

export default [hostActionsFetcherHandler, hostActionHandler];
