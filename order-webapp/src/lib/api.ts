// Client gọi API /api/customer/** trên web chính (thucphamsomot.vn). App này
// (dat-hang.thucphamsomot.vn) là origin KHÁC hoàn toàn — không dùng cookie
// (httpOnly cookie của web chính không đọc/gửi được từ origin khác), mà dùng
// Authorization: Bearer <orderSessionToken> lưu trong localStorage, đúng cơ
// chế Zalo Mini App đang dùng. Các route /api/customer/** hầu hết đã có sẵn
// header CORS "Access-Control-Allow-Origin: *" nên gọi cross-origin được
// ngay (xem README.md mục "Backend cần vá thêm" cho 2 route còn thiếu).
const API_BASE = (
  import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.DEV ? '' : 'https://thucphamsomot.vn')
).replace(/\/$/, '');

const TOKEN_KEY = 'tps1_order_session_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request<T = any>(
  path: string,
  opts: { method?: string; body?: unknown; auth?: boolean; formData?: FormData; signal?: AbortSignal } = {}
): Promise<T> {
  const { method = 'GET', body, auth = true, formData, signal } = opts;
  const headers: Record<string, string> = {};
  if (!formData) headers['Content-Type'] = 'application/json';
  if (auth) {
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: formData ? formData : body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  });
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    // vd tải file nhị phân (PDF) — để caller tự xử lý res gốc qua requestRaw
  }
  if (!res.ok || (data && data.ok === false)) {
    throw new ApiError(data?.error || `Lỗi máy chủ (${res.status})`, res.status, data?.code);
  }
  return data as T;
}

export async function requestFile(path: string): Promise<Blob> {
  const token = getToken();
  const url = new URL(`${API_BASE}${path}`, window.location.href);
  const res = await fetch(url.toString(), { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new ApiError(data?.error || 'Không tải được tệp', res.status);
  }
  return res.blob();
}

export interface CustomerSession {
  id: string;
  code: string;
  name: string;
  phone: string;
  company: string;
  email?: string;
  taxCode?: string;
  address?: string;
  defaultShippingAddress?: { alias: string; address: string; name: string; phone: string };
  tier: string;
  discountPercent: number;
  verificationStatus?: 'pending' | 'verified' | 'rejected';
  mustChangePassword: boolean;
  orderSessionToken?: string;
}

export interface AccountProfile { name: string; company: string; taxCode: string; username: string; usernameChangedAt: string | null; avatarUrl: string | null; request: { id: string; company: string; tax_code: string; status: string; note?: string } | null }
export const api = {
  account: () => request<{ ok: true; account: AccountProfile }>('/api/customer/account'),
  saveAccount: (body: { name: string; company: string; taxCode: string }) => request<{ ok: true; account: AccountProfile }>('/api/customer/account', { method: 'PATCH', body }),
  saveUsername: (username: string) => request<{ ok: true; username: string }>('/api/customer/username', { method: 'PATCH', body: { username } }),
  uploadAvatar: (file: File) => { const formData = new FormData(); formData.set('avatar', file); return request<{ ok: true; account: AccountProfile }>('/api/customer/account', { method: 'POST', formData }); },
  register: (payload: { name: string; company: string; phone: string; username: string; email: string; password: string }) =>
    request<{ ok: true; account: { id: string; code: string; verificationStatus: 'pending' } }>(
      '/api/customer/register', { method: 'POST', auth: false, body: { ...payload, confirmPassword: payload.password, source: 'website' } }),
  login: (identifier: string, password: string) =>
    request<{ ok: true; session: CustomerSession }>('/api/customer/login', {
      method: 'POST',
      body: { identifier, password },
      auth: false,
    }),

  changePassword: (oldPassword: string, newPassword: string) =>
    request<{ ok: true; session: CustomerSession }>('/api/customer/change-password', {
      method: 'POST',
      body: { oldPassword, newPassword },
    }),

  session: () => request<{ ok: true; session: CustomerSession }>('/api/customer/session'),
  addresses: () => request<{ok:true;addresses:{id:string;label:string;address:string;contactName:string;contactPhone:string;isDefault:boolean}[]}>('/api/customer/addresses'),
  addAddress: (body:{label:string;address:string;contactName:string;contactPhone:string;isDefault:boolean}) => request<{ok:true}>('/api/customer/addresses',{method:'POST',body}),
  setDefaultAddress: (id:string) => request<{ok:true}>('/api/customer/addresses',{method:'PATCH',body:{id,isDefault:true}}),
  deleteAddress: (id:string) => request<{ok:true}>(`/api/customer/addresses?id=${encodeURIComponent(id)}`,{method:'DELETE'}),

  products: (params: { search?: string; category?: string; page?: number } = {}, signal?: AbortSignal) => {
    const qs = new URLSearchParams();
    if (params.search) qs.set('search', params.search);
    if (params.category) qs.set('category', params.category);
    qs.set('page', String(params.page || 0));
    return request<{ ok: true; total: number; page: number; pageSize: number; products: Product[] }>(
      `/api/customer/products?${qs}`,
      { signal }
    );
  },
  productCategories: () =>
    request<{ ok: true; categories: string[] }>('/api/customer/products?meta=1'),
  productCatalog: (signal?: AbortSignal) =>
    request<ProductCatalogResponse>('/api/customer/products?catalog=1', { signal }),

  orders: () => request<{ ok: true; orders: Order[] }>('/api/customer/orders'),
  orderConfig: () =>
    request<{
      ok: true;
      earliestDate: string;
      deliveryDate: string;
      cutoffAt: string;
      cutoffTimeStr: string;
      minutesLeft: number;
      isLate: boolean;
    }>('/api/customer/order-config'),
  frequentItems: (signal?: AbortSignal) => request<{ ok: true; items: FrequentItem[] }>('/api/customer/frequent-items', { signal }),

  createOrder: (payload: {
    items: { productId: string; name: string; quantity: number; note?: string; sourceImportLineId?: string }[];
    deliveryAlias?: string;
    deliveryAddress: string;
    deliveryName: string;
    deliveryPhone: string;
    deliveryDate?: string;
    note?: string;
    idempotencyKey: string;
    sourceImportBatchId?: string;
  }) =>
    request<{ ok: true; orderId: string; orderCode: string; total: number; pendingPriceCount: number }>('/api/customer/order', {
      method: 'POST',
      body: {
        source: 'website',
        orderSessionToken: getToken(),
        deliveryType: 'shipping',
        ...payload,
      },
    }),

  cancelOrder: (orderId: string, cancelReason: string) =>
    request<{ ok: true; orderId: string; status: 'canceled' }>('/api/customer/orders/cancel', {
      method: 'POST',
      body: { orderId, cancelReason },
    }),

  importExcel: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('token', getToken() || '');
    return request<{ ok: true; results: ExcelMatchResult[]; summary: Record<string, number> }>(
      '/api/customer/order/import-excel',
      { method: 'POST', formData: fd }
    );
  },

  vapidPublicKey: () =>
    request<{ ok: true; publicKey: string }>('/api/push/vapid-public-key', { auth: false }),

  pushSubscribe: (sub: PushSubscriptionJSON) =>
    request<{ ok: true }>('/api/customer/push-subscribe', { method: 'POST', body: sub }),

  pushUnsubscribe: (endpoint: string) =>
    request<{ ok: true }>('/api/customer/push-subscribe', { method: 'DELETE', body: { endpoint } }),
};

