import { useEffect, useState } from 'react';
import { Plus, Minus, Heart, MessageSquarePlus, Check } from 'lucide-react';
import type { Product } from '../../lib/api';
import ProductThumbnail from './ProductThumbnail';
import { useLanguage } from '../../contexts/LanguageContext';

function money(v: number) {
  return new Intl.NumberFormat('vi-VN').format(Number(v) || 0) + 'đ';
}

interface ProductCardProps {
  product: Product;
  quantityInCart: number;
  itemNote?: string;
  isFavorite: boolean;
  onToggleFavorite: (productId: string) => void;
  onAdd: (product: Product, qty: number) => void;
  onUpdateQty: (productId: string, qty: number) => void;
  onUpdateNote: (productId: string, note: string) => void;
}

export default function ProductCard({
  product,
  quantityInCart,
  itemNote = '',
  isFavorite,
  onToggleFavorite,
  onAdd,
  onUpdateQty,
  onUpdateNote,
}: ProductCardProps) {
  const { t, productName, productUnit } = useLanguage();
  const [showNoteInput, setShowNoteInput] = useState(Boolean(itemNote));
  const [tempNote, setTempNote] = useState(itemNote);
  const [draftQuantity, setDraftQuantity] = useState('1');

  useEffect(() => {
    setTempNote(itemNote);
    if (itemNote) setShowNoteInput(true);
  }, [itemNote]);

  const isInCart = quantityInCart > 0;

  const handleNoteSave = () => {
    onUpdateNote(product.id, tempNote.trim());
  };

  return (
    <div
      className={`relative bg-white rounded-2xl border transition-all duration-200 flex flex-col justify-between overflow-hidden group ${
        isInCart
          ? 'border-[#0f7a4f]/40 shadow-sm shadow-[#0f7a4f]/5 ring-1 ring-[#0f7a4f]/20 bg-gradient-to-b from-white to-[#f5fbf7]'
          : 'border-[#17231d]/10 hover:border-[#0f7a4f]/30 hover:shadow-md'
      }`}
    >
      {/* Phần trên: Ảnh, Thông tin sản phẩm, Nút tim */}
      <div className="p-3 sm:p-3.5 space-y-2">
        <div className="flex items-start gap-3">
          {/* Thumbnail */}
          <ProductThumbnail product={product} size="md" />

          {/* Chi tiết tên, SKU, ĐVT */}
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-1">
              <div className="min-w-0 flex-1">
                {product.sku && (
                  <span className="inline-block text-[10px] font-mono font-bold text-[#59665f] bg-[#17231d]/5 px-1.5 py-0.2 rounded mb-0.5">
                    {product.sku}
                  </span>
                )}
                <h3
                  className="font-bold text-sm text-[#17231d] leading-snug line-clamp-2"
                  title={product.name}
                >
                  {productName(product.name)}
                </h3>
                {productName(product.name) !== product.name && <p className="text-[11px] text-[#59665f] line-clamp-1" title={product.name}>{product.name}</p>}
              </div>

              {/* Nút tim yêu thích */}
              <button
                type="button"
                onClick={() => onToggleFavorite(product.id)}
                className="p-1.5 -mr-1 -mt-1 text-[#59665f]/50 hover:text-rose-500 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                title={isFavorite ? t('Bỏ yêu thích') : t('Thêm vào món yêu thích của bếp')}
                aria-label={`${t(isFavorite ? 'Bỏ yêu thích' : 'Thêm vào món yêu thích của bếp')} ${productName(product.name)}`}
              >
                <Heart
                  size={16}
                  className={isFavorite ? 'fill-rose-500 text-rose-500' : ''}
                />
              </button>
            </div>

            {/* Đơn vị tính & Nhóm */}
            <p className="text-xs text-[#59665f] mt-0.5 font-medium">
              {t('ĐVT:')} <strong className="text-[#17231d]">{productUnit(product.unit || 'Kg')}</strong>
              {product.category && (
                <span className="text-[#59665f]/70 font-normal"> · {productName(product.category)}</span>
              )}
            </p>
          </div>
        </div>

        {/* Giá sản phẩm */}
        <div className="pt-1 flex items-baseline justify-between">
          <div className="text-sm sm:text-base font-extrabold text-[#0f7a4f]">
            {product.priceOnRequest ? (
              <span className="text-[#e0742f] text-xs font-bold">{t('Chờ sale báo giá')}</span>
            ) : (
              money(product.price)
            )}
            <span className="text-[11px] font-normal text-[#59665f] ml-1">
              /{productUnit(product.unit || 'Kg')}
            </span>
          </div>

          {isInCart && (
            <span className="text-[11px] font-bold text-[#0f7a4f] bg-[#0f7a4f]/10 px-2 py-0.5 rounded-full">
              {t('Đã chọn:')} {quantityInCart} {productUnit(product.unit || 'Kg')}
            </span>
          )}
        </div>

        {/* Ô ghi chú quy cách sơ chế nếu đã thêm hoặc mở */}
        {isInCart && (
          <div className="pt-1">
            {!showNoteInput && !itemNote ? (
              <button
                type="button"
                onClick={() => setShowNoteInput(true)}
                className="text-[11px] text-[#59665f] hover:text-[#0f7a4f] flex items-center gap-1 cursor-pointer font-medium"
              >
                <MessageSquarePlus size={13} />
                <span>+ {t('Thêm quy cách / ghi chú sơ chế')}</span>
              </button>
            ) : (
              <div className="flex items-center gap-1.5 mt-1">
                <input
                  type="text"
                  value={tempNote}
                  onChange={(e) => setTempNote(e.target.value)}
                  onBlur={handleNoteSave}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleNoteSave();
                  }}
                  placeholder={t('Vd: Sơ chế sẵn, thái lát mỏng...')}
                  className="flex-1 text-xs py-1 px-2.5 bg-[#f8faf7] border border-[#17231d]/15 rounded-lg focus:outline-none focus:border-[#0f7a4f] focus:bg-white text-[#17231d]"
                />
                {tempNote !== itemNote && (
                  <button
                    type="button"
                    onClick={handleNoteSave}
                    className="p-1 text-[#0f7a4f] bg-[#0f7a4f]/10 rounded hover:bg-[#0f7a4f]/20"
                    title={t('Lưu ghi chú')}
                  >
                    <Check size={14} />
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Phần dưới: Nút Thêm hoặc Bộ Stepper tăng giảm >= 44px */}
      <div className="p-2.5 sm:p-3 pt-0 border-t border-[#17231d]/5 mt-1 bg-white/60">
        {!isInCart ? (
          <div className="flex items-center gap-2">
            <div className="flex h-11 min-w-0 flex-1 items-center rounded-xl border border-[#17231d]/12 bg-[#f8faf7]">
              <button type="button" onClick={() => setDraftQuantity(value => String(Math.max(0.1, (Number(value) || 1) - 1)))} aria-label={t('Giảm số lượng')} className="flex size-10 shrink-0 items-center justify-center text-[#466253]"><Minus size={16}/></button>
              <input type="number" min="0.1" step="any" value={draftQuantity} onChange={e => setDraftQuantity(e.target.value)} aria-label={`Số lượng ${product.name}`} className="w-full min-w-0 bg-transparent text-center text-sm font-bold text-[#17382a] outline-none" />
              <span className="pr-1 text-[11px] text-[#718579]">{productUnit(product.unit || 'Kg')}</span>
              <button type="button" onClick={() => setDraftQuantity(value => String((Number(value) || 0) + 1))} aria-label={t('Tăng số lượng')} className="flex size-10 shrink-0 items-center justify-center text-[#0f7a4f]"><Plus size={16}/></button>
            </div>
            <button type="button" onClick={() => onAdd(product, Math.max(0.1, Number(draftQuantity) || 1))} aria-label={t('Thêm vào đơn')} className="flex h-11 w-12 shrink-0 items-center justify-center rounded-xl bg-[#0f7a4f] text-white shadow-sm"><Plus size={20}/></button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-1.5 bg-[#f5f7f3] p-1 rounded-xl border border-[#17231d]/10">
            {/* Nút giảm */}
            <button
              type="button"
              onClick={() => onUpdateQty(product.id, Math.max(0, Number((quantityInCart - 1).toFixed(2))))}
              className="w-10 h-10 sm:w-9 sm:h-9 rounded-lg bg-white border border-[#17231d]/10 text-[#17231d] hover:bg-rose-50 hover:text-rose-600 active:scale-95 flex items-center justify-center font-bold text-base transition-colors cursor-pointer select-none touch-target"
              aria-label={t('Giảm số lượng')}
            >
              <Minus size={15} strokeWidth={2.5} />
            </button>

            {/* Ô nhập số lượng (cho phép số thập phân như 1.5, 2.25) */}
            <div className="flex-1 flex items-center justify-center">
              <input
                type="number"
                min={0}
                step="any"
                value={quantityInCart}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  onUpdateQty(product.id, isNaN(val) ? 0 : Math.max(0, val));
                }}
                className="w-16 sm:w-20 text-center font-extrabold text-sm sm:text-base text-[#0b4f34] bg-transparent focus:outline-none"
                aria-label={`Số lượng ${product.name}`}
              />
              <span className="text-[11px] font-semibold text-[#59665f] -ml-1">
                {productUnit(product.unit || 'Kg')}
              </span>
            </div>

            {/* Nút tăng */}
            <button
              type="button"
              onClick={() => onUpdateQty(product.id, Number((quantityInCart + 1).toFixed(2)))}
              className="w-10 h-10 sm:w-9 sm:h-9 rounded-lg bg-white border border-[#17231d]/10 text-[#0f7a4f] hover:bg-[#0f7a4f] hover:text-white active:scale-95 flex items-center justify-center font-bold text-base transition-colors cursor-pointer select-none touch-target"
              aria-label={t('Tăng số lượng')}
            >
              <Plus size={15} strokeWidth={2.5} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
