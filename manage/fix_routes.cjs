const fs = require('fs');
const path = require('path');

const filesToFix = {
  'src/pages/DashboardPage.tsx': (content) => {
     return content.replace(/href="\/sale\/orders"/g, 'href="/don-hang"');
  },
  'src/pages/OrdersPage.tsx': (content) => {
     return content.replace(/navigate\('\/orders\/'/g, 'navigate(\'/don-hang/\'');
  }
};

for (const [relPath, fixFn] of Object.entries(filesToFix)) {
  const fullPath = path.join(__dirname, relPath);
  if (fs.existsSync(fullPath)) {
    let content = fs.readFileSync(fullPath, 'utf8');
    content = fixFn(content);
    fs.writeFileSync(fullPath, content);
  }
}
