import React, { useState, useEffect, useMemo } from 'react';
import {
  TrendingUp,
  Search,
  Download,
  Printer,
  RefreshCw,
  RotateCcw,
  CircleDollarSign,
  Layers,
  Calendar,
  X,
  Eye,
  CheckCircle2,
} from 'lucide-react';
import { Sale, Order, PaymentAccountMethod } from '../../types';
import { businessService } from '../../services/businessService';
import { exportToCSV, printSection } from '../../utils/exportUtils';
import { useLanguage } from '../../context/LanguageContext';

interface SalesManagementProps {
  orders: Order[];
  onToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
  onRefreshOrders?: () => void;
}

const money = (n: number) => `৳${Number(n || 0).toLocaleString('en-BD', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const SalesManagement: React.FC<SalesManagementProps> = ({ orders, onToast, onRefreshOrders }) => {
  const { language } = useLanguage();
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(false);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [viewingSale, setViewingSale] = useState<Sale | null>(null);

  // Return Modal
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returnOrderId, setReturnOrderId] = useState('');
  const [returnProductId, setReturnProductId] = useState('');
  const [returnProductName, setReturnProductName] = useState('');
  const [returnQty, setReturnQty] = useState<number>(1);
  const [returnRefund, setReturnRefund] = useState<number>(0);
  const [returnMethod, setReturnMethod] = useState<PaymentAccountMethod>('CASH');
  const [returnReason, setReturnReason] = useState('');
  const [returnSaving, setReturnSaving] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const sList = await businessService.getSales();
      setSales(sList);
    } catch (e: any) {
      console.error(e);
      onToast(e?.message || 'Failed to load sales records', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Summary Metrics
  const totalRevenue = useMemo(() => sales.reduce((s, x) => s + (Number(x.totalAmount) || 0), 0), [sales]);
  const totalCOGS = useMemo(() => sales.reduce((s, x) => s + (Number(x.totalCost) || 0), 0), [sales]);
  const totalGrossProfit = totalRevenue - totalCOGS;
  const overallGrossMargin = totalRevenue > 0 ? ((totalGrossProfit / totalRevenue) * 100).toFixed(1) : '0';

  // Filtered Sales
  const filteredSales = useMemo(() => {
    return sales.filter((s) => {
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !q ||
        s.saleId.toLowerCase().includes(q) ||
        s.orderId.toLowerCase().includes(q) ||
        (s.customerName && s.customerName.toLowerCase().includes(q));

      let matchesDate = true;
      if (dateFilter) {
        const dStr = s.createdAt?.toDate
          ? s.createdAt.toDate().toISOString().slice(0, 10)
          : typeof s.createdAt === 'string'
          ? s.createdAt.slice(0, 10)
          : '';
        matchesDate = dStr === dateFilter;
      }

      return matchesSearch && matchesDate;
    });
  }, [sales, searchQuery, dateFilter]);

  // Open Return Modal
  const openReturnModal = (orderId?: string) => {
    setReturnOrderId(orderId || (orders[0]?.id ?? ''));
    const ord = orders.find((o) => o.id === (orderId || orders[0]?.id));
    if (ord && ord.items?.length) {
      setReturnProductId(ord.items[0].productId);
      setReturnProductName(ord.items[0].titleEn || ord.items[0].titleBn || ord.items[0].productName || '');
      setReturnQty(1);
      setReturnRefund(Number(ord.items[0].price) || 0);
    }
    setReturnMethod('CASH');
    setReturnReason('');
    setShowReturnModal(true);
  };

  // Submit Sales Return
  const handleSaveReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!returnOrderId || !returnProductId) {
      onToast('Select valid order and product', 'error');
      return;
    }
    if (!returnReason.trim()) {
      onToast('Please specify the return reason', 'error');
      return;
    }

    setReturnSaving(true);
    try {
      await businessService.createSalesReturn({
        orderId: returnOrderId,
        productId: returnProductId,
        productName: returnProductName,
        quantity: Math.abs(Number(returnQty) || 1),
        refundAmount: Number(returnRefund) || 0,
        paymentMethod: returnMethod,
        reason: returnReason.trim(),
      });

      onToast(
        language === 'bn'
          ? 'সেলস রিটার্ন সম্পন্ন হয়েছে এবং পণ্য স্টকে ফেরত যোগ হয়েছে!'
          : 'Sales return completed and stock restored!',
        'success'
      );
      setShowReturnModal(false);
      await loadData();
      if (onRefreshOrders) onRefreshOrders();
    } catch (err: any) {
      console.error(err);
      onToast(err?.message || 'Sales return failed', 'error');
    } finally {
      setReturnSaving(false);
    }
  };

  const handleExportCSV = () => {
    const headers = [
      'Sale ID',
      'Order ID',
      'Date',
      'Customer',
      'Total Amount',
      'COGS',
      'Gross Profit',
      'Payment Method',
      'Payment Status',
    ];
    const rows = filteredSales.map((s) => [
      s.saleId,
      s.orderId,
      s.createdAt?.toDate ? s.createdAt.toDate().toISOString().slice(0, 10) : '-',
      s.customerName || 'Customer',
      s.totalAmount,
      s.totalCost || 0,
      s.grossProfit || 0,
      s.paymentMethod || 'COD',
      s.paymentStatus || 'unpaid',
    ]);
    exportToCSV('minarul_sales', rows, headers);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-stone-200">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-serif text-2xl font-bold text-stone-900">
              {language === 'bn' ? 'বিক্রয় ও মুনাফা লেজার (Sales & Profit)' : 'Sales & Profit Ledger'}
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-stone-900 text-amber-300">
              ERP SALES
            </span>
          </div>
          <p className="text-xs text-stone-500 mt-1">
            {language === 'bn'
              ? 'নিশ্চিত অর্ডারের বিক্রয় হিসাব, প্রকৃত ক্রয়মূল্যভিত্তিক COGS এবং গ্রস প্রফিট ট্র্যাকিং'
              : 'Confirmed sales records, Cost of Goods Sold (COGS) based on actual weighted purchase cost & gross margins.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => openReturnModal()}
            className="px-4 py-2.5 rounded-xl bg-stone-800 hover:bg-stone-900 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
          >
            <RotateCcw className="w-4 h-4 text-amber-300" />
            <span>{language === 'bn' ? 'সেলস রিটার্ন এন্ট্রি' : 'Sales Return'}</span>
          </button>

          <button
            onClick={loadData}
            disabled={loading}
            className="p-2.5 rounded-xl border border-stone-300 bg-white hover:bg-stone-50 text-stone-700 text-xs font-bold shadow-xs cursor-pointer disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-xs">
          <div className="text-xs text-stone-500 font-bold uppercase">Total Revenue (Sales)</div>
          <div className="text-2xl font-bold font-serif text-stone-900 mt-1">{money(totalRevenue)}</div>
          <div className="text-[11px] text-stone-400">{sales.length} finalized orders</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-xs">
          <div className="text-xs text-stone-500 font-bold uppercase">Cost of Goods Sold (COGS)</div>
          <div className="text-2xl font-bold font-serif text-stone-700 mt-1">{money(totalCOGS)}</div>
          <div className="text-[11px] text-stone-400">Inventory cost basis</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-xs">
          <div className="text-xs text-emerald-800 font-bold uppercase">Total Gross Profit</div>
          <div className="text-2xl font-bold font-serif text-emerald-700 mt-1">{money(totalGrossProfit)}</div>
          <div className="text-[11px] text-emerald-600 font-semibold">Revenue minus COGS</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-xs">
          <div className="text-xs text-amber-800 font-bold uppercase">Gross Margin %</div>
          <div className="text-2xl font-bold font-serif text-amber-700 mt-1">{overallGrossMargin}%</div>
          <div className="text-[11px] text-amber-600 font-semibold">Average profitability</div>
        </div>
      </div>

      {/* Table Section */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-stone-200">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by Sale ID, Order ID or Customer..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-xs pl-9 pr-3 py-2 rounded-xl border border-stone-200 focus:border-amber-600 outline-none"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="text-xs px-3 py-2 rounded-xl border border-stone-200 bg-white outline-none cursor-pointer"
            />

            <button
              onClick={handleExportCSV}
              className="px-3 py-2 rounded-xl border border-stone-300 bg-white hover:bg-stone-50 text-stone-700 text-xs font-semibold flex items-center gap-1 shadow-2xs cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>CSV</span>
            </button>

            <button
              onClick={() => printSection('Sales Ledger', 'sales-print-area')}
              className="px-3 py-2 rounded-xl border border-stone-300 bg-white hover:bg-stone-50 text-stone-700 text-xs font-semibold flex items-center gap-1 shadow-2xs cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print</span>
            </button>
          </div>
        </div>

        <div id="sales-print-area" className="bg-white rounded-3xl border border-stone-200 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-stone-50 border-b border-stone-200 text-stone-600 font-bold uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="py-3 px-4">Sale ID</th>
                  <th className="py-3 px-3">Order Ref</th>
                  <th className="py-3 px-3">Customer</th>
                  <th className="py-3 px-3 text-right">Selling Total</th>
                  <th className="py-3 px-3 text-right">COGS</th>
                  <th className="py-3 px-3 text-right">Gross Profit</th>
                  <th className="py-3 px-3 text-center">Payment</th>
                  <th className="py-3 px-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {filteredSales.map((s) => {
                  const gp = Number(s.grossProfit || s.totalAmount - (s.totalCost || 0));
                  return (
                    <tr key={s.saleId || s.id} className="hover:bg-stone-50/70 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-stone-900 text-[11px]">
                        {s.saleId}
                      </td>
                      <td className="py-3 px-3 font-mono text-stone-600 font-medium">
                        {s.orderId}
                      </td>
                      <td className="py-3 px-3 font-semibold text-stone-900">
                        {s.customerName || 'Customer'}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-stone-900 text-sm">
                        {money(s.totalAmount)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-stone-600">
                        {money(s.totalCost || 0)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-emerald-700">
                        {money(gp)}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className="px-2 py-0.5 rounded bg-stone-100 font-mono text-[10px] font-bold uppercase">
                          {s.paymentMethod || 'COD'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => setViewingSale(s)}
                            className="p-1.5 rounded-lg border border-stone-200 hover:bg-stone-100 text-stone-600 cursor-pointer shadow-2xs"
                            title="View Itemized Breakdown"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => openReturnModal(s.orderId)}
                            className="px-2 py-1 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 text-[10px] font-bold transition-all cursor-pointer"
                            title="Return an item from this sale"
                          >
                            Return
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {!filteredSales.length && (
              <div className="p-8 text-center text-stone-400 text-xs">
                No finalized sales found. When customer orders are confirmed, sales records will automatically generate here.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* VIEW SALE BREAKDOWN MODAL */}
      {/* ------------------------------------------------------------- */}
      {viewingSale && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl border border-stone-200 my-8 text-xs">
            <div className="flex items-center justify-between border-b border-stone-200 pb-3">
              <div>
                <h3 className="font-serif text-lg font-bold text-stone-900">
                  Sale Breakdown: {viewingSale.saleId}
                </h3>
                <p className="text-stone-500 text-[11px]">
                  Order #{viewingSale.orderId} • Customer: {viewingSale.customerName || 'Customer'}
                </p>
              </div>
              <button
                onClick={() => setViewingSale(null)}
                className="p-1.5 rounded-full hover:bg-stone-100 text-stone-500 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="border border-stone-200 rounded-2xl overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-stone-50 font-bold text-stone-600 text-[10px] uppercase">
                  <tr>
                    <th className="py-2 px-3">Item</th>
                    <th className="py-2 px-2 text-center">Qty</th>
                    <th className="py-2 px-3 text-right">Selling</th>
                    <th className="py-2 px-3 text-right">Cost Price</th>
                    <th className="py-2 px-3 text-right">Gross Margin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 font-medium">
                  {(viewingSale.items || []).map((it, idx) => {
                    const lineSales = Number(it.totalSelling ?? it.sellingPrice * it.quantity);
                    const lineCost = Number(it.totalCost ?? it.costPrice * it.quantity);
                    const lineMargin = lineSales - lineCost;
                    return (
                      <tr key={idx}>
                        <td className="py-2 px-3 font-semibold text-stone-900">{it.productName}</td>
                        <td className="py-2 px-2 text-center">{it.quantity}</td>
                        <td className="py-2 px-3 text-right font-mono">{money(lineSales)}</td>
                        <td className="py-2 px-3 text-right font-mono text-stone-500">{money(lineCost)}</td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-emerald-700">
                          {money(lineMargin)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="p-3 rounded-2xl bg-stone-50 space-y-1 font-medium">
              <div className="flex justify-between">
                <span>Subtotal Sales:</span>
                <span className="font-mono">{money(viewingSale.subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span>Delivery Charge:</span>
                <span className="font-mono">{money(viewingSale.deliveryCharge || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span>Discount:</span>
                <span className="font-mono">-{money(viewingSale.discount || 0)}</span>
              </div>
              <div className="flex justify-between font-bold text-stone-900 border-t border-stone-200 pt-1">
                <span>Total Amount:</span>
                <span className="font-mono">{money(viewingSale.totalAmount)}</span>
              </div>
              <div className="flex justify-between text-stone-600">
                <span>Total COGS:</span>
                <span className="font-mono">{money(viewingSale.totalCost || 0)}</span>
              </div>
              <div className="flex justify-between font-bold text-emerald-800 text-sm border-t border-stone-200 pt-1">
                <span>Gross Profit:</span>
                <span className="font-mono">{money(viewingSale.grossProfit || 0)}</span>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setViewingSale(null)}
                className="px-4 py-2 rounded-xl bg-stone-900 text-white font-bold text-xs cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* SALES RETURN MODAL */}
      {/* ------------------------------------------------------------- */}
      {showReturnModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-stone-200 my-8 text-xs">
            <div className="flex items-center justify-between border-b border-stone-200 pb-3">
              <div className="flex items-center gap-2">
                <RotateCcw className="w-5 h-5 text-amber-700" />
                <h3 className="font-serif text-lg font-bold text-stone-900">
                  {language === 'bn' ? 'সেলস রিটার্ন এন্ট্রি' : 'Process Sales Return'}
                </h3>
              </div>
              <button
                onClick={() => setShowReturnModal(false)}
                className="p-1.5 rounded-full hover:bg-stone-100 text-stone-500 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveReturn} className="space-y-3.5">
              <div>
                <label className="block font-bold text-stone-700 mb-1">Select Order *</label>
                <select
                  required
                  value={returnOrderId}
                  onChange={(e) => {
                    const oid = e.target.value;
                    setReturnOrderId(oid);
                    const ord = orders.find((o) => o.id === oid);
                    if (ord && ord.items?.length) {
                      setReturnProductId(ord.items[0].productId);
                      setReturnProductName(ord.items[0].titleEn || ord.items[0].titleBn || ord.items[0].productName || '');
                      setReturnRefund(Number(ord.items[0].price) || 0);
                    }
                  }}
                  className="w-full p-2.5 rounded-xl border border-stone-300 font-bold bg-white"
                >
                  {orders.map((o) => (
                    <option key={o.id} value={o.id}>
                      #{o.id} - {o.customerName || o.shippingAddress?.fullName} ({money(o.totalAmount)})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-stone-700 mb-1">Product Being Returned *</label>
                <select
                  required
                  value={returnProductId}
                  onChange={(e) => {
                    const pid = e.target.value;
                    setReturnProductId(pid);
                    const ord = orders.find((o) => o.id === returnOrderId);
                    const it = ord?.items?.find((i) => i.productId === pid);
                    if (it) {
                      setReturnProductName(it.titleEn || it.titleBn || it.productName || '');
                      setReturnRefund(Number(it.price) * returnQty);
                    }
                  }}
                  className="w-full p-2.5 rounded-xl border border-stone-300 bg-white font-medium"
                >
                  {(orders.find((o) => o.id === returnOrderId)?.items || []).map((it, idx) => (
                    <option key={idx} value={it.productId}>
                      {it.titleEn || it.titleBn || it.productName} (Qty: {it.quantity})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-stone-700 mb-1">Return Quantity *</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={returnQty}
                    onChange={(e) => {
                      const q = Math.max(1, Number(e.target.value) || 1);
                      setReturnQty(q);
                      const ord = orders.find((o) => o.id === returnOrderId);
                      const it = ord?.items?.find((i) => i.productId === returnProductId);
                      if (it) setReturnRefund(Number(it.price) * q);
                    }}
                    className="w-full p-2.5 rounded-xl border border-stone-300 font-bold"
                  />
                </div>

                <div>
                  <label className="block font-bold text-stone-700 mb-1">Refund Amount (৳)</label>
                  <input
                    type="number"
                    min="0"
                    value={returnRefund}
                    onChange={(e) => setReturnRefund(Number(e.target.value) || 0)}
                    className="w-full p-2.5 rounded-xl border border-stone-300 font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-stone-700 mb-1">Refund Payment Method</label>
                <select
                  value={returnMethod}
                  onChange={(e) => setReturnMethod(e.target.value as any)}
                  className="w-full p-2.5 rounded-xl border border-stone-300 bg-white font-medium"
                >
                  <option value="CASH">CASH (Deducts Cash in Hand)</option>
                  <option value="BKASH">BKASH</option>
                  <option value="NAGAD">NAGAD</option>
                  <option value="ROCKET">ROCKET</option>
                  <option value="BANK">BANK</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-stone-700 mb-1">Reason for Return *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Size fitting issue, fabric defect..."
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-stone-300 outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-stone-200">
                <button
                  type="button"
                  onClick={() => setShowReturnModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-stone-300 hover:bg-stone-50 text-stone-700 font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={returnSaving}
                  className="px-5 py-2.5 rounded-xl bg-amber-700 hover:bg-amber-800 text-white font-bold disabled:opacity-50 cursor-pointer shadow-md"
                >
                  {returnSaving ? 'Processing...' : 'Confirm Return'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
