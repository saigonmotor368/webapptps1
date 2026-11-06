import { Search, X } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';

export default function ProductSearchBar({ value, onChange, onSubmit, inputRef }: {
  value: string; onChange: (value: string) => void; onSubmit: () => void; inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const { t } = useLanguage();
  return <form className="w-full" onSubmit={event => { event.preventDefault(); onSubmit(); }}>
    <label className="mb-2 block text-sm font-bold text-[#18382b]">{t('Tìm sản phẩm')}</label>
    <div className="flex gap-2">
      <div className="relative min-w-0 flex-1">
        <Search size={19} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#718579]" />
        <input ref={inputRef} value={value} onChange={event => onChange(event.target.value)}
          placeholder={t('Tìm theo tên tiếng Việt, tiếng Trung, tiếng Anh hoặc SKU')}
          className="h-12 w-full rounded-xl border border-[#d6e2d9] bg-[#f8faf7] pl-11 pr-10 text-sm text-[#17231d] outline-none placeholder:text-[#83948a] focus:border-[#0f7a4f] focus:bg-white focus:ring-2 focus:ring-[#0f7a4f]/15" />
        {value && <button type="button" onClick={() => onChange('')} aria-label={t('Xóa tìm kiếm')} className="absolute right-1 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-lg text-[#708579]"><X size={17}/></button>}
      </div>
      <button type="submit" className="flex h-12 shrink-0 items-center gap-2 rounded-xl bg-[#0f7a4f] px-4 text-sm font-bold text-white"><Search size={17}/><span>{t('Tìm')}</span></button>
    </div>
  </form>;
}
