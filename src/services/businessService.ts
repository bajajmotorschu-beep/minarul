import { auth, db } from '../firebase';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import {
  Expense,
  Purchase,
  Sale,
  Supplier,
  StockMovement,
  StockAdjustment,
  CashTransaction,
  SupplierPayment,
  OpeningBalances,
  AccountBalancesSummary,
  PaymentAccountMethod,
  Order,
} from '../types';

const clean = <T extends Record<string, any>>(value: T): T =>
  JSON.parse(JSON.stringify(value, (_key, v) => (v === undefined ? null : v)));

const DEFAULT_OPENING_BALANCES: OpeningBalances = {
  openingCash: 0,
  openingBkash: 0,
  openingNagad: 0,
  openingRocket: 0,
  openingBank: 0,
  openingSupplierDue: 0,
  openingStockValue: 0,
};

export const businessService = {
  // =========================================================================
  // 1. DATA FETCHERS
  // =========================================================================
  async getPurchases(): Promise<Purchase[]> {
    const snap = await getDocs(query(collection(db, 'purchases'), orderBy('createdAt', 'desc')));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Purchase[];
  },

  async getExpenses(): Promise<Expense[]> {
    const snap = await getDocs(query(collection(db, 'expenses'), orderBy('createdAt', 'desc')));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Expense[];
  },

  async getSuppliers(): Promise<Supplier[]> {
    const snap = await getDocs(query(collection(db, 'suppliers'), orderBy('createdAt', 'desc')));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Supplier[];
  },

  async getSales(): Promise<Sale[]> {
    const snap = await getDocs(query(collection(db, 'sales'), orderBy('createdAt', 'desc')));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Sale[];
  },

  async getStockMovements(): Promise<StockMovement[]> {
    const snap = await getDocs(query(collection(db, 'stockMovements'), orderBy('createdAt', 'desc')));
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        ...data,
        type: data.type || data.movementType || 'MANUAL_CORRECTION',
      };
    }) as StockMovement[];
  },

  async getStockAdjustments(): Promise<StockAdjustment[]> {
    const snap = await getDocs(query(collection(db, 'stockAdjustments'), orderBy('createdAt', 'desc')));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() })) as StockAdjustment[];
  },

  async getCashTransactions(): Promise<CashTransaction[]> {
    const snap = await getDocs(query(collection(db, 'cashTransactions'), orderBy('createdAt', 'desc')));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() })) as CashTransaction[];
  },

  async getSupplierPayments(): Promise<SupplierPayment[]> {
    const snap = await getDocs(query(collection(db, 'supplierPayments'), orderBy('createdAt', 'desc')));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() })) as SupplierPayment[];
  },

  async getOpeningBalances(): Promise<OpeningBalances> {
    try {
      const snap = await getDoc(doc(db, 'accounts', 'opening_balances'));
      if (snap.exists()) {
        return { ...DEFAULT_OPENING_BALANCES, ...snap.data() } as OpeningBalances;
      }
    } catch (e) {
      console.warn('Could not load opening balances from Firestore:', e);
    }
    return DEFAULT_OPENING_BALANCES;
  },

  async saveOpeningBalances(balances: Partial<OpeningBalances>): Promise<void> {
    if (!auth.currentUser) throw new Error('USER_NOT_AUTHENTICATED');
    const docRef = doc(db, 'accounts', 'opening_balances');
    await setDoc(
      docRef,
      clean({
        ...balances,
        updatedAt: serverTimestamp(),
        updatedBy: auth.currentUser.uid,
      }),
      { merge: true }
    );
  },

  // =========================================================================
  // 2. SUPPLIER MANAGEMENT
  // =========================================================================
  async createSupplier(input: Omit<Supplier, 'id' | 'createdAt' | 'updatedAt'>) {
    if (!auth.currentUser) throw new Error('USER_NOT_AUTHENTICATED');
    const id = `SUP-${Date.now().toString(36).toUpperCase()}`;
    await setDoc(
      doc(db, 'suppliers', id),
      clean({
        ...input,
        supplierId: id,
        openingDue: Number(input.openingDue) || 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );
  },

  async updateSupplier(id: string, input: Partial<Supplier>) {
    if (!auth.currentUser) throw new Error('USER_NOT_AUTHENTICATED');
    await updateDoc(
      doc(db, 'suppliers', id),
      clean({
        ...input,
        updatedAt: serverTimestamp(),
      })
    );
  },

  // =========================================================================
  // 3. EXPENSE MANAGEMENT
  // =========================================================================
  async createExpense(input: Omit<Expense, 'id' | 'createdAt' | 'updatedAt'>) {
    if (!auth.currentUser) throw new Error('USER_NOT_AUTHENTICATED');
    const id = `EXP-${Date.now().toString(36).toUpperCase()}`;
    const amount = Number(input.amount) || 0;
    const method = (input.paymentMethod || 'Cash').toUpperCase();
    const normalizedMethod: PaymentAccountMethod = ['CASH', 'BKASH', 'NAGAD', 'ROCKET', 'BANK'].includes(method)
      ? (method as PaymentAccountMethod)
      : 'CASH';

    await runTransaction(db, async (tx) => {
      // 1. Save expense
      tx.set(
        doc(db, 'expenses', id),
        clean({
          ...input,
          expenseId: id,
          amount,
          paymentMethod: normalizedMethod,
          createdBy: auth.currentUser!.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      );

      // 2. Automatically record cash/account transaction
      const txId = `CTX-${id}`;
      tx.set(
        doc(db, 'cashTransactions', txId),
        clean({
          transactionId: txId,
          type: 'CASH_OUT',
          category: 'EXPENSE',
          amount,
          paymentMethod: normalizedMethod,
          referenceId: id,
          referenceType: 'expense',
          description: `${input.category}: ${input.description || 'Expense payment'}`,
          createdBy: auth.currentUser!.uid,
          createdAt: serverTimestamp(),
        })
      );
    });
  },

  // =========================================================================
  // 4. CASH TRANSACTION MANAGEMENT
  // =========================================================================
  async createCashTransaction(input: Omit<CashTransaction, 'id' | 'createdAt'>) {
    if (!auth.currentUser) throw new Error('USER_NOT_AUTHENTICATED');
    const id = input.transactionId || `CTX-${Date.now().toString(36).toUpperCase()}`;
    await setDoc(
      doc(db, 'cashTransactions', id),
      clean({
        ...input,
        transactionId: id,
        amount: Number(input.amount) || 0,
        createdBy: auth.currentUser.uid,
        createdAt: serverTimestamp(),
      })
    );
  },

  // =========================================================================
  // 5. SUPPLIER PAYMENT
  // =========================================================================
  async createSupplierPayment(input: {
    supplierId: string;
    supplierName: string;
    paymentAmount: number;
    paymentMethod: PaymentAccountMethod;
    paymentAccount?: string;
    transactionId?: string;
    date: string;
    note?: string;
  }) {
    if (!auth.currentUser) throw new Error('USER_NOT_AUTHENTICATED');
    const payId = `SPAY-${Date.now().toString(36).toUpperCase()}`;
    const amount = Number(input.paymentAmount) || 0;
    if (amount <= 0) throw new Error('Payment amount must be greater than zero');

    const supplierRef = doc(db, 'suppliers', input.supplierId);

    await runTransaction(db, async (tx) => {
      const sSnap = await tx.get(supplierRef);
      if (!sSnap.exists()) throw new Error('SUPPLIER_NOT_FOUND');
      const sData = sSnap.data();
      const currentDue = Number(sData.currentDue ?? sData.openingDue ?? 0);
      const remainingDue = Math.max(0, currentDue - amount);

      // Update supplier due
      tx.update(supplierRef, {
        currentDue: remainingDue,
        updatedAt: serverTimestamp(),
      });

      // Save supplier payment
      tx.set(
        doc(db, 'supplierPayments', payId),
        clean({
          paymentId: payId,
          supplierId: input.supplierId,
          supplierName: input.supplierName || sData.name || '',
          currentDue,
          paymentAmount: amount,
          remainingDue,
          paymentMethod: input.paymentMethod,
          paymentAccount: input.paymentAccount || input.paymentMethod,
          transactionId: input.transactionId || '',
          date: input.date,
          note: input.note || '',
          createdBy: auth.currentUser!.uid,
          createdAt: serverTimestamp(),
        })
      );

      // Automatically record financial transaction
      const ctxId = `CTX-${payId}`;
      tx.set(
        doc(db, 'cashTransactions', ctxId),
        clean({
          transactionId: ctxId,
          type: 'CASH_OUT',
          category: 'SUPPLIER_PAYMENT',
          amount,
          paymentMethod: input.paymentMethod,
          referenceId: payId,
          referenceType: 'supplier_payment',
          description: `Supplier payment to ${input.supplierName || sData.name}`,
          createdBy: auth.currentUser!.uid,
          createdAt: serverTimestamp(),
        })
      );
    });
  },

  // =========================================================================
  // 6. PURCHASE & STOCK IN
  // =========================================================================
  async createPurchase(input: Omit<Purchase, 'id' | 'createdAt' | 'updatedAt'>) {
    if (!auth.currentUser) throw new Error('USER_NOT_AUTHENTICATED');
    const id = `PUR-${Date.now().toString(36).toUpperCase()}`;
    const purchase = {
      ...input,
      purchaseId: id,
      createdBy: auth.currentUser.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const supplierRef = input.supplierId ? doc(db, 'suppliers', input.supplierId) : null;

    await runTransaction(db, async (tx) => {
      const productRefs = input.items.map((item) => doc(db, 'products', item.productId));
      const productSnaps = await Promise.all(productRefs.map((ref) => tx.get(ref)));
      let supplierSnap = null;
      if (supplierRef) {
        supplierSnap = await tx.get(supplierRef);
      }

      tx.set(doc(db, 'purchases', id), purchase);

      for (let i = 0; i < input.items.length; i++) {
        const item = input.items[i];
        const productSnap = productSnaps[i];
        if (!productSnap.exists()) continue;
        const p = productSnap.data();
        const previousStock = Number(p.stockQuantity ?? p.stock ?? 0);
        const quantity = Number(item.quantity) || 0;
        const newStock = previousStock + quantity;
        const oldCost = Number(p.purchasePrice ?? p.costPrice ?? item.unitCost ?? 0);
        const unitCost = Number(item.unitCost) || 0;
        const newCost =
          quantity > 0 && newStock > 0
            ? (previousStock * oldCost + quantity * unitCost) / newStock
            : oldCost;

        tx.update(productRefs[i], {
          stock: newStock,
          stockQuantity: newStock,
          purchasePrice: newCost,
          updatedAt: serverTimestamp(),
        });

        const movementId = `STM-${id}-${item.productId}`;
        tx.set(
          doc(db, 'stockMovements', movementId),
          clean({
            movementId,
            productId: item.productId,
            productName: item.productName,
            type: 'PURCHASE',
            movementType: 'purchase',
            quantity,
            previousStock,
            newStock,
            unitCost,
            totalValue: quantity * unitCost,
            referenceType: 'purchase',
            referenceId: id,
            note: `Purchase from ${input.supplierName || 'Supplier'}`,
            createdBy: auth.currentUser!.uid,
            createdAt: serverTimestamp(),
          })
        );
      }

      // Update supplier due if unpaid balance exists
      const dueAmount = Number(input.dueAmount) || 0;
      if (supplierRef && supplierSnap && supplierSnap.exists() && dueAmount > 0) {
        const sData = supplierSnap.data();
        const currentDue = Number(sData.currentDue ?? sData.openingDue ?? 0);
        tx.update(supplierRef, {
          currentDue: currentDue + dueAmount,
          updatedAt: serverTimestamp(),
        });
      }

      // If immediate payment was made, record supplier payment & cash transaction
      const paidAmount = Number(input.paidAmount) || 0;
      if (paidAmount > 0) {
        const payMethod = (input.paymentMethod || 'Cash').toUpperCase();
        const normMethod: PaymentAccountMethod = ['CASH', 'BKASH', 'NAGAD', 'ROCKET', 'BANK'].includes(payMethod)
          ? (payMethod as PaymentAccountMethod)
          : 'CASH';

        const spayId = `SPAY-${id}`;
        tx.set(
          doc(db, 'supplierPayments', spayId),
          clean({
            paymentId: spayId,
            supplierId: input.supplierId,
            supplierName: input.supplierName,
            currentDue: dueAmount + paidAmount,
            paymentAmount: paidAmount,
            remainingDue: dueAmount,
            paymentMethod: normMethod,
            paymentAccount: normMethod,
            date: input.purchaseDate,
            note: `Purchase downpayment #${id}`,
            createdBy: auth.currentUser!.uid,
            createdAt: serverTimestamp(),
          })
        );

        const ctxId = `CTX-${spayId}`;
        tx.set(
          doc(db, 'cashTransactions', ctxId),
          clean({
            transactionId: ctxId,
            type: 'CASH_OUT',
            category: 'SUPPLIER_PAYMENT',
            amount: paidAmount,
            paymentMethod: normMethod,
            referenceId: id,
            referenceType: 'purchase_payment',
            description: `Purchase payment #${id} to ${input.supplierName}`,
            createdBy: auth.currentUser!.uid,
            createdAt: serverTimestamp(),
          })
        );
      }
    });
  },

  // =========================================================================
  // 7. STOCK ADJUSTMENT
  // =========================================================================
  async createStockAdjustment(input: {
    productId: string;
    productName: string;
    sku?: string;
    adjustmentType: 'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT' | 'DAMAGE' | 'LOST' | 'MANUAL_CORRECTION';
    quantity: number;
    reason: string;
    note?: string;
  }) {
    if (!auth.currentUser) throw new Error('USER_NOT_AUTHENTICATED');
    const adjId = `ADJ-${Date.now().toString(36).toUpperCase()}`;
    const productRef = doc(db, 'products', input.productId);

    await runTransaction(db, async (tx) => {
      const pSnap = await tx.get(productRef);
      if (!pSnap.exists()) throw new Error('PRODUCT_NOT_FOUND');
      const p = pSnap.data();
      const previousStock = Number(p.stockQuantity ?? p.stock ?? 0);
      const unitCost = Number(p.purchasePrice ?? p.costPrice ?? 0);

      // Determine sign based on adjustment type
      let delta = Math.abs(Number(input.quantity) || 0);
      if (['ADJUSTMENT_OUT', 'DAMAGE', 'LOST'].includes(input.adjustmentType)) {
        delta = -delta;
      }
      const newStock = Math.max(0, previousStock + delta);
      const totalValue = Math.abs(delta) * unitCost;

      // Update product
      tx.update(productRef, {
        stock: newStock,
        stockQuantity: newStock,
        updatedAt: serverTimestamp(),
      });

      // Save adjustment log
      tx.set(
        doc(db, 'stockAdjustments', adjId),
        clean({
          adjustmentId: adjId,
          productId: input.productId,
          productName: input.productName || p.titleEn || p.titleBn || '',
          sku: input.sku || p.sku || '',
          adjustmentType: input.adjustmentType,
          quantity: delta,
          previousStock,
          newStock,
          unitCost,
          totalValue,
          reason: input.reason,
          note: input.note || '',
          createdBy: auth.currentUser!.uid,
          createdAt: serverTimestamp(),
        })
      );

      // Create stock movement record
      const stmId = `STM-${adjId}`;
      tx.set(
        doc(db, 'stockMovements', stmId),
        clean({
          movementId: stmId,
          productId: input.productId,
          productName: input.productName || p.titleEn || p.titleBn || '',
          type: input.adjustmentType,
          movementType: input.adjustmentType.toLowerCase(),
          quantity: delta,
          previousStock,
          newStock,
          unitCost,
          totalValue,
          referenceType: 'adjustment',
          referenceId: adjId,
          note: `${input.adjustmentType}: ${input.reason}`,
          createdBy: auth.currentUser!.uid,
          createdAt: serverTimestamp(),
        })
      );
    });
  },

  // =========================================================================
  // 8. SALES & ORDER WORKFLOW (WITH DUPLICATE PREVENTION)
  // =========================================================================
  async ensureSaleForOrder(order: Order) {
    if (!auth.currentUser) throw new Error('USER_NOT_AUTHENTICATED');
    const saleId = `SALE-${order.id}`;
    const saleRef = doc(db, 'sales', saleId);

    await runTransaction(db, async (tx) => {
      const existing = await tx.get(saleRef);
      if (existing.exists()) return; // Prevent duplicate processing

      const productRefs = order.items.map((item) => doc(db, 'products', item.productId));
      const productSnaps = await Promise.all(productRefs.map((ref) => tx.get(ref)));
      const saleItems: any[] = [];
      let totalCost = 0;
      const updates: any[] = [];

      for (let i = 0; i < order.items.length; i++) {
        const item = order.items[i];
        const snap = productSnaps[i];
        const p: any = snap && snap.exists() ? snap.data() : {};
        const currentStock = Number(p.stockQuantity ?? p.stock ?? 0);
        const quantity = Number(item.quantity) || 0;
        if (currentStock < quantity) {
          throw new Error(`INSUFFICIENT_STOCK:${item.titleEn || item.titleBn || item.productId}`);
        }
        const costPrice = Number(p.purchasePrice ?? p.costPrice ?? item.price ?? 0);
        const itemSales = Number(item.price) * quantity;
        const itemCost = costPrice * quantity;
        const newStock = Math.max(0, currentStock - quantity);
        totalCost += itemCost;

        saleItems.push({
          productId: item.productId,
          productName: item.titleEn || item.titleBn || item.productName || '',
          quantity,
          sellingPrice: Number(item.price),
          costPrice,
          totalSelling: itemSales,
          totalCost: itemCost,
        });

        updates.push({ ref: productRefs[i], newStock, item, currentStock, quantity, costPrice });
      }

      for (const u of updates) {
        tx.update(u.ref, {
          stock: u.newStock,
          stockQuantity: u.newStock,
          updatedAt: serverTimestamp(),
        });

        const movementId = `STM-${order.id}-${u.item.productId}`;
        tx.set(
          doc(db, 'stockMovements', movementId),
          clean({
            movementId,
            productId: u.item.productId,
            productName: u.item.titleEn || u.item.titleBn || u.item.productName || '',
            type: 'SALE',
            movementType: 'sale',
            quantity: -u.quantity,
            previousStock: u.currentStock,
            newStock: u.newStock,
            unitCost: u.costPrice,
            totalValue: u.quantity * u.costPrice,
            referenceType: 'order',
            referenceId: order.id,
            note: `Confirmed customer sale #${order.id}`,
            createdBy: auth.currentUser!.uid,
            createdAt: serverTimestamp(),
          })
        );
      }

      const salesAmount = Number(order.totalAmount) || 0;
      tx.set(
        saleRef,
        clean({
          saleId,
          orderId: order.id,
          customerId: order.customerId || '',
          customerName: order.customerName || order.shippingAddress?.fullName || '',
          items: saleItems,
          subtotal: Number(order.subtotal) || 0,
          discount: Number(order.discount) || 0,
          deliveryCharge: Number(order.deliveryCharge) || 0,
          totalAmount: salesAmount,
          totalCost,
          grossProfit: salesAmount - totalCost,
          paymentMethod: order.paymentMethod,
          paymentStatus: order.paymentStatus,
          saleStatus: order.orderStatus,
          saleDate: serverTimestamp(),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      );

      // Record cash or digital transaction if payment is verified/paid or COD delivered
      const isPaid = order.paymentStatus === 'paid' || order.orderStatus === 'delivered';
      if (isPaid && salesAmount > 0) {
        const payMethod = order.paymentMethod?.toLowerCase();
        const isCash = payMethod === 'cod';
        const methodType: PaymentAccountMethod = isCash
          ? 'CASH'
          : payMethod === 'bkash'
          ? 'BKASH'
          : payMethod === 'nagad'
          ? 'NAGAD'
          : payMethod === 'rocket'
          ? 'ROCKET'
          : 'OTHER';

        const ctxId = `CTX-SALE-${order.id}`;
        tx.set(
          doc(db, 'cashTransactions', ctxId),
          clean({
            transactionId: ctxId,
            type: 'CASH_IN',
            category: isCash ? 'COD_SALE' : 'CUSTOMER_PAYMENT',
            amount: salesAmount,
            paymentMethod: methodType,
            referenceId: order.id,
            referenceType: 'order',
            description: `${isCash ? 'COD collected' : 'Payment received'} for order #${order.id}`,
            createdBy: auth.currentUser!.uid,
            createdAt: serverTimestamp(),
          })
        );
      }
    });
  },

  // =========================================================================
  // 9. RETURNS
  // =========================================================================
  async createSalesReturn(input: {
    orderId: string;
    productId: string;
    productName: string;
    quantity: number;
    refundAmount: number;
    paymentMethod: PaymentAccountMethod;
    reason: string;
  }) {
    if (!auth.currentUser) throw new Error('USER_NOT_AUTHENTICATED');
    const retId = `RET-${Date.now().toString(36).toUpperCase()}`;
    const productRef = doc(db, 'products', input.productId);
    const qty = Math.abs(Number(input.quantity) || 1);

    await runTransaction(db, async (tx) => {
      const pSnap = await tx.get(productRef);
      if (!pSnap.exists()) throw new Error('PRODUCT_NOT_FOUND');
      const p = pSnap.data();
      const previousStock = Number(p.stockQuantity ?? p.stock ?? 0);
      const newStock = previousStock + qty;
      const unitCost = Number(p.purchasePrice ?? p.costPrice ?? 0);

      // Return stock
      tx.update(productRef, {
        stock: newStock,
        stockQuantity: newStock,
        updatedAt: serverTimestamp(),
      });

      // Stock movement
      const stmId = `STM-${retId}`;
      tx.set(
        doc(db, 'stockMovements', stmId),
        clean({
          movementId: stmId,
          productId: input.productId,
          productName: input.productName || p.titleEn || p.titleBn || '',
          type: 'SALE_RETURN',
          movementType: 'sale_return',
          quantity: qty,
          previousStock,
          newStock,
          unitCost,
          totalValue: qty * unitCost,
          referenceType: 'order_return',
          referenceId: input.orderId,
          note: `Customer sale return #${input.orderId}: ${input.reason}`,
          createdBy: auth.currentUser!.uid,
          createdAt: serverTimestamp(),
        })
      );

      // If refund issued, record cash/account withdrawal
      const refund = Number(input.refundAmount) || 0;
      if (refund > 0) {
        const ctxId = `CTX-${retId}`;
        tx.set(
          doc(db, 'cashTransactions', ctxId),
          clean({
            transactionId: ctxId,
            type: 'CASH_OUT',
            category: 'OTHER',
            amount: refund,
            paymentMethod: input.paymentMethod,
            referenceId: input.orderId,
            referenceType: 'sales_return',
            description: `Refund for sales return #${input.orderId}: ${input.reason}`,
            createdBy: auth.currentUser!.uid,
            createdAt: serverTimestamp(),
          })
        );
      }
    });
  },

  // =========================================================================
  // 10. FINANCIAL ACCOUNT BALANCES CALCULATOR
  // =========================================================================
  calculateAccountBalances(
    transactions: CashTransaction[],
    opening: OpeningBalances
  ): AccountBalancesSummary {
    let cashInHand = Number(opening.openingCash) || 0;
    let bkashBalance = Number(opening.openingBkash) || 0;
    let nagadBalance = Number(opening.openingNagad) || 0;
    let rocketBalance = Number(opening.openingRocket) || 0;
    let bankBalance = Number(opening.openingBank) || 0;

    let totalCashIn = 0;
    let totalCashOut = 0;
    let todayCashIn = 0;
    let todayCashOut = 0;

    const todayStr = new Date().toISOString().slice(0, 10);

    for (const tx of transactions) {
      const amount = Number(tx.amount) || 0;
      const method = (tx.paymentMethod || 'CASH').toUpperCase();
      const isToday =
        tx.createdAt?.toDate
          ? tx.createdAt.toDate().toISOString().slice(0, 10) === todayStr
          : typeof tx.createdAt === 'string'
          ? tx.createdAt.slice(0, 10) === todayStr
          : false;

      if (tx.type === 'CASH_IN') {
        if (method === 'CASH') {
          cashInHand += amount;
          totalCashIn += amount;
          if (isToday) todayCashIn += amount;
        } else if (method === 'BKASH') {
          bkashBalance += amount;
        } else if (method === 'NAGAD') {
          nagadBalance += amount;
        } else if (method === 'ROCKET') {
          rocketBalance += amount;
        } else if (method === 'BANK') {
          bankBalance += amount;
        }
      } else if (tx.type === 'CASH_OUT') {
        if (method === 'CASH') {
          cashInHand -= amount;
          totalCashOut += amount;
          if (isToday) todayCashOut += amount;
        } else if (method === 'BKASH') {
          bkashBalance -= amount;
        } else if (method === 'NAGAD') {
          nagadBalance -= amount;
        } else if (method === 'ROCKET') {
          rocketBalance -= amount;
        } else if (method === 'BANK') {
          bankBalance -= amount;
        }
      }
    }

    return {
      cashInHand,
      bkashBalance,
      nagadBalance,
      rocketBalance,
      bankBalance,
      todayCashIn,
      todayCashOut,
      todayNetCash: todayCashIn - todayCashOut,
      totalCashIn,
      totalCashOut,
    };
  },
};

