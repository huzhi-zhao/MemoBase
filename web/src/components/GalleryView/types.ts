// Structured configuration stored as the content of a VIEW document.
// The content holds ONLY this JSON (plus optional markdown intro fields inside
// it) — never HTML or rendered output. Every view block is rendered live from
// current data each time the document is opened.
//
// A single VIEW document may hold multiple gallery blocks (each with its own
// intro, scope, sort, cover and card fields), rendered top-to-bottom separated
// by dividers.

/**
 * An equality condition on a document's frontmatter property. A document passes
 * when it has a property named `key` whose value equals `value` (for list
 * properties, when any item equals `value`). Only equality is supported.
 */
export interface GalleryPropertyFilter {
  key: string;
  value: string;
}

// Which documents a gallery block shows. Exactly one of three mutually
// exclusive modes: a folder (defaulting to the view doc's own folder), a tag,
// or a set of property equality conditions (ANDed together).
//
// `path` is a slash-separated path relative to the knowledge base root. When
// omitted (or empty), the folder defaults to the view document's own folder.
// In both cases the scope includes documents in that folder and all of its
// subfolders.
export type GalleryScope =
  | { type: "folder"; path?: string }
  | { type: "tag"; tag: string }
  | { type: "property"; filters: GalleryPropertyFilter[] };

export type GalleryBuiltinSort = "updated_desc" | "updated_asc" | "created_desc" | "created_asc" | "title_asc";

/**
 * How a gallery block orders its cards. Either a built-in token, or a sort by a
 * frontmatter property encoded as `prop_asc:<key>` / `prop_desc:<key>`. Documents
 * missing the property sort to the end.
 */
export type GallerySort = GalleryBuiltinSort | (string & {});

/**
 * How a gallery card's cover image is chosen. `first_image` uses the document's
 * first image attachment (or first inline markdown image); `none` shows no cover;
 * `prop:<key>` uses a frontmatter property value as the image source (an
 * `attachments/...` resource name is resolved to the attachment, anything else is
 * used as a URL).
 */
export type GalleryCoverRule = "first_image" | "none" | (string & {});

/**
 * A field shown on a gallery card. Built-in tokens cover the document's own
 * metadata; `prop:<key>` pulls a frontmatter property value. Empty string means
 * "show nothing" for that row.
 */
export type GalleryCardField = "__title__" | "__updated__" | "__created__" | "" | (string & {});

export interface GalleryCardFields {
  /** First (bold) row. Defaults to the document title. */
  primary: GalleryCardField;
  /** Second (muted) row. Defaults to the update date. */
  secondary: GalleryCardField;
}

/** A single gallery within a VIEW document. */
export interface GalleryBlock {
  /** Optional markdown intro rendered above this block's cards. */
  description?: string;
  scope: GalleryScope;
  sort: GallerySort;
  cover: GalleryCoverRule;
  cardFields: GalleryCardFields;
}

export interface GalleryViewConfig {
  viewType: "gallery";
  blocks: GalleryBlock[];
}

export const DEFAULT_CARD_FIELDS: GalleryCardFields = {
  primary: "__title__",
  secondary: "__updated__",
};

export const DEFAULT_GALLERY_BLOCK: GalleryBlock = {
  scope: { type: "folder" },
  sort: "updated_desc",
  cover: "first_image",
  cardFields: DEFAULT_CARD_FIELDS,
};

function parsePropertyFilters(raw: unknown): GalleryPropertyFilter[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((f: unknown): f is { key: unknown; value: unknown } => !!f && typeof f === "object")
    .map((f: { key: unknown; value: unknown }) => ({ key: String(f.key ?? "").trim(), value: String(f.value ?? "") }))
    .filter((f: GalleryPropertyFilter) => f.key !== "");
}

function parseScope(raw: unknown): GalleryScope {
  if (raw && typeof raw === "object") {
    const scope = raw as { type?: unknown; tag?: unknown; filters?: unknown; path?: unknown };
    if (scope.type === "tag" && typeof scope.tag === "string") return { type: "tag", tag: scope.tag };
    if (scope.type === "property") return { type: "property", filters: parsePropertyFilters(scope.filters) };
    if (scope.type === "folder" && typeof scope.path === "string" && scope.path.trim()) {
      return { type: "folder", path: scope.path.trim() };
    }
  }
  return { type: "folder" };
}

const CARD_FIELD_TOKENS = new Set(["__title__", "__updated__", "__created__"]);

// Sanitize a stored card field: keep known tokens, empty string, or a
// `prop:<key>` reference; fall back to empty otherwise.
function normalizeCardField(raw: unknown, fallback: GalleryCardField): GalleryCardField {
  if (raw === "") return "";
  if (typeof raw !== "string") return fallback;
  if (CARD_FIELD_TOKENS.has(raw) || raw.startsWith("prop:")) return raw;
  return fallback;
}

const BUILTIN_SORTS: GalleryBuiltinSort[] = ["updated_desc", "updated_asc", "created_desc", "created_asc", "title_asc"];

// True for the `prop_asc:<key>` / `prop_desc:<key>` property-sort encoding.
const PROP_SORT_RE = /^prop_(asc|desc):/;

function normalizeSort(raw: unknown): GallerySort {
  if (typeof raw === "string") {
    if ((BUILTIN_SORTS as string[]).includes(raw)) return raw as GallerySort;
    if (PROP_SORT_RE.test(raw)) return raw;
  }
  return DEFAULT_GALLERY_BLOCK.sort;
}

function normalizeCover(raw: unknown): GalleryCoverRule {
  if (raw === "none") return "none";
  if (typeof raw === "string" && raw.startsWith("prop:")) return raw;
  return "first_image";
}

function parseBlock(raw: unknown): GalleryBlock {
  const b = (raw ?? {}) as {
    description?: unknown;
    scope?: unknown;
    sort?: unknown;
    cover?: unknown;
    cardFields?: { primary?: unknown; secondary?: unknown };
  };
  return {
    description: typeof b.description === "string" && b.description.trim() ? b.description : undefined,
    scope: parseScope(b.scope),
    sort: normalizeSort(b.sort),
    cover: normalizeCover(b.cover),
    cardFields: {
      primary: normalizeCardField(b.cardFields?.primary, DEFAULT_CARD_FIELDS.primary),
      secondary: normalizeCardField(b.cardFields?.secondary, DEFAULT_CARD_FIELDS.secondary),
    },
  };
}

/**
 * Parses a VIEW document's content into gallery blocks. Returns undefined when
 * the content isn't a gallery view at all (empty/invalid), so the editor can
 * show its empty state. Legacy single-block documents (config fields at the top
 * level, no `blocks` array) are migrated into a one-element block list.
 */
export function parseGalleryViewConfig(content: string): GalleryViewConfig | undefined {
  if (!content.trim()) return undefined;
  try {
    const raw = JSON.parse(content);
    if (!raw || typeof raw !== "object" || raw.viewType !== "gallery") return undefined;
    if (Array.isArray(raw.blocks)) {
      return { viewType: "gallery", blocks: raw.blocks.map(parseBlock) };
    }
    // Legacy single-config shape: treat the whole object as one block.
    return { viewType: "gallery", blocks: [parseBlock(raw)] };
  } catch {
    return undefined;
  }
}

export function serializeGalleryViewConfig(config: GalleryViewConfig): string {
  return JSON.stringify(config, null, 2);
}
