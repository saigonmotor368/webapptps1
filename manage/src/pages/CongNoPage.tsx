import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { can } from '../lib/permissions';
import {
  Wallet,
  RefreshCw,
  Search,
  CheckCircle2,
  FileSpreadsheet,
  FileText,
  CreditCard,
  RotateCcw,
  Plus,
  Truck,
  Flame,
  X,
  ChevronRight,
  Landmark,
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

function money(v: number | string | null | undefined): string {
  const n = Math.round(Number(v) || 0);
  return new Intl.NumberFormat('vi-VN').format(n) + 'đ';
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('vi-VN');
  } catch {
    return '—';
  }
}

interface CustomerSummaryItem {
  customer: {
    id: string;
    partner_code: string;
    name: string;
    company: string | null;
    phone: string | null;
    tax_code: string | null;
    address: string | null;
    sales_rep_id: string | null;
    sales_rep_name: string | null;
    credit_limit: number;
    payment_terms_days: number;
  };
  totalReceivables: number;
  openingDebt: number;
  invoiceDebt: number;
  notDueDebt: number;
  overdueDebt: number;
  codUncollectedDebt: number;
  customerAdvance: number;
  openInvoiceCount: number;
  codUncollectedCount: number;
  overdueCount: number;
  creditLimit: number;
  remainingCreditLimit: number;
  isOverLimit: boolean;
  creditUsagePercent: number | null;
  oldestDueDate: string | null;
  aging: {
    notDue: number;
    days1_30: number;
    days31_60: number;
    days61_90: number;
    daysOver90: number;
  };
  invoices: any[];
}

