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
  Eye,
  Pencil,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import { CashTransaction, Expense, OpeningBalances, PaymentAccountMethod, CashTransactionCategory } from '../../types';
import { businessService } from '../../services/businessService';
import { exportToCSV, printSection } from '../../utils/exportUtils';
import { useLanguage } from '../../context/LanguageContext';

interface AccountsManagementProps {
  onToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

const money = (n: number) => `৳${Number(n || 0).toLocaleString('en-BD', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const AccountsManagement: React.FC<AccountsManagementProps> = ({ onToast }) => {
  const { language } = useLanguage();
  const [activeSection, setActiveSection] = useState<'overview' | 'expenses' | 'transactions'>('overview');
  const [transactions, setTransactions] = useState<CashTransaction[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
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

  // Expense Modals & States
  const [showAddExpenseModal, setShowAddExpenseModal] = useState(false);
  const [expenseForm, setExpenseForm] = useState({
    category: 'Shop Rent',
    description: '',
    amount: 0,
    paymentMethod: 'CASH' as PaymentAccountMethod,
    expenseDate: new Date().toISOString().slice(0, 10),
    notes: '',
  });
  const [expenseSaving, setExpenseSaving] = useState(false);

  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [editExpenseForm, setEditExpenseForm] = useState({
    category: 'Shop Rent',
    description: '',
    amount: 0,
    paymentMethod: 'CASH' as PaymentAccountMethod,
    expenseDate: '',
    notes: '',
  });
  const [editExpenseSaving, setEditExpenseSaving] = useState(false);

  const [viewingExpense, setViewingExpense] = useState<Expense | null>(null);
  const [deletingExpense, setDeletingExpense] = useState<Expense | null>(null);
  const [deletingExpenseLoading, setDeletingExpenseLoading] = useState(false);
  const [printExpense, setPrintExpense] = useState<Expense | null>(null);

  // Expense Filters
  const [expenseSearch, setExpenseSearch] = useState('');
  const [expenseCategoryFilter, setExpenseCategoryFilter] = useState('all');
  const [expenseDateFilter, setExpenseDateFilter] = useState('');

  // Cash Transaction Edit / Delete / Print States
  const [editingTransaction, setEditingTransaction] = useState<CashTransaction | null>(null);
  const [editTxAmount, setEditTxAmount] = useState<number>(0);
  const [editTxType, setEditTxType] = useState<'CASH_IN' | 'CASH_OUT'>('CASH_IN');
  const [editTxMethod, setEditTxMethod] = useState<PaymentAccountMethod>('CASH');
  const [editTxCategory, setEditTxCategory] = useState<CashTransactionCategory>('OTHER');
  const [editTxDesc, setEditTxDesc] = useState('');
  const [editTxSaving, setEditTxSaving] = useState(false);

  const [deletingTransaction, setDeletingTransaction] = useState<CashTransaction | null>(null);
  const [deletingTxLoading, setDeletingTxLoading] = useState(false);
  const [printTransaction, setPrintTransaction] = useState<CashTransaction | null>(null);

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
      const [txList, op, expList] = await Promise.all([
        businessService.getCashTransactions(),
        businessService.getOpeningBalances(),
        businessService.getExpenses(),
      ]);
      setTransactions(txList);
      setOpening(op);
      setOpeningForm(op);
      setExpenses(expList);
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

  // Filtered Expenses
  const filteredExpenses = useMemo(() => {
    return expenses.filter((e) => {
      const q = expenseSearch.trim().toLowerCase();
      const matchesSearch =
        !q ||
        (e.expenseId && e.expenseId.toLowerCase().includes(q)) ||
        (e.description && e.description.toLowerCase().includes(q)) ||
        (e.notes && e.notes.toLowerCase().includes(q)) ||
        e.category.toLowerCase().includes(q);

      const matchesCat = expenseCategoryFilter === 'all' || e.category === expenseCategoryFilter;
      const matchesDate = !expenseDateFilter || e.expenseDate === expenseDateFilter;

      return matchesSearch && matchesCat && matchesDate;
    });
  }, [expenses, expenseSearch, expenseCategoryFilter, expenseDateFilter]);

  const totalExpensesAmount = useMemo(() => {
    return expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  }, [expenses]);

  const todayDateStr = new Date().toISOString().slice(0, 10);
  const todayExpensesAmount = useMemo(() => {
    return expenses
      .filter((e) => e.expenseDate === todayDateStr)
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  }, [expenses, todayDateStr]);

  // Handle Save Expense
  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (expenseForm.amount <= 0) {
      onToast('Amount must be greater than zero', 'error');
      return;
    }
    setExpenseSaving(true);
    try {
      await businessService.createExpense({
        category: expenseForm.category,
        description: expenseForm.description.trim() || expenseForm.category,
        amount: Number(expenseForm.amount),
        paymentMethod: expenseForm.paymentMethod,
        expenseDate: expenseForm.expenseDate,
        notes: expenseForm.notes.trim(),
      });
      onToast(language === 'bn' ? 'খরচের মেমো সফলভাবে সংরক্ষিত হয়েছে!' : 'Expense memo created successfully!', 'success');
      setShowAddExpenseModal(false);
      setExpenseForm({
        category: 'Shop Rent',
        description: '',
        amount: 0,
        paymentMethod: 'CASH',
        expenseDate: new Date().toISOString().slice(0, 10),
        notes: '',
      });
      await loadData();
    } catch (err: any) {
      console.error(err);
      onToast(err?.message || 'Failed to record expense', 'error');
    } finally {
      setExpenseSaving(false);
    }
  };

  // Open Edit Expense Modal
  const openEditExpenseModal = (exp: Expense) => {
    setEditingExpense(exp);
    setEditExpenseForm({
      category: exp.category || 'Shop Rent',
      description: exp.description || '',
      amount: exp.amount || 0,
      paymentMethod: (exp.paymentMethod as PaymentAccountMethod) || 'CASH',
      expenseDate: exp.expenseDate || new Date().toISOString().slice(0, 10),
      notes: exp.notes || '',
    });
  };

  // Handle Update Expense
  const handleUpdateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingExpense) return;
    if (editExpenseForm.amount <= 0) {
      onToast('Amount must be greater than zero', 'error');
      return;
    }
    setEditExpenseSaving(true);
    try {
      const eId = editingExpense.id || editingExpense.expenseId || '';
      await businessService.updateExpense(eId, {
        category: editExpenseForm.category,
        description: editExpenseForm.description.trim() || editExpenseForm.category,
        amount: Number(editExpenseForm.amount),
        paymentMethod: editExpenseForm.paymentMethod,
        expenseDate: editExpenseForm.expenseDate,
        notes: editExpenseForm.notes.trim(),
      });
      onToast(language === 'bn' ? 'খরচের মেমো আপডেট হয়েছে!' : 'Expense memo updated successfully!', 'success');
      setEditingExpense(null);
      await loadData();
    } catch (err: any) {
      console.error(err);
      onToast(err?.message || 'Failed to update expense', 'error');
    } finally {
      setEditExpenseSaving(false);
    }
  };

  // Handle Delete Expense
  const handleDeleteExpense = async () => {
    if (!deletingExpense) return;
    setDeletingExpenseLoading(true);
    try {
      const eId = deletingExpense.id || deletingExpense.expenseId || '';
      await businessService.deleteExpense(eId);
      onToast(language === 'bn' ? 'খরচের মেমো মুছে ফেলা হয়েছে এবং ব্যালেন্স রিস্টোর হয়েছে!' : 'Expense memo deleted and balance restored!', 'success');
      setDeletingExpense(null);
      await loadData();
    } catch (err: any) {
      console.error(err);
      onToast(err?.message || 'Failed to delete expense', 'error');
    } finally {
      setDeletingExpenseLoading(false);
    }
  };

  // Open Edit Transaction Modal
  const openEditTxModal = (tx: CashTransaction) => {
    setEditingTransaction(tx);
    setEditTxAmount(tx.amount || 0);
    setEditTxType(tx.type);
    setEditTxMethod(tx.paymentMethod);
    setEditTxCategory(tx.category);
    setEditTxDesc(tx.description || '');
  };

  // Handle Update Transaction
  const handleUpdateTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTransaction) return;
    if (editTxAmount <= 0) {
      onToast('Amount must be greater than zero', 'error');
      return;
    }
    setEditTxSaving(true);
    try {
      const tId = editingTransaction.id || editingTransaction.transactionId || '';
      await businessService.updateCashTransaction(tId, {
        amount: Number(editTxAmount),
        paymentMethod: editTxMethod,
        category: editTxCategory,
        description: editTxDesc.trim(),
      });
      onToast(language === 'bn' ? 'ট্রানজাকশন আপডেট হয়েছে!' : 'Transaction updated successfully!', 'success');
      setEditingTransaction(null);
      await loadData();
    } catch (err: any) {
      console.error(err);
      onToast(err?.message || 'Failed to update transaction', 'error');
    } finally {
      setEditTxSaving(false);
    }
  };

  // Handle Delete Transaction
  const handleDeleteTransaction = async () => {
    if (!deletingTransaction) return;
    setDeletingTxLoading(true);
    try {
      const tId = deletingTransaction.id || deletingTransaction.transactionId || '';
      await businessService.deleteCashTransaction(tId);
      onToast(language === 'bn' ? 'ট্রানজাকশন মুছে ফেলা হয়েছে!' : 'Transaction deleted successfully!', 'success');
      setDeletingTransaction(null);
      await loadData();
    } catch (err: any) {
      console.error(err);
      onToast(err?.message || 'Failed to delete transaction', 'error');
    } finally {
      setDeletingTxLoading(false);
    }
  };

  // Export Expenses CSV
  const handleExportExpensesCSV = () => {
    const headers = [
      'Memo ID',
      'Date',
      'Category',
      'Description',
      'Payment Method',
      'Amount (BDT)',
      'Notes',
    ];
    const rows = filteredExpenses.map((exp) => [
      exp.expenseId || exp.id,
      exp.expenseDate || '-',
      exp.category,
      exp.description || '-',
      exp.paymentMethod || 'CASH',
      exp.amount,
      exp.notes || '-',
    ]);
    exportToCSV('minarul_expense_memos', rows, headers);
  };

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
            onClick={() => setShowAddExpenseModal(true)}
            className="px-3.5 py-2.5 rounded-xl bg-rose-700 hover:bg-rose-800 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>{language === 'bn' ? 'নতুন খরচ (Expense)' : 'New Expense'}</span>
          </button>

          <button
            onClick={() => setShowCashInModal(true)}
            className="px-3.5 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>{language === 'bn' ? 'ক্যাশ ইন (Cash In)' : 'Cash In'}</span>
          </button>

          <button
            onClick={() => setShowCashOutModal(true)}
            className="px-3.5 py-2.5 rounded-xl bg-stone-850 hover:bg-stone-900 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
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

      {/* Navigation Section Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-stone-200 pb-3">
        <button
          onClick={() => setActiveSection('overview')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
            activeSection === 'overview'
              ? 'bg-stone-900 text-white shadow-xs'
              : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-50'
          }`}
        >
          <Building className="w-4 h-4 text-amber-400" />
          <span>{language === 'bn' ? 'আর্থিক সারসংক্ষেপ ও ব্যালেন্স' : 'Financial Overview'}</span>
        </button>

        <button
          onClick={() => setActiveSection('expenses')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
            activeSection === 'expenses'
              ? 'bg-rose-700 text-white shadow-xs'
              : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-50'
          }`}
        >
          <FileText className="w-4 h-4 text-rose-300" />
          <span>{language === 'bn' ? 'খরচের মেমো ও ভাউচার' : 'Expense Memos & Vouchers'}</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
            activeSection === 'expenses' ? 'bg-rose-900 text-white' : 'bg-rose-100 text-rose-800'
          }`}>
            {expenses.length}
          </span>
        </button>

        <button
          onClick={() => setActiveSection('transactions')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
            activeSection === 'transactions'
              ? 'bg-emerald-700 text-white shadow-xs'
              : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-50'
          }`}
        >
          <TrendingUp className="w-4 h-4 text-emerald-300" />
          <span>{language === 'bn' ? 'ক্যাশ ও ডিজিটাল লেজার' : 'Cash & Accounts Ledger'}</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
            activeSection === 'transactions' ? 'bg-emerald-900 text-white' : 'bg-emerald-100 text-emerald-800'
          }`}>
            {transactions.length}
          </span>
        </button>
      </div>

      {activeSection === 'overview' && (
        <div className="space-y-6">
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

          {/* Quick Summary Grid: Recent Expenses & Recent Ledger */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Recent Expense Memos */}
            <div className="bg-white p-5 rounded-3xl border border-stone-200 shadow-xs space-y-3">
              <div className="flex items-center justify-between border-b border-stone-100 pb-2.5">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-rose-700" />
                  <h3 className="font-bold text-stone-900 text-xs uppercase tracking-wider">
                    {language === 'bn' ? 'সাম্প্রতিক খরচের মেমোসমূহ' : 'Recent Expense Memos'}
                  </h3>
                </div>
                <button
                  onClick={() => setActiveSection('expenses')}
                  className="text-[11px] font-bold text-rose-700 hover:text-rose-800 cursor-pointer"
                >
                  {language === 'bn' ? 'সবগুলো দেখুন →' : 'View All →'}
                </button>
              </div>

              <div className="divide-y divide-stone-100 text-xs">
                {expenses.slice(0, 5).map((exp) => (
                  <div key={exp.id || exp.expenseId} className="py-2.5 flex items-center justify-between gap-3">
                    <div>
                      <div className="font-bold text-stone-900">{exp.category}</div>
                      <div className="text-[11px] text-stone-500">
                        {exp.expenseDate} • {exp.description || '-'}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-bold text-rose-700">{money(exp.amount)}</div>
                      <div className="text-[10px] text-stone-400 font-mono">{exp.paymentMethod || 'CASH'}</div>
                    </div>
                  </div>
                ))}
                {!expenses.length && (
                  <div className="py-6 text-center text-stone-400 text-xs">
                    No expense records yet. Click "New Expense" to record shop expenses.
                  </div>
                )}
              </div>
            </div>

            {/* Recent Cash Transactions */}
            <div className="bg-white p-5 rounded-3xl border border-stone-200 shadow-xs space-y-3">
              <div className="flex items-center justify-between border-b border-stone-100 pb-2.5">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-emerald-700" />
                  <h3 className="font-bold text-stone-900 text-xs uppercase tracking-wider">
                    {language === 'bn' ? 'সাম্প্রতিক ক্যাশ লেনদেনসমূহ' : 'Recent Cash Transactions'}
                  </h3>
                </div>
                <button
                  onClick={() => setActiveSection('transactions')}
                  className="text-[11px] font-bold text-emerald-700 hover:text-emerald-800 cursor-pointer"
                >
                  {language === 'bn' ? 'সম্পূর্ণ লেজার →' : 'View Ledger →'}
                </button>
              </div>

              <div className="divide-y divide-stone-100 text-xs">
                {transactions.slice(0, 5).map((tx) => {
                  const isIn = tx.type === 'CASH_IN';
                  return (
                    <div key={tx.id || tx.transactionId} className="py-2.5 flex items-center justify-between gap-3">
                      <div>
                        <div className="font-bold text-stone-900 flex items-center gap-1.5">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                              isIn ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {tx.type}
                          </span>
                          <span>{tx.category.replace('_', ' ')}</span>
                        </div>
                        <div className="text-[11px] text-stone-500">{tx.description || tx.referenceId || '-'}</div>
                      </div>
                      <div className="text-right">
                        <div className={`font-mono font-bold ${isIn ? 'text-emerald-700' : 'text-rose-700'}`}>
                          {isIn ? `+${money(tx.amount)}` : `-${money(tx.amount)}`}
                        </div>
                        <div className="text-[10px] text-stone-400 font-mono">{tx.paymentMethod}</div>
                      </div>
                    </div>
                  );
                })}
                {!transactions.length && (
                  <div className="py-6 text-center text-stone-400 text-xs">
                    No transactions recorded yet.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* SECTION 2: EXPENSE MEMOS & VOUCHERS */}
      {/* ============================================================== */}
      {activeSection === 'expenses' && (
        <div className="space-y-4">
          {/* Expense KPI Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-xs">
              <span className="text-[11px] font-bold text-stone-500 uppercase tracking-wider block">
                Total Expense Memos
              </span>
              <div className="text-2xl font-bold font-serif text-stone-900 mt-1">{expenses.length}</div>
              <span className="text-[10px] text-stone-400">Total recorded vouchers</span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-xs">
              <span className="text-[11px] font-bold text-stone-500 uppercase tracking-wider block">
                Total Expenses Spent
              </span>
              <div className="text-2xl font-bold font-serif text-rose-700 mt-1">{money(totalExpensesAmount)}</div>
              <span className="text-[10px] text-rose-600 font-semibold">Cumulative business expenses</span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-xs">
              <span className="text-[11px] font-bold text-stone-500 uppercase tracking-wider block">
                Today's Expenses
              </span>
              <div className="text-2xl font-bold font-serif text-amber-800 mt-1">{money(todayExpensesAmount)}</div>
              <span className="text-[10px] text-stone-400">Date: {todayDateStr}</span>
            </div>
          </div>

          {/* Expense Filters & Controls */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-stone-200">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder={language === 'bn' ? 'মেমো আইডি, ক্যাটাগরি বা বিবরণ দিয়ে খুঁজুন...' : 'Search expense memos...'}
                value={expenseSearch}
                onChange={(e) => setExpenseSearch(e.target.value)}
                className="w-full text-xs pl-9 pr-3 py-2 rounded-xl border border-stone-200 focus:border-rose-600 outline-none"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={expenseCategoryFilter}
                onChange={(e) => setExpenseCategoryFilter(e.target.value)}
                className="text-xs px-3 py-2 rounded-xl border border-stone-200 bg-white outline-none cursor-pointer"
              >
                <option value="all">All Expense Categories</option>
                <option value="Shop Rent">Shop Rent</option>
                <option value="Utility Bills">Utility Bills (Electricity, Water, Internet)</option>
                <option value="Salaries & Wages">Salaries & Wages</option>
                <option value="Packaging Materials">Packaging Materials</option>
                <option value="Delivery & Courier">Delivery & Courier Charges</option>
                <option value="Marketing & Ads">Marketing & Facebook Ads</option>
                <option value="Tea & Entertainment">Tea & Entertainment</option>
                <option value="Software & Tools">Software & Cloud Services</option>
                <option value="Repair & Maintenance">Repair & Maintenance</option>
                <option value="Other">Other Expenses</option>
              </select>

              <input
                type="date"
                value={expenseDateFilter}
                onChange={(e) => setExpenseDateFilter(e.target.value)}
                className="text-xs px-3 py-2 rounded-xl border border-stone-200 bg-white outline-none cursor-pointer"
              />

              <button
                onClick={handleExportExpensesCSV}
                className="px-3 py-2 rounded-xl border border-stone-300 bg-white hover:bg-stone-50 text-stone-700 text-xs font-semibold flex items-center gap-1 shadow-2xs cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>CSV</span>
              </button>

              <button
                onClick={() => printSection('Expense Memos Ledger', 'expense-print-area')}
                className="px-3 py-2 rounded-xl border border-stone-300 bg-white hover:bg-stone-50 text-stone-700 text-xs font-semibold flex items-center gap-1 shadow-2xs cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print</span>
              </button>

              <button
                onClick={() => setShowAddExpenseModal(true)}
                className="px-3 py-2 rounded-xl bg-rose-700 hover:bg-rose-800 text-white text-xs font-bold flex items-center gap-1 shadow-2xs cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{language === 'bn' ? 'নতুন খরচ' : 'Add Expense'}</span>
              </button>
            </div>
          </div>

          {/* Expense Table */}
          <div id="expense-print-area" className="bg-white rounded-3xl border border-stone-200 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-stone-50 border-b border-stone-200 text-stone-600 font-bold uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Memo ID</th>
                    <th className="py-3 px-3">Date</th>
                    <th className="py-3 px-3">Category</th>
                    <th className="py-3 px-3">Description</th>
                    <th className="py-3 px-3 text-center">Payment Method</th>
                    <th className="py-3 px-3 text-right">Amount (৳)</th>
                    <th className="py-3 px-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {filteredExpenses.map((exp) => (
                    <tr key={exp.id || exp.expenseId} className="hover:bg-stone-50/70 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-stone-900 text-[11px]">
                        {exp.expenseId || exp.id}
                      </td>
                      <td className="py-3 px-3 text-stone-500 whitespace-nowrap text-[11px]">
                        {exp.expenseDate}
                      </td>
                      <td className="py-3 px-3">
                        <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-800 border border-rose-200 font-bold text-[10px]">
                          {exp.category}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-stone-700">
                        <div className="font-semibold text-stone-900">{exp.description || '-'}</div>
                        {exp.notes && <div className="text-[10px] text-stone-400 italic">{exp.notes}</div>}
                      </td>
                      <td className="py-3 px-3 text-center font-mono">
                        <span className="px-2 py-0.5 rounded bg-stone-100 text-[10px] font-bold text-stone-700">
                          {exp.paymentMethod || 'CASH'}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-sm text-rose-700">
                        {money(exp.amount)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => setViewingExpense(exp)}
                            className="p-1.5 rounded-lg border border-stone-200 hover:bg-stone-100 text-stone-600 cursor-pointer shadow-2xs"
                            title={language === 'bn' ? 'মেমো দেখুন' : 'View Expense Memo'}
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => setPrintExpense(exp)}
                            className="p-1.5 rounded-lg border border-amber-200 bg-amber-50/50 hover:bg-amber-100 text-amber-800 cursor-pointer shadow-2xs"
                            title={language === 'bn' ? 'ভাউচার প্রিন্ট করুন' : 'Print Voucher'}
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => openEditExpenseModal(exp)}
                            className="p-1.5 rounded-lg border border-blue-200 bg-blue-50/50 hover:bg-blue-100 text-blue-700 cursor-pointer shadow-2xs"
                            title={language === 'bn' ? 'মেমো সম্পাদনা করুন' : 'Edit Expense'}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => setDeletingExpense(exp)}
                            className="p-1.5 rounded-lg border border-rose-200 bg-rose-50/50 hover:bg-rose-100 text-rose-700 cursor-pointer shadow-2xs"
                            title={language === 'bn' ? 'মেমো মুছে ফেলুন' : 'Delete Expense'}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {!filteredExpenses.length && (
                <div className="p-8 text-center text-stone-400 text-xs">
                  No expense records found. Click "Add Expense" to record a new business expense memo.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* SECTION 3: CASH & ACCOUNTS LEDGER */}
      {/* ============================================================== */}
      {activeSection === 'transactions' && (
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
                    <th className="py-3 px-4 text-center">Actions</th>
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
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => setPrintTransaction(tx)}
                              className="p-1.5 rounded-lg border border-amber-200 bg-amber-50/50 hover:bg-amber-100 text-amber-800 cursor-pointer shadow-2xs"
                              title={language === 'bn' ? 'রসিদ প্রিন্ট করুন' : 'Print Receipt'}
                            >
                              <Printer className="w-3.5 h-3.5" />
                            </button>

                            <button
                              onClick={() => openEditTxModal(tx)}
                              className="p-1.5 rounded-lg border border-blue-200 bg-blue-50/50 hover:bg-blue-100 text-blue-700 cursor-pointer shadow-2xs"
                              title={language === 'bn' ? 'লেনদেন সম্পাদনা করুন' : 'Edit Transaction'}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>

                            <button
                              onClick={() => setDeletingTransaction(tx)}
                              className="p-1.5 rounded-lg border border-rose-200 bg-rose-50/50 hover:bg-rose-100 text-rose-700 cursor-pointer shadow-2xs"
                              title={language === 'bn' ? 'লেনদেন মুছে ফেলুন' : 'Delete Transaction'}
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

              {!filteredTransactions.length && (
                <div className="p-8 text-center text-stone-400 text-xs">
                  No financial transactions recorded yet. Use the Cash In or Cash Out buttons above to add entries.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

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

      {/* ------------------------------------------------------------- */}
      {/* ADD EXPENSE MODAL */}
      {/* ------------------------------------------------------------- */}
      {showAddExpenseModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-stone-200">
            <div className="flex items-center justify-between border-b border-stone-200 pb-3">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-rose-700" />
                <h3 className="font-serif text-lg font-bold text-stone-900">
                  {language === 'bn' ? 'নতুন খরচ মেমো এন্ট্রি' : 'New Expense Memo'}
                </h3>
              </div>
              <button
                onClick={() => setShowAddExpenseModal(false)}
                className="p-1.5 rounded-full hover:bg-stone-100 text-stone-500 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveExpense} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-stone-700 mb-1">
                    {language === 'bn' ? 'খরচের ক্যাটাগরি *' : 'Category *'}
                  </label>
                  <select
                    value={expenseForm.category}
                    onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-stone-300 focus:border-rose-600 outline-none bg-white font-medium"
                  >
                    <option value="Shop Rent">Shop Rent</option>
                    <option value="Utility Bills">Utility Bills</option>
                    <option value="Salaries & Wages">Salaries & Wages</option>
                    <option value="Packaging Materials">Packaging Materials</option>
                    <option value="Delivery & Courier">Delivery & Courier</option>
                    <option value="Marketing & Ads">Marketing & Facebook Ads</option>
                    <option value="Tea & Entertainment">Tea & Entertainment</option>
                    <option value="Software & Tools">Software & Tools</option>
                    <option value="Repair & Maintenance">Repair & Maintenance</option>
                    <option value="Other">Other Expenses</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-stone-700 mb-1">
                    {language === 'bn' ? 'তারিখ *' : 'Date *'}
                  </label>
                  <input
                    type="date"
                    required
                    value={expenseForm.expenseDate}
                    onChange={(e) => setExpenseForm({ ...expenseForm, expenseDate: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-stone-300 focus:border-rose-600 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-stone-700 mb-1">
                  {language === 'bn' ? 'খরচের পরিমাণ (Amount in ৳) *' : 'Amount in BDT (৳) *'}
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  value={expenseForm.amount || ''}
                  onChange={(e) => setExpenseForm({ ...expenseForm, amount: Number(e.target.value) })}
                  placeholder="0.00"
                  className="w-full p-3 rounded-xl border border-stone-300 focus:border-rose-600 outline-none font-bold text-base"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-stone-700 mb-1">
                    {language === 'bn' ? 'পেমেন্ট মেথড *' : 'Payment Method *'}
                  </label>
                  <select
                    value={expenseForm.paymentMethod}
                    onChange={(e) => setExpenseForm({ ...expenseForm, paymentMethod: e.target.value as any })}
                    className="w-full p-2.5 rounded-xl border border-stone-300 focus:border-rose-600 outline-none bg-white font-medium"
                  >
                    <option value="CASH">CASH (Deducts Cash in Hand)</option>
                    <option value="BKASH">BKASH</option>
                    <option value="NAGAD">NAGAD</option>
                    <option value="ROCKET">ROCKET</option>
                    <option value="BANK">BANK</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-stone-700 mb-1">
                    {language === 'bn' ? 'সংক্ষিপ্ত বিবরণ' : 'Description'}
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. March Office Rent"
                    value={expenseForm.description}
                    onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-stone-300 focus:border-rose-600 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-stone-700 mb-1">
                  {language === 'bn' ? 'নোট / ভাউচার রেফারেন্স' : 'Notes / Voucher Ref'}
                </label>
                <textarea
                  rows={2}
                  placeholder="Additional voucher notes..."
                  value={expenseForm.notes}
                  onChange={(e) => setExpenseForm({ ...expenseForm, notes: e.target.value })}
                  className="w-full p-2.5 rounded-xl border border-stone-300 focus:border-rose-600 outline-none resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-stone-200">
                <button
                  type="button"
                  onClick={() => setShowAddExpenseModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-stone-300 hover:bg-stone-50 text-stone-700 font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={expenseSaving}
                  className="px-5 py-2.5 rounded-xl bg-rose-700 hover:bg-rose-800 text-white font-bold disabled:opacity-50 cursor-pointer shadow-md"
                >
                  {expenseSaving ? 'Saving...' : 'Save Expense Memo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* EDIT EXPENSE MODAL */}
      {/* ------------------------------------------------------------- */}
      {editingExpense && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-stone-200">
            <div className="flex items-center justify-between border-b border-stone-200 pb-3">
              <div className="flex items-center gap-2">
                <Pencil className="w-5 h-5 text-blue-700" />
                <h3 className="font-serif text-lg font-bold text-stone-900">
                  {language === 'bn' ? 'খরচের মেমো সম্পাদনা (Edit Memo)' : 'Edit Expense Memo'}
                </h3>
              </div>
              <button
                onClick={() => setEditingExpense(null)}
                className="p-1.5 rounded-full hover:bg-stone-100 text-stone-500 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 text-xs flex justify-between">
              <span className="text-stone-500 font-medium">Memo ID:</span>
              <span className="font-mono font-bold text-stone-900">{editingExpense.expenseId || editingExpense.id}</span>
            </div>

            <form onSubmit={handleUpdateExpense} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-stone-700 mb-1">Category *</label>
                  <select
                    value={editExpenseForm.category}
                    onChange={(e) => setEditExpenseForm({ ...editExpenseForm, category: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-stone-300 focus:border-blue-600 outline-none bg-white font-medium"
                  >
                    <option value="Shop Rent">Shop Rent</option>
                    <option value="Utility Bills">Utility Bills</option>
                    <option value="Salaries & Wages">Salaries & Wages</option>
                    <option value="Packaging Materials">Packaging Materials</option>
                    <option value="Delivery & Courier">Delivery & Courier</option>
                    <option value="Marketing & Ads">Marketing & Facebook Ads</option>
                    <option value="Tea & Entertainment">Tea & Entertainment</option>
                    <option value="Software & Tools">Software & Tools</option>
                    <option value="Repair & Maintenance">Repair & Maintenance</option>
                    <option value="Other">Other Expenses</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-stone-700 mb-1">Date *</label>
                  <input
                    type="date"
                    required
                    value={editExpenseForm.expenseDate}
                    onChange={(e) => setEditExpenseForm({ ...editExpenseForm, expenseDate: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-stone-300 focus:border-blue-600 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-stone-700 mb-1">Amount (৳) *</label>
                <input
                  type="number"
                  min="1"
                  required
                  value={editExpenseForm.amount || ''}
                  onChange={(e) => setEditExpenseForm({ ...editExpenseForm, amount: Number(e.target.value) })}
                  className="w-full p-3 rounded-xl border border-stone-300 focus:border-blue-600 outline-none font-bold text-base"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-stone-700 mb-1">Payment Method *</label>
                  <select
                    value={editExpenseForm.paymentMethod}
                    onChange={(e) => setEditExpenseForm({ ...editExpenseForm, paymentMethod: e.target.value as any })}
                    className="w-full p-2.5 rounded-xl border border-stone-300 focus:border-blue-600 outline-none bg-white font-medium"
                  >
                    <option value="CASH">CASH (Deducts Cash in Hand)</option>
                    <option value="BKASH">BKASH</option>
                    <option value="NAGAD">NAGAD</option>
                    <option value="ROCKET">ROCKET</option>
                    <option value="BANK">BANK</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-stone-700 mb-1">Description</label>
                  <input
                    type="text"
                    value={editExpenseForm.description}
                    onChange={(e) => setEditExpenseForm({ ...editExpenseForm, description: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-stone-300 focus:border-blue-600 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-stone-700 mb-1">Notes / Voucher Reference</label>
                <textarea
                  rows={2}
                  value={editExpenseForm.notes}
                  onChange={(e) => setEditExpenseForm({ ...editExpenseForm, notes: e.target.value })}
                  className="w-full p-2.5 rounded-xl border border-stone-300 focus:border-blue-600 outline-none resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-stone-200">
                <button
                  type="button"
                  onClick={() => setEditingExpense(null)}
                  className="px-4 py-2.5 rounded-xl border border-stone-300 hover:bg-stone-50 text-stone-700 font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editExpenseSaving}
                  className="px-5 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white font-bold disabled:opacity-50 cursor-pointer shadow-md"
                >
                  {editExpenseSaving ? 'Saving...' : 'Update Expense Memo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* DELETE EXPENSE CONFIRMATION MODAL */}
      {/* ------------------------------------------------------------- */}
      {deletingExpense && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-stone-200">
            <div className="flex items-center gap-3 text-rose-700">
              <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-serif text-lg font-bold text-stone-900">
                  {language === 'bn' ? 'খরচের মেমো মুছে ফেলতে চান?' : 'Delete Expense Memo?'}
                </h3>
                <p className="text-xs text-stone-500">Memo #{deletingExpense.expenseId || deletingExpense.id}</p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-rose-50/50 border border-rose-200 text-xs space-y-2 text-stone-700">
              <p>
                {language === 'bn'
                  ? 'এই মেমোটি মুছে ফেললে খরচ বাবদ খরচ হওয়া টাকা স্বয়ংক্রিয়ভাবে ক্যাশ ইন হ্যান্ড বা ডিজিটাল ব্যালেন্সে ফেরত যোগ (Rollback) হবে।'
                  : 'Deleting this expense will restore the spent amount back into your physical cash or payment account balance.'}
              </p>
              <div className="border-t border-rose-200/60 pt-2 flex justify-between font-bold">
                <span>Expense Amount:</span>
                <span className="font-mono text-rose-800">{money(deletingExpense.amount)}</span>
              </div>
              <div className="flex justify-between text-stone-600">
                <span>Category:</span>
                <span>{deletingExpense.category}</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={deletingExpenseLoading}
                onClick={() => setDeletingExpense(null)}
                className="px-4 py-2.5 rounded-xl border border-stone-300 hover:bg-stone-50 text-stone-700 font-bold text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deletingExpenseLoading}
                onClick={handleDeleteExpense}
                className="px-5 py-2.5 rounded-xl bg-rose-700 hover:bg-rose-800 text-white font-bold text-xs flex items-center gap-1.5 shadow-md cursor-pointer disabled:opacity-50"
              >
                {deletingExpenseLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                <span>{language === 'bn' ? 'হ্যাঁ, মুছে ফেলুন' : 'Confirm Delete'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* VIEW EXPENSE MODAL */}
      {/* ------------------------------------------------------------- */}
      {viewingExpense && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-stone-200 text-xs">
            <div className="flex items-center justify-between border-b border-stone-200 pb-3">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-rose-700" />
                <h3 className="font-serif text-lg font-bold text-stone-900">
                  Expense Memo Details
                </h3>
              </div>
              <button
                onClick={() => setViewingExpense(null)}
                className="p-1.5 rounded-full hover:bg-stone-100 text-stone-500 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between py-1 border-b border-stone-100">
                <span className="text-stone-500">Memo Number:</span>
                <span className="font-mono font-bold text-stone-900">{viewingExpense.expenseId || viewingExpense.id}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-stone-100">
                <span className="text-stone-500">Date:</span>
                <span className="font-medium text-stone-900">{viewingExpense.expenseDate}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-stone-100">
                <span className="text-stone-500">Category:</span>
                <span className="font-bold text-stone-900">{viewingExpense.category}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-stone-100">
                <span className="text-stone-500">Payment Account:</span>
                <span className="font-mono font-semibold text-stone-900">{viewingExpense.paymentMethod || 'CASH'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-stone-100 font-bold text-sm">
                <span className="text-stone-700">Amount Spent:</span>
                <span className="font-mono text-rose-700">{money(viewingExpense.amount)}</span>
              </div>
              <div className="py-1 border-b border-stone-100">
                <span className="text-stone-500 block mb-0.5">Description:</span>
                <span className="text-stone-800">{viewingExpense.description || '-'}</span>
              </div>
              {viewingExpense.notes && (
                <div className="py-1">
                  <span className="text-stone-500 block mb-0.5">Voucher Notes:</span>
                  <span className="text-stone-600 italic">{viewingExpense.notes}</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-200">
              <button
                onClick={() => {
                  const exp = viewingExpense;
                  setViewingExpense(null);
                  setPrintExpense(exp);
                }}
                className="px-4 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 font-bold flex items-center gap-1 cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Voucher</span>
              </button>
              <button
                onClick={() => setViewingExpense(null)}
                className="px-4 py-2 rounded-xl bg-stone-900 text-white font-bold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* PRINT EXPENSE VOUCHER MODAL */}
      {/* ------------------------------------------------------------- */}
      {printExpense && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 space-y-5 shadow-2xl border border-stone-200 my-8">
            <div className="flex items-center justify-between border-b border-stone-200 pb-3">
              <div className="flex items-center gap-2">
                <Printer className="w-5 h-5 text-amber-700" />
                <h3 className="font-serif text-lg font-bold text-stone-900">
                  {language === 'bn' ? 'খরচের ভাউচার প্রিন্ট' : 'Print Expense Voucher'}
                </h3>
              </div>
              <button
                onClick={() => setPrintExpense(null)}
                className="p-1.5 rounded-full hover:bg-stone-100 text-stone-500 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Printable Voucher Paper */}
            <div id="expense-voucher-print-area" className="p-6 bg-white border border-stone-300 rounded-2xl space-y-4 text-stone-900">
              <div className="text-center border-b border-stone-300 pb-3">
                <h2 className="font-serif text-xl font-bold tracking-tight">MINARUL FASHION</h2>
                <p className="text-[11px] text-stone-600">Official Payment & Expense Debit Voucher</p>
                <div className="inline-block mt-1 px-3 py-0.5 rounded-full bg-stone-100 text-[10px] font-bold tracking-wider uppercase">
                  DEBIT VOUCHER
                </div>
              </div>

              <div className="flex justify-between text-xs pt-1">
                <div>
                  <span className="text-stone-500 block text-[10px] uppercase font-bold">Voucher ID:</span>
                  <span className="font-mono font-bold text-stone-900">{printExpense.expenseId || printExpense.id}</span>
                </div>
                <div className="text-right">
                  <span className="text-stone-500 block text-[10px] uppercase font-bold">Date:</span>
                  <span className="font-medium text-stone-900">{printExpense.expenseDate}</span>
                </div>
              </div>

              <div className="border border-stone-200 rounded-xl overflow-hidden text-xs">
                <div className="bg-stone-50 p-2.5 font-bold uppercase text-[10px] text-stone-600 border-b border-stone-200">
                  Expense Particulars
                </div>
                <div className="p-3 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-stone-600">Account Category:</span>
                    <span className="font-bold text-stone-900">{printExpense.category}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-stone-600">Paid Through:</span>
                    <span className="font-mono font-bold text-stone-900">{printExpense.paymentMethod || 'CASH'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-stone-600">Description:</span>
                    <span className="text-stone-800">{printExpense.description || '-'}</span>
                  </div>
                  {printExpense.notes && (
                    <div className="flex justify-between">
                      <span className="text-stone-600">Notes / Reference:</span>
                      <span className="text-stone-700 italic">{printExpense.notes}</span>
                    </div>
                  )}
                </div>
                <div className="bg-stone-100 p-3 flex justify-between items-center border-t border-stone-200 font-bold text-sm">
                  <span>Total Debit Amount:</span>
                  <span className="font-mono text-base text-rose-800">{money(printExpense.amount)}</span>
                </div>
              </div>

              <div className="pt-8 grid grid-cols-2 gap-8 text-center text-[10px] text-stone-600">
                <div className="border-t border-stone-400 pt-1">
                  <span>Prepared By</span>
                </div>
                <div className="border-t border-stone-400 pt-1">
                  <span>Authorized Signature</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setPrintExpense(null)}
                className="px-4 py-2.5 rounded-xl border border-stone-300 hover:bg-stone-50 text-stone-700 font-bold text-xs cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => printSection(`Expense Voucher ${printExpense.expenseId}`, 'expense-voucher-print-area')}
                className="px-5 py-2.5 rounded-xl bg-amber-700 hover:bg-amber-800 text-white font-bold text-xs flex items-center gap-1.5 shadow-md cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Document</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* EDIT CASH TRANSACTION MODAL */}
      {/* ------------------------------------------------------------- */}
      {editingTransaction && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-stone-200 text-xs">
            <div className="flex items-center justify-between border-b border-stone-200 pb-3">
              <div className="flex items-center gap-2">
                <Pencil className="w-5 h-5 text-blue-700" />
                <h3 className="font-serif text-lg font-bold text-stone-900">
                  {language === 'bn' ? 'লেনদেন রেকর্ড সম্পাদনা' : 'Edit Cash Transaction'}
                </h3>
              </div>
              <button
                onClick={() => setEditingTransaction(null)}
                className="p-1.5 rounded-full hover:bg-stone-100 text-stone-500 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 flex justify-between items-center">
              <span className="text-stone-500 font-medium">Tx ID:</span>
              <span className="font-mono font-bold text-stone-900">{editingTransaction.transactionId}</span>
            </div>

            <form onSubmit={handleUpdateTransaction} className="space-y-3.5">
              <div>
                <label className="block font-bold text-stone-700 mb-1">Amount (৳) *</label>
                <input
                  type="number"
                  min="1"
                  required
                  value={editTxAmount || ''}
                  onChange={(e) => setEditTxAmount(Number(e.target.value))}
                  className="w-full p-3 rounded-xl border border-stone-300 focus:border-blue-600 outline-none font-bold text-base"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-stone-700 mb-1">Account / Method *</label>
                  <select
                    value={editTxMethod}
                    onChange={(e) => setEditTxMethod(e.target.value as any)}
                    className="w-full p-2.5 rounded-xl border border-stone-300 focus:border-blue-600 outline-none bg-white font-medium"
                  >
                    <option value="CASH">CASH (Physical Cash)</option>
                    <option value="BKASH">BKASH</option>
                    <option value="NAGAD">NAGAD</option>
                    <option value="ROCKET">ROCKET</option>
                    <option value="BANK">BANK</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-stone-700 mb-1">Category *</label>
                  <select
                    value={editTxCategory}
                    onChange={(e) => setEditTxCategory(e.target.value as any)}
                    className="w-full p-2.5 rounded-xl border border-stone-300 focus:border-blue-600 outline-none bg-white font-medium"
                  >
                    <option value="COD_SALE">COD Sale</option>
                    <option value="CUSTOMER_PAYMENT">Customer Payment</option>
                    <option value="SUPPLIER_PAYMENT">Supplier Payment</option>
                    <option value="EXPENSE">Expense</option>
                    <option value="OTHER_INCOME">Other Income</option>
                    <option value="OWNER_WITHDRAWAL">Owner Withdrawal</option>
                    <option value="OPENING_BALANCE">Opening Balance</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-stone-700 mb-1">Description</label>
                <textarea
                  rows={2}
                  value={editTxDesc}
                  onChange={(e) => setEditTxDesc(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-stone-300 focus:border-blue-600 outline-none resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-stone-200">
                <button
                  type="button"
                  onClick={() => setEditingTransaction(null)}
                  className="px-4 py-2.5 rounded-xl border border-stone-300 hover:bg-stone-50 text-stone-700 font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editTxSaving}
                  className="px-5 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white font-bold disabled:opacity-50 cursor-pointer shadow-md"
                >
                  {editTxSaving ? 'Saving...' : 'Update Transaction'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* DELETE CASH TRANSACTION MODAL */}
      {/* ------------------------------------------------------------- */}
      {deletingTransaction && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-stone-200">
            <div className="flex items-center gap-3 text-rose-700">
              <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-serif text-lg font-bold text-stone-900">
                  {language === 'bn' ? 'লেনদেন রেকর্ড মুছে ফেলতে চান?' : 'Delete Transaction Record?'}
                </h3>
                <p className="text-xs text-stone-500">Tx #{deletingTransaction.transactionId}</p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-rose-50/50 border border-rose-200 text-xs space-y-2 text-stone-700">
              <p>
                {language === 'bn'
                  ? 'এই ট্রানজাকশনটি মুছে ফেললে একাউন্টস লেজার থেকে এটি স্থায়ীভাবে বাতিল হবে এবং ব্যালেন্স স্বয়ংক্রিয়ভাবে সমন্বয় হবে।'
                  : 'Permanently remove this transaction record from financial accounts. Live balances will automatically recalculate.'}
              </p>
              <div className="border-t border-rose-200/60 pt-2 flex justify-between font-bold">
                <span>Amount:</span>
                <span className="font-mono text-rose-800">{money(deletingTransaction.amount)}</span>
              </div>
              <div className="flex justify-between text-stone-600">
                <span>Type:</span>
                <span className="font-semibold">{deletingTransaction.type}</span>
              </div>
              <div className="flex justify-between text-stone-600">
                <span>Account:</span>
                <span className="font-mono">{deletingTransaction.paymentMethod}</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={deletingTxLoading}
                onClick={() => setDeletingTransaction(null)}
                className="px-4 py-2.5 rounded-xl border border-stone-300 hover:bg-stone-50 text-stone-700 font-bold text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deletingTxLoading}
                onClick={handleDeleteTransaction}
                className="px-5 py-2.5 rounded-xl bg-rose-700 hover:bg-rose-800 text-white font-bold text-xs flex items-center gap-1.5 shadow-md cursor-pointer disabled:opacity-50"
              >
                {deletingTxLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                <span>{language === 'bn' ? 'হ্যাঁ, মুছে ফেলুন' : 'Confirm Delete'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* PRINT CASH TRANSACTION VOUCHER MODAL */}
      {/* ------------------------------------------------------------- */}
      {printTransaction && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 space-y-5 shadow-2xl border border-stone-200 my-8">
            <div className="flex items-center justify-between border-b border-stone-200 pb-3">
              <div className="flex items-center gap-2">
                <Printer className="w-5 h-5 text-amber-700" />
                <h3 className="font-serif text-lg font-bold text-stone-900">
                  {language === 'bn' ? 'লেনদেন রসিদ প্রিন্ট' : 'Print Transaction Receipt'}
                </h3>
              </div>
              <button
                onClick={() => setPrintTransaction(null)}
                className="p-1.5 rounded-full hover:bg-stone-100 text-stone-500 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Printable Receipt Paper */}
            <div id="tx-receipt-print-area" className="p-6 bg-white border border-stone-300 rounded-2xl space-y-4 text-stone-900">
              <div className="text-center border-b border-stone-300 pb-3">
                <h2 className="font-serif text-xl font-bold tracking-tight">MINARUL FASHION</h2>
                <p className="text-[11px] text-stone-600">Financial Ledger Transaction Voucher</p>
                <div className={`inline-block mt-1 px-3 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase ${
                  printTransaction.type === 'CASH_IN' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                }`}>
                  {printTransaction.type === 'CASH_IN' ? 'CREDIT / CASH-IN VOUCHER' : 'DEBIT / CASH-OUT VOUCHER'}
                </div>
              </div>

              <div className="flex justify-between text-xs pt-1">
                <div>
                  <span className="text-stone-500 block text-[10px] uppercase font-bold">Transaction ID:</span>
                  <span className="font-mono font-bold text-stone-900">{printTransaction.transactionId}</span>
                </div>
                <div className="text-right">
                  <span className="text-stone-500 block text-[10px] uppercase font-bold">Category:</span>
                  <span className="font-semibold text-stone-900">{printTransaction.category}</span>
                </div>
              </div>

              <div className="border border-stone-200 rounded-xl overflow-hidden text-xs">
                <div className="p-3 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-stone-600">Payment Account:</span>
                    <span className="font-mono font-bold text-stone-900">{printTransaction.paymentMethod}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-stone-600">Description:</span>
                    <span className="text-stone-800">{printTransaction.description || '-'}</span>
                  </div>
                  {printTransaction.referenceId && (
                    <div className="flex justify-between">
                      <span className="text-stone-600">Reference / Voucher ID:</span>
                      <span className="font-mono text-stone-700">{printTransaction.referenceId}</span>
                    </div>
                  )}
                </div>
                <div className="bg-stone-100 p-3 flex justify-between items-center border-t border-stone-200 font-bold text-sm">
                  <span>Transaction Amount:</span>
                  <span className={`font-mono text-base ${printTransaction.type === 'CASH_IN' ? 'text-emerald-800' : 'text-rose-800'}`}>
                    {printTransaction.type === 'CASH_IN' ? '+' : '-'}{money(printTransaction.amount)}
                  </span>
                </div>
              </div>

              <div className="pt-8 grid grid-cols-2 gap-8 text-center text-[10px] text-stone-600">
                <div className="border-t border-stone-400 pt-1">
                  <span>Cashier / Operator</span>
                </div>
                <div className="border-t border-stone-400 pt-1">
                  <span>Approved By</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setPrintTransaction(null)}
                className="px-4 py-2.5 rounded-xl border border-stone-300 hover:bg-stone-50 text-stone-700 font-bold text-xs cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => printSection(`Tx Receipt ${printTransaction.transactionId}`, 'tx-receipt-print-area')}
                className="px-5 py-2.5 rounded-xl bg-amber-700 hover:bg-amber-800 text-white font-bold text-xs flex items-center gap-1.5 shadow-md cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Document</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
