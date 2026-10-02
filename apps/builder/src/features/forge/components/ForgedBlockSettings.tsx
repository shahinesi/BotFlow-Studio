import { useQuery } from "@tanstack/react-query";
import type { BlockOptions } from "@typebot.io/blocks-core/schemas/schema";
import type { ForgedBlock } from "@typebot.io/forge-repository/schemas";
import { useOpenControls } from "@typebot.io/ui/hooks/useOpenControls";
import { useEffect, useState } from "react";
import {
  findHostBlockAction,
  hostCapabilityActionName,
} from "@/features/templates/helpers/hostBlockMetadata";
import { orpc } from "@/lib/queryClient";
import { useForgedBlock } from "../hooks/useForgedBlock";
import { ForgedCredentialsCreateDialog } from "./credentials/ForgedCredentialsCreateDialog";
import { ForgedCredentialsDropdown } from "./credentials/ForgedCredentialsDropdown";
import { ForgedOAuthCredentialsCreateDialog } from "./credentials/ForgedOAuthCredentialsCreateDialog";
import { ZodActionDiscriminatedUnion } from "./zodLayouts/ZodActionDiscriminatedUnion";
import { ZodObjectLayout } from "./zodLayouts/ZodObjectLayout";

type Props = {
  block: ForgedBlock;
  onOptionsChange: (options: BlockOptions) => void;
};
export const ForgedBlockSettings = ({ block, onOptionsChange }: Props) => {
  const [keySuffix, setKeySuffix] = useState<number>(0);
  const { blockDef, blockSchema, actionDef } = useForgedBlock({
    nodeType: block.type,
    action: block.options?.action,
  });
  const { isOpen, onOpen, onClose } = useOpenControls();
  const { data: hostCatalog } = useQuery({
    ...orpc.typebot.listHostActions.queryOptions({ input: {} }),
    enabled:
      (blockDef?.tags?.includes("host") ?? false) &&
      block.options?.action !== hostCapabilityActionName &&
      block.options?.capabilityKey === undefined,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (
      !blockDef?.tags?.includes("host") ||
      block.options?.action === hostCapabilityActionName ||
      block.options.capabilityKey !== undefined
    )
      return;
    const capability = hostCatalog
      ? findHostBlockAction(hostCatalog.actions, {
          blockType: block.type,
          legacyActionName: block.options.action,
        })
      : undefined;
    if (!capability) return;
    onOptionsChange({
      ...block.options,
      action: hostCapabilityActionName,
      capabilityKey: capability.key,
    });
  }, [block, blockDef, hostCatalog, onOptionsChange]);

  const updateCredentialsId = (credentialsId?: string) => {
    onOptionsChange({
      ...block.options,
      credentialsId,
    });
  };

  const resetOptionsAction = (updates: any) => {
    if (!actionDef) return;
    const actionOptionsKeys = Object.keys(actionDef.options?.shape ?? []);
    const actionOptions = actionOptionsKeys.reduce<Record<string, unknown>>(
      (acc, key) => {
        acc[key] =
          block.options[key] && typeof block.options[key] !== "object"
            ? block.options[key]
            : undefined;
        return acc;
      },
      {},
    );
    onOptionsChange({
      ...updates,
      ...actionOptions,
    });
    setKeySuffix((prev) => prev + 1);
  };

  const updateOptions = (updates: any) => {
    const isChangingAction =
      actionDef && updates?.action && updates.action !== block.options.action;
    if (isChangingAction) {
      resetOptionsAction(updates);
      return;
    }
    onOptionsChange(updates);
  };

  if (!blockDef || !blockSchema) return null;
  return (
    <div className="flex flex-col gap-4">
      {blockDef.auth && (
        <>
          {blockDef.auth.type === "oauth" ? (
            <ForgedOAuthCredentialsCreateDialog
              scope="workspace"
              blockDef={blockDef}
              isOpen={isOpen}
              onClose={onClose}
              onNewCredentials={updateCredentialsId}
            />
          ) : (
            <ForgedCredentialsCreateDialog
              scope="workspace"
              blockDef={blockDef}
              isOpen={isOpen}
              onClose={onClose}
              onNewCredentials={updateCredentialsId}
            />
          )}

          <ForgedCredentialsDropdown
            scope="workspace"
            key={block.options?.credentialsId ?? "none"}
            blockDef={blockDef}
            currentCredentialsId={block.options?.credentialsId}
            onCredentialsSelect={updateCredentialsId}
            onAddClick={onOpen}
          />
        </>
      )}
      {(block.options !== undefined || blockDef.auth === undefined) && (
        <>
          {blockDef.options && (
            <ZodObjectLayout
              schema={blockDef.options}
              data={block.options}
              blockOptions={block.options}
              blockDef={blockDef}
              onDataChange={onOptionsChange}
            />
          )}
          <ZodActionDiscriminatedUnion
            key={block.id + keySuffix}
            schema={blockSchema.shape.options}
            blockDef={blockDef}
            blockOptions={block.options}
            onDataChange={updateOptions}
          />
        </>
      )}
    </div>
  );
};
