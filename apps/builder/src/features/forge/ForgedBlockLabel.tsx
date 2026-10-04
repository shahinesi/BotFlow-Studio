import { useQuery } from "@tanstack/react-query";
import type { BlockDefinition } from "@typebot.io/forge/types";
import type { ForgedBlock } from "@typebot.io/forge-repository/schemas";
import { Badge } from "@typebot.io/ui/components/Badge";
import { cn } from "@typebot.io/ui/lib/cn";
import { orpc } from "@/lib/queryClient";
import { useForgedBlock } from "./hooks/useForgedBlock";

export const ForgedBlockLabel = ({
  type,
  className,
}: {
  type: ForgedBlock["type"];
  className?: string;
}) => {
  const { blockDef } = useForgedBlock({ nodeType: type });
  const { data: hostActionCatalog } = useQuery({
    ...orpc.typebot.listHostActions.queryOptions({ input: {} }),
    enabled: blockDef?.tags?.includes("host") ?? false,
    staleTime: 60_000,
  });
  const hostTitle = hostActionCatalog?.actions.find(
    (action) => action.hostBlock?.blockId === type,
  )?.title;

  return (
    <p className={cn("text-sm", className)}>
      {hostTitle ??
        (blockDef?.tags?.includes("host")
          ? "Host capability unavailable"
          : blockDef?.name)}
      <ForgeBlockBadge badge={blockDef?.badge} className="ml-1" />
    </p>
  );
};

const ForgeBlockBadge = ({
  badge,
  className,
}: {
  badge: BlockDefinition<any, any, any>["badge"];
  className?: string;
}) => {
  if (badge === "beta") {
    return (
      <Badge colorScheme="orange" className={className}>
        Beta
      </Badge>
    );
  }
  return null;
};
