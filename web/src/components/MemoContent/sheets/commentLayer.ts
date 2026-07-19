// Cell-comment markers for a `sheets` block.
//
// x-spreadsheet draws its grid to a canvas and has no comment feature to hook
// into, so the little "has a comment" triangles are plain DOM injected into the
// widget's own overlay layer (`.x-spreadsheet-overlayer-content`) — the same
// absolutely-positioned, clipped container its selection rectangle lives in.
// Using that container means we inherit its coordinate space (already offset by
// the row/column headers) and its clipping, so a marker on a scrolled-away cell
// disappears without us tracking the viewport ourselves.
//
// Positions come from the active sheet's DataProxy.getRect(), which is what the
// selector itself uses. Repositioning is driven by wrapping the table's render()
// — every redraw path (scroll, edit, row/col resize, loadData) goes through it,
// and x-spreadsheet emits no event we could listen to instead.

import type Spreadsheet from "x-data-spreadsheet";

interface CellRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface SheetInternals {
  overlayerCEl?: { el?: HTMLElement };
  table?: { render: () => void };
  data?: { getRect?: (range: { sri: number; sci: number; eri: number; eci: number }) => CellRect };
}

function sheetOf(instance: Spreadsheet): SheetInternals | undefined {
  return (instance as unknown as { sheet?: SheetInternals }).sheet;
}

const MARKER_SIZE = 6;

export interface CommentLayer {
  // Swap in the comments for the currently active sheet ("ri,ci" -> text) and
  // redraw the markers.
  setComments(comments: Record<string, string>): void;
  // The selected cell, whose comment (if any) is shown as a tooltip. The overlay
  // is pointer-events: none and the grid is a canvas, so there is nothing to
  // hover — selection is the only reliable way to ask for a comment's text.
  setSelection(ri: number, ci: number): void;
  destroy(): void;
}

// Attaches a marker layer to a live x-spreadsheet instance. Returns a no-op
// layer if the internals it needs aren't there — a version bump that renames
// them should cost the markers, not the whole block.
export function createCommentLayer(instance: Spreadsheet): CommentLayer {
  const sheet = sheetOf(instance);
  const host = sheet?.overlayerCEl?.el;
  const table = sheet?.table;
  if (!host || !table) return { setComments: () => {}, setSelection: () => {}, destroy: () => {} };

  const layer = document.createElement("div");
  layer.className = "x-spreadsheet-comment-layer";
  // The overlay container is pointer-events: none; keep it that way so markers
  // never swallow a click meant for the grid underneath.
  layer.style.cssText = "position:absolute;inset:0;pointer-events:none;overflow:hidden";
  host.appendChild(layer);

  let comments: Record<string, string> = {};
  let selection: { ri: number; ci: number } | null = null;

  const drawTooltip = (rect: CellRect, text: string) => {
    const tip = document.createElement("div");
    tip.style.cssText = [
      "position:absolute",
      `left:${rect.left + rect.width + 4}px`,
      `top:${rect.top}px`,
      "max-width:220px",
      "padding:4px 8px",
      "background:#fffbe6",
      "border:1px solid #e0d8b0",
      "border-radius:4px",
      "box-shadow:0 1px 4px rgba(0,0,0,.15)",
      "font-size:12px",
      "line-height:1.4",
      "color:#333",
      "white-space:pre-wrap",
      "word-break:break-word",
      "z-index:1",
    ].join(";");
    tip.textContent = text;
    layer.appendChild(tip);
  };

  const draw = () => {
    layer.textContent = "";
    // getRect reads the *active* sheet's DataProxy, so re-resolve it each draw
    // rather than capturing it — a tab switch replaces the object. It must stay
    // a method call: it reads `this.scroll`/`this.rows`/`this.cols`.
    const data = sheetOf(instance)?.data;
    if (!data?.getRect) return;
    for (const key of Object.keys(comments)) {
      const [ri, ci] = key.split(",").map(Number);
      if (Number.isNaN(ri) || Number.isNaN(ci)) continue;
      let rect: CellRect;
      try {
        rect = data.getRect({ sri: ri, sci: ci, eri: ri, eci: ci });
      } catch {
        continue;
      }
      // Cells scrolled behind the frozen area come back clamped to a negative
      // offset; drawing those would stick a marker to the header edge.
      if (!rect || rect.left < 0 || rect.top < 0) continue;
      const marker = document.createElement("div");
      marker.style.cssText = [
        "position:absolute",
        `left:${rect.left + rect.width - MARKER_SIZE}px`,
        `top:${rect.top}px`,
        `width:${MARKER_SIZE}px`,
        `height:${MARKER_SIZE}px`,
        "background:#e8684a",
        // Triangle pinned to the cell's top-right corner, like Excel/Sheets.
        "clip-path:polygon(100% 0,0 0,100% 100%)",
      ].join(";");
      layer.appendChild(marker);
      if (selection && selection.ri === ri && selection.ci === ci) drawTooltip(rect, comments[key]);
    }
  };

  // render() normally lives on the prototype, so the wrapper is an own property
  // shadowing it; removing that property on destroy restores the original rather
  // than leaving a bound copy behind.
  const originalRender = table.render.bind(table);
  table.render = () => {
    originalRender();
    draw();
  };
  const unwrap = () => {
    delete (table as Partial<typeof table>).render;
  };

  return {
    setComments: (next) => {
      comments = next;
      draw();
    },
    setSelection: (ri, ci) => {
      selection = { ri, ci };
      draw();
    },
    destroy: () => {
      unwrap();
      layer.remove();
    },
  };
}
