import { afterEach, expect, it } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { BasicAutocompleteInput } from "./BasicAutocompleteInput";

type TestDom = {
  window: {
    document: Document;
    Element: typeof Element;
    HTMLElement: typeof HTMLElement;
    Node: typeof Node;
    MutationObserver: typeof MutationObserver;
    getComputedStyle: Window["getComputedStyle"];
    close: () => void;
  };
};

const JSDOM: new (html: string) => TestDom = require("jsdom").JSDOM;
let root: Root | undefined;
let dom: TestDom | undefined;

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  dom?.window.close();
  root = undefined;
  dom = undefined;
});

it("rehydrates a persisted provider selection when options arrive after mount", async () => {
  dom = new JSDOM("<!doctype html><div id='root'></div>");
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    Element: dom.window.Element,
    HTMLElement: dom.window.HTMLElement,
    Node: dom.window.Node,
    MutationObserver: dom.window.MutationObserver,
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
    IS_REACT_ACT_ENVIRONMENT: true,
  });

  const container = dom.window.document.getElementById("root");
  if (!container) throw new Error("Test root element was not created");

  root = createRoot(container);
  let changeCount = 0;
  const onChange = () => {
    changeCount++;
  };
  const unknownLabel = "cashier-report-read (not listed by the provider)";
  const catalogLabel = "مشاهده گزارش صندوق — Host description";

  await act(async () => {
    root?.render(
      <BasicAutocompleteInput
        items={[unknownLabel]}
        defaultValue={unknownLabel}
        onChange={onChange}
      />,
    );
  });
  expect(container.querySelector("input")?.value).toBe(unknownLabel);
  const inputBeforeHydration = container.querySelector("input");

  await act(async () => {
    root?.render(
      <BasicAutocompleteInput
        items={[catalogLabel]}
        defaultValue={catalogLabel}
        onChange={onChange}
      />,
    );
  });

  expect(container.querySelector("input")).toBe(inputBeforeHydration);
  expect(container.querySelector("input")?.value).toBe(catalogLabel);
  expect(changeCount).toBe(0);
});

it("keeps an unknown persisted provider selection unresolved", async () => {
  dom = new JSDOM("<!doctype html><div id='root'></div>");
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    Element: dom.window.Element,
    HTMLElement: dom.window.HTMLElement,
    Node: dom.window.Node,
    MutationObserver: dom.window.MutationObserver,
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
    IS_REACT_ACT_ENVIRONMENT: true,
  });

  const container = dom.window.document.getElementById("root");
  if (!container) throw new Error("Test root element was not created");

  root = createRoot(container);
  const unknownLabel = "removed-access-key (not listed by the provider)";

  await act(async () => {
    root?.render(
      <BasicAutocompleteInput
        items={[unknownLabel, "Different Host option"]}
        defaultValue={unknownLabel}
        onChange={() => {}}
      />,
    );
  });

  expect(container.querySelector("input")?.value).toBe(unknownLabel);
});
