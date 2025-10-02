// Centralized visibility and helpers for managed folders in the workspace

export const MANAGED_ROOTS = ["vehicles", "designer_masks", "designer_states"] as const;
export type ManagedRootName = typeof MANAGED_ROOTS[number];

// Toggle visibility per scope. Set admin: true to show for admins.
export const SHOW_MANAGED_FOLDERS: Record<'user' | 'admin', boolean> = {
  user: false,
  admin: false,
};

export function isManagedRoot(name: string): boolean {
  return MANAGED_ROOTS.includes(name as ManagedRootName);
}

export function isManagedPath(path: string): boolean {
  const p = String(path || '').replace(/^\/+|\/+$/g, '');
  for (const root of MANAGED_ROOTS) {
    if (p === root || p.startsWith(root + '/')) return true;
  }
  return false;
}


