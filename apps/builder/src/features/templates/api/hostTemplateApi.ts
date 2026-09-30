import { ORPCError } from "@orpc/server";
import { z } from "zod";

export const hostTemplateMetadataSchema = z.object({
  key: z.string().min(1).max(128),
  name: z.string().min(1).max(120),
  description: z.string().max(1000),
});

export const hostTemplateCatalogSchema = z.object({
  templates: z.array(hostTemplateMetadataSchema).max(100),
});

const hostTemplateSchema = z.object({
  template: hostTemplateMetadataSchema.extend({
    typebot: z.record(z.string(), z.unknown()),
  }),
});

const hostActionCatalogSchema = z.object({
  actions: z.array(
    z.object({
      key: z.string().min(1).max(128),
      title: z.string().min(1).max(120),
      description: z.string().max(1000),
      inputs: z.array(z.unknown()),
      outputs: z.array(z.unknown()),
    }),
  ),
});

export type HostTemplateMetadata = z.infer<typeof hostTemplateMetadataSchema>;

export const getHostTemplateCatalog = () =>
  hostRequest("/internal/host/templates", hostTemplateCatalogSchema);

export const getHostTemplate = async (key: string) => {
  const result = await hostRequest(
    `/internal/host/templates/${encodeURIComponent(key)}`,
    hostTemplateSchema,
  );
  if (result.template.key !== key) throw hostUnavailable();
  return result.template;
};

export const assertHostTemplateActionsAvailable = async (
  actionKeys: string[],
) => {
  if (!actionKeys.length) return;
  const { actions } = await hostRequest(
    "/internal/host/actions/catalog",
    hostActionCatalogSchema,
  );
  const availableActions = new Set(actions.map(({ key }) => key));
  if (actionKeys.some((key) => !availableActions.has(key)))
    throw hostUnavailable();
};

const hostRequest = async <T>(
  path: string,
  schema: z.ZodType<T>,
): Promise<T> => {
  const baseUrl = process.env.HOST_API_BASE_URL;
  const serviceKey = process.env.HOST_SERVICE_AUTH_KEY;
  if (!baseUrl || !serviceKey) throw hostUnavailable();

  try {
    const response = await fetch(new URL(path, baseUrl), {
      headers: { "x-host-service-key": serviceKey },
      redirect: "error",
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw hostUnavailable();
    return schema.parse(await response.json());
  } catch {
    throw hostUnavailable();
  }
};

const hostUnavailable = () =>
  new ORPCError("INTERNAL_SERVER_ERROR", {
    message: "Host templates unavailable",
  });
