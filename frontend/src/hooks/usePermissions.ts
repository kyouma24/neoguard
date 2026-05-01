import { useAuth } from "../contexts/AuthContext";

export interface Permissions {
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canInvite: boolean;
  canManageKeys: boolean;
}

export function usePermissions(): Permissions {
  const { role } = useAuth();

  const isAdminOrOwner = role === "owner" || role === "admin";
  const isMemberOrAbove = isAdminOrOwner || role === "member";

  return {
    canCreate: isMemberOrAbove,
    canEdit: isMemberOrAbove,
    canDelete: isAdminOrOwner,
    canInvite: isAdminOrOwner,
    canManageKeys: isAdminOrOwner,
  };
}
