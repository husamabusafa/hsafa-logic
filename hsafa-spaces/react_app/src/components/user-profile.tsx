import { X, Mail, Calendar, Shield } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { currentUser } from "@/lib/mock-data";

interface UserProfileProps {
  onClose: () => void;
}

export function UserProfile({ onClose }: UserProfileProps) {
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
          <Avatar
            name={currentUser.name}
            color={currentUser.avatarColor}
            size="xl"
            isOnline={currentUser.isOnline}
          />
          <h3 className="text-lg font-semibold mt-3">{currentUser.name}</h3>
          <p className="text-sm text-muted-foreground">{currentUser.email}</p>
          <div className="flex items-center gap-1.5 mt-2">
            <div className={`size-2 rounded-full ${currentUser.isOnline ? "bg-green-500" : "bg-muted-foreground"}`} />
            <span className="text-xs text-muted-foreground">
              {currentUser.isOnline ? "Online" : "Offline"}
            </span>
          </div>
        </div>

        {/* Profile Details */}
        <div className="space-y-3">
          <div className="rounded-lg border border-border p-3">
            <div className="flex items-center gap-2 mb-1">
              <Mail className="size-4 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">Email</span>
            </div>
            <p className="text-sm pl-6">{currentUser.email}</p>
          </div>

          <div className="rounded-lg border border-border p-3">
            <div className="flex items-center gap-2 mb-1">
              <Shield className="size-4 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">Account Type</span>
            </div>
            <p className="text-sm pl-6 capitalize">{currentUser.type}</p>
          </div>

          <div className="rounded-lg border border-border p-3">
            <div className="flex items-center gap-2 mb-1">
              <Calendar className="size-4 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">Entity ID</span>
            </div>
            <p className="text-xs pl-6 font-mono text-muted-foreground">{currentUser.entityId}</p>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-6 space-y-2">
          <Button variant="outline" className="w-full justify-start" size="sm">
            Edit Profile
          </Button>
          <Button variant="outline" className="w-full justify-start" size="sm">
            Privacy Settings
          </Button>
          <Button variant="outline" className="w-full justify-start" size="sm">
            Notification Preferences
          </Button>
        </div>
      </div>
    </div>
  );
}
