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
      const expSnap = await tx.get(expRef);
      if (!expSnap.exists()) throw new Error('EXPENSE_NOT_FOUND');

      const updateData: any = {
        ...input,
        updatedAt: serverTimestamp(),
      };
      if (amount !== undefined) updateData.amount = amount;
      if (normalizedMethod) updateData.paymentMethod = normalizedMethod;

      tx.update(expRef, clean(updateData));

      // Also update linked cash transaction
      const txId = `CTX-${id}`;
      const ctxRef = doc(db, 'cashTransactions', txId);
      const ctxSnap = await tx.get(ctxRef);
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
      const expSnap = await tx.get(expRef);
      if (!expSnap.exists()) return;

      tx.delete(expRef);

      // Delete linked cash transaction
      const txId = `CTX-${id}`;
      const ctxRef = doc(db, 'cashTransactions', txId);
      const ctxSnap = await tx.get(ctxRef);
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
      const sSnap = await tx.get(supplierRef);
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
      const ctxId = `CTX-${paymentId}`;
      const ctxRef = doc(db, 'cashTransactions', ctxId);
      const ctxSnap = await tx.get(ctxRef);
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

      // Restore supplier due (undoing the payment)
      const supplierRef = doc(db, 'suppliers', oldPay.supplierId);
      const sSnap = await tx.get(supplierRef);
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
      const ctxId = `CTX-${paymentId}`;
      const ctxRef = doc(db, 'cashTransactions', ctxId);
      const ctxSnap = await tx.get(ctxRef);
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

      // 1. Stock adjustments for modified item quantities
      if (input.items && Array.isArray(input.items)) {
        const oldItemsMap = new Map<string, number>();
        for (const item of oldPur.items || []) {
          oldItemsMap.set(item.productId, Number(item.quantity) || 0);
        }

        for (const newItem of input.items) {
          const oldQty = oldItemsMap.get(newItem.productId) || 0;
          const newQty = Number(newItem.quantity) || 0;
          const delta = newQty - oldQty;

          if (delta !== 0) {
            const pRef = doc(db, 'products', newItem.productId);
            const pSnap = await tx.get(pRef);
            if (pSnap.exists()) {
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
      if (input.dueAmount !== undefined && oldPur.supplierId) {
        const oldDue = Number(oldPur.dueAmount) || 0;
        const newDue = Number(input.dueAmount) || 0;
        const dueDiff = newDue - oldDue;
        if (dueDiff !== 0) {
          const sRef = doc(db, 'suppliers', oldPur.supplierId);
          const sSnap = await tx.get(sRef);
          if (sSnap.exists()) {
            const curSupplierDue = Number(sSnap.data().currentDue ?? sSnap.data().openingDue ?? 0);
            tx.update(sRef, {
              currentDue: Math.max(0, curSupplierDue + dueDiff),
              updatedAt: serverTimestamp(),
            });
          }
        }
      }

      // 3. Update purchase document
      tx.update(purRef, clean({
        ...input,
        updatedAt: serverTimestamp(),
      }));

      // 4. Update downpayment if paidAmount changed
      if (input.paidAmount !== undefined) {
        const spayId = `SPAY-${purchaseId}`;
        const spayRef = doc(db, 'supplierPayments', spayId);
        const spaySnap = await tx.get(spayRef);
        if (spaySnap.exists()) {
          tx.update(spayRef, clean({
            paymentAmount: Number(input.paidAmount) || 0,
            paymentMethod: input.paymentMethod || oldPur.paymentMethod,
            updatedAt: serverTimestamp(),
          }));
        }

        const ctxId = `CTX-${spayId}`;
        const ctxRef = doc(db, 'cashTransactions', ctxId);
        const ctxSnap = await tx.get(ctxRef);
        if (ctxSnap.exists()) {
          tx.update(ctxRef, clean({
            amount: Number(input.paidAmount) || 0,
            paymentMethod: input.paymentMethod || oldPur.paymentMethod,
            updatedAt: serverTimestamp(),
          }));
        }
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

      // 1. Rollback stock for all items
      for (const item of pur.items || []) {
        const pRef = doc(db, 'products', item.productId);
        const pSnap = await tx.get(pRef);
        if (pSnap.exists()) {
          const pData = pSnap.data();
          const curStock = Number(pData.stockQuantity ?? pData.stock ?? 0);
          const rollbackStock = Math.max(0, curStock - (Number(item.quantity) || 0));
          tx.update(pRef, {
            stock: rollbackStock,
            stockQuantity: rollbackStock,
            updatedAt: serverTimestamp(),
          });

          // Delete purchase movement
          const mRef = doc(db, 'stockMovements', `STM-${purchaseId}-${item.productId}`);
          const mSnap = await tx.get(mRef);
          if (mSnap.exists()) {
            tx.delete(mRef);
          }

          // Log rollback movement
          const stmId = `STM-DEL-${purchaseId}-${item.productId}`;
          tx.set(
            doc(db, 'stockMovements', stmId),
            clean({
              movementId: stmId,
              productId: item.productId,
              productName: item.productName,
              type: 'PURCHASE_RETURN',
              movementType: 'purchase_return',
              quantity: -(Number(item.quantity) || 0),
              previousStock: curStock,
              newStock: rollbackStock,
              unitCost: Number(item.unitCost) || 0,
              totalValue: (Number(item.quantity) || 0) * (Number(item.unitCost) || 0),
              referenceType: 'purchase_deleted',
              referenceId: purchaseId,
              note: `Purchase #${purchaseId} deleted/rolled back`,
              createdBy: auth.currentUser!.uid,
              createdAt: serverTimestamp(),
            })
          );
        }
      }

      // 2. Rollback supplier due
      const dueAmount = Number(pur.dueAmount) || 0;
      if (pur.supplierId && dueAmount > 0) {
        const sRef = doc(db, 'suppliers', pur.supplierId);
        const sSnap = await tx.get(sRef);
        if (sSnap.exists()) {
          const curDue = Number(sSnap.data().currentDue ?? sSnap.data().openingDue ?? 0);
          tx.update(sRef, {
            currentDue: Math.max(0, curDue - dueAmount),
            updatedAt: serverTimestamp(),
          });
        }
      }

      // 3. Rollback paid amount if paid
      const spayId = `SPAY-${purchaseId}`;
      const spayRef = doc(db, 'supplierPayments', spayId);
      const spaySnap = await tx.get(spayRef);
      if (spaySnap.exists()) {
        tx.delete(spayRef);
      }

      const ctxId = `CTX-${spayId}`;
      const ctxRef = doc(db, 'cashTransactions', ctxId);
      const ctxSnap = await tx.get(ctxRef);
      if (ctxSnap.exists()) {
        tx.delete(ctxRef);
      }

      // 4. Delete purchase document
      tx.delete(purRef);
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

  async updateStockAdjustment(
    adjustmentId: string,
    input: {
      quantity: number;
      reason: string;
      note?: string;
      adjustmentType?: string;
    }
  ) {
    if (!auth.currentUser) throw new Error('USER_NOT_AUTHENTICATED');
    const adjRef = doc(db, 'stockAdjustments', adjustmentId);

    await runTransaction(db, async (tx) => {
      const adjSnap = await tx.get(adjRef);
      if (!adjSnap.exists()) throw new Error('ADJUSTMENT_NOT_FOUND');
      const oldAdj = adjSnap.data() as StockAdjustment;

      const pRef = doc(db, 'products', oldAdj.productId);
      const pSnap = await tx.get(pRef);
      if (!pSnap.exists()) throw new Error('PRODUCT_NOT_FOUND');
      const pData = pSnap.data();
      const curStock = Number(pData.stockQuantity ?? pData.stock ?? 0);

      const oldDelta = Number(oldAdj.quantity) || 0;
      const type = input.adjustmentType || oldAdj.adjustmentType;
      let newDelta = Math.abs(Number(input.quantity) || 0);
      if (['ADJUSTMENT_OUT', 'DAMAGE', 'LOST'].includes(type)) {
        newDelta = -newDelta;
      }

      const netChange = newDelta - oldDelta;
      const newStock = Math.max(0, curStock + netChange);

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

      // Update movement
      const stmRef = doc(db, 'stockMovements', `STM-${adjustmentId}`);
      const stmSnap = await tx.get(stmRef);
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
  },

  async deleteStockAdjustment(adjustmentId: string) {
    if (!auth.currentUser) throw new Error('USER_NOT_AUTHENTICATED');
    const adjRef = doc(db, 'stockAdjustments', adjustmentId);

    await runTransaction(db, async (tx) => {
      const adjSnap = await tx.get(adjRef);
      if (!adjSnap.exists()) return;
      const adj = adjSnap.data() as StockAdjustment;

      const pRef = doc(db, 'products', adj.productId);
      const pSnap = await tx.get(pRef);
      if (pSnap.exists()) {
        const curStock = Number(pSnap.data().stockQuantity ?? pSnap.data().stock ?? 0);
        const rollbackStock = Math.max(0, curStock - (Number(adj.quantity) || 0));
        tx.update(pRef, {
          stock: rollbackStock,
          stockQuantity: rollbackStock,
          updatedAt: serverTimestamp(),
        });
      }

      tx.delete(adjRef);

      const stmRef = doc(db, 'stockMovements', `STM-${adjustmentId}`);
      const stmSnap = await tx.get(stmRef);
      if (stmSnap.exists()) {
        tx.delete(stmRef);
      }
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

      // 1. Restore stock
      for (const item of sale.items || []) {
        const pRef = doc(db, 'products', item.productId);
        const pSnap = await tx.get(pRef);
        if (pSnap.exists()) {
          const curStock = Number(pSnap.data().stockQuantity ?? pSnap.data().stock ?? 0);
          const restoredStock = curStock + (Number(item.quantity) || 0);
          tx.update(pRef, {
            stock: restoredStock,
            stockQuantity: restoredStock,
            updatedAt: serverTimestamp(),
          });

          // Delete sale stock movement
          const mRef = doc(db, 'stockMovements', `STM-${sale.orderId}-${item.productId}`);
          const mSnap = await tx.get(mRef);
          if (mSnap.exists()) {
            tx.delete(mRef);
          }
        }
      }

      // 2. Delete linked cash transaction if any
      const ctxRef = doc(db, 'cashTransactions', `CTX-SALE-${sale.orderId}`);
      const ctxSnap = await tx.get(ctxRef);
      if (ctxSnap.exists()) {
        tx.delete(ctxRef);
      }

      // 3. Delete sale
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

