import { createAction, createBlock, option } from "@typebot.io/forge";
import { UserAccessCheckLogo } from "./userAccessCheckLogo";

export const hostAccessChecksFetcher = { id: "hostAccessChecks" } as const;

export const userAccessCheckAction = createAction({
  name: "بررسی دسترسی کاربر",
  fetchers: [hostAccessChecksFetcher],
  options: option.object({
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
  name: "بررسی دسترسی کاربر",
  tags: ["host", "دسترسی"],
  LightLogo: UserAccessCheckLogo,
  actions: [userAccessCheckAction],
});
