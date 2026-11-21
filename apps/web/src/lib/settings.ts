import type { SequenceSetting, SequenceSettingInput } from '@erp/shared';
import { api } from './api';

/** Typed calls to the Settings API (needs admin.settings.manage). */
export const settingsApi = {
  listSequences: () => api<SequenceSetting[]>('/settings/sequences'),
  updateSequence: (id: string, body: SequenceSettingInput) =>
    api<SequenceSetting>(`/settings/sequences/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
};
