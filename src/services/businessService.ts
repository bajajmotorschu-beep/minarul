import { auth, db } from '../firebase';
import {
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { Expense, Purchase, Sale, Supplier, StockMovement, Order } from '../types';

const clean = <T extends Record<string, any>>(value: T): T =>
  JSON.parse(JSON.stringify(value, (_key, v) => (v === undefined ? null : v)));

export const businessService = {
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

  async createSupplier(input: Omit<Supplier, 'id' | 'createdAt' | 'updatedAt'>) {
    if (!auth.currentUser) throw new Error('USER_NOT_AUTHENTICATED');
    const id = `SUP-${Date.now().toString(36).toUpperCase()}`;
    await setDoc(doc(db, 'suppliers', id), clean({ ...input, supplierId: id, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
  },

  async createExpense(input: Omit<Expense, 'id' | 'createdAt' | 'updatedAt'>) {
    if (!auth.currentUser) throw new Error('USER_NOT_AUTHENTICATED');
    const id = `EXP-${Date.now().toString(36).toUpperCase()}`;
    await setDoc(doc(db, 'expenses', id), clean({ ...input, expenseId: id, createdBy: auth.currentUser.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
  },

  async createPurchase(input: Omit<Purchase, 'id' | 'createdAt' | 'updatedAt'>) {
    if (!auth.currentUser) throw new Error('USER_NOT_AUTHENTICATED');
    const id = `PUR-${Date.now().toString(36).toUpperCase()}`;
    const purchase = { ...input, purchaseId: id, createdBy: auth.currentUser.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };

    await runTransaction(db, async (tx) => {
      const productRefs = input.items.map((item) => doc(db, 'products', item.productId));
      const productSnaps = await Promise.all(productRefs.map((ref) => tx.get(ref)));
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
        const newCost = quantity > 0 ? ((previousStock * oldCost) + (quantity * Number(item.unitCost))) / Math.max(newStock, 1) : oldCost;
        tx.update(productRefs[i], { stock: newStock, stockQuantity: newStock, purchasePrice: newCost, updatedAt: serverTimestamp() });
        const movementId = `STM-${id}-${item.productId}`;
        tx.set(doc(db, 'stockMovements', movementId), { movementId, productId: item.productId, productName: item.productName, movementType: 'purchase', quantity, previousStock, newStock, referenceType: 'purchase', referenceId: id, note: 'Purchase stock in', createdBy: auth.currentUser!.uid, createdAt: serverTimestamp() });
      }
    });
  },

  async ensureSaleForOrder(order: Order) {
    if (!auth.currentUser) throw new Error('USER_NOT_AUTHENTICATED');
    const saleId = `SALE-${order.id}`;
    const saleRef = doc(db, 'sales', saleId);

    await runTransaction(db, async (tx) => {
      const existing = await tx.get(saleRef);
      if (existing.exists()) return;
      const productRefs = order.items.map((item) => doc(db, 'products', item.productId));
      const productSnaps = await Promise.all(productRefs.map((ref) => tx.get(ref)));
      const saleItems: any[] = [];
      let totalCost = 0;
      const updates: any[] = [];

      for (let i = 0; i < order.items.length; i++) {
        const item = order.items[i];
        const p = productSnaps[i].exists() ? productSnaps[i].data() : {};
        const currentStock = Number(p.stockQuantity ?? p.stock ?? item.stock ?? 0);
        const quantity = Number(item.quantity) || 0;
        if (currentStock < quantity) throw new Error(`INSUFFICIENT_STOCK:${item.titleEn || item.titleBn || item.productId}`);
        const costPrice = Number(p.purchasePrice ?? p.costPrice ?? item.price ?? 0);
        const itemSales = Number(item.price) * quantity;
        const itemCost = costPrice * quantity;
        const newStock = currentStock - quantity;
        totalCost += itemCost;
        saleItems.push({ productId: item.productId, productName: item.titleEn || item.titleBn || item.productName || '', quantity, sellingPrice: Number(item.price), costPrice, totalSelling: itemSales, totalCost: itemCost });
        updates.push({ ref: productRefs[i], newStock, item, currentStock, quantity });
      }

      for (const u of updates) {
        tx.update(u.ref, { stock: u.newStock, stockQuantity: u.newStock, updatedAt: serverTimestamp() });
        const movementId = `STM-${order.id}-${u.item.productId}`;
        tx.set(doc(db, 'stockMovements', movementId), { movementId, productId: u.item.productId, productName: u.item.titleEn || u.item.titleBn || u.item.productName || '', movementType: 'sale', quantity: -u.quantity, previousStock: u.currentStock, newStock: u.newStock, referenceType: 'order', referenceId: order.id, note: 'Confirmed customer sale', createdBy: auth.currentUser!.uid, createdAt: serverTimestamp() });
      }

      const salesAmount = Number(order.totalAmount) || 0;
      tx.set(saleRef, { saleId, orderId: order.id, customerId: order.customerId || '', customerName: order.customerName || order.shippingAddress?.fullName || '', items: saleItems, subtotal: Number(order.subtotal) || 0, discount: Number(order.discount) || 0, deliveryCharge: Number(order.deliveryCharge) || 0, totalAmount: salesAmount, totalCost, grossProfit: salesAmount - totalCost, paymentMethod: order.paymentMethod, paymentStatus: order.paymentStatus, saleStatus: order.orderStatus, saleDate: serverTimestamp(), createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    });
  },

};
