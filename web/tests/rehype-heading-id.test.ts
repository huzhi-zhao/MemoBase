import type { Element, Root } from "hast";
import { describe, expect, it } from "vitest";
import { rehypeHeadingId } from "@/utils/rehype-plugins/rehype-heading-id";

const h = (tag: string, text: string): Element => ({
  type: "element",
  tagName: tag,
  properties: {},
  children: [{ type: "text", value: text }],
});

const a = (href: string): Element => ({
  type: "element",
  tagName: "a",
  properties: { href },
  children: [{ type: "text", value: "link" }],
});

const run = (children: Element[], prefix?: string): Root => {
  const tree: Root = { type: "root", children };
  rehypeHeadingId(prefix ? { prefix } : undefined)(tree);
  return tree;
};

describe("rehypeHeadingId", () => {
  it("assigns unprefixed slug ids by default and dedupes collisions", () => {
    const [h1, h2] = run([h("h2", "Notes"), h("h2", "Notes")]).children as Element[];
    expect(h1.properties?.id).toBe("notes");
    expect(h2.properties?.id).toBe("notes-1");
  });

  it("prefixes ids when a prefix is given", () => {
    const [heading] = run([h("h2", "Notes")], "vb0-desc").children as Element[];
    expect(heading.properties?.id).toBe("vb0-desc-notes");
  });

  it("rewrites intra-snippet anchor links to the prefixed id", () => {
    const [heading, link] = run([h("h2", "Notes"), a("#notes")], "vb0-desc").children as Element[];
    expect(heading.properties?.id).toBe("vb0-desc-notes");
    expect(link.properties?.href).toBe("#vb0-desc-notes");
  });

  it("leaves anchor links untouched when no prefix is set", () => {
    const [, link] = run([h("h2", "Notes"), a("#notes")]).children as Element[];
    expect(link.properties?.href).toBe("#notes");
  });

  it("does not rewrite links that point outside the snippet", () => {
    const [, link] = run([h("h2", "Notes"), a("#other")], "vb0-desc").children as Element[];
    expect(link.properties?.href).toBe("#other");
  });
});
