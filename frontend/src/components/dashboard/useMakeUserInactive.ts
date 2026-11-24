"use client";

import { useApp } from "@/context/AppContext";
import { useDialog } from "@/components/ui/DialogProvider";

/**
 * Settings → Manage Users and the Admin page: make a user Inactive after a
 * confirm. It's one-way — an inactive user can't log in and can never be made
 * active again — and nothing they hold moves: their leads, calls and history
 * stay as they are. Users are never deleted. `saveFirst` (the editor's other
 * changes) runs only after the admin confirms, so Cancel saves nothing.
 * Resolves true once done, false if the admin cancelled; a server refusal is
 * thrown for the caller to show.
 */
export function useMakeUserInactive() {
  const { deactivateTeamMember } = useApp();
  const { confirm } = useDialog();
  return async (user: { id: string; name: string }, saveFirst?: () => Promise<unknown>): Promise<boolean> => {
    const ok = await confirm({
      title: `Make ${user.name} inactive?`,
      message: `${user.name} won't be able to log in. This can't be undone: an inactive user can never be made active again. Their leads, calls and history stay as they are.`,
      confirmLabel: "Make Inactive",
      danger: true
    });
    if (!ok) return false;
    await saveFirst?.();
    await deactivateTeamMember(user.id);
    return true;
  };
}
