const fs = require('fs');
const file = 'src/pages/CustomersPage.tsx';
let content = fs.readFileSync(file, 'utf8');

// Add search state
content = content.replace("const [loading, setLoading] = useState(true);", "const [loading, setLoading] = useState(true);\n  const [searchTerm, setSearchTerm] = useState('');");

// Add filtered logic
content = content.replace("return (", "const filteredCustomers = customers.filter(c => \n    (c.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||\n    (c.phone || '').includes(searchTerm)\n  );\n\n  return (");

// Add search input handler
content = content.replace("<input \n              type=\"text\" \n              placeholder=\"Tìm theo tên, SÐT...\" \n              className=\"pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500\"\n            />", "<input \n              type=\"text\"\n              value={searchTerm}\n              onChange={(e) => setSearchTerm(e.target.value)} \n              placeholder=\"Tìm theo tên, SÐT...\" \n              className=\"pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500\"\n            />");

// Update mapping
content = content.replace("customers.map(customer =>", "filteredCustomers.map(customer =>");

fs.writeFileSync(file, content);
console.log('Done');
