import { createAction, option } from "@typebot.io/forge";

export const hostActionsFetcher = { id: "hostActions" } as const;

export const hostAction = createAction({
  name: "Execute Action",
  fetchers: [hostActionsFetcher],
  options: option.object({
    actionKey: option.string.meta({
      layout: {
        label: "Action",
        placeholder: "Select an action from the Host",
        inputType: "fetcherAutocomplete",
        fetcher: hostActionsFetcher.id,
        isRequired: true,
      },
    }),
    inputs: option
      .array(
        option.object({
          key: option.string.meta({ layout: { label: "Key" } }),
          type: option.enum(["string", "number", "boolean"]).meta({
            layout: { label: "Type" },
          }),
          value: option.string.meta({
            layout: { label: "Value", inputType: "textarea" },
          }),
        }),
      )
      .meta({ layout: { accordion: "Inputs" } }),
    outputVariableId: option.string.meta({
      layout: { label: "Save result", inputType: "variableDropdown" },
    }),
  }),
  getSetVariableIds: ({ outputVariableId }) =>
    outputVariableId ? [outputVariableId] : [],
});
