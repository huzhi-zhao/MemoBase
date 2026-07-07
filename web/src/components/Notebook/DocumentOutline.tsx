import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { useTranslate } from "@/utils/i18n";
import { extractHeadings } from "@/utils/markdown-manipulation";

interface Props {
  content: string;
  containerRef: React.RefObject<HTMLElement | null>;
}

const DocumentOutline = ({ content, containerRef }: Props) => {
  const t = useTranslate();
  // Uses the same mdast-based extraction as rehype-heading-id so the slug
  // computed here always matches the id assigned to the rendered heading,
  // even when the heading text contains inline markdown (links, emphasis, etc.).
  const items = useMemo(() => extractHeadings(content), [content]);

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
