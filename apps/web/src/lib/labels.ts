import type { MessageKey } from '@/locales/en';
import type { TFunction } from './i18n';

const DEFAULT_ROLE_KEYS: Record<string, MessageKey> = {
  Admin: 'role.admin',
  'Sales clerk': 'role.salesClerk',
  Purchaser: 'role.purchaser',
  Storekeeper: 'role.storekeeper',
  Accountant: 'role.accountant',
  Viewer: 'role.viewer',
};

const DEFAULT_ROLE_DESC_KEYS: Record<string, MessageKey> = {
  Admin: 'roleDesc.admin',
  'Sales clerk': 'roleDesc.salesClerk',
  Purchaser: 'roleDesc.purchaser',
  Storekeeper: 'roleDesc.storekeeper',
  Accountant: 'roleDesc.accountant',
  Viewer: 'roleDesc.viewer',
};

/** Seeded role names are translated; roles created by the admin keep their own name. */
export function roleLabel(name: string, t: TFunction): string {
  const key = DEFAULT_ROLE_KEYS[name];
  return key ? t(key) : name;
}

export function roleDescription(name: string, description: string | null, t: TFunction): string {
  const key = DEFAULT_ROLE_DESC_KEYS[name];
  return key ? t(key) : (description ?? '');
}
