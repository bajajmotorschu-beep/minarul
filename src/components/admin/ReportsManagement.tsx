import React, { useState, useMemo, useEffect } from 'react';
import {
  FileText,
  BarChart3,
  TrendingUp,
  Boxes,
  CircleDollarSign,
  Download,
  Printer,
  Calendar,
  Layers,
  ArrowRight,
  Filter,
} from 'lucide-react';
import { Product, Purchase, Expense, Supplier, Sale, Order, CashTransaction } from '../../types';
import { businessService } from '../../services/businessService';
import { exportToCSV, printSection } from '../../utils/exportUtils';
import { useLanguage } from '../../context/LanguageContext';

interface ReportsManagementProps {
  products: Product[];
  orders: Order[];
  onToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

const money = (n: number) => `৳${Number(n || 0).toLocaleString('en-BD', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const ReportsManagement: React.FC<ReportsManagementProps> = ({ products, orders, onToast }) => {
  const { language } = useLanguage();
  const [activeReport, setActiveReport] = useState<
    'pnl' | 'sales' | 'purchases' | 'stock' | 'expenses' | 'cashflow'
  >('pnl');

  const [sales, setSales] = useState<Sale[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [cashTx, setCashTx] = useState<CashTransaction[]>([]);
  const [loading, setLoading] = useState(false);

  // Date Range Filter: 'all' | 'today' | 'month' | 'custom'
  const [timeRange, setTimeRange] = useState<'all' | 'today' | 'month'>('all');

  const loadData = async () => {
    setLoading(true);
    try {
      const [s, pu, ex, ctx] = await Promise.all([
        businessService.getSales(),
        businessService.getPurchases(),
        businessService.getExpenses(),
        businessService.getCashTransactions(),
      ]);
      setSales(s);
      setPurchases(pu);
      setExpenses(ex);
      setCashTx(ctx);
    } catch (e: any) {
      console.error(e);
      onToast(e?.message || 'Failed to load report data', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filter lists based on timeRange
  const todayStr = new Date().toISOString().slice(0, 10);
  const currentMonthStr = new Date().toISOString().slice(0, 7);

  const filterByDate = <T extends { createdAt?: any; date?: string; purchaseDate?: string; expenseDate?: string }>(
    list: T[]
  ): T[] => {
    if (timeRange === 'all') return list;
    return list.filter((item) => {
      const dStr =
        item.date ||
        item.purchaseDate ||
        item.expenseDate ||
        (item.createdAt?.toDate
          ? item.createdAt.toDate().toISOString().slice(0, 10)
          : typeof item.createdAt === 'string'
          ? item.createdAt.slice(0, 10)
          : '');
      if (timeRange === 'today') return dStr === todayStr;
      if (timeRange === 'month') return dStr.startsWith(currentMonthStr);
      return true;
    });
  };

  const filteredSales = useMemo(() => filterByDate(sales), [sales, timeRange]);
  const filteredPurchases = useMemo(() => filterByDate(purchases), [purchases, timeRange]);
  const filteredExpenses = useMemo(() => filterByDate(expenses), [expenses, timeRange]);
  const filteredCashTx = useMemo(() => filterByDate(cashTx), [cashTx, timeRange]);

  // Profit & Loss Metrics
  const revenue = filteredSales.reduce((s, x) => s + (Number(x.totalAmount) || 0), 0);
  const cogs = filteredSales.reduce((s, x) => s + (Number(x.totalCost) || 0), 0);
  const grossProfit = revenue - cogs;
  const totalOperatingExpenses = filteredExpenses.reduce((s, x) => s + (Number(x.amount) || 0), 0);
  const netProfit = grossProfit - totalOperatingExpenses;
  const grossMargin = revenue > 0 ? ((grossProfit / revenue) * 100).toFixed(1) : '0';
  const netMargin = revenue > 0 ? ((netProfit / revenue) * 100).toFixed(1) : '0';

  // Export CSV
  const handleExportCSV = () => {
    if (activeReport === 'pnl') {
      const headers = ['Financial Metric', 'Amount (BDT)'];
      const rows = [
        ['Total Revenue (Sales)', revenue],
        ['Cost of Goods Sold (COGS)', cogs],
        ['Gross Profit', grossProfit],
        ['Total Operating Expenses', totalOperatingExpenses],
        ['Net Operating Profit', netProfit],
        ['Gross Margin %', `${grossMargin}%`],
        ['Net Margin %', `${netMargin}%`],
      ];
      exportToCSV('profit_and_loss_report', rows, headers);
    } else if (activeReport === 'sales') {
      const headers = ['Sale ID', 'Order ID', 'Date', 'Customer', 'Revenue', 'COGS', 'Gross Profit'];
      const rows = filteredSales.map((s) => [
        s.saleId,
        s.orderId,
        s.createdAt?.toDate ? s.createdAt.toDate().toISOString().slice(0, 10) : '-',
        s.customerName || 'Customer',
        s.totalAmount,
        s.totalCost || 0,
        s.grossProfit || 0,
      ]);
      exportToCSV('sales_report', rows, headers);
    } else if (activeReport === 'expenses') {
      const headers = ['Expense ID', 'Date', 'Category', 'Description', 'Payment Method', 'Amount'];
      const rows = filteredExpenses.map((ex) => [
        ex.expenseId || ex.id,
        ex.expenseDate || '-',
        ex.category,
        ex.description || '-',
        ex.paymentMethod || 'Cash',
        ex.amount,
      ]);
      exportToCSV('expense_report', rows, headers);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-stone-200">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-serif text-2xl font-bold text-stone-900">
              {language === 'bn' ? 'ব্যবসায়িক আর্থিক রিপোর্ট ও স্টেটমেন্ট' : 'Financial & ERP Reports'}
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-stone-900 text-amber-300">
              EXECUTIVE AUDIT
            </span>
          </div>
          <p className="text-xs text-stone-500 mt-1">
            {language === 'bn'
              ? 'লাভ-ক্ষতি (P&L), সেলস, পারচেজ, ইনভেন্টরি এবং ক্যাশ ফ্লো অডিট রিপোর্ট'
              : 'Detailed Profit & Loss, Sales breakdown, Purchase history, Expenses, and Cash Flow statement.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Time Filter */}
          <div className="flex items-center rounded-xl bg-stone-100 p-1 text-xs font-bold text-stone-600">
            <button
              onClick={() => setTimeRange('all')}
              className={`px-3 py-1.5 rounded-lg cursor-pointer transition-all ${
                timeRange === 'all' ? 'bg-white text-stone-900 shadow-2xs' : 'hover:text-stone-900'
              }`}
            >
              All Time
            </button>
            <button
              onClick={() => setTimeRange('month')}
              className={`px-3 py-1.5 rounded-lg cursor-pointer transition-all ${
                timeRange === 'month' ? 'bg-white text-stone-900 shadow-2xs' : 'hover:text-stone-900'
              }`}
            >
              This Month
            </button>
            <button
              onClick={() => setTimeRange('today')}
              className={`px-3 py-1.5 rounded-lg cursor-pointer transition-all ${
                timeRange === 'today' ? 'bg-white text-stone-900 shadow-2xs' : 'hover:text-stone-900'
              }`}
            >
              Today
            </button>
          </div>

          <button
            onClick={handleExportCSV}
            className="px-3.5 py-2 rounded-xl border border-stone-300 bg-white hover:bg-stone-50 text-stone-700 text-xs font-semibold flex items-center gap-1 shadow-2xs cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>CSV</span>
          </button>

          <button
            onClick={() => printSection('Financial ERP Report', 'report-print-area')}
            className="px-3.5 py-2 rounded-xl border border-stone-300 bg-white hover:bg-stone-50 text-stone-700 text-xs font-semibold flex items-center gap-1 shadow-2xs cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print</span>
          </button>
        </div>
      </div>

      {/* Report Switcher Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-stone-200 pb-2 text-xs font-bold">
        <button
          onClick={() => setActiveReport('pnl')}
          className={`px-4 py-2 rounded-xl transition-all cursor-pointer ${
            activeReport === 'pnl'
              ? 'bg-amber-700 text-white shadow-xs'
              : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-50'
          }`}
        >
          <BarChart3 className="inline w-3.5 h-3.5 mr-1" />
          Profit & Loss Statement (P&L)
        </button>

        <button
          onClick={() => setActiveReport('sales')}
          className={`px-4 py-2 rounded-xl transition-all cursor-pointer ${
            activeReport === 'sales'
              ? 'bg-amber-700 text-white shadow-xs'
              : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-50'
          }`}
        >
          <TrendingUp className="inline w-3.5 h-3.5 mr-1" />
          Sales Report ({filteredSales.length})
        </button>

        <button
          onClick={() => setActiveReport('purchases')}
          className={`px-4 py-2 rounded-xl transition-all cursor-pointer ${
            activeReport === 'purchases'
              ? 'bg-amber-700 text-white shadow-xs'
              : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-50'
          }`}
        >
          <Layers className="inline w-3.5 h-3.5 mr-1" />
          Purchase Report ({filteredPurchases.length})
        </button>

        <button
          onClick={() => setActiveReport('expenses')}
          className={`px-4 py-2 rounded-xl transition-all cursor-pointer ${
            activeReport === 'expenses'
              ? 'bg-amber-700 text-white shadow-xs'
              : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-50'
          }`}
        >
          <CircleDollarSign className="inline w-3.5 h-3.5 mr-1" />
          Operating Expenses ({filteredExpenses.length})
        </button>

        <button
          onClick={() => setActiveReport('cashflow')}
          className={`px-4 py-2 rounded-xl transition-all cursor-pointer ${
            activeReport === 'cashflow'
              ? 'bg-amber-700 text-white shadow-xs'
              : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-50'
          }`}
        >
          <FileText className="inline w-3.5 h-3.5 mr-1" />
          Cash Flow Report ({filteredCashTx.length})
        </button>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* REPORT 1: PROFIT & LOSS STATEMENT */}
      {/* ------------------------------------------------------------- */}
      {activeReport === 'pnl' && (
        <div id="report-print-area" className="bg-white rounded-3xl border border-stone-200 p-6 shadow-xs space-y-6">
          <div className="flex justify-between items-center border-b border-stone-200 pb-4">
            <div>
              <h3 className="font-serif text-xl font-bold text-stone-900">
                {language === 'bn' ? 'লাভ-ক্ষতি খতিয়ান (Profit & Loss Statement)' : 'Profit & Loss Statement'}
              </h3>
              <p className="text-xs text-stone-500">
                Period:{' '}
                {timeRange === 'today'
                  ? `Today (${todayStr})`
                  : timeRange === 'month'
                  ? `Month (${currentMonthStr})`
                  : 'Cumulative All-Time'}
              </p>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-stone-400 block font-mono">STATUS</span>
              <span className="text-xs font-bold text-emerald-700 uppercase">AUDITED BASIS</span>
            </div>
          </div>

          <div className="space-y-4 max-w-3xl text-sm font-medium">
            {/* Revenue */}
            <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200 space-y-2">
              <div className="flex justify-between items-center text-stone-900 font-bold">
                <span>1. Total Revenue (Sales Finalized)</span>
                <span className="font-mono text-base">{money(revenue)}</span>
              </div>
              <p className="text-[11px] text-stone-500">Total gross receipts from confirmed customer orders.</p>
            </div>

            {/* COGS */}
            <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200 space-y-2">
              <div className="flex justify-between items-center text-stone-900 font-bold">
                <span>2. Cost of Goods Sold (COGS)</span>
                <span className="font-mono text-base text-rose-700">-{money(cogs)}</span>
              </div>
              <p className="text-[11px] text-stone-500">
                Actual weighted purchase cost of all apparel items fulfilled.
              </p>
            </div>

            {/* Gross Profit */}
            <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200 space-y-2">
              <div className="flex justify-between items-center text-emerald-950 font-bold">
                <span>3. Gross Profit (Revenue - COGS)</span>
                <span className="font-mono text-lg text-emerald-800">{money(grossProfit)}</span>
              </div>
              <div className="text-[11px] text-emerald-700">Gross Margin: {grossMargin}%</div>
            </div>

            {/* Operating Expenses */}
            <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200 space-y-2">
              <div className="flex justify-between items-center text-stone-900 font-bold">
                <span>4. Operating & Administrative Expenses</span>
                <span className="font-mono text-base text-rose-700">-{money(totalOperatingExpenses)}</span>
              </div>
              <p className="text-[11px] text-stone-500">
                Shop rent, salaries, utilities, courier packaging, Facebook ads, office maintenance.
              </p>
            </div>

            {/* Net Profit */}
            <div
              className={`p-5 rounded-2xl border space-y-2 ${
                netProfit >= 0
                  ? 'bg-amber-50/80 border-amber-300 text-amber-950'
                  : 'bg-rose-50 border-rose-300 text-rose-950'
              }`}
            >
              <div className="flex justify-between items-center font-extrabold text-base">
                <span>5. Net Operating Profit (Gross Profit - Expenses)</span>
                <span className="font-mono text-xl">{money(netProfit)}</span>
              </div>
              <div className="text-xs">
                Net Margin: {netMargin}% • {netProfit >= 0 ? 'Profitable operation' : 'Operating deficit'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* REPORT 2: OPERATING EXPENSES REPORT */}
      {/* ------------------------------------------------------------- */}
      {activeReport === 'expenses' && (
        <div id="report-print-area" className="bg-white rounded-3xl border border-stone-200 overflow-hidden shadow-xs">
          <div className="p-4 bg-stone-50 border-b border-stone-200 flex justify-between items-center text-xs">
            <span className="font-bold text-stone-900">
              Total Expenses in Period: <span className="font-mono text-rose-700">{money(totalOperatingExpenses)}</span>
            </span>
            <span className="text-stone-500">{filteredExpenses.length} entries</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-stone-100 font-bold text-stone-700 uppercase text-[10px]">
                <tr>
                  <th className="py-2.5 px-4">Expense ID</th>
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3">Category</th>
                  <th className="py-2.5 px-4">Description</th>
                  <th className="py-2.5 px-3">Payment Method</th>
                  <th className="py-2.5 px-4 text-right">Amount (৳)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {filteredExpenses.map((ex) => (
                  <tr key={ex.id} className="hover:bg-stone-50">
                    <td className="py-2.5 px-4 font-mono font-bold text-stone-800">{ex.expenseId || ex.id}</td>
                    <td className="py-2.5 px-3 text-stone-500">{ex.expenseDate || '-'}</td>
                    <td className="py-2.5 px-3 font-semibold text-stone-900">{ex.category}</td>
                    <td className="py-2.5 px-4 text-stone-600">{ex.description || '-'}</td>
                    <td className="py-2.5 px-3 font-mono">
                      <span className="px-2 py-0.5 rounded bg-stone-100 text-[10px] font-bold">
                        {ex.paymentMethod || 'Cash'}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono font-bold text-rose-700 text-sm">
                      {money(ex.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* REPORT 3: CASH FLOW AUDIT */}
      {/* ------------------------------------------------------------- */}
      {activeReport === 'cashflow' && (
        <div id="report-print-area" className="bg-white rounded-3xl border border-stone-200 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-stone-50 font-bold text-stone-700 uppercase text-[10px]">
                <tr>
                  <th className="py-2.5 px-4">Tx ID</th>
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3 text-center">Type</th>
                  <th className="py-2.5 px-3">Category</th>
                  <th className="py-2.5 px-3">Account</th>
                  <th className="py-2.5 px-3 text-right">Amount</th>
                  <th className="py-2.5 px-4">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {filteredCashTx.map((tx) => {
                  const isIn = tx.type === 'CASH_IN';
                  return (
                    <tr key={tx.transactionId || tx.id} className="hover:bg-stone-50">
                      <td className="py-2.5 px-4 font-mono font-bold">{tx.transactionId}</td>
                      <td className="py-2.5 px-3 text-stone-500">
                        {tx.createdAt?.toDate ? tx.createdAt.toDate().toISOString().slice(0, 10) : '-'}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            isIn ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {tx.type}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-semibold">{tx.category}</td>
                      <td className="py-2.5 px-3 font-mono">{tx.paymentMethod}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold">
                        <span className={isIn ? 'text-emerald-700' : 'text-rose-700'}>
                          {isIn ? `+${money(tx.amount)}` : `-${money(tx.amount)}`}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-stone-600">{tx.description || '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
