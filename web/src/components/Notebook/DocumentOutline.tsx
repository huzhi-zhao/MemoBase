import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { useTranslate } from "@/utils/i18n";
import { slugify } from "@/utils/markdown-manipulation";

interface OutlineItem {
  level: number;
  text: string;
  slug: string;
}

// Lightweight heading scan (mirrors the slugging rules used by
// rehype-heading-id) so the outline can be derived directly from the raw
// Markdown source without waiting on a DOM render pass.
function extractOutline(content: string): OutlineItem[] {
  const lines = content.split("\n");
  const items: OutlineItem[] = [];
  const seen = new Map<string, number>();
  let inCodeFence = false;

  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      inCodeFence = !inCodeFence;
      continue;
    }
    if (inCodeFence) continue;

    const match = /^(#{1,6})\s+(.+?)\s*#*$/.exec(line);
    if (!match) continue;

    const level = match[1].length;
    const text = match[2].trim();
    let slug = slugify(text);
    const count = seen.get(slug) ?? 0;
    if (count > 0) {
      seen.set(slug, count + 1);
      slug = `${slug}-${count}`;
    } else {
      seen.set(slug, 1);
    }
    items.push({ level, text, slug });
  }

  return items;
}

interface Props {
  content: string;
  containerRef: React.RefObject<HTMLElement | null>;
}

const DocumentOutline = ({ content, containerRef }: Props) => {
  const t = useTranslate();
  const items = useMemo(() => extractOutline(content), [content]);

  const handleClick = (slug: string) => {
    const container = containerRef.current;
    const target = container?.querySelector(`#${CSS.escape(slug)}`);
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (items.length === 0) {
    return <div className="text-sm text-muted-foreground px-2 py-4">{t("notebook.no-headings")}</div>;
  }

  return (
    <nav className="w-full flex flex-col gap-0.5 text-sm">
      {items.map((item, idx) => (
        <button
          key={`${item.slug}-${idx}`}
          className={cn("text-left truncate rounded px-2 py-1 hover:bg-accent/60 text-muted-foreground hover:text-foreground")}
          style={{ paddingLeft: `${(item.level - 1) * 12 + 8}px` }}
          onClick={() => handleClick(item.slug)}
        >
          {item.text}
        </button>
      ))}
    </nav>
  );
};

export default DocumentOutline;
