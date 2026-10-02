export const hostCapabilityActionName = "hostCapability";

type HostActionMetadata = {
  key: string;
  title: string;
  hostBlock?: {
    blockId?: string;
    legacyActionNames?: string[];
  };
};

export const findHostBlockAction = <T extends HostActionMetadata>(
  actions: T[],
  {
    blockType,
    capabilityKey,
    legacyActionName,
  }: {
    blockType: string;
    capabilityKey?: string;
    legacyActionName?: string;
  },
) => {
  if (capabilityKey)
    return actions.find(
      ({ key, hostBlock }) =>
        key === capabilityKey && hostBlock?.blockId === blockType,
    );
  if (!legacyActionName) return undefined;
  const matches = actions.filter(
    ({ hostBlock }) =>
      hostBlock?.blockId === blockType &&
      hostBlock.legacyActionNames?.includes(legacyActionName),
  );
  return matches.length === 1 ? matches[0] : undefined;
};
