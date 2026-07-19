// Reshapes x-spreadsheet's right-click menu.
//
// The stock menu is one flat list of 21 entries: clipboard (5), insert (2),
// delete (3), hide, data validation, export toggles, edit toggles. Most of it is
// either keyboard-driven (copy/cut/paste) or rarely touched, which buries the
// two things people actually right-click for — inserting and deleting rows and
// columns. So we keep those at the top and fold the rest into a collapsed
// "more" group.
//
// The menu is built once at construction and its click handlers are bound to the
// item elements themselves, so reordering is pure DOM movement: no handler is
// re-wired and nothing breaks. Two constraints shape the result:
//   - The menu element is `overflow: auto`, so a flyout submenu would be clipped
//     by its own scroll container. The group expands inline instead.
//   - x-spreadsheet's own setMode() shows/hides the "hide" item (index 12) by
//     index into its internal list, toggling that element's own display. Moving
//     it into a *container* we collapse independently leaves that untouched.

// The stock menu's item count. Anything else means the widget changed its menu
// and our index-based surgery would cut in the wrong place, so we bail out and
// leave the menu alone.
const STOCK_ITEM_COUNT = 21;

// Indices of the entries that stay at the top level:
// insert-row, insert-column, divider, delete-row, delete-column, delete-cell-text.
const PRIMARY_INDEXES = [6, 7, 8, 9, 10, 11];

export interface RestructuredMenu {
  // Insert custom entries (the AI and comment items) before this node to place
  // them after the primary block and above the "more" group.
  anchor: HTMLElement;
  // Re-collapse the group; call whenever the menu is about to be shown again.
  reset(): void;
}

export function restructureContextMenu(menuEl: HTMLElement, moreLabel: string): RestructuredMenu | null {
  const items = Array.from(menuEl.children) as HTMLElement[];
  if (items.length !== STOCK_ITEM_COUNT) return null;

  const primary = PRIMARY_INDEXES.map((i) => items[i]);
  const secondary = items.filter((_, i) => !PRIMARY_INDEXES.includes(i));

  const group = document.createElement("div");
  group.style.display = "none";
  secondary.forEach((item) => group.appendChild(item));

  const anchor = document.createElement("div");
  anchor.className = "x-spreadsheet-item divider";

  const toggle = document.createElement("div");
  toggle.className = "x-spreadsheet-item";
  toggle.style.cursor = "pointer";
  const caret = document.createElement("span");
  caret.className = "label";
  const setExpanded = (expanded: boolean) => {
    group.style.display = expanded ? "" : "none";
    caret.textContent = expanded ? "▴" : "▾";
  };
  toggle.append(document.createTextNode(moreLabel), caret);
  // mousedown, not click: x-spreadsheet closes the menu on the click that
  // follows, which would collapse the group again before it's visible.
  toggle.addEventListener("mousedown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    setExpanded(group.style.display === "none");
  });

  menuEl.textContent = "";
  primary.forEach((item) => menuEl.appendChild(item));
  menuEl.append(anchor, toggle, group);
  setExpanded(false);

  return { anchor, reset: () => setExpanded(false) };
}
