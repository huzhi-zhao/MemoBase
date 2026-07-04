import { LibraryBigIcon, PlusIcon, SettingsIcon } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateWorkspace, useDeleteWorkspace, useUpdateWorkspace } from "@/hooks/useWorkspaceQueries";
import type { Workspace } from "@/types/proto/api/v1/workspace_service_pb";
import { useTranslate } from "@/utils/i18n";
import PromptDialog from "./PromptDialog";

interface Props {
  workspaces: Workspace[];
  value?: string;
  onChange: (name: string) => void;
  onCreated?: (name: string) => void;
}

const WorkspaceSelector = ({ workspaces, value, onChange, onCreated }: Props) => {
  const t = useTranslate();
  const createWorkspace = useCreateWorkspace();
  const updateWorkspace = useUpdateWorkspace();
  const deleteWorkspace = useDeleteWorkspace();
  const [createOpen, setCreateOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);

  const current = workspaces.find((w) => w.name === value);

  return (
    <div className="w-full flex flex-row items-center gap-1">
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="flex-1 min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <LibraryBigIcon className="w-4 h-4 shrink-0 opacity-70" />
            <SelectValue className="truncate" placeholder={t("notebook.select-workspace")} />
          </div>
        </SelectTrigger>
        <SelectContent>
          {workspaces.map((workspace) => (
            <SelectItem key={workspace.name} value={workspace.name}>
              {workspace.title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="shrink-0">
            <SettingsIcon className="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setCreateOpen(true)}>
            <PlusIcon className="w-4 h-4 mr-2" />
            {t("notebook.new-workspace")}
          </DropdownMenuItem>
          {current && <DropdownMenuItem onClick={() => setRenameOpen(true)}>{t("notebook.rename-workspace")}</DropdownMenuItem>}
          {current && workspaces.length > 1 && (
            <DropdownMenuItem
              variant="destructive"
              onClick={async () => {
                if (!window.confirm(t("notebook.delete-workspace-confirm"))) return;
                await deleteWorkspace.mutateAsync(current.name);
                const remaining = workspaces.filter((w) => w.name !== current.name);
                if (remaining[0]) onChange(remaining[0].name);
              }}
            >
              {t("common.delete")}
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link to="/shelf">{t("notebook.go-to-bookshelf")}</Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <PromptDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title={t("notebook.new-workspace")}
        placeholder={t("notebook.workspace-title-placeholder")}
        onConfirm={async (title) => {
          const workspace = await createWorkspace.mutateAsync(title);
          onCreated?.(workspace.name);
        }}
      />
      {current && (
        <PromptDialog
          open={renameOpen}
          onOpenChange={setRenameOpen}
          title={t("notebook.rename-workspace")}
          defaultValue={current.title}
          onConfirm={async (title) => {
            await updateWorkspace.mutateAsync({
              workspace: { ...current, title },
              updateMask: ["title"],
            });
          }}
        />
      )}
    </div>
  );
};

export default WorkspaceSelector;
