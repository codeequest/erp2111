/** Dashboard API calls. Figures are null until their module exists. */
import { api } from './api';

export interface DashboardSummary {
  lowStockCount: number | null;
  expiringLotsCount: number | null;
  expiredLotsCount: number | null;
  salesToday: string | null;
  salesThisMonth: string | null;
  unpaidInvoices: string | null;
}

export interface LowStockItem {
  id: string;
  sku: string;
  name: string;
  unit: string;
  minStock: string;
  onHand: string;
}

export const getDashboardSummary = () => api<DashboardSummary>('/dashboard/summary');
export const getLowStock = () => api<LowStockItem[]>('/dashboard/low-stock');
