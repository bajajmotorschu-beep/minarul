import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, Boxes, CircleDollarSign, Plus, RefreshCw, ShoppingCart, Truck, Wallet, X } from 'lucide-react';
import { businessService } from '../../services/businessService';
import { Product, Purchase, Expense, Supplier, Sale } from '../../types';

interface Props { products: Product[]; onToast: (msg: string, type?: 'success'|'error'|'info') => void; }

const money = (n:number) => `৳${Number(n||0).toLocaleString('en-BD',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const today = () => new Date().toISOString().slice(0,10);

export const BusinessManagement: React.FC<Props> = ({ products, onToast }) => {
  const [purchases,setPurchases]=useState<Purchase[]>([]);
  const [expenses,setExpenses]=useState<Expense[]>([]);
  const [suppliers,setSuppliers]=useState<Supplier[]>([]);
  const [sales,setSales]=useState<Sale[]>([]);
  const [loading,setLoading]=useState(true);
  const [mode,setMode]=useState<'purchase'|'expense'|'supplier'>('purchase');
  const [supplier,setSupplier]=useState({name:'',companyName:'',phone:'',address:'',openingDue:0});
  const [expense,setExpense]=useState({category:'Shop Rent',description:'',amount:0,paymentMethod:'Cash',expenseDate:today(),notes:''});
  const [purchase,setPurchase]=useState({supplierId:'',date:today(),productId:'',quantity:1,unitCost:0,paidAmount:0,paymentMethod:'Cash',notes:''});

  const load=async()=>{
    setLoading(true);
    try { const [pu,ex,su,sa]=await Promise.all([businessService.getPurchases(),businessService.getExpenses(),businessService.getSuppliers(),businessService.getSales()]); setPurchases(pu);setExpenses(ex);setSuppliers(su);setSales(sa); }
    catch(e:any){ console.error(e); onToast(e?.message||'Business data load failed','error'); }
    finally{setLoading(false);}
  };
  useEffect(()=>{load();},[]);

  const totals=useMemo(()=>{
    const salesTotal=sales.reduce((s,x)=>s+Number(x.totalAmount||0),0);
    const cogs=sales.reduce((s,x)=>s+Number(x.totalCost||0),0);
    const purchaseTotal=purchases.reduce((s,x)=>s+Number(x.grandTotal||0),0);
    const expenseTotal=expenses.reduce((s,x)=>s+Number(x.amount||0),0);
    return {salesTotal,cogs,purchaseTotal,expenseTotal,gross:salesTotal-cogs,net:salesTotal-cogs-expenseTotal};
  },[sales,purchases,expenses]);

  const submitSupplier=async(e:React.FormEvent)=>{e.preventDefault();try{await businessService.createSupplier({...supplier,openingDue:Number(supplier.openingDue)});setSupplier({name:'',companyName:'',phone:'',address:'',openingDue:0});await load();onToast('Supplier saved','success')}catch(err:any){onToast(err?.message||'Supplier save failed','error')}};
  const submitExpense=async(e:React.FormEvent)=>{e.preventDefault();try{await businessService.createExpense({...expense,amount:Number(expense.amount)});setExpense({category:'Shop Rent',description:'',amount:0,paymentMethod:'Cash',expenseDate:today(),notes:''});await load();onToast('Expense saved','success')}catch(err:any){onToast(err?.message||'Expense save failed','error')}};
  const submitPurchase=async(e:React.FormEvent)=>{e.preventDefault();const p=products.find(x=>x.id===purchase.productId);const s=suppliers.find(x=>x.id===purchase.supplierId);if(!p||!s){onToast('Product and supplier select করুন','error');return;}const q=Number(purchase.quantity)||0,c=Number(purchase.unitCost)||0;try{await businessService.createPurchase({supplierId:s.id,supplierName:s.name,purchaseDate:purchase.date,items:[{productId:p.id,productName:p.titleEn||p.titleBn,sku:p.sku,quantity:q,unitCost:c,totalCost:q*c}],subtotal:q*c,discount:0,transportCost:0,otherCost:0,grandTotal:q*c,paidAmount:Number(purchase.paidAmount)||0,dueAmount:Math.max(0,q*c-(Number(purchase.paidAmount)||0)),paymentMethod:purchase.paymentMethod,notes:purchase.notes||''});setPurchase({supplierId:'',date:today(),productId:'',quantity:1,unitCost:0,paidAmount:0,paymentMethod:'Cash',notes:''});await load();onToast('Purchase saved and stock increased','success')}catch(err:any){console.error(err);onToast(err?.message||'Purchase failed','error')}};

  const stockValue=products.reduce((s,p)=>s+Number(p.stockQuantity ?? p.stock ?? 0)*Number(p.purchasePrice ?? 0),0);
  const lowStock=products.filter(p=>Number(p.stockQuantity ?? p.stock ?? 0)<=Number(p.minimumStock ?? 5));

  return <div className="space-y-6">
    <div className="flex items-center justify-between"><div><h2 className="font-serif text-2xl font-bold text-stone-900">Business Management</h2><p className="text-xs text-stone-500">Purchase • Stock • Sales • Expense • Profit & Loss • Balance</p></div><button onClick={load} className="px-3 py-2 rounded-xl border bg-white text-xs font-bold flex gap-2 items-center"><RefreshCw className="w-4 h-4"/> Refresh</button></div>
    <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
      {[['Sales',totals.salesTotal,CircleDollarSign],['Purchase',totals.purchaseTotal,ShoppingCart],['Gross Profit',totals.gross,BarChart3],['Expense',totals.expenseTotal,Wallet],['Net Profit',totals.net,CircleDollarSign],['Stock Value',stockValue,Boxes]].map(([label,val,Icon]:any)=><div key={label} className="bg-white border border-stone-200 rounded-2xl p-4"><Icon className="w-4 h-4 text-amber-700 mb-2"/><div className="text-[10px] text-stone-500">{label}</div><div className="font-serif font-bold text-lg">{money(val)}</div></div>)}
    </div>
    <div className="bg-white border border-stone-200 rounded-3xl p-5">
      <div className="flex flex-wrap gap-2 border-b pb-4 mb-5"><button onClick={()=>setMode('purchase')} className={`px-4 py-2 rounded-xl text-xs font-bold ${mode==='purchase'?'bg-amber-700 text-white':'bg-stone-100'}`}>Purchase / Stock In</button><button onClick={()=>setMode('expense')} className={`px-4 py-2 rounded-xl text-xs font-bold ${mode==='expense'?'bg-amber-700 text-white':'bg-stone-100'}`}>Expense</button><button onClick={()=>setMode('supplier')} className={`px-4 py-2 rounded-xl text-xs font-bold ${mode==='supplier'?'bg-amber-700 text-white':'bg-stone-100'}`}>Supplier</button></div>
      {mode==='purchase'&&<form onSubmit={submitPurchase} className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs"><select required value={purchase.supplierId} onChange={e=>setPurchase({...purchase,supplierId:e.target.value})} className="border rounded-xl p-3"><option value="">Select supplier</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select><select required value={purchase.productId} onChange={e=>{const p=products.find(x=>x.id===e.target.value);setPurchase({...purchase,productId:e.target.value,unitCost:Number(p?.purchasePrice||0)})}} className="border rounded-xl p-3"><option value="">Select product</option>{products.map(p=><option key={p.id} value={p.id}>{p.titleEn||p.titleBn}</option>)}</select><input type="date" value={purchase.date} onChange={e=>setPurchase({...purchase,date:e.target.value})} className="border rounded-xl p-3"/><input type="number" min="1" value={purchase.quantity} onChange={e=>setPurchase({...purchase,quantity:Number(e.target.value)})} placeholder="Quantity" className="border rounded-xl p-3"/><input type="number" min="0" value={purchase.unitCost} onChange={e=>setPurchase({...purchase,unitCost:Number(e.target.value)})} placeholder="Unit cost" className="border rounded-xl p-3"/><input type="number" min="0" value={purchase.paidAmount} onChange={e=>setPurchase({...purchase,paidAmount:Number(e.target.value)})} placeholder="Paid amount" className="border rounded-xl p-3"/><select value={purchase.paymentMethod} onChange={e=>setPurchase({...purchase,paymentMethod:e.target.value})} className="border rounded-xl p-3"><option>Cash</option><option>bKash</option><option>Nagad</option><option>Rocket</option><option>Bank</option></select><input value={purchase.notes} onChange={e=>setPurchase({...purchase,notes:e.target.value})} placeholder="Notes" className="border rounded-xl p-3 md:col-span-2"/><button className="md:col-span-3 bg-emerald-700 text-white rounded-xl p-3 font-bold"><Plus className="inline w-4 h-4 mr-1"/> Save Purchase & Increase Stock</button></form>}
      {mode==='expense'&&<form onSubmit={submitExpense} className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs"><select value={expense.category} onChange={e=>setExpense({...expense,category:e.target.value})} className="border rounded-xl p-3">{['Shop Rent','Electricity','Internet','Salary','Marketing','Facebook Ads','Packaging','Courier','Transport','Office Expense','Maintenance','Other'].map(x=><option key={x}>{x}</option>)}</select><input required value={expense.description} onChange={e=>setExpense({...expense,description:e.target.value})} placeholder="Description" className="border rounded-xl p-3"/><input required type="number" min="0" value={expense.amount} onChange={e=>setExpense({...expense,amount:Number(e.target.value)})} placeholder="Amount" className="border rounded-xl p-3"/><select value={expense.paymentMethod} onChange={e=>setExpense({...expense,paymentMethod:e.target.value})} className="border rounded-xl p-3"><option>Cash</option><option>bKash</option><option>Nagad</option><option>Rocket</option><option>Bank</option></select><input type="date" value={expense.expenseDate} onChange={e=>setExpense({...expense,expenseDate:e.target.value})} className="border rounded-xl p-3"/><input value={expense.notes} onChange={e=>setExpense({...expense,notes:e.target.value})} placeholder="Notes" className="border rounded-xl p-3"/><button className="md:col-span-3 bg-rose-700 text-white rounded-xl p-3 font-bold">Save Expense</button></form>}
      {mode==='supplier'&&<form onSubmit={submitSupplier} className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs"><input required value={supplier.name} onChange={e=>setSupplier({...supplier,name:e.target.value})} placeholder="Supplier name" className="border rounded-xl p-3"/><input value={supplier.companyName} onChange={e=>setSupplier({...supplier,companyName:e.target.value})} placeholder="Company" className="border rounded-xl p-3"/><input required value={supplier.phone} onChange={e=>setSupplier({...supplier,phone:e.target.value})} placeholder="Phone" className="border rounded-xl p-3"/><input value={supplier.address} onChange={e=>setSupplier({...supplier,address:e.target.value})} placeholder="Address" className="border rounded-xl p-3"/><input type="number" min="0" value={supplier.openingDue} onChange={e=>setSupplier({...supplier,openingDue:Number(e.target.value)})} placeholder="Opening due" className="border rounded-xl p-3"/><button className="bg-amber-700 text-white rounded-xl p-3 font-bold">Save Supplier</button></form>}
    </div>
    <div className="grid lg:grid-cols-2 gap-5">
      <div className="bg-white border border-stone-200 rounded-3xl p-5"><h3 className="font-bold mb-3 flex items-center gap-2"><Boxes className="w-4 h-4"/> Low Stock ({lowStock.length})</h3>{lowStock.slice(0,10).map(p=><div key={p.id} className="flex justify-between border-b py-2 text-xs"><span>{p.titleEn||p.titleBn}</span><b>{Number(p.stockQuantity??p.stock??0)} pcs</b></div>)}{!lowStock.length&&<p className="text-xs text-stone-500">No low-stock products.</p>}</div>
      <div className="bg-white border border-stone-200 rounded-3xl p-5"><h3 className="font-bold mb-3 flex items-center gap-2"><Truck className="w-4 h-4"/> Supplier Due</h3>{suppliers.map(s=>{const due=s.openingDue+purchases.filter(p=>p.supplierId===s.id).reduce((a,p)=>a+p.dueAmount,0);return <div key={s.id} className="flex justify-between border-b py-2 text-xs"><span>{s.name}</span><b>{money(due)}</b></div>})}</div>
    </div>
    <div className="bg-white border border-stone-200 rounded-3xl p-5"><h3 className="font-bold mb-3">Recent Purchases</h3>{loading?<div className="text-xs">Loading...</div>:purchases.slice(0,8).map(p=><div key={p.id} className="flex justify-between border-b py-2 text-xs"><span>{p.supplierName} • {p.purchaseDate}</span><b>{money(p.grandTotal)}</b></div>)}</div>
  </div>;
};
