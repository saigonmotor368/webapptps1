const fs = require('fs');
const path = require('path');

const filesToFix = {
  'src/pages/CustomersPage.tsx': (content) => {
     return content.replace(/<input[\s\S]*?className="/, "<input type=\"text\" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder=\"Tìm theo tên, SÐT...\" className=\"");
  },
  'src/pages/OrdersPage.tsx': (content) => {
     return content.replace(/<input[\s\S]*?className="/, "<input type=\"text\" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder=\"Tìm theo mã, tên, SÐT...\" className=\"");
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
