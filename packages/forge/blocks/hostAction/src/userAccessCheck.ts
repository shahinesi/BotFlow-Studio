import { createAction, createBlock, option } from "@typebot.io/forge";
import { HostCapabilityCheckLogo } from "./hostCapabilityCheckLogo";

export const hostCapabilitiesFetcher = { id: "hostCapabilities" } as const;
export const hostCapabilityActionName = "hostCapabilityCheck";

const hostCapabilityOptions = option.object({
  hostActionKey: option.string.meta({ layout: { isHidden: true } }),
  capabilityKey: option.string.meta({
    layout: {
      label: "Capability",
      placeholder: "Select a capability from the Host",
      inputType: "fetcherAutocomplete",
      fetcher: hostCapabilitiesFetcher.id,
      isRequired: true,
    },
  }),
  outputVariableId: option.string.meta({
    layout: {
      label: "Save result",
      inputType: "variableDropdown",
      isRequired: true,
    },
  }),
});

export const hostCapabilityCheckAction = createAction({
  name: hostCapabilityActionName,
  isHidden: true,
  fetchers: [hostCapabilitiesFetcher],
  options: hostCapabilityOptions,
  getSetVariableIds: ({ outputVariableId }) =>
    outputVariableId ? [outputVariableId] : [],
});

export const hostCapabilityCheckBlock = createBlock({
  id: "host-capability-check",
  name: "Host capability check",
  tags: ["host", "access"],
  LightLogo: HostCapabilityCheckLogo,
  actions: [hostCapabilityCheckAction],
});
