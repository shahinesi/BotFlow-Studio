import { useQuery } from "@tanstack/react-query";
import type { ForgedBlockDefinition } from "@typebot.io/forge-repository/definitions";
import type { ForgedBlock } from "@typebot.io/forge-repository/schemas";
import { type ReactNode, useMemo } from "react";
import { BasicAutocompleteInput } from "@/components/inputs/BasicAutocompleteInput";
import { BasicSelect } from "@/components/inputs/BasicSelect";
import { useWorkspace } from "@/features/workspace/WorkspaceProvider";
import { orpc } from "@/lib/queryClient";
import { findFetcher } from "../helpers/findFetcher";

type Props = {
  blockDef: ForgedBlockDefinition;
  defaultValue?: string;
  fetcherId: string;
  options: ForgedBlock["options"];
  placeholder?: string;
  withVariableButton?: boolean;
  searchable?: boolean;
  credentialsScope: "workspace" | "user";
  onChange: (value: string | undefined) => void;
};
export const ForgeSelectInput = ({
  defaultValue,
  credentialsScope,
  fetcherId,
  options,
  blockDef,
  placeholder,
  withVariableButton = false,
  searchable = false,
  onChange,
}: Props) => {
  const { workspace } = useWorkspace();

  const fetcher = useMemo(
    () => findFetcher(blockDef, fetcherId),
    [blockDef, fetcherId],
  );

  const { data, isError, isFetching, refetch } = useQuery(
    orpc.forge.fetchSelectItems.queryOptions({
      input:
        credentialsScope === "workspace"
          ? {
              scope: "workspace",
              integrationId: blockDef.id,
              options: pick(
                options,
                (blockDef.auth ? ["credentialsId"] : []).concat(
                  fetcher?.dependencies ?? [],
                ),
              ),
              workspaceId: workspace?.id as string,
              fetcherId,
            }
          : {
              scope: "user",
              integrationId: blockDef.id,
              options: {
                credentialsId: options.credentialsId,
              },
              fetcherId,
            },
      enabled: !!workspace?.id && !!fetcher,
    }),
  );
  const shouldIncludeVariables =
    withVariableButton && (data?.items?.length ?? 0) > 0;

  const items = [...(data?.items ?? [])] as {
    label: ReactNode;
    value: string;
  }[];
  if (defaultValue && !items.some((item) => item.value === defaultValue))
    items.unshift({
      value: defaultValue,
      label: `${defaultValue} (not listed by the provider)`,
    });
  const selectedLabel = items.find(
    (item) => item.value === defaultValue,
  )?.label;
  const autocompleteItems = items.map((item) => String(item.label));

  return (
    <div className="flex flex-col gap-2">
      {isError && (
        <p role="alert" className="text-sm text-destructive">
          Options are unavailable.{" "}
          <button
            type="button"
            className="underline"
            disabled={isFetching}
            onClick={() => void refetch()}
          >
            Retry
          </button>
        </p>
      )}
      {searchable ? (
        <BasicAutocompleteInput
          key={defaultValue ?? "new"}
          items={autocompleteItems}
          defaultValue={selectedLabel ? String(selectedLabel) : undefined}
          placeholder={placeholder}
          onChange={(label) => {
            const selected = items.find((item) => String(item.label) === label);
            if (selected) onChange(selected.value);
          }}
        />
      ) : (
        <BasicSelect
          items={items}
          value={defaultValue}
          onChange={onChange}
          includeVariables={shouldIncludeVariables}
          placeholder={placeholder}
          className="flex-1 w-full"
        />
      )}
    </div>
  );
};

function pick<T, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
  if (!obj) return {} as Pick<T, K>;
  const ret: any = {};
  keys.forEach((key) => {
    ret[key] = obj[key];
  });
  return ret;
}
