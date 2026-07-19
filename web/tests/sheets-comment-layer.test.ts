// Guards the comment markers against x-spreadsheet internals shifting under us:
// the layer reaches into the widget's overlay container and its DataProxy, and
// when that reach fails it fails silently (markers just don't draw). A canvas
// stub is enough — nothing here depends on what the grid actually paints.

import { beforeAll, describe, expect, it } from "vitest";
import Spreadsheet from "x-data-spreadsheet";
import { createCommentLayer } from "@/components/MemoContent/sheets/commentLayer";

beforeAll(() => {
  const ctx = new Proxy(
    {},
    {
      get: (_t, key) => {
        if (key === "measureText") return () => ({ width: 10 });
        if (key === "canvas") return document.createElement("canvas");
        return () => undefined;
      },
      set: () => true,
    },
  );
  HTMLCanvasElement.prototype.getContext = (() => ctx) as never;
});

function mount() {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const instance = new Spreadsheet(host, { view: { height: () => 300, width: () => 600 } });
  instance.loadData({ name: "S1", rows: { 1: { cells: { 2: { text: "a" } } } } } as never);
  return { host, instance };
}

describe("comment layer", () => {
  it("draws a marker for each commented cell", () => {
    const { host, instance } = mount();
    createCommentLayer(instance).setComments({ "1,2": "hello", "3,0": "world" });
    const layer = host.querySelector(".x-spreadsheet-comment-layer");
    expect(layer, "layer attached to the overlay container").not.toBeNull();
    expect(layer!.children.length).toBe(2);
  });

  it("shows the comment text only while its cell is selected", () => {
    const { host, instance } = mount();
    const commentLayer = createCommentLayer(instance);
    commentLayer.setComments({ "1,2": "hello" });
    const layer = host.querySelector(".x-spreadsheet-comment-layer")!;

    commentLayer.setSelection(1, 2);
    expect(layer.children.length, "marker + tooltip").toBe(2);
    expect(layer.textContent).toContain("hello");

    commentLayer.setSelection(0, 0);
    expect(layer.children.length, "marker only").toBe(1);
    expect(layer.textContent).toBe("");
  });

  it("removes its layer and unwraps the render hook on destroy", () => {
    const { host, instance } = mount();
    const table = (instance as never as { sheet: { table: { render: () => void } } }).sheet.table;
    const original = table.render;
    const commentLayer = createCommentLayer(instance);
    expect(table.render).not.toBe(original);
    commentLayer.destroy();
    expect(table.render).toBe(original);
    expect(host.querySelector(".x-spreadsheet-comment-layer")).toBeNull();
  });
});
