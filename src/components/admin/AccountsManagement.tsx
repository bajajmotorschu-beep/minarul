import React, { useState, useMemo, useEffect } from 'react';
import {
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  TrendingUp,
  CircleDollarSign,
  Building,
  CreditCard,
  Plus,
  Minus,
  Search,
  Filter,
  Download,
  Printer,
  RefreshCw,
  Settings,
  CheckCircle2,
  X,
  Smartphone,
  Landmark,
  FileText,
} from 'lucide-react';
import { CashTransaction, OpeningBalances, PaymentAccountMethod, CashTransactionCategory } from '../../types';
import { businessService } from '../../services/businessService';
import { exportToCSV, printSection } from '../../utils/exportUtils';
import { useLanguage } from '../../context/LanguageContext';

interface AccountsManagementProps {
  onToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

const money = (n: number) => `৳${Number(n || 0).toLocaleString('en-BD', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const AccountsManagement: React.FC<AccountsManagementProps> = ({ onToast }) => {
  const { language } = useLanguage();
  const [transactions, setTransactions] = useState<CashTransaction[]>([]);
  const [opening, setOpening] = useState<OpeningBalances>({
    openingCash: 0,
    openingBkash: 0,
    openingNagad: 0,
    openingRocket: 0,
    openingBank: 0,
    openingSupplierDue: 0,
    openingStockValue: 0,
  });
  const [loading, setLoading] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'CASH_IN' | 'CASH_OUT'>('all');
  const [methodFilter, setMethodFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState('');

  // Modals
  const [showCashInModal, setShowCashInModal] = useState(false);
  const [showCashOutModal, setShowCashOutModal] = useState(false);
  const [showOpeningModal, setShowOpeningModal] = useState(false);

  // Cash In Form
  const [cashInAmount, setCashInAmount] = useState<number>(0);
  const [cashInSource, setCashInSource] = useState<CashTransactionCategory>('OTHER_INCOME');
  const [cashInMethod, setCashInMethod] = useState<PaymentAccountMethod>('CASH');
  const [cashInRef, setCashInRef] = useState('');
  const [cashInDesc, setCashInDesc] = useState('');
  const [cashInSaving, setCashInSaving] = useState(false);

  // Cash Out Form
  const [cashOutAmount, setCashOutAmount] = useState<number>(0);
  const [cashOutPurpose, setCashOutPurpose] = useState<CashTransactionCategory>('EXPENSE');
  const [cashOutMethod, setCashOutMethod] = useState<PaymentAccountMethod>('CASH');
  const [cashOutRef, setCashOutRef] = useState('');
  const [cashOutDesc, setCashOutDesc] = useState('');
  const [cashOutSaving, setCashOutSaving] = useState(false);

  // Opening Balance Form
  const [openingForm, setOpeningForm] = useState<OpeningBalances>({ ...opening });
  const [openingSaving, setOpeningSaving] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [txList, op] = await Promise.all([
        businessService.getCashTransactions(),
        businessService.getOpeningBalances(),
      ]);
      setTransactions(txList);
      setOpening(op);
      setOpeningForm(op);
    } catch (e: any) {
      console.error('Error loading financial accounts data:', e);
      onToast(e?.message || 'Failed to load financial records', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Compute Balances
  const balances = useMemo(() => {
    return businessService.calculateAccountBalances(transactions, opening);
  }, [transactions, opening]);

  // Filtered Transactions
  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !q ||
        t.transactionId.toLowerCase().includes(q) ||
        (t.description && t.description.toLowerCase().includes(q)) ||
        (t.referenceId && t.referenceId.toLowerCase().includes(q));

      const matchesType = typeFilter === 'all' || t.type === typeFilter;
      const matchesMethod = methodFilter === 'all' || t.paymentMethod === methodFilter;
      const matchesCat = categoryFilter === 'all' || t.category === categoryFilter;

      let matchesDate = true;
      if (dateFilter) {
        const dStr = t.createdAt?.toDate
          ? t.createdAt.toDate().toISOString().slice(0, 10)
          : typeof t.createdAt === 'string'
          ? t.createdAt.slice(0, 10)
          : '';
        matchesDate = dStr === dateFilter;
      }

      return matchesSearch && matchesType && matchesMethod && matchesCat && matchesDate;
    });
  }, [transactions, searchQuery, typeFilter, methodFilter, categoryFilter, dateFilter]);

  // Handle Cash In
  const handleSaveCashIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cashInAmount <= 0) {
      onToast('Amount must be greater than zero', 'error');
      return;
    }
    setCashInSaving(true);
    try {
      await businessService.createCashTransaction({
        transactionId: `CTX-IN-${Date.now().toString(36).toUpperCase()}`,
        type: 'CASH_IN',
        category: cashInSource,
        amount: cashInAmount,
        paymentMethod: cashInMethod,
        referenceId: cashInRef.trim(),
        referenceType: 'manual_cash_in',
        description: cashInDesc.trim() || `Cash in from ${cashInSource}`,
      });
      onToast(language === 'bn' ? 'ক্যাশ-ইন সফলভাবে সংরক্ষিত হয়েছে!' : 'Cash In recorded successfully!', 'success');
      setShowCashInModal(false);
      setCashInAmount(0);
      setCashInDesc('');
      setCashInRef('');
      await loadData();
    } catch (err: any) {
      console.error(err);
      onToast(err?.message || 'Cash in failed', 'error');
    } finally {
      setCashInSaving(false);
    }
  };

  // Handle Cash Out
  const handleSaveCashOut = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cashOutAmount <= 0) {
      onToast('Amount must be greater than zero', 'error');
      return;
    }
    setCashOutSaving(true);
    try {
      await businessService.createCashTransaction({
        transactionId: `CTX-OUT-${Date.now().toString(36).toUpperCase()}`,
        type: 'CASH_OUT',
        category: cashOutPurpose,
        amount: cashOutAmount,
        paymentMethod: cashOutMethod,
        referenceId: cashOutRef.trim(),
        referenceType: 'manual_cash_out',
        description: cashOutDesc.trim() || `Cash out for ${cashOutPurpose}`,
      });
      onToast(language === 'bn' ? 'ক্যাশ-আউট সফলভাবে সংরক্ষিত হয়েছে!' : 'Cash Out recorded successfully!', 'success');
      setShowCashOutModal(false);
      setCashOutAmount(0);
      setCashOutDesc('');
      setCashOutRef('');
      await loadData();
    } catch (err: any) {
      console.error(err);
      onToast(err?.message || 'Cash out failed', 'error');
    } finally {
      setCashOutSaving(false);
    }
  };

  // Handle Opening Balance Save
  const handleSaveOpening = async (e: React.FormEvent) => {
    e.preventDefault();
    setOpeningSaving(true);
    try {
      await businessService.saveOpeningBalances({
        openingCash: Number(openingForm.openingCash) || 0,
        openingBkash: Number(openingForm.openingBkash) || 0,
        openingNagad: Number(openingForm.openingNagad) || 0,
        openingRocket: Number(openingForm.openingRocket) || 0,
        openingBank: Number(openingForm.openingBank) || 0,
        openingSupplierDue: Number(openingForm.openingSupplierDue) || 0,
        openingStockValue: Number(openingForm.openingStockValue) || 0,
      });
      setOpening(openingForm);
      onToast(language === 'bn' ? 'প্রারম্ভিক ব্যালেন্স সংরক্ষিত হয়েছে!' : 'Opening balances saved successfully!', 'success');
      setShowOpeningModal(false);
    } catch (err: any) {
      console.error(err);
      onToast(err?.message || 'Failed to save opening balances', 'error');
    } finally {
      setOpeningSaving(false);
    }
  };

  // Export CSV
  const handleExportCSV = () => {
    const headers = [
      'Transaction ID',
      'Date & Time',
      'Type',
      'Category',
      'Payment Method',
      'Amount (BDT)',
      'Reference ID',
      'Description',
    ];
    const rows = filteredTransactions.map((t) => {
      const dStr = t.createdAt?.toDate
        ? t.createdAt.toDate().toLocaleString('en-BD')
        : typeof t.createdAt === 'string'
        ? t.createdAt
        : '-';
      return [
        t.transactionId,
        dStr,
        t.type,
        t.category,
        t.paymentMethod,
        t.amount,
        t.referenceId || '-',
        t.description || '-',
      ];
    });
    exportToCSV('minarul_cash_transactions', rows, headers);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-stone-200">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-serif text-2xl font-bold text-stone-900">
              {language === 'bn' ? 'ক্যাশ ইন হ্যান্ড ও একাউন্টস ব্যবস্থাপনা' : 'Cash in Hand & Payment Accounts'}
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800 border border-emerald-200">
              FINANCIAL LEDGER
            </span>
          </div>
          <p className="text-xs text-stone-500 mt-1">
            {language === 'bn'
              ? 'বাস্তব নগদ টাকা (Cash in Hand) এবং ডিজিটাল একাউন্ট ব্যালেন্সের নিখুঁত রসিদ ও ট্রানজাকশন লেজার'
              : 'Physical cash held by the business vs digital merchant accounts (bKash, Nagad, Bank).'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowCashInModal(true)}
            className="px-4 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>{language === 'bn' ? 'ক্যাশ ইন (Cash In)' : 'Cash In'}</span>
          </button>

          <button
            onClick={() => setShowCashOutModal(true)}
            className="px-4 py-2.5 rounded-xl bg-rose-700 hover:bg-rose-800 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
          >
            <Minus className="w-4 h-4" />
            <span>{language === 'bn' ? 'ক্যাশ আউট (Cash Out)' : 'Cash Out'}</span>
          </button>

          <button
            onClick={() => setShowOpeningModal(true)}
            className="px-3.5 py-2.5 rounded-xl border border-stone-300 bg-white hover:bg-stone-50 text-stone-700 text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <Settings className="w-3.5 h-3.5" />
            <span>{language === 'bn' ? 'প্রারম্ভিক ব্যালেন্স' : 'Opening Balances'}</span>
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

      {/* Primary Cash in Hand Master Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="bg-gradient-to-br from-stone-900 via-stone-800 to-stone-950 text-white p-6 rounded-3xl shadow-md space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider text-amber-300 font-bold flex items-center gap-1.5">
              <Wallet className="w-4 h-4" />
              {language === 'bn' ? 'প্রকৃত নগদ ক্যাশ (Cash in Hand)' : 'Actual Physical Cash in Hand'}
            </span>
            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-400/20 text-amber-300 border border-amber-400/30">
              STORE CASH REGISTER
            </span>
          </div>

          <div className="text-3xl sm:text-4xl font-extrabold font-serif tracking-tight text-white">
            {money(balances.cashInHand)}
          </div>

          <div className="pt-2 border-t border-stone-700 text-xs space-y-1 text-stone-300">
            <div className="flex justify-between">
              <span>Opening Cash:</span>
              <span className="font-mono">{money(opening.openingCash)}</span>
            </div>
            <div className="flex justify-between">
              <span>Total Cash Inflow:</span>
              <span className="font-mono text-emerald-400">+{money(balances.totalCashIn)}</span>
            </div>
            <div className="flex justify-between">
              <span>Total Cash Outflow:</span>
              <span className="font-mono text-rose-400">-{money(balances.totalCashOut)}</span>
            </div>
          </div>
        </div>

        {/* Today's Cash Flow Breakdown */}
        <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between text-stone-500 text-xs font-bold uppercase tracking-wider">
            <span>Today's Cash Activity</span>
            <CircleDollarSign className="w-4 h-4 text-emerald-600" />
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className="p-3 rounded-2xl bg-emerald-50/70 border border-emerald-100">
              <span className="text-[11px] text-emerald-800 font-semibold block">Today's Cash In</span>
              <span className="text-xl font-bold font-serif text-emerald-900">+{money(balances.todayCashIn)}</span>
            </div>

            <div className="p-3 rounded-2xl bg-rose-50/70 border border-rose-100">
              <span className="text-[11px] text-rose-800 font-semibold block">Today's Cash Out</span>
              <span className="text-xl font-bold font-serif text-rose-900">-{money(balances.todayCashOut)}</span>
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-stone-50 border border-stone-200 flex items-center justify-between text-xs">
            <span className="text-stone-600 font-medium">Today's Net Cash Delta:</span>
            <span
              className={`font-mono font-bold text-sm ${
                balances.todayNetCash >= 0 ? 'text-emerald-700' : 'text-rose-700'
              }`}
            >
              {balances.todayNetCash >= 0 ? `+${money(balances.todayNetCash)}` : money(balances.todayNetCash)}
            </span>
          </div>
        </div>

        {/* Digital Payment Accounts Summary */}
        <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-xs space-y-3">
          <div className="flex items-center justify-between text-stone-500 text-xs font-bold uppercase tracking-wider">
            <span>Digital Payment Accounts</span>
            <Smartphone className="w-4 h-4 text-amber-700" />
          </div>

          <div className="space-y-2 pt-1 text-xs">
            <div className="flex items-center justify-between p-2 rounded-xl bg-pink-50 border border-pink-100">
              <span className="font-bold text-pink-900 flex items-center gap-1.5">
                <Smartphone className="w-3.5 h-3.5" /> bKash Merchant
              </span>
              <span className="font-mono font-bold text-pink-950">{money(balances.bkashBalance)}</span>
            </div>

            <div className="flex items-center justify-between p-2 rounded-xl bg-orange-50 border border-orange-100">
              <span className="font-bold text-orange-900 flex items-center gap-1.5">
                <Smartphone className="w-3.5 h-3.5" /> Nagad Merchant
              </span>
              <span className="font-mono font-bold text-orange-950">{money(balances.nagadBalance)}</span>
            </div>

            <div className="flex items-center justify-between p-2 rounded-xl bg-purple-50 border border-purple-100">
              <span className="font-bold text-purple-900 flex items-center gap-1.5">
                <Smartphone className="w-3.5 h-3.5" /> Rocket / DBBL
              </span>
              <span className="font-mono font-bold text-purple-950">{money(balances.rocketBalance)}</span>
            </div>

            <div className="flex items-center justify-between p-2 rounded-xl bg-blue-50 border border-blue-100">
              <span className="font-bold text-blue-900 flex items-center gap-1.5">
                <Landmark className="w-3.5 h-3.5" /> Bank Account
              </span>
              <span className="font-mono font-bold text-blue-950">{money(balances.bankBalance)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Transaction History Section */}
      <div className="space-y-4">
        {/* Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-stone-200">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by transaction ID, description or reference..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-xs pl-9 pr-3 py-2 rounded-xl border border-stone-200 focus:border-amber-600 outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as any)}
              className="text-xs px-3 py-2 rounded-xl border border-stone-200 bg-white outline-none cursor-pointer"
            >
              <option value="all">All Types (In & Out)</option>
              <option value="CASH_IN">CASH IN (+)</option>
              <option value="CASH_OUT">CASH OUT (-)</option>
            </select>

            <select
              value={methodFilter}
              onChange={(e) => setMethodFilter(e.target.value)}
              className="text-xs px-3 py-2 rounded-xl border border-stone-200 bg-white outline-none cursor-pointer"
            >
              <option value="all">All Payment Accounts</option>
              <option value="CASH">CASH (Physical Cash)</option>
              <option value="BKASH">BKASH</option>
              <option value="NAGAD">NAGAD</option>
              <option value="ROCKET">ROCKET</option>
              <option value="BANK">BANK</option>
            </select>

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="text-xs px-3 py-2 rounded-xl border border-stone-200 bg-white outline-none cursor-pointer"
            >
              <option value="all">All Categories</option>
              <option value="COD_SALE">COD Sale</option>
              <option value="CUSTOMER_PAYMENT">Customer Payment</option>
              <option value="SUPPLIER_PAYMENT">Supplier Payment</option>
              <option value="EXPENSE">Expense</option>
              <option value="OTHER_INCOME">Other Income</option>
              <option value="OWNER_WITHDRAWAL">Owner Withdrawal</option>
              <option value="OPENING_BALANCE">Opening Balance</option>
            </select>

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
              onClick={() => printSection('Cash & Accounts Ledger', 'cash-print-area')}
              className="px-3 py-2 rounded-xl border border-stone-300 bg-white hover:bg-stone-50 text-stone-700 text-xs font-semibold flex items-center gap-1 shadow-2xs cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print</span>
            </button>
          </div>
        </div>

        {/* Table */}
        <div id="cash-print-area" className="bg-white rounded-3xl border border-stone-200 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-stone-50 border-b border-stone-200 text-stone-600 font-bold uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="py-3 px-4">Tx ID</th>
                  <th className="py-3 px-3">Date & Time</th>
                  <th className="py-3 px-3 text-center">Type</th>
                  <th className="py-3 px-3">Category</th>
                  <th className="py-3 px-3">Account / Method</th>
                  <th className="py-3 px-3 text-right">Amount</th>
                  <th className="py-3 px-4">Description & Ref</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {filteredTransactions.map((tx) => {
                  const isIn = tx.type === 'CASH_IN';
                  const dStr = tx.createdAt?.toDate
                    ? tx.createdAt.toDate().toLocaleString('en-BD')
                    : typeof tx.createdAt === 'string'
                    ? tx.createdAt
                    : '-';

                  return (
                    <tr key={tx.transactionId || tx.id} className="hover:bg-stone-50/70 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-stone-900 text-[11px]">
                        {tx.transactionId}
                      </td>
                      <td className="py-3 px-3 text-stone-500 whitespace-nowrap text-[11px]">
                        {dStr}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span
                          className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            isIn
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              : 'bg-rose-100 text-rose-800 border border-rose-200'
                          }`}
                        >
                          {isIn ? <ArrowDownLeft className="w-2.5 h-2.5" /> : <ArrowUpRight className="w-2.5 h-2.5" />}
                          {tx.type}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-semibold text-stone-800">
                        {tx.category.replace('_', ' ')}
                      </td>
                      <td className="py-3 px-3 font-mono font-semibold text-stone-700">
                        <span className="px-2 py-0.5 rounded-md bg-stone-100 text-[11px]">
                          {tx.paymentMethod}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-sm">
                        <span className={isIn ? 'text-emerald-700' : 'text-rose-700'}>
                          {isIn ? `+${money(tx.amount)}` : `-${money(tx.amount)}`}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-stone-600 text-[11px]">
                        <div className="font-medium text-stone-800">{tx.description || '-'}</div>
                        {tx.referenceId && (
                          <div className="font-mono text-[10px] text-stone-400">Ref: {tx.referenceId}</div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {!filteredTransactions.length && (
              <div className="p-8 text-center text-stone-400 text-xs">
                No financial transactions recorded yet. Use the Cash In or Cash Out buttons above to add entries.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* CASH IN MODAL */}
      {/* ------------------------------------------------------------- */}
      {showCashInModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-stone-200">
            <div className="flex items-center justify-between border-b border-stone-200 pb-3">
              <div className="flex items-center gap-2">
                <Plus className="w-5 h-5 text-emerald-700" />
                <h3 className="font-serif text-lg font-bold text-stone-900">
                  {language === 'bn' ? 'ক্যাশ ইন এন্ট্রি (Cash In)' : 'Record Cash In'}
                </h3>
              </div>
              <button
                onClick={() => setShowCashInModal(false)}
                className="p-1.5 rounded-full hover:bg-stone-100 text-stone-500 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCashIn} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-stone-700 mb-1">
                  {language === 'bn' ? 'টাকার পরিমাণ (Amount in ৳) *' : 'Amount in BDT (৳) *'}
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  value={cashInAmount || ''}
                  onChange={(e) => setCashInAmount(Number(e.target.value))}
                  placeholder="0.00"
                  className="w-full p-3 rounded-xl border border-stone-300 focus:border-emerald-600 outline-none font-bold text-base"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-stone-700 mb-1">
                    {language === 'bn' ? 'আয়ের উৎস (Source) *' : 'Source *'}
                  </label>
                  <select
                    value={cashInSource}
                    onChange={(e) => setCashInSource(e.target.value as any)}
                    className="w-full p-3 rounded-xl border border-stone-300 focus:border-emerald-600 outline-none bg-white font-medium"
                  >
                    <option value="COD_SALE">COD Sale Collection</option>
                    <option value="CUSTOMER_PAYMENT">Customer Payment</option>
                    <option value="OTHER_INCOME">Other Income</option>
                    <option value="OPENING_BALANCE">Opening Capital</option>
                    <option value="OTHER">Other Source</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-stone-700 mb-1">
                    {language === 'bn' ? 'পেমেন্ট মেথড *' : 'Payment Method *'}
                  </label>
                  <select
                    value={cashInMethod}
                    onChange={(e) => setCashInMethod(e.target.value as any)}
                    className="w-full p-3 rounded-xl border border-stone-300 focus:border-emerald-600 outline-none bg-white font-medium"
                  >
                    <option value="CASH">CASH (Increases Cash in Hand)</option>
                    <option value="BKASH">BKASH (Merchant Account)</option>
                    <option value="NAGAD">NAGAD (Merchant Account)</option>
                    <option value="ROCKET">ROCKET</option>
                    <option value="BANK">BANK</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-stone-700 mb-1">
                  {language === 'bn' ? 'রেফারেন্স / ট্রানজাকশন আইডি' : 'Reference / Transaction ID'}
                </label>
                <input
                  type="text"
                  placeholder="e.g. Memo #102, TrxID"
                  value={cashInRef}
                  onChange={(e) => setCashInRef(e.target.value)}
                  className="w-full p-3 rounded-xl border border-stone-300 focus:border-emerald-600 outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-stone-700 mb-1">
                  {language === 'bn' ? 'বিবরণ (Description)' : 'Description'}
                </label>
                <textarea
                  rows={2}
                  placeholder="Description of income..."
                  value={cashInDesc}
                  onChange={(e) => setCashInDesc(e.target.value)}
                  className="w-full p-3 rounded-xl border border-stone-300 focus:border-emerald-600 outline-none resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-stone-200">
                <button
                  type="button"
                  onClick={() => setShowCashInModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-stone-300 hover:bg-stone-50 text-stone-700 font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={cashInSaving}
                  className="px-5 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold disabled:opacity-50 cursor-pointer shadow-md"
                >
                  {cashInSaving ? 'Saving...' : 'Confirm Cash In'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* CASH OUT MODAL */}
      {/* ------------------------------------------------------------- */}
      {showCashOutModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-stone-200">
            <div className="flex items-center justify-between border-b border-stone-200 pb-3">
              <div className="flex items-center gap-2">
                <Minus className="w-5 h-5 text-rose-700" />
                <h3 className="font-serif text-lg font-bold text-stone-900">
                  {language === 'bn' ? 'ক্যাশ আউট এন্ট্রি (Cash Out)' : 'Record Cash Out'}
                </h3>
              </div>
              <button
                onClick={() => setShowCashOutModal(false)}
                className="p-1.5 rounded-full hover:bg-stone-100 text-stone-500 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCashOut} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-stone-700 mb-1">
                  {language === 'bn' ? 'টাকার পরিমাণ (Amount in ৳) *' : 'Amount in BDT (৳) *'}
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  value={cashOutAmount || ''}
                  onChange={(e) => setCashOutAmount(Number(e.target.value))}
                  placeholder="0.00"
                  className="w-full p-3 rounded-xl border border-stone-300 focus:border-rose-600 outline-none font-bold text-base"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-stone-700 mb-1">
                    {language === 'bn' ? 'খরচের উদ্দেশ্য (Purpose) *' : 'Purpose *'}
                  </label>
                  <select
                    value={cashOutPurpose}
                    onChange={(e) => setCashOutPurpose(e.target.value as any)}
                    className="w-full p-3 rounded-xl border border-stone-300 focus:border-rose-600 outline-none bg-white font-medium"
                  >
                    <option value="EXPENSE">Operating Expense</option>
                    <option value="SUPPLIER_PAYMENT">Supplier Payment</option>
                    <option value="OWNER_WITHDRAWAL">Owner Withdrawal</option>
                    <option value="OTHER">Other Purpose</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-stone-700 mb-1">
                    {language === 'bn' ? 'পেমেন্ট মেথড *' : 'Payment Method *'}
                  </label>
                  <select
                    value={cashOutMethod}
                    onChange={(e) => setCashOutMethod(e.target.value as any)}
                    className="w-full p-3 rounded-xl border border-stone-300 focus:border-rose-600 outline-none bg-white font-medium"
                  >
                    <option value="CASH">CASH (Reduces Cash in Hand)</option>
                    <option value="BKASH">BKASH</option>
                    <option value="NAGAD">NAGAD</option>
                    <option value="ROCKET">ROCKET</option>
                    <option value="BANK">BANK</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-stone-700 mb-1">
                  {language === 'bn' ? 'রেফারেন্স ভাউচার / ট্রানজাকশন আইডি' : 'Reference Voucher / TrxID'}
                </label>
                <input
                  type="text"
                  placeholder="e.g. Voucher #44, Receipt"
                  value={cashOutRef}
                  onChange={(e) => setCashOutRef(e.target.value)}
                  className="w-full p-3 rounded-xl border border-stone-300 focus:border-rose-600 outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-stone-700 mb-1">
                  {language === 'bn' ? 'বিবরণ (Description)' : 'Description'}
                </label>
                <textarea
                  rows={2}
                  placeholder="Description of payment..."
                  value={cashOutDesc}
                  onChange={(e) => setCashOutDesc(e.target.value)}
                  className="w-full p-3 rounded-xl border border-stone-300 focus:border-rose-600 outline-none resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-stone-200">
                <button
                  type="button"
                  onClick={() => setShowCashOutModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-stone-300 hover:bg-stone-50 text-stone-700 font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={cashOutSaving}
                  className="px-5 py-2.5 rounded-xl bg-rose-700 hover:bg-rose-800 text-white font-bold disabled:opacity-50 cursor-pointer shadow-md"
                >
                  {cashOutSaving ? 'Saving...' : 'Confirm Cash Out'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* OPENING BALANCE SETUP MODAL */}
      {/* ------------------------------------------------------------- */}
      {showOpeningModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl border border-stone-200 my-8">
            <div className="flex items-center justify-between border-b border-stone-200 pb-3">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-amber-700" />
                <h3 className="font-serif text-lg font-bold text-stone-900">
                  {language === 'bn' ? 'প্রারম্ভিক ব্যালেন্স নির্ধারণ' : 'Opening Balances Setup'}
                </h3>
              </div>
              <button
                onClick={() => setShowOpeningModal(false)}
                className="p-1.5 rounded-full hover:bg-stone-100 text-stone-500 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-stone-500">
              {language === 'bn'
                ? 'সিস্টেম শুরুর প্রারম্ভিক ক্যাশ, ডিজিটাল একাউন্ট, দেনা এবং স্টক ভ্যালু নির্ধারণ করুন। এটি স্থায়ীভাবে সংরক্ষিত হবে।'
                : 'Set permanent baseline opening amounts. Historical transactions will not be overwritten.'}
            </p>

            <form onSubmit={handleSaveOpening} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-stone-700 mb-1">Opening Cash (৳)</label>
                  <input
                    type="number"
                    min="0"
                    value={openingForm.openingCash}
                    onChange={(e) => setOpeningForm({ ...openingForm, openingCash: Number(e.target.value) })}
                    className="w-full p-2.5 rounded-xl border border-stone-300 font-bold"
                  />
                </div>

                <div>
                  <label className="block font-bold text-stone-700 mb-1">Opening bKash (৳)</label>
                  <input
                    type="number"
                    min="0"
                    value={openingForm.openingBkash}
                    onChange={(e) => setOpeningForm({ ...openingForm, openingBkash: Number(e.target.value) })}
                    className="w-full p-2.5 rounded-xl border border-stone-300 font-bold"
                  />
                </div>

                <div>
                  <label className="block font-bold text-stone-700 mb-1">Opening Nagad (৳)</label>
                  <input
                    type="number"
                    min="0"
                    value={openingForm.openingNagad}
                    onChange={(e) => setOpeningForm({ ...openingForm, openingNagad: Number(e.target.value) })}
                    className="w-full p-2.5 rounded-xl border border-stone-300 font-bold"
                  />
                </div>

                <div>
                  <label className="block font-bold text-stone-700 mb-1">Opening Rocket (৳)</label>
                  <input
                    type="number"
                    min="0"
                    value={openingForm.openingRocket}
                    onChange={(e) => setOpeningForm({ ...openingForm, openingRocket: Number(e.target.value) })}
                    className="w-full p-2.5 rounded-xl border border-stone-300 font-bold"
                  />
                </div>

                <div>
                  <label className="block font-bold text-stone-700 mb-1">Opening Bank (৳)</label>
                  <input
                    type="number"
                    min="0"
                    value={openingForm.openingBank}
                    onChange={(e) => setOpeningForm({ ...openingForm, openingBank: Number(e.target.value) })}
                    className="w-full p-2.5 rounded-xl border border-stone-300 font-bold"
                  />
                </div>

                <div>
                  <label className="block font-bold text-stone-700 mb-1">Opening Supplier Due (৳)</label>
                  <input
                    type="number"
                    min="0"
                    value={openingForm.openingSupplierDue}
                    onChange={(e) => setOpeningForm({ ...openingForm, openingSupplierDue: Number(e.target.value) })}
                    className="w-full p-2.5 rounded-xl border border-stone-300 font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-stone-700 mb-1">Opening Stock Value (৳)</label>
                <input
                  type="number"
                  min="0"
                  value={openingForm.openingStockValue}
                  onChange={(e) => setOpeningForm({ ...openingForm, openingStockValue: Number(e.target.value) })}
                  className="w-full p-2.5 rounded-xl border border-stone-300 font-bold"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-stone-200">
                <button
                  type="button"
                  onClick={() => setShowOpeningModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-stone-300 hover:bg-stone-50 text-stone-700 font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={openingSaving}
                  className="px-5 py-2.5 rounded-xl bg-amber-700 hover:bg-amber-800 text-white font-bold disabled:opacity-50 cursor-pointer shadow-md"
                >
                  {openingSaving ? 'Saving...' : 'Save Opening Balances'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
