import { renderToString } from "react-dom/server";
import Markdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { describe, expect, it } from "vitest";
import { SANITIZE_SCHEMA } from "@/components/MemoContent/constants";
import { remarkSheetsId } from "@/utils/remark-plugins/remark-sheets-id";

// Renders markdown through the same rehype-raw + rehype-sanitize pipeline the app
// uses and returns the <code> element's props, as CodeBlock (the `pre` component)
// would see them.
function renderCodeProps(md: string): Record<string, unknown> {
  let props: Record<string, unknown> = {};
  renderToString(
    <Markdown
      remarkPlugins={[remarkGfm, remarkSheetsId]}
      rehypePlugins={[rehypeRaw, [rehypeSanitize, SANITIZE_SCHEMA]]}
      components={{
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        pre: ({ children }: any) => {
          const code = Array.isArray(children) ? children[0] : children;
          props = code?.props ?? {};
          return <pre />;
        },
      }}
    >
      {md}
    </Markdown>,
  );
  return props;
}

describe("sheets fence id → data-sheet-id", () => {
  // Regression guard: the fence's raw `meta` lives on the mdast node's `data`,
  // which rehype-raw strips. The id only reaches CodeBlock because remark-sheets-id
  // promotes it to a real attribute AND SANITIZE_SCHEMA whitelists it (as the
  // camelCased hast property `dataSheetId`). Breaking either silently orphans
  // every block's saved cell styles, so assert the whole chain end to end.
  it("survives rehype-raw and rehype-sanitize", () => {
    const props = renderCodeProps("```sheets id=1zu8fb\na,b\n1,2\n```\n");
    expect(props["data-sheet-id"]).toBe("1zu8fb");
    expect(props.className).toBe("language-sheets");
  });

  it("emits no attribute when the fence has no id", () => {
    const props = renderCodeProps("```sheets\na,b\n```\n");
    expect(props["data-sheet-id"]).toBeUndefined();
  });

  it("ignores the id token on non-sheets fences", () => {
    const props = renderCodeProps("```js id=nope\nconst a = 1;\n```\n");
    expect(props["data-sheet-id"]).toBeUndefined();
  });
});
