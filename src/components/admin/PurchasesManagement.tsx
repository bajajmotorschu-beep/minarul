import React, { useState, useEffect } from 'react';
import {
  ShoppingCart,
  Plus,
  Search,
  Download,
  Printer,
  RefreshCw,
  Trash2,
  CheckCircle2,
  X,
  Eye,
  Calendar,
  Layers,
  Building,
} from 'lucide-react';
import { Purchase, PurchaseItem, Product, Supplier, PaymentAccountMethod } from '../../types';
import { businessService } from '../../services/businessService';
import { exportToCSV, printSection } from '../../utils/exportUtils';
import { useLanguage } from '../../context/LanguageContext';

interface PurchasesManagementProps {
  products: Product[];
  onToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
  onRefreshProducts?: () => void;
}

const money = (n: number) => `৳${Number(n || 0).toLocaleString('en-BD', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const PurchasesManagement: React.FC<PurchasesManagementProps> = ({
  products,
  onToast,
  onRefreshProducts,
}) => {
  const { language } = useLanguage();
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(false);

  // Active view: 'history' | 'new_purchase'
  const [activeTab, setActiveTab] = useState<'history' | 'new_purchase'>('history');

  // Search
  const [searchQuery, setSearchQuery] = useState('');
  const [viewingPurchase, setViewingPurchase] = useState<Purchase | null>(null);

  // New Purchase Form
  const [supplierId, setSupplierId] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().slice(0, 10));
  const [items, setItems] = useState<PurchaseItem[]>([]);
  const [discount, setDiscount] = useState<number>(0);
  const [transportCost, setTransportCost] = useState<number>(0);
  const [paidAmount, setPaidAmount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentAccountMethod>('CASH');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Add Item Line fields
  const [selectedProductId, setSelectedProductId] = useState('');
  const [selectedQty, setSelectedQty] = useState<number>(1);
  const [selectedCost, setSelectedCost] = useState<number>(0);

  const loadData = async () => {
    setLoading(true);
    try {
      const [puList, sList] = await Promise.all([
        businessService.getPurchases(),
        businessService.getSuppliers(),
      ]);
      setPurchases(puList);
      setSuppliers(sList);
    } catch (e: any) {
      console.error(e);
      onToast(e?.message || 'Failed to load purchase records', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Handle adding line item
  const handleAddItem = () => {
    const prod = products.find((p) => p.id === selectedProductId);
    if (!prod) {
      onToast('Select a product to add', 'error');
      return;
    }
    if (selectedQty <= 0 || selectedCost <= 0) {
      onToast('Quantity and Unit Cost must be greater than zero', 'error');
      return;
    }

    const newItem: PurchaseItem = {
      productId: prod.id,
      productName: prod.titleEn || prod.titleBn,
      sku: prod.sku,
      quantity: Number(selectedQty),
      unitCost: Number(selectedCost),
      totalCost: Number(selectedQty) * Number(selectedCost),
    };

    setItems([...items, newItem]);
    setSelectedProductId('');
    setSelectedQty(1);
    setSelectedCost(0);
  };

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  // Calculations
  const subtotal = items.reduce((sum, item) => sum + item.totalCost, 0);
  const grandTotal = Math.max(0, subtotal + Number(transportCost || 0) - Number(discount || 0));
  const dueAmount = Math.max(0, grandTotal - Number(paidAmount || 0));

  // Handle Submit Purchase
  const handleSubmitPurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    const sup = suppliers.find((s) => s.id === supplierId);
    if (!sup) {
      onToast('Please select a supplier', 'error');
      return;
    }
    if (!items.length) {
      onToast('Add at least one product item to the purchase invoice', 'error');
      return;
    }

    setSaving(true);
    try {
      await businessService.createPurchase({
        supplierId: sup.id,
        supplierName: sup.name,
        purchaseDate,
        items,
        subtotal,
        discount: Number(discount) || 0,
        transportCost: Number(transportCost) || 0,
        otherCost: 0,
        grandTotal,
        paidAmount: Number(paidAmount) || 0,
        dueAmount,
        paymentMethod,
        notes: notes.trim(),
      });

      onToast(
        language === 'bn'
          ? 'ক্রয় চালান সংরক্ষিত হয়েছে এবং পণ্যের স্টক বৃদ্ধি পেয়েছে!'
          : 'Purchase entry saved and stock updated!',
        'success'
      );

      // Reset form
      setSupplierId('');
      setItems([]);
      setDiscount(0);
      setTransportCost(0);
      setPaidAmount(0);
      setNotes('');
      setActiveTab('history');
      await loadData();
      if (onRefreshProducts) onRefreshProducts();
    } catch (err: any) {
      console.error(err);
      onToast(err?.message || 'Purchase save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Filtered Purchases
  const filteredPurchases = purchases.filter((pu) => {
    const q = searchQuery.trim().toLowerCase();
    return (
      !q ||
      pu.id.toLowerCase().includes(q) ||
      (pu.supplierName && pu.supplierName.toLowerCase().includes(q)) ||
      (pu.purchaseId && pu.purchaseId.toLowerCase().includes(q))
    );
  });

  const handleExportCSV = () => {
    const headers = [
      'Purchase ID',
      'Date',
      'Supplier',
      'Items Count',
      'Subtotal',
      'Transport Cost',
      'Discount',
      'Grand Total',
      'Paid Amount',
      'Due Amount',
      'Payment Method',
    ];
    const rows = filteredPurchases.map((p) => [
      p.purchaseId || p.id,
      p.purchaseDate,
      p.supplierName,
      (p.items || []).length,
      p.subtotal,
      p.transportCost || 0,
      p.discount || 0,
      p.grandTotal,
      p.paidAmount || 0,
      p.dueAmount || 0,
      p.paymentMethod || 'Cash',
    ]);
    exportToCSV('minarul_purchases', rows, headers);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-stone-200">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-serif text-2xl font-bold text-stone-900">
              {language === 'bn' ? 'ক্রয় ও স্টক ইন (Purchases & Stock In)' : 'Purchase & Stock In'}
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-stone-900 text-amber-300">
              ERP PROCUREMENT
            </span>
          </div>
          <p className="text-xs text-stone-500 mt-1">
            {language === 'bn'
              ? 'সাপ্লায়ার থেকে পণ্য ক্রয় চালান এন্ট্রি, অটোমেটিক স্টক বৃদ্ধি ও গড় ক্রয়মূল্য (Weighted Average Cost) ক্যালকুলেশন'
              : 'Purchase entries automatically increase stock, update weighted average cost & manage supplier accounts payable.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setActiveTab(activeTab === 'new_purchase' ? 'history' : 'new_purchase')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer ${
              activeTab === 'new_purchase'
                ? 'bg-stone-800 text-white'
                : 'bg-amber-700 hover:bg-amber-800 text-white'
            }`}
          >
            {activeTab === 'new_purchase' ? (
              <span>View Purchase History</span>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                <span>{language === 'bn' ? 'নতুন ক্রয় চালান এন্ট্রি' : 'New Purchase Entry'}</span>
              </>
            )}
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
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-xs">
          <div className="text-xs text-stone-500 font-bold uppercase">Total Purchases Billed</div>
          <div className="text-2xl font-bold font-serif text-stone-900 mt-1">
            {money(purchases.reduce((sum, p) => sum + (Number(p.grandTotal) || 0), 0))}
          </div>
          <div className="text-[11px] text-stone-400">{purchases.length} total purchase invoices</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-xs">
          <div className="text-xs text-stone-500 font-bold uppercase">Total Paid to Suppliers</div>
          <div className="text-2xl font-bold font-serif text-emerald-800 mt-1">
            {money(purchases.reduce((sum, p) => sum + (Number(p.paidAmount) || 0), 0))}
          </div>
          <div className="text-[11px] text-emerald-600 font-semibold">Immediate cash & account payments</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-xs">
          <div className="text-xs text-stone-500 font-bold uppercase">Total Due from Purchases</div>
          <div className="text-2xl font-bold font-serif text-rose-700 mt-1">
            {money(purchases.reduce((sum, p) => sum + (Number(p.dueAmount) || 0), 0))}
          </div>
          <div className="text-[11px] text-rose-600 font-semibold">Unsettled purchase dues</div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* VIEW 1: NEW PURCHASE INVOICE FORM */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'new_purchase' && (
        <form onSubmit={handleSubmitPurchase} className="bg-white p-6 rounded-3xl border border-stone-200 shadow-xs space-y-6 text-xs">
          <div className="border-b border-stone-200 pb-3 flex justify-between items-center">
            <div>
              <h3 className="font-serif text-lg font-bold text-stone-900">
                {language === 'bn' ? 'নতুন ক্রয় চালান প্রস্তুত করুন' : 'Create New Purchase Invoice'}
              </h3>
              <p className="text-stone-500 text-[11px]">
                Enter invoice items. Saving will automatically update product inventory and recalculate weighted average costs.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab('history')}
              className="text-stone-400 hover:text-stone-700 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Supplier & Date selection */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block font-bold text-stone-700 mb-1">
                {language === 'bn' ? 'সাপ্লায়ার নির্বাচন করুন *' : 'Select Supplier *'}
              </label>
              <select
                required
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                className="w-full p-3 rounded-xl border border-stone-300 font-bold bg-white outline-none focus:border-amber-600"
              >
                <option value="">-- Choose Supplier --</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.companyName ? `(${s.companyName})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-bold text-stone-700 mb-1">
                {language === 'bn' ? 'চালানের তারিখ *' : 'Purchase Date *'}
              </label>
              <input
                type="date"
                required
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
                className="w-full p-3 rounded-xl border border-stone-300 outline-none focus:border-amber-600"
              />
            </div>
          </div>

          {/* Line Item Entry Box */}
          <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200 space-y-3">
            <span className="font-bold text-stone-800 uppercase tracking-wider text-[11px] block">
              Add Products to Invoice
            </span>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="md:col-span-2">
                <label className="block font-semibold text-stone-600 mb-1">Product</label>
                <select
                  value={selectedProductId}
                  onChange={(e) => {
                    const pid = e.target.value;
                    setSelectedProductId(pid);
                    const prod = products.find((p) => p.id === pid);
                    if (prod) {
                      setSelectedCost(Number(prod.purchasePrice ?? prod.price * 0.7));
                    }
                  }}
                  className="w-full p-2.5 rounded-xl border border-stone-300 bg-white font-medium"
                >
                  <option value="">-- Select Product --</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.titleEn || p.titleBn} (Stock: {Number(p.stockQuantity ?? p.stock ?? 0)})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-stone-600 mb-1">Quantity</label>
                <input
                  type="number"
                  min="1"
                  value={selectedQty}
                  onChange={(e) => setSelectedQty(Math.max(1, Number(e.target.value) || 1))}
                  className="w-full p-2.5 rounded-xl border border-stone-300 font-bold"
                />
              </div>

              <div>
                <label className="block font-semibold text-stone-600 mb-1">Unit Cost (৳)</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="0"
                    value={selectedCost}
                    onChange={(e) => setSelectedCost(Number(e.target.value) || 0)}
                    className="w-full p-2.5 rounded-xl border border-stone-300 font-bold"
                  />
                  <button
                    type="button"
                    onClick={handleAddItem}
                    className="px-3 py-2.5 rounded-xl bg-amber-700 hover:bg-amber-800 text-white font-bold shrink-0 cursor-pointer shadow-xs"
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Invoice Items Table */}
          <div className="border border-stone-200 rounded-2xl overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-stone-100 font-bold text-stone-700 uppercase text-[10px]">
                <tr>
                  <th className="py-2.5 px-3">Product Name</th>
                  <th className="py-2.5 px-3 font-mono">SKU</th>
                  <th className="py-2.5 px-3 text-center">Quantity</th>
                  <th className="py-2.5 px-3 text-right">Unit Cost</th>
                  <th className="py-2.5 px-3 text-right">Total Cost</th>
                  <th className="py-2.5 px-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 font-medium">
                {items.map((it, idx) => (
                  <tr key={idx} className="hover:bg-stone-50">
                    <td className="py-2.5 px-3 font-bold text-stone-900">{it.productName}</td>
                    <td className="py-2.5 px-3 font-mono text-stone-500">{it.sku || '-'}</td>
                    <td className="py-2.5 px-3 text-center font-bold text-stone-800">{it.quantity}</td>
                    <td className="py-2.5 px-3 text-right font-mono text-stone-700">{money(it.unitCost)}</td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-stone-900">{money(it.totalCost)}</td>
                    <td className="py-2.5 px-3 text-center">
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(idx)}
                        className="p-1 rounded hover:bg-rose-100 text-rose-600 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {!items.length && (
              <div className="p-6 text-center text-stone-400 text-xs">
                No items added yet. Use the product selector above to add products.
              </div>
            )}
          </div>

          {/* Totals & Payment Breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
            <div className="space-y-3">
              <div>
                <label className="block font-bold text-stone-700 mb-1">Notes / Terms</label>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Transport memo, invoice reference..."
                  className="w-full p-2.5 rounded-xl border border-stone-300 outline-none resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-stone-700 mb-1">Paid Amount (৳)</label>
                  <input
                    type="number"
                    min="0"
                    value={paidAmount}
                    onChange={(e) => setPaidAmount(Number(e.target.value) || 0)}
                    className="w-full p-2.5 rounded-xl border border-stone-300 font-bold"
                  />
                </div>

                <div>
                  <label className="block font-bold text-stone-700 mb-1">Payment Method</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as any)}
                    className="w-full p-2.5 rounded-xl border border-stone-300 bg-white font-medium"
                  >
                    <option value="CASH">CASH (Deducts Cash in Hand)</option>
                    <option value="BKASH">BKASH</option>
                    <option value="NAGAD">NAGAD</option>
                    <option value="ROCKET">ROCKET</option>
                    <option value="BANK">BANK Transfer</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-stone-50 border border-stone-200 space-y-2.5 text-xs">
              <div className="flex justify-between text-stone-600">
                <span>Subtotal Items:</span>
                <span className="font-mono font-bold">{money(subtotal)}</span>
              </div>

              <div className="flex justify-between items-center text-stone-600">
                <span>Transport / Courier Cost:</span>
                <input
                  type="number"
                  min="0"
                  value={transportCost}
                  onChange={(e) => setTransportCost(Number(e.target.value) || 0)}
                  className="w-24 p-1.5 rounded-lg border border-stone-300 text-right font-mono font-bold"
                />
              </div>

              <div className="flex justify-between items-center text-stone-600">
                <span>Discount Allowed:</span>
                <input
                  type="number"
                  min="0"
                  value={discount}
                  onChange={(e) => setDiscount(Number(e.target.value) || 0)}
                  className="w-24 p-1.5 rounded-lg border border-stone-300 text-right font-mono font-bold"
                />
              </div>

              <div className="border-t border-stone-300 pt-2 flex justify-between font-bold text-sm text-stone-900">
                <span>Grand Total:</span>
                <span className="font-mono">{money(grandTotal)}</span>
              </div>

              <div className="flex justify-between text-emerald-700 font-semibold">
                <span>Paid Now:</span>
                <span className="font-mono">{money(paidAmount)}</span>
              </div>

              <div className="flex justify-between text-rose-700 font-bold border-t border-stone-200 pt-1.5">
                <span>Remaining Due:</span>
                <span className="font-mono">{money(dueAmount)}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-stone-200">
            <button
              type="button"
              onClick={() => setActiveTab('history')}
              className="px-4 py-2.5 rounded-xl border border-stone-300 hover:bg-stone-50 text-stone-700 font-bold cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !items.length || !supplierId}
              className="px-6 py-2.5 rounded-xl bg-amber-700 hover:bg-amber-800 text-white font-bold disabled:opacity-50 cursor-pointer shadow-md"
            >
              {saving ? 'Saving...' : 'Save Purchase & Increase Stock'}
            </button>
          </div>
        </form>
      )}

      {/* ------------------------------------------------------------- */}
      {/* VIEW 2: PURCHASE HISTORY TABLE */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-stone-200">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search by Purchase ID or Supplier name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full text-xs pl-9 pr-3 py-2 rounded-xl border border-stone-200 focus:border-amber-600 outline-none"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleExportCSV}
                className="px-3 py-2 rounded-xl border border-stone-300 bg-white hover:bg-stone-50 text-stone-700 text-xs font-semibold flex items-center gap-1 shadow-2xs cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>CSV</span>
              </button>

              <button
                onClick={() => printSection('Purchase Invoices History', 'purchase-print-area')}
                className="px-3 py-2 rounded-xl border border-stone-300 bg-white hover:bg-stone-50 text-stone-700 text-xs font-semibold flex items-center gap-1 shadow-2xs cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print</span>
              </button>
            </div>
          </div>

          <div id="purchase-print-area" className="bg-white rounded-3xl border border-stone-200 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-stone-50 border-b border-stone-200 text-stone-600 font-bold uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Purchase ID</th>
                    <th className="py-3 px-3">Date</th>
                    <th className="py-3 px-3">Supplier Name</th>
                    <th className="py-3 px-3 text-center">Items</th>
                    <th className="py-3 px-3 text-right">Grand Total</th>
                    <th className="py-3 px-3 text-right">Paid</th>
                    <th className="py-3 px-3 text-right">Due Amount</th>
                    <th className="py-3 px-3 text-center">Method</th>
                    <th className="py-3 px-4 text-center">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {filteredPurchases.map((pu) => (
                    <tr key={pu.id} className="hover:bg-stone-50/70 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-stone-900 text-[11px]">
                        {pu.purchaseId || pu.id}
                      </td>
                      <td className="py-3 px-3 text-stone-500 whitespace-nowrap text-[11px]">
                        {pu.purchaseDate}
                      </td>
                      <td className="py-3 px-3 font-semibold text-stone-900">
                        {pu.supplierName}
                      </td>
                      <td className="py-3 px-3 text-center font-bold text-stone-800">
                        {(pu.items || []).length} items
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-sm text-stone-900">
                        {money(pu.grandTotal)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-semibold text-emerald-700">
                        {money(pu.paidAmount || 0)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-rose-700">
                        {money(pu.dueAmount || 0)}
                      </td>
                      <td className="py-3 px-3 text-center font-mono">
                        <span className="px-2 py-0.5 rounded bg-stone-100 text-[10px] font-bold">
                          {pu.paymentMethod || 'Cash'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => setViewingPurchase(pu)}
                          className="p-1.5 rounded-lg border border-stone-200 hover:bg-stone-100 text-stone-600 cursor-pointer shadow-2xs"
                          title="View Invoice Items"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {!filteredPurchases.length && (
                <div className="p-8 text-center text-stone-400 text-xs">
                  No purchase records found. Click "New Purchase Entry" to record inventory restock.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* VIEW PURCHASE DETAIL MODAL */}
      {/* ------------------------------------------------------------- */}
      {viewingPurchase && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl border border-stone-200 my-8">
            <div className="flex items-center justify-between border-b border-stone-200 pb-3">
              <div>
                <h3 className="font-serif text-lg font-bold text-stone-900">
                  Purchase Invoice: {viewingPurchase.purchaseId || viewingPurchase.id}
                </h3>
                <p className="text-stone-500 text-[11px]">
                  Supplier: {viewingPurchase.supplierName} • {viewingPurchase.purchaseDate}
                </p>
              </div>
              <button
                onClick={() => setViewingPurchase(null)}
                className="p-1.5 rounded-full hover:bg-stone-100 text-stone-500 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="border border-stone-200 rounded-2xl overflow-hidden text-xs">
              <table className="w-full text-left">
                <thead className="bg-stone-50 font-bold text-stone-600 text-[10px] uppercase">
                  <tr>
                    <th className="py-2 px-3">Item</th>
                    <th className="py-2 px-3 text-center">Qty</th>
                    <th className="py-2 px-3 text-right">Unit Cost</th>
                    <th className="py-2 px-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 font-medium">
                  {(viewingPurchase.items || []).map((it, idx) => (
                    <tr key={idx}>
                      <td className="py-2 px-3 font-semibold text-stone-900">{it.productName}</td>
                      <td className="py-2 px-3 text-center">{it.quantity}</td>
                      <td className="py-2 px-3 text-right font-mono">{money(it.unitCost)}</td>
                      <td className="py-2 px-3 text-right font-mono font-bold">{money(it.totalCost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="p-3 rounded-2xl bg-stone-50 text-xs space-y-1 font-medium">
              <div className="flex justify-between">
                <span>Subtotal:</span>
                <span className="font-mono">{money(viewingPurchase.subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span>Transport / Other:</span>
                <span className="font-mono">{money(viewingPurchase.transportCost || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span>Discount:</span>
                <span className="font-mono">-{money(viewingPurchase.discount || 0)}</span>
              </div>
              <div className="flex justify-between font-bold text-stone-900 border-t border-stone-200 pt-1">
                <span>Grand Total:</span>
                <span className="font-mono text-sm">{money(viewingPurchase.grandTotal)}</span>
              </div>
              <div className="flex justify-between text-emerald-700 font-semibold">
                <span>Paid Amount:</span>
                <span className="font-mono">{money(viewingPurchase.paidAmount || 0)}</span>
              </div>
              <div className="flex justify-between text-rose-700 font-bold">
                <span>Due Amount:</span>
                <span className="font-mono">{money(viewingPurchase.dueAmount || 0)}</span>
              </div>
            </div>

            {viewingPurchase.notes && (
              <p className="text-[11px] text-stone-500 italic">Notes: {viewingPurchase.notes}</p>
            )}

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setViewingPurchase(null)}
                className="px-4 py-2 rounded-xl bg-stone-900 text-white font-bold text-xs cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
