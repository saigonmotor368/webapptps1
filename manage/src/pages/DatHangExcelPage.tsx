import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ArrowLeft, Download, Upload, CheckCircle2, AlertTriangle, HelpCircle, XCircle, RefreshCw } from 'lucide-react';

function money(v: number) { return new Intl.NumberFormat('vi-VN').format(Math.round(Number(v) || 0)) + 'đ'; }

interface Suggestion { id: string; sku: string; name: string; unit: string; price: number; priceOnRequest?: boolean; score: number }
interface ResultRow {
  row: number; input: string; quantity: number; note: string;
  status: 'matched' | 'ambiguous' | 'not_found' | 'invalid_quantity';
  product?: { id: string; sku: string; name: string; unit: string; price: number; priceOnRequest?: boolean };
  suggestions?: Suggestion[];
}

// Giai đoạn E, mục 9 — khách đặt hàng loạt từ Excel. Tông màu theo đúng
// thương hiệu TPS1 như DatHangPage.
export default function DatHangExcelPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const apiBase = import.meta.env.VITE_API_BASE_URL || '';

  const [file, setFile] = useState<File | null>(null);
  const [checking, setChecking] = useState(false);
  const [results, setResults] = useState<ResultRow[] | null>(null);
  const [summary, setSummary] = useState<any>(null);
  const [chosenSuggestion, setChosenSuggestion] = useState<Record<number, string>>({}); // row -> productId
  const [skippedRows, setSkippedRows] = useState<Record<number, boolean>>({});
  const [error, setError] = useState('');

  const [deliveryDate, setDeliveryDate] = useState<string>('');
  const [addressId, setAddressId] = useState<string>('');
  const [addresses, setAddresses] = useState<Array<{ id: string; label: string; address: string; contact_name?: string; contact_phone?: string; is_default?: boolean }>>([]);
  const [deliveryName, setDeliveryName] = useState('');
  const [deliveryPhone, setDeliveryPhone] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [cutoffWarning, setCutoffWarning] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [successCode, setSuccessCode] = useState('');
  const [showSkippedModal, setShowSkippedModal] = useState(false);
  const [idempotencyKey] = useState(() => `exc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);

  // Load cấu hình đặt hàng (giờ chốt, địa chỉ khách)
  useEffect(() => {
    if (!token) return;
    const fetchConfig = async () => {
      try {
        const res = await fetch(`${apiBase}/api/customer/order-config`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data.ok) {
          const earliest = data.config?.earliestDate || '';
          setDeliveryDate((prev) => prev || earliest);
          const addrs = data.addresses || [];
          setAddresses(addrs);
          const def = addrs.find((a: any) => a.is_default) || addrs[0];
          if (def) {
            setAddressId(def.id);
            setDeliveryName(def.contact_name || '');
            setDeliveryPhone(def.contact_phone || '');
            setDeliveryAddress(def.address || '');
          }
        }
      } catch (err) {
        console.error('Không tải được cấu hình đặt hàng', err);
      }
    };
    fetchConfig();
  }, [token, apiBase]);

  // Kiểm tra giờ chốt khi đổi ngày giao
  useEffect(() => {
    if (!deliveryDate || !token) return;
    const checkCutoff = async () => {
      try {
        const res = await fetch(`${apiBase}/api/customer/order-config?deliveryDate=${deliveryDate}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data.ok && data.cutoff) {
          if (data.cutoff.isLate) {
            setCutoffWarning(`Đã qua giờ chốt (${data.cutoff.cutoffTime}) cho ngày ${deliveryDate}. Đơn sẽ được xếp ca tiếp theo.`);
          } else {
            setCutoffWarning('');
          }
        }
      } catch {
        // ignore
      }
    };
    const timer = setTimeout(checkCutoff, 300);
    return () => clearTimeout(timer);
  }, [deliveryDate, token, apiBase]);

  const downloadTemplate = async () => {
    const res = await fetch(`${apiBase}/api/customer/order/import-excel`, { headers: { Authorization: `Bearer ${token}` } });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'mau-dat-hang.xlsx'; a.click();
    URL.revokeObjectURL(url);
  };

  const checkFile = async () => {
    if (!file) return;
    setChecking(true); setError('');
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('token', token || '');
      const res = await fetch(`${apiBase}/api/customer/order/import-excel`, { method: 'POST', body: form });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setResults(data.results);
      setSummary(data.summary);
    } catch (err: any) {
      setError(err.message || 'Không đọc được file');
    } finally { setChecking(false); }
  };

  const confirmableCount = (results || []).filter((r) => {
    if (r.status === 'matched') return !skippedRows[r.row];
    if (r.status === 'ambiguous') return !!chosenSuggestion[r.row];
    return false;
  }).length;

  // Lọc các dòng bị bỏ qua hoặc chưa xử lý
  const skippedOrUnresolvedRows = (results || []).filter((r) => {
    if (r.status === 'not_found' || r.status === 'invalid_quantity') return true;
    if (r.status === 'ambiguous' && !chosenSuggestion[r.row]) return true;
    if (r.status === 'matched' && skippedRows[r.row]) return true;
    return false;
  });

  const handlePreSubmit = () => {
    if (!deliveryDate) {
      alert('Vui lòng chọn ngày giao hàng');
      return;
    }
    if (!addressId && (!deliveryAddress.trim() || !deliveryPhone.trim() || !deliveryName.trim())) {
      alert('Vui lòng chọn hoặc nhập đầy đủ địa chỉ giao hàng, tên và số điện thoại');
      return;
    }
    if (confirmableCount === 0) {
      alert('Chưa có sản phẩm nào hợp lệ để đặt');
      return;
    }

    if (skippedOrUnresolvedRows.length > 0) {
      setShowSkippedModal(true);
    } else {
      submitOrder();
    }
  };

  const submitOrder = async () => {
    setShowSkippedModal(false);
    const items: { productId: string; name: string; quantity: number; note?: string }[] = [];
    for (const r of results || []) {
      if (r.status === 'matched' && r.product && !skippedRows[r.row]) {
        items.push({
          productId: r.product.id,
          name: r.product.name,
          quantity: r.quantity,
          note: r.note ? String(r.note).trim() : '',
        });
      } else if (r.status === 'ambiguous' && chosenSuggestion[r.row]) {
        const chosen = r.suggestions?.find((s) => s.id === chosenSuggestion[r.row]);
        if (chosen) {
          items.push({
            productId: chosen.id,
            name: chosen.name,
            quantity: r.quantity,
            note: r.note ? String(r.note).trim() : '',
          });
        }
      }
    }
    if (items.length === 0) { alert('Chưa có sản phẩm nào để đặt'); return; }

    setSubmitting(true);
    try {
      const res = await fetch(`${apiBase}/api/customer/order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'zalo_mini_app',
          orderSessionToken: token,
          deliveryDate,
          addressId: addressId || undefined,
          deliveryName: deliveryName || undefined,
          deliveryPhone: deliveryPhone || undefined,
          deliveryAddress: deliveryAddress || undefined,
          deliveryType: 'shipping',
          deliveryAlias: 'Địa chỉ giao hàng',
          idempotencyKey,
          items,
          note: `Đặt hàng từ file Excel: ${file?.name || ''}`,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setSuccessCode(data.orderCode);
    } catch (err: any) {
      alert('Lỗi: ' + (err.message || 'Không đặt được đơn hàng'));
    } finally { setSubmitting(false); }
  };

  if (successCode) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center" style={{ fontFamily: 'var(--font-brand)' }}>
        <div className="bg-white rounded-3xl shadow-lg border border-[#14231c]/10 p-10 max-w-md w-full text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-[#0f6f4b]/10 text-[#0f6f4b] flex items-center justify-center mx-auto">
            <CheckCircle2 size={36} />
          </div>
          <h2 className="text-xl font-bold text-[#14231c]">Đặt hàng thành công!</h2>
          <p className="text-[#59665f]">Mã đơn <span className="font-semibold text-[#0f6f4b]">{successCode}</span> đã được gửi tới TPS1.</p>
          <button onClick={() => navigate('/')} className="px-5 py-2.5 rounded-xl bg-[#0f6f4b] text-white font-medium hover:bg-[#0b5a3c]">
            Về trang Đặt hàng
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl" style={{ fontFamily: 'var(--font-brand)' }}>
      <header className="flex items-center gap-3">
        <button onClick={() => navigate('/')} className="p-2 bg-white border border-[#14231c]/10 rounded-xl hover:bg-[#f6f7f4] text-[#14231c]">
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-[#14231c]">Đặt hàng từ Excel</h1>
          <p className="text-sm text-[#59665f]">Tải mẫu, điền tên/mã hàng + số lượng, tải lên để đặt hàng loạt</p>
        </div>
      </header>

      <div className="bg-white rounded-2xl border border-[#14231c]/8 shadow-sm p-5 space-y-4">
        <button onClick={downloadTemplate} className="flex items-center gap-2 text-sm font-medium text-[#0f6f4b] hover:text-[#0b5a3c]">
          <Download size={16} /> Tải file mẫu
        </button>
        <div className="flex gap-2">
          <input type="file" accept=".xlsx,.xls" onChange={(e) => { setFile(e.target.files?.[0] || null); setResults(null); }}
            className="flex-1 text-sm border border-[#14231c]/10 rounded-lg px-3 py-2" />
          <button onClick={checkFile} disabled={!file || checking}
            className="px-4 py-2 bg-[#0f6f4b] text-white rounded-lg text-sm font-medium hover:bg-[#0b5a3c] disabled:opacity-50 flex items-center gap-1.5">
            {checking ? <RefreshCw size={14} className="animate-spin" /> : <Upload size={14} />} Xem trước
          </button>
        </div>
        {error && <div className="p-3 bg-[#c7372f]/5 border border-[#c7372f]/20 rounded-lg text-[#c7372f] text-sm">{error}</div>}
      </div>

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl p-3 border border-[#14231c]/8 text-center">
            <p className="text-lg font-bold text-[#0f6f4b]">{summary.matched}</p>
            <p className="text-[10px] text-[#59665f]">Khớp đúng</p>
          </div>
          <div className="bg-white rounded-xl p-3 border border-[#14231c]/8 text-center">
            <p className="text-lg font-bold text-[#f5c84c]">{summary.ambiguous}</p>
            <p className="text-[10px] text-[#59665f]">Cần chọn lại</p>
          </div>
          <div className="bg-white rounded-xl p-3 border border-[#14231c]/8 text-center">
            <p className="text-lg font-bold text-[#c7372f]">{summary.notFound}</p>
            <p className="text-[10px] text-[#59665f]">Không tìm thấy</p>
          </div>
          <div className="bg-white rounded-xl p-3 border border-[#14231c]/8 text-center">
            <p className="text-lg font-bold text-[#59665f]">{summary.invalidQuantity}</p>
            <p className="text-[10px] text-[#59665f]">SL không hợp lệ</p>
          </div>
        </div>
      )}

      {results && (
        <div className="space-y-2">
          {results.map((r) => (
            <div key={r.row} className="bg-white rounded-xl border border-[#14231c]/8 p-3">
              {r.status === 'matched' && r.product && (
                <div className="flex items-center gap-3">
                  <CheckCircle2 size={18} className="text-[#0f6f4b] shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-[#14231c]">{r.product.name}</p>
                    <p className="text-xs text-[#59665f]">
                      Dòng {r.row} · "{r.input}" · {r.quantity} {r.product.unit} ·{' '}
                      {r.product.priceOnRequest ? <span className="text-[#f5c84c] font-semibold">Liên hệ báo giá</span> : money(r.product.price * r.quantity)}
                    </p>
                  </div>
                  <label className="flex items-center gap-1.5 text-xs text-[#59665f]">
                    <input type="checkbox" checked={!skippedRows[r.row]} onChange={(e) => setSkippedRows((s) => ({ ...s, [r.row]: !e.target.checked }))} />
                    Đặt dòng này
                  </label>
                </div>
              )}
              {r.status === 'ambiguous' && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <HelpCircle size={18} className="text-[#f5c84c] shrink-0" />
                    <p className="text-sm text-[#14231c]">Dòng {r.row}: "{r.input}" ({r.quantity}) — chọn đúng sản phẩm:</p>
                  </div>
                  <div className="pl-7 space-y-1.5">
                    {r.suggestions?.map((s) => (
                      <label key={s.id} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input type="radio" name={`row-${r.row}`} checked={chosenSuggestion[r.row] === s.id}
                          onChange={() => setChosenSuggestion((c) => ({ ...c, [r.row]: s.id }))} />
                        <span className="text-[#14231c]">{s.name}</span>
                        <span className="text-xs text-[#59665f]">({s.priceOnRequest ? 'Liên hệ báo giá' : `${money(s.price)}/${s.unit}`} · giống {Math.round(s.score * 100)}%)</span>
                      </label>
                    ))}
                    <label className="flex items-center gap-2 text-sm cursor-pointer text-[#59665f]">
                      <input type="radio" name={`row-${r.row}`} checked={!chosenSuggestion[r.row]} onChange={() => setChosenSuggestion((c) => { const n = { ...c }; delete n[r.row]; return n; })} />
                      Bỏ qua dòng này
                    </label>
                  </div>
                </div>
              )}
              {r.status === 'not_found' && (
                <div className="flex items-center gap-3">
                  <XCircle size={18} className="text-[#c7372f] shrink-0" />
                  <p className="text-sm text-[#59665f]">Dòng {r.row}: "{r.input}" — không tìm thấy sản phẩm phù hợp, sẽ bỏ qua.</p>
                </div>
              )}
              {r.status === 'invalid_quantity' && (
                <div className="flex items-center gap-3">
                  <AlertTriangle size={18} className="text-[#c7372f] shrink-0" />
                  <p className="text-sm text-[#59665f]">Dòng {r.row}: "{r.input}" — số lượng không hợp lệ, sẽ bỏ qua.</p>
                </div>
              )}
            </div>
          ))}

          {confirmableCount > 0 && (
            <div className="bg-white rounded-2xl border border-[#14231c]/8 shadow-sm p-5 space-y-4">
              <p className="text-sm font-semibold text-[#14231c]">Thông tin giao hàng ({confirmableCount} mặt hàng sẽ đặt)</p>
              
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-[#14231c]">Ngày giao hàng *</label>
                <input
                  type="date"
                  value={deliveryDate}
                  onChange={(e) => setDeliveryDate(e.target.value)}
                  className="w-full border border-[#14231c]/10 rounded-lg px-3 py-2 text-sm bg-white"
                />
                {cutoffWarning && (
                  <p className="text-xs text-amber-700 bg-amber-50 p-2 rounded-lg border border-amber-200">
                    ⚠️ {cutoffWarning}
                  </p>
                )}
              </div>

              {addresses.length > 0 && (
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-[#14231c]">Chọn sổ địa chỉ</label>
                  <select
                    value={addressId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setAddressId(id);
                      const chosen = addresses.find((a) => a.id === id);
                      if (chosen) {
                        setDeliveryName(chosen.contact_name || '');
                        setDeliveryPhone(chosen.contact_phone || '');
                        setDeliveryAddress(chosen.address || '');
                      }
                    }}
                    className="w-full border border-[#14231c]/10 rounded-lg px-3 py-2 text-sm bg-white"
                  >
                    {addresses.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.label} — {a.address} {a.contact_name ? `(${a.contact_name})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="space-y-2">
                <input
                  type="text"
                  value={deliveryName}
                  onChange={(e) => setDeliveryName(e.target.value)}
                  placeholder="Tên người nhận *"
                  className="w-full border border-[#14231c]/10 rounded-lg px-3 py-2 text-sm"
                />
                <input
                  type="text"
                  value={deliveryPhone}
                  onChange={(e) => setDeliveryPhone(e.target.value)}
                  placeholder="Số điện thoại *"
                  className="w-full border border-[#14231c]/10 rounded-lg px-3 py-2 text-sm"
                />
                <textarea
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  placeholder="Địa chỉ giao hàng *"
                  rows={2}
                  className="w-full border border-[#14231c]/10 rounded-lg px-3 py-2 text-sm resize-none"
                />
              </div>

              <button
                onClick={handlePreSubmit}
                disabled={submitting}
                className="w-full py-3 rounded-xl bg-[#0f6f4b] text-white font-semibold hover:bg-[#0b5a3c] disabled:opacity-60 transition-colors"
              >
                {submitting ? 'Đang gửi đơn...' : `Xác nhận đặt ${confirmableCount} mặt hàng`}
              </button>
            </div>
          )}

          {showSkippedModal && (
            <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl space-y-4">
                <div className="flex items-center gap-2.5 text-amber-600">
                  <AlertTriangle size={22} className="shrink-0" />
                  <h3 className="font-bold text-base text-slate-800">Còn dòng chưa được đặt</h3>
                </div>
                <p className="text-sm text-slate-600">
                  File có <strong>{skippedOrUnresolvedRows.length}</strong> dòng chưa được xử lý hoặc bị bỏ qua:
                </p>
                <div className="max-h-48 overflow-y-auto space-y-2 border border-slate-100 rounded-xl p-3 bg-slate-50 text-xs">
                  {skippedOrUnresolvedRows.map((r) => (
                    <div key={r.row} className="flex items-start justify-between gap-2 pb-1.5 border-b border-slate-200 last:border-0 last:pb-0">
                      <div>
                        <span className="font-semibold text-slate-700">Dòng {r.row}:</span> "{r.input}" ({r.quantity})
                      </div>
                      <span className="text-amber-700 font-medium shrink-0">
                        {r.status === 'not_found' && 'Không tìm thấy'}
                        {r.status === 'invalid_quantity' && 'Sai số lượng'}
                        {r.status === 'ambiguous' && !chosenSuggestion[r.row] && 'Chưa chọn'}
                        {r.status === 'matched' && skippedRows[r.row] && 'Bỏ qua'}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="text-sm text-slate-600">
                  Bạn có muốn tiếp tục đặt <strong>{confirmableCount}</strong> mặt hàng đã khớp không?
                </p>
                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowSkippedModal(false)}
                    className="px-4 py-2 text-sm rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 font-medium"
                  >
                    Hủy để kiểm tra lại
                  </button>
                  <button
                    type="button"
                    onClick={submitOrder}
                    disabled={submitting}
                    className="px-4 py-2 text-sm rounded-xl bg-[#0f6f4b] text-white hover:bg-[#0b5a3c] font-semibold"
                  >
                    Tiếp tục đặt {confirmableCount} mặt hàng
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
