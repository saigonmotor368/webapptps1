import { useMemo, useRef, useState } from 'react';
import { AlertTriangle, Camera, CheckCircle2, FileText, Loader2, Sparkles, Upload, X, XCircle } from 'lucide-react';
import { getToken } from '../lib/api';

const API_BASE = (import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? '' : 'https://thucphamsomot.vn')).replace(/\/$/, '');

export type SmartImportItem = {
  importLineId: string; productId: string; sku: string; name: string; category: string | null; unit: string;
  imageUrl: string | null; quantity: number; inputQuantity: number; inputUnit: string; conversionFactor: number | null;
  note: string; price: number; priceSource: string; minOrderQty?: number | null; orderStep?: number | null;
  enforceOrderStep?: boolean | null; packagingNote?: string | null; quantityPrecision?: number | null;
};

type ImportLine = {
  id: string; raw_name: string; raw_sku?: string | null; raw_quantity: number; raw_unit?: string | null; raw_note?: string | null;
  converted_quantity?: number | null; resolved_price?: number | null; status: string; warnings?: string[]; selected: boolean;
  selected_product_id?: string | null; product?: { id: string; sku: string; name: string; unit: string; packaging_note?: string | null } | null;
  suggestions?: Array<{ id: string; sku: string; name: string; unit: string; score: number; price?: number | null }>;
};

async function apiFetch(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers || {});
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(`${API_BASE}${path}`, { ...init, headers });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok) throw new Error(data?.error || `Lỗi máy chủ (${response.status})`);
  return data;
}