export interface Product {
  id: string;
  sku: string;
  name: string;
  category: string | null;
  unit: string;
  imageUrl: string | null;
  thumbUrl?: string | null;
  price: number;
  priceOnRequest?: boolean;
  available: boolean;
  stockQty?: number;
  minOrderQty?: number | null;
  orderStep?: number | null;
  enforceOrderStep?: boolean | null;
  packagingNote?: string | null;
  quantityPrecision?: number | null;
}

export type ProductCatalogTuple = [
  id: string,
  sku: string,
  name: string,
  category: string | null,
  unit: string,
  price: number,
  priceOnRequest: boolean,
  hasImage: boolean,
];

export interface ProductCatalogResponse {
  ok: true;
  count: number;
  imageBaseUrl: string;
  items: ProductCatalogTuple[];
}

export interface Order {
  id: string;
  order_code: string;
  status: string;
  payment_status: string;
  payment_method?: string;
  created_at: string;
  delivery_date?: string | null;
  delivery_address?: string;
  delivery_name?: string;
  delivery_phone?: string;
  delivery_type?: string;
  grand_total: number;
  subtotal?: number;
  discount_amount?: number;
  shipping_amount?: number;
  paid_amount?: number;
  debt_amount?: number;
  note?: string;
  customer_tier?: string;
  customer_phone?: string;
  invoice_document_id?: string | null;
  confirmation_document_id?: string | null;
  items: {
    id: string;
    productId: string;
    sku?: string;
    name: string;
    unit?: string;
    quantity: number;
    price: number;
    finalUnitPrice?: number;
    lineTotal?: number;
    finalLineTotal?: number;
    customerNote?: string;
    itemNote?: string;
  }[];
}

export interface FrequentItem {
  productId: string;
  sku?: string;
  name: string;
  category?: string | null;
  unit?: string;
  price: number;
  priceOnRequest?: boolean;
  imageUrl?: string | null;
  totalQuantity?: number;
  orderCount?: number;
}

export interface ExcelMatchResult {
  row: number;
  input: string;
  quantity: number;
  note: string;
  status: 'matched' | 'ambiguous' | 'not_found' | 'invalid_quantity';
  product?: { id: string; sku: string; name: string; unit: string; price: number; priceOnRequest: boolean };
  suggestions?: { id: string; sku: string; name: string; unit: string; price: number; priceOnRequest: boolean; score: number }[];
}
