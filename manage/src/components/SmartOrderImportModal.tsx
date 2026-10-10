import { useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  FileText,
  Loader2,
  Search,
  ScanLine,
  Trash2,
  Upload,
  X,
  XCircle,
} from "lucide-react";
import { getApiBase } from "../lib/apiBase";

export type PosSmartImportItem = {
  importLineId: string;
  productId: string;
  sku: string;
  name: string;
  unit: string;
  quantity: number;
  note: string;
  price: number;
  imageUrl?: string | null;
};
type Line = {
  id: string;
  raw_name: string;
  raw_quantity: number;
  raw_unit?: string;
  raw_note?: string;
  converted_quantity?: number;
  resolved_price?: number;
  status: string;
  selected: boolean;
  selected_product_id?: string;
  warnings?: string[];
  product?: { name: string; sku: string; unit: string };
  suggestions?: Array<{
    id: string;
    name: string;
    sku: string;
    unit: string;
    score: number;
  }>;
};
type ProductChoice = { id: string; name: string; sku: string; unit: string };

export default function SmartOrderImportModal({
  open,
  token,
  customerId,
  onClose,
  onConfirm,
}: {
  open: boolean;
  token: string;
  customerId: string;
  onClose: () => void;
  onConfirm: (batchId: string, items: PosSmartImportItem[]) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [batchId, setBatchId] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pickerLine, setPickerLine] = useState<Line | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<ProductChoice[]>([]);
  const [searching, setSearching] = useState(false);
  const base = getApiBase();
  const counts = useMemo(
    () =>
      lines.reduce(
        (a, l) => {
          if (l.status === "matched" && l.selected) a.ok++;
          else if (l.status === "ambiguous") a.review++;
          else a.bad++;
          return a;
        },
        { ok: 0, review: 0, bad: 0 },
      ),
    [lines],
  );
  if (!open) return null;
  const call = async (path: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    if (init.body) headers.set("Content-Type", "application/json");
    const res = await fetch(`${base}${path}`, { ...init, headers });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok)
      throw new Error(data?.error || `Lỗi ${res.status}`);
    return data;
  };
  const reload = async (id = batchId) => {
    const data = await call(`/api/order-import/batches/${id}`);
    setLines(data.lines || []);
  };
  const analyze = async () => {
    if (!customerId) {
      setError("Vui lòng chọn khách hàng trước khi đọc đơn");
      return;
    }
    if (!files.length) return;
    setBusy(true);
    setError("");
    try {
      const created = await call("/api/order-import/uploads", {
        method: "POST",
        body: JSON.stringify({
          channel: "pos",
          customerId,
          files: files.map((f) => ({
            name: f.name,
            mimeType: f.type,
            size: f.size,
          })),
        }),
      });
      setBatchId(created.batchId);
      for (let i = 0; i < files.length; i++) {
        const up = created.uploads[i];
        const res = await fetch(up.signedUrl, {
          method: "PUT",
          headers: { "Content-Type": up.mimeType, "x-upsert": "false" },
          body: files[i],
        });
        if (!res.ok) throw new Error(`Không tải được ${files[i].name}`);
      }
      await call("/api/order-import/analyze", {
        method: "POST",
        body: JSON.stringify({ batchId: created.batchId }),
      });
      await reload(created.batchId);
    } catch (e: any) {
      setError(e.message || "Không đọc được tài liệu");
    } finally {
      setBusy(false);
    }
  };
  const patch = async (line: Line, body: any) => {
    setBusy(true);
    setError("");
    try {
      await call(`/api/order-import/batches/${batchId}/lines/${line.id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      await reload();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const removeLine = async (line: Line) => {
    setBusy(true);
    setError("");
    try {
      await call(`/api/order-import/batches/${batchId}/lines/${line.id}`, { method: "DELETE" });
      setLines((current) => current.filter((item) => item.id !== line.id));
      if (pickerLine?.id === line.id) setPickerLine(null);
    } catch (e: any) {
      setError(e.message || "Không bỏ được dòng hàng");
    } finally { setBusy(false); }
  };
  const openProductPicker = (line: Line) => {
    setPickerLine(line); setSearchTerm(line.raw_name); setSearchResults([]);
  };
  const searchProducts = async () => {
    const query = searchTerm.trim();
    if (!query) return;
    setSearching(true); setError("");
    try {
      const data = await call(`/api/admin/products?search=${encodeURIComponent(query)}&pageSize=30&customerId=${encodeURIComponent(customerId)}`);
      setSearchResults((data.products || []).map((product: any) => ({ id: product.id, name: product.name, sku: product.sku || "", unit: product.unit || "Kg" })));
    } catch (e: any) { setError(e.message || "Không tìm được hàng hóa"); }
    finally { setSearching(false); }
  };
  const chooseProduct = async (product: ProductChoice) => {
    if (!pickerLine) return;
    await patch(pickerLine, { productId: product.id, quantity: pickerLine.raw_quantity, inputUnit: pickerLine.raw_unit || product.unit });
    setPickerLine(null); setSearchResults([]);
  };
  const confirm = async () => {
    setBusy(true);
    setError("");
    try {
      const data = await call(`/api/order-import/batches/${batchId}/confirm`, {
        method: "POST",
      });
      onConfirm(data.batchId, data.items || []);
      setFiles([]);
      setLines([]);
      setBatchId("");
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const cancel = async () => {
    if (batchId) {
      try {
        await call(`/api/order-import/batches/${batchId}`, {
          method: "DELETE",
        });
      } catch {
        /* phiên cũng sẽ tự hết hạn sau 24 giờ */
      }
    }
    setFiles([]);
    setLines([]);
    setBatchId("");
    setError("");
    onClose();
  };
  return (
    <div className="fixed inset-0 z-[100] bg-slate-950/60 backdrop-blur-sm p-4 flex items-center justify-center">
      <div className="bg-slate-50 rounded-3xl shadow-2xl w-full max-w-5xl max-h-[94vh] flex flex-col overflow-hidden">
        <header className="bg-white border-b px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="p-2.5 bg-emerald-50 text-emerald-700 rounded-xl">
              <ScanLine size={21} />
            </span>
            <div>
              <h2 className="font-bold text-slate-900">
                Đọc đơn từ ảnh/tài liệu
              </h2>
              <p className="text-xs text-slate-500">
                Khách hàng đã chọn · giá được giải lại từ bảng giá TPS1
              </p>
            </div>
          </div>
          <button
            onClick={cancel}
            className="p-2 hover:bg-slate-100 rounded-lg"
          >
            <X size={20} />
          </button>
        </header>
        <div className="p-5 overflow-y-auto space-y-4">
          {!lines.length && (
            <div className="bg-white border rounded-2xl p-5 space-y-4">
              <div className="grid sm:grid-cols-2 gap-3">
                <button
                  onClick={() => cameraRef.current?.click()}
                  className="p-6 rounded-2xl border-2 border-dashed border-emerald-300 bg-emerald-50 text-emerald-700 font-semibold flex flex-col items-center gap-2"
                >
                  <Camera size={28} />
                  Chụp danh sách
                </button>
                <button
                  onClick={() => fileRef.current?.click()}
                  className="p-6 rounded-2xl border-2 border-dashed border-slate-300 font-semibold flex flex-col items-center gap-2"
                >
                  <Upload size={28} />
                  Chọn ảnh, PDF hoặc Excel
                </button>
              </div>
              <input
                ref={cameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) =>
                  setFiles(e.target.files ? Array.from(e.target.files) : [])
                }
              />
              <input
                ref={fileRef}
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,application/pdf,.xlsx,.xls"
                className="hidden"
                onChange={(e) =>
                  setFiles(
                    e.target.files
                      ? Array.from(e.target.files).slice(0, 10)
                      : [],
                  )
                }
              />
              {files.map((f) => (
                <div
                  key={f.name + f.size}
                  className="flex gap-2 items-center bg-slate-50 px-3 py-2 rounded-lg text-sm"
                >
                  <FileText size={15} />
                  <span className="flex-1 truncate">{f.name}</span>
                  <span className="text-xs text-slate-500">
                    {(f.size / 1048576).toFixed(1)} MB
                  </span>
                </div>
              ))}
              <button
                disabled={!files.length || busy}
                onClick={analyze}
                className="w-full py-3 bg-emerald-600 text-white rounded-xl font-bold disabled:opacity-50 flex justify-center gap-2"
              >
                {busy ? (
                  <Loader2 className="animate-spin" size={18} />
                ) : (
                  <ScanLine size={18} />
                )}
                Đọc và đối chiếu
              </button>
            </div>
          )}
          {!!lines.length && (
            <>
              <div className="grid grid-cols-3 gap-2">
                <Stat n={counts.ok} text="Hợp lệ" cls="green" />
                <Stat n={counts.review} text="Cần chọn" cls="amber" />
                <Stat n={counts.bad} text="Cần sửa" cls="red" />
              </div>
              <div className="space-y-2">
                {lines.map((line) => (
                  <div
                    key={line.id}
                    className={`rounded-xl border p-3 ${line.status === "matched" ? "bg-green-50 border-green-200" : line.status === "ambiguous" ? "bg-amber-50 border-amber-200" : "bg-red-50 border-red-200"}`}
                  >
                    <div className="flex gap-2">
                      {line.status === "matched" ? (
                        <CheckCircle2
                          className="text-green-600 shrink-0"
                          size={19}
                        />
                      ) : line.status === "ambiguous" ? (
                        <AlertTriangle
                          className="text-amber-600 shrink-0"
                          size={19}
                        />
                      ) : (
                        <XCircle className="text-red-600 shrink-0" size={19} />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between gap-2">
                          <div>
                            <p className="font-semibold text-sm">
                              {line.raw_name}
                            </p>
                            <p className="text-xs text-slate-500">
                              {line.raw_quantity} {line.raw_unit || ""}
                              {line.raw_note ? ` · ${line.raw_note}` : ""}
                            </p>
                          </div>
                          {line.resolved_price != null && (
                            <b className="text-sm text-emerald-700">
                              {new Intl.NumberFormat("vi-VN").format(
                                line.resolved_price,
                              )}
                              đ
                            </b>
                          )}
                        </div>
                        {line.product && (
                          <p className="text-xs text-emerald-700 mt-1">
                            → {line.product.name} ({line.product.sku}) ·{" "}
                            {line.converted_quantity} {line.product.unit}
                          </p>
                        )}
                        {line.suggestions?.length ? (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {line.suggestions.map((s) => (
                              <button
                                key={s.id}
                                disabled={busy}
                                onClick={() =>
                                  patch(line, {
                                    productId: s.id,
                                    quantity: line.raw_quantity,
                                    inputUnit: line.raw_unit || s.unit,
                                  })
                                }
                                className="px-2 py-1 bg-white border border-amber-300 rounded-lg text-xs"
                              >
                                {s.name} · Mã: {s.sku} · {s.unit}
                              </button>
                            ))}
                          </div>
                        ) : null}
                        {line.warnings?.map((w) => (
                          <p
                            key={w}
                            className="text-xs text-red-700 font-medium mt-1"
                          >
                            {w}
                          </p>
                        ))}
                        {line.status !== "matched" && (
                          <div className="flex flex-wrap gap-2 mt-2">
                            <button disabled={busy} onClick={() => openProductPicker(line)} className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5"><Search size={14} /> Chọn sản phẩm</button>
                            <button disabled={busy} onClick={() => removeLine(line)} className="px-3 py-1.5 bg-white border border-red-200 text-red-600 rounded-lg text-xs font-semibold flex items-center gap-1.5"><Trash2 size={14} /> Bỏ dòng</button>
                          </div>
                        )}
                        {line.selected_product_id && (
                          <div className="flex gap-2 mt-2">
                            <input
                              type="number"
                              step="any"
                              defaultValue={line.raw_quantity}
                              className="w-24 border rounded-lg px-2 py-1 text-sm"
                              onBlur={(e) =>
                                Number(e.target.value) !== line.raw_quantity &&
                                patch(line, {
                                  productId: line.selected_product_id,
                                  quantity: Number(e.target.value),
                                  inputUnit:
                                    line.raw_unit || line.product?.unit || "",
                                })
                              }
                            />
                            <button
                              onClick={() =>
                                line.selected
                                  ? patch(line, { selected: false })
                                  : patch(line, {
                                      productId: line.selected_product_id,
                                      quantity: line.raw_quantity,
                                      inputUnit:
                                        line.raw_unit ||
                                        line.product?.unit ||
                                        "",
                                      selected: true,
                                    })
                              }
                              className="text-xs underline text-slate-500"
                            >
                              {line.selected ? "Bỏ dòng" : "Chọn lại"}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
          {busy && (
            <p className="text-sm text-emerald-700 font-semibold flex justify-center gap-2">
              <Loader2 size={17} className="animate-spin" />
              Đang xử lý tài liệu...
            </p>
          )}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm">
              {error}
            </div>
          )}
        </div>
        {!!lines.length && (
          <footer className="bg-white border-t px-5 py-4 flex justify-between items-center">
            <span className="text-xs text-slate-500">
              Dòng đỏ phải sửa hoặc bỏ chọn.
            </span>
            <button
              onClick={confirm}
              disabled={busy || !counts.ok}
              className="px-5 py-2.5 bg-emerald-600 text-white rounded-xl font-bold disabled:opacity-50"
            >
              Thêm {counts.ok} dòng vào đơn
            </button>
          </footer>
        )}
      </div>
      {pickerLine && (
        <div className="fixed inset-0 z-[120] bg-black/45 p-4 flex items-center justify-center">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-3"><div><h3 className="font-bold text-slate-900">Chọn sản phẩm</h3><p className="text-xs text-slate-500">Dòng đọc được: {pickerLine.raw_name}</p></div><button onClick={() => setPickerLine(null)} className="p-2 rounded-lg hover:bg-slate-100"><X size={18} /></button></div>
            <div className="flex gap-2"><input autoFocus value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} onKeyDown={(e) => e.key === "Enter" && searchProducts()} placeholder="Nhập tên sản phẩm..." className="flex-1 border rounded-xl px-3 py-2 text-sm" /><button onClick={searchProducts} disabled={searching} className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold text-sm flex items-center gap-2">{searching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />} Tìm</button></div>
            <div className="max-h-72 overflow-y-auto divide-y border rounded-xl">{searchResults.map((product) => <button key={product.id} onClick={() => chooseProduct(product)} className="w-full text-left px-3 py-2.5 hover:bg-emerald-50"><p className="font-semibold text-sm">{product.name}</p><p className="text-xs text-slate-500">Mã: {product.sku} · {product.unit}</p></button>)}{!searching && searchResults.length === 0 && <p className="p-4 text-sm text-center text-slate-500">Nhập tên rồi bấm Tìm để chọn đúng sản phẩm.</p>}</div>
          </div>
        </div>
      )}
    </div>
  );
}
function Stat({
  n,
  text,
  cls,
}: {
  n: number;
  text: string;
  cls: "green" | "amber" | "red";
}) {
  const c =
    cls === "green"
      ? "bg-green-50 text-green-700 border-green-200"
      : cls === "amber"
        ? "bg-amber-50 text-amber-700 border-amber-200"
        : "bg-red-50 text-red-700 border-red-200";
  return (
    <div className={`border rounded-xl p-3 text-center ${c}`}>
      <b className="text-xl">{n}</b>
      <p className="text-[11px] font-semibold">{text}</p>
    </div>
  );
}
