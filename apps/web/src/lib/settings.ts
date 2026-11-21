/** Admin › Settings API calls (tax rates so far). */
import { api } from './api';

export interface TaxRateRow {
  id: string;
  name: string;
  rate: string;
  isActive: boolean;
  isDefault: boolean;
  productCount: number;
}

export const listAllTaxRates = () => api<TaxRateRow[]>('/settings/tax-rates');

export const createTaxRate = (data: { name: string; rate: number; isDefault?: boolean }) =>
  api<TaxRateRow[]>('/settings/tax-rates', { method: 'POST', body: JSON.stringify(data) });

export const updateTaxRate = (
  id: string,
  data: { name?: string; rate?: number; isActive?: boolean; isDefault?: boolean },
) =>
  api<TaxRateRow[]>(`/settings/tax-rates/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
