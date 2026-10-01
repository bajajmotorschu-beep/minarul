import React, { useState, useMemo, useEffect } from 'react';
import {
  Truck,
  Plus,
  CircleDollarSign,
  FileText,
  Search,
  Download,
  Printer,
  RefreshCw,
  Phone,
  MapPin,
  Building,
  CheckCircle2,
  X,
  CreditCard,
  Calendar,
  Eye,
  Pencil,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import { Supplier, SupplierPayment, Purchase, PaymentAccountMethod } from '../../types';
import { businessService } from '../../services/businessService';
import { exportToCSV, printSection } from '../../utils/exportUtils';
import { useLanguage } from '../../context/LanguageContext';

interface SuppliersManagementProps {
  onToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

const money = (n: number) => `৳${Number(n || 0).toLocaleString('en-BD', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const SuppliersManagement: React.FC<SuppliersManagementProps> = ({ onToast }) => {
  const { language } = useLanguage();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [payments, setPayments] = useState<SupplierPayment[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(false);

  // Active view
  const [activeTab, setActiveTab] = useState<'list' | 'payments' | 'ledger'>('list');

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSupplierForLedger, setSelectedSupplierForLedger] = useState<Supplier | null>(null);

  // Add Supplier Modal
  const [showAddSupplierModal, setShowAddSupplierModal] = useState(false);
  const [newSupplier, setNewSupplier] = useState({
    name: '',
    companyName: '',
    phone: '',
    email: '',
    address: '',
    openingDue: 0,
    notes: '',
  });
  const [supplierSaving, setSupplierSaving] = useState(false);

  // Make Payment Modal
  const [showPayModal, setShowPayModal] = useState(false);
  const [paySupplierId, setPaySupplierId] = useState('');
  const [payAmount, setPayAmount] = useState<number>(0);
  const [payMethod, setPayMethod] = useState<PaymentAccountMethod>('CASH');
  const [payAccount, setPayAccount] = useState('');
  const [payTrxId, setPayTrxId] = useState('');
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [payNote, setPayNote] = useState('');
  const [paySaving, setPaySaving] = useState(false);

  // Edit & Delete Supplier States
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [editSupplierForm, setEditSupplierForm] = useState({
    name: '',
    companyName: '',
    phone: '',
    email: '',
    address: '',
    openingDue: 0,
    notes: '',
  });
  const [editSupplierSaving, setEditSupplierSaving] = useState(false);
  const [deletingSupplier, setDeletingSupplier] = useState<Supplier | null>(null);
  const [deletingSupLoading, setDeletingSupLoading] = useState(false);

  // Edit, Delete, View & Print Supplier Payment States
  const [editingPayment, setEditingPayment] = useState<SupplierPayment | null>(null);
  const [editPayAmount, setEditPayAmount] = useState<number>(0);
  const [editPayMethod, setEditPayMethod] = useState<PaymentAccountMethod>('CASH');
  const [editPayDate, setEditPayDate] = useState('');
  const [editPayNote, setEditPayNote] = useState('');
  const [editPaySaving, setEditPaySaving] = useState(false);

  const [deletingPayment, setDeletingPayment] = useState<SupplierPayment | null>(null);
  const [deletingPayLoading, setDeletingPayLoading] = useState(false);
  const [viewingPayment, setViewingPayment] = useState<SupplierPayment | null>(null);
  const [printPayment, setPrintPayment] = useState<SupplierPayment | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [sList, pList, puList] = await Promise.all([
        businessService.getSuppliers(),
        businessService.getSupplierPayments(),
        businessService.getPurchases(),
      ]);
      setSuppliers(sList);
      setPayments(pList);
      setPurchases(puList);

      if (!selectedSupplierForLedger && sList.length > 0) {
        setSelectedSupplierForLedger(sList[0]);
      } else if (selectedSupplierForLedger) {
        const updated = sList.find((s) => s.id === selectedSupplierForLedger.id);
        if (updated) setSelectedSupplierForLedger(updated);
      }
    } catch (e: any) {
      console.error(e);
      onToast(e?.message || 'Failed to load supplier records', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Compute live due for suppliers
  const supplierDueMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of suppliers) {
      // Opening Due + Purchases Due
      const sPurchases = purchases.filter((p) => p.supplierId === s.id);
      const totalPurchasesDue = sPurchases.reduce((sum, p) => sum + (Number(p.dueAmount) || 0), 0);
      const sPayments = payments.filter((p) => p.supplierId === s.id);
      const totalPayments = sPayments.reduce((sum, p) => sum + (Number(p.paymentAmount) || 0), 0);

      // Total due = Opening due + new purchases total - all payments made
      const calculatedDue = Math.max(
        0,
        (Number(s.openingDue) || 0) +
          sPurchases.reduce((sum, p) => sum + (Number(p.grandTotal) || 0), 0) -
          totalPayments
      );

      map[s.id] = (s as any).currentDue !== undefined ? Number((s as any).currentDue) : calculatedDue;
    }
    return map;
  }, [suppliers, purchases, payments]);

  const totalOutstandingDue = useMemo(() => {
    return Object.values(supplierDueMap).reduce((sum, due) => sum + due, 0);
  }, [supplierDueMap]);

  // Handle Save Supplier
  const handleSaveSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSupplier.name.trim() || !newSupplier.phone.trim()) {
      onToast('Supplier name and phone are required', 'error');
      return;
    }

    setSupplierSaving(true);
    try {
      await businessService.createSupplier({
        name: newSupplier.name.trim(),
        companyName: newSupplier.companyName.trim(),
        phone: newSupplier.phone.trim(),
        email: newSupplier.email.trim(),
        address: newSupplier.address.trim(),
        openingDue: Number(newSupplier.openingDue) || 0,
        notes: newSupplier.notes.trim(),
      });
      onToast('Supplier created successfully!', 'success');
      setShowAddSupplierModal(false);
      setNewSupplier({
        name: '',
        companyName: '',
        phone: '',
        email: '',
        address: '',
        openingDue: 0,
        notes: '',
      });
      await loadData();
    } catch (err: any) {
      console.error(err);
      onToast(err?.message || 'Failed to create supplier', 'error');
    } finally {
      setSupplierSaving(false);
    }
  };

  // Open Payment Modal
  const openPaymentModal = (suppId?: string) => {
    const sId = suppId || (suppliers[0]?.id ?? '');
    setPaySupplierId(sId);
    const due = supplierDueMap[sId] || 0;
    setPayAmount(due > 0 ? due : 0);
    setPayMethod('CASH');
    setPayAccount('Cash Register');
    setPayTrxId('');
    setPayDate(new Date().toISOString().slice(0, 10));
    setPayNote('');
    setShowPayModal(true);
  };

  // Handle Save Supplier Payment
  const handleSavePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const sup = suppliers.find((s) => s.id === paySupplierId);
    if (!sup) {
      onToast('Select a valid supplier', 'error');
      return;
    }
    if (payAmount <= 0) {
      onToast('Payment amount must be greater than zero', 'error');
      return;
    }

    setPaySaving(true);
    try {
      await businessService.createSupplierPayment({
        supplierId: sup.id,
        supplierName: sup.name,
        paymentAmount: payAmount,
        paymentMethod: payMethod,
        paymentAccount: payAccount || payMethod,
        transactionId: payTrxId.trim(),
        date: payDate,
        note: payNote.trim(),
      });

      onToast(language === 'bn' ? 'সাপ্লায়ার পেমেন্ট সফলভাবে সংরক্ষিত হয়েছে!' : 'Supplier payment recorded successfully!', 'success');
      setShowPayModal(false);
      await loadData();
    } catch (err: any) {
      console.error(err);
      onToast(err?.message || 'Payment failed', 'error');
    } finally {
      setPaySaving(false);
    }
  };

  // Open Edit Supplier Modal
  const openEditSupplierModal = (s: Supplier) => {
    setEditingSupplier(s);
    setEditSupplierForm({
      name: s.name || '',
      companyName: s.companyName || '',
      phone: s.phone || '',
      email: s.email || '',
      address: s.address || '',
      openingDue: Number(s.openingDue) || 0,
      notes: s.notes || '',
    });
  };

  // Handle Update Supplier
  const handleUpdateSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSupplier) return;
    if (!editSupplierForm.name.trim()) {
      onToast('Supplier name is required', 'error');
      return;
    }
    setEditSupplierSaving(true);
    try {
      await businessService.updateSupplier(editingSupplier.id, {
        name: editSupplierForm.name.trim(),
        companyName: editSupplierForm.companyName.trim(),
        phone: editSupplierForm.phone.trim(),
        email: editSupplierForm.email.trim(),
        address: editSupplierForm.address.trim(),
        notes: editSupplierForm.notes.trim(),
      });
      onToast(language === 'bn' ? 'সাপ্লায়ার প্রোফাইল সফলভাবে আপডেট হয়েছে!' : 'Supplier profile updated successfully!', 'success');
      setEditingSupplier(null);
      await loadData();
    } catch (err: any) {
      console.error(err);
      onToast(err?.message || 'Failed to update supplier', 'error');
    } finally {
      setEditSupplierSaving(false);
    }
  };

  // Handle Delete Supplier
  const handleDeleteSupplier = async () => {
    if (!deletingSupplier) return;
    setDeletingSupLoading(true);
    try {
      await businessService.deleteSupplier(deletingSupplier.id);
      onToast(language === 'bn' ? 'সাপ্লায়ার রেকর্ড সফলভাবে মুছে ফেলা হয়েছে!' : 'Supplier record deleted successfully!', 'success');
      setDeletingSupplier(null);
      await loadData();
    } catch (err: any) {
      console.error(err);
      onToast(err?.message || 'Failed to delete supplier', 'error');
    } finally {
      setDeletingSupLoading(false);
    }
  };

  // Open Edit Payment Modal
  const openEditPaymentModal = (pay: SupplierPayment) => {
    setEditingPayment(pay);
    setEditPayAmount(Number(pay.paymentAmount) || 0);
    const m = (pay.paymentMethod || 'CASH').toUpperCase();
    setEditPayMethod(['CASH', 'BKASH', 'NAGAD', 'ROCKET', 'BANK'].includes(m) ? (m as PaymentAccountMethod) : 'CASH');
    setEditPayDate(pay.date || new Date().toISOString().slice(0, 10));
    setEditPayNote(pay.note || '');
  };

  // Handle Update Supplier Payment
  const handleUpdatePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPayment) return;
    if (editPayAmount <= 0) {
      onToast('Payment amount must be greater than zero', 'error');
      return;
    }
    setEditPaySaving(true);
    try {
      const pId = editingPayment.paymentId || editingPayment.id || '';
      await businessService.updateSupplierPayment(pId, {
        paymentAmount: editPayAmount,
        paymentMethod: editPayMethod,
        date: editPayDate,
        note: editPayNote.trim(),
      });
      onToast(language === 'bn' ? 'পেমেন্ট ভাউচার সফলভাবে আপডেট হয়েছে!' : 'Payment voucher updated successfully!', 'success');
      setEditingPayment(null);
      await loadData();
    } catch (err: any) {
      console.error(err);
      onToast(err?.message || 'Failed to update payment', 'error');
    } finally {
      setEditPaySaving(false);
    }
  };

  // Handle Delete Supplier Payment
  const handleDeletePayment = async () => {
    if (!deletingPayment) return;
    setDeletingPayLoading(true);
    try {
      const pId = deletingPayment.paymentId || deletingPayment.id || '';
      await businessService.deleteSupplierPayment(pId);
      onToast(
        language === 'bn'
          ? 'পেমেন্ট ভাউচার মুছে ফেলা হয়েছে এবং বকেয়া পুনরায় হিসাব করা হয়েছে!'
          : 'Payment voucher deleted and due recalculated!',
        'success'
      );
      setDeletingPayment(null);
      await loadData();
    } catch (err: any) {
      console.error(err);
      onToast(err?.message || 'Failed to delete payment voucher', 'error');
    } finally {
      setDeletingPayLoading(false);
    }
  };

  // Ledger calculation for selected supplier
  const supplierLedgerEntries = useMemo(() => {
    if (!selectedSupplierForLedger) return [];
    const sId = selectedSupplierForLedger.id;

    const sPurchases = purchases.filter((p) => p.supplierId === sId);
    const sPayments = payments.filter((p) => p.supplierId === sId);

    type LedgerRow = {
      date: string;
      type: 'OPENING' | 'PURCHASE' | 'PAYMENT';
      ref: string;
      description: string;
      debit: number; // payment reduces due
      credit: number; // purchase increases due
      balance: number;
    };

    const rows: LedgerRow[] = [];
    let runningBalance = Number(selectedSupplierForLedger.openingDue) || 0;

    // Opening entry
    rows.push({
      date: '-',
      type: 'OPENING',
      ref: 'OPENING-BALANCE',
      description: 'Opening due balance',
      debit: 0,
      credit: runningBalance,
      balance: runningBalance,
    });

    // Combine purchases and payments and sort by date
    const combined: Array<{ date: string; kind: 'PURCHASE' | 'PAYMENT'; data: any }> = [];
    for (const p of sPurchases) {
      combined.push({ date: p.purchaseDate || p.createdAt || '', kind: 'PURCHASE', data: p });
    }
    for (const pay of sPayments) {
      combined.push({ date: pay.date || pay.createdAt || '', kind: 'PAYMENT', data: pay });
    }

    combined.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    for (const item of combined) {
      if (item.kind === 'PURCHASE') {
        const grandTotal = Number(item.data.grandTotal) || 0;
        runningBalance += grandTotal;
        rows.push({
          date: item.date,
          type: 'PURCHASE',
          ref: item.data.purchaseId || item.data.id,
          description: `Purchase items (${(item.data.items || []).length} items)`,
          debit: 0,
          credit: grandTotal,
          balance: runningBalance,
        });
      } else {
        const amt = Number(item.data.paymentAmount) || 0;
        runningBalance -= amt;
        rows.push({
          date: item.date,
          type: 'PAYMENT',
          ref: item.data.paymentId || item.data.id,
          description: `Payment via ${item.data.paymentMethod}${item.data.transactionId ? ` (${item.data.transactionId})` : ''}`,
          debit: amt,
          credit: 0,
          balance: runningBalance,
        });
      }
    }

    return rows;
  }, [selectedSupplierForLedger, purchases, payments]);

  // Export CSV
  const handleExportSuppliersCSV = () => {
    const headers = ['Supplier ID', 'Name', 'Company', 'Phone', 'Address', 'Opening Due', 'Current Due'];
    const rows = suppliers.map((s) => [
      s.id,
      s.name,
      s.companyName || '-',
      s.phone,
      s.address || '-',
      s.openingDue || 0,
      supplierDueMap[s.id] || 0,
    ]);
    exportToCSV('minarul_suppliers', rows, headers);
  };

  const handleExportLedgerCSV = () => {
    if (!selectedSupplierForLedger) return;
    const headers = ['Date', 'Type', 'Reference', 'Description', 'Paid (Debit)', 'Billed (Credit)', 'Balance Due'];
    const rows = supplierLedgerEntries.map((r) => [
      r.date,
      r.type,
      r.ref,
      r.description,
      r.debit,
      r.credit,
      r.balance,
    ]);
    exportToCSV(`supplier_ledger_${selectedSupplierForLedger.name}`, rows, headers);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-stone-200">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-serif text-2xl font-bold text-stone-900">
              {language === 'bn' ? 'সাপ্লায়ার ও মহাজন দেনা ব্যবস্থাপনা' : 'Suppliers & Accounts Payable'}
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-stone-900 text-amber-300">
              ERP SUPPLIERS
            </span>
          </div>
          <p className="text-xs text-stone-500 mt-1">
            {language === 'bn'
              ? 'সাপ্লায়ার তালিকা, মহাজন দেনা (Due), পরিশোধ (Payments) এবং খতিয়ান লেজার'
              : 'Supplier accounts, outstanding due tracking, payments and automated date-wise ledger statements.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowAddSupplierModal(true)}
            className="px-4 py-2.5 rounded-xl bg-amber-700 hover:bg-amber-800 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>{language === 'bn' ? 'নতুন সাপ্লায়ার' : 'Add Supplier'}</span>
          </button>

          <button
            onClick={() => openPaymentModal()}
            className="px-4 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
          >
            <CircleDollarSign className="w-4 h-4" />
            <span>{language === 'bn' ? 'পেমেন্ট করুন (Pay Due)' : 'Pay Supplier'}</span>
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
          <div className="text-xs text-stone-500 font-bold uppercase">Total Registered Suppliers</div>
          <div className="text-2xl font-bold font-serif text-stone-900 mt-1">{suppliers.length}</div>
          <div className="text-[11px] text-stone-400">Fabric & garments manufacturers</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-rose-200 shadow-xs bg-rose-50/20">
          <div className="text-xs text-rose-800 font-bold uppercase">Total Outstanding Supplier Due</div>
          <div className="text-2xl font-bold font-serif text-rose-700 mt-1">{money(totalOutstandingDue)}</div>
          <div className="text-[11px] text-rose-600 font-semibold">Payable liabilities</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-xs">
          <div className="text-xs text-stone-500 font-bold uppercase">Total Payments Completed</div>
          <div className="text-2xl font-bold font-serif text-emerald-800 mt-1">
            {money(payments.reduce((s, p) => s + (Number(p.paymentAmount) || 0), 0))}
          </div>
          <div className="text-[11px] text-stone-400">{payments.length} total payment receipts</div>
        </div>
      </div>

      {/* View Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 pb-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('list')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'list'
                ? 'bg-amber-700 text-white shadow-xs'
                : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-50'
            }`}
          >
            <Truck className="inline w-3.5 h-3.5 mr-1" />
            Supplier Directory & Due ({suppliers.length})
          </button>

          <button
            onClick={() => setActiveTab('payments')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'payments'
                ? 'bg-amber-700 text-white shadow-xs'
                : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-50'
            }`}
          >
            <CircleDollarSign className="inline w-3.5 h-3.5 mr-1" />
            Payment Receipts ({payments.length})
          </button>

          <button
            onClick={() => setActiveTab('ledger')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'ledger'
                ? 'bg-amber-700 text-white shadow-xs'
                : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-50'
            }`}
          >
            <FileText className="inline w-3.5 h-3.5 mr-1" />
            Supplier Statement / Ledger
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={activeTab === 'ledger' ? handleExportLedgerCSV : handleExportSuppliersCSV}
            className="px-3 py-1.5 rounded-lg border border-stone-300 bg-white hover:bg-stone-50 text-stone-700 text-xs font-semibold flex items-center gap-1 shadow-2xs cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>CSV</span>
          </button>

          <button
            onClick={() => printSection('Supplier Report', 'supplier-print-area')}
            className="px-3 py-1.5 rounded-lg border border-stone-300 bg-white hover:bg-stone-50 text-stone-700 text-xs font-semibold flex items-center gap-1 shadow-2xs cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print</span>
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* TAB 1: SUPPLIERS DIRECTORY */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'list' && (
        <div id="supplier-print-area" className="bg-white rounded-3xl border border-stone-200 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-stone-50 border-b border-stone-200 text-stone-600 font-bold uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="py-3 px-4">Supplier / Factory</th>
                  <th className="py-3 px-3">Contact Information</th>
                  <th className="py-3 px-3">Address</th>
                  <th className="py-3 px-3 text-right">Opening Due</th>
                  <th className="py-3 px-3 text-right">Current Outstanding Due</th>
                  <th className="py-3 px-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {suppliers.map((s) => {
                  const due = supplierDueMap[s.id] || 0;
                  return (
                    <tr key={s.id} className="hover:bg-stone-50/70 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-bold text-stone-900 text-sm">{s.name}</div>
                        {s.companyName && (
                          <div className="text-stone-500 font-medium flex items-center gap-1 text-[11px]">
                            <Building className="w-3 h-3 text-stone-400" />
                            {s.companyName}
                          </div>
                        )}
                        <div className="font-mono text-[10px] text-stone-400">ID: {s.id}</div>
                      </td>

                      <td className="py-3 px-3 text-stone-700">
                        <div className="flex items-center gap-1 font-mono font-medium">
                          <Phone className="w-3 h-3 text-stone-400" /> {s.phone}
                        </div>
                        {s.email && <div className="text-stone-400 text-[11px]">{s.email}</div>}
                      </td>

                      <td className="py-3 px-3 text-stone-600">
                        {s.address ? (
                          <div className="flex items-center gap-1 text-[11px]">
                            <MapPin className="w-3 h-3 text-stone-400 shrink-0" />
                            {s.address}
                          </div>
                        ) : (
                          '-'
                        )}
                      </td>

                      <td className="py-3 px-3 text-right font-mono text-stone-500">
                        {money(s.openingDue || 0)}
                      </td>

                      <td className="py-3 px-3 text-right font-mono font-bold text-sm">
                        <span className={due > 0 ? 'text-rose-700' : 'text-emerald-700'}>
                          {money(due)}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5 flex-wrap">
                          <button
                            onClick={() => openPaymentModal(s.id)}
                            className="px-2.5 py-1.5 rounded-lg bg-emerald-100 hover:bg-emerald-700 hover:text-white text-emerald-800 text-[11px] font-bold transition-all cursor-pointer shadow-2xs"
                          >
                            Pay Due
                          </button>

                          <button
                            onClick={() => {
                              setSelectedSupplierForLedger(s);
                              setActiveTab('ledger');
                            }}
                            className="px-2.5 py-1.5 rounded-lg border border-stone-200 bg-white hover:bg-stone-100 text-stone-700 text-[11px] font-bold transition-all cursor-pointer shadow-2xs"
                          >
                            Ledger
                          </button>

                          <button
                            onClick={() => openEditSupplierModal(s)}
                            className="p-1.5 rounded-lg border border-blue-200 bg-blue-50/50 hover:bg-blue-100 text-blue-700 cursor-pointer shadow-2xs"
                            title={language === 'bn' ? 'সাপ্লায়ার সম্পাদনা করুন' : 'Edit Supplier'}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => setDeletingSupplier(s)}
                            className="p-1.5 rounded-lg border border-rose-200 bg-rose-50/50 hover:bg-rose-100 text-rose-700 cursor-pointer shadow-2xs"
                            title={language === 'bn' ? 'সাপ্লায়ার মুছে ফেলুন' : 'Delete Supplier'}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {!suppliers.length && (
              <div className="p-8 text-center text-stone-400 text-xs">
                No suppliers registered yet. Click "Add Supplier" to create your first vendor profile.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TAB 2: PAYMENTS HISTORY */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'payments' && (
        <div id="supplier-print-area" className="bg-white rounded-3xl border border-stone-200 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-stone-50 border-b border-stone-200 text-stone-600 font-bold uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="py-3 px-4">Receipt ID</th>
                  <th className="py-3 px-3">Date</th>
                  <th className="py-3 px-3">Supplier Name</th>
                  <th className="py-3 px-3 text-right">Payment Amount</th>
                  <th className="py-3 px-3">Method & Account</th>
                  <th className="py-3 px-3 text-right">Remaining Due</th>
                  <th className="py-3 px-3">Notes & TrxID</th>
                  <th className="py-3 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {payments.map((pay) => (
                  <tr key={pay.paymentId || pay.id} className="hover:bg-stone-50/70 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-stone-900 text-[11px]">
                      {pay.paymentId}
                    </td>
                    <td className="py-3 px-3 text-stone-500 whitespace-nowrap text-[11px]">
                      {pay.date || '-'}
                    </td>
                    <td className="py-3 px-3 font-semibold text-stone-900">
                      {pay.supplierName}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-sm text-emerald-800">
                      {money(pay.paymentAmount)}
                    </td>
                    <td className="py-3 px-3 font-mono text-stone-700">
                      <span className="px-2 py-0.5 rounded bg-stone-100 font-semibold text-[11px]">
                        {pay.paymentMethod}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-stone-600 font-semibold">
                      {money(pay.remainingDue)}
                    </td>
                    <td className="py-3 px-3 text-stone-500 text-[11px]">
                      <div>{pay.note || '-'}</div>
                      {pay.transactionId && (
                        <div className="font-mono text-[10px] text-stone-400">TrxID: {pay.transactionId}</div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => setViewingPayment(pay)}
                          className="p-1.5 rounded-lg border border-stone-200 hover:bg-stone-100 text-stone-600 cursor-pointer shadow-2xs"
                          title={language === 'bn' ? 'ভাউচার দেখুন' : 'View Voucher'}
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setPrintPayment(pay)}
                          className="p-1.5 rounded-lg border border-amber-200 bg-amber-50/50 hover:bg-amber-100 text-amber-800 cursor-pointer shadow-2xs"
                          title={language === 'bn' ? 'ভাউচার প্রিন্ট করুন' : 'Print Voucher'}
                        >
                          <Printer className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => openEditPaymentModal(pay)}
                          className="p-1.5 rounded-lg border border-blue-200 bg-blue-50/50 hover:bg-blue-100 text-blue-700 cursor-pointer shadow-2xs"
                          title={language === 'bn' ? 'ভাউচার সম্পাদনা (Edit) করুন' : 'Edit Voucher'}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setDeletingPayment(pay)}
                          className="p-1.5 rounded-lg border border-rose-200 bg-rose-50/50 hover:bg-rose-100 text-rose-700 cursor-pointer shadow-2xs"
                          title={language === 'bn' ? 'ভাউচার মুছে ফেলুন' : 'Delete Voucher'}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {!payments.length && (
              <div className="p-8 text-center text-stone-400 text-xs">
                No supplier payments recorded yet. Click "Pay Supplier" to record a payment.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TAB 3: SUPPLIER STATEMENT / LEDGER */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'ledger' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-stone-200">
            <div className="flex items-center gap-3">
              <label className="text-xs font-bold text-stone-700">Select Supplier:</label>
              <select
                value={selectedSupplierForLedger?.id || ''}
                onChange={(e) => {
                  const s = suppliers.find((x) => x.id === e.target.value);
                  if (s) setSelectedSupplierForLedger(s);
                }}
                className="text-xs p-2.5 rounded-xl border border-stone-300 bg-white font-bold outline-none cursor-pointer"
              >
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} (Current Due: {money(supplierDueMap[s.id] || 0)})
                  </option>
                ))}
              </select>
            </div>

            {selectedSupplierForLedger && (
              <div className="text-xs">
                <span className="text-stone-500">Current Outstanding Balance: </span>
                <span className="font-mono font-bold text-base text-rose-700">
                  {money(supplierDueMap[selectedSupplierForLedger.id] || 0)}
                </span>
              </div>
            )}
          </div>

          <div id="supplier-print-area" className="bg-white rounded-3xl border border-stone-200 overflow-hidden shadow-xs">
            <div className="p-4 bg-stone-50 border-b border-stone-200 flex justify-between items-center">
              <div>
                <h4 className="font-bold text-sm text-stone-900">
                  Ledger Statement: {selectedSupplierForLedger?.name}
                </h4>
                <p className="text-[11px] text-stone-500">
                  {selectedSupplierForLedger?.companyName} • {selectedSupplierForLedger?.phone}
                </p>
              </div>
              <button
                onClick={() => printSection(`Supplier Ledger - ${selectedSupplierForLedger?.name}`, 'supplier-print-area')}
                className="px-3 py-1.5 rounded-lg border border-stone-300 bg-white hover:bg-stone-50 text-xs font-semibold flex items-center gap-1 cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" /> Print Statement
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-stone-100 text-stone-700 font-bold uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="py-2.5 px-4">Date</th>
                    <th className="py-2.5 px-3">Type</th>
                    <th className="py-2.5 px-3">Reference</th>
                    <th className="py-2.5 px-4">Description</th>
                    <th className="py-2.5 px-3 text-right">Debit (Payment -)</th>
                    <th className="py-2.5 px-3 text-right">Credit (Purchase +)</th>
                    <th className="py-2.5 px-4 text-right">Balance Due</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 font-mono text-[11px]">
                  {supplierLedgerEntries.map((row, idx) => (
                    <tr key={idx} className="hover:bg-stone-50/60 transition-colors">
                      <td className="py-2.5 px-4 text-stone-600 font-sans">{row.date}</td>
                      <td className="py-2.5 px-3 font-sans">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            row.type === 'PURCHASE'
                              ? 'bg-amber-100 text-amber-900'
                              : row.type === 'PAYMENT'
                              ? 'bg-emerald-100 text-emerald-900'
                              : 'bg-stone-200 text-stone-800'
                          }`}
                        >
                          {row.type}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-stone-800 font-bold">{row.ref}</td>
                      <td className="py-2.5 px-4 text-stone-600 font-sans">{row.description}</td>
                      <td className="py-2.5 px-3 text-right text-emerald-700 font-bold">
                        {row.debit > 0 ? money(row.debit) : '-'}
                      </td>
                      <td className="py-2.5 px-3 text-right text-rose-700 font-bold">
                        {row.credit > 0 ? money(row.credit) : '-'}
                      </td>
                      <td className="py-2.5 px-4 text-right font-bold text-stone-900 text-xs">
                        {money(row.balance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* ADD SUPPLIER MODAL */}
      {/* ------------------------------------------------------------- */}
      {showAddSupplierModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-stone-200 my-8">
            <div className="flex items-center justify-between border-b border-stone-200 pb-3">
              <div className="flex items-center gap-2">
                <Truck className="w-5 h-5 text-amber-700" />
                <h3 className="font-serif text-lg font-bold text-stone-900">
                  {language === 'bn' ? 'নতুন সাপ্লায়ার যোগ করুন' : 'Add New Supplier'}
                </h3>
              </div>
              <button
                onClick={() => setShowAddSupplierModal(false)}
                className="p-1.5 rounded-full hover:bg-stone-100 text-stone-500 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSupplier} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-stone-700 mb-1">
                  {language === 'bn' ? 'সাপ্লায়ারের নাম *' : 'Supplier Name *'}
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Al-Madina Weaving"
                  value={newSupplier.name}
                  onChange={(e) => setNewSupplier({ ...newSupplier, name: e.target.value })}
                  className="w-full p-3 rounded-xl border border-stone-300 focus:border-amber-600 outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-stone-700 mb-1">
                  {language === 'bn' ? 'কোম্পানি / মিলের নাম' : 'Company / Factory Name'}
                </label>
                <input
                  type="text"
                  placeholder="e.g. Baburhat Handloom Mills"
                  value={newSupplier.companyName}
                  onChange={(e) => setNewSupplier({ ...newSupplier, companyName: e.target.value })}
                  className="w-full p-3 rounded-xl border border-stone-300 focus:border-amber-600 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-stone-700 mb-1">
                    {language === 'bn' ? 'মোবাইল নম্বর *' : 'Phone Number *'}
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="017XXXXXXXX"
                    value={newSupplier.phone}
                    onChange={(e) => setNewSupplier({ ...newSupplier, phone: e.target.value })}
                    className="w-full p-3 rounded-xl border border-stone-300 focus:border-amber-600 outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="block font-bold text-stone-700 mb-1">
                    {language === 'bn' ? 'প্রারম্ভিক দেনা (Opening Due)' : 'Opening Due (৳)'}
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={newSupplier.openingDue}
                    onChange={(e) => setNewSupplier({ ...newSupplier, openingDue: Number(e.target.value) })}
                    className="w-full p-3 rounded-xl border border-stone-300 focus:border-amber-600 outline-none font-mono font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-stone-700 mb-1">
                  {language === 'bn' ? 'ঠিকানা (Address)' : 'Address'}
                </label>
                <input
                  type="text"
                  placeholder="e.g. Islampur, Dhaka"
                  value={newSupplier.address}
                  onChange={(e) => setNewSupplier({ ...newSupplier, address: e.target.value })}
                  className="w-full p-3 rounded-xl border border-stone-300 focus:border-amber-600 outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-stone-700 mb-1">
                  {language === 'bn' ? 'নোট' : 'Notes'}
                </label>
                <textarea
                  rows={2}
                  placeholder="Notes about supplier terms..."
                  value={newSupplier.notes}
                  onChange={(e) => setNewSupplier({ ...newSupplier, notes: e.target.value })}
                  className="w-full p-3 rounded-xl border border-stone-300 focus:border-amber-600 outline-none resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-stone-200">
                <button
                  type="button"
                  onClick={() => setShowAddSupplierModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-stone-300 hover:bg-stone-50 text-stone-700 font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={supplierSaving}
                  className="px-5 py-2.5 rounded-xl bg-amber-700 hover:bg-amber-800 text-white font-bold disabled:opacity-50 cursor-pointer shadow-md"
                >
                  {supplierSaving ? 'Saving...' : 'Save Supplier'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* PAY SUPPLIER MODAL */}
      {/* ------------------------------------------------------------- */}
      {showPayModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-stone-200 my-8">
            <div className="flex items-center justify-between border-b border-stone-200 pb-3">
              <div className="flex items-center gap-2">
                <CircleDollarSign className="w-5 h-5 text-emerald-700" />
                <h3 className="font-serif text-lg font-bold text-stone-900">
                  {language === 'bn' ? 'সাপ্লায়ারকে পেমেন্ট করুন' : 'Supplier Payment Entry'}
                </h3>
              </div>
              <button
                onClick={() => setShowPayModal(false)}
                className="p-1.5 rounded-full hover:bg-stone-100 text-stone-500 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePayment} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-stone-700 mb-1">
                  {language === 'bn' ? 'সাপ্লায়ার নির্বাচন *' : 'Select Supplier *'}
                </label>
                <select
                  required
                  value={paySupplierId}
                  onChange={(e) => {
                    const sid = e.target.value;
                    setPaySupplierId(sid);
                    const due = supplierDueMap[sid] || 0;
                    setPayAmount(due);
                  }}
                  className="w-full p-3 rounded-xl border border-stone-300 font-bold bg-white outline-none focus:border-emerald-600"
                >
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} (Due: {money(supplierDueMap[s.id] || 0)})
                    </option>
                  ))}
                </select>
              </div>

              {/* Due Preview */}
              <div className="p-3 rounded-2xl bg-stone-50 border border-stone-200 flex justify-between items-center text-xs">
                <span className="text-stone-500">Current Outstanding Due:</span>
                <span className="font-mono font-bold text-rose-700">
                  {money(supplierDueMap[paySupplierId] || 0)}
                </span>
              </div>

              <div>
                <label className="block font-bold text-stone-700 mb-1">
                  {language === 'bn' ? 'পরিশোধের পরিমাণ (Payment Amount in ৳) *' : 'Payment Amount in BDT (৳) *'}
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  value={payAmount || ''}
                  onChange={(e) => setPayAmount(Number(e.target.value))}
                  className="w-full p-3 rounded-xl border border-stone-300 focus:border-emerald-600 outline-none font-bold text-base"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-stone-700 mb-1">
                    {language === 'bn' ? 'পেমেন্ট মেথড *' : 'Payment Method *'}
                  </label>
                  <select
                    value={payMethod}
                    onChange={(e) => setPayMethod(e.target.value as any)}
                    className="w-full p-3 rounded-xl border border-stone-300 focus:border-emerald-600 outline-none bg-white font-medium"
                  >
                    <option value="CASH">CASH (Physical Cash)</option>
                    <option value="BKASH">BKASH</option>
                    <option value="NAGAD">NAGAD</option>
                    <option value="ROCKET">ROCKET</option>
                    <option value="BANK">BANK Transfer</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-stone-700 mb-1">
                    {language === 'bn' ? 'তারিখ (Date) *' : 'Date *'}
                  </label>
                  <input
                    type="date"
                    required
                    value={payDate}
                    onChange={(e) => setPayDate(e.target.value)}
                    className="w-full p-3 rounded-xl border border-stone-300 focus:border-emerald-600 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-stone-700 mb-1">
                  {language === 'bn' ? 'ট্রানজাকশন / চেক নম্বর' : 'Trx ID / Cheque No'}
                </label>
                <input
                  type="text"
                  placeholder="e.g. Bank slip #, bKash TrxID"
                  value={payTrxId}
                  onChange={(e) => setPayTrxId(e.target.value)}
                  className="w-full p-3 rounded-xl border border-stone-300 focus:border-emerald-600 outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-stone-700 mb-1">
                  {language === 'bn' ? 'নোট' : 'Notes'}
                </label>
                <textarea
                  rows={2}
                  placeholder="Payment remarks..."
                  value={payNote}
                  onChange={(e) => setPayNote(e.target.value)}
                  className="w-full p-3 rounded-xl border border-stone-300 focus:border-emerald-600 outline-none resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-stone-200">
                <button
                  type="button"
                  onClick={() => setShowPayModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-stone-300 hover:bg-stone-50 text-stone-700 font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={paySaving}
                  className="px-5 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold disabled:opacity-50 cursor-pointer shadow-md"
                >
                  {paySaving ? 'Saving...' : 'Confirm Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* EDIT SUPPLIER MODAL */}
      {/* ------------------------------------------------------------- */}
      {editingSupplier && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl border border-stone-200">
            <div className="flex items-center justify-between pb-3 border-b border-stone-200">
              <h3 className="font-serif text-lg font-bold text-stone-900">
                {language === 'bn' ? 'সাপ্লায়ার প্রোফাইল সম্পাদনা (Edit Supplier)' : 'Edit Supplier Profile'}
              </h3>
              <button
                onClick={() => setEditingSupplier(null)}
                className="p-1.5 rounded-full hover:bg-stone-100 text-stone-500 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateSupplier} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-stone-700 mb-1">
                    {language === 'bn' ? 'সাপ্লায়ারের নাম *' : 'Supplier Name *'}
                  </label>
                  <input
                    type="text"
                    required
                    value={editSupplierForm.name}
                    onChange={(e) => setEditSupplierForm({ ...editSupplierForm, name: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-stone-300 font-semibold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-stone-700 mb-1">
                    {language === 'bn' ? 'কোম্পানি / মিল' : 'Company / Factory'}
                  </label>
                  <input
                    type="text"
                    value={editSupplierForm.companyName}
                    onChange={(e) => setEditSupplierForm({ ...editSupplierForm, companyName: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-stone-300 font-semibold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-stone-700 mb-1">
                    {language === 'bn' ? 'মোবাইল নম্বর *' : 'Phone Number *'}
                  </label>
                  <input
                    type="text"
                    required
                    value={editSupplierForm.phone}
                    onChange={(e) => setEditSupplierForm({ ...editSupplierForm, phone: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-stone-300 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-stone-700 mb-1">
                    {language === 'bn' ? 'ইমেইল' : 'Email'}
                  </label>
                  <input
                    type="email"
                    value={editSupplierForm.email}
                    onChange={(e) => setEditSupplierForm({ ...editSupplierForm, email: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-stone-300"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-stone-700 mb-1">
                  {language === 'bn' ? 'ঠিকানা' : 'Address'}
                </label>
                <input
                  type="text"
                  value={editSupplierForm.address}
                  onChange={(e) => setEditSupplierForm({ ...editSupplierForm, address: e.target.value })}
                  className="w-full p-2.5 rounded-xl border border-stone-300"
                />
              </div>

              <div>
                <label className="block font-bold text-stone-700 mb-1">
                  {language === 'bn' ? 'নোট' : 'Notes'}
                </label>
                <input
                  type="text"
                  value={editSupplierForm.notes}
                  onChange={(e) => setEditSupplierForm({ ...editSupplierForm, notes: e.target.value })}
                  className="w-full p-2.5 rounded-xl border border-stone-300"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-stone-200">
                <button
                  type="button"
                  onClick={() => setEditingSupplier(null)}
                  className="px-4 py-2 rounded-xl border border-stone-300 hover:bg-stone-100 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editSupplierSaving}
                  className="px-5 py-2 rounded-xl bg-amber-700 hover:bg-amber-800 text-white font-bold flex items-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer"
                >
                  {editSupplierSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  <span>{editSupplierSaving ? 'Saving...' : 'Update Supplier'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* DELETE SUPPLIER CONFIRMATION */}
      {/* ------------------------------------------------------------- */}
      {deletingSupplier && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-stone-200">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-rose-100 text-rose-700 shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-serif text-lg font-bold text-stone-900">
                  {language === 'bn' ? 'রেকর্ড মুছে ফেলার নিশ্চিতকরণ' : 'Delete Supplier'}
                </h3>
                <span className="font-mono text-xs font-bold text-rose-700">
                  {deletingSupplier.name} ({deletingSupplier.id})
                </span>
              </div>
            </div>

            <p className="text-xs text-stone-600 leading-relaxed">
              {language === 'bn'
                ? 'আপনি কি নিশ্চিতভাবে এই রেকর্ডটি মুছে ফেলতে চান?'
                : 'Are you sure you want to delete this supplier profile?'}
            </p>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={deletingSupLoading}
                onClick={() => setDeletingSupplier(null)}
                className="px-4 py-2 rounded-xl border border-stone-300 hover:bg-stone-100 font-bold text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deletingSupLoading}
                onClick={handleDeleteSupplier}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer"
              >
                {deletingSupLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                <span>{deletingSupLoading ? 'Deleting...' : (language === 'bn' ? 'মুছে ফেলুন' : 'Delete')}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* EDIT PAYMENT VOUCHER MODAL */}
      {/* ------------------------------------------------------------- */}
      {editingPayment && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-stone-200">
            <div className="flex items-center justify-between pb-3 border-b border-stone-200">
              <div>
                <h3 className="font-serif text-lg font-bold text-stone-900">
                  {language === 'bn' ? 'পেমেন্ট ভাউচার সম্পাদনা (Edit Payment)' : 'Edit Payment Voucher'}
                </h3>
                <span className="font-mono text-xs font-bold text-blue-800">
                  {editingPayment.paymentId || editingPayment.id} • {editingPayment.supplierName}
                </span>
              </div>
              <button
                onClick={() => setEditingPayment(null)}
                className="p-1.5 rounded-full hover:bg-stone-100 text-stone-500 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdatePayment} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-stone-700 mb-1">
                  {language === 'bn' ? 'পরিশোধের পরিমাণ (৳) *' : 'Payment Amount (৳) *'}
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  value={editPayAmount}
                  onChange={(e) => setEditPayAmount(Number(e.target.value) || 0)}
                  className="w-full p-2.5 rounded-xl border border-stone-300 font-mono font-bold text-sm text-emerald-800"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-stone-700 mb-1">
                    {language === 'bn' ? 'পদ্ধতি' : 'Method'}
                  </label>
                  <select
                    value={editPayMethod}
                    onChange={(e) => setEditPayMethod(e.target.value as PaymentAccountMethod)}
                    className="w-full p-2.5 rounded-xl border border-stone-300 font-bold"
                  >
                    <option value="CASH">Cash in Hand</option>
                    <option value="BKASH">bKash Send Money</option>
                    <option value="NAGAD">Nagad</option>
                    <option value="ROCKET">Rocket</option>
                    <option value="BANK">Bank Account</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-stone-700 mb-1">
                    {language === 'bn' ? 'তারিখ *' : 'Date *'}
                  </label>
                  <input
                    type="date"
                    required
                    value={editPayDate}
                    onChange={(e) => setEditPayDate(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-stone-300 font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-stone-700 mb-1">
                  {language === 'bn' ? 'নোট' : 'Notes'}
                </label>
                <input
                  type="text"
                  value={editPayNote}
                  onChange={(e) => setEditPayNote(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-stone-300"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-stone-200">
                <button
                  type="button"
                  onClick={() => setEditingPayment(null)}
                  className="px-4 py-2 rounded-xl border border-stone-300 hover:bg-stone-100 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editPaySaving}
                  className="px-5 py-2 rounded-xl bg-amber-700 hover:bg-amber-800 text-white font-bold flex items-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer"
                >
                  {editPaySaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  <span>{editPaySaving ? 'Saving...' : 'Update Voucher'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* DELETE PAYMENT CONFIRMATION */}
      {/* ------------------------------------------------------------- */}
      {deletingPayment && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-stone-200">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-rose-100 text-rose-700 shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-serif text-lg font-bold text-stone-900">
                  {language === 'bn' ? 'রেকর্ড মুছে ফেলার নিশ্চিতকরণ' : 'Delete Payment Voucher'}
                </h3>
                <span className="font-mono text-xs font-bold text-rose-700">
                  {deletingPayment.paymentId || deletingPayment.id}
                </span>
              </div>
            </div>

            <p className="text-xs text-stone-600 leading-relaxed">
              {language === 'bn'
                ? 'আপনি কি নিশ্চিতভাবে এই রেকর্ডটি মুছে ফেলতে চান? এটি মুছে ফেললে সাপ্লায়ারের বকেয়া পুনরায় বৃদ্ধি পাবে।'
                : 'Are you sure you want to delete this payment voucher? The supplier outstanding due will be restored.'}
            </p>

            <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-stone-500">Supplier:</span>
                <span className="font-semibold">{deletingPayment.supplierName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">Payment Amount:</span>
                <span className="font-mono font-bold text-emerald-800">{money(deletingPayment.paymentAmount)}</span>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={deletingPayLoading}
                onClick={() => setDeletingPayment(null)}
                className="px-4 py-2 rounded-xl border border-stone-300 hover:bg-stone-100 font-bold text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deletingPayLoading}
                onClick={handleDeletePayment}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer"
              >
                {deletingPayLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                <span>{deletingPayLoading ? 'Deleting...' : (language === 'bn' ? 'মুছে ফেলুন' : 'Delete')}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* VIEW & PRINT PAYMENT VOUCHER */}
      {/* ------------------------------------------------------------- */}
      {(viewingPayment || printPayment) && (
        (() => {
          const voucher = viewingPayment || printPayment!;
          return (
            <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
              <div className="bg-white rounded-3xl max-w-lg w-full p-6 space-y-5 shadow-2xl border border-stone-200 my-8">
                <div className="flex items-center justify-between pb-3 border-b border-stone-200 no-print">
                  <span className="text-xs font-bold text-stone-500 uppercase tracking-wider">
                    Supplier Payment Voucher
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => printSection(`Voucher_${voucher.paymentId}`, 'supplier-voucher-print')}
                      className="px-4 py-1.5 rounded-xl bg-amber-700 hover:bg-amber-800 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Print Voucher</span>
                    </button>
                    <button
                      onClick={() => {
                        setViewingPayment(null);
                        setPrintPayment(null);
                      }}
                      className="p-1 rounded-full hover:bg-stone-100 text-stone-500 cursor-pointer"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* Printable Area */}
                <div id="supplier-voucher-print" className="p-6 bg-white border border-stone-300 rounded-2xl space-y-5 text-stone-900 font-sans">
                  <div className="text-center border-b-2 border-stone-900 pb-3">
                    <h1 className="font-serif text-2xl font-black tracking-wide text-stone-950 uppercase">
                      MINARUL FASHION HOUSE
                    </h1>
                    <p className="text-[11px] text-stone-600 font-medium">
                      Premium Fashion & Quality Clothing • Chuadanga, Bangladesh
                    </p>
                    <div className="mt-2 inline-block px-3 py-1 rounded bg-stone-900 text-white text-[10px] font-bold uppercase tracking-widest">
                      SUPPLIER PAYMENT VOUCHER / মহাজন পরিশোধ ভাউচার
                    </div>
                  </div>

                  <div className="grid grid-cols-2 text-xs gap-3">
                    <div>
                      <span className="text-stone-500 block text-[10px] uppercase font-bold">Paid To (Supplier):</span>
                      <div className="font-bold text-stone-900 text-sm">{voucher.supplierName}</div>
                      <div className="text-stone-600 text-[11px]">Supplier ID: {voucher.supplierId}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-stone-500 text-[10px] uppercase font-bold">Voucher No:</div>
                      <div className="font-mono font-black text-sm text-stone-950">{voucher.paymentId}</div>
                      <div className="text-stone-600 text-[11px]">Date: {voucher.date}</div>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-stone-50 border border-stone-200 text-xs space-y-2">
                    <div className="flex justify-between">
                      <span className="text-stone-600">Previous Outstanding Due:</span>
                      <span className="font-mono font-bold">{money(voucher.currentDue || 0)}</span>
                    </div>
                    <div className="flex justify-between text-emerald-800 text-sm font-bold border-y border-stone-200 py-1.5">
                      <span>Amount Paid (পরিশোধ):</span>
                      <span className="font-mono text-base">{money(voucher.paymentAmount)}</span>
                    </div>
                    <div className="flex justify-between text-rose-800 font-bold">
                      <span>Remaining Balance Due:</span>
                      <span className="font-mono">{money(voucher.remainingDue || 0)}</span>
                    </div>
                    <div className="flex justify-between text-stone-500 text-[11px] pt-1">
                      <span>Payment Account & Method:</span>
                      <span className="font-bold uppercase">{voucher.paymentMethod} {voucher.paymentAccount ? `(${voucher.paymentAccount})` : ''}</span>
                    </div>
                    {voucher.transactionId && (
                      <div className="flex justify-between text-stone-500 text-[11px]">
                        <span>Transaction Reference / TrxID:</span>
                        <span className="font-mono font-bold">{voucher.transactionId}</span>
                      </div>
                    )}
                  </div>

                  {voucher.note && (
                    <div className="text-[11px] text-stone-600 italic">
                      Remarks: {voucher.note}
                    </div>
                  )}

                  <div className="pt-8 grid grid-cols-2 text-center text-xs text-stone-600">
                    <div>
                      <div className="border-t border-stone-400 w-36 mx-auto pt-1">Received By (Supplier)</div>
                    </div>
                    <div>
                      <div className="border-t border-stone-400 w-36 mx-auto pt-1 font-bold">Authorized Signatory</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })()
      )}
    </div>
  );
};
