import { createBlock } from "@typebot.io/forge";
import { hostAction } from "./hostAction";
import { HostActionLogo } from "./logo";
import { hostCapabilityCheckBlock } from "./userAccessCheck";

export const hostActionBlock = createBlock({
  id: "host-action",
  name: "Host Action",
  tags: [],
  LightLogo: HostActionLogo,
  actions: [hostAction],
});

export { hostCapabilityCheckBlock };