export default function CongNoPage() {
  const { token, user } = useAuth();
  const canEditFinance = can(user?.role, 'finance.edit');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Global summary state
  const [summary, setSummary] = useState<any>(null);
  const [customers, setCustomers] = useState<CustomerSummaryItem[]>([]);

  // Selected customer for detail drawer / statement
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [customerDetail, setCustomerDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<'invoices' | 'receipts' | 'adjustments'>('invoices');
  const detailPanelRef = useRef<HTMLElement | null>(null);

  // Filter toolbar state
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSalesRep, setSelectedSalesRep] = useState('all');
  const [dueStatusFilter, setDueStatusFilter] = useState('all');
  const [methodFilter, setMethodFilter] = useState('all');
  const [overLimitOnly, setOverLimitOnly] = useState(false);
  const [sortBy, setSortBy] = useState<'total_debt_desc' | 'overdue_desc' | 'due_date_asc' | 'name_asc'>('total_debt_desc');

  // Modal: Payment Recording
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<'bank_transfer' | 'cash'>('bank_transfer');
  const [paymentRefCode, setPaymentRefCode] = useState('');
  const [paymentNote, setPaymentNote] = useState('');
  const [paymentIdempotencyKey, setPaymentIdempotencyKey] = useState<string>('');
  const [customAllocations, setCustomAllocations] = useState<Record<string, number>>({});
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);

  // Modal: Reversal (Phiếu đảo)
  const [reversalModalOpen, setReversalModalOpen] = useState(false);
  const [selectedReceiptForReversal, setSelectedReceiptForReversal] = useState<any>(null);
  const [reversalReason, setReversalReason] = useState('');
  const [isSubmittingReversal, setIsSubmittingReversal] = useState(false);

  // Modal: Due Date Adjust
  const [dueDateModalOpen, setDueDateModalOpen] = useState(false);
  const [selectedInvoiceForDueDate, setSelectedInvoiceForDueDate] = useState<any>(null);
  const [newDueDate, setNewDueDate] = useState('');
  const [isSubmittingDueDate, setIsSubmittingDueDate] = useState(false);

  // Statement date range
  const [statementFrom, setStatementFrom] = useState('');
  const [statementTo, setStatementTo] = useState('');

  // 1. Fetch Global Summary
  const fetchSummary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/admin/receivables/summary`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Không tải được sổ công nợ');
      }
      setSummary(data.summary);
      setCustomers(data.summary?.customers || []);
    } catch (err: any) {
      setError(err?.message || 'Lỗi tải dữ liệu');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  // 2. Fetch Customer Detail
  const fetchCustomerDetail = useCallback(async (customerId: string) => {
    setDetailLoading(true);
    setDetailError(null);
    try {
      const res = await fetch(`${API_BASE}/api/admin/receivables/customers/${customerId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Không tải được sổ nợ khách hàng');
      }
      setCustomerDetail(data);
    } catch (err: any) {
      console.error('Lỗi tải chi tiết khách hàng:', err);
      setCustomerDetail(null);
      setDetailError(err?.message || 'Không tải được sổ nợ khách hàng');
    } finally {
      setDetailLoading(false);
    }
  }, [token]);

  const handleSelectCustomer = (customerId: string) => {
    setCustomerDetail(null);
    setSelectedCustomerId(customerId);
    void fetchCustomerDetail(customerId);
  };

  // Khối sổ nợ nằm sau danh sách khách hàng. Tự chuyển đến khối chi tiết để
  // thao tác có phản hồi ngay, thay vì khiến người dùng tưởng nút không chạy.
  useEffect(() => {
    if (!selectedCustomerId) return;
    const frame = window.requestAnimationFrame(() => {
      detailPanelRef.current?.scrollIntoView({ behavior: 'auto', block: 'start' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [selectedCustomerId]);

  // Distinct list of sales reps for dropdown
  const salesRepList = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of customers) {
      if (c.customer.sales_rep_id && c.customer.sales_rep_name) {
        map.set(c.customer.sales_rep_id, c.customer.sales_rep_name);
      }
    }
    return Array.from(map.entries());
  }, [customers]);

  // Filtered & Sorted Customer List
  const filteredCustomers = useMemo(() => {
    return customers
      .filter((item) => {
        // Search term
        if (searchTerm.trim()) {
          const q = searchTerm.toLowerCase().trim();
          const matchCode = item.customer.partner_code.toLowerCase().includes(q);
          const matchName = item.customer.name.toLowerCase().includes(q);
          const matchCompany = (item.customer.company || '').toLowerCase().includes(q);
          const matchPhone = (item.customer.phone || '').includes(q);
          if (!matchCode && !matchName && !matchCompany && !matchPhone) return false;
        }

        // Sale rep
        if (selectedSalesRep !== 'all') {
          if (item.customer.sales_rep_id !== selectedSalesRep) return false;
        }

        // Due status
        if (dueStatusFilter === 'overdue' && item.overdueDebt <= 0) return false;
        if (dueStatusFilter === 'not_due' && item.notDueDebt <= 0) return false;
        if (dueStatusFilter === 'cod_uncollected' && item.codUncollectedDebt <= 0) return false;

        // COD vs Credit
        if (methodFilter === 'cod' && item.codUncollectedDebt <= 0) return false;
        if (methodFilter === 'credit' && item.invoiceDebt - item.codUncollectedDebt <= 0) return false;

        // Over limit only
        if (overLimitOnly && !item.isOverLimit) return false;

        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'total_debt_desc') return b.totalReceivables - a.totalReceivables;
        if (sortBy === 'overdue_desc') return b.overdueDebt - a.overdueDebt;
        if (sortBy === 'due_date_asc') {
          if (!a.oldestDueDate) return 1;
          if (!b.oldestDueDate) return -1;
          return new Date(a.oldestDueDate).getTime() - new Date(b.oldestDueDate).getTime();
        }
        if (sortBy === 'name_asc') return a.customer.name.localeCompare(b.customer.name, 'vi');
        return 0;
      });
  }, [customers, searchTerm, selectedSalesRep, dueStatusFilter, methodFilter, overLimitOnly, sortBy]);

  // Open Payment Modal & Prep FIFO Allocation
  const handleOpenPaymentModal = () => {
    if (!customerDetail) return;
    const debt = customerDetail.customerSummary.totalReceivables;
    setPaymentAmount(debt > 0 ? String(debt) : '');
    setPaymentMethod('bank_transfer');
    setPaymentRefCode('');
    setPaymentNote('');

    // Gắn crypto.randomUUID() vào từng lần mở phiếu thu mới (giữ nguyên khi retry)
    const newKey = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
      ? crypto.randomUUID()
      : 'rcpt_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
    setPaymentIdempotencyKey(newKey);

    // Pre-fill with proposed allocations
    const initialAlloc: Record<string, number> = {};
    if (customerDetail.proposedAllocation?.allocations) {
      for (const al of customerDetail.proposedAllocation.allocations) {
        if (al.allocationType === 'opening_debt') {
          initialAlloc['opening_debt'] = al.amount;
        } else if (al.orderId) {
          initialAlloc[al.orderId] = al.amount;
        }
      }
    }
    setCustomAllocations(initialAlloc);
    setPaymentModalOpen(true);
  };

  // Re-calculate FIFO allocation when user changes paymentAmount in modal
  const handlePaymentAmountChange = (valStr: string) => {
    setPaymentAmount(valStr);
    const num = Math.max(0, Math.round(Number(valStr) || 0));
    if (!customerDetail) return;

    let remaining = num;
    const newAlloc: Record<string, number> = {};

    // 1. Nợ đầu kỳ trước
    const openingDebt = customerDetail.customerSummary.openingDebt || 0;
    if (openingDebt > 0 && remaining > 0) {
      const take = Math.min(openingDebt, remaining);
      newAlloc['opening_debt'] = take;
      remaining -= take;
    }

    // 2. Hóa đơn theo thứ tự
    const invs = [...(customerDetail.customerSummary.invoices || [])];
    for (const inv of invs) {
      if (remaining <= 0) break;
      const take = Math.min(inv.effective_debt, remaining);
      if (take > 0) {
        newAlloc[inv.id] = take;
        remaining -= take;
      }
    }

    setCustomAllocations(newAlloc);
  };

  // User manually edits an allocation line
  const handleSingleAllocChange = (key: string, maxDebt: number, valStr: string) => {
    const val = Math.max(0, Math.min(maxDebt, Math.round(Number(valStr) || 0)));
    setCustomAllocations((prev) => ({
      ...prev,
      [key]: val,
    }));
  };

  // Math summary in modal
  const totalAllocated = useMemo(() => {
    return Object.values(customAllocations).reduce((sum, v) => sum + (Number(v) || 0), 0);
  }, [customAllocations]);

  const parsedPaymentAmount = Math.max(0, Math.round(Number(paymentAmount) || 0));
  const unallocatedExcess = Math.max(0, parsedPaymentAmount - totalAllocated);
  const isOverAllocated = totalAllocated > parsedPaymentAmount;

  // Submit Payment Receipt
  const handleSubmitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerDetail || parsedPaymentAmount <= 0 || isSubmittingPayment || isOverAllocated) return;

    setIsSubmittingPayment(true);
    try {
      const allocationsPayload: any[] = [];
      if (customAllocations['opening_debt'] && customAllocations['opening_debt'] > 0) {
        allocationsPayload.push({
          allocationType: 'opening_debt',
          amount: customAllocations['opening_debt'],
        });
      }

      for (const [key, amt] of Object.entries(customAllocations)) {
        if (key !== 'opening_debt' && amt > 0) {
          allocationsPayload.push({
            allocationType: 'order',
            orderId: key,
            amount: amt,
          });
        }
      }

      const res = await fetch(`${API_BASE}/api/admin/receivables/receipts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': paymentIdempotencyKey,
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          customerId: customerDetail.customerSummary.customer.id,
          amount: parsedPaymentAmount,
          paymentMethod,
          referenceCode: paymentRefCode,
          note: paymentNote,
          allocations: allocationsPayload,
          idempotencyKey: paymentIdempotencyKey,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Ghi nhận thanh toán thất bại');
      }

      setPaymentModalOpen(false);
      await fetchCustomerDetail(customerDetail.customerSummary.customer.id);
      await fetchSummary();
    } catch (err: any) {
      alert(err.message || 'Lỗi khi ghi nhận thanh toán');
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  // Submit Reversal
  const handleSubmitReversal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReceiptForReversal || reversalReason.trim().length < 3 || isSubmittingReversal) return;

    setIsSubmittingReversal(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/receivables/receipts/${selectedReceiptForReversal.id}/reverse`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reason: reversalReason.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Lập phiếu đảo thất bại');

      setReversalModalOpen(false);
      setSelectedReceiptForReversal(null);
      setReversalReason('');
      if (selectedCustomerId) await fetchCustomerDetail(selectedCustomerId);
      await fetchSummary();
    } catch (err: any) {
      alert(err.message || 'Lỗi khi lập phiếu đảo');
    } finally {
      setIsSubmittingReversal(false);
    }
  };

  // Submit Due Date Adjust
  const handleSubmitDueDate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvoiceForDueDate || !newDueDate || isSubmittingDueDate) return;

    setIsSubmittingDueDate(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/receivables/invoices/${selectedInvoiceForDueDate.id}/due-date`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ dueDate: new Date(newDueDate).toISOString() }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Điều chỉnh hạn nợ thất bại');

      setDueDateModalOpen(false);
      setSelectedInvoiceForDueDate(null);
      if (selectedCustomerId) await fetchCustomerDetail(selectedCustomerId);
      await fetchSummary();
    } catch (err: any) {
      alert(err.message || 'Lỗi điều chỉnh hạn');
    } finally {
      setIsSubmittingDueDate(false);
    }
  };

  // Export handlers with Bearer token authentication
  const [isExporting, setIsExporting] = useState<'excel' | 'pdf' | null>(null);

  const handleExportStatement = async (format: 'excel' | 'pdf') => {
    if (!selectedCustomerId || isExporting) return;
    setIsExporting(format);
    try {
      const url = `${API_BASE}/api/admin/receivables/statement?customerId=${selectedCustomerId}&format=${format}${
        statementFrom ? `&from=${statementFrom}` : ''
      }${statementTo ? `&to=${statementTo}` : ''}`;

      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error || `Xuất file ${format.toUpperCase()} thất bại (HTTP ${res.status})`);
      }

      const blob = await res.blob();
      const contentDisposition = res.headers.get('Content-Disposition');
      let filename = `Doi_chieu_cong_no_${format === 'excel' ? 'xlsx' : 'pdf'}`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?([^";]+)"?/);
        if (match && match[1]) filename = match[1];
      }

      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch (err: any) {
      alert(err.message || 'Lỗi khi tải file đối chiếu');
    } finally {
      setIsExporting(null);
    }
  };

  return (
    <div className="space-y-6 pb-16">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="absolute -right-10 -bottom-10 w-44 h-44 bg-emerald-50 rounded-full blur-2xl pointer-events-none" />
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Sổ Quản Lý Công Nợ TPS1</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
              Chuẩn hạch toán
            </span>
          </div>
          <p className="text-slate-500 text-sm mt-1">
            Theo dõi nợ quá hạn, cảnh báo COD chưa thu, cấn nợ tự động FIFO và xuất biên bản đối chiếu tài chính.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            id="btn-refresh-receivables"
            onClick={fetchSummary}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            Làm mới
          </button>
        </div>
      </header>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-red-700 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={fetchSummary} className="font-bold underline">Thử lại</button>
        </div>
      )}

      {/* 6 Top Metric Cards */}
      <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Card 1: Tổng phải thu */}
        <div className="bg-white p-4 rounded-2xl border border-rose-200 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500">Tổng phải thu</span>
            <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
              <Wallet size={16} />
            </div>
          </div>
          <p className="text-xl font-black text-rose-600 tracking-tight">
            {money(summary?.totalReceivables || 0)}
          </p>
          <span className="text-[10px] text-slate-400 font-medium">Hóa đơn + nợ đầu kỳ</span>
        </div>

        {/* Card 2: Số dư đầu kỳ */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500">Số dư đầu kỳ</span>
            <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center">
              <Landmark size={16} />
            </div>
          </div>
          <p className="text-xl font-black text-slate-700 tracking-tight">
            {money(summary?.openingDebtTotal || 0)}
          </p>
          <span className="text-[10px] text-slate-400 font-medium">Từ KiotViet import</span>
        </div>

        {/* Card 3: Chưa đến hạn */}
        <div className="bg-white p-4 rounded-2xl border border-emerald-200 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500">Chưa đến hạn</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 size={16} />
            </div>
          </div>
          <p className="text-xl font-black text-emerald-700 tracking-tight">
            {money(summary?.currentReceivables || 0)}
          </p>
          <span className="text-[10px] text-emerald-600 font-medium">Trong hạn tín dụng</span>
        </div>

        {/* Card 4: Đã quá hạn */}
        <div className="bg-white p-4 rounded-2xl border border-red-200 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-red-600">Đã quá hạn</span>
            <div className="w-8 h-8 rounded-lg bg-red-100 text-red-700 flex items-center justify-center">
              <Flame size={16} />
            </div>
          </div>
          <p className="text-xl font-black text-red-700 tracking-tight">
            {money(summary?.overdueReceivables || 0)}
          </p>
          <span className="text-[10px] text-red-500 font-bold">Cần ưu tiên thu</span>
        </div>

        {/* Card 5: COD chưa thu */}
        <div className="bg-white p-4 rounded-2xl border border-amber-200 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-amber-700">COD chưa thu</span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <Truck size={16} />
            </div>
          </div>
          <p className="text-xl font-black text-amber-700 tracking-tight">
            {money(summary?.codUncollected || 0)}
          </p>
          <span className="text-[10px] text-amber-600 font-bold">Đơn giao chưa nộp tiền</span>
        </div>

        {/* Card 6: Tiền khách trả trước */}
        <div className="bg-white p-4 rounded-2xl border border-blue-200 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-blue-700">Khách trả trước</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <CreditCard size={16} />
            </div>
          </div>
          <p className="text-xl font-black text-blue-700 tracking-tight">
            {money(summary?.customerAdvanceTotal || 0)}
          </p>
          <span className="text-[10px] text-blue-500 font-medium">Số dư có / đặt cọc</span>
        </div>
      </section>

      {/* Biểu đồ phân bổ tuổi nợ (Aging Distribution Visualizer) */}
      <section className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-800">Biểu Đồ Tuổi Nợ Phải Thu (Aging Breakdown)</h3>
            <p className="text-xs text-slate-400">Phân bố cơ cấu thời hạn nợ để kiểm soát rủi ro dòng tiền</p>
          </div>
          <span className="text-xs font-bold text-slate-600">
            Tổng nợ phân tích: <b className="text-slate-900">{money(summary?.totalReceivables || 0)}</b>
          </span>
        </div>

        {/* Multi-segment bar */}
        {(() => {
          const total = Number(summary?.totalReceivables) || 1;
          const aging = summary?.aging || { notDue: 0, days1_30: 0, days31_60: 0, days61_90: 0, daysOver90: 0 };
          const pNotDue = (aging.notDue / total) * 100;
          const p1_30 = (aging.days1_30 / total) * 100;
          const p31_60 = (aging.days31_60 / total) * 100;
          const p61_90 = (aging.days61_90 / total) * 100;
          const pOver90 = (aging.daysOver90 / total) * 100;

          return (
            <div className="space-y-3">
              <div className="h-5 w-full bg-slate-100 rounded-full overflow-hidden flex shadow-inner">
                {pNotDue > 0 && <div style={{ width: `${pNotDue}%` }} title={`Chưa đến hạn: ${money(aging.notDue)}`} className="bg-emerald-500 hover:opacity-90 transition-all" />}
                {p1_30 > 0 && <div style={{ width: `${p1_30}%` }} title={`1 - 30 ngày: ${money(aging.days1_30)}`} className="bg-amber-400 hover:opacity-90 transition-all" />}
                {p31_60 > 0 && <div style={{ width: `${p31_60}%` }} title={`31 - 60 ngày: ${money(aging.days31_60)}`} className="bg-orange-500 hover:opacity-90 transition-all" />}
                {p61_90 > 0 && <div style={{ width: `${p61_90}%` }} title={`61 - 90 ngày: ${money(aging.days61_90)}`} className="bg-rose-500 hover:opacity-90 transition-all" />}
                {pOver90 > 0 && <div style={{ width: `${pOver90}%` }} title={`> 90 ngày: ${money(aging.daysOver90)}`} className="bg-red-700 hover:opacity-90 transition-all" />}
              </div>

              {/* Legends */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
                <div className="flex items-center gap-2 p-2 rounded-xl bg-emerald-50/60 border border-emerald-100">
                  <div className="w-3 h-3 rounded-full bg-emerald-500 shrink-0" />
                  <div>
                    <p className="text-[10px] text-slate-500 font-medium">Chưa đến hạn</p>
                    <p className="font-bold text-emerald-800">{money(aging.notDue)}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 p-2 rounded-xl bg-amber-50/60 border border-amber-100">
                  <div className="w-3 h-3 rounded-full bg-amber-400 shrink-0" />
                  <div>
                    <p className="text-[10px] text-slate-500 font-medium">1 – 30 ngày</p>
                    <p className="font-bold text-amber-800">{money(aging.days1_30)}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 p-2 rounded-xl bg-orange-50/60 border border-orange-100">
                  <div className="w-3 h-3 rounded-full bg-orange-500 shrink-0" />
                  <div>
                    <p className="text-[10px] text-slate-500 font-medium">31 – 60 ngày</p>
                    <p className="font-bold text-orange-800">{money(aging.days31_60)}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 p-2 rounded-xl bg-rose-50/60 border border-rose-100">
                  <div className="w-3 h-3 rounded-full bg-rose-500 shrink-0" />
                  <div>
                    <p className="text-[10px] text-slate-500 font-medium">61 – 90 ngày</p>
                    <p className="font-bold text-rose-800">{money(aging.days61_90)}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 p-2 rounded-xl bg-red-50/60 border border-red-100">
                  <div className="w-3 h-3 rounded-full bg-red-700 shrink-0" />
                  <div>
                    <p className="text-[10px] text-slate-500 font-medium">&gt; 90 ngày</p>
                    <p className="font-bold text-red-800">{money(aging.daysOver90)}</p>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
      </section>

      {/* Bộ lọc đa năng */}
      <section className="bg-white p-4 rounded-3xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-[220px]">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              id="input-receivables-search"
              type="text"
              placeholder="Tìm theo mã KH, tên khách, công ty, SĐT..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-emerald-600 focus:bg-white"
            />
          </div>

          {/* Sale rep */}
          <div className="min-w-[160px]">
            <select
              id="select-receivables-sale"
              value={selectedSalesRep}
              onChange={(e) => setSelectedSalesRep(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-emerald-600"
            >
              <option value="all">Tất cả Sale phụ trách</option>
              {salesRepList.map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </select>
          </div>

          {/* Due Status */}
          <div className="min-w-[150px]">
            <select
              id="select-receivables-status"
              value={dueStatusFilter}
              onChange={(e) => setDueStatusFilter(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-emerald-600"
            >
              <option value="all">Tất cả trạng thái nợ</option>
              <option value="overdue">Đã quá hạn</option>
              <option value="not_due">Chưa đến hạn</option>
              <option value="cod_uncollected">COD chưa thu</option>
            </select>
          </div>

          {/* Method Filter */}
          <div className="min-w-[140px]">
            <select
              id="select-receivables-method"
              value={methodFilter}
              onChange={(e) => setMethodFilter(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-emerald-600"
            >
              <option value="all">COD / Công nợ</option>
              <option value="credit">Chỉ Công nợ (CREDIT)</option>
              <option value="cod">Chỉ đơn COD</option>
            </select>
          </div>

          {/* Sort By */}
          <div className="min-w-[160px]">
            <select
              id="select-receivables-sort"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-emerald-600"
            >
              <option value="total_debt_desc">Nợ nhiều nhất</option>
              <option value="overdue_desc">Quá hạn nhiều nhất</option>
              <option value="due_date_asc">Hạn nợ gần nhất</option>
              <option value="name_asc">Tên khách hàng A-Z</option>
            </select>
          </div>

          {/* Over Limit Toggle */}
          <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer select-none bg-slate-50 px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-100">
            <input
              id="checkbox-over-limit"
              type="checkbox"
              checked={overLimitOnly}
              onChange={(e) => setOverLimitOnly(e.target.checked)}
              className="rounded text-emerald-600 focus:ring-0"
            />
            Chỉ khách vượt hạn mức
          </label>
        </div>
      </section>

      {/* Main Table: Danh sách khách hàng có công nợ */}
      <section className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-800">
            Danh Sách Khách Hàng Công Nợ ({filteredCustomers.length})
          </h2>
          <span className="text-xs text-slate-400">Bấm "Xem sổ nợ" để xem chi tiết từng hóa đơn & phiếu thu</span>
        </div>

        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center text-slate-400">
            <RefreshCw size={24} className="animate-spin mb-2" />
            <span className="text-xs">Đang tải sổ công nợ...</span>
          </div>
        ) : filteredCustomers.length === 0 ? (
          <div className="py-20 text-center text-slate-400 text-xs">
            Không tìm thấy khách hàng nào khớp với điều kiện lọc.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold">
                <tr>
                  <th className="p-3.5">Mã KH</th>
                  <th className="p-3.5">Khách hàng</th>
                  <th className="p-3.5">Sale phụ trách</th>
                  <th className="p-3.5 text-right">Nợ đầu kỳ</th>
                  <th className="p-3.5 text-right">Nợ hóa đơn</th>
                  <th className="p-3.5 text-right">Quá hạn</th>
                  <th className="p-3.5 text-right">Trả trước</th>
                  <th className="p-3.5 text-right font-black text-slate-800">Tổng phải thu</th>
                  <th className="p-3.5 text-center">Hạn mức & Sử dụng</th>
                  <th className="p-3.5 text-center">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCustomers.map((row) => (
                  <tr
                    key={row.customer.id}
                    className={`hover:bg-slate-50/80 transition-colors ${
                      selectedCustomerId === row.customer.id ? 'bg-emerald-50/40' : ''
                    }`}
                  >
                    <td className="p-3.5 font-mono font-bold text-slate-700">
                      {row.customer.partner_code}
                    </td>
                    <td className="p-3.5">
                      <p className="font-bold text-slate-900">{row.customer.name}</p>
                      {row.customer.company && (
                        <p className="text-[11px] text-slate-400">{row.customer.company}</p>
                      )}
                      {row.codUncollectedCount > 0 && (
                        <span className="inline-flex items-center gap-1 mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                          <Truck size={10} /> {row.codUncollectedCount} đơn COD chưa thu ({money(row.codUncollectedDebt)})
                        </span>
                      )}
                    </td>
                    <td className="p-3.5 text-slate-600">
                      {row.customer.sales_rep_name || '—'}
                    </td>
                    <td className="p-3.5 text-right text-slate-600 font-medium">
                      {money(row.openingDebt)}
                    </td>
                    <td className="p-3.5 text-right font-medium">
                      <span className="text-slate-800">{money(row.invoiceDebt)}</span>
                      <span className="block text-[10px] text-slate-400">({row.openInvoiceCount} HĐ)</span>
                    </td>
                    <td className="p-3.5 text-right font-bold">
                      {row.overdueDebt > 0 ? (
                        <span className="text-red-600">{money(row.overdueDebt)}</span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="p-3.5 text-right font-medium text-blue-600">
                      {row.customerAdvance > 0 ? money(row.customerAdvance) : '—'}
                    </td>
                    <td className="p-3.5 text-right font-black text-sm">
                      <span className={row.isOverLimit ? 'text-red-600' : 'text-slate-900'}>
                        {money(row.totalReceivables)}
                      </span>
                    </td>
                    <td className="p-3.5 text-center min-w-[140px]">
                      {row.creditLimit > 0 ? (
                        <div>
                          <div className="flex justify-between text-[10px] text-slate-500 mb-1">
                            <span>HM: {money(row.creditLimit)}</span>
                            <span className={row.isOverLimit ? 'text-red-600 font-bold' : ''}>
                              {row.creditUsagePercent}%
                            </span>
                          </div>
                          <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                            <div
                              style={{ width: `${Math.min(100, row.creditUsagePercent || 0)}%` }}
                              className={`h-full ${row.isOverLimit ? 'bg-red-600' : 'bg-emerald-500'}`}
                            />
                          </div>
                        </div>
                      ) : (
                        <span className="text-[10px] text-slate-400">Không hạn mức</span>
                      )}
                    </td>
                    <td className="p-3.5 text-center">
                      <button
                        id={`btn-view-statement-${row.customer.partner_code}`}
                        onClick={() => handleSelectCustomer(row.customer.id)}
                        className="px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-xs inline-flex items-center gap-1 transition-all"
                      >
                        Xem sổ nợ <ChevronRight size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* CHI TIẾT SỔ CÔNG NỢ KHÁCH HÀNG (Statement View Panel) */}
      {selectedCustomerId && (
        <section
          ref={detailPanelRef}
          id="panel-customer-receivables-detail"
          className="bg-white rounded-3xl border-2 border-emerald-500/50 shadow-xl p-6 space-y-6 relative"
        >
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-5">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 rounded-lg text-xs font-mono font-bold bg-slate-900 text-white">
                  {customerDetail?.customerSummary?.customer?.partner_code || '—'}
                </span>
                <h2 className="text-xl font-black text-slate-900">
                  {customerDetail?.customerSummary?.customer?.name}
                </h2>
                {customerDetail?.customerSummary?.customer?.company && (
                  <span className="text-sm text-slate-500">· {customerDetail.customerSummary.customer.company}</span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                MST: {customerDetail?.customerSummary?.customer?.tax_code || 'Chưa cập nhật'} · SĐT: {customerDetail?.customerSummary?.customer?.phone || '—'} · Địa chỉ: {customerDetail?.customerSummary?.customer?.address || '—'} · Hạn nợ mặc định: {customerDetail?.customerSummary?.customer?.payment_terms_days || 30} ngày
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              {canEditFinance && (
                <button
                  id="btn-record-payment"
                  onClick={handleOpenPaymentModal}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm shadow-emerald-600/30 transition-all"
                >
                  <Plus size={16} /> Ghi nhận thanh toán
                </button>
              )}

              {/* Statement date range filter for export */}
              <div className="flex items-center gap-1.5 bg-slate-50 p-1 rounded-xl border border-slate-200 text-xs">
                <span className="text-[10px] text-slate-400 font-bold px-1">Kỳ:</span>
                <input
                  type="date"
                  value={statementFrom}
                  onChange={(e) => setStatementFrom(e.target.value)}
                  className="bg-transparent text-slate-700 font-medium text-xs focus:outline-none"
                  title="Từ ngày"
                />
                <span className="text-slate-400">-</span>
                <input
                  type="date"
                  value={statementTo}
                  onChange={(e) => setStatementTo(e.target.value)}
                  className="bg-transparent text-slate-700 font-medium text-xs focus:outline-none"
                  title="Đến ngày"
                />
              </div>

              <button
                id="btn-export-excel"
                onClick={() => handleExportStatement('excel')}
                disabled={Boolean(isExporting)}
                className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center gap-1.5 transition-all disabled:opacity-50"
                title="Xuất file Excel đối chiếu"
              >
                <FileSpreadsheet size={16} className={isExporting === 'excel' ? 'animate-spin text-emerald-700' : 'text-emerald-700'} />
                {isExporting === 'excel' ? 'Đang xuất Excel...' : 'Xuất Excel'}
              </button>

              <button
                id="btn-export-pdf"
                onClick={() => handleExportStatement('pdf')}
                disabled={Boolean(isExporting)}
                className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center gap-1.5 transition-all disabled:opacity-50"
                title="Xuất bản in PDF đối chiếu"
              >
                <FileText size={16} className={isExporting === 'pdf' ? 'animate-spin text-red-700' : 'text-red-700'} />
                {isExporting === 'pdf' ? 'Đang xuất PDF...' : 'Xuất PDF'}
              </button>

              <button
                onClick={() => setSelectedCustomerId(null)}
                className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 text-xs"
                title="Đóng chi tiết"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {detailLoading && (
            <div className="py-10 flex items-center justify-center gap-2 text-sm font-medium text-slate-500">
              <RefreshCw size={18} className="animate-spin" />
              Đang tải sổ nợ khách hàng...
            </div>
          )}

          {detailError && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-red-700 text-sm flex items-center justify-between gap-3">
              <span>{detailError}</span>
              <button
                type="button"
                onClick={() => selectedCustomerId && void fetchCustomerDetail(selectedCustomerId)}
                className="font-bold underline whitespace-nowrap"
              >
                Thử lại
              </button>
            </div>
          )}

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="p-3 bg-slate-50 border border-slate-100 rounded-2xl">
              <span className="text-[10px] text-slate-400 font-bold uppercase">Nợ đầu kỳ</span>
              <p className="text-lg font-black text-slate-700">{money(customerDetail?.customerSummary?.openingDebt || 0)}</p>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-100 rounded-2xl">
              <span className="text-[10px] text-slate-400 font-bold uppercase">Nợ phát sinh HĐ</span>
              <p className="text-lg font-black text-slate-700">{money(customerDetail?.customerSummary?.invoiceDebt || 0)}</p>
            </div>
            <div className="p-3 bg-red-50 border border-red-100 rounded-2xl">
              <span className="text-[10px] text-red-500 font-bold uppercase">Quá hạn</span>
              <p className="text-lg font-black text-red-700">{money(customerDetail?.customerSummary?.overdueDebt || 0)}</p>
            </div>
            <div className="p-3 bg-blue-50 border border-blue-100 rounded-2xl">
              <span className="text-[10px] text-blue-500 font-bold uppercase">Khách trả trước (Dư có)</span>
              <p className="text-lg font-black text-blue-700">{money(customerDetail?.customerSummary?.customerAdvance || 0)}</p>
            </div>
            <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-2xl">
              <span className="text-[10px] text-emerald-600 font-bold uppercase">Tổng phải thu cuối kỳ</span>
              <p className="text-lg font-black text-emerald-800">{money(customerDetail?.customerSummary?.totalReceivables || 0)}</p>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-slate-200 gap-6 text-xs font-bold">
            <button
              onClick={() => setDetailTab('invoices')}
              className={`pb-2.5 transition-colors relative ${
                detailTab === 'invoices' ? 'text-emerald-700 border-b-2 border-emerald-700' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Hóa đơn phát sinh còn nợ ({customerDetail?.customerSummary?.invoices?.length || 0})
            </button>
            <button
              onClick={() => setDetailTab('receipts')}
              className={`pb-2.5 transition-colors relative ${
                detailTab === 'receipts' ? 'text-emerald-700 border-b-2 border-emerald-700' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Lịch sử Phiếu thu & Thanh toán ({customerDetail?.receipts?.length || 0})
            </button>
            <button
              onClick={() => setDetailTab('adjustments')}
              className={`pb-2.5 transition-colors relative ${
                detailTab === 'adjustments' ? 'text-emerald-700 border-b-2 border-emerald-700' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Bút toán điều chỉnh & Đầu kỳ ({customerDetail?.adjustments?.length || 0})
            </button>
          </div>

          {/* Tab 1: Invoices */}
          {detailTab === 'invoices' && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 font-bold">
                  <tr>
                    <th className="p-3">Mã đơn / Hóa đơn</th>
                    <th className="p-3">Ngày hoàn thành</th>
                    <th className="p-3">Hình thức</th>
                    <th className="p-3">Hạn nợ & Tuổi nợ</th>
                    <th className="p-3 text-right">Tổng tiền</th>
                    <th className="p-3 text-right">Đã thu</th>
                    <th className="p-3 text-right">Đổi trả</th>
                    <th className="p-3 text-right font-bold text-slate-800">Còn nợ</th>
                    <th className="p-3 text-center">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(customerDetail?.customerSummary?.invoices || []).map((inv: any) => (
                    <tr key={inv.id} className="hover:bg-slate-50/70">
                      <td className="p-3">
                        <span className="font-mono font-bold text-slate-900">{inv.order_code}</span>
                        {inv.invoice_number && (
                          <span className="block text-[10px] text-slate-400">HĐ: {inv.invoice_number}</span>
                        )}
                        {inv.warning === 'cod_uncollected' && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full mt-1">
                            <Truck size={10} /> COD chưa thu
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-slate-600">{formatDate(inv.completed_at || inv.created_at)}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          inv.payment_method === 'COD' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'
                        }`}>
                          {inv.payment_method}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className="text-slate-800 font-medium">{formatDate(inv.due_date)}</span>
                        {inv.is_overdue ? (
                          <span className="block text-[10px] font-bold text-red-600">Quá hạn {inv.days_overdue} ngày</span>
                        ) : (
                          <span className="block text-[10px] text-emerald-600">Trong hạn</span>
                        )}
                      </td>
                      <td className="p-3 text-right font-medium">{money(inv.grand_total)}</td>
                      <td className="p-3 text-right text-emerald-700 font-medium">{money(inv.paid_amount)}</td>
                      <td className="p-3 text-right text-blue-600 font-medium">
                        {inv.return_credit_amount > 0 ? money(inv.return_credit_amount) : '—'}
                      </td>
                      <td className="p-3 text-right font-black text-rose-600">{money(inv.effective_debt)}</td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {canEditFinance && (
                            <button
                              id={`btn-change-due-${inv.order_code}`}
                              onClick={() => {
                                setSelectedInvoiceForDueDate(inv);
                                setNewDueDate(inv.due_date ? inv.due_date.split('T')[0] : '');
                                setDueDateModalOpen(true);
                              }}
                              className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[10px]"
                              title="Điều chỉnh hạn thanh toán"
                            >
                              Đổi hạn
                            </button>
                          )}
                          <a
                            href={`/don-hang?code=${inv.order_code}`}
                            target="_blank"
                            rel="noreferrer"
                            className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[10px]"
                          >
                            Xem đơn
                          </a>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {(!customerDetail?.customerSummary?.invoices || customerDetail.customerSummary.invoices.length === 0) && (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-slate-400">Khách hàng không còn hóa đơn nợ nào.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Tab 2: Receipts */}
          {detailTab === 'receipts' && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 font-bold">
                  <tr>
                    <th className="p-3">Số phiếu</th>
                    <th className="p-3">Ngày thu</th>
                    <th className="p-3">Phương thức</th>
                    <th className="p-3 text-right">Số tiền</th>
                    <th className="p-3">Mã GD / Chứng từ</th>
                    <th className="p-3">Ghi chú</th>
                    <th className="p-3 text-right">Tiền thừa (Dư có)</th>
                    <th className="p-3 text-center">Trạng thái</th>
                    <th className="p-3 text-center">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(customerDetail?.receipts || []).map((r: any) => (
                    <tr key={r.id} className={r.status === 'reversed' ? 'bg-red-50/30' : 'hover:bg-slate-50/70'}>
                      <td className="p-3 font-mono font-bold text-slate-800">{r.receipt_number}</td>
                      <td className="p-3 text-slate-600">{formatDate(r.receipt_date || r.created_at)}</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                          {r.payment_method === 'cash' ? 'Tiền mặt' : 'Chuyển khoản'}
                        </span>
                      </td>
                      <td className="p-3 text-right font-black text-slate-900">{money(r.amount)}</td>
                      <td className="p-3 font-mono text-slate-500">{r.reference_code || '—'}</td>
                      <td className="p-3 text-slate-600">{r.note || '—'}</td>
                      <td className="p-3 text-right font-bold text-blue-600">
                        {r.unallocated_amount > 0 ? money(r.unallocated_amount) : '—'}
                      </td>
                      <td className="p-3 text-center">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          r.status === 'reversed' ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {r.status === 'reversed' ? 'Đã đảo phiếu' : 'Đã hạch toán'}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        {canEditFinance && r.status === 'posted' && !r.receipt_number?.startsWith('PT-DAO-') && (
                          <button
                            id={`btn-reverse-${r.receipt_number}`}
                            onClick={() => {
                              setSelectedReceiptForReversal(r);
                              setReversalReason('');
                              setReversalModalOpen(true);
                            }}
                            className="px-2 py-1 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 font-bold text-[10px] inline-flex items-center gap-1"
                          >
                            <RotateCcw size={11} /> Đảo phiếu
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {(!customerDetail?.receipts || customerDetail.receipts.length === 0) && (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-slate-400">Chưa có phiếu thu nào cho khách hàng này.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Tab 3: Adjustments */}
          {detailTab === 'adjustments' && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 font-bold">
                  <tr>
                    <th className="p-3">Số chứng từ</th>
                    <th className="p-3">Loại điều chỉnh</th>
                    <th className="p-3 text-right">Số tiền ban đầu</th>
                    <th className="p-3 text-right">Còn lại chưa cấn trừ</th>
                    <th className="p-3">Diễn giải nội dung</th>
                    <th className="p-3">Nguồn</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(customerDetail?.adjustments || []).map((adj: any) => (
                    <tr key={adj.id} className="hover:bg-slate-50/70">
                      <td className="p-3 font-mono font-bold text-slate-800">{adj.adjustment_number}</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                          {adj.adjustment_type === 'opening_balance' ? 'Số dư đầu kỳ' : adj.adjustment_type}
                        </span>
                      </td>
                      <td className="p-3 text-right font-bold text-slate-800">{money(adj.amount)}</td>
                      <td className="p-3 text-right font-black text-rose-600">{money(adj.remaining_amount)}</td>
                      <td className="p-3 text-slate-600">{adj.reason}</td>
                      <td className="p-3 text-slate-400 font-mono text-[11px]">{adj.source || '—'}</td>
                    </tr>
                  ))}
                  {(!customerDetail?.adjustments || customerDetail.adjustments.length === 0) && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400">Không có bút toán điều chỉnh nào.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* MODAL 1: GHI NHẬN THANH TOÁN & PHÂN BỔ THU TIỀN */}
      {paymentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-lg font-black text-slate-900">Lập Phiếu Thu Tiền Khách Hàng</h3>
                <p className="text-xs text-slate-400">
                  {customerDetail?.customerSummary?.customer?.name} ({customerDetail?.customerSummary?.customer?.partner_code})
                </p>
              </div>
              <button onClick={() => setPaymentModalOpen(false)} className="p-1 rounded-lg text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmitPayment} className="space-y-4">
              {/* Form Input Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Số tiền thực thu (VNĐ) <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="input-payment-amount"
                    type="number"
                    step="1000"
                    placeholder="0"
                    value={paymentAmount}
                    onChange={(e) => handlePaymentAmountChange(e.target.value)}
                    required
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-black text-emerald-800 bg-slate-50 focus:bg-white focus:outline-emerald-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Phương thức thu <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="select-payment-method"
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as any)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold bg-slate-50 focus:bg-white focus:outline-emerald-600"
                  >
                    <option value="bank_transfer">Chuyển khoản ngân hàng</option>
                    <option value="cash">Tiền mặt</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Mã giao dịch / Số chứng từ tham chiếu</label>
                  <input
                    id="input-payment-ref"
                    type="text"
                    placeholder="VD: FT260900123 / UNC-01..."
                    value={paymentRefCode}
                    onChange={(e) => setPaymentRefCode(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs bg-slate-50 focus:bg-white focus:outline-emerald-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Ghi chú thu tiền</label>
                  <input
                    id="input-payment-note"
                    type="text"
                    placeholder="Nội dung phiếu thu..."
                    value={paymentNote}
                    onChange={(e) => setPaymentNote(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs bg-slate-50 focus:bg-white focus:outline-emerald-600"
                  />
                </div>
              </div>

              {/* Server Proposed Allocation Table */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800">
                    Phân bổ cấn nợ (Tự động FIFO — kế toán có thể sửa số tiền)
                  </span>
                  <span className="text-[11px] text-slate-400">Ưu tiên nợ đầu kỳ & quá hạn lâu nhất</span>
                </div>

                <div className="border border-slate-200 rounded-2xl overflow-hidden max-h-56 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500 font-bold sticky top-0">
                      <tr>
                        <th className="p-2.5">Khoản nợ</th>
                        <th className="p-2.5 text-right">Nợ hiện tại</th>
                        <th className="p-2.5 text-right w-36">Số tiền cấn trừ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {/* Nợ đầu kỳ nếu có */}
                      {(customerDetail?.customerSummary?.openingDebt || 0) > 0 && (
                        <tr className="bg-amber-50/30">
                          <td className="p-2.5 font-bold text-slate-800">
                            Nợ đầu kỳ KiotViet
                            <span className="block text-[10px] text-amber-700 font-normal">Ưu tiên cấn trừ số 1</span>
                          </td>
                          <td className="p-2.5 text-right font-medium">{money(customerDetail.customerSummary.openingDebt)}</td>
                          <td className="p-2.5 text-right">
                            <input
                              type="number"
                              value={customAllocations['opening_debt'] || ''}
                              onChange={(e) => handleSingleAllocChange('opening_debt', customerDetail.customerSummary.openingDebt, e.target.value)}
                              className="w-full px-2 py-1 text-right border border-slate-200 rounded-lg text-xs font-bold text-slate-800 bg-white"
                            />
                          </td>
                        </tr>
                      )}

                      {/* Hóa đơn phát sinh */}
                      {(customerDetail?.customerSummary?.invoices || []).map((inv: any) => (
                        <tr key={inv.id}>
                          <td className="p-2.5">
                            <span className="font-mono font-bold text-slate-800">{inv.order_code}</span>
                            <span className="block text-[10px] text-slate-400">
                              Hạn: {formatDate(inv.due_date)} {inv.is_overdue ? `(Quá hạn ${inv.days_overdue} ngày)` : ''}
                            </span>
                          </td>
                          <td className="p-2.5 text-right font-medium">{money(inv.effective_debt)}</td>
                          <td className="p-2.5 text-right">
                            <input
                              type="number"
                              value={customAllocations[inv.id] || ''}
                              onChange={(e) => handleSingleAllocChange(inv.id, inv.effective_debt, e.target.value)}
                              className="w-full px-2 py-1 text-right border border-slate-200 rounded-lg text-xs font-bold text-slate-800 bg-white"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Real-time Math Summary Bar */}
              <div className={`p-4 rounded-2xl border text-xs font-bold flex flex-wrap items-center justify-between gap-3 ${
                isOverAllocated ? 'bg-red-50 border-red-200 text-red-700' : 'bg-slate-50 border-slate-200 text-slate-700'
              }`}>
                <div>
                  <span className="text-slate-400 font-normal">Tổng thực thu: </span>
                  <b className="text-slate-900">{money(parsedPaymentAmount)}</b>
                </div>
                <div>
                  <span className="text-slate-400 font-normal">Đã phân bổ: </span>
                  <b className="text-emerald-700">{money(totalAllocated)}</b>
                </div>
                <div>
                  <span className="text-slate-400 font-normal">Tiền thừa (chuyển vào dư có): </span>
                  <b className="text-blue-700">{money(unallocatedExcess)}</b>
                </div>
              </div>

              {isOverAllocated && (
                <p className="text-xs font-bold text-red-600">
                  Cảnh báo: Tổng tiền phân bổ vượt quá số tiền thu! Vui lòng giảm số tiền phân bổ.
                </p>
              )}

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setPaymentModalOpen(false)}
                  disabled={isSubmittingPayment}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
                >
                  Hủy bỏ
                </button>
                <button
                  id="btn-confirm-payment"
                  type="submit"
                  disabled={isSubmittingPayment || parsedPaymentAmount <= 0 || isOverAllocated}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm shadow-emerald-600/30 disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isSubmittingPayment ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" /> Đang hạch toán...
                    </>
                  ) : (
                    'Xác nhận ghi nhận thu'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: ĐẢO PHIẾU THU */}
      {reversalModalOpen && selectedReceiptForReversal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl border border-red-200 shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-3 text-red-600">
              <div className="w-10 h-10 rounded-2xl bg-red-100 flex items-center justify-center shrink-0">
                <RotateCcw size={20} />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900">Lập Phiếu Đảo Thu Tiền</h3>
                <p className="text-xs text-slate-500">Hoàn lại đúng số dư công nợ cho khách hàng</p>
              </div>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-100 rounded-2xl text-xs space-y-1">
              <p>Phiếu thu gốc: <b className="font-mono text-slate-800">{selectedReceiptForReversal.receipt_number}</b></p>
              <p>Số tiền: <b className="text-emerald-700">{money(selectedReceiptForReversal.amount)}</b></p>
              <p>Ngày thu: <b>{formatDate(selectedReceiptForReversal.receipt_date || selectedReceiptForReversal.created_at)}</b></p>
            </div>

            <form onSubmit={handleSubmitReversal} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Lý do lập phiếu đảo <span className="text-red-500">* (bắt buộc)</span>
                </label>
                <textarea
                  id="textarea-reversal-reason"
                  rows={3}
                  value={reversalReason}
                  onChange={(e) => setReversalReason(e.target.value)}
                  placeholder="Nhập lý do đảo phiếu (VD: Nhập nhầm số tiền, khách chuyển nhầm...)"
                  required
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs bg-slate-50 focus:bg-white focus:outline-red-600"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setReversalModalOpen(false)}
                  disabled={isSubmittingReversal}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
                >
                  Hủy
                </button>
                <button
                  id="btn-confirm-reversal"
                  type="submit"
                  disabled={isSubmittingReversal || reversalReason.trim().length < 3}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-700 text-white shadow-sm disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isSubmittingReversal ? 'Đang đảo phiếu...' : 'Xác nhận lập phiếu đảo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: CHỈNH HẠN THANH TOÁN */}
      {dueDateModalOpen && selectedInvoiceForDueDate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-sm w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="text-base font-black text-slate-900">Điều Chỉnh Hạn Nợ</h3>
              <button onClick={() => setDueDateModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <div className="text-xs space-y-1">
              <p>Hóa đơn: <b className="font-mono text-slate-800">{selectedInvoiceForDueDate.order_code}</b></p>
              <p>Nợ còn lại: <b className="text-rose-600">{money(selectedInvoiceForDueDate.effective_debt)}</b></p>
              <p>Hạn nợ hiện tại: <b>{formatDate(selectedInvoiceForDueDate.due_date)}</b></p>
            </div>

            <form onSubmit={handleSubmitDueDate} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Chọn ngày hạn nợ mới <span className="text-red-500">*</span>
                </label>
                <input
                  id="input-new-due-date"
                  type="date"
                  value={newDueDate}
                  onChange={(e) => setNewDueDate(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs bg-slate-50 focus:bg-white focus:outline-emerald-600"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setDueDateModalOpen(false)}
                  disabled={isSubmittingDueDate}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
                >
                  Hủy
                </button>
                <button
                  id="btn-confirm-due-date"
                  type="submit"
                  disabled={isSubmittingDueDate || !newDueDate}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm disabled:opacity-50"
                >
                  {isSubmittingDueDate ? 'Đang lưu...' : 'Lưu hạn nợ mới'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
