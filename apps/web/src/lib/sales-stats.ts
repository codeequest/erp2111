/** Sales statistics API (posted customer invoices minus credit notes, excl. VAT). */
import { api } from './api';

export type Granularity = 'month' | 'quarter' | 'year';

export interface StatsPeriod {
  key: string;
  label: string;
  revenue: number;
  tax: number;
  total: number;
  invoices: number;
  creditNotes: number;
  creditNoteAmount: number;
  averageInvoice: number | null;
  /** Same period one year earlier (month / quarter views only) */
  previousRevenue: number | null;
  /** Only with inventory.cost.view */
  costOfSales?: number;
  margin?: number;
  marginPct?: number | null;
}

export interface SalesStats {
  granularity: Granularity;
  year: number;
  currency: string;
  canSeeCost: boolean;
  periods: StatsPeriod[];
  totals: {
    revenue: number;
    tax: number;
    total: number;
    invoices: number;
    creditNoteAmount: number;
    previousRevenue: number | null;
    costOfSales?: number;
    margin?: number;
    marginPct?: number | null;
  };
  topProducts: { id: string; sku: string; name: string; quantity: number; revenue: number }[];
  topCategories: { id: string | null; name: string; revenue: number }[];
}

export const getSalesStats = (granularity: Granularity, year: number) =>
  api<SalesStats>(`/sales/statistics?granularity=${granularity}&year=${year}`);
