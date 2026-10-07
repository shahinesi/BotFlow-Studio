import { createAction, createBlock, option } from "@typebot.io/forge";
import { UserAccessCheckLogo } from "./userAccessCheckLogo";

export const hostAccessChecksFetcher = { id: "hostAccessChecks" } as const;
export const hostCapabilityActionName = "hostCapability";
export const legacyUserAccessCheckActionName = "بررسی دسترسی کاربر";

const accessCheckOptions = option.object({
  capabilityKey: option.string.meta({ layout: { isHidden: true } }),
  accessKey: option.string.meta({
    layout: {
      label: "دسترسی مورد بررسی",
      placeholder: "انتخاب دسترسی",
      inputType: "fetcherAutocomplete",
      fetcher: hostAccessChecksFetcher.id,
      isRequired: true,
    },
  }),
  outputVariableId: option.string.meta({
    layout: {
      label: "ذخیره نتیجه برای شاخه‌بندی",
      inputType: "variableDropdown",
      isRequired: true,
    },
  }),
});

export const userAccessCheckAction = createAction({
  name: hostCapabilityActionName,
  isHidden: true,
  fetchers: [hostAccessChecksFetcher],
  options: accessCheckOptions,
  getSetVariableIds: ({ outputVariableId }) =>
    outputVariableId ? [outputVariableId] : [],
});

export const legacyUserAccessCheckAction = createAction({
  name: legacyUserAccessCheckActionName,
  isHidden: true,
  fetchers: [hostAccessChecksFetcher],
  options: option.object({
    capabilityKey: option.string.meta({
      layout: { isHidden: true },
    }),
    accessKey: option.string.meta({
      layout: {
        label: "دسترسی مورد بررسی",
        placeholder: "انتخاب دسترسی",
        inputType: "fetcherAutocomplete",
        fetcher: hostAccessChecksFetcher.id,
        isRequired: true,
      },
    }),
    outputVariableId: option.string.meta({
      layout: {
        label: "ذخیره نتیجه برای شاخه‌بندی",
        inputType: "variableDropdown",
        isRequired: true,
      },
    }),
  }),
  getSetVariableIds: ({ outputVariableId }) =>
    outputVariableId ? [outputVariableId] : [],
});

export const userAccessCheckBlock = createBlock({
  id: "host-user-access-check",
  name: "Host capability",
  tags: ["host", "access"],
  LightLogo: UserAccessCheckLogo,
  actions: [userAccessCheckAction, legacyUserAccessCheckAction],
});
