import { create } from "@bufbuild/protobuf";
import { type DocAnchor, DocAnchorSchema } from "@/types/proto/api/v1/memo_service_pb";

const HEADING_SELECTOR = "h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]";

// Finds the rendered heading nearest above the current scroll position within `container`
// (the document preview's scroll viewport) and returns a DocAnchor for it. When no heading
// sits above the fold (e.g. scrolled to the very top of a doc with no leading heading), the
// returned anchor has empty slug/text, meaning "top of document".
export function nearestHeadingAnchor(container: HTMLElement | null): DocAnchor {
  if (!container) return create(DocAnchorSchema, {});
  const headings = Array.from(container.querySelectorAll<HTMLElement>(HEADING_SELECTOR));
  const containerTop = container.getBoundingClientRect().top;
  let current: HTMLElement | undefined;
  for (const heading of headings) {
    // Once a heading sits below the viewport's top edge, every later one does too.
    if (heading.getBoundingClientRect().top - containerTop <= 8) current = heading;
    else break;
  }
  if (!current) return create(DocAnchorSchema, {});
  return create(DocAnchorSchema, { headingSlug: current.id, headingText: (current.textContent ?? "").trim() });
}

// Finds the rendered heading nearest *above a specific DOM node* (e.g. the start of a text
// selection) within `container`, and returns a DocAnchor for it. Used by the selection popover
// so a comment anchors to the section the selected text lives in — independent of scroll
// position. Empty slug/text means the selection is above the first heading ("top of document").
export function nearestHeadingAnchorForNode(container: HTMLElement | null, node: Node | null): DocAnchor {
  if (!container || !node || !container.contains(node)) return create(DocAnchorSchema, {});
  const headings = Array.from(container.querySelectorAll<HTMLElement>(HEADING_SELECTOR));
  let current: HTMLElement | undefined;
  for (const heading of headings) {
    // node sits at or after this heading in document order (FOLLOWING covers "node is
    // contained by heading" too, i.e. the selection is inside the heading itself).
    const isBeforeOrAt = (heading.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0 || heading.contains(node);
    if (isBeforeOrAt) current = heading;
    else break;
  }
  if (!current) return create(DocAnchorSchema, {});
  return create(DocAnchorSchema, { headingSlug: current.id, headingText: (current.textContent ?? "").trim() });
}

// Scrolls the heading identified by `slug` into view within `container`. No-op when the
// slug is empty (top-of-document anchor) or the heading no longer exists.
export function scrollToHeading(container: HTMLElement | null, slug: string) {
  if (!container) return;
  if (!slug) {
    container.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }
  const target = container.querySelector(`#${CSS.escape(slug)}`);
  target?.scrollIntoView({ behavior: "smooth", block: "start" });
}
