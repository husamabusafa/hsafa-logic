import { useState } from "react";
import { UsersIcon, UserIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface CreateSpaceDialogProps {
  open: boolean;
  onClose: () => void;
  onCreate: (space: { name: string; description: string; isGroup: boolean }) => void;
}

export function CreateSpaceDialog({ open, onClose, onCreate }: CreateSpaceDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isGroup, setIsGroup] = useState(true);

  const handleCreate = () => {
    if (!name.trim()) return;
    onCreate({ name: name.trim(), description: description.trim(), isGroup });
    setName("");
    setDescription("");
    setIsGroup(true);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogHeader onClose={onClose}>
        <DialogTitle>Create a new space</DialogTitle>
        <DialogDescription>
          Spaces are where conversations happen. Add people and haseefs to collaborate.
        </DialogDescription>
      </DialogHeader>

      {/* Space type selector */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <button
          onClick={() => setIsGroup(true)}
          className={cn(
            "flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-colors",
            isGroup
              ? "border-primary bg-primary/5"
              : "border-border hover:border-border/80 hover:bg-muted/50",
          )}
        >
          <UsersIcon className={cn("size-6", isGroup ? "text-primary" : "text-muted-foreground")} />
          <div className="text-center">
            <p className={cn("text-sm font-medium", isGroup ? "text-primary" : "text-foreground")}>Group</p>
            <p className="text-[11px] text-muted-foreground">Multiple members</p>
          </div>
        </button>
        <button
          onClick={() => setIsGroup(false)}
          className={cn(
            "flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-colors",
            !isGroup
              ? "border-primary bg-primary/5"
              : "border-border hover:border-border/80 hover:bg-muted/50",
          )}
        >
          <UserIcon className={cn("size-6", !isGroup ? "text-primary" : "text-muted-foreground")} />
          <div className="text-center">
            <p className={cn("text-sm font-medium", !isGroup ? "text-primary" : "text-foreground")}>Direct</p>
            <p className="text-[11px] text-muted-foreground">1-on-1 chat</p>
          </div>
        </button>
      </div>

      <div className="space-y-4">
        <Input
          label="Space name"
          id="space-name"
          placeholder={isGroup ? "e.g. Product Team" : "e.g. John Doe"}
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
        <Textarea
          label="Description (optional)"
          id="space-desc"
          placeholder="What's this space about?"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
        />
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={handleCreate} disabled={!name.trim()}>
          Create space
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
