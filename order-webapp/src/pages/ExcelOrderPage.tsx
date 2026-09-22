import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, Download, CheckCircle2, AlertTriangle, XCircle, ShoppingCart } from 'lucide-react';
import { api, ApiError, requestFile, type ExcelMatchResult } from '../lib/api';
import { useCart } from '../contexts/CartContext';

function money(v: number) {
  return new Intl.NumberFormat('vi-VN').format(Number(v) || 0) + 'đ';
}

// Mục 9/13.7 kế hoạch — khách tải file mẫu, nộp lại danh sách hàng cần mua,
// hệ thống tự khớp mã/tên (khớp gần đúng nếu không tìm thấy chính xác). Dùng
// nguyên API /api/customer/order/import-excel đã có sẵn (chung với sale-webapp
// và Zalo Mini App) — không xử lý lại logic khớp ở phía app này.
export default function ExcelOrderPage() {
  const { addItem } = useCart();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [results, setResults] = useState<ExcelMatchResult[] | null>(null);
  const [summary, setSummary] = useState<Record<string, number> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [chosenSuggestion, setChosenSuggestion] = useState<Record<number, string>>({});

  const downloadTemplate = async () => {
    try {
      const blob = await requestFile('/api/customer/order/import-excel');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'mau-dat-hang.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('Không tải được file mẫu, vui lòng thử lại');
    }
  };

  const handleFile = async (file: File) => {
    setLoading(true);
    setError('');
    setResults(null);
    try {
      const res = await api.importExcel(file);
      setResults(res.results || []);
      setSummary(res.summary || null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không đọc được file, kiểm tra đúng định dạng mẫu chưa');
    } finally {
      setLoading(false);
    }
  };

  const addAllMatched = () => {
    if (!results) return;
    for (const r of results) {
      if (r.status === 'matched' && r.product) {
        addItem(
          { id: r.product.id, sku: r.product.sku, name: r.product.name, category: null, unit: r.product.unit, imageUrl: null, price: r.product.price, priceOnRequest: r.product.priceOnRequest, available: true },
          r.quantity
        );
      } else if (r.status === 'ambiguous' && chosenSuggestion[r.row]) {
        const chosen = r.suggestions?.find((s) => s.id === chosenSuggestion[r.row]);
        if (chosen) {
          addItem(
            { id: chosen.id, sku: chosen.sku, name: chosen.name, category: null, unit: chosen.unit, imageUrl: null, price: chosen.price, priceOnRequest: chosen.priceOnRequest, available: true },
            r.quantity
          );
        }
      }
    }
    navigate('/gio-hang');
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-[#14231c]">Đặt hàng bằng file Excel</h1>
        <p className="text-[#59665f] text-sm mt-1">
          Tải file mẫu, điền tên/mã hàng và số lượng cần mua, sau đó tải lên lại để hệ thống tự dựng giỏ hàng.
        </p>
      </header>

      <div className="flex flex-wrap gap-3">
        <button
          onClick={downloadTemplate}
          className="flex items-center gap-2 px-4 py-2.5 border border-[#14231c]/15 rounded-xl font-medium text-[#14231c] hover:bg-white transition-colors"
        >
          <Download size={18} /> Tải file mẫu
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#0f7a4f] text-white rounded-xl font-medium hover:bg-[#0b4f34] disabled:opacity-50 transition-colors"
        >
          <Upload size={18} /> {loading ? 'Đang xử lý...' : 'Tải lên file đã điền'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = '';
          }}
        />
      </div>

      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">{error}</div>}

      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <SummaryTile label="Khớp đúng" value={summary.matched} color="text-[#0f7a4f]" icon={<CheckCircle2 size={16} />} />
          <SummaryTile label="Cần chọn" value={summary.ambiguous} color="text-amber-600" icon={<AlertTriangle size={16} />} />
          <SummaryTile label="Không tìm thấy" value={summary.notFound} color="text-red-600" icon={<XCircle size={16} />} />
          <SummaryTile label="Sai số lượng" value={summary.invalidQuantity} color="text-red-600" icon={<XCircle size={16} />} />
        </div>
      )}

      {results && results.length > 0 && (
        <div className="space-y-2.5">
          {results.map((r) => (
            <div key={r.row} className="bg-white border border-[#14231d]/10 rounded-xl p-3.5">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[#14231c] truncate">
                    Dòng {r.row}: {r.input} <span className="text-[#59665f]">× {r.quantity}</span>
                  </p>
                  {r.note && <p className="text-xs text-[#59665f]/70 italic">{r.note}</p>}
                </div>
                <StatusBadge status={r.status} />
              </div>
              {r.status === 'matched' && r.product && (
                <p className="text-xs text-[#0f7a4f] mt-1.5">
                  → {r.product.name} ({r.product.sku}) — {r.product.priceOnRequest ? 'Liên hệ báo giá' : money(r.product.price)}
                </p>
              )}
              {r.status === 'ambiguous' && r.suggestions && (
                <div className="mt-2 space-y-1.5">
                  <p className="text-xs text-[#59665f]">Chọn đúng sản phẩm:</p>
                  {r.suggestions.map((s) => (
                    <label key={s.id} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="radio"
                        name={`row-${r.row}`}
                        checked={chosenSuggestion[r.row] === s.id}
                        onChange={() => setChosenSuggestion((prev) => ({ ...prev, [r.row]: s.id }))}
                      />
                      {s.name} ({s.sku}) — {s.priceOnRequest ? 'Liên hệ báo giá' : money(s.price)}
                    </label>
                  ))}
                </div>
              )}
            </div>
          ))}

          <button
            onClick={addAllMatched}
            className="w-full flex items-center justify-center gap-2 bg-[#0f7a4f] text-white font-semibold py-3 rounded-xl hover:bg-[#0b4f34] transition-colors mt-4"
          >
            <ShoppingCart size={18} /> Thêm tất cả vào giỏ hàng
          </button>
        </div>
      )}
    </div>
  );
}

function SummaryTile({ label, value, color, icon }: { label: string; value: number; color: string; icon: React.ReactNode }) {
  return (
    <div className="bg-white border border-[#14231c]/10 rounded-xl p-3 text-center">
      <div className={`flex items-center justify-center gap-1.5 font-bold text-lg ${color}`}>
        {icon} {value}
      </div>
      <p className="text-xs text-[#59665f] mt-0.5">{label}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: ExcelMatchResult['status'] }) {
  const map: Record<string, { label: string; cls: string }> = {
    matched: { label: 'Khớp đúng', cls: 'bg-green-100 text-green-700' },
    ambiguous: { label: 'Cần chọn', cls: 'bg-amber-100 text-amber-700' },
    not_found: { label: 'Không tìm thấy', cls: 'bg-red-100 text-red-700' },
    invalid_quantity: { label: 'Sai số lượng', cls: 'bg-red-100 text-red-700' },
  };
  const s = map[status] || { label: status, cls: 'bg-slate-100 text-slate-600' };
  return <span className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${s.cls}`}>{s.label}</span>;
}
