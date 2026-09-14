const fs = require('fs');
const fixes = {
  'src/pages/OrderDetailPage.tsx': (c) => c.replace(', Calendar', '').replace(', Truck', '').replace('  const [tiers, setTiers]', '  const [tiers, setTiers]'),
  'src/pages/OrdersPage.tsx': (c) => c.replace(', XCircle', '').replace('  const [tiers, setTiers] = useState<any[]>([]);', '  const [, setTiers] = useState<any[]>([]);'),
  'src/pages/PosCreatePage.tsx': (c) => c.replace(', Trash2', '')
};
for (const [f, fn] of Object.entries(fixes)) {
  let c = fs.readFileSync(f, 'utf8');
  fs.writeFileSync(f, fn(c));
}
