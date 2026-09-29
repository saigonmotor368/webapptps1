import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  X, AlertTriangle, CheckCircle2, Package, ArrowRight,
  Loader2, Calendar, MapPin, User, ShieldAlert,
  ChevronDown, ChevronUp, Search, CheckSquare, Square, ArrowLeft
} from 'lucide-react';

interface MergeOrdersModalProps {
  isOpen: boolean;
  preSelectedOrderIds?: string[];
  onClose: () => void;
  onSuccess: (newOrder: any) => void;
  token: string | null;
  apiBase: string;
}

function money(v: number | string | null | undefined) {
  return new Intl.NumberFormat('vi-VN').format(Math.round(Number(v) || 0)) + 'đ';
}

function dt(v: string | null | undefined) {
  if (!v) return '—';
  const d = new Date(v);
  return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

export default function MergeOrdersModal({
  isOpen,
  preSelectedOrderIds = [],
  onClose,
  onSuccess,
  token,
  apiBase,
}: MergeOrdersModalProps) {
  // Step 1: Chọn theo nhóm khách hàng | Step 2: Xem trước & Xác nhận
  const [step, setStep] = useState<'groups' | 'preview'>('groups');

  // Dữ liệu nhóm khách hàng
  const [groups, setGroups] = useState<any[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [expandedGroupKey, setExpandedGroupKey] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Lựa chọn đơn trong nhóm đang mở
  const [selectedOrdersByGroup, setSelectedOrdersByGroup] = useState<Record<string, Set<string>>>({});

  // Dữ liệu Preview (Step 2)
  const [activeOrderIdsToMerge, setActiveOrderIdsToMerge] = useState<string[]>([]);
  const [previewData, setPreviewData] = useState<any>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [committing, setCommitting] = useState(false);
  const [shippingFee, setShippingFee] = useState<number>(0);
  const [note, setNote] = useState<string>('');
  const [reason, setReason] = useState<string>('Gộp đơn cùng khách, ngày giao, địa chỉ');

  // Tải danh sách các nhóm khách hàng có >= 2 đơn đủ điều kiện gộp
  const fetchCandidateGroups = useCallback(() => {
    if (!token) return;
    setLoadingGroups(true);
    fetch(`${apiBase}/api/admin/orders/merge/candidates`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.ok && Array.isArray(data.groups)) {
          setGroups(data.groups);
          if (data.groups.length > 0) {
            setExpandedGroupKey((current) => current || data.groups[0].groupKey);
          }
        }
      })
      .catch((err) => console.error('Lỗi tải nhóm đơn gộp:', err))
      .finally(() => setLoadingGroups(false));
  }, [apiBase, token]);

  // Tải bản xem trước cho danh sách orderIds cụ thể
  const loadPreview = useCallback((orderIds: string[]) => {
    setLoadingPreview(true);
    setErrorMsg(null);
    setPreviewData(null);

    fetch(`${apiBase}/api/admin/orders/merge/preview`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ orderIds }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (!data.ok) {
          setErrorMsg(data.error || 'Không thể tải bản xem trước gộp đơn');
        } else {
          setPreviewData(data);
          setShippingFee(data.financials?.suggestedShipping || 0);
        }
      })
      .catch((err) => {
        setErrorMsg(err.message || 'Lỗi kết nối máy chủ');
      })
      .finally(() => setLoadingPreview(false));
  }, [apiBase, token]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    // Khởi tạo ở microtask kế tiếp để effect chỉ điều phối việc tải dữ liệu,
    // tránh chuỗi render đồng bộ khi modal vừa mở.
    void Promise.resolve().then(() => {
      if (cancelled) return;
      if (preSelectedOrderIds.length >= 2) {
        setActiveOrderIdsToMerge(preSelectedOrderIds);
        setStep('preview');
        loadPreview(preSelectedOrderIds);
      } else {
        setStep('groups');
        fetchCandidateGroups();
      }
    });

    return () => { cancelled = true; };
  }, [fetchCandidateGroups, isOpen, loadPreview, preSelectedOrderIds]);

  const handleToggleSelectOrder = (groupKey: string, orderId: string) => {
    setSelectedOrdersByGroup((prev) => {
      const currentSet = new Set(prev[groupKey] || []);
      if (currentSet.has(orderId)) {
        currentSet.delete(orderId);
      } else {
        currentSet.add(orderId);
      }
      return { ...prev, [groupKey]: currentSet };
    });
  };

  const handleToggleSelectAllInGroup = (groupKey: string, orders: any[]) => {
    setSelectedOrdersByGroup((prev) => {
      const currentSet = prev[groupKey] || new Set();
      const allSelected = orders.every((o) => currentSet.has(o.id));
      const nextSet = new Set<string>();
      if (!allSelected) {
        orders.forEach((o) => nextSet.add(o.id));
      }
      return { ...prev, [groupKey]: nextSet };
    });
  };

  const handleProceedMergeGroup = (groupKey: string) => {
    const selectedIds = Array.from(selectedOrdersByGroup[groupKey] || []);
    if (selectedIds.length < 2) return;
    setActiveOrderIdsToMerge(selectedIds);
    loadPreview(selectedIds);
    setStep('preview');
  };

  const handleCommit = async () => {
    if (!previewData?.eligible || !previewData?.previewToken) return;
    setCommitting(true);
    try {
      // Giữ nguyên key cho mọi lần gửi lại cùng một bản xem trước. Nếu mạng chậm
      // hoặc người dùng bấm hai lần, database chỉ tạo đúng một đơn đích.
      const idempotencyKey = `ui-${previewData.previewToken.slice(-48)}`;
      const res = await fetch(`${apiBase}/api/admin/orders/merge/commit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          orderIds: activeOrderIdsToMerge,
          previewToken: previewData.previewToken,
          idempotencyKey,
          shippingAmount: Number(shippingFee) || 0,
          note: note.trim(),
          reason: reason.trim(),
        }),
      });

      const data = await res.json();
      if (!data.ok) {
        throw new Error(data.error || 'Gộp đơn thất bại');
      }

      onSuccess(data.order);
      onClose();
    } catch (err: any) {
      alert('❌ Lỗi gộp đơn: ' + (err.message || 'Đã xảy ra lỗi'));
    } finally {
      setCommitting(false);
    }
  };

  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return groups;
    const q = searchQuery.trim().toLowerCase();
    return groups.filter(
      (g) =>
        g.customerName.toLowerCase().includes(q) ||
        g.customerCode.toLowerCase().includes(q) ||
        (g.deliveryAddress && g.deliveryAddress.toLowerCase().includes(q)) ||
        g.orders.some((o: any) => o.order_code.toLowerCase().includes(q))
    );
  }, [groups, searchQuery]);

  if (!isOpen) return null;

  const currentSubtotal = previewData?.financials?.subtotal || 0;
  const currentDiscount = previewData?.financials?.discount_amount || 0;
  const currentPaid = previewData?.financials?.paid_amount || 0;
  const calculatedGrandTotal = Math.max(0, currentSubtotal - currentDiscount + Number(shippingFee || 0));
  const calculatedDebt = Math.max(0, calculatedGrandTotal - currentPaid);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">

        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/80">
          <div className="flex items-center gap-2.5">
            {step === 'preview' && preSelectedOrderIds.length < 2 && (
              <button
                onClick={() => setStep('groups')}
                className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 rounded-lg transition-colors mr-1"
                title="Quay lại danh sách nhóm khách hàng"
              >
                <ArrowLeft size={18} />
              </button>
            )}
            <div>
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Package className="text-blue-600" size={20} />
                {step === 'groups' ? 'Gộp phiếu đặt hàng' : `Xem trước & Xác nhận gộp (${activeOrderIdsToMerge.length} đơn)`}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {step === 'groups'
                  ? 'Gộp các đơn đặt hàng cùng một khách hàng và cùng bảng giá để xuất hàng đồng bộ'
                  : 'Kiểm tra kỹ mặt hàng trước và sau gộp trước khi hoàn tất tạo đơn mới'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={committing}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/60 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">

          {/* ═══════════════════════════════════════════════════════════════ */}
          {/* STEP 1: Danh sách nhóm đơn theo Khách hàng (Chuẩn KiotViet)    */}
          {/* ═══════════════════════════════════════════════════════════════ */}
          {step === 'groups' && (
            <div className="space-y-4">
              {/* Thanh tìm kiếm nhóm khách */}
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm theo tên khách, xưởng, điểm giao, mã đơn..."
                  className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              {loadingGroups ? (
                <div className="py-20 text-center space-y-3">
                  <Loader2 className="animate-spin text-blue-600 mx-auto" size={32} />
                  <p className="text-sm font-medium text-slate-600">Đang tìm các khách hàng có nhiều đơn cần gộp...</p>
                </div>
              ) : filteredGroups.length === 0 ? (
                <div className="py-16 text-center text-slate-400 space-y-2">
                  <Package size={40} className="mx-auto opacity-30" />
                  <p className="text-sm font-medium text-slate-600">Hiện không có khách hàng nào có từ 2 đơn trở lên để gộp</p>
                  <p className="text-xs text-slate-400">Các đơn cần ở trạng thái Chờ xác nhận hoặc Đã xác nhận và cùng ngày giao.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredGroups.map((group) => {
                    const isExpanded = expandedGroupKey === group.groupKey;
                    const selectedSet = selectedOrdersByGroup[group.groupKey] || new Set();
                    const selectedCount = selectedSet.size;
                    const allInGroupSelected = group.orders.every((o: any) => selectedSet.has(o.id));

                    return (
                      <div
                        key={group.groupKey}
                        className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs transition-all bg-white"
                      >
                        {/* Accordion Group Header (Khớp hoàn toàn hình mẫu KiotViet) */}
                        <div
                          onClick={() => setExpandedGroupKey(isExpanded ? null : group.groupKey)}
                          className="p-4 bg-slate-50/70 hover:bg-slate-100/60 cursor-pointer flex items-center justify-between gap-3 border-b border-slate-100 transition-colors"
                        >
                          <div className="min-w-0">
                            <h3 className="font-bold text-slate-900 text-sm truncate uppercase tracking-wide">
                              {group.customerName}
                            </h3>
                            <div className="flex items-center gap-2 mt-1 text-xs text-slate-500 flex-wrap">
                              <span className="font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                                {group.orderCount} đơn đặt hàng
                              </span>
                              {group.deliveryDate && (
                                <span className="flex items-center gap-1 text-slate-600">
                                  <Calendar size={13} className="text-slate-400" />
                                  Ngày giao: <b className="text-slate-700">{group.deliveryDate}</b>
                                </span>
                              )}
                              <span className="text-slate-400">·</span>
                              <span className="text-slate-700 font-medium">Tổng tiền: {money(group.totalAmount)}</span>
                            </div>
                          </div>
                          <div className="text-slate-400 p-1">
                            {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                          </div>
                        </div>

                        {/* Accordion Content */}
                        {isExpanded && (
                          <div className="p-4 space-y-3 bg-white">
                            {/* Thanh thao tác nhanh trong nhóm: Chọn 2 hoặc N đơn để gộp đơn */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2">
                              <p className="text-xs text-slate-600 font-medium">
                                Chọn <span className="font-bold text-blue-700">2 hoặc nhiều đơn đặt hàng</span> để gộp đơn
                                {selectedCount > 0 && (
                                  <span className="text-slate-500 ml-1.5">(Đã chọn {selectedCount}/{group.orders.length} đơn)</span>
                                )}
                              </p>
                              <button
                                type="button"
                                onClick={() => handleProceedMergeGroup(group.groupKey)}
                                disabled={selectedCount < 2}
                                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all flex items-center gap-1.5 self-start sm:self-auto disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                <Package size={14} /> Gộp đơn {selectedCount >= 2 ? `(${selectedCount})` : ''}
                              </button>
                            </div>

                            {/* Bảng danh sách đơn của khách */}
                            <div className="border border-slate-200 rounded-xl overflow-hidden">
                              <table className="w-full text-left text-xs">
                                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                                  <tr>
                                    <th className="px-3 py-2.5 w-10 text-center">
                                      <button
                                        type="button"
                                        onClick={() => handleToggleSelectAllInGroup(group.groupKey, group.orders)}
                                        className="text-slate-400 hover:text-blue-700 transition-colors"
                                      >
                                        {allInGroupSelected ? (
                                          <CheckSquare size={16} className="text-blue-600" />
                                        ) : (
                                          <Square size={16} />
                                        )}
                                      </button>
                                    </th>
                                    <th className="px-3 py-2.5">Mã đặt hàng</th>
                                    <th className="px-3 py-2.5">Thời gian</th>
                                    <th className="px-3 py-2.5 text-center">Số SP</th>
                                    <th className="px-3 py-2.5 text-right">Khách cần trả</th>
                                    <th className="px-3 py-2.5 text-center">Trạng thái</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {group.orders.map((o: any) => {
                                    const isChecked = selectedSet.has(o.id);
                                    return (
                                      <tr
                                        key={o.id}
                                        onClick={() => handleToggleSelectOrder(group.groupKey, o.id)}
                                        className={`hover:bg-slate-50/80 cursor-pointer transition-colors ${
                                          isChecked ? 'bg-blue-50/40' : ''
                                        }`}
                                      >
                                        <td className="px-3 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                                          <button
                                            type="button"
                                            onClick={() => handleToggleSelectOrder(group.groupKey, o.id)}
                                            className="text-slate-400 hover:text-blue-600 transition-colors"
                                          >
                                            {isChecked ? (
                                              <CheckSquare size={16} className="text-blue-600" />
                                            ) : (
                                              <Square size={16} />
                                            )}
                                          </button>
                                        </td>
                                        <td className="px-3 py-2.5 font-bold text-blue-700">
                                          {o.order_code}
                                        </td>
                                        <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">
                                          {dt(o.created_at)}
                                        </td>
                                        <td className="px-3 py-2.5 text-center text-slate-600">
                                          {o.item_count || 0}
                                        </td>
                                        <td className="px-3 py-2.5 text-right font-semibold text-slate-800">
                                          {money(o.grand_total)}
                                        </td>
                                        <td className="px-3 py-2.5 text-center">
                                          <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                                            {o.status === 'confirmed' ? 'Đã xác nhận' : 'Chờ xác nhận'}
                                          </span>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════ */}
          {/* STEP 2: Xem trước chi tiết mặt hàng & Xác nhận gộp đơn          */}
          {/* ═══════════════════════════════════════════════════════════════ */}
          {step === 'preview' && (
            <div className="space-y-5">
              {loadingPreview ? (
                <div className="py-20 text-center space-y-3">
                  <Loader2 className="animate-spin text-blue-600 mx-auto" size={36} />
                  <p className="text-sm font-medium text-slate-600">Đang đối soát điều kiện bảng giá và tính toán sản phẩm gộp...</p>
                </div>
              ) : errorMsg ? (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 space-y-2">
                  <div className="flex items-center gap-2 font-semibold">
                    <AlertTriangle size={18} />
                    Không thể gộp các đơn hàng đã chọn
                  </div>
                  <p className="text-sm">{errorMsg}</p>
                </div>
              ) : !previewData?.eligible ? (
                <div className="space-y-4">
                  <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-800 space-y-2">
                    <div className="flex items-center gap-2 font-bold text-red-900">
                      <ShieldAlert size={20} />
                      Không đủ điều kiện gộp đơn ({previewData?.errors?.length || 0} lý do)
                    </div>
                    <ul className="list-disc list-inside text-sm space-y-1 mt-1 text-red-700">
                      {(previewData?.errors || []).map((err: string, i: number) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <div className="bg-slate-50 px-4 py-2 text-xs font-bold text-slate-600 uppercase">
                      Thông tin các đơn đã chọn
                    </div>
                    <div className="divide-y divide-slate-100 text-sm">
                      {(previewData?.sourceOrders || []).map((o: any) => (
                        <div key={o.id} className="p-3 flex items-center justify-between">
                          <div>
                            <span className="font-semibold text-slate-800">{o.order_code}</span>
                            <span className="text-xs text-slate-400 ml-2">({o.status})</span>
                          </div>
                          <div className="font-medium text-slate-700">{money(o.grand_total)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-5">
                  {/* Cảnh báo nếu có */}
                  {previewData.warnings && previewData.warnings.length > 0 && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs space-y-1">
                      {previewData.warnings.map((w: string, i: number) => (
                        <div key={i} className="flex items-start gap-1.5">
                          <AlertTriangle size={14} className="shrink-0 mt-0.5 text-amber-600" />
                          <span>{w}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Thông tin Khách hàng & Điểm giao */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs">
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5 font-bold text-slate-800 text-sm">
                        <User size={15} className="text-blue-600" />
                        {previewData.customer?.name}
                        {previewData.customer?.code && (
                          <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-1.5 py-0.2 rounded border border-blue-200">
                            {previewData.customer.code}
                          </span>
                        )}
                      </div>
                      {previewData.customer?.company && (
                        <p className="text-slate-600">{previewData.customer.company}</p>
                      )}
                      <p className="text-slate-500">SĐT: {previewData.customer?.phone || '—'}</p>
                    </div>
                    <div className="space-y-1.5 md:border-l md:border-slate-200 md:pl-4">
                      <div className="flex items-center gap-1.5 text-slate-700 font-semibold">
                        <Calendar size={14} className="text-blue-600" />
                        Ngày giao: <span className="font-bold text-slate-900">{previewData.delivery?.date || 'Chưa định'}</span>
                        <span className="text-slate-400">({previewData.delivery?.shift || 'Sáng'})</span>
                      </div>
                      <div className="flex items-start gap-1.5 text-slate-600">
                        <MapPin size={14} className="text-blue-600 shrink-0 mt-0.5" />
                        <span>{previewData.delivery?.address || 'Nhận tại điểm'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Thống kê trước và sau gộp */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                      <div className="text-[11px] text-slate-500 font-medium">Số dòng hàng</div>
                      <div className="text-base font-bold text-slate-800 mt-1 flex items-center gap-1.5">
                        <span className="text-slate-500">{previewData.itemsBeforeCount}</span>
                        <ArrowRight size={14} className="text-blue-600" />
                        <span className="text-blue-700">{previewData.itemsAfterCount}</span>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">Giữ riêng quy cách/ghi chú</div>
                    </div>

                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                      <div className="text-[11px] text-slate-500 font-medium">Tổng tiền hàng</div>
                      <div className="text-base font-bold text-slate-800 mt-1">{money(currentSubtotal)}</div>
                      {currentDiscount > 0 && (
                        <div className="text-[10px] text-emerald-600 mt-0.5">Giảm: -{money(currentDiscount)}</div>
                      )}
                    </div>

                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                      <div className="text-[11px] text-slate-500 font-medium">Đã thanh toán</div>
                      <div className="text-base font-bold text-green-700 mt-1">{money(currentPaid)}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">Cộng từ {activeOrderIdsToMerge.length} đơn</div>
                    </div>

                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                      <div className="text-[11px] text-slate-500 font-medium">Khách cần trả</div>
                      <div className="text-base font-bold text-red-600 mt-1">{money(calculatedGrandTotal)}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">Nợ: {money(calculatedDebt)}</div>
                    </div>
                  </div>

                  {/* Bảng sản phẩm sau khi gộp */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                      <span>Danh sách sản phẩm gộp ({previewData.combinedItems?.length || 0} dòng)</span>
                      <span className="text-[11px] font-normal text-slate-500">
                        Cùng SKU khác quy cách / ghi chú giữ thành các dòng riêng
                      </span>
                    </div>
                    <div className="border border-slate-200 rounded-xl overflow-hidden max-h-56 overflow-y-auto">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-slate-100/80 text-slate-600 font-semibold sticky top-0">
                          <tr>
                            <th className="px-3 py-2">Mã / Tên SP</th>
                            <th className="px-3 py-2">ĐVT</th>
                            <th className="px-3 py-2">Quy cách / Ghi chú</th>
                            <th className="px-3 py-2 text-center">Số lượng</th>
                            <th className="px-3 py-2 text-right">Đơn giá</th>
                            <th className="px-3 py-2 text-right">Thành tiền</th>
                            <th className="px-3 py-2 text-center">Nguồn</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {previewData.combinedItems?.map((it: any, idx: number) => {
                            const noteText = [it.packagingNote, it.customerNote, it.pricingNote].filter(Boolean).join(' | ');
                            return (
                              <tr key={idx} className="hover:bg-slate-50/80">
                                <td className="px-3 py-2">
                                  <p className="font-semibold text-slate-800">{it.name}</p>
                                  {it.sku && <p className="text-[10px] text-slate-400">{it.sku}</p>}
                                </td>
                                <td className="px-3 py-2 text-slate-600">{it.unit}</td>
                                <td className="px-3 py-2">
                                  {noteText ? (
                                    <span className="inline-block bg-amber-50 text-amber-800 border border-amber-200 px-1.5 py-0.5 rounded text-[11px]">
                                      {noteText}
                                    </span>
                                  ) : (
                                    <span className="text-slate-400">—</span>
                                  )}
                                </td>
                                <td className="px-3 py-2 text-center font-bold text-slate-800">
                                  {it.quantity}
                                  {it.mergeCount > 1 && (
                                    <span className="block text-[9px] text-green-600 font-normal">
                                      ({it.mergeCount} đơn cộng dồn)
                                    </span>
                                  )}
                                </td>
                                <td className="px-3 py-2 text-right text-slate-600">{money(it.unitPrice)}</td>
                                <td className="px-3 py-2 text-right font-bold text-slate-800">{money(it.lineTotal)}</td>
                                <td className="px-3 py-2 text-center text-[10px] text-slate-500 whitespace-nowrap">
                                  {it.sourceOrderCodes?.join(', ')}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Tùy chỉnh Phí giao hàng & Ghi chú */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Phí giao hàng đơn gộp
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          value={shippingFee}
                          onChange={(e) => setShippingFee(Number(e.target.value) || 0)}
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                          min={0}
                          step={5000}
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">VNĐ</span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1">
                        Mặc định lấy phí cao nhất trong các đơn nguồn ({money(previewData.financials?.suggestedShipping || 0)})
                      </p>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Lý do gộp đơn (Audit log)
                      </label>
                      <input
                        type="text"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Lý do gộp đơn..."
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Ghi chú đơn hàng mới (tùy chọn)
                      </label>
                      <input
                        type="text"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Ghi chú thêm cho bộ phận giao nhận / bếp..."
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {step === 'preview' && previewData?.eligible && (
          <div className="mx-6 mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
            Sau khi xác nhận, hệ thống sẽ lưu lịch sử đối soát rồi xóa các đơn nguồn. Danh sách đơn hàng và công nợ chỉ còn đơn gộp mới.
          </div>
        )}

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/80 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={step === 'preview' && preSelectedOrderIds.length < 2 ? () => setStep('groups') : onClose}
            disabled={committing}
            className="px-4 py-2 border border-slate-200 bg-white text-slate-600 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            {step === 'preview' && preSelectedOrderIds.length < 2 ? '← Chọn lại nhóm' : 'Đóng'}
          </button>

          {step === 'preview' && previewData?.eligible && (
            <button
              type="button"
              onClick={handleCommit}
              disabled={committing || !previewData.eligible}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-md hover:shadow-lg transition-all flex items-center gap-2 disabled:opacity-50"
            >
              {committing ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Đang tiến hành gộp đơn...
                </>
              ) : (
                <>
                  <CheckCircle2 size={16} />
                  Xác nhận gộp {activeOrderIdsToMerge.length} đơn
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
