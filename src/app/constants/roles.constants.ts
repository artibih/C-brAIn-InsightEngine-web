export type UserRole = 'Admin' | 'C-Brain User' | 'External User' | 'Pending';

export const ROLE_ID_MAP: Record<UserRole, string> = {
  Admin: '1',
  'C-Brain User': '3',
  'External User': '2',
  Pending: '2',
};

export const ROLE_BACKEND_MAP: Record<UserRole, string> = {
  Admin: 'Admin',
  'C-Brain User': 'CBrainUser',
  'External User': 'User',
  Pending: 'User',
};

export const ADMIN_ROLE = 'Admin' as const;
