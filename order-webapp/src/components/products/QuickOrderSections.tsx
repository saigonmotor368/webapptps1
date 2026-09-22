import { ChefHat, Repeat2, Heart, Sparkles, FolderOpen, Plus } from 'lucide-react';
import type { Product, Order } from '../../lib/api';
import ProductThumbnail from './ProductThumbnail';

function money(v: number) {
  return new Intl.NumberFormat('vi-VN').format(Number(v) || 0) + 'đ';
}

interface QuickOrderSectionsProps {
  latestOrder?: Order;
  loadingLatestOrder: boolean;
  onReorderLatest: () => void;
  frequentProducts: Product[];
  favoriteProducts: Product[];
  favoriteIds: string[];
  onToggleFavorite: (productId: string) => void;
  categories: string[];
  selectedCategory: string;
  onSelectCategory: (category: string) => void;
  categoryProducts: Product[];
  onAddProduct: (product: Product, qty?: number) => void;
}

export default function QuickOrderSections({
  latestOrder,
  loadingLatestOrder,
  onReorderLatest,
  frequentProducts,
  favoriteProducts,
  favoriteIds,
  onToggleFavorite,
  categories,
  selectedCategory,
  onSelectCategory,
  categoryProducts,
  onAddProduct,
}: QuickOrderSectionsProps) {
  const hasAnyQuickSection =
    Boolean(latestOrder) ||
    frequentProducts.length > 0 ||
    favoriteProducts.length > 0 ||
    categories.length > 0;

  if (!hasAnyQuickSection) return null;

  return (
    <section className="bg-white rounded-2xl border border-[#17231d]/10 shadow-sm p-3.5 sm:p-4.5 space-y-3.5">
      {/* Tiêu đề mục & Nút đặt lại đơn gần nhất */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="w-10 h-10 rounded-xl bg-[#0f7a4f]/10 text-[#0f7a4f] flex items-center justify-center shrink-0">
            <ChefHat size={20} />
          </span>
          <div>
            <h2 className="font-bold text-sm sm:text-base text-[#17231d] flex items-center gap-1.5">
              <span>Đặt nhanh cho bếp</span>
              <Sparkles size={14} className="text-[#e0742f]" />
            </h2>
            <p className="text-[11px] sm:text-xs text-[#59665f]">
              Món quen thuộc, thêm vào đơn chỉ bằng một chạm
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onReorderLatest}
          disabled={loadingLatestOrder}
          className="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#0f7a4f] text-white text-xs font-bold hover:bg-[#0b4f34] active:scale-[.97] transition-all disabled:opacity-60 shadow-sm shadow-[#0f7a4f]/20 cursor-pointer touch-target"
        >
          <Repeat2 size={15} className={loadingLatestOrder ? 'animate-spin' : ''} />
          <span className="hidden sm:inline">
            {loadingLatestOrder ? 'Đang nạp đơn...' : 'Đặt lại đơn gần nhất'}
          </span>
          <span className="sm:hidden">
            {loadingLatestOrder ? 'Đang nạp' : 'Đặt lại đơn'}
          </span>
        </button>
      </div>

      {/* 1. Mặt hàng thường mua */}
      {frequentProducts.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#59665f] flex items-center gap-1">
              <span>Hàng thường mua</span>
              <span className="px-1.5 py-0.2 rounded-full bg-[#0f7a4f]/10 text-[#0f7a4f] text-[10px] font-mono">
                {frequentProducts.length}
              </span>
            </p>
          </div>
          <div className="flex gap-2.5 overflow-x-auto no-scrollbar pb-1">
            {frequentProducts.map((product) => {
              const isFavorite = favoriteIds.includes(product.id);
              return (
                <div
                  key={product.id}
                  className="min-w-[210px] max-w-[240px] flex items-center gap-2 p-2 rounded-xl border border-[#17231d]/10 bg-[#f8faf7] hover:border-[#0f7a4f]/30 hover:bg-[#f3f7f4] transition-colors"
                >
                  <button
                    type="button"
                    onClick={() => onAddProduct(product, 1)}
                    className="min-w-0 flex-1 flex items-center gap-2 text-left cursor-pointer group"
                    title={`Thêm ${product.name} vào đơn`}
                  >
                    <ProductThumbnail product={product} size="sm" />
                    <div className="min-w-0 flex-1">
                      <span className="block text-xs font-semibold truncate text-[#17231d] group-hover:text-[#0f7a4f] transition-colors">
                        {product.name}
                      </span>
                      <span className="block text-[11px] text-[#59665f] mt-0.5">
                        {product.unit || 'Kg'} •{' '}
                        <strong className="text-[#0f7a4f]">
                          {product.priceOnRequest ? 'Liên hệ' : money(product.price)}
                        </strong>
                      </span>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggleFavorite(product.id)}
                    className="p-2 rounded-lg text-[#59665f]/60 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                    aria-label={isFavorite ? `Bỏ yêu thích ${product.name}` : `Yêu thích ${product.name}`}
                  >
                    <Heart
                      size={15}
                      className={isFavorite ? 'fill-rose-500 text-rose-500' : ''}
                    />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 2. Sản phẩm yêu thích */}
      {favoriteProducts.length > 0 && (
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#59665f] mb-1.5 flex items-center gap-1.5">
            <Heart size={13} className="fill-rose-500 text-rose-500" />
            <span>Món yêu thích của bếp</span>
            <span className="px-1.5 py-0.2 rounded-full bg-rose-50 text-rose-700 text-[10px] font-mono border border-rose-200">
              {favoriteProducts.length}
            </span>
          </p>
          <div className="flex gap-2.5 overflow-x-auto no-scrollbar pb-1">
            {favoriteProducts.map((product) => (
              <div
                key={product.id}
                className="min-w-[190px] max-w-[230px] flex items-center gap-2 p-2 rounded-xl border border-rose-100 bg-rose-50/40 hover:bg-rose-50/80 transition-colors"
              >
                <button
                  type="button"
                  onClick={() => onAddProduct(product, 1)}
                  className="min-w-0 flex-1 flex items-center gap-2 text-left cursor-pointer group"
                >
                  <ProductThumbnail product={product} size="sm" />
                  <div className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold truncate text-[#17231d] group-hover:text-rose-700">
                      {product.name}
                    </span>
                    <span className="block text-[11px] text-[#0f7a4f] font-bold mt-0.5">
                      {product.priceOnRequest ? 'Liên hệ' : money(product.price)}
                    </span>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => onToggleFavorite(product.id)}
                  className="p-2 rounded-lg text-rose-500 hover:bg-rose-100 transition-colors cursor-pointer"
                  title="Bỏ yêu thích"
                  aria-label={`Bỏ yêu thích ${product.name}`}
                >
                  <Heart size={15} className="fill-rose-500 text-rose-500" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. Danh mục sản phẩm (Category chips) */}
      {categories.length > 0 && (
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#59665f] mb-1.5 flex items-center gap-1">
            <FolderOpen size={13} className="text-[#0f7a4f]" />
            <span>Duyệt theo nhóm hàng</span>
          </p>
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
            <button
              type="button"
              onClick={() => onSelectCategory('')}
              className={`shrink-0 px-3.5 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer touch-target ${
                !selectedCategory
                  ? 'bg-[#0f7a4f] text-white border-[#0f7a4f] shadow-sm shadow-[#0f7a4f]/20'
                  : 'bg-[#f8faf7] text-[#59665f] border-[#17231d]/10 hover:border-[#0f7a4f]/30 hover:text-[#17231d]'
              }`}
            >
              Tất cả nhóm
            </button>
            {categories.map((cat) => {
              const isSelected = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => onSelectCategory(cat)}
                  className={`shrink-0 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer touch-target ${
                    isSelected
                      ? 'bg-[#0f7a4f] text-white border-[#0f7a4f] shadow-sm shadow-[#0f7a4f]/20 font-bold'
                      : 'bg-[#f8faf7] text-[#59665f] border-[#17231d]/10 hover:border-[#0f7a4f]/30 hover:text-[#17231d]'
                  }`}
                >
                  {cat}
                </button>
              );
            })}
          </div>

          {/* Nếu đang lọc theo danh mục, hiển thị một số sản phẩm tiêu biểu của nhóm */}
          {selectedCategory && categoryProducts.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 pt-2">
              {categoryProducts.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => onAddProduct(product, 1)}
                  className="flex items-center gap-2 min-w-0 p-2 rounded-xl border border-[#17231d]/10 bg-[#fbfcfb] hover:border-[#0f7a4f]/35 hover:bg-[#f3f7f4] text-left transition-colors cursor-pointer group"
                >
                  <ProductThumbnail product={product} size="sm" />
                  <div className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold truncate group-hover:text-[#0f7a4f]">
                      {product.name}
                    </span>
                    <span className="block text-[10px] text-[#59665f] mt-0.5">
                      {product.unit || 'Kg'} •{' '}
                      <strong className="text-[#0f7a4f]">
                        {product.priceOnRequest ? 'Liên hệ' : money(product.price)}
                      </strong>
                    </span>
                  </div>
                  <span className="w-7 h-7 rounded-lg bg-[#0f7a4f]/10 text-[#0f7a4f] flex items-center justify-center shrink-0 group-hover:bg-[#0f7a4f] group-hover:text-white transition-colors">
                    <Plus size={14} />
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
