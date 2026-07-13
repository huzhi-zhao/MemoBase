import { LayoutGridIcon, PlusIcon, Trash2Icon, XIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useTranslate } from "@/utils/i18n";
import {
  DEFAULT_GALLERY_BLOCK,
  type GalleryBlock,
  type GalleryCardField,
  type GalleryCoverRule,
  type GalleryPropertyFilter,
  type GallerySort,
  parseGalleryViewConfig,
  serializeGalleryViewConfig,
} from "./types";

interface Props {
  content: string;
  onSave: (content: string) => void;
  onCancel: () => void;
}

// UI state for one card-field row: a "kind" (built-in token or "property") plus
// the property key used when kind === "property". "none" is a UI sentinel
// (Radix Select forbids empty-string item values) serializing to "".
interface CardFieldState {
  kind: "__title__" | "__updated__" | "__created__" | "none" | "property";
  propKey: string;
}

// Editable draft of a single gallery block. Keeps UI-only shape (scope split
// into type + tag + filters, card fields split into kind + propKey) so toggling
// options never loses typed input; converted to a GalleryBlock on save.
interface BlockDraft {
  description: string;
  footer: string;
  scopeType: "folder" | "tag" | "property";
  folderPath: string;
  tag: string;
  propertyFilters: GalleryPropertyFilter[];
  sort: GallerySort;
  cover: GalleryCoverRule;
  primary: CardFieldState;
  secondary: CardFieldState;
}

function toCardFieldState(field: GalleryCardField): CardFieldState {
  if (field.startsWith("prop:")) return { kind: "property", propKey: field.slice(5) };
  if (field === "") return { kind: "none", propKey: "" };
  if (field === "__title__" || field === "__updated__" || field === "__created__") {
    return { kind: field as CardFieldState["kind"], propKey: "" };
  }
  return { kind: "__title__", propKey: "" };
}

function fromCardFieldState(state: CardFieldState): GalleryCardField {
  if (state.kind === "property") return `prop:${state.propKey.trim()}`;
  if (state.kind === "none") return "";
  return state.kind;
}

function toDraft(block: GalleryBlock): BlockDraft {
  return {
    description: block.description ?? "",
    footer: block.footer ?? "",
    scopeType: block.scope.type,
    folderPath: block.scope.type === "folder" ? (block.scope.path ?? "") : "",
    tag: block.scope.type === "tag" ? block.scope.tag : "",
    propertyFilters: block.scope.type === "property" ? block.scope.filters : [],
    sort: block.sort,
    cover: block.cover,
    primary: toCardFieldState(block.cardFields.primary),
    secondary: toCardFieldState(block.cardFields.secondary),
  };
}

function cleanedFilters(draft: BlockDraft): GalleryPropertyFilter[] {
  return draft.propertyFilters.map((f) => ({ key: f.key.trim(), value: f.value })).filter((f) => f.key !== "");
}

function fromDraft(draft: BlockDraft): GalleryBlock {
  const scope: GalleryBlock["scope"] =
    draft.scopeType === "tag"
      ? { type: "tag", tag: draft.tag.trim() }
      : draft.scopeType === "property"
        ? { type: "property", filters: cleanedFilters(draft) }
        : { type: "folder", path: draft.folderPath.trim() || undefined };
  return {
    description: draft.description.trim() ? draft.description : undefined,
    footer: draft.footer.trim() ? draft.footer : undefined,
    scope,
    sort: draft.sort,
    cover: draft.cover,
    cardFields: { primary: fromCardFieldState(draft.primary), secondary: fromCardFieldState(draft.secondary) },
  };
}

function blockInvalid(draft: BlockDraft): boolean {
  if (draft.scopeType === "tag") return !draft.tag.trim();
  if (draft.scopeType === "property") {
    return cleanedFilters(draft).length === 0 || draft.propertyFilters.some((f) => f.key.trim() === "");
  }
  return false;
}

