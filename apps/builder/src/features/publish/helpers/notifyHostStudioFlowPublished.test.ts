import { afterEach, expect, it, mock } from "bun:test";
import { notifyHostStudioFlowPublished } from "./notifyHostStudioFlowPublished";

const originalWindow = Reflect.get(globalThis, "window");
const originalDocument = Reflect.get(globalThis, "document");

afterEach(() => {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: originalWindow,
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: originalDocument,
  });
});

it("notifies only the exact embedding origin with the generic versioned event", () => {
  const parent = { postMessage: mock(() => {}) };
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { parent },
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { referrer: "https://host.example/admin/bots" },
  });

  notifyHostStudioFlowPublished({
    editableFlowId: "editable-id",
    publicFlowId: "public-id",
  });

  expect(parent.postMessage).toHaveBeenCalledWith(
    {
      version: 1,
      type: "hostStudio.flowPublished",
      editableFlowId: "editable-id",
      publicFlowId: "public-id",
    },
    "https://host.example",
  );
});

it("does not post from standalone Builder", () => {
  const standaloneWindow = {
    postMessage: mock(() => {}),
    parent: undefined as unknown,
  };
  standaloneWindow.parent = standaloneWindow;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { ...standaloneWindow, parent: standaloneWindow },
  });
  notifyHostStudioFlowPublished({
    editableFlowId: "editable-id",
    publicFlowId: "public-id",
  });
  expect(standaloneWindow.postMessage).not.toHaveBeenCalled();
});
