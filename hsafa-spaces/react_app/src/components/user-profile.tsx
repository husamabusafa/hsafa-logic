import { useState } from "react";
import { X, Mail, Calendar, Shield, CheckCircle, AlertCircle, LogOut, KeyRound, PencilIcon, CheckIcon, LoaderIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";

interface UserProfileProps {
  onClose: () => void;
}

export function UserProfile({ onClose }: UserProfileProps) {
  const navigate = useNavigate();
  const { user, logout, updateProfile } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  if (!user) return null;

  const handleStartEdit = () => {
    setEditName(user.name);
    setEditError(null);
    setIsEditing(true);
  };

  const handleSave = async () => {
    const trimmed = editName.trim();
    if (!trimmed) return;
    if (trimmed === user.name) {
      setIsEditing(false);
      return;
    }
    setIsSaving(true);
    setEditError(null);
    try {
      await updateProfile({ name: trimmed });
      setIsEditing(false);
    } catch (err: any) {
      setEditError(err.message || "Failed to update name");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-card">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h2 className="text-sm font-semibold">Your Profile</h2>
        <button
          onClick={onClose}
          className="p-1 rounded-lg hover:bg-muted transition-colors"
        >
          <X className="size-4 text-muted-foreground" />
        </button>
      </div>

      {/* Profile Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Avatar and Name */}
        <div className="flex flex-col items-center text-center mb-6">
          {user.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt={user.name}
              className="size-20 rounded-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <Avatar
              name={user.name}
              size="xl"
            />
          )}
          {isEditing ? (
            <div className="mt-3 w-full max-w-[220px]">
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSave();
                  if (e.key === "Escape") setIsEditing(false);
                }}
                autoFocus
                className="w-full h-9 rounded-lg border border-border bg-muted/60 px-3 text-sm font-semibold text-center focus:outline-none focus:ring-2 focus:ring-ring/30"
              />
              <div className="flex justify-center gap-2 mt-2">
                <Button size="sm" variant="outline" onClick={() => setIsEditing(false)} disabled={isSaving}>
                  Cancel
                </Button>
                <Button size="sm" onClick={handleSave} disabled={!editName.trim() || isSaving}>
                  {isSaving ? <LoaderIcon className="size-3.5 animate-spin" /> : <CheckIcon className="size-3.5" />}
                  Save
                </Button>
              </div>
              {editError && <p className="text-xs text-destructive mt-1">{editError}</p>}
            </div>
          ) : (
            <div className="flex items-center gap-1.5 mt-3">
              <h3 className="text-lg font-semibold">{user.name}</h3>
              <button onClick={handleStartEdit} className="p-1 rounded-md hover:bg-muted transition-colors" title="Edit name">
                <PencilIcon className="size-3.5 text-muted-foreground" />
              </button>
            </div>
          )}
          <p className="text-sm text-muted-foreground">{user.email}</p>
          <div className="flex items-center gap-1.5 mt-2">
            {user.emailVerified ? (
              <>
                <CheckCircle className="size-3.5 text-green-500" />
                <span className="text-xs text-green-600">Verified</span>
              </>
            ) : (
              <>
                <AlertCircle className="size-3.5 text-amber-500" />
                <span className="text-xs text-amber-600">Unverified</span>
              </>
            )}
          </div>
        </div>

        {/* Profile Details */}
        <div className="space-y-3">
          <div className="rounded-lg border border-border p-3">
            <div className="flex items-center gap-2 mb-1">
              <Mail className="size-4 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">Email</span>
            </div>
            <p className="text-sm pl-6">{user.email}</p>
          </div>

          <div className="rounded-lg border border-border p-3">
            <div className="flex items-center gap-2 mb-1">
              <Shield className="size-4 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">Account Type</span>
            </div>
            <p className="text-sm pl-6 capitalize">Human</p>
          </div>

          {user.entityId && (
            <div className="rounded-lg border border-border p-3">
              <div className="flex items-center gap-2 mb-1">
                <Calendar className="size-4 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">Entity ID</span>
              </div>
              <p className="text-xs pl-6 font-mono text-muted-foreground">{user.entityId}</p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="mt-6 space-y-2">
          <Button
            variant="outline"
            className="w-full justify-start"
            size="sm"
            onClick={() => { onClose(); navigate("/settings/api-keys"); }}
          >
            <KeyRound className="size-4" />
            API Keys
          </Button>
          <Button variant="outline" className="w-full justify-start" size="sm" onClick={handleStartEdit}>
            <PencilIcon className="size-4" />
            Edit Profile
          </Button>
          <Button
            variant="outline"
            className="w-full justify-start text-destructive hover:text-destructive"
            size="sm"
            onClick={logout}
          >
            <LogOut className="size-4" />
            Sign Out
          </Button>
        </div>
      </div>
    </div>
  );
}
