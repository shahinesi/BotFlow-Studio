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

it("updates the selected label when provider options arrive after mount", async () => {
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
  const onChange = () => {};
  const unknownLabel = "reporting.cashier.summary (not listed by the provider)";
  const catalogLabel = "خلاصه گزارش صندوق امروز (reporting.cashier.summary)";

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

  await act(async () => {
    root?.render(
      <BasicAutocompleteInput
        items={[catalogLabel]}
        defaultValue={catalogLabel}
        onChange={onChange}
      />,
    );
  });

  expect(container.querySelector("input")?.value).toBe(catalogLabel);
});