export default function SmartOrderImportModal({ open, onClose, onConfirm }: {
  open: boolean; onClose: () => void; onConfirm: (batchId: string, items: SmartImportItem[]) => void;
}) {
  const pickerRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [batchId, setBatchId] = useState('');
  const [lines, setLines] = useState<ImportLine[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const summary = useMemo(() => lines.reduce((acc, line) => {
    if (line.status === 'matched') acc.valid++; else if (line.status === 'ambiguous') acc.review++; else acc.error++;
    return acc;
  }, { valid: 0, review: 0, error: 0 }), [lines]);

  if (!open) return null;
  const resetAndClose = async () => {
    if (batchId) {
      try { await apiFetch(`/api/order-import/batches/${batchId}`, { method: 'DELETE' }); } catch { /* phiên cũng sẽ tự hết hạn sau 24 giờ */ }
    }
    setFiles([]); setLines([]); setBatchId(''); setError(''); setMessage(''); onClose();
  };

  const analyze = async () => {
    if (!files.length) return;
    setBusy(true); setError(''); setMessage('Đang tải tệp an toàn...');
    try {
      const created = await apiFetch('/api/order-import/uploads', {
        method: 'POST', body: JSON.stringify({ channel: 'website', files: files.map((file) => ({ name: file.name, mimeType: file.type, size: file.size })) }),
      });
      setBatchId(created.batchId);
      for (let index = 0; index < files.length; index++) {
        const upload = created.uploads[index];
        const response = await fetch(upload.signedUrl, { method: 'PUT', headers: { 'Content-Type': upload.mimeType, 'x-upsert': 'false' }, body: files[index] });
        if (!response.ok) throw new Error(`Không tải được ${files[index].name}`);
      }
      setMessage('Gemini đang đọc tài liệu, TPS1 đang đối chiếu sản phẩm...');
      await apiFetch('/api/order-import/analyze', { method: 'POST', body: JSON.stringify({ batchId: created.batchId }) });
      const result = await apiFetch(`/api/order-import/batches/${created.batchId}`);
      setLines(result.lines || []); setMessage('');
    } catch (err: any) { setError(err.message || 'Không đọc được đơn hàng'); setMessage(''); }
    finally { setBusy(false); }
  };

  const patchLine = async (line: ImportLine, update: Record<string, unknown>) => {
    if (!batchId) return;
    setBusy(true); setError('');
    try {
      await apiFetch(`/api/order-import/batches/${batchId}/lines/${line.id}`, { method: 'PATCH', body: JSON.stringify(update) });
      const result = await apiFetch(`/api/order-import/batches/${batchId}`);
      setLines(result.lines || []);
    } catch (err: any) { setError(err.message || 'Không cập nhật được dòng hàng'); }
    finally { setBusy(false); }
  };

  const confirm = async () => {
    setBusy(true); setError('');
    try {
      const result = await apiFetch(`/api/order-import/batches/${batchId}/confirm`, { method: 'POST' });
      onConfirm(result.batchId, result.items || []);
      setFiles([]); setLines([]); setBatchId(''); onClose();
    } catch (err: any) { setError(err.message || 'Còn dòng hàng cần kiểm tra'); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-[#07120d]/60 backdrop-blur-sm p-3 sm:p-6 flex items-center justify-center">
      <div className="bg-[#f7f8f5] rounded-3xl shadow-2xl w-full max-w-5xl max-h-[94vh] overflow-hidden flex flex-col">
        <header className="bg-white px-5 py-4 border-b border-[#17231d]/10 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3"><span className="w-10 h-10 rounded-2xl bg-[#0f7a4f]/10 text-[#0f7a4f] flex items-center justify-center"><Sparkles size={20}/></span><div><h2 className="font-black text-[#17231d]">Nhập đơn thông minh</h2><p className="text-xs text-[#59665f]">Ảnh, PDF hoặc Excel · luôn xem lại trước khi thêm vào giỏ</p></div></div>
          <button onClick={resetAndClose} className="p-2 rounded-xl hover:bg-slate-100"><X size={20}/></button>
        </header>
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
          {!lines.length && (
            <section className="bg-white rounded-2xl border border-[#17231d]/10 p-5 space-y-4">
              <div className="grid sm:grid-cols-2 gap-3">
                <button onClick={() => cameraRef.current?.click()} className="border-2 border-dashed border-[#0f7a4f]/30 bg-[#0f7a4f]/5 rounded-2xl p-6 flex flex-col items-center gap-2 text-[#0f7a4f] font-bold"><Camera size={30}/>Chụp danh sách đặt hàng</button>
                <button onClick={() => pickerRef.current?.click()} className="border-2 border-dashed border-[#17231d]/15 rounded-2xl p-6 flex flex-col items-center gap-2 text-[#17231d] font-bold"><Upload size={30}/>Chọn ảnh, PDF hoặc Excel</button>
              </div>
              <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(event) => setFiles(event.target.files ? Array.from(event.target.files) : [])}/>
              <input ref={pickerRef} type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf,.xlsx,.xls" className="hidden" onChange={(event) => setFiles(event.target.files ? Array.from(event.target.files).slice(0, 10) : [])}/>
              {files.length > 0 && <div className="space-y-2">{files.map((file) => <div key={`${file.name}-${file.size}`} className="flex items-center gap-2 bg-[#f7f8f5] rounded-xl px-3 py-2 text-sm"><FileText size={16} className="text-[#0f7a4f]"/><span className="flex-1 truncate">{file.name}</span><span className="text-xs text-[#59665f]">{(file.size / 1024 / 1024).toFixed(1)} MB</span></div>)}</div>}
              <button disabled={!files.length || busy} onClick={analyze} className="w-full py-3 rounded-xl bg-[#0f7a4f] text-white font-bold disabled:opacity-50 flex items-center justify-center gap-2">{busy ? <Loader2 className="animate-spin" size={18}/> : <Sparkles size={18}/>}Đọc và đối chiếu đơn hàng</button>
            </section>
          )}
          {lines.length > 0 && <>
            <div className="grid grid-cols-3 gap-2"><Summary label="Hợp lệ" value={summary.valid} color="green"/><Summary label="Cần chọn" value={summary.review} color="amber"/><Summary label="Cần sửa" value={summary.error} color="red"/></div>
            <div className="space-y-2">{lines.map((line) => <LineCard key={line.id} line={line} disabled={busy} onPatch={(update) => patchLine(line, update)}/>)}</div>
          </>}
          {message && <div className="flex items-center justify-center gap-2 py-3 text-sm font-semibold text-[#0f7a4f]"><Loader2 size={17} className="animate-spin"/>{message}</div>}
          {error && <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 p-3 text-sm flex gap-2"><AlertTriangle size={17} className="shrink-0"/>{error}</div>}
        </div>
        {lines.length > 0 && <footer className="bg-white px-5 py-4 border-t border-[#17231d]/10 flex items-center justify-between gap-3"><p className="text-xs text-[#59665f]">Chỉ thêm dòng màu xanh. Dòng đỏ phải sửa hoặc bỏ chọn.</p><button onClick={confirm} disabled={busy || summary.valid === 0} className="px-5 py-2.5 rounded-xl bg-[#0f7a4f] text-white font-bold disabled:opacity-50 flex items-center gap-2">{busy && <Loader2 className="animate-spin" size={16}/>}Thêm {summary.valid} dòng vào giỏ</button></footer>}
      </div>
    </div>
  );
}

function Summary({ label, value, color }: { label: string; value: number; color: 'green'|'amber'|'red' }) {
  const cls = color === 'green' ? 'bg-green-50 text-green-700 border-green-200' : color === 'amber' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-red-50 text-red-700 border-red-200';
  return <div className={`rounded-xl border p-3 text-center ${cls}`}><div className="text-xl font-black">{value}</div><div className="text-[11px] font-bold">{label}</div></div>;
}
function LineCard({ line, disabled, onPatch }: { line: ImportLine; disabled: boolean; onPatch: (update: Record<string, unknown>) => void }) {
  const isValid = line.status === 'matched'; const isReview = line.status === 'ambiguous';
  const color = isValid ? 'border-green-200 bg-green-50/60' : isReview ? 'border-amber-200 bg-amber-50/60' : 'border-red-200 bg-red-50/60';
  return <div className={`rounded-2xl border p-3.5 ${color}`}>
    <div className="flex items-start gap-3">{isValid ? <CheckCircle2 className="text-green-600 shrink-0" size={20}/> : isReview ? <AlertTriangle className="text-amber-600 shrink-0" size={20}/> : <XCircle className="text-red-600 shrink-0" size={20}/>}<div className="min-w-0 flex-1">
      <div className="flex flex-wrap justify-between gap-2"><div><p className="font-bold text-sm text-[#17231d]">{line.raw_name}</p><p className="text-xs text-[#59665f]">Đọc được: {line.raw_quantity} {line.raw_unit || ''}{line.raw_note ? ` · ${line.raw_note}` : ''}</p></div>{line.resolved_price != null && <span className="font-bold text-sm text-[#0f7a4f]">{new Intl.NumberFormat('vi-VN').format(line.resolved_price)}đ</span>}</div>
      {line.product && <p className="mt-1.5 text-xs font-semibold text-[#0f7a4f]">→ {line.product.name} ({line.product.sku}) · {line.converted_quantity} {line.product.unit}</p>}
      {isReview && line.suggestions?.length ? <div className="mt-2 flex flex-wrap gap-2">{line.suggestions.map((item) => <button disabled={disabled} key={item.id} onClick={() => onPatch({ productId: item.id, quantity: line.raw_quantity, inputUnit: line.raw_unit || item.unit })} className="text-xs bg-white border border-amber-300 rounded-lg px-2.5 py-1.5 hover:border-[#0f7a4f]">{item.name} · Mã: {item.sku} · {item.unit}</button>)}</div> : null}
      {!isValid && line.warnings?.map((warning) => <p key={warning} className="text-xs text-red-700 mt-1.5 font-semibold">{warning}</p>)}
      {line.selected_product_id && <div className="mt-2 flex flex-wrap items-center gap-2"><input type="number" min="0.001" step="any" defaultValue={line.raw_quantity} className="w-24 px-2 py-1.5 border rounded-lg text-sm" onBlur={(event) => { const qty=Number(event.target.value); if(qty!==Number(line.raw_quantity)) onPatch({ productId: line.selected_product_id, quantity: qty, inputUnit: line.raw_unit || line.product?.unit || '' }); }}/><input defaultValue={line.raw_unit || line.product?.unit || ''} className="w-24 px-2 py-1.5 border rounded-lg text-sm" onBlur={(event) => { if(event.target.value!==(line.raw_unit||'')) onPatch({ productId: line.selected_product_id, quantity: line.raw_quantity, inputUnit: event.target.value }); }}/><button disabled={disabled} onClick={() => line.selected ? onPatch({ selected: false }) : onPatch({ productId: line.selected_product_id, quantity: line.raw_quantity, inputUnit: line.raw_unit || line.product?.unit || '', selected: true })} className="text-xs underline text-[#59665f]">{line.selected ? 'Bỏ dòng này' : 'Chọn lại dòng này'}</button></div>}
    </div></div>
  </div>;
}