// One editable gallery block. Controlled via `draft` / `onChange`.
const GalleryBlockForm = ({
  draft,
  index,
  onChange,
  onRemove,
}: {
  draft: BlockDraft;
  index: number;
  onChange: (patch: Partial<BlockDraft>) => void;
  onRemove: () => void;
}) => {
  const t = useTranslate();

  const setFilter = (i: number, patch: Partial<GalleryPropertyFilter>) => {
    onChange({ propertyFilters: draft.propertyFilters.map((f, j) => (j === i ? { ...f, ...patch } : f)) });
  };

  // Split the serialized sort/cover values into their editable "kind" + property key.
  const sortMatch = draft.sort.match(/^prop_(asc|desc):(.*)$/s);
  const sortKind = sortMatch ? "property" : draft.sort;
  const sortDir = sortMatch?.[1] ?? "desc";
  const sortKey = sortMatch?.[2] ?? "";
  const setSort = (kind: string) => onChange({ sort: kind === "property" ? `prop_${sortDir}:${sortKey}` : (kind as GallerySort) });

  const coverIsProp = draft.cover.startsWith("prop:");
  const coverKind = coverIsProp ? "property" : draft.cover;
  const coverKey = coverIsProp ? draft.cover.slice(5) : "";
  const setCover = (kind: string) => onChange({ cover: kind === "property" ? `prop:${coverKey}` : (kind as GalleryCoverRule) });

  const renderCardFieldRow = (label: string, state: CardFieldState, key: "primary" | "secondary", allowNone: boolean) => (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <Select value={state.kind} onValueChange={(v) => onChange({ [key]: { ...state, kind: v as CardFieldState["kind"] } })}>
          <SelectTrigger className="flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__title__">{t("gallery.field-title")}</SelectItem>
            <SelectItem value="__updated__">{t("gallery.field-updated")}</SelectItem>
            <SelectItem value="__created__">{t("gallery.field-created")}</SelectItem>
            <SelectItem value="property">{t("gallery.field-property")}</SelectItem>
            {allowNone && <SelectItem value="none">{t("gallery.field-none")}</SelectItem>}
          </SelectContent>
        </Select>
        {state.kind === "property" && (
          <Input
            className="flex-1"
            placeholder={t("gallery.property-key-placeholder")}
            value={state.propKey}
            onChange={(e) => onChange({ [key]: { ...state, propKey: e.target.value } })}
          />
        )}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <LayoutGridIcon className="w-4 h-4 text-primary" />
          {t("gallery.block-title", { index: index + 1 })}
        </div>
        <Button variant="ghost" size="icon" onClick={onRemove} title={t("gallery.remove-block")}>
          <Trash2Icon className="w-4 h-4" />
        </Button>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>{t("gallery.description-label")}</Label>
        <Textarea
          rows={3}
          placeholder={t("gallery.description-placeholder")}
          value={draft.description}
          onChange={(e) => onChange({ description: e.target.value })}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>{t("gallery.scope-label")}</Label>
        <RadioGroup
          value={draft.scopeType}
          onValueChange={(v) => onChange({ scopeType: v as BlockDraft["scopeType"] })}
          className="flex flex-col gap-2"
        >
          <div className="flex items-center gap-2">
            <RadioGroupItem value="folder" id={`scope-folder-${index}`} />
            <Label htmlFor={`scope-folder-${index}`} className="font-normal cursor-pointer">
              {t("gallery.scope-folder")}
            </Label>
          </div>
          {draft.scopeType === "folder" && (
            <Input
              className="ml-6"
              placeholder={t("gallery.folder-path-placeholder")}
              value={draft.folderPath}
              onChange={(e) => onChange({ folderPath: e.target.value })}
            />
          )}
          <div className="flex items-center gap-2">
            <RadioGroupItem value="tag" id={`scope-tag-${index}`} />
            <Label htmlFor={`scope-tag-${index}`} className="font-normal cursor-pointer">
              {t("gallery.scope-tag")}
            </Label>
          </div>
          {draft.scopeType === "tag" && (
            <Input
              className="ml-6"
              placeholder={t("gallery.tag-placeholder")}
              value={draft.tag}
              onChange={(e) => onChange({ tag: e.target.value })}
            />
          )}
          <div className="flex items-center gap-2">
            <RadioGroupItem value="property" id={`scope-property-${index}`} />
            <Label htmlFor={`scope-property-${index}`} className="font-normal cursor-pointer">
              {t("gallery.scope-property")}
            </Label>
          </div>
          {draft.scopeType === "property" && (
            <div className="ml-6 flex flex-col gap-2 rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">{t("gallery.property-filters-hint")}</p>
              {draft.propertyFilters.map((filter, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    className="flex-1"
                    placeholder={t("gallery.property-key-placeholder")}
                    value={filter.key}
                    onChange={(e) => setFilter(i, { key: e.target.value })}
                  />
                  <span className="text-muted-foreground text-sm">=</span>
                  <Input
                    className="flex-1"
                    placeholder={t("gallery.property-value-placeholder")}
                    value={filter.value}
                    onChange={(e) => setFilter(i, { value: e.target.value })}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0"
                    onClick={() => onChange({ propertyFilters: draft.propertyFilters.filter((_, j) => j !== i) })}
                  >
                    <XIcon className="w-4 h-4" />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                className="self-start"
                onClick={() => onChange({ propertyFilters: [...draft.propertyFilters, { key: "", value: "" }] })}
              >
                <PlusIcon className="w-4 h-4 mr-1" />
                {t("gallery.add-property-filter")}
              </Button>
            </div>
          )}
        </RadioGroup>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>{t("gallery.sort-label")}</Label>
        <div className="flex items-center gap-2">
          <Select value={sortKind} onValueChange={setSort}>
            <SelectTrigger className="flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="updated_desc">{t("gallery.sort-updated-desc")}</SelectItem>
              <SelectItem value="updated_asc">{t("gallery.sort-updated-asc")}</SelectItem>
              <SelectItem value="created_desc">{t("gallery.sort-created-desc")}</SelectItem>
              <SelectItem value="created_asc">{t("gallery.sort-created-asc")}</SelectItem>
              <SelectItem value="title_asc">{t("gallery.sort-title-asc")}</SelectItem>
              <SelectItem value="property">{t("gallery.sort-property")}</SelectItem>
            </SelectContent>
          </Select>
          {sortKind === "property" && (
            <Select value={sortDir} onValueChange={(v) => onChange({ sort: `prop_${v}:${sortKey}` })}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="asc">{t("gallery.sort-ascending")}</SelectItem>
                <SelectItem value="desc">{t("gallery.sort-descending")}</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>
        {sortKind === "property" && (
          <Input
            placeholder={t("gallery.property-key-placeholder")}
            value={sortKey}
            onChange={(e) => onChange({ sort: `prop_${sortDir}:${e.target.value}` })}
          />
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>{t("gallery.cover-label")}</Label>
        <div className="flex items-center gap-2">
          <Select value={coverKind} onValueChange={setCover}>
            <SelectTrigger className="flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="first_image">{t("gallery.cover-first-image")}</SelectItem>
              <SelectItem value="none">{t("gallery.cover-none")}</SelectItem>
              <SelectItem value="property">{t("gallery.cover-property")}</SelectItem>
            </SelectContent>
          </Select>
          {coverKind === "property" && (
            <Input
              className="flex-1"
              placeholder={t("gallery.property-key-placeholder")}
              value={coverKey}
              onChange={(e) => onChange({ cover: `prop:${e.target.value}` })}
            />
          )}
        </div>
      </div>

      {renderCardFieldRow(t("gallery.card-primary-label"), draft.primary, "primary", false)}
      {renderCardFieldRow(t("gallery.card-secondary-label"), draft.secondary, "secondary", true)}

      <div className="flex flex-col gap-1.5">
        <Label>{t("gallery.footer-label")}</Label>
        <Textarea
          rows={3}
          placeholder={t("gallery.footer-placeholder")}
          value={draft.footer}
          onChange={(e) => onChange({ footer: e.target.value })}
        />
      </div>
    </div>
  );
};

// Editor for VIEW documents. A document may hold multiple gallery blocks; the
// bottom toolbar's "+" inserts another, and Save/Cancel are pinned bottom-right.
const GalleryViewForm = ({ content, onSave, onCancel }: Props) => {
  const t = useTranslate();
  const initial = parseGalleryViewConfig(content);
  const [blocks, setBlocks] = useState<BlockDraft[]>(() => (initial?.blocks ?? []).map(toDraft));
  const [frontmatter, setFrontmatter] = useState(() => initial?.frontmatter ?? "");

  const updateBlock = (index: number, patch: Partial<BlockDraft>) => {
    setBlocks((prev) => prev.map((b, i) => (i === index ? { ...b, ...patch } : b)));
  };

  const addGalleryBlock = () => setBlocks((prev) => [...prev, toDraft(DEFAULT_GALLERY_BLOCK)]);

  const handleSave = () => {
    onSave(
      serializeGalleryViewConfig({ viewType: "gallery", blocks: blocks.map(fromDraft), frontmatter: frontmatter.trim() || undefined }),
    );
  };

  const saveDisabled = blocks.length === 0 || blocks.some(blockInvalid);

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <div className="w-full max-w-lg mx-auto flex flex-col gap-6">
          <div className="flex flex-col gap-1.5">
            <Label>{t("gallery.properties-label")}</Label>
            <Textarea
              rows={4}
              className="font-mono text-sm"
              placeholder={t("gallery.properties-placeholder")}
              value={frontmatter}
              onChange={(e) => setFrontmatter(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">{t("gallery.properties-hint")}</p>
          </div>
          {blocks.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-10">{t("gallery.empty-editor")}</div>
          ) : (
            blocks.map((draft, index) => (
              <div key={index} className="flex flex-col gap-6">
                {index > 0 && <hr className="border-border" />}
                <GalleryBlockForm
                  draft={draft}
                  index={index}
                  onChange={(patch) => updateBlock(index, patch)}
                  onRemove={() => setBlocks((prev) => prev.filter((_, i) => i !== index))}
                />
              </div>
            ))
          )}
        </div>
      </div>

      <div className="shrink-0 border-t border-border px-4 py-2 flex items-center justify-between gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" size="icon" title={t("gallery.insert")}>
              <PlusIcon className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={addGalleryBlock}>
              <LayoutGridIcon className="w-4 h-4" />
              {t("gallery.style-gallery")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={onCancel}>
            {t("common.cancel")}
          </Button>
          <Button onClick={handleSave} disabled={saveDisabled}>
            {t("common.save")}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default GalleryViewForm;
