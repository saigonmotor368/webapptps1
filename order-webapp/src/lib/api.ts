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
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
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
    throw new ApiError(data?.error || `Lỗi máy chủ (${res.status})`, res.status);
  }
  return data as T;
}

export async function requestFile(path: string): Promise<Blob> {
  const token = getToken();
  const url = new URL(`${API_BASE}${path}`, window.location.href);
  if (token) url.searchParams.set('sessionToken', token);
  const res = await fetch(url.toString());
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

export const api = {
  login: (code: string, password: string) =>
    request<{ ok: true; session: CustomerSession }>('/api/customer/login', {
      method: 'POST',
      body: { code, password },
      auth: false,
    }),

  changePassword: (oldPassword: string, newPassword: string) =>
    request<{ ok: true; session: CustomerSession }>('/api/customer/change-password', {
      method: 'POST',
      body: { oldPassword, newPassword },
    }),

  session: () => request<{ ok: true; session: CustomerSession }>('/api/customer/session'),

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

  orders: () => request<{ ok: true; orders: Order[] }>('/api/customer/orders'),

  createOrder: (payload: {
    items: { productId: string; name: string; quantity: number }[];
    deliveryAlias?: string;
    deliveryAddress: string;
    deliveryName: string;
    deliveryPhone: string;
    note?: string;
    idempotencyKey: string;
  }) =>
    request<{ ok: true; orderId: string; orderCode: string; total: number }>('/api/customer/order', {
      method: 'POST',
      body: {
        source: 'website',
        orderSessionToken: getToken(),
        deliveryType: 'shipping',
        ...payload,
      },
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
}

export interface Order {
  id: string;
  order_code: string;
  status: string;
  payment_status: string;
  created_at: string;
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
    itemNote?: string;
  }[];
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
