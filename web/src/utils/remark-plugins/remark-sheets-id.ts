import type { Code, Root } from "mdast";
import { visit } from "unist-util-visit";

// Promotes a `sheets` fenced block's `id=xxx` info-string token to a real
// `data-sheet-id` attribute on the emitted <code> element.
//
// Why a plugin: react-markdown exposes the fence meta as the mdast code node's
// `meta`, but that lives on `node.data`, which `rehype-raw` strips when it
// reserializes the tree. Routing the id through `data.hProperties` turns it into
// an actual HTML attribute, which survives rehype-raw (and rehype-sanitize, once
// whitelisted). CodeBlock reads it back to anchor the block's style overlay.
const ID_RE = /(?:^|\s)id=([A-Za-z0-9_-]+)/;

export const remarkSheetsId = () => {
  return (tree: Root) => {
    visit(tree, "code", (node: Code) => {
      if (node.lang !== "sheets" || !node.meta) return;
      const match = ID_RE.exec(node.meta);
      if (!match) return;
      const data = (node.data ??= {});
      const hProperties = ((data as { hProperties?: Record<string, unknown> }).hProperties ??= {});
      hProperties["data-sheet-id"] = match[1];
    });
  };
};
