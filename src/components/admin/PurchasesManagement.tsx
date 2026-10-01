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
  Pencil,
  AlertTriangle,
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

  // Edit & Delete & Print States
  const [editingPurchase, setEditingPurchase] = useState<Purchase | null>(null);
  const [editSupplierId, setEditSupplierId] = useState('');
  const [editPurchaseDate, setEditPurchaseDate] = useState('');
  const [editItems, setEditItems] = useState<PurchaseItem[]>([]);
  const [editDiscount, setEditDiscount] = useState<number>(0);
  const [editTransportCost, setEditTransportCost] = useState<number>(0);
  const [editPaidAmount, setEditPaidAmount] = useState<number>(0);
  const [editPaymentMethod, setEditPaymentMethod] = useState<PaymentAccountMethod>('CASH');
  const [editNotes, setEditNotes] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  // Edit Line Item Entry
  const [editSelectedProductId, setEditSelectedProductId] = useState('');
  const [editSelectedQty, setEditSelectedQty] = useState<number>(1);
  const [editSelectedCost, setEditSelectedCost] = useState<number>(0);

  const [deletingPurchase, setDeletingPurchase] = useState<Purchase | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [printPurchase, setPrintPurchase] = useState<Purchase | null>(null);

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

  // Open Edit Modal
  const openEditModal = (p: Purchase) => {
    setEditingPurchase(p);
    setEditSupplierId(p.supplierId || '');
    setEditPurchaseDate(p.purchaseDate || new Date().toISOString().slice(0, 10));
    setEditItems(p.items ? JSON.parse(JSON.stringify(p.items)) : []);
    setEditDiscount(Number(p.discount) || 0);
    setEditTransportCost(Number(p.transportCost) || 0);
    setEditPaidAmount(Number(p.paidAmount) || 0);
    const m = (p.paymentMethod || 'CASH').toUpperCase();
    setEditPaymentMethod(['CASH', 'BKASH', 'NAGAD', 'ROCKET', 'BANK'].includes(m) ? (m as PaymentAccountMethod) : 'CASH');
    setEditNotes(p.notes || '');
  };

  // Add Item in Edit Modal
  const handleAddEditItem = () => {
    const prod = products.find((p) => p.id === editSelectedProductId);
    if (!prod) {
      onToast('Select a product to add', 'error');
      return;
    }
    if (editSelectedQty <= 0 || editSelectedCost <= 0) {
      onToast('Quantity and Unit Cost must be greater than zero', 'error');
      return;
    }
    const newItem: PurchaseItem = {
      productId: prod.id,
      productName: prod.titleEn || prod.titleBn,
      sku: prod.sku,
      quantity: Number(editSelectedQty),
      unitCost: Number(editSelectedCost),
      totalCost: Number(editSelectedQty) * Number(editSelectedCost),
    };
    setEditItems([...editItems, newItem]);
    setEditSelectedProductId('');
    setEditSelectedQty(1);
    setEditSelectedCost(0);
  };

  const handleRemoveEditItem = (index: number) => {
    setEditItems(editItems.filter((_, i) => i !== index));
  };

  // Edit Calculations
  const editSubtotal = editItems.reduce((sum, it) => sum + it.totalCost, 0);
  const editGrandTotal = Math.max(0, editSubtotal + Number(editTransportCost || 0) - Number(editDiscount || 0));
  const editDueAmount = Math.max(0, editGrandTotal - Number(editPaidAmount || 0));

  // Submit Update
  const handleUpdatePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPurchase) return;
    if (!editItems.length) {
      onToast('Invoice must contain at least one item', 'error');
      return;
    }
    const sup = suppliers.find((s) => s.id === editSupplierId);
    setEditSaving(true);
    try {
      const pId = editingPurchase.id || editingPurchase.purchaseId || '';
      await businessService.updatePurchase(pId, {
        supplierId: editSupplierId,
        supplierName: sup ? sup.name : editingPurchase.supplierName,
        purchaseDate: editPurchaseDate,
        items: editItems,
        subtotal: editSubtotal,
        discount: Number(editDiscount) || 0,
        transportCost: Number(editTransportCost) || 0,
        grandTotal: editGrandTotal,
        paidAmount: Number(editPaidAmount) || 0,
        dueAmount: editDueAmount,
        paymentMethod: editPaymentMethod,
        notes: editNotes.trim(),
      });
      onToast(language === 'bn' ? 'চালান সফলভাবে আপডেট করা হয়েছে!' : 'Purchase invoice updated successfully!', 'success');
      setEditingPurchase(null);
      await loadData();
      if (onRefreshProducts) onRefreshProducts();
    } catch (err: any) {
      console.error(err);
      onToast(err?.message || 'Failed to update purchase', 'error');
    } finally {
      setEditSaving(false);
    }
  };

  // Confirm Delete Purchase
  const handleDeletePurchase = async () => {
    if (!deletingPurchase) return;
    setDeleting(true);
    try {
      const pId = deletingPurchase.id || deletingPurchase.purchaseId || '';
      await businessService.deletePurchase(pId);
      onToast(
        language === 'bn'
          ? 'ক্রয় চালান মুছে ফেলা হয়েছে এবং স্টক রিস্টোর হয়েছে!'
          : 'Purchase record deleted and stock restored!',
        'success'
      );
      setDeletingPurchase(null);
      await loadData();
      if (onRefreshProducts) onRefreshProducts();
    } catch (err: any) {
      console.error(err);
      onToast(err?.message || 'Failed to delete purchase', 'error');
    } finally {
      setDeleting(false);
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
                    <th className="py-3 px-4 text-center">Actions</th>
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
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => setViewingPurchase(pu)}
                            className="p-1.5 rounded-lg border border-stone-200 hover:bg-stone-100 text-stone-600 cursor-pointer shadow-2xs"
                            title={language === 'bn' ? 'চালান বিস্তারিত দেখুন' : 'View Memo Details'}
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setPrintPurchase(pu)}
                            className="p-1.5 rounded-lg border border-amber-200 bg-amber-50/50 hover:bg-amber-100 text-amber-800 cursor-pointer shadow-2xs"
                            title={language === 'bn' ? 'চালান প্রিন্ট করুন' : 'Print Memo'}
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => openEditModal(pu)}
                            className="p-1.5 rounded-lg border border-blue-200 bg-blue-50/50 hover:bg-blue-100 text-blue-700 cursor-pointer shadow-2xs"
                            title={language === 'bn' ? 'চালান সম্পাদনা (Edit) করুন' : 'Edit Memo'}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setDeletingPurchase(pu)}
                            className="p-1.5 rounded-lg border border-rose-200 bg-rose-50/50 hover:bg-rose-100 text-rose-700 cursor-pointer shadow-2xs"
                            title={language === 'bn' ? 'চালান মুছে ফেলুন' : 'Delete Memo'}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
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

            <div className="flex justify-between items-center pt-2">
              <button
                onClick={() => {
                  setPrintPurchase(viewingPurchase);
                  setViewingPurchase(null);
                }}
                className="px-4 py-2 rounded-xl bg-amber-700 hover:bg-amber-800 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>{language === 'bn' ? 'প্রিন্ট মেমো' : 'Print Memo'}</span>
              </button>
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

      {/* ------------------------------------------------------------- */}
      {/* EDIT PURCHASE MODAL */}
      {/* ------------------------------------------------------------- */}
      {editingPurchase && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 space-y-4 shadow-2xl border border-stone-200 my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-stone-200 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-serif text-lg font-bold text-stone-900">
                    {language === 'bn' ? 'ক্রয় চালান সম্পাদনা (Edit Purchase Memo)' : 'Edit Purchase Memo'}
                  </h3>
                  <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-800">
                    {editingPurchase.purchaseId || editingPurchase.id}
                  </span>
                </div>
                <p className="text-stone-500 text-xs mt-0.5">
                  {language === 'bn'
                    ? 'পরিমাণ পরিবর্তন করলে স্বয়ংক্রিয়ভাবে স্টক এবং সাপ্লায়ার বকেয়া পুনরায় হিসাব হবে'
                    : 'Modifying quantities will automatically recalculate product stock and supplier due.'}
                </p>
              </div>
              <button
                onClick={() => setEditingPurchase(null)}
                className="p-1.5 rounded-full hover:bg-stone-100 text-stone-500 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdatePurchase} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-stone-700 mb-1">
                    {language === 'bn' ? 'সাপ্লায়ার *' : 'Supplier *'}
                  </label>
                  <select
                    value={editSupplierId}
                    onChange={(e) => setEditSupplierId(e.target.value)}
                    required
                    className="w-full p-2.5 rounded-xl border border-stone-300 font-semibold"
                  >
                    <option value="">-- Select Supplier --</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.companyName || s.phone})
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
                    value={editPurchaseDate}
                    onChange={(e) => setEditPurchaseDate(e.target.value)}
                    required
                    className="w-full p-2.5 rounded-xl border border-stone-300 font-semibold"
                  />
                </div>
              </div>

              {/* Items Table */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-stone-800 uppercase tracking-wider text-[11px]">
                    {language === 'bn' ? 'চালানের পোশাক আইটেম সমূহ' : 'Invoice Items'}
                  </span>
                  <span className="text-[11px] text-stone-500 font-medium">
                    {editItems.length} items
                  </span>
                </div>

                <div className="border border-stone-200 rounded-2xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-stone-100 font-bold text-stone-700 uppercase text-[10px]">
                      <tr>
                        <th className="py-2 px-3">Product</th>
                        <th className="py-2 px-2 text-center w-24">Qty</th>
                        <th className="py-2 px-2 text-right w-28">Unit Cost (৳)</th>
                        <th className="py-2 px-3 text-right">Total</th>
                        <th className="py-2 px-2 text-center w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {editItems.map((it, idx) => (
                        <tr key={idx} className="hover:bg-stone-50">
                          <td className="py-2 px-3 font-semibold text-stone-900">{it.productName}</td>
                          <td className="py-2 px-2 text-center">
                            <input
                              type="number"
                              min="1"
                              value={it.quantity}
                              onChange={(e) => {
                                const q = Math.max(1, Number(e.target.value) || 1);
                                const copy = [...editItems];
                                copy[idx] = {
                                  ...copy[idx],
                                  quantity: q,
                                  totalCost: q * copy[idx].unitCost,
                                };
                                setEditItems(copy);
                              }}
                              className="w-16 p-1 text-center font-bold border border-stone-300 rounded-lg"
                            />
                          </td>
                          <td className="py-2 px-2 text-right">
                            <input
                              type="number"
                              min="0"
                              value={it.unitCost}
                              onChange={(e) => {
                                const c = Math.max(0, Number(e.target.value) || 0);
                                const copy = [...editItems];
                                copy[idx] = {
                                  ...copy[idx],
                                  unitCost: c,
                                  totalCost: copy[idx].quantity * c,
                                };
                                setEditItems(copy);
                              }}
                              className="w-24 p-1 text-right font-bold border border-stone-300 rounded-lg"
                            />
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-stone-900">
                            {money(it.totalCost)}
                          </td>
                          <td className="py-2 px-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveEditItem(idx)}
                              className="p-1 rounded hover:bg-rose-100 text-rose-600 cursor-pointer"
                              title="Remove item"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Add new item to invoice */}
                <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 flex flex-wrap items-center gap-2">
                  <select
                    value={editSelectedProductId}
                    onChange={(e) => {
                      const pid = e.target.value;
                      setEditSelectedProductId(pid);
                      const prod = products.find((p) => p.id === pid);
                      if (prod) setEditSelectedCost(Number(prod.purchasePrice ?? prod.price * 0.7));
                    }}
                    className="flex-1 min-w-[180px] p-2 rounded-xl border border-stone-300 bg-white"
                  >
                    <option value="">-- Add another product --</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.titleEn || p.titleBn}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min="1"
                    placeholder="Qty"
                    value={editSelectedQty}
                    onChange={(e) => setEditSelectedQty(Math.max(1, Number(e.target.value) || 1))}
                    className="w-16 p-2 rounded-xl border border-stone-300 font-bold text-center"
                  />
                  <input
                    type="number"
                    min="0"
                    placeholder="Cost (৳)"
                    value={editSelectedCost}
                    onChange={(e) => setEditSelectedCost(Number(e.target.value) || 0)}
                    className="w-24 p-2 rounded-xl border border-stone-300 font-bold text-right"
                  />
                  <button
                    type="button"
                    onClick={handleAddEditItem}
                    className="px-3 py-2 rounded-xl bg-stone-800 hover:bg-stone-900 text-white font-bold cursor-pointer"
                  >
                    Add
                  </button>
                </div>
              </div>

              {/* Financial Calculation Fields */}
              <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200 grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-stone-600 mb-1">Subtotal</label>
                  <div className="p-2 rounded-xl bg-white border border-stone-200 font-mono font-bold">
                    {money(editSubtotal)}
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-stone-600 mb-1">Transport / Other (৳)</label>
                  <input
                    type="number"
                    min="0"
                    value={editTransportCost}
                    onChange={(e) => setEditTransportCost(Number(e.target.value) || 0)}
                    className="w-full p-2 rounded-xl border border-stone-300 bg-white font-bold font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-stone-600 mb-1">Discount (৳)</label>
                  <input
                    type="number"
                    min="0"
                    value={editDiscount}
                    onChange={(e) => setEditDiscount(Number(e.target.value) || 0)}
                    className="w-full p-2 rounded-xl border border-stone-300 bg-white font-bold font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-stone-900 mb-1">Grand Total</label>
                  <div className="p-2 rounded-xl bg-white border border-stone-300 font-mono font-bold text-amber-900">
                    {money(editGrandTotal)}
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-emerald-800 mb-1">Paid Amount (৳)</label>
                  <input
                    type="number"
                    min="0"
                    value={editPaidAmount}
                    onChange={(e) => setEditPaidAmount(Number(e.target.value) || 0)}
                    className="w-full p-2 rounded-xl border border-emerald-300 bg-white font-bold font-mono text-emerald-900"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-rose-800 mb-1">Due Amount</label>
                  <div className="p-2 rounded-xl bg-white border border-rose-300 font-mono font-bold text-rose-800">
                    {money(editDueAmount)}
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-semibold text-stone-600 mb-1">Payment Method</label>
                  <select
                    value={editPaymentMethod}
                    onChange={(e) => setEditPaymentMethod(e.target.value as PaymentAccountMethod)}
                    className="w-full p-2 rounded-xl border border-stone-300 bg-white font-bold"
                  >
                    <option value="CASH">Cash in Hand</option>
                    <option value="BKASH">bKash Send Money</option>
                    <option value="NAGAD">Nagad</option>
                    <option value="ROCKET">Rocket</option>
                    <option value="BANK">Bank Account</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-stone-600 font-semibold mb-1">Notes / Remarks</label>
                <input
                  type="text"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Invoice / shipment reference notes..."
                  className="w-full p-2.5 rounded-xl border border-stone-300"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-stone-200">
                <button
                  type="button"
                  onClick={() => setEditingPurchase(null)}
                  className="px-4 py-2 rounded-xl border border-stone-300 hover:bg-stone-100 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editSaving}
                  className="px-5 py-2 rounded-xl bg-amber-700 hover:bg-amber-800 text-white font-bold flex items-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer"
                >
                  {editSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  <span>{editSaving ? 'Updating...' : 'Save & Recalculate'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* DELETE CONFIRMATION MODAL */}
      {/* ------------------------------------------------------------- */}
      {deletingPurchase && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-stone-200">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-rose-100 text-rose-700 shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-serif text-lg font-bold text-stone-900">
                  {language === 'bn' ? 'রেকর্ড মুছে ফেলার নিশ্চিতকরণ' : 'Delete Purchase Memo'}
                </h3>
                <span className="font-mono text-xs font-bold text-rose-700">
                  {deletingPurchase.purchaseId || deletingPurchase.id}
                </span>
              </div>
            </div>

            <p className="text-xs text-stone-600 leading-relaxed">
              {language === 'bn'
                ? 'আপনি কি নিশ্চিতভাবে এই রেকর্ডটি মুছে ফেলতে চান? এটি মুছে ফেললে সংশ্লিষ্ট স্টক এবং সাপ্লায়ার বকেয়া স্বয়ংক্রিয়ভাবে পূর্বের অবস্থায় ফিরিয়ে নেওয়া হবে।'
                : 'Are you sure you want to delete this purchase memo? Stock increases and supplier due changes will be safely reversed.'}
            </p>

            <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-stone-500">Supplier:</span>
                <span className="font-semibold">{deletingPurchase.supplierName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">Total Invoice Amount:</span>
                <span className="font-mono font-bold text-stone-900">{money(deletingPurchase.grandTotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">Items:</span>
                <span>{(deletingPurchase.items || []).length} products</span>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setDeletingPurchase(null)}
                className="px-4 py-2 rounded-xl border border-stone-300 hover:bg-stone-100 font-bold text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={handleDeletePurchase}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer"
              >
                {deleting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                <span>{deleting ? 'Deleting...' : (language === 'bn' ? 'মুছে ফেলুন' : 'Delete')}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* PROFESSIONAL PRINT VOUCHER MODAL */}
      {/* ------------------------------------------------------------- */}
      {printPurchase && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 space-y-5 shadow-2xl border border-stone-200 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-stone-200 no-print">
              <span className="text-xs font-bold text-stone-500 uppercase tracking-wider">
                Voucher Print Preview
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => printSection(`Purchase_${printPurchase.purchaseId}`, 'purchase-voucher-print')}
                  className="px-4 py-1.5 rounded-xl bg-amber-700 hover:bg-amber-800 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Now</span>
                </button>
                <button
                  onClick={() => setPrintPurchase(null)}
                  className="p-1 rounded-full hover:bg-stone-100 text-stone-500 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Printable Area */}
            <div id="purchase-voucher-print" className="p-6 bg-white border border-stone-300 rounded-2xl space-y-5 text-stone-900 font-sans">
              <div className="text-center border-b-2 border-stone-900 pb-3">
                <h1 className="font-serif text-2xl font-black tracking-wide text-stone-950 uppercase">
                  MINARUL FASHION HOUSE
                </h1>
                <p className="text-[11px] text-stone-600 font-medium">
                  Premium Fashion & Quality Clothing • Chuadanga, Bangladesh
                </p>
                <div className="mt-2 inline-block px-3 py-1 rounded bg-stone-900 text-white text-[10px] font-bold uppercase tracking-widest">
                  PURCHASE MEMO / ইনভেন্টরি চালান
                </div>
              </div>

              <div className="grid grid-cols-2 text-xs gap-3">
                <div>
                  <span className="text-stone-500 block text-[10px] uppercase font-bold">Supplier Info:</span>
                  <div className="font-bold text-stone-900 text-sm">{printPurchase.supplierName}</div>
                  <div className="text-stone-600 text-[11px]">Supplier ID: {printPurchase.supplierId || '-'}</div>
                </div>
                <div className="text-right">
                  <div className="text-stone-500 text-[10px] uppercase font-bold">Memo Number:</div>
                  <div className="font-mono font-black text-sm text-stone-950">{printPurchase.purchaseId || printPurchase.id}</div>
                  <div className="text-stone-600 text-[11px]">Date: {printPurchase.purchaseDate}</div>
                </div>
              </div>

              <table className="w-full text-left text-xs border border-stone-300 border-collapse">
                <thead className="bg-stone-100 font-bold uppercase text-[10px] border-b border-stone-300">
                  <tr>
                    <th className="p-2 border-r border-stone-300">#</th>
                    <th className="p-2 border-r border-stone-300">Product Item</th>
                    <th className="p-2 border-r border-stone-300 text-center">Qty</th>
                    <th className="p-2 border-r border-stone-300 text-right">Unit Price</th>
                    <th className="p-2 text-right">Total (৳)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200">
                  {(printPurchase.items || []).map((it, idx) => (
                    <tr key={idx}>
                      <td className="p-2 border-r border-stone-300 text-center text-stone-500">{idx + 1}</td>
                      <td className="p-2 border-r border-stone-300 font-semibold">{it.productName}</td>
                      <td className="p-2 border-r border-stone-300 text-center font-bold">{it.quantity}</td>
                      <td className="p-2 border-r border-stone-300 text-right font-mono">{money(it.unitCost)}</td>
                      <td className="p-2 text-right font-mono font-bold">{money(it.totalCost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="flex justify-end text-xs">
                <div className="w-64 space-y-1">
                  <div className="flex justify-between py-0.5 border-b border-stone-100">
                    <span className="text-stone-600">Subtotal:</span>
                    <span className="font-mono font-semibold">{money(printPurchase.subtotal)}</span>
                  </div>
                  {Number(printPurchase.transportCost || 0) > 0 && (
                    <div className="flex justify-between py-0.5 border-b border-stone-100">
                      <span className="text-stone-600">Transport:</span>
                      <span className="font-mono font-semibold">+{money(printPurchase.transportCost || 0)}</span>
                    </div>
                  )}
                  {Number(printPurchase.discount || 0) > 0 && (
                    <div className="flex justify-between py-0.5 border-b border-stone-100">
                      <span className="text-stone-600">Discount:</span>
                      <span className="font-mono font-semibold">-{money(printPurchase.discount || 0)}</span>
                    </div>
                  )}
                  <div className="flex justify-between py-1 border-t-2 border-stone-900 font-black text-sm">
                    <span>Grand Total:</span>
                    <span className="font-mono">{money(printPurchase.grandTotal)}</span>
                  </div>
                  <div className="flex justify-between py-0.5 text-emerald-800 font-bold">
                    <span>Paid Amount:</span>
                    <span className="font-mono">{money(printPurchase.paidAmount || 0)}</span>
                  </div>
                  <div className="flex justify-between py-0.5 text-rose-800 font-black">
                    <span>Due Amount:</span>
                    <span className="font-mono">{money(printPurchase.dueAmount || 0)}</span>
                  </div>
                  <div className="flex justify-between py-0.5 text-stone-500 text-[10px]">
                    <span>Payment Method:</span>
                    <span className="font-bold uppercase">{printPurchase.paymentMethod || 'Cash'}</span>
                  </div>
                </div>
              </div>

              {printPurchase.notes && (
                <div className="text-[11px] text-stone-600 border-t border-stone-200 pt-2 italic">
                  Note: {printPurchase.notes}
                </div>
              )}

              <div className="pt-8 grid grid-cols-2 text-center text-xs text-stone-600">
                <div>
                  <div className="border-t border-stone-400 w-36 mx-auto pt-1">Prepared By</div>
                </div>
                <div>
                  <div className="border-t border-stone-400 w-36 mx-auto pt-1 font-bold">Authorized Signature</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
