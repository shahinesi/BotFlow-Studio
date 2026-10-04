export const hostCapabilityActionName = "hostCapabilityCheck";

export const findHostBlockAction = <
  T extends {
    key: string;
    title: string;
    hostBlock?: { blockId: string; type: string };
  },
>(
  actions: T[],
  {
    blockType,
    hostActionKey,
  }: {
    blockType: string;
    hostActionKey?: string;
  },
) => {
  if (!hostActionKey) return undefined;
  return actions.find(
    ({ key, hostBlock }) =>
      key === hostActionKey &&
      hostBlock?.type === "CAPABILITY_CHECK" &&
      hostBlock.blockId === blockType,
  );
};
