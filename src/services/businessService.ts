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
  deleteDoc,
} from 'firebase/firestore';
import {
  Expense,
  Purchase,
  Sale,
  Supplier,
  StockMovement,
  StockMovementType,
  StockAdjustment,
  CashTransaction,
  SupplierPayment,
  OpeningBalances,
  AccountBalancesSummary,
  PaymentAccountMethod,
  Order,
} from '../types';
import { logFirestoreError } from '../utils/firestoreError';

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
    try {
      const snap = await getDocs(query(collection(db, 'purchases'), orderBy('createdAt', 'desc')));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Purchase[];
    } catch (err) {
      logFirestoreError(err, 'purchases', 'list', 'admin');
      throw err;
    }
  },

  async getExpenses(): Promise<Expense[]> {
    try {
      const snap = await getDocs(query(collection(db, 'expenses'), orderBy('createdAt', 'desc')));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Expense[];
    } catch (err) {
      logFirestoreError(err, 'expenses', 'list', 'admin');
      throw err;
    }
  },

  async getSuppliers(): Promise<Supplier[]> {
    try {
      const snap = await getDocs(query(collection(db, 'suppliers'), orderBy('createdAt', 'desc')));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Supplier[];
    } catch (err) {
      logFirestoreError(err, 'suppliers', 'list', 'admin');
      throw err;
    }
  },

  async getSales(): Promise<Sale[]> {
    try {
      const snap = await getDocs(query(collection(db, 'sales'), orderBy('createdAt', 'desc')));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Sale[];
    } catch (err) {
      logFirestoreError(err, 'sales', 'list', 'admin');
      throw err;
    }
  },

  async getStockMovements(): Promise<StockMovement[]> {
    try {
      const snap = await getDocs(query(collection(db, 'stockMovements'), orderBy('createdAt', 'desc')));
      return snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          ...data,
          type: data.type || data.movementType || 'MANUAL_CORRECTION',
        };
      }) as StockMovement[];
    } catch (err) {
      logFirestoreError(err, 'stockMovements', 'list', 'admin');
      throw err;
    }
  },

  async getStockAdjustments(): Promise<StockAdjustment[]> {
    try {
      const snap = await getDocs(query(collection(db, 'stockAdjustments'), orderBy('createdAt', 'desc')));
      if (!snap.empty) {
        return snap.docs.map((d) => ({ id: d.id, ...d.data() })) as StockAdjustment[];
      }
    } catch {
      // Fallback to stockMovements if stockAdjustments has no rule or is not populated
    }

    // Derive adjustments from stockMovements
    try {
      const movements = await this.getStockMovements();
      return movements
        .filter((m) => m.referenceType === 'adjustment' || ['ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'DAMAGE', 'LOST', 'MANUAL_CORRECTION', 'OPENING_STOCK'].includes(m.type))
        .map((m) => ({
          id: m.id || m.movementId,
          adjustmentId: m.referenceId || m.movementId,
          productId: m.productId,
          productName: m.productName,
          sku: (m as any).sku || '',
          adjustmentType: m.type as any,
          quantity: m.quantity,
          previousStock: m.previousStock,
          newStock: m.newStock,
          unitCost: m.unitCost || 0,
          totalValue: m.totalValue || 0,
          reason: (m as any).reason || m.note || '',
          note: m.note || '',
          createdBy: m.createdBy,
          createdAt: m.createdAt,
        })) as StockAdjustment[];
    } catch (err) {
      logFirestoreError(err, 'stockMovements', 'list', 'admin');
      return [];
    }
  },

  async getCashTransactions(): Promise<CashTransaction[]> {
    try {
      const snap = await getDocs(query(collection(db, 'cashTransactions'), orderBy('createdAt', 'desc')));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() })) as CashTransaction[];
    } catch (err) {
      logFirestoreError(err, 'cashTransactions', 'list', 'admin');
      throw err;
    }
  },

  async getSupplierPayments(): Promise<SupplierPayment[]> {
    try {
      const snap = await getDocs(query(collection(db, 'supplierPayments'), orderBy('createdAt', 'desc')));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() })) as SupplierPayment[];
    } catch (err) {
      logFirestoreError(err, 'supplierPayments', 'list', 'admin');
      throw err;
    }
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

  async deleteSupplier(id: string) {
    if (!auth.currentUser) throw new Error('USER_NOT_AUTHENTICATED');
    await deleteDoc(doc(db, 'suppliers', id));
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

  async updateExpense(id: string, input: Partial<Expense>) {
    if (!auth.currentUser) throw new Error('USER_NOT_AUTHENTICATED');
    const amount = input.amount !== undefined ? Number(input.amount) || 0 : undefined;
    const method = input.paymentMethod ? (input.paymentMethod as string).toUpperCase() : undefined;
    const normalizedMethod: PaymentAccountMethod | undefined = method
      ? ['CASH', 'BKASH', 'NAGAD', 'ROCKET', 'BANK'].includes(method)
        ? (method as PaymentAccountMethod)
        : 'CASH'
      : undefined;

    await runTransaction(db, async (tx) => {
      const expRef = doc(db, 'expenses', id);
      const txId = `CTX-${id}`;
      const ctxRef = doc(db, 'cashTransactions', txId);

      // ALL READS MUST PRECEDE ALL WRITES
      const expSnap = await tx.get(expRef);
      if (!expSnap.exists()) throw new Error('EXPENSE_NOT_FOUND');
      const ctxSnap = await tx.get(ctxRef);

      const updateData: any = {
        ...input,
        updatedAt: serverTimestamp(),
      };
      if (amount !== undefined) updateData.amount = amount;
      if (normalizedMethod) updateData.paymentMethod = normalizedMethod;

      tx.update(expRef, clean(updateData));

      // Also update linked cash transaction if it exists
      if (ctxSnap.exists()) {
        const ctxUpdate: any = {
          updatedAt: serverTimestamp(),
        };
        if (amount !== undefined) ctxUpdate.amount = amount;
        if (normalizedMethod) ctxUpdate.paymentMethod = normalizedMethod;
        if (input.category || input.description) {
          ctxUpdate.description = `${input.category || expSnap.data().category}: ${input.description || expSnap.data().description || 'Expense payment'}`;
        }
        tx.update(ctxRef, clean(ctxUpdate));
      }
    });
  },

  async deleteExpense(id: string) {
    if (!auth.currentUser) throw new Error('USER_NOT_AUTHENTICATED');
    await runTransaction(db, async (tx) => {
      const expRef = doc(db, 'expenses', id);
      const txId = `CTX-${id}`;
      const ctxRef = doc(db, 'cashTransactions', txId);

      // ALL READS MUST PRECEDE ALL WRITES
      const expSnap = await tx.get(expRef);
      if (!expSnap.exists()) return;
      const ctxSnap = await tx.get(ctxRef);

      tx.delete(expRef);

      // Delete linked cash transaction
      if (ctxSnap.exists()) {
        tx.delete(ctxRef);
      }
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

  async updateCashTransaction(id: string, input: Partial<CashTransaction>) {
    if (!auth.currentUser) throw new Error('USER_NOT_AUTHENTICATED');
    const updatePayload: any = {
      ...input,
      updatedAt: serverTimestamp(),
    };
    if (input.amount !== undefined) {
      updatePayload.amount = Number(input.amount) || 0;
    }
    await updateDoc(doc(db, 'cashTransactions', id), clean(updatePayload));
  },

  async deleteCashTransaction(id: string) {
    if (!auth.currentUser) throw new Error('USER_NOT_AUTHENTICATED');
    await deleteDoc(doc(db, 'cashTransactions', id));
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

  async updateSupplierPayment(
    paymentId: string,
    input: {
      paymentAmount: number;
      paymentMethod: PaymentAccountMethod;
      date?: string;
      note?: string;
    }
  ) {
    if (!auth.currentUser) throw new Error('USER_NOT_AUTHENTICATED');
    const payRef = doc(db, 'supplierPayments', paymentId);

    await runTransaction(db, async (tx) => {
      const paySnap = await tx.get(payRef);
      if (!paySnap.exists()) throw new Error('PAYMENT_NOT_FOUND');
      const oldPay = paySnap.data();
      const oldAmount = Number(oldPay.paymentAmount) || 0;
      const newAmount = Number(input.paymentAmount) || 0;
      const diff = newAmount - oldAmount;

      const supplierRef = doc(db, 'suppliers', oldPay.supplierId);
      const ctxId = `CTX-${paymentId}`;
      const ctxRef = doc(db, 'cashTransactions', ctxId);

      // ALL READS MUST PRECEDE ALL WRITES
      const sSnap = await tx.get(supplierRef);
      const ctxSnap = await tx.get(ctxRef);

      if (sSnap.exists()) {
        const sData = sSnap.data();
        const curDue = Number(sData.currentDue ?? sData.openingDue ?? 0);
        const updatedDue = Math.max(0, curDue - diff);
        tx.update(supplierRef, {
          currentDue: updatedDue,
          updatedAt: serverTimestamp(),
        });
      }

      tx.update(payRef, clean({
        paymentAmount: newAmount,
        paymentMethod: input.paymentMethod,
        date: input.date || oldPay.date,
        note: input.note !== undefined ? input.note : oldPay.note,
        updatedAt: serverTimestamp(),
      }));

      // Update linked cash transaction
      if (ctxSnap.exists()) {
        tx.update(ctxRef, clean({
          amount: newAmount,
          paymentMethod: input.paymentMethod,
          updatedAt: serverTimestamp(),
        }));
      }
    });
  },

  async deleteSupplierPayment(paymentId: string) {
    if (!auth.currentUser) throw new Error('USER_NOT_AUTHENTICATED');
    const payRef = doc(db, 'supplierPayments', paymentId);

    await runTransaction(db, async (tx) => {
      const paySnap = await tx.get(payRef);
      if (!paySnap.exists()) return;
      const oldPay = paySnap.data();
      const oldAmount = Number(oldPay.paymentAmount) || 0;

      const supplierRef = doc(db, 'suppliers', oldPay.supplierId);
      const ctxId = `CTX-${paymentId}`;
      const ctxRef = doc(db, 'cashTransactions', ctxId);

      // ALL READS MUST PRECEDE ALL WRITES
      const sSnap = await tx.get(supplierRef);
      const ctxSnap = await tx.get(ctxRef);

      // Restore supplier due (undoing the payment)
      if (sSnap.exists()) {
        const sData = sSnap.data();
        const curDue = Number(sData.currentDue ?? sData.openingDue ?? 0);
        tx.update(supplierRef, {
          currentDue: curDue + oldAmount,
          updatedAt: serverTimestamp(),
        });
      }

      // Delete payment
      tx.delete(payRef);

      // Delete linked cash transaction
      if (ctxSnap.exists()) {
        tx.delete(ctxRef);
      }
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
      // Deduplicate products to get clean list of unique product IDs and aggregated quantities/costs
      const productPurchaseMap = new Map<string, { totalQty: number; totalCost: number }>();
      for (const item of input.items) {
        const current = productPurchaseMap.get(item.productId) || { totalQty: 0, totalCost: 0 };
        const qty = Number(item.quantity) || 0;
        const cost = Number(item.unitCost) || 0;
        productPurchaseMap.set(item.productId, {
          totalQty: current.totalQty + qty,
          totalCost: current.totalCost + (qty * cost),
        });
      }

      const uniqueProductIds = Array.from(productPurchaseMap.keys());
      const productRefs = uniqueProductIds.map((pid) => doc(db, 'products', pid));
      const productSnaps = await Promise.all(productRefs.map((ref) => tx.get(ref)));
      let supplierSnap = null;
      if (supplierRef) {
        supplierSnap = await tx.get(supplierRef);
      }

      tx.set(doc(db, 'purchases', id), purchase);

      const productSnapMap = new Map<string, any>();
      for (let i = 0; i < uniqueProductIds.length; i++) {
        const snap = productSnaps[i];
        if (snap.exists()) {
          productSnapMap.set(uniqueProductIds[i], snap.data());
        }
      }

      // Update unique products
      for (let i = 0; i < uniqueProductIds.length; i++) {
        const pid = uniqueProductIds[i];
        const pRef = productRefs[i];
        const pData = productSnapMap.get(pid);
        if (!pData) continue;

        const previousStock = Number(pData.stockQuantity ?? pData.stock ?? 0);
        const agg = productPurchaseMap.get(pid) || { totalQty: 0, totalCost: 0 };
        const newStock = previousStock + agg.totalQty;
        const oldCost = Number(pData.purchasePrice ?? pData.costPrice ?? 0);
        const newCost =
          agg.totalQty > 0 && newStock > 0
            ? (previousStock * oldCost + agg.totalCost) / newStock
            : oldCost;

        tx.update(pRef, {
          stock: newStock,
          stockQuantity: newStock,
          purchasePrice: newCost,
          updatedAt: serverTimestamp(),
        });
      }

      // Record stock movements for each item
      for (let i = 0; i < input.items.length; i++) {
        const item = input.items[i];
        const pData = productSnapMap.get(item.productId);
        const previousStock = Number(pData?.stockQuantity ?? pData?.stock ?? 0);
        const quantity = Number(item.quantity) || 0;
        const unitCost = Number(item.unitCost) || 0;
        const movementId = `STM-${id}-${item.productId}-${i}`;

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
            newStock: previousStock + quantity,
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

  async updatePurchase(
    purchaseId: string,
    input: Partial<Purchase>
  ) {
    if (!auth.currentUser) throw new Error('USER_NOT_AUTHENTICATED');
    const purRef = doc(db, 'purchases', purchaseId);

    await runTransaction(db, async (tx) => {
      const purSnap = await tx.get(purRef);
      if (!purSnap.exists()) throw new Error('PURCHASE_NOT_FOUND');
      const oldPur = purSnap.data() as Purchase;

      const itemsToUpdate = (input.items && Array.isArray(input.items)) ? input.items : [];
      const productDocRefs = itemsToUpdate.map((it) => doc(db, 'products', it.productId));

      const supplierRef = (input.dueAmount !== undefined && oldPur.supplierId)
        ? doc(db, 'suppliers', oldPur.supplierId)
        : null;

      const spayId = `SPAY-${purchaseId}`;
      const spayRef = input.paidAmount !== undefined ? doc(db, 'supplierPayments', spayId) : null;
      const ctxId = `CTX-${spayId}`;
      const ctxRef = input.paidAmount !== undefined ? doc(db, 'cashTransactions', ctxId) : null;

      // ALL READS MUST PRECEDE ALL WRITES
      const productSnaps = await Promise.all(productDocRefs.map((ref) => tx.get(ref)));
      const supplierSnap = supplierRef ? await tx.get(supplierRef) : null;
      const spaySnap = spayRef ? await tx.get(spayRef) : null;
      const ctxSnap = ctxRef ? await tx.get(ctxRef) : null;

      // 1. Stock adjustments for modified item quantities
      if (itemsToUpdate.length > 0) {
        const oldItemsMap = new Map<string, number>();
        for (const item of oldPur.items || []) {
          oldItemsMap.set(item.productId, Number(item.quantity) || 0);
        }

        for (let i = 0; i < itemsToUpdate.length; i++) {
          const newItem = itemsToUpdate[i];
          const oldQty = oldItemsMap.get(newItem.productId) || 0;
          const newQty = Number(newItem.quantity) || 0;
          const delta = newQty - oldQty;

          if (delta !== 0) {
            const pSnap = productSnaps[i];
            const pRef = productDocRefs[i];
            if (pSnap && pSnap.exists()) {
              const pData = pSnap.data();
              const curStock = Number(pData.stockQuantity ?? pData.stock ?? 0);
              const updatedStock = Math.max(0, curStock + delta);
              tx.update(pRef, {
                stock: updatedStock,
                stockQuantity: updatedStock,
                updatedAt: serverTimestamp(),
              });

              // Log adjustment movement
              const stmId = `STM-UPDATE-${purchaseId}-${newItem.productId}-${Date.now().toString(36)}`;
              tx.set(
                doc(db, 'stockMovements', stmId),
                clean({
                  movementId: stmId,
                  productId: newItem.productId,
                  productName: newItem.productName,
                  type: 'MANUAL_CORRECTION',
                  movementType: 'manual_correction',
                  quantity: delta,
                  previousStock: curStock,
                  newStock: updatedStock,
                  unitCost: Number(newItem.unitCost) || 0,
                  totalValue: Math.abs(delta) * (Number(newItem.unitCost) || 0),
                  referenceType: 'purchase_edit',
                  referenceId: purchaseId,
                  note: `Purchase #${purchaseId} quantity updated (${oldQty} -> ${newQty})`,
                  createdBy: auth.currentUser!.uid,
                  createdAt: serverTimestamp(),
                })
              );
            }
          }
        }
      }

      // 2. Adjust supplier due if dueAmount changed
      if (supplierRef && supplierSnap && supplierSnap.exists() && input.dueAmount !== undefined) {
        const oldDue = Number(oldPur.dueAmount) || 0;
        const newDue = Number(input.dueAmount) || 0;
        const dueDiff = newDue - oldDue;
        if (dueDiff !== 0) {
          const curSupplierDue = Number(supplierSnap.data().currentDue ?? supplierSnap.data().openingDue ?? 0);
          tx.update(supplierRef, {
            currentDue: Math.max(0, curSupplierDue + dueDiff),
            updatedAt: serverTimestamp(),
          });
        }
      }

      // 3. Update purchase document
      tx.update(purRef, clean({
        ...input,
        updatedAt: serverTimestamp(),
      }));

      // 4. Update downpayment if paidAmount changed
      if (spaySnap && spaySnap.exists() && spayRef) {
        tx.update(spayRef, clean({
          paymentAmount: Number(input.paidAmount) || 0,
          paymentMethod: input.paymentMethod || oldPur.paymentMethod,
          updatedAt: serverTimestamp(),
        }));
      }

      if (ctxSnap && ctxSnap.exists() && ctxRef) {
        tx.update(ctxRef, clean({
          amount: Number(input.paidAmount) || 0,
          paymentMethod: input.paymentMethod || oldPur.paymentMethod,
          updatedAt: serverTimestamp(),
        }));
      }
    });
  },

  async deletePurchase(purchaseId: string) {
    if (!auth.currentUser) throw new Error('USER_NOT_AUTHENTICATED');
    const purRef = doc(db, 'purchases', purchaseId);

    await runTransaction(db, async (tx) => {
      const purSnap = await tx.get(purRef);
      if (!purSnap.exists()) return;
      const pur = purSnap.data() as Purchase;

      const items = pur.items || [];
      const productQtyMap = new Map<string, number>();
      for (const item of items) {
        const qty = Number(item.quantity) || 0;
        productQtyMap.set(item.productId, (productQtyMap.get(item.productId) || 0) + qty);
      }

      const uniqueProductIds = Array.from(productQtyMap.keys());
      const productDocRefs = uniqueProductIds.map((pid) => doc(db, 'products', pid));
      const movementDocRefs = items.map((item, idx) => doc(db, 'stockMovements', `STM-${purchaseId}-${item.productId}-${idx}`));
      const legacyMovementRefs = items.map((item) => doc(db, 'stockMovements', `STM-${purchaseId}-${item.productId}`));

      const dueAmount = Number(pur.dueAmount) || 0;
      const supplierRef = (pur.supplierId && dueAmount > 0) ? doc(db, 'suppliers', pur.supplierId) : null;

      const spayId = `SPAY-${purchaseId}`;
      const spayRef = doc(db, 'supplierPayments', spayId);
      const ctxId = `CTX-${spayId}`;
      const ctxRef = doc(db, 'cashTransactions', ctxId);

      // ALL READS MUST PRECEDE ALL WRITES
      const productSnaps = await Promise.all(productDocRefs.map((ref) => tx.get(ref)));
      const movementSnaps = await Promise.all(movementDocRefs.map((ref) => tx.get(ref)));
      const legacyMovementSnaps = await Promise.all(legacyMovementRefs.map((ref) => tx.get(ref)));
      const supplierSnap = supplierRef ? await tx.get(supplierRef) : null;
      const spaySnap = await tx.get(spayRef);
      const ctxSnap = await tx.get(ctxRef);

      const productSnapMap = new Map<string, any>();
      for (let i = 0; i < uniqueProductIds.length; i++) {
        const snap = productSnaps[i];
        if (snap.exists()) {
          productSnapMap.set(uniqueProductIds[i], snap.data());
        }
      }

      // 1. Rollback stock for unique products
      for (let i = 0; i < uniqueProductIds.length; i++) {
        const pid = uniqueProductIds[i];
        const pRef = productDocRefs[i];
        const pData = productSnapMap.get(pid);
        if (!pData) continue;

        const curStock = Number(pData.stockQuantity ?? pData.stock ?? 0);
        const rollbackQty = productQtyMap.get(pid) || 0;
        const rollbackStock = Math.max(0, curStock - rollbackQty);

        tx.update(pRef, {
          stock: rollbackStock,
          stockQuantity: rollbackStock,
          updatedAt: serverTimestamp(),
        });
      }

      // 2. Clean up movement docs and log rollback movement
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const pData = productSnapMap.get(item.productId);
        const curStock = Number(pData?.stockQuantity ?? pData?.stock ?? 0);
        const qty = Number(item.quantity) || 0;
        const rollbackStock = Math.max(0, curStock - (productQtyMap.get(item.productId) || qty));

        if (movementSnaps[i]?.exists()) {
          tx.delete(movementDocRefs[i]);
        }
        if (legacyMovementSnaps[i]?.exists()) {
          tx.delete(legacyMovementRefs[i]);
        }

        const stmId = `STM-DEL-${purchaseId}-${item.productId}-${i}`;
        tx.set(
          doc(db, 'stockMovements', stmId),
          clean({
            movementId: stmId,
            productId: item.productId,
            productName: item.productName,
            type: 'PURCHASE_RETURN',
            movementType: 'purchase_return',
            quantity: -qty,
            previousStock: curStock,
            newStock: rollbackStock,
            unitCost: Number(item.unitCost) || 0,
            totalValue: qty * (Number(item.unitCost) || 0),
            referenceType: 'purchase_deleted',
            referenceId: purchaseId,
            note: `Purchase #${purchaseId} deleted/rolled back`,
            createdBy: auth.currentUser!.uid,
            createdAt: serverTimestamp(),
          })
        );
      }

      // 3. Rollback supplier due
      if (supplierRef && supplierSnap && supplierSnap.exists() && dueAmount > 0) {
        const curDue = Number(supplierSnap.data().currentDue ?? supplierSnap.data().openingDue ?? 0);
        tx.update(supplierRef, {
          currentDue: Math.max(0, curDue - dueAmount),
          updatedAt: serverTimestamp(),
        });
      }

      // 4. Rollback paid amount if paid
      if (spaySnap.exists()) {
        tx.delete(spayRef);
      }

      if (ctxSnap.exists()) {
        tx.delete(ctxRef);
      }

      // 5. Delete purchase document
      tx.delete(purRef);
    });
  },

  // =========================================================================
  // 7. STOCK ADJUSTMENT
  // =========================================================================
  async verifyAdminUser(operationName: string) {
    if (!auth.currentUser) {
      throw new Error('USER_NOT_AUTHENTICATED');
    }
    const currentUid = auth.currentUser.uid;
    const currentEmail = auth.currentUser.email || '';
    const userDocRef = doc(db, 'users', currentUid);
    const userSnap = await getDoc(userDocRef);

    if (!userSnap.exists()) {
      console.error('STOCK ADJUSTMENT ERROR', {
        code: 'permission-denied/admin-doc-missing',
        message: 'Admin user document is missing.',
        uid: currentUid,
        email: currentEmail,
        userDocPath: `users/${currentUid}`,
        userRole: null,
        operation: operationName,
        collectionsWritten: ['products', 'stockAdjustments', 'stockMovements'],
      });
      throw new Error('Admin user document is missing.');
    }

    const userData = userSnap.data();
    if (userData?.role !== 'admin') {
      console.error('STOCK ADJUSTMENT ERROR', {
        code: 'permission-denied/insufficient-role',
        message: `User role is "${userData?.role || 'customer'}", but "admin" is required.`,
        uid: currentUid,
        email: currentEmail,
        userDocPath: `users/${currentUid}`,
        userRole: userData?.role,
        operation: operationName,
        collectionsWritten: ['products', 'stockAdjustments', 'stockMovements'],
      });
      throw new Error('Missing or insufficient permissions: User role in Firestore is not "admin".');
    }

    return userData;
  },

  async createStockAdjustment(input: {
    productId: string;
    productName: string;
    sku?: string;
    adjustmentType: 'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT' | 'DAMAGE' | 'LOST' | 'MANUAL_CORRECTION' | 'OPENING_STOCK';
    quantity: number;
    reason: string;
    note?: string;
  }) {
    const adminData = await this.verifyAdminUser('createStockAdjustment');
    const adjId = `ADJ-${Date.now().toString(36).toUpperCase()}`;
    const productRef = doc(db, 'products', input.productId);
    const stmId = `STM-${adjId}`;
    const stmRef = doc(db, 'stockMovements', stmId);
    const adjRef = doc(db, 'stockAdjustments', adjId);

    let delta = Math.abs(Number(input.quantity) || 0);
    let previousStock = 0;
    let newStock = 0;
    let unitCost = 0;
    let totalValue = 0;

    try {
      await runTransaction(db, async (tx) => {
        // STEP 1: READ PRODUCT BEFORE WRITES
        console.log("STOCK ADJUSTMENT STEP 1");
        console.log("Reading product:", productRef.path);
        const pSnap = await tx.get(productRef);
        if (!pSnap.exists()) throw new Error('PRODUCT_NOT_FOUND');
        const p = pSnap.data();
        previousStock = Number(p.stockQuantity ?? p.stock ?? 0);
        unitCost = Number(p.purchasePrice ?? p.costPrice ?? 0);

        // Determine sign based on adjustment type
        delta = Math.abs(Number(input.quantity) || 0);
        if (['ADJUSTMENT_OUT', 'DAMAGE', 'LOST'].includes(input.adjustmentType)) {
          if (delta > previousStock) {
            throw new Error('পর্যাপ্ত Stock নেই');
          }
          delta = -delta;
        }
        newStock = previousStock + delta;
        if (newStock < 0) {
          throw new Error('পর্যাপ্ত Stock নেই');
        }
        totalValue = Math.abs(delta) * unitCost;

        // ALL WRITES AFTER ALL READS
        // STEP 2: UPDATE PRODUCT STOCK
        console.log("STOCK ADJUSTMENT STEP 2");
        console.log("Updating product:", productRef.path);
        tx.update(productRef, {
          stock: newStock,
          stockQuantity: newStock,
          updatedAt: serverTimestamp(),
        });

        // STEP 3: CREATE STOCK MOVEMENT RECORD
        console.log("STOCK ADJUSTMENT STEP 3");
        console.log("Creating stock movement:", stmRef.path);
        tx.set(
          stmRef,
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

      // STEP 4: WRITE AUDIT RECORD TO stockAdjustments (Guarded auxiliary write)
      try {
        console.log("STOCK ADJUSTMENT STEP 4");
        console.log("Creating stock adjustment log:", adjRef.path);
        await setDoc(
          adjRef,
          clean({
            adjustmentId: adjId,
            productId: input.productId,
            productName: input.productName || '',
            sku: input.sku || '',
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
      } catch (adjErr: any) {
        console.warn("Notice: stockAdjustments collection write warning (ensure stockAdjustments rule is in Firestore rules):", adjErr?.message);
      }

      return {
        adjustmentId: adjId,
        movementId: stmId,
        productId: input.productId,
        newStock,
      };
    } catch (err: any) {
      console.error("STOCK ADJUSTMENT FIRESTORE ERROR", {
        code: err?.code,
        message: err?.message,
        name: err?.name,
      });
      console.error('STOCK ADJUSTMENT ERROR', {
        code: err?.code || 'unknown',
        message: err?.message || 'Stock adjustment failed',
        uid: auth.currentUser?.uid,
        email: auth.currentUser?.email,
        userDocPath: auth.currentUser ? `users/${auth.currentUser.uid}` : null,
        userRole: adminData?.role || 'admin',
        productDocPath: `products/${input.productId}`,
        stockMovementPath: `stockMovements/${stmId}`,
        collectionsWritten: ['products', 'stockMovements', 'stockAdjustments'],
      });
      throw err;
    }
  },

  async updateStockAdjustment(
    adjustmentId: string,
    input: {
      quantity: number;
      reason: string;
      note?: string;
      adjustmentType?: string;
    }
  ) {
    const adminData = await this.verifyAdminUser('updateStockAdjustment');
    const adjRef = doc(db, 'stockAdjustments', adjustmentId);

    try {
      await runTransaction(db, async (tx) => {
        const adjSnap = await tx.get(adjRef);
        if (!adjSnap.exists()) throw new Error('ADJUSTMENT_NOT_FOUND');
        const oldAdj = adjSnap.data() as StockAdjustment;

        const pRef = doc(db, 'products', oldAdj.productId);
        const stmRef = doc(db, 'stockMovements', `STM-${adjustmentId}`);

        // ALL READS MUST PRECEDE ALL WRITES
        const pSnap = await tx.get(pRef);
        if (!pSnap.exists()) throw new Error('PRODUCT_NOT_FOUND');
        const stmSnap = await tx.get(stmRef);

        const pData = pSnap.data();
        const curStock = Number(pData.stockQuantity ?? pData.stock ?? 0);

        const oldDelta = Number(oldAdj.quantity) || 0;
        const type = input.adjustmentType || oldAdj.adjustmentType;
        let newDelta = Math.abs(Number(input.quantity) || 0);
        if (['ADJUSTMENT_OUT', 'DAMAGE', 'LOST'].includes(type)) {
          newDelta = -newDelta;
        }

        const netChange = newDelta - oldDelta;
        const newStock = curStock + netChange;
        if (newStock < 0) {
          throw new Error('পর্যাপ্ত Stock নেই');
        }

        tx.update(pRef, {
          stock: newStock,
          stockQuantity: newStock,
          updatedAt: serverTimestamp(),
        });

        tx.update(adjRef, clean({
          quantity: newDelta,
          adjustmentType: type,
          reason: input.reason,
          note: input.note || '',
          newStock,
          updatedAt: serverTimestamp(),
        }));

        // Update movement if it exists
        if (stmSnap.exists()) {
          tx.update(stmRef, clean({
            quantity: newDelta,
            type: type as StockMovementType,
            newStock,
            note: `${type}: ${input.reason}`,
            updatedAt: serverTimestamp(),
          }));
        }
      });
    } catch (err: any) {
      console.error("STOCK ADJUSTMENT FIRESTORE ERROR", {
        code: err?.code,
        message: err?.message,
        name: err?.name,
      });
      console.error('STOCK ADJUSTMENT ERROR', {
        code: err?.code || 'unknown',
        message: err?.message || 'Stock adjustment update failed',
        uid: auth.currentUser?.uid,
        email: auth.currentUser?.email,
        userDocPath: auth.currentUser ? `users/${auth.currentUser.uid}` : null,
        userRole: adminData?.role || 'admin',
        adjustmentId,
        collectionsWritten: ['products', 'stockMovements', 'stockAdjustments'],
      });
      throw err;
    }
  },

  async deleteStockAdjustment(adjustmentId: string) {
    const adminData = await this.verifyAdminUser('deleteStockAdjustment');
    const adjRef = doc(db, 'stockAdjustments', adjustmentId);

    try {
      await runTransaction(db, async (tx) => {
        const adjSnap = await tx.get(adjRef);
        if (!adjSnap.exists()) return;
        const adj = adjSnap.data() as StockAdjustment;

        const pRef = doc(db, 'products', adj.productId);
        const stmRef = doc(db, 'stockMovements', `STM-${adjustmentId}`);

        // ALL READS MUST PRECEDE ALL WRITES
        const pSnap = await tx.get(pRef);
        const stmSnap = await tx.get(stmRef);

        if (pSnap.exists()) {
          const curStock = Number(pSnap.data().stockQuantity ?? pSnap.data().stock ?? 0);
          const rollbackStock = curStock - (Number(adj.quantity) || 0);
          if (rollbackStock < 0) {
            throw new Error('পর্যাপ্ত Stock নেই');
          }
          tx.update(pRef, {
            stock: rollbackStock,
            stockQuantity: rollbackStock,
            updatedAt: serverTimestamp(),
          });
        }

        tx.delete(adjRef);

        if (stmSnap.exists()) {
          tx.delete(stmRef);
        }
      });
    } catch (err: any) {
      console.error("STOCK ADJUSTMENT FIRESTORE ERROR", {
        code: err?.code,
        message: err?.message,
        name: err?.name,
      });
      console.error('STOCK ADJUSTMENT ERROR', {
        code: err?.code || 'unknown',
        message: err?.message || 'Stock adjustment delete failed',
        uid: auth.currentUser?.uid,
        email: auth.currentUser?.email,
        userDocPath: auth.currentUser ? `users/${auth.currentUser.uid}` : null,
        userRole: adminData?.role || 'admin',
        adjustmentId,
        collectionsWritten: ['products', 'stockAdjustments', 'stockMovements'],
      });
      throw err;
    }
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

      // Deduplicate products to get clean list of unique product IDs and aggregated quantities
      const productQtyMap = new Map<string, number>();
      for (const item of order.items) {
        const qty = Number(item.quantity) || 0;
        productQtyMap.set(item.productId, (productQtyMap.get(item.productId) || 0) + qty);
      }

      const uniqueProductIds = Array.from(productQtyMap.keys());
      const productRefs = uniqueProductIds.map((pid) => doc(db, 'products', pid));
      const productSnaps = await Promise.all(productRefs.map((ref) => tx.get(ref)));

      const productSnapMap = new Map<string, any>();
      for (let i = 0; i < uniqueProductIds.length; i++) {
        const snap = productSnaps[i];
        if (snap.exists()) {
          productSnapMap.set(uniqueProductIds[i], snap.data());
        }
      }

      // Check stock availability for all unique items
      for (const [pid, totalQty] of productQtyMap.entries()) {
        const pData = productSnapMap.get(pid);
        const currentStock = Number(pData?.stockQuantity ?? pData?.stock ?? 0);
        if (currentStock < totalQty) {
          throw new Error('পর্যাপ্ত Stock নেই');
        }
      }

      const saleItems: any[] = [];
      let totalCost = 0;

      for (const item of order.items) {
        const p = productSnapMap.get(item.productId) || {};
        const costPrice = Number(p.purchasePrice ?? p.costPrice ?? item.price ?? 0);
        const quantity = Number(item.quantity) || 0;
        const itemSales = Number(item.price) * quantity;
        const itemCost = costPrice * quantity;
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
      }

      // 1. Update product stocks (each unique product updated once)
      for (let i = 0; i < uniqueProductIds.length; i++) {
        const pid = uniqueProductIds[i];
        const pRef = productRefs[i];
        const pData = productSnapMap.get(pid) || {};
        const curStock = Number(pData.stockQuantity ?? pData.stock ?? 0);
        const deductQty = productQtyMap.get(pid) || 0;
        const newStock = Math.max(0, curStock - deductQty);

        tx.update(pRef, {
          stock: newStock,
          stockQuantity: newStock,
          updatedAt: serverTimestamp(),
        });
      }

      // 2. Create stock movement for each item with unique ID
      for (let idx = 0; idx < order.items.length; idx++) {
        const item = order.items[idx];
        const p = productSnapMap.get(item.productId) || {};
        const costPrice = Number(p.purchasePrice ?? p.costPrice ?? item.price ?? 0);
        const quantity = Number(item.quantity) || 0;
        const curStock = Number(p.stockQuantity ?? p.stock ?? 0);
        const movementId = `STM-${order.id}-${item.productId}-${idx}`;

        tx.set(
          doc(db, 'stockMovements', movementId),
          clean({
            movementId,
            productId: item.productId,
            productName: item.titleEn || item.titleBn || item.productName || '',
            type: 'SALE',
            movementType: 'sale',
            quantity: -quantity,
            previousStock: curStock,
            newStock: Math.max(0, curStock - (productQtyMap.get(item.productId) || quantity)),
            unitCost: costPrice,
            totalValue: quantity * costPrice,
            referenceType: 'sale',
            referenceId: saleId,
            orderId: order.id,
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

  async updateSale(
    saleId: string,
    input: Partial<Sale>
  ) {
    if (!auth.currentUser) throw new Error('USER_NOT_AUTHENTICATED');
    await updateDoc(doc(db, 'sales', saleId), clean({
      ...input,
      updatedAt: serverTimestamp(),
    }));
  },

  async deleteSale(saleId: string) {
    if (!auth.currentUser) throw new Error('USER_NOT_AUTHENTICATED');
    const saleRef = doc(db, 'sales', saleId);

    await runTransaction(db, async (tx) => {
      const saleSnap = await tx.get(saleRef);
      if (!saleSnap.exists()) return;
      const sale = saleSnap.data() as Sale;

      const items = sale.items || [];
      const productQtyMap = new Map<string, number>();
      for (const item of items) {
        const qty = Number(item.quantity) || 0;
        productQtyMap.set(item.productId, (productQtyMap.get(item.productId) || 0) + qty);
      }

      const uniqueProductIds = Array.from(productQtyMap.keys());
      const productDocRefs = uniqueProductIds.map((pid) => doc(db, 'products', pid));
      const movementDocRefs = items.map((item, idx) => doc(db, 'stockMovements', `STM-${sale.orderId}-${item.productId}-${idx}`));
      const legacyMovementRefs = items.map((item) => doc(db, 'stockMovements', `STM-${sale.orderId}-${item.productId}`));
      const ctxRef = doc(db, 'cashTransactions', `CTX-SALE-${sale.orderId}`);

      // ALL READS MUST PRECEDE ALL WRITES
      const productSnaps = await Promise.all(productDocRefs.map((ref) => tx.get(ref)));
      const movementSnaps = await Promise.all(movementDocRefs.map((ref) => tx.get(ref)));
      const legacyMovementSnaps = await Promise.all(legacyMovementRefs.map((ref) => tx.get(ref)));
      const ctxSnap = await tx.get(ctxRef);

      const productSnapMap = new Map<string, any>();
      for (let i = 0; i < uniqueProductIds.length; i++) {
        const snap = productSnaps[i];
        if (snap.exists()) {
          productSnapMap.set(uniqueProductIds[i], snap.data());
        }
      }

      // 1. Restore stock for unique products
      for (let i = 0; i < uniqueProductIds.length; i++) {
        const pid = uniqueProductIds[i];
        const pRef = productDocRefs[i];
        const pData = productSnapMap.get(pid);
        if (!pData) continue;

        const curStock = Number(pData.stockQuantity ?? pData.stock ?? 0);
        const restoreQty = productQtyMap.get(pid) || 0;
        const restoredStock = curStock + restoreQty;

        tx.update(pRef, {
          stock: restoredStock,
          stockQuantity: restoredStock,
          updatedAt: serverTimestamp(),
        });
      }

      // 2. Delete sale stock movements
      for (let i = 0; i < items.length; i++) {
        if (movementSnaps[i]?.exists()) {
          tx.delete(movementDocRefs[i]);
        }
        if (legacyMovementSnaps[i]?.exists()) {
          tx.delete(legacyMovementRefs[i]);
        }
      }

      // 3. Delete linked cash transaction if any
      if (ctxSnap.exists()) {
        tx.delete(ctxRef);
      }

      // 4. Delete sale
      tx.delete(saleRef);
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

