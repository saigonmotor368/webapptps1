const fs = require('fs');
const path = require('path');

const filesToFix = {
  'src/pages/CustomersPage.tsx': (content) => {
     return content.replace("onChange={(e) => setSearchTerm(e.target.value)}", "onChange={(e) => setSearchTerm(e.target.value)}");
  },
  'src/pages/OrdersPage.tsx': (content) => {
     return content.replace("import { Search, Eye, Filter, Printer } from 'lucide-react';", "import { Search, Eye, Printer } from 'lucide-react';");
  },
  'src/pages/SoanHangPage.tsx': (content) => {
     return content.replace(/const { data: quotes, error } =/g, 'const { data: quotes } =');
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
