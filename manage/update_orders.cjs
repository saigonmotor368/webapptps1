const fs = require('fs');
const file = 'src/pages/OrdersPage.tsx';
let content = fs.readFileSync(file, 'utf8');

// Add useNavigate
content = content.replace("import { Search, Eye, Filter, Printer } from 'lucide-react';", "import { Search, Eye, Filter, Printer } from 'lucide-react';\nimport { useNavigate } from 'react-router-dom';");

// Add state for search and filter
content = content.replace("const [loading, setLoading] = useState(true);", "const [loading, setLoading] = useState(true);\n  const [searchTerm, setSearchTerm] = useState('');\n  const [filterStatus, setFilterStatus] = useState('all');\n  const navigate = useNavigate();");

// Add filteredOrders logic
content = content.replace("const getStatusBadge", "const filteredOrders = orders.filter(order => {\n    const matchesSearch = (order.quote_code || '').toLowerCase().includes(searchTerm.toLowerCase()) || \n                          (order.lead_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||\n                          (order.lead_phone || '').includes(searchTerm);\n    const matchesStatus = filterStatus === 'all' || order.status === filterStatus;\n    return matchesSearch && matchesStatus;\n  });\n\n  const getStatusBadge");

// Update input and filter
content = content.replace("<input \n              type=\"text\" \n              placeholder=\"Tìm theo mã, SÐT...\" \n              className=\"pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500\"\n            />", "<input \n              type=\"text\" \n              value={searchTerm}\n              onChange={(e) => setSearchTerm(e.target.value)}\n              placeholder=\"Tìm theo mã, tên, SÐT...\" \n              className=\"pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500\"\n            />");

content = content.replace("<button className=\"p-2 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50\">\n            <Filter size={20} />\n          </button>", "<select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className=\"px-4 py-2 border border-slate-200 text-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/20\">\n            <option value=\"all\">T?t c?</option>\n            <option value=\"won\">Ðã ch?t</option>\n            <option value=\"quoted\">Ðã báo giá</option>\n            <option value=\"draft\">Nháp</option>\n          </select>");

// Update map
content = content.replace("orders.map(order =>", "filteredOrders.map(order =>");

// Update eye button
content = content.replace("<button className=\"p-1.5 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors\">", "<button onClick={() => navigate('/orders/' + (order.id || order.local_quote_id))} className=\"p-1.5 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors\">");

fs.writeFileSync(file, content);
console.log('Done');
