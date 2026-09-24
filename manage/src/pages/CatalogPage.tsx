import { useState } from 'react';
import { Package, Tags } from 'lucide-react';
import ProductsPage from './ProductsPage';
import PriceBooksPage from './PriceBooksPage';

/** Catalog trung tâm: danh mục hàng hóa và ma trận bảng giá dùng chung một khu vực. */
export default function CatalogPage() {
  const [tab, setTab] = useState<'products' | 'prices'>('products');
  return <div className="space-y-4">
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-2 flex gap-2">
      <button onClick={() => setTab('products')} className={`px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 ${tab === 'products' ? 'bg-green-100 text-green-800' : 'text-slate-500 hover:bg-slate-50'}`}><Package size={17}/> Danh mục hàng hóa</button>
      <button onClick={() => setTab('prices')} className={`px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 ${tab === 'prices' ? 'bg-green-100 text-green-800' : 'text-slate-500 hover:bg-slate-50'}`}><Tags size={17}/> Thiết lập bảng giá</button>
    </div>
    {tab === 'products' ? <ProductsPage /> : <PriceBooksPage />}
  </div>;
}
