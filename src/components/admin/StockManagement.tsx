import React, { useState, useMemo, useEffect } from 'react';
import {
  Boxes,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  History,
  Sliders,
  Search,
  Filter,
  Download,
  Printer,
  RefreshCw,
  Plus,
  Minus,
  CheckCircle2,
  X,
  ArrowRight,
  Package,
  Layers,
  Sparkles,
} from 'lucide-react';
import { Product, StockMovement, StockAdjustment, StockMovementType, Order } from '../../types';
import { businessService } from '../../services/businessService';
import { exportToCSV, printSection } from '../../utils/exportUtils';
import { useLanguage } from '../../context/LanguageContext';

interface StockManagementProps {
  products: Product[];
  orders: Order[];
  onToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
  onRefreshProducts?: () => void;
}

const money = (n: number) => `৳${Number(n || 0).toLocaleString('en-BD', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const StockManagement: React.FC<StockManagementProps> = ({
  products,
  orders,
  onToast,
  onRefreshProducts,
}) => {
  const { language } = useLanguage();
  const [activeTab, setActiveTab] = useState<'overview' | 'movements' | 'valuation'>('overview');
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [adjustments, setAdjustments] = useState<StockAdjustment[]>([]);
  const [loading, setLoading] = useState(false);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'in_stock' | 'low_stock' | 'out_of_stock'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [movementTypeFilter, setMovementTypeFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('');

  // Stock Adjustment Modal
  const [showAdjModal, setShowAdjModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [adjType, setAdjType] = useState<
    'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT' | 'DAMAGE' | 'LOST' | 'MANUAL_CORRECTION'
  >('ADJUSTMENT_IN');
  const [adjQuantity, setAdjQuantity] = useState<number>(1);
  const [adjReason, setAdjReason] = useState<string>('');
  const [adjNote, setAdjNote] = useState<string>('');
  const [adjConfirmed, setAdjConfirmed] = useState(false);
  const [adjSaving, setAdjSaving] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [mList, aList] = await Promise.all([
        businessService.getStockMovements(),
        businessService.getStockAdjustments(),
      ]);
      setMovements(mList);
      setAdjustments(aList);
    } catch (e: any) {
      console.error('Error loading stock movements:', e);
      onToast(e?.message || 'Failed to load stock history', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Calculate reserved stock from pending or packaging orders
  const reservedStockMap = useMemo(() => {
    const map: Record<string, number> = {};
    const pendingOrders = orders.filter((o) => ['pending', 'packaging'].includes(o.orderStatus));
    for (const ord of pendingOrders) {
      for (const item of ord.items || []) {
        map[item.productId] = (map[item.productId] || 0) + (Number(item.quantity) || 1);
      }
    }
    return map;
  }, [orders]);

  // Today's stock movements
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayMovements = useMemo(() => {
    return movements.filter((m) => {
      const mDate = m.createdAt?.toDate
        ? m.createdAt.toDate().toISOString().slice(0, 10)
        : typeof m.createdAt === 'string'
        ? m.createdAt.slice(0, 10)
        : '';
      return mDate === todayStr;
    });
  }, [movements, todayStr]);

  const stockInToday = useMemo(() => {
    return todayMovements
      .filter((m) => Number(m.quantity) > 0)
      .reduce((sum, m) => sum + Number(m.quantity), 0);
  }, [todayMovements]);

  const stockOutToday = useMemo(() => {
    return todayMovements
      .filter((m) => Number(m.quantity) < 0)
      .reduce((sum, m) => sum + Math.abs(Number(m.quantity)), 0);
  }, [todayMovements]);

  const stockAdjustmentToday = useMemo(() => {
    return todayMovements
      .filter((m) => String(m.type).startsWith('ADJUSTMENT') || m.referenceType === 'adjustment')
      .reduce((sum, m) => sum + Math.abs(Number(m.quantity)), 0);
  }, [todayMovements]);

  // Inventory Metrics
  const totalStockUnits = useMemo(() => {
    return products.reduce((sum, p) => sum + Number(p.stockQuantity ?? p.stock ?? 0), 0);
  }, [products]);

  const totalStockCostValue = useMemo(() => {
    return products.reduce(
      (sum, p) =>
        sum +
        Number(p.stockQuantity ?? p.stock ?? 0) *
        Number(p.purchasePrice != null ? p.purchasePrice : (p.price || 0) * 0.7),
      0
    );
  }, [products]);

  const totalStockSellingValue = useMemo(() => {
    return products.reduce(
      (sum, p) => sum + Number(p.stockQuantity ?? p.stock ?? 0) * Number(p.price || 0),
      0
    );
  }, [products]);

  const potentialGrossProfit = totalStockSellingValue - totalStockCostValue;

  const lowStockProducts = useMemo(() => {
    return products.filter((p) => {
      const qty = Number(p.stockQuantity ?? p.stock ?? 0);
      const threshold = Number(p.minimumStock ?? 5);
      return qty > 0 && qty <= threshold;
    });
  }, [products]);

  const outOfStockProducts = useMemo(() => {
    return products.filter((p) => Number(p.stockQuantity ?? p.stock ?? 0) <= 0);
  }, [products]);

  // Filtered Products Table
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !q ||
        p.id.toLowerCase().includes(q) ||
        (p.titleEn && p.titleEn.toLowerCase().includes(q)) ||
        (p.titleBn && p.titleBn.toLowerCase().includes(q)) ||
        (p.sku && p.sku.toLowerCase().includes(q));

      const matchesCategory = categoryFilter === 'all' || p.category === categoryFilter;

      const qty = Number(p.stockQuantity ?? p.stock ?? 0);
      const threshold = Number(p.minimumStock ?? 5);

      let matchesStatus = true;
      if (statusFilter === 'in_stock') matchesStatus = qty > threshold;
      if (statusFilter === 'low_stock') matchesStatus = qty > 0 && qty <= threshold;
      if (statusFilter === 'out_of_stock') matchesStatus = qty <= 0;

      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [products, searchQuery, categoryFilter, statusFilter]);

  // Filtered Movements Table
  const filteredMovements = useMemo(() => {
    return movements.filter((m) => {
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !q ||
        m.movementId.toLowerCase().includes(q) ||
        m.productId.toLowerCase().includes(q) ||
        (m.productName && m.productName.toLowerCase().includes(q)) ||
        (m.referenceId && m.referenceId.toLowerCase().includes(q));

      const matchesType = movementTypeFilter === 'all' || m.type === movementTypeFilter;

      let matchesDate = true;
      if (dateFilter) {
        const mDate = m.createdAt?.toDate
          ? m.createdAt.toDate().toISOString().slice(0, 10)
          : typeof m.createdAt === 'string'
          ? m.createdAt.slice(0, 10)
          : '';
        matchesDate = mDate === dateFilter;
      }

      return matchesSearch && matchesType && matchesDate;
    });
  }, [movements, searchQuery, movementTypeFilter, dateFilter]);

  // Handle Open Adjustment
  const openAdjustmentModal = (prod: Product) => {
    setSelectedProduct(prod);
    setAdjType('ADJUSTMENT_IN');
    setAdjQuantity(1);
    setAdjReason('');
    setAdjNote('');
    setAdjConfirmed(false);
    setShowAdjModal(true);
  };

  // Submit Stock Adjustment
  const handleSaveAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) return;
    if (!adjReason.trim()) {
      onToast(language === 'bn' ? 'অ্যাডজাস্টমেন্টের কারণ উল্লেখ করুন' : 'Please provide an adjustment reason', 'error');
      return;
    }
    if (!adjConfirmed) {
      onToast(language === 'bn' ? 'অনুগ্রহ করে নিশ্চিতকরণ বক্সে টিক দিন' : 'Please check confirmation box', 'error');
      return;
    }

    setAdjSaving(true);
    try {
      await businessService.createStockAdjustment({
        productId: selectedProduct.id,
        productName: selectedProduct.titleEn || selectedProduct.titleBn || '',
        sku: selectedProduct.sku,
        adjustmentType: adjType,
        quantity: Math.abs(Number(adjQuantity) || 1),
        reason: adjReason.trim(),
        note: adjNote.trim(),
      });

      onToast(language === 'bn' ? 'স্টক সফলভাবে অ্যাডজাস্ট করা হয়েছে!' : 'Stock adjusted successfully!', 'success');
      setShowAdjModal(false);
      await loadData();
      if (onRefreshProducts) onRefreshProducts();
    } catch (err: any) {
      console.error('Stock adjustment error:', err);
      onToast(err?.message || 'Stock adjustment failed', 'error');
    } finally {
      setAdjSaving(false);
    }
  };

  // CSV Export
  const handleExportStockCSV = () => {
    const headers = [
      'Product ID',
      'Name',
      'SKU',
      'Category',
      'Current Stock',
      'Reserved Stock',
      'Available Stock',
      'Avg Cost (BDT)',
      'Selling Price (BDT)',
      'Stock Value (BDT)',
      'Status',
    ];
    const rows = filteredProducts.map((p) => {
      const cur = Number(p.stockQuantity ?? p.stock ?? 0);
      const res = reservedStockMap[p.id] || 0;
      const avail = Math.max(0, cur - res);
      const cost = Number(p.purchasePrice ?? 0);
      const val = cur * cost;
      const status = cur <= 0 ? 'OUT_OF_STOCK' : cur <= Number(p.minimumStock ?? 5) ? 'LOW_STOCK' : 'IN_STOCK';
      return [
        p.id,
        p.titleEn || p.titleBn,
        p.sku || '-',
        p.category,
        cur,
        res,
        avail,
        cost,
        p.price,
        val,
        status,
      ];
    });
    exportToCSV('minarul_inventory_stock', rows, headers);
  };

  const handleExportMovementsCSV = () => {
    const headers = [
      'Movement ID',
      'Date',
      'Product ID',
      'Product Name',
      'Type',
      'Quantity',
      'Previous Stock',
      'New Stock',
      'Unit Cost',
      'Total Value',
      'Reference',
      'Note',
    ];
    const rows = filteredMovements.map((m) => {
      const dStr = m.createdAt?.toDate
        ? m.createdAt.toDate().toLocaleString('en-BD')
        : typeof m.createdAt === 'string'
        ? m.createdAt
        : '-';
      return [
        m.movementId,
        dStr,
        m.productId,
        m.productName,
        m.type,
        m.quantity,
        m.previousStock,
        m.newStock,
        m.unitCost || 0,
        m.totalValue || 0,
        m.referenceId || '-',
        m.note || '-',
      ];
    });
    exportToCSV('minarul_stock_movements', rows, headers);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-stone-200">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-serif text-2xl font-bold text-stone-900">
              {language === 'bn' ? 'ইনভেন্টরি ও স্টক ব্যবস্থাপনা' : 'Stock & Inventory Management'}
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-stone-900 text-amber-300">
              LIVE ERP INVENTORY
            </span>
          </div>
          <p className="text-xs text-stone-500 mt-1">
            {language === 'bn'
              ? 'পণ্য তালিকা থেকে সম্পূর্ণ আলাদা স্টক পরিমাণ, গড় ক্রয়মূল্য, বিক্রয়মূল্য এবং স্টক ভ্যালুয়েশন'
              : 'Dedicated inventory ledger separate from catalog: quantity, average cost basis, valuation & audit trail'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => {
              if (products.length > 0) openAdjustmentModal(products[0]);
            }}
            className="px-4 py-2.5 rounded-xl bg-amber-700 hover:bg-amber-800 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
          >
            <Sliders className="w-4 h-4" />
            <span>{language === 'bn' ? 'স্টক অ্যাডজাস্টমেন্ট' : 'Stock Adjustment'}</span>
          </button>

          <button
            onClick={loadData}
            disabled={loading}
            className="px-3 py-2.5 rounded-xl border border-stone-300 bg-white hover:bg-stone-50 text-stone-700 text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{language === 'bn' ? 'রিফ্রেশ' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {/* KPI Dashboard Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-8 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-xs">
          <div className="flex items-center justify-between text-stone-500 text-[11px] mb-1">
            <span>Total Products</span>
            <Package className="w-4 h-4 text-stone-400" />
          </div>
          <div className="text-xl font-bold font-serif text-stone-900">{products.length}</div>
          <div className="text-[10px] text-stone-400">SKUs tracked</div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-xs">
          <div className="flex items-center justify-between text-stone-500 text-[11px] mb-1">
            <span>Stock Units</span>
            <Boxes className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-xl font-bold font-serif text-blue-700">{totalStockUnits} pcs</div>
          <div className="text-[10px] text-stone-400">Physical units</div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-xs col-span-2 sm:col-span-1 lg:col-span-2">
          <div className="flex items-center justify-between text-stone-500 text-[11px] mb-1">
            <span>Total Stock Cost Value</span>
            <Layers className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-xl font-bold font-serif text-emerald-800">{money(totalStockCostValue)}</div>
          <div className="text-[10px] text-emerald-600 font-semibold">Weighted cost basis</div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-xs col-span-2 sm:col-span-1 lg:col-span-2">
          <div className="flex items-center justify-between text-stone-500 text-[11px] mb-1">
            <span>Potential Selling Value</span>
            <TrendingUp className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-xl font-bold font-serif text-amber-800">{money(totalStockSellingValue)}</div>
          <div className="text-[10px] text-amber-700 font-semibold">
            Potential Profit: {money(potentialGrossProfit)}
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-xs">
          <div className="flex items-center justify-between text-stone-500 text-[11px] mb-1">
            <span>Low Stock</span>
            <AlertTriangle className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-xl font-bold font-serif text-amber-700">{lowStockProducts.length}</div>
          <div className="text-[10px] text-amber-600 font-semibold">Threshold alert</div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-xs">
          <div className="flex items-center justify-between text-stone-500 text-[11px] mb-1">
            <span>Out of Stock</span>
            <TrendingDown className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-xl font-bold font-serif text-rose-700">{outOfStockProducts.length}</div>
          <div className="text-[10px] text-rose-600 font-semibold">Immediate restock</div>
        </div>
      </div>

      {/* Today's Movement Flow Strip */}
      <div className="bg-stone-900 text-stone-100 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4 text-xs">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-400" />
          <span className="font-bold uppercase tracking-wider text-amber-300">
            {language === 'bn' ? 'আজকের স্টক ফ্লো' : "Today's Stock Activity"}
          </span>
          <span className="text-stone-400">({todayStr})</span>
        </div>
        <div className="flex items-center gap-6">
          <div>
            <span className="text-stone-400">Stock In Today: </span>
            <span className="font-bold text-emerald-400">+{stockInToday} pcs</span>
          </div>
          <div>
            <span className="text-stone-400">Stock Out Today: </span>
            <span className="font-bold text-rose-400">-{stockOutToday} pcs</span>
          </div>
          <div>
            <span className="text-stone-400">Adjustments Today: </span>
            <span className="font-bold text-amber-400">{stockAdjustmentToday} pcs</span>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 pb-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'overview'
                ? 'bg-amber-700 text-white shadow-xs'
                : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-50'
            }`}
          >
            <Boxes className="inline w-3.5 h-3.5 mr-1" />
            {language === 'bn' ? 'স্টক ওভারভিউ (পণ্যভিত্তিক)' : 'Stock Overview'} ({products.length})
          </button>

          <button
            onClick={() => setActiveTab('movements')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'movements'
                ? 'bg-amber-700 text-white shadow-xs'
                : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-50'
            }`}
          >
            <History className="inline w-3.5 h-3.5 mr-1" />
            {language === 'bn' ? 'স্টক মুভমেন্ট হিস্ট্রি' : 'Stock Movements'} ({movements.length})
          </button>

          <button
            onClick={() => setActiveTab('valuation')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'valuation'
                ? 'bg-amber-700 text-white shadow-xs'
                : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-50'
            }`}
          >
            <Layers className="inline w-3.5 h-3.5 mr-1" />
            {language === 'bn' ? 'ইনভেন্টরি ভ্যালুয়েশন' : 'Inventory Valuation'}
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={activeTab === 'movements' ? handleExportMovementsCSV : handleExportStockCSV}
            className="px-3 py-1.5 rounded-lg border border-stone-300 bg-white hover:bg-stone-50 text-stone-700 text-xs font-semibold flex items-center gap-1 shadow-2xs cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>CSV</span>
          </button>

          <button
            onClick={() => printSection('Stock & Inventory Report', 'stock-print-area')}
            className="px-3 py-1.5 rounded-lg border border-stone-300 bg-white hover:bg-stone-50 text-stone-700 text-xs font-semibold flex items-center gap-1 shadow-2xs cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print</span>
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* TAB 1: STOCK OVERVIEW TABLE */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          {/* Controls Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-stone-200">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder={language === 'bn' ? 'পণ্য নাম, আইডি বা SKU দিয়ে সার্চ করুন...' : 'Search by product name, ID or SKU...'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full text-xs pl-9 pr-3 py-2 rounded-xl border border-stone-200 focus:border-amber-600 outline-none"
              />
            </div>

            <div className="flex items-center gap-2">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="text-xs px-3 py-2 rounded-xl border border-stone-200 bg-white outline-none cursor-pointer"
              >
                <option value="all">All Stock Statuses</option>
                <option value="in_stock">IN STOCK</option>
                <option value="low_stock">LOW STOCK (&lt;= 5)</option>
                <option value="out_of_stock">OUT OF STOCK (0)</option>
              </select>

              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="text-xs px-3 py-2 rounded-xl border border-stone-200 bg-white outline-none cursor-pointer"
              >
                <option value="all">All Categories</option>
                <option value="men">Men's Apparel</option>
                <option value="women">Women's Apparel</option>
                <option value="children">Children</option>
                <option value="festive">Festive Luxury</option>
              </select>
            </div>
          </div>

          {/* Table */}
          <div id="stock-print-area" className="bg-white rounded-3xl border border-stone-200 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-stone-50 border-b border-stone-200 text-stone-600 font-bold uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Product Details</th>
                    <th className="py-3 px-3">SKU & Category</th>
                    <th className="py-3 px-3 text-center">Current Stock</th>
                    <th className="py-3 px-3 text-center">Reserved</th>
                    <th className="py-3 px-3 text-center">Available</th>
                    <th className="py-3 px-3 text-right">Avg Cost</th>
                    <th className="py-3 px-3 text-right">Selling Price</th>
                    <th className="py-3 px-3 text-right">Stock Value</th>
                    <th className="py-3 px-3 text-center">Status</th>
                    <th className="py-3 px-4 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {filteredProducts.map((p) => {
                    const currentStock = Number(p.stockQuantity ?? p.stock ?? 0);
                    const reservedStock = reservedStockMap[p.id] || 0;
                    const availableStock = Math.max(0, currentStock - reservedStock);
                    const avgCost = Number(p.purchasePrice ?? p.price * 0.7);
                    const stockValue = currentStock * avgCost;
                    const minThreshold = Number(p.minimumStock ?? 5);

                    const isOutOfStock = currentStock <= 0;
                    const isLowStock = currentStock > 0 && currentStock <= minThreshold;

                    return (
                      <tr key={p.id} className="hover:bg-stone-50/70 transition-colors">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <img
                              src={p.images?.[0] || 'https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?w=100'}
                              alt=""
                              className="w-10 h-10 object-cover rounded-lg border border-stone-200 shrink-0"
                            />
                            <div>
                              <div className="font-bold text-stone-900 leading-tight">
                                {p.titleEn || p.titleBn}
                              </div>
                              <div className="text-[10px] text-stone-400 font-mono">ID: {p.id}</div>
                            </div>
                          </div>
                        </td>

                        <td className="py-3 px-3 font-mono text-stone-600">
                          <div>{p.sku || '-'}</div>
                          <span className="text-[10px] text-stone-400 capitalize">{p.category}</span>
                        </td>

                        <td className="py-3 px-3 text-center font-bold text-stone-900 text-sm">
                          {currentStock}
                        </td>

                        <td className="py-3 px-3 text-center font-semibold text-amber-700">
                          {reservedStock > 0 ? reservedStock : '-'}
                        </td>

                        <td className="py-3 px-3 text-center font-bold text-blue-700 text-sm">
                          {availableStock}
                        </td>

                        <td className="py-3 px-3 text-right font-mono text-stone-600">
                          {money(avgCost)}
                        </td>

                        <td className="py-3 px-3 text-right font-mono font-bold text-stone-900">
                          {money(p.price)}
                        </td>

                        <td className="py-3 px-3 text-right font-mono font-bold text-emerald-800">
                          {money(stockValue)}
                        </td>

                        <td className="py-3 px-3 text-center">
                          {isOutOfStock ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                              <AlertTriangle className="w-2.5 h-2.5" /> OUT OF STOCK
                            </span>
                          ) : isLowStock ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                              <AlertTriangle className="w-2.5 h-2.5" /> LOW STOCK ({currentStock})
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                              <CheckCircle2 className="w-2.5 h-2.5" /> IN STOCK
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-4 text-center">
                          <button
                            onClick={() => openAdjustmentModal(p)}
                            className="px-2.5 py-1.5 rounded-lg bg-stone-100 hover:bg-amber-700 hover:text-white text-stone-700 text-[11px] font-bold transition-all flex items-center gap-1 mx-auto cursor-pointer shadow-2xs"
                            title="Adjust stock for this product"
                          >
                            <Sliders className="w-3 h-3" />
                            <span>Adjust</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {!filteredProducts.length && (
                <div className="p-8 text-center text-stone-400 text-xs">
                  No products found matching your search and filter criteria.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TAB 2: STOCK MOVEMENTS AUDIT TRAIL */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'movements' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-stone-200">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search movement ID, product or reference..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full text-xs pl-9 pr-3 py-2 rounded-xl border border-stone-200 focus:border-amber-600 outline-none"
              />
            </div>

            <div className="flex items-center gap-2">
              <select
                value={movementTypeFilter}
                onChange={(e) => setMovementTypeFilter(e.target.value)}
                className="text-xs px-3 py-2 rounded-xl border border-stone-200 bg-white outline-none cursor-pointer"
              >
                <option value="all">All Movement Types</option>
                <option value="PURCHASE">PURCHASE (+)</option>
                <option value="SALE">SALE (-)</option>
                <option value="SALE_RETURN">SALE RETURN (+)</option>
                <option value="PURCHASE_RETURN">PURCHASE RETURN (-)</option>
                <option value="ADJUSTMENT_IN">ADJUSTMENT IN (+)</option>
                <option value="ADJUSTMENT_OUT">ADJUSTMENT OUT (-)</option>
                <option value="DAMAGE">DAMAGE (-)</option>
                <option value="LOST">LOST (-)</option>
                <option value="MANUAL_CORRECTION">MANUAL CORRECTION</option>
              </select>

              <input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="text-xs px-3 py-2 rounded-xl border border-stone-200 bg-white outline-none cursor-pointer"
              />
            </div>
          </div>

          <div id="stock-print-area" className="bg-white rounded-3xl border border-stone-200 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-stone-50 border-b border-stone-200 text-stone-600 font-bold uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Movement ID</th>
                    <th className="py-3 px-3">Date & Time</th>
                    <th className="py-3 px-3">Product Name</th>
                    <th className="py-3 px-3 text-center">Type</th>
                    <th className="py-3 px-3 text-center">Quantity</th>
                    <th className="py-3 px-3 text-center">Stock Transition</th>
                    <th className="py-3 px-3 text-right">Unit Cost</th>
                    <th className="py-3 px-3 text-right">Total Value</th>
                    <th className="py-3 px-4">Reference & Note</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {filteredMovements.map((m) => {
                    const isPositive = Number(m.quantity) > 0;
                    const dateDisplay = m.createdAt?.toDate
                      ? m.createdAt.toDate().toLocaleString('en-BD')
                      : typeof m.createdAt === 'string'
                      ? m.createdAt
                      : '-';

                    return (
                      <tr key={m.movementId || m.id} className="hover:bg-stone-50/70 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-stone-800 text-[11px]">
                          {m.movementId}
                        </td>
                        <td className="py-3 px-3 text-stone-500 whitespace-nowrap text-[11px]">
                          {dateDisplay}
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-semibold text-stone-900">{m.productName || m.productId}</div>
                          <div className="text-[10px] text-stone-400 font-mono">ID: {m.productId}</div>
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              m.type === 'PURCHASE' || m.type === 'ADJUSTMENT_IN' || m.type === 'SALE_RETURN'
                                ? 'bg-emerald-100 text-emerald-800'
                                : m.type === 'SALE'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {m.type}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center font-bold text-sm">
                          <span className={isPositive ? 'text-emerald-700' : 'text-rose-700'}>
                            {isPositive ? `+${m.quantity}` : m.quantity}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center font-mono text-stone-600">
                          {m.previousStock} <ArrowRight className="inline w-3 h-3 text-stone-400 mx-1" />{' '}
                          <b className="text-stone-900">{m.newStock}</b>
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-stone-600">
                          {m.unitCost ? money(m.unitCost) : '-'}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-stone-900">
                          {m.totalValue ? money(m.totalValue) : '-'}
                        </td>
                        <td className="py-3 px-4 text-stone-500 text-[11px]">
                          <div>{m.referenceId ? `Ref: ${m.referenceId}` : '-'}</div>
                          <div className="italic text-stone-400">{m.note || ''}</div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {!filteredMovements.length && (
                <div className="p-8 text-center text-stone-400 text-xs">
                  No stock movements recorded yet. New purchases, sales, and adjustments will appear here.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TAB 3: INVENTORY VALUATION & MARGINS */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'valuation' && (
        <div className="bg-white p-6 rounded-3xl border border-stone-200 space-y-6">
          <div className="border-b border-stone-200 pb-4">
            <h3 className="font-serif text-xl font-bold text-stone-900">
              {language === 'bn' ? 'ইনভেন্টরি আর্থিক মূল্যায়ন (Valuation Analysis)' : 'Inventory Valuation Analysis'}
            </h3>
            <p className="text-xs text-stone-500 mt-1">
              Based on actual weighted-average purchase cost versus current catalog selling prices
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-5 rounded-2xl bg-stone-50 border border-stone-200 space-y-2">
              <span className="text-xs text-stone-500 uppercase tracking-wider font-bold">Total Stock Cost Value</span>
              <div className="text-2xl font-bold font-serif text-stone-950">{money(totalStockCostValue)}</div>
              <p className="text-[11px] text-stone-500">
                Amount spent acquiring all {totalStockUnits} unsold apparel items.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-amber-50/60 border border-amber-200 space-y-2">
              <span className="text-xs text-amber-800 uppercase tracking-wider font-bold">Total Stock Retail Value</span>
              <div className="text-2xl font-bold font-serif text-amber-900">{money(totalStockSellingValue)}</div>
              <p className="text-[11px] text-amber-700">
                Expected revenue if all current inventory is sold at regular selling prices.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-emerald-50/60 border border-emerald-200 space-y-2">
              <span className="text-xs text-emerald-800 uppercase tracking-wider font-bold">Potential Gross Profit</span>
              <div className="text-2xl font-bold font-serif text-emerald-900">{money(potentialGrossProfit)}</div>
              <p className="text-[11px] text-emerald-700">
                Gross margin: {totalStockSellingValue > 0 ? ((potentialGrossProfit / totalStockSellingValue) * 100).toFixed(1) : 0}%
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* STOCK ADJUSTMENT MODAL */}
      {/* ------------------------------------------------------------- */}
      {showAdjModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 space-y-5 shadow-2xl border border-stone-200 my-8">
            <div className="flex items-center justify-between border-b border-stone-200 pb-3">
              <div className="flex items-center gap-2">
                <Sliders className="w-5 h-5 text-amber-700" />
                <h3 className="font-serif text-lg font-bold text-stone-900">
                  {language === 'bn' ? 'স্টক অ্যাডজাস্টমেন্ট' : 'Stock Adjustment'}
                </h3>
              </div>
              <button
                onClick={() => setShowAdjModal(false)}
                className="p-1.5 rounded-full hover:bg-stone-100 text-stone-500 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveAdjustment} className="space-y-4 text-xs">
              {/* Product Selector */}
              <div>
                <label className="block font-bold text-stone-700 mb-1">
                  {language === 'bn' ? 'পণ্য নির্বাচন করুন *' : 'Select Product *'}
                </label>
                <select
                  required
                  value={selectedProduct?.id || ''}
                  onChange={(e) => {
                    const prod = products.find((p) => p.id === e.target.value);
                    if (prod) setSelectedProduct(prod);
                  }}
                  className="w-full p-3 rounded-xl border border-stone-300 focus:border-amber-600 outline-none bg-white font-medium"
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.titleEn || p.titleBn} (Current Stock: {Number(p.stockQuantity ?? p.stock ?? 0)} pcs)
                    </option>
                  ))}
                </select>
              </div>

              {/* Adjustment Type */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-stone-700 mb-1">
                    {language === 'bn' ? 'অ্যাডজাস্টমেন্ট টাইপ *' : 'Adjustment Type *'}
                  </label>
                  <select
                    value={adjType}
                    onChange={(e) => setAdjType(e.target.value as any)}
                    className="w-full p-3 rounded-xl border border-stone-300 focus:border-amber-600 outline-none bg-white font-medium"
                  >
                    <option value="ADJUSTMENT_IN">ADJUSTMENT IN (+ Stock)</option>
                    <option value="ADJUSTMENT_OUT">ADJUSTMENT OUT (- Stock)</option>
                    <option value="DAMAGE">DAMAGE (- Stock)</option>
                    <option value="LOST">LOST (- Stock)</option>
                    <option value="MANUAL_CORRECTION">MANUAL CORRECTION (+ Stock)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-stone-700 mb-1">
                    {language === 'bn' ? 'পরিমাণ (Quantity) *' : 'Quantity *'}
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={adjQuantity}
                    onChange={(e) => setAdjQuantity(Math.max(1, Number(e.target.value) || 1))}
                    className="w-full p-3 rounded-xl border border-stone-300 focus:border-amber-600 outline-none font-bold"
                  />
                </div>
              </div>

              {/* Live Preview Box */}
              {selectedProduct && (
                <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200 space-y-2">
                  <div className="font-bold text-amber-900 text-xs flex items-center justify-between">
                    <span>{language === 'bn' ? 'পূর্বরূপ (Preview):' : 'Stock Transition Preview:'}</span>
                    <span className="font-mono text-[11px]">
                      Unit Cost: {money(Number(selectedProduct.purchasePrice ?? selectedProduct.price * 0.7))}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs pt-1">
                    <div>
                      <span className="text-stone-500">Current Stock: </span>
                      <b className="text-stone-900">{Number(selectedProduct.stockQuantity ?? selectedProduct.stock ?? 0)}</b>
                    </div>
                    <div>
                      <span className="text-stone-500">Adjustment: </span>
                      <b
                        className={
                          ['ADJUSTMENT_OUT', 'DAMAGE', 'LOST'].includes(adjType)
                            ? 'text-rose-700'
                            : 'text-emerald-700'
                        }
                      >
                        {['ADJUSTMENT_OUT', 'DAMAGE', 'LOST'].includes(adjType)
                          ? `-${adjQuantity}`
                          : `+${adjQuantity}`}
                      </b>
                    </div>
                    <div>
                      <span className="text-stone-500">New Stock: </span>
                      <b className="text-stone-900 text-sm">
                        {Math.max(
                          0,
                          Number(selectedProduct.stockQuantity ?? selectedProduct.stock ?? 0) +
                            (['ADJUSTMENT_OUT', 'DAMAGE', 'LOST'].includes(adjType)
                              ? -adjQuantity
                              : adjQuantity)
                        )}
                      </b>
                    </div>
                  </div>
                </div>
              )}

              {/* Reason */}
              <div>
                <label className="block font-bold text-stone-700 mb-1">
                  {language === 'bn' ? 'অ্যাডজাস্টমেন্টের কারণ *' : 'Reason *'}
                </label>
                <input
                  type="text"
                  required
                  placeholder={
                    language === 'bn'
                      ? 'যেমন: ফিজিক্যাল স্টক গণনা, প্যাকেজিং ড্যামেজ, ডিসপ্লে স্যাম্পল...'
                      : 'e.g., Physical inventory audit, damaged in transit, promotional sample...'
                  }
                  value={adjReason}
                  onChange={(e) => setAdjReason(e.target.value)}
                  className="w-full p-3 rounded-xl border border-stone-300 focus:border-amber-600 outline-none"
                />
              </div>

              {/* Note */}
              <div>
                <label className="block font-bold text-stone-700 mb-1">
                  {language === 'bn' ? 'অতিরিক্ত নোট (ঐচ্ছিক)' : 'Additional Note (Optional)'}
                </label>
                <textarea
                  rows={2}
                  value={adjNote}
                  onChange={(e) => setAdjNote(e.target.value)}
                  placeholder="Notes for accounting and audit..."
                  className="w-full p-3 rounded-xl border border-stone-300 focus:border-amber-600 outline-none resize-none"
                />
              </div>

              {/* Admin Confirmation Checkbox */}
              <div className="flex items-start gap-2 pt-1">
                <input
                  type="checkbox"
                  id="adj-confirm"
                  required
                  checked={adjConfirmed}
                  onChange={(e) => setAdjConfirmed(e.target.checked)}
                  className="mt-1 w-4 h-4 text-amber-700 rounded border-stone-300 cursor-pointer"
                />
                <label htmlFor="adj-confirm" className="text-[11px] text-stone-600 cursor-pointer">
                  {language === 'bn'
                    ? 'আমি নিশ্চিত করছি যে এই স্টক অ্যাডজাস্টমেন্ট সঠিক এবং এটি স্বয়ংক্রিয়ভাবে ইনভেন্টরি অডিট মুভমেন্ট লগ তৈরি করবে।'
                    : 'I confirm that this stock adjustment is accurate and will be permanently recorded in the inventory audit trail.'}
                </label>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-stone-200">
                <button
                  type="button"
                  onClick={() => setShowAdjModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-stone-300 hover:bg-stone-50 text-stone-700 font-bold cursor-pointer"
                >
                  {language === 'bn' ? 'বাতিল' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={adjSaving || !adjConfirmed}
                  className="px-5 py-2.5 rounded-xl bg-amber-700 hover:bg-amber-800 text-white font-bold disabled:opacity-50 cursor-pointer shadow-md"
                >
                  {adjSaving ? 'Saving...' : language === 'bn' ? 'স্টক সংরক্ষণ করুন' : 'Confirm & Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
