import { useState, useEffect, useCallback, useId } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  FileSpreadsheet, Upload, CheckCircle2, AlertCircle,
  Eye, Save, RefreshCw, Layers,
  Download, Filter, ChevronLeft, ChevronRight
} from 'lucide-react';

function money(v: number) {
  return new Intl.NumberFormat('vi-VN').format(Math.round(Number(v) || 0)) + 'đ';
}

export default function PriceBooksPage() {
  const fileInputId = useId();
  const { token } = useAuth();
  const apiBase = import.meta.env.VITE_API_BASE_URL || '';

  // Tab: 'list' | 'import'
  const [activeTab, setActiveTab] = useState<'list' | 'import'>('import');

  // List of price books
  const [priceBooks, setPriceBooks] = useState<any[]>([]);
  const [loadingList, setLoadingList] = useState(false);

  // Import Wizard Steps: 1 (Upload) | 2 (Mapping) | 3 (Preview) | 4 (Done)
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // File state
  const [file, setFile] = useState<File | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const [inspection, setInspection] = useState<any>(null);
  const [detectedMappings, setDetectedMappings] = useState<Record<string, any>>({});
  const [selectedSheet, setSelectedSheet] = useState<string>('');

  // Mapping state
  const [mappingConfig, setMappingConfig] = useState<any>(null);
  const [allowZeroPrice, setAllowZeroPrice] = useState(false);

  // Preview state
  const [previewing, setPreviewing] = useState(false);
  const [previewData, setPreviewData] = useState<any>(null);
  const [previewPage, setPreviewPage] = useState(1);
  const [previewFilter, setPreviewFilter] = useState<'all' | 'valid' | 'errors' | 'zero'>('all');

  // Commit state
  const [committing, setCommitting] = useState(false);
  const [commitResult, setCommitResult] = useState<any>(null);
  const [validOnly, setValidOnly] = useState(true);

  // Activation state
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Load existing price books
  const fetchPriceBooks = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await fetch(`${apiBase}/api/admin/price-books`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.ok) {
        setPriceBooks(data.data || []);
      }
    } catch {
      // Fallback: list will be fetched when API is mounted
    } finally {
      setLoadingList(false);
    }
  }, [apiBase, token]);

  useEffect(() => {
    if (activeTab === 'list') {
      fetchPriceBooks();
    }
  }, [activeTab, fetchPriceBooks]);

  // Step 1: Upload & Inspect
  const handleFileSelected = async (selectedFile: File) => {
    setFile(selectedFile);
    setInspecting(true);
    setMessage(null);

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const res = await fetch(`${apiBase}/api/admin/price-books/import/inspect`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Không thể đọc file Excel');
      }

      setInspection(data.inspection);
      setDetectedMappings(data.detectedMappings || {});
      const firstSheet = data.inspection.sheets[0]?.name || '';
      setSelectedSheet(firstSheet);
      setMappingConfig(data.detectedMappings[firstSheet] || null);
      setStep(2);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setInspecting(false);
    }
  };

  // Change sheet
  const handleSheetChange = (sheetName: string) => {
    setSelectedSheet(sheetName);
    setMappingConfig(detectedMappings[sheetName] || null);
  };

  // Step 2 -> 3: Generate Preview
  const handleRunPreview = async (page: number = 1) => {
    if (!file || !selectedSheet) return;
    setPreviewing(true);
    setMessage(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('sheetName', selectedSheet);
    formData.append('mappingConfig', JSON.stringify(mappingConfig));
    formData.append('page', String(page));
    formData.append('pageSize', '50');
    formData.append('allowZeroPrice', String(allowZeroPrice));

    try {
      const res = await fetch(`${apiBase}/api/admin/price-books/import/preview`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Lỗi kiểm tra bảng giá');
      }

      setPreviewData(data.preview);
      setPreviewPage(page);
      setStep(3);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setPreviewing(false);
    }
  };

  // Step 3 -> 4: Commit to Draft
  const handleCommit = async () => {
    if (!file || !selectedSheet || !mappingConfig) return;
    setCommitting(true);
    setMessage(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('sheetName', selectedSheet);
    formData.append('mappingConfig', JSON.stringify(mappingConfig));
    formData.append('validOnly', String(validOnly));
    formData.append('allowZeroPrice', String(allowZeroPrice));

    try {
      const res = await fetch(`${apiBase}/api/admin/price-books/import/commit`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Lỗi lưu bảng giá vào hệ thống');
      }

      setCommitResult(data);
      setStep(4);
      setMessage({ type: 'success', text: data.message });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setCommitting(false);
    }
  };

  // Activate Price Book
  const handleActivate = async (priceBookId: string) => {
    if (!confirm('Bạn có chắc chắn muốn KÍCH HOẠT bảng giá này thành ACTIVE? Các bảng giá cũ cùng mã sẽ được chuyển thành ARCHIVED.')) {
      return;
    }

    setActivatingId(priceBookId);
    setMessage(null);

    try {
      const res = await fetch(`${apiBase}/api/admin/price-books/activate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ priceBookId }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Lỗi kích hoạt bảng giá');
      }

      setMessage({ type: 'success', text: data.message });
      if (activeTab === 'list') {
        fetchPriceBooks();
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setActivatingId(null);
    }
  };

  // Download error report JSON
  const handleDownloadErrors = () => {
    if (!previewData || !previewData.rows) return;
    const errorRows = previewData.rows.filter((r: any) => !r.isValid);
    const blob = new Blob([JSON.stringify(errorRows, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tps1_import_errors_${selectedSheet}_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Filter preview rows
  const filteredRows = (previewData?.rows || []).filter((r: any) => {
    if (previewFilter === 'valid') return r.isValid;
    if (previewFilter === 'errors') return !r.isValid && r.matchResult.status !== 'skipped_category';
    if (previewFilter === 'zero') {
      return Object.values(r.prices || {}).some((p: any) => p.status === 'zero_price');
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 bg-emerald-100 text-emerald-800 rounded-xl">
              <FileSpreadsheet size={24} />
            </span>
            <h1 className="text-2xl font-black text-slate-800 tracking-tight">Quản Lý & Nhập Bảng Giá (G2)</h1>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Hỗ trợ template KiotViet chuẩn và bảng giá đa tầng nhiều bếp. Tuyệt đối an toàn, preview trước khi lưu.
          </p>
        </div>

        <div className="flex items-center gap-2 bg-slate-100 p-1.5 rounded-xl self-start">
          <button
            onClick={() => setActiveTab('import')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
              activeTab === 'import' ? 'bg-white text-emerald-800 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Nhập Excel Mới
          </button>
          <button
            onClick={() => setActiveTab('list')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
              activeTab === 'list' ? 'bg-white text-emerald-800 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Danh Sách Bảng Giá
          </button>
        </div>
      </div>

      {/* Global Alerts */}
      {message && (
        <div
          className={`p-4 rounded-xl flex items-center gap-3 text-sm font-semibold border ${
            message.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}
        >
          {message.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
          <span>{message.text}</span>
        </div>
      )}

      {/* ==================== TAB 1: IMPORT WIZARD ==================== */}
      {activeTab === 'import' && (
        <div className="space-y-6">
          {/* Stepper Bar */}
          <div className="grid grid-cols-4 gap-2 bg-white p-3 rounded-2xl shadow-sm border border-slate-100 text-xs font-bold">
            <div className={`flex items-center gap-2 p-2 rounded-xl ${step >= 1 ? 'bg-emerald-50 text-emerald-800' : 'text-slate-400'}`}>
              <span className={`w-6 h-6 rounded-full flex items-center justify-center ${step >= 1 ? 'bg-emerald-600 text-white' : 'bg-slate-200'}`}>1</span>
              <span>1. Tải File & Kiểm Tra</span>
            </div>
            <div className={`flex items-center gap-2 p-2 rounded-xl ${step >= 2 ? 'bg-emerald-50 text-emerald-800' : 'text-slate-400'}`}>
              <span className={`w-6 h-6 rounded-full flex items-center justify-center ${step >= 2 ? 'bg-emerald-600 text-white' : 'bg-slate-200'}`}>2</span>
              <span>2. Cấu Hình Mapping</span>
            </div>
            <div className={`flex items-center gap-2 p-2 rounded-xl ${step >= 3 ? 'bg-emerald-50 text-emerald-800' : 'text-slate-400'}`}>
              <span className={`w-6 h-6 rounded-full flex items-center justify-center ${step >= 3 ? 'bg-emerald-600 text-white' : 'bg-slate-200'}`}>3</span>
              <span>3. Preview & Rà Soát</span>
            </div>
            <div className={`flex items-center gap-2 p-2 rounded-xl ${step >= 4 ? 'bg-emerald-50 text-emerald-800' : 'text-slate-400'}`}>
              <span className={`w-6 h-6 rounded-full flex items-center justify-center ${step >= 4 ? 'bg-emerald-600 text-white' : 'bg-slate-200'}`}>4</span>
              <span>4. Hoàn Tất (DRAFT)</span>
            </div>
          </div>

          {/* STEP 1: UPLOAD */}
          {step === 1 && (
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 text-center">
              <div className="max-w-xl mx-auto space-y-4">
                <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
                  <Upload size={32} />
                </div>
                <h3 className="text-xl font-bold text-slate-800">Tải Lên Bảng Giá Excel</h3>
                <p className="text-sm text-slate-500">
                  Hệ thống hỗ trợ cả định dạng chuẩn đơn giản (MauFileBangGia) và bảng giá phức tạp nhiều bếp (BẢNG TÍNH GIÁ CÁC BẾP TP 09.26).
                </p>

                <div className="border-2 border-dashed border-slate-200 rounded-2xl p-8 hover:border-emerald-500 transition-colors bg-slate-50">
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    id={fileInputId}
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        handleFileSelected(e.target.files[0]);
                      }
                    }}
                  />
                  <label htmlFor={fileInputId} className="cursor-pointer block space-y-2">
                    <span className="inline-block px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl shadow-md transition-all">
                      Chọn File Từ Máy Tính
                    </span>
                    <p className="text-xs text-slate-400">Chấp nhận định dạng .xlsx, .xls (Tối đa 15MB)</p>
                  </label>
                </div>

                {inspecting && (
                  <div className="flex items-center justify-center gap-2 text-sm text-emerald-700 font-semibold pt-4">
                    <RefreshCw className="animate-spin" size={18} />
                    <span>Đang đọc cấu trúc các Sheet và tính Checksum...</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 2: MAPPING */}
          {step === 2 && inspection && (
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-3">
                <div>
                  <h3 className="text-lg font-bold text-slate-800">Cấu Hình Nhận Diện Bảng Giá</h3>
                  <p className="text-xs text-slate-500">
                    File: <span className="font-semibold text-slate-700">{inspection.fileName}</span> ({(inspection.fileSize / 1024).toFixed(1)} KB) — Checksum: <code className="text-emerald-700 font-mono text-[11px]">{inspection.checksum.slice(0, 16)}...</code>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setStep(1)}
                    className="px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
                  >
                    Chọn file khác
                  </button>
                  <button
                    onClick={() => handleRunPreview(1)}
                    disabled={previewing}
                    className="flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl shadow-md transition-all disabled:opacity-50"
                  >
                    {previewing ? <RefreshCw className="animate-spin" size={16} /> : <Eye size={16} />}
                    <span>Chạy Kiểm Tra & Xem Preview</span>
                  </button>
                </div>
              </div>

              {/* Sheet selector */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Chọn Sheet Cần Nhập:</label>
                <div className="flex flex-wrap gap-2">
                  {inspection.sheets.map((s: any) => (
                    <button
                      key={s.name}
                      onClick={() => handleSheetChange(s.name)}
                      className={`px-4 py-2 rounded-xl text-sm font-bold border transition-all ${
                        selectedSheet === s.name
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {s.name} ({s.rowCount} dòng)
                    </button>
                  ))}
                </div>
              </div>

              {/* Detected Price Books */}
              {mappingConfig && (
                <div className="space-y-4 pt-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-extrabold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                      <Layers size={16} className="text-emerald-600" />
                      <span>Các Bảng Giá / Bếp Được Nhận Diện ({mappingConfig.priceBooks?.length || 0}):</span>
                    </h4>
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={allowZeroPrice}
                        onChange={(e) => setAllowZeroPrice(e.target.checked)}
                        className="rounded text-emerald-600 focus:ring-emerald-500"
                      />
                      <span>Chấp nhận giá 0đ có chủ ý</span>
                    </label>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {(mappingConfig.priceBooks || []).map((pb: any, idx: number) => (
                      <div key={idx} className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 space-y-1.5 text-xs">
                        <div className="flex items-center justify-between font-bold text-slate-800">
                          <span className="truncate pr-2">{pb.name}</span>
                          <span className="px-2 py-0.5 bg-slate-200 text-slate-700 rounded text-[10px] uppercase font-mono">
                            {pb.kind}
                          </span>
                        </div>
                        <div className="text-slate-500 font-mono text-[11px]">Mã: {pb.code}</div>
                        <div className="flex items-center justify-between text-slate-600 pt-1 border-t border-slate-200/60">
                          <span>Cột Giá: <b>Cột {pb.priceColIndex + 1}</b></span>
                          {pb.discountColIndex !== undefined && (
                            <span>Cột CK: <b>Cột {pb.discountColIndex + 1}</b></span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 3: PREVIEW & STATS */}
          {step === 3 && previewData && (
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 space-y-6">
              {/* Header & Stats Badges */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-3">
                <div>
                  <h3 className="text-lg font-bold text-slate-800">Kết Quả Kiểm Tra Preview ({selectedSheet})</h3>
                  <p className="text-xs text-slate-500">
                    Rà soát kỹ trước khi lưu vào hệ thống. Các dòng lỗi sẽ không làm hỏng dữ liệu bảng giá hiện tại.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 cursor-pointer mr-2">
                    <input
                      type="checkbox"
                      checked={validOnly}
                      onChange={(e) => setValidOnly(e.target.checked)}
                      className="rounded text-emerald-600 focus:ring-emerald-500"
                    />
                    <span>Chỉ lưu dòng hợp lệ</span>
                  </label>
                  <button
                    onClick={handleDownloadErrors}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all"
                  >
                    <Download size={14} />
                    <span>Tải File Lỗi</span>
                  </button>
                  <button
                    onClick={() => setStep(2)}
                    className="px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                  >
                    Sửa Mapping
                  </button>
                  <button
                    onClick={handleCommit}
                    disabled={committing}
                    className="flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl shadow-md transition-all disabled:opacity-50"
                  >
                    {committing ? <RefreshCw className="animate-spin" size={16} /> : <Save size={16} />}
                    <span>Lưu Vào Hệ Thống (DRAFT)</span>
                  </button>
                </div>
              </div>

              {/* Badges Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-center">
                  <div className="text-xl font-black text-slate-800">{previewData.stats.totalRows}</div>
                  <div className="text-[11px] font-bold text-slate-500 uppercase mt-0.5">Tổng dòng</div>
                </div>
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-100 text-center">
                  <div className="text-xl font-black text-emerald-700">{previewData.stats.validRows}</div>
                  <div className="text-[11px] font-bold text-emerald-600 uppercase mt-0.5">Hợp lệ</div>
                </div>
                <div className="p-3 bg-rose-50 rounded-xl border border-rose-100 text-center">
                  <div className="text-xl font-black text-rose-700">{previewData.stats.unmatchedRows}</div>
                  <div className="text-[11px] font-bold text-rose-600 uppercase mt-0.5">Chưa khớp</div>
                </div>
                <div className="p-3 bg-amber-50 rounded-xl border border-amber-100 text-center">
                  <div className="text-xl font-black text-amber-700">{previewData.stats.ambiguousRows}</div>
                  <div className="text-[11px] font-bold text-amber-600 uppercase mt-0.5">Trùng tên</div>
                </div>
                <div className="p-3 bg-indigo-50 rounded-xl border border-indigo-100 text-center">
                  <div className="text-xl font-black text-indigo-700">{previewData.stats.zeroPriceRows}</div>
                  <div className="text-[11px] font-bold text-indigo-600 uppercase mt-0.5">Giá 0đ</div>
                </div>
                <div className="p-3 bg-purple-50 rounded-xl border border-purple-100 text-center">
                  <div className="text-xl font-black text-purple-700">{previewData.stats.blankPriceRows}</div>
                  <div className="text-[11px] font-bold text-purple-600 uppercase mt-0.5">Thiếu giá</div>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-center">
                  <div className="text-xl font-black text-slate-600">{previewData.stats.skippedCategoryRows}</div>
                  <div className="text-[11px] font-bold text-slate-400 uppercase mt-0.5">Bỏ qua</div>
                </div>
              </div>

              {/* Filter tabs */}
              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-500 flex items-center gap-1">
                    <Filter size={14} /> Lọc:
                  </span>
                  {(['all', 'valid', 'errors', 'zero'] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setPreviewFilter(mode)}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                        previewFilter === mode ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {mode === 'all' && 'Tất cả'}
                      {mode === 'valid' && 'Hợp lệ'}
                      {mode === 'errors' && 'Lỗi / Cần sửa'}
                      {mode === 'zero' && 'Có giá 0đ'}
                    </button>
                  ))}
                </div>

                <div className="text-xs text-slate-500">
                  Hiển thị trang <b>{previewPage}</b> / {previewData.pagination.totalPages} ({filteredRows.length} dòng)
                </div>
              </div>

              {/* Preview Table */}
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 text-slate-600 font-extrabold border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3 w-14">Dòng</th>
                      <th className="py-2.5 px-3">Mã Nguồn</th>
                      <th className="py-2.5 px-3">Tên Nguồn</th>
                      <th className="py-2.5 px-3">ĐVT</th>
                      <th className="py-2.5 px-3">Khớp Hệ Thống</th>
                      <th className="py-2.5 px-3">Trạng Thái</th>
                      <th className="py-2.5 px-3 text-right">Giá Mẫu</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredRows.map((r: any, idx: number) => {
                      const firstPrice = Object.values(r.prices || {})[0] as any;
                      return (
                        <tr key={idx} className={r.isValid ? 'hover:bg-emerald-50/40' : 'bg-rose-50/20 hover:bg-rose-50/50'}>
                          <td className="py-2.5 px-3 text-slate-400 font-mono">{r.rowIndex}</td>
                          <td className="py-2.5 px-3 font-mono font-semibold text-slate-800">{r.rawSku || '—'}</td>
                          <td className="py-2.5 px-3 font-medium text-slate-800">{r.rawName}</td>
                          <td className="py-2.5 px-3 text-slate-600">{r.rawUnit || '—'}</td>
                          <td className="py-2.5 px-3">
                            {r.matchResult.product ? (
                              <span className="text-emerald-700 font-medium">
                                [{r.matchResult.product.sku}] {r.matchResult.product.name}
                              </span>
                            ) : (
                              <span className="text-slate-400 italic">Chưa khớp</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3">
                            {r.matchResult.status === 'exact_sku' && (
                              <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">Khớp SKU</span>
                            )}
                            {r.matchResult.status === 'exact_name_unit' && (
                              <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 text-[10px] font-bold">Khớp Tên+ĐVT</span>
                            )}
                            {r.matchResult.status === 'unmatched' && (
                              <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-800 text-[10px] font-bold">Không tìm thấy</span>
                            )}
                            {r.matchResult.status === 'ambiguous' && (
                              <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-bold">Trùng lặp</span>
                            )}
                            {r.matchResult.status === 'skipped_category' && (
                              <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-bold">Danh mục</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-800">
                            {firstPrice?.finalPrice != null ? money(firstPrice.finalPrice) : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination controls */}
              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={() => handleRunPreview(Math.max(1, previewPage - 1))}
                  disabled={previewPage <= 1 || previewing}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                >
                  <ChevronLeft size={16} /> Trang trước
                </button>
                <span className="text-xs font-semibold text-slate-600">Trang {previewPage}</span>
                <button
                  onClick={() => handleRunPreview(previewPage + 1)}
                  disabled={previewPage >= previewData.pagination.totalPages || previewing}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                >
                  Trang sau <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: DONE & ACTIVATE */}
          {step === 4 && commitResult && (
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 text-center space-y-6">
              <div className="w-16 h-16 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto shadow-inner">
                <CheckCircle2 size={36} />
              </div>
              <div className="max-w-md mx-auto space-y-2">
                <h3 className="text-2xl font-black text-slate-800">Lưu Bảng Giá Thành Công!</h3>
                <p className="text-sm text-slate-600">
                  Dữ liệu đã được lưu trữ an toàn ở trạng thái <b>DRAFT</b>. Bảng giá cũ của khách hàng vẫn đang hoạt động bình thường, không bị gián đoạn.
                </p>
                <div className="p-3 bg-slate-50 rounded-xl text-xs font-mono text-slate-600 text-left space-y-1">
                  <div>Job ID: {commitResult.jobId}</div>
                  <div>Số bảng giá tạo mới: {commitResult.priceBookIds?.length}</div>
                  <div>Trạng thái: <span className="font-bold text-amber-700 uppercase">DRAFT</span></div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-3 pt-4">
                <button
                  onClick={() => {
                    setStep(1);
                    setFile(null);
                    setPreviewData(null);
                  }}
                  className="px-5 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-700 hover:bg-slate-50"
                >
                  Nhập file khác
                </button>
                <button
                  onClick={() => setActiveTab('list')}
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl shadow-md transition-all flex items-center gap-2"
                >
                  <Eye size={18} />
                  <span>Xem Danh Sách & Phê Duyệt Kích Hoạt</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ==================== TAB 2: PRICE BOOKS LIST ==================== */}
      {activeTab === 'list' && (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <h3 className="text-lg font-bold text-slate-800">Danh Sách Bảng Giá Trong Hệ Thống</h3>
            <button
              onClick={fetchPriceBooks}
              disabled={loadingList}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50"
            >
              <RefreshCw className={loadingList ? 'animate-spin' : ''} size={14} />
              <span>Làm mới</span>
            </button>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 text-slate-600 font-extrabold border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Mã Bảng Giá</th>
                  <th className="py-3 px-4">Tên Bảng Giá</th>
                  <th className="py-3 px-4">Loại</th>
                  <th className="py-3 px-4">Phiên Bản</th>
                  <th className="py-3 px-4">Trạng Thái</th>
                  <th className="py-3 px-4">Hiệu Lực</th>
                  <th className="py-3 px-4 text-right">Thao Tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {priceBooks.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400 italic">
                      {loadingList ? 'Đang tải danh sách bảng giá...' : 'Chưa có bảng giá nào trong hệ thống.'}
                    </td>
                  </tr>
                ) : (
                  priceBooks.map((pb) => (
                    <tr key={pb.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-mono font-bold text-slate-800">{pb.code}</td>
                      <td className="py-3 px-4 font-semibold text-slate-800">{pb.name}</td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-bold uppercase font-mono">
                          {pb.kind}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono">v{pb.version}</td>
                      <td className="py-3 px-4">
                        {pb.status === 'active' && (
                          <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold uppercase flex items-center gap-1 w-fit">
                            <CheckCircle2 size={12} /> Active
                          </span>
                        )}
                        {pb.status === 'draft' && (
                          <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-bold uppercase w-fit block">
                            Draft
                          </span>
                        )}
                        {pb.status === 'expired' && (
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-500 text-[10px] font-bold uppercase w-fit block">
                            Hết hạn
                          </span>
                        )}
                        {pb.status === 'archived' && (
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-400 text-[10px] font-bold uppercase w-fit block">
                            Archived
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-500">
                        {pb.valid_from ? new Date(pb.valid_from).toLocaleDateString('vi-VN') : '—'}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {pb.status === 'draft' && (
                          <button
                            onClick={() => handleActivate(pb.id)}
                            disabled={activatingId === pb.id}
                            className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold rounded-lg shadow-sm transition-all disabled:opacity-50"
                          >
                            {activatingId === pb.id ? 'Đang kích hoạt...' : 'Kích hoạt'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
