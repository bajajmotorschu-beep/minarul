export type CategoryType = 'men' | 'women' | 'children' | 'festive';

export type SubCategoryType = 
  | 'panjabi' 
  | 'shirt' 
  | 'polo' 
  | 'pant' 
  | 'saree' 
  | 'three-piece' 
  | 'kurti' 
  | 'lehenga' 
  | 'frock' 
  | 'kids-panjabi' 
  | 'baby-set';

export interface ProductColor {
  nameEn: string;
  nameBn: string;
  hex: string;
}

export interface Product {
  id: string;
  titleEn: string;
  titleBn: string;
  category: CategoryType;
  subCategory: SubCategoryType;
  price: number;
  originalPrice?: number;
  images: string[];
  descriptionEn: string;
  descriptionBn: string;
  sizes: string[];
  colors: ProductColor[];
  stock: number;
  purchasePrice?: number;
  stockQuantity?: number;
  minimumStock?: number;
  supplierId?: string;
  isFeatured?: boolean;
  isNewArrival?: boolean;
  isBestSeller?: boolean;
  rating: number;
  reviewCount: number;
  fabric: string;
  sku: string;
  tags: string[];
}

export interface CartItem {
  productId: string;
  titleEn: string;
  titleBn: string;
  image: string;
  size: string;
  color: ProductColor;
  price: number;
  quantity: number;
  stock: number;
  purchasePrice?: number;
  stockQuantity?: number;
  minimumStock?: number;
  supplierId?: string;
}

export interface ShippingAddress {
  fullName: string;
  name?: string;
  phone: string;
  email?: string;
  division: string;
  district: string;
  address: string;
  notes?: string;
}

export type PaymentMethod = 'cod' | 'bkash' | 'nagad' | 'rocket';
export type PaymentStatus = 'pending' | 'submitted' | 'verified' | 'failed' | 'unpaid' | 'paid';
export type OrderStatus = 'pending' | 'confirmed' | 'packaging' | 'shipped' | 'delivered' | 'cancelled';

export interface OrderItem {
  productId: string;
  productName?: string;
  titleEn?: string;
  titleBn?: string;
  image: string;
  size: string;
  colorName: string;
  price: number;
  quantity: number;
}

export interface Order {
  id: string;
  orderId?: string;
  customerId?: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  shippingAddress: ShippingAddress;
  items: OrderItem[];
  subtotal: number;
  discount: number;
  couponCode?: string;
  deliveryCharge: number;
  totalAmount: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  senderMobile?: string;
  transactionId?: string;
  orderStatus: OrderStatus;
  courierName?: string;
  courierTrackingId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Coupon {
  id: string;
  code: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  minOrderValue: number;
  descriptionEn: string;
  descriptionBn: string;
  isActive: boolean;
}

export interface Review {
  id: string;
  productId: string;
  userId?: string;
  customerId?: string;
  userName: string;
  userPhoneMasked?: string;
  rating: number;
  comment: string;
  imageUrl?: string;
  productPhoto?: string;
  date: string;
  verifiedPurchase: boolean;
  createdAt?: any;
}

export interface Supplier {
  id: string;
  supplierId?: string;
  name: string;
  companyName?: string;
  phone: string;
  email?: string;
  address?: string;
  openingDue: number;
  notes?: string;
  createdAt?: any;
  updatedAt?: any;
}

export interface PurchaseItem {
  productId: string;
  productName: string;
  sku?: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
}

export interface Purchase {
  id: string;
  purchaseId?: string;
  supplierId: string;
  supplierName: string;
  purchaseDate: string;
  items: PurchaseItem[];
  subtotal: number;
  discount: number;
  transportCost: number;
  otherCost: number;
  grandTotal: number;
  paidAmount: number;
  dueAmount: number;
  paymentMethod: string;
  notes?: string;
  createdBy?: string;
  createdAt?: any;
  updatedAt?: any;
}

export interface Sale {
  id: string;
  saleId: string;
  orderId: string;
  customerId?: string;
  customerName?: string;
  items: Array<{ productId: string; productName: string; quantity: number; sellingPrice: number; costPrice: number; totalSelling: number; totalCost: number }>;
  subtotal: number;
  discount: number;
  deliveryCharge: number;
  totalAmount: number;
  totalCost: number;
  grossProfit: number;
  paymentMethod: string;
  paymentStatus: string;
  saleStatus: string;
  saleDate?: any;
  createdAt?: any;
  updatedAt?: any;
}

export interface Expense {
  id: string;
  expenseId?: string;
  category: string;
  description: string;
  amount: number;
  paymentMethod: string;
  expenseDate: string;
  reference?: string;
  notes?: string;
  createdBy?: string;
  createdAt?: any;
  updatedAt?: any;
}

export interface StockMovement {
  id?: string;
  movementId: string;
  productId: string;
  productName: string;
  movementType: string;
  quantity: number;
  previousStock: number;
  newStock: number;
  referenceType?: string;
  referenceId?: string;
  note?: string;
  createdBy?: string;
  createdAt?: any;
}

export interface SiteSettings {
  announcementEn: string;
  announcementBn: string;
  hotline: string;
  whatsapp: string;
  supportEmail: string;
  bkashMerchantNumber: string;
  nagadMerchantNumber: string;
  rocketMerchantNumber: string;
  dhakaDeliveryFee: number;
  outsideDhakaDeliveryFee: number;
  freeShippingThreshold: number;
  flagshipAddressEn: string;
  flagshipAddressBn: string;
}

export interface HeroSlide {
  id: string;
  badgeEn: string;
  badgeBn: string;
  titleEn: string;
  titleBn: string;
  subtitleEn: string;
  subtitleBn: string;
  image: string;
  category: CategoryType | 'all' | 'festive';
  isActive: boolean;
}

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: 'customer' | 'admin';
  address?: ShippingAddress;
  district?: string;
  division?: string;
}

