// Apply reviewed food terms after regenerating the translated catalog JSON.
// Keep the original Vietnamese name and SKU in the UI for product identification.
import { readFile, writeFile } from 'node:fs/promises';

const corrections = {
  'zh-CN': {
    'Ba chỉ bò cuộn': '卷牛五花肉',
    'Ba khía': '越南三线蟹（Ba khía）',
    'Ba Rọi Bò Mỹ': '美国牛五花肉',
    'Ba Rọi Bò Mỹ 475gr': '美国牛五花肉 475 克',
    'Ba rọi có xương đl lẻ': '零售冷冻带骨五花肉',
    'Ba rọi dạt sườn đông lạnh lẻ': '零售冷冻肋排边五花肉',
    'Ba rọi đl rút sườn lẻ': '零售冷冻去肋骨五花肉',
    'Mắm ba khía': '腌制越南三线蟹（Ba khía）',
    'Bạc hà': '芋茎（Bạc hà）',
    'Bạc má đông lạnh loại 2': '冷冻二级鲹鱼（Bạc má）',
    'Bánh mì ngọt': '甜面包',
    'Bánh ngọt gia hân': 'Gia Hân 甜点',
    'Bánh Phở (AS)': '河粉（AS）',
    'Bánh phở khô': '干河粉',
    'Bánh phú sĩ': '富士蛋糕（Bánh phú sĩ）',
    'Bánh pía sầu riêng': '榴莲饼（Bánh pía）',
    'Bánh pía tươi': '现做朥饼（Bánh pía）',
    'Cá basa file đông lạnh': '冷冻巴沙鱼片',
    'Cá Basa file tươi *': '新鲜巴沙鱼片 *',
    'Cá Basa file tươi không da': '去皮鲜巴沙鱼片',
    'Cải ngọt': '菜心',
    'Cải thìa': '小白菜',
    'Chén meca nhỏ ăn chè': '小号塑料甜品碗',
    'Hạt giống rau muống': '空心菜种子',
    'Mầm rau muống': '空心菜芽',
    'Rau muống': '空心菜',
    'Rau muống bào': '刨丝空心菜',
    'Rau muống cắt gốc': '去根空心菜',
    'Rau muống cây ngắn': '短梗空心菜',
    'Rau muống cọng không lá': '去叶空心菜梗',
    'Rau muống đẹp': '优质空心菜',
    'Rau muống hạt': '空心菜种子',
    'Rau muống ngọn nhỏ': '空心菜嫩梢',
    'Rau muống ngọn nhỏ làm sạch': '洗净空心菜嫩梢',
  },
  en: {
    'Ba khía': 'Vietnamese three-striped crab (Ba khía)',
    'Bạc hà': 'Taro stem (Bạc hà)',
    'Bạc má đông lạnh loại 2': 'Frozen grade 2 scad (Bạc má)',
    'Mắm ba khía': 'Fermented Vietnamese three-striped crab',
    'Cá basa file đông lạnh': 'Frozen basa fillet',
    'Cá Basa file tươi *': 'Fresh basa fillet *',
    'Cá Basa file tươi không da': 'Fresh skinless basa fillet',
    'Cải ngọt': 'Choy sum',
    'Cải thìa': 'Bok choy',
    'Chén meca nhỏ ăn chè': 'Small plastic dessert bowl',
    'Rau muống': 'Water spinach',
  },
};

for (const [language, overrides] of Object.entries(corrections)) {
  const path = new URL(`../public/catalog-names-${language}.json`, import.meta.url);
  const names = JSON.parse(await readFile(path, 'utf8'));
  for (const [original, translated] of Object.entries(overrides)) {
    if (!(original in names)) throw new Error(`Missing catalog entry: ${original}`);
    names[original] = translated;
  }
  await writeFile(path, JSON.stringify(names), 'utf8');
  console.log(`${language}: ${Object.keys(names).length} names, ${Object.keys(overrides).length} reviewed corrections`);
}
