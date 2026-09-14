import { useState } from 'react';
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

  const [deliveryName, setDeliveryName] = useState('');
  const [deliveryPhone, setDeliveryPhone] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [successCode, setSuccessCode] = useState('');

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

  const submitOrder = async () => {
    if (!deliveryName.trim() || !deliveryPhone.trim() || !deliveryAddress.trim()) {
      alert('Vui lòng nhập đầy đủ tên, số điện thoại và địa chỉ giao hàng'); return;
    }
    const items: { productId: string; name: string; quantity: number }[] = [];
    for (const r of results || []) {
      if (r.status === 'matched' && r.product && !skippedRows[r.row]) {
        items.push({ productId: r.product.id, name: r.product.name, quantity: r.quantity });
      } else if (r.status === 'ambiguous' && chosenSuggestion[r.row]) {
        const chosen = r.suggestions?.find((s) => s.id === chosenSuggestion[r.row]);
        if (chosen) items.push({ productId: chosen.id, name: chosen.name, quantity: r.quantity });
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
          items,
          deliveryType: 'shipping',
          deliveryAlias: 'Địa chỉ giao hàng',
          deliveryName, deliveryPhone, deliveryAddress,
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
            <div className="bg-white rounded-2xl border border-[#14231c]/8 shadow-sm p-5 space-y-3">
              <p className="text-sm font-semibold text-[#14231c]">Thông tin giao hàng ({confirmableCount} mặt hàng sẽ đặt)</p>
              <input type="text" value={deliveryName} onChange={(e) => setDeliveryName(e.target.value)} placeholder="Tên người nhận *"
                className="w-full border border-[#14231c]/10 rounded-lg px-3 py-2 text-sm" />
              <input type="text" value={deliveryPhone} onChange={(e) => setDeliveryPhone(e.target.value)} placeholder="Số điện thoại *"
                className="w-full border border-[#14231c]/10 rounded-lg px-3 py-2 text-sm" />
              <textarea value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} placeholder="Địa chỉ giao hàng *" rows={2}
                className="w-full border border-[#14231c]/10 rounded-lg px-3 py-2 text-sm resize-none" />
              <button onClick={submitOrder} disabled={submitting}
                className="w-full py-3 rounded-xl bg-[#0f6f4b] text-white font-semibold hover:bg-[#0b5a3c] disabled:opacity-60">
                {submitting ? 'Đang gửi đơn...' : `Xác nhận đặt ${confirmableCount} mặt hàng`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
