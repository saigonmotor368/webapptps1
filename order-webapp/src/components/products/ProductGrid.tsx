import { Search } from 'lucide-react';
import type { Product } from '../../lib/api';
import ProductCard from './ProductCard';
import type { OrderItem } from './OrderTabsBar';

interface ProductGridProps {
  products: Product[];
  itemsInCart: OrderItem[];
  favoriteIds: string[];
  onToggleFavorite: (productId: string) => void;
  onAddProduct: (product: Product, qty: number) => void;
  onUpdateQty: (productId: string, qty: number) => void;
  onUpdateNote: (productId: string, note: string) => void;
  searchQuery?: string;
  loading?: boolean;
}

export default function ProductGrid({
  products,
  itemsInCart,
  favoriteIds,
  onToggleFavorite,
  onAddProduct,
  onUpdateQty,
  onUpdateNote,
  searchQuery = '',
  loading = false,
}: ProductGridProps) {
  // Tạo lookup map cho các mặt hàng đã có trong giỏ của tab hiện tại
  const cartMap = new Map<string, { quantity: number; note?: string }>();
  itemsInCart.forEach((item) => {
    cartMap.set(item.product.id, { quantity: item.quantity, note: item.note });
  });

  if (loading && products.length === 0) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3 sm:gap-3.5" aria-label="Đang tải hàng hóa">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="h-48 rounded-2xl border border-[#17231d]/10 bg-white p-4 animate-pulse">
            <div className="flex gap-3">
              <div className="h-16 w-16 rounded-xl bg-[#eaece8]" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-1/3 rounded bg-[#eaece8]" />
                <div className="h-4 w-4/5 rounded bg-[#eaece8]" />
                <div className="h-3 w-1/2 rounded bg-[#eaece8]" />
              </div>
            </div>
            <div className="mt-5 h-10 rounded-xl bg-[#eaece8]" />
          </div>
        ))}
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-[#17231d]/10 p-12 text-center text-[#59665f] space-y-3">
        <div className="w-14 h-14 rounded-2xl bg-[#f5f7f3] flex items-center justify-center mx-auto text-[#59665f]/50">
          <Search size={26} />
        </div>
        <div>
          <p className="font-bold text-base text-[#17231d]">Không tìm thấy mặt hàng phù hợp</p>
          <p className="text-xs text-[#59665f] mt-1 max-w-sm mx-auto">
            {searchQuery
              ? `Không có kết quả nào cho "${searchQuery}". Hãy thử tìm bằng từ khóa đơn giản hơn hoặc mã SKU.`
              : 'Hãy chọn một nhóm hàng hoặc gõ từ khóa tìm kiếm để xem các sản phẩm có sẵn.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3 sm:gap-3.5">
      {products.map((product) => {
        const inCartInfo = cartMap.get(product.id);
        const qty = inCartInfo?.quantity || 0;
        const note = inCartInfo?.note || '';
        const isFav = favoriteIds.includes(product.id);

        return (
          <ProductCard
            key={product.id}
            product={product}
            quantityInCart={qty}
            itemNote={note}
            isFavorite={isFav}
            onToggleFavorite={onToggleFavorite}
            onAdd={onAddProduct}
            onUpdateQty={onUpdateQty}
            onUpdateNote={onUpdateNote}
          />
        );
      })}
    </div>
  );
}
