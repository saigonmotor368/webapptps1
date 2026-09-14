const fs = require('fs');
const path = require('path');

const filesToFix = {
  'src/pages/CustomersPage.tsx': (content) => {
     if (!content.includes('import { useState')) content = "import { useState, useEffect } from 'react';\n" + content;
     return content.replace(/const { data: customers, error } =/g, 'const { data: customers } =').replace(/\(customer\) =>/g, '(customer: any) =>');
  },
  'src/pages/DashboardPage.tsx': (content) => {
     if (!content.includes('import { useState')) content = "import { useState, useEffect } from 'react';\n" + content;
     return content.replace(/, ArrowUpRight/g, '');
  },
  'src/pages/OrdersPage.tsx': (content) => {
     if (!content.includes('import { useState')) content = "import { useState, useEffect } from 'react';\n" + content;
     return content.replace(/const { data: orders, error } =/g, 'const { data: orders } =').replace(/\(order\) =>/g, '(order: any) =>');
  },
  'src/pages/SoanHangPage.tsx': (content) => {
     if (!content.includes('import { useState')) content = "import { useState, useEffect } from 'react';\n" + content;
     return content.replace(/const { data: quotes, error } =/g, 'const { data: quotes } =').replace(/\(item, idx\)/g, '(item: any, idx: number)');
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
