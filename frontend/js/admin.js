const API = '/api';

let adminToken = localStorage.getItem('admin_token');

let currentOrderFilter = 'all';

let currentMessageFilter = 'all';



function aFetch(path, opts = {}) {

    const headers = { 'Content-Type': 'application/json', ...opts.headers };

    if (adminToken) headers['Authorization'] = `Bearer ${adminToken}`;

    return fetch(`${API}${path}`, { ...opts, headers }).then(r => r.json().then(d => { if (!r.ok) throw new Error(d.error || '请求失败'); return d; }));

}



function aToast(msg, type = 'info') {

    const container = document.getElementById('adminToast');

    const icons = { success: 'Y', error: 'X', info: 'I' };

    const el = document.createElement('div');

    el.className = `toast ${type}`;

    el.innerHTML = `<span class="toast-icon">${icons[type] || 'I'}</span>${msg}`;

    container.appendChild(el);

    setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateX(100px)'; el.style.transition = '0.3s'; setTimeout(() => el.remove(), 300); }, 3000);

}



async function adminLogin(e) {

    e.preventDefault();

    const username = document.getElementById('adminUsername').value.trim();

    const password = document.getElementById('adminPassword').value.trim();

    try {

        const data = await aFetch('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });

        if (data.user.role !== 'admin') { throw new Error('无管理员权限'); }

        adminToken = data.token;

        localStorage.setItem('admin_token', data.token);

        document.getElementById('adminLogin').style.display = 'none';

        document.getElementById('adminLayout').classList.add('active');

        aToast('欢迎回来！', 'success');

        await loadDashboard();

    } catch (e) {

        const err = document.getElementById('adminLoginError');

        err.textContent = e.message; err.style.display = 'block';

    }

}



function adminLogout() {

    adminToken = null; localStorage.removeItem('admin_token');

    document.getElementById('adminLogin').style.display = 'flex';

    document.getElementById('adminLayout').classList.remove('active');

}



async function checkAdminAuth() {

    if (!adminToken) return;

    try {

        const data = await aFetch('/auth/me');

        if (data.role !== 'admin') throw new Error('not admin');

        document.getElementById('adminLogin').style.display = 'none';

        document.getElementById('adminLayout').classList.add('active');

        await loadDashboard();

    } catch { adminToken = null; localStorage.removeItem('admin_token'); }

}



function switchPage(page, el) {

    document.querySelectorAll('.admin-page').forEach(p => p.classList.remove('active'));

    document.querySelectorAll('.admin-nav a').forEach(a => a.classList.remove('active'));

    document.getElementById(`page${page.charAt(0).toUpperCase() + page.slice(1)}`).classList.add('active');

    if (el) el.classList.add('active');

    if (page === 'dashboard') loadDashboard();

    if (page === 'orders') loadOrders(currentOrderFilter);

    if (page === 'products') loadProducts();

    if (page === 'messages') loadMessages(currentMessageFilter);

}



async function loadDashboard() {

    try {

        const stats = await aFetch('/admin/stats');

        document.getElementById('statOrders').textContent = stats.total_orders || 0;

        document.getElementById('statPending').textContent = stats.pending_orders || 0;

        document.getElementById('statRevenue').textContent = `$${(stats.total_revenue || 0).toFixed(0)}`;

        document.getElementById('statProducts').textContent = stats.total_products || 0;

        document.getElementById('statContacts').textContent = stats.total_contacts || 0;

        document.getElementById('statUnread').textContent = stats.unread_messages || 0;

    } catch (e) { aToast('加载仪表盘失败', 'error'); }

    try { const orders = await aFetch('/orders'); renderDashboardOrders(orders.slice(0, 5)); } catch {}

}



function renderDashboardOrders(orders) {

    const container = document.getElementById('dashboardOrders');

    if (!orders || orders.length === 0) { container.innerHTML = '<div class="empty-state">No orders</div>'; return; }

    container.innerHTML = `<table class="data-table"><thead><tr><th>#</th><th>Customer</th><th>Amount</th><th>Status</th><th>Date</th></tr></thead><tbody>${orders.map(o => `

        <tr><td>#${o.id}</td><td>${o.customer_name || '游客'}</td><td>$${o.total_amount.toFixed(0)}</td>

        <td><span class="status-badge ${o.status}">${o.status}</span></td>

        <td>${new Date(o.created_at).toLocaleDateString()}</td></tr>

    `).join('')}</tbody></table>`;

}



async function loadOrders(status = 'all') {

    currentOrderFilter = status;

    try { const orders = await aFetch(`/orders${status !== 'all' ? '?status='+status : ''}`); renderOrders(orders); }

    catch (e) { aToast('加载订单失败', 'error'); }

}



function filterOrders(status, btn) {

    document.querySelectorAll('#pageOrders .category-filter').forEach(b => b.classList.remove('active'));

    btn.classList.add('active'); loadOrders(status);

}



function renderOrders(orders) {

    const container = document.getElementById('ordersContainer');

    if (!orders || orders.length === 0) { container.innerHTML = '<div class="empty-state">No orders</div>'; return; }

    container.innerHTML = `<table class="data-table"><thead><tr><th>#</th><th>Customer</th><th>Phone</th><th>Amount</th><th>Status</th><th>Date</th><th>Actions</th></tr></thead><tbody>${orders.map(o => `

        <tr><td>#${o.id}</td><td>${o.customer_name || '游客'}</td><td>${o.customer_phone || '-'}</td>

        <td>$${o.total_amount.toFixed(0)}</td>

        <td><span class="status-badge ${o.status}">${o.status}</span></td>

        <td>${new Date(o.created_at).toLocaleString()}</td>

        <td class="actions">

            <button onclick="viewOrder(${o.id})">View</button>

            <button onclick="updateOrderStatus(${o.id},'confirmed')">Confirm</button>

            <button onclick="updateOrderStatus(${o.id},'processing')">Process</button>

            <button onclick="updateOrderStatus(${o.id},'completed')">Complete</button>

            <button class="danger" onclick="updateOrderStatus(${o.id},'cancelled')">Cancel</button>

        </td></tr>

    `).join('')}</tbody></table>`;

}



async function viewOrder(id) {

    try {

        const order = await aFetch(`/orders/${id}`);

        const itemsHtml = order.items.map(i => `<div style="display:flex;justify-content:space-between;padding:6px 0;font-size:13px;border-bottom:1px solid rgba(255,255,255,0.05);"><span>${i.product_name} x ${i.quantity}</span><span>$${(i.price * i.quantity).toFixed(0)}</span></div>`).join('');

        const infoHtml = '<div style="margin-bottom:16px;background:var(--bg-card);border:1px solid var(--border-color);border-radius:8px;padding:16px;">'

            + `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px;"><div><strong>Order #</strong><br><span style="color:var(--text-secondary);">${order.id}</span></div>`

            + `<div><strong>Status</strong><br><span class="status-badge ${order.status}">${order.status}</span></div>`

            + `<div><strong>Customer</strong><br><span style="color:var(--text-secondary);">${order.customer_name || '游客'}</span></div>`

            + `<div><strong>Phone</strong><br><span style="color:var(--text-secondary);">${order.customer_phone || '-'}</span></div>`

            + `<div><strong>Email</strong><br><span style="color:var(--text-secondary);">${order.customer_email || '-'}</span></div>`

            + `<div><strong>Date</strong><br><span style="color:var(--text-secondary);">${new Date(order.created_at).toLocaleString()}</span></div></div>`

            + (order.note ? `<div style="margin-top:12px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.05);"><strong>Note</strong><br><span style="color:var(--text-secondary);font-size:13px;">${order.note}</span></div>` : '')

            + `<div style="margin-top:12px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.05);"><strong>Items</strong>${itemsHtml}<div style="display:flex;justify-content:space-between;padding:8px 0 0;font-weight:700;font-size:14px;"><span>Total</span><span style="color:var(--accent);">$${order.total_amount.toFixed(0)}</span></div></div></div>`;

        const overlay = document.createElement('div');

        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index:5000;display:flex;align-items:center;justify-content:center;padding:24px;';

        overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

        const box = document.createElement('div');

        box.style.cssText = 'background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:12px;padding:32px;max-width:560px;width:100%;max-height:80vh;overflow-y:auto;position:relative;';

        box.innerHTML = '<button style="position:absolute;top:12px;right:12px;background:none;border:none;color:var(--text-muted);font-size:20px;cursor:pointer;" onclick="this.closest(\'div[style]\').remove()">x</button><h3 style="margin-bottom:16px;">Order Details</h3>' + infoHtml;

        overlay.appendChild(box); document.body.appendChild(overlay);

    } catch (e) { aToast('加载订单详情失败', 'error'); }

}



async function updateOrderStatus(id, status) {

    try { await aFetch(`/orders/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) });

    aToast(`Order #${id} updated`, 'success'); loadOrders(currentOrderFilter); loadDashboard();

    } catch (e) { aToast(e.message, 'error'); }

}



async function loadProducts() {

    try { const products = await aFetch('/products'); renderAdminProducts(products); }

    catch (e) { aToast('加载商品失败', 'error'); }

}



function renderAdminProducts(products) {

    const container = document.getElementById('productsContainer');

    if (!products || products.length === 0) { container.innerHTML = '<div class="empty-state">No products</div>'; return; }

    container.innerHTML = `<table class="data-table"><thead><tr><th>Name</th><th>Category</th><th>Price</th><th>Stock</th><th>Status</th><th>Actions</th></tr></thead><tbody>${products.map(p => `

        <tr><td>${p.name}</td><td>${p.category || '-'}</td><td>$${p.price.toFixed(0)}</td>

        <td>${p.stock}</td>

        <td>${p.is_available ? '<span style="color:var(--success);">Active</span>' : '<span style="color:var(--danger);">Inactive</span>'}</td>

        <td class="actions">

            <button onclick="editProduct(${p.id})">Edit</button>

            <button onclick="toggleProduct(${p.id}, ${!p.is_available})">${p.is_available ? '下架' : '上架'}</button>

            <button class="danger" onclick="deleteProduct(${p.id})">Delete</button>

        </td></tr>

    `).join('')}</tbody></table>`;

}



function showProductModal(data) {

    document.getElementById('adminModalTitle').textContent = data ? '编辑商品' : '添加商品';

    document.getElementById('adminModalBtn').textContent = data ? '保存修改' : '添加';

    document.getElementById('editProductId').value = data ? data.id : '';

    document.getElementById('prodName').value = data ? data.name : '';

    document.getElementById('prodDesc').value = data ? (data.description || '') : '';

    document.getElementById('prodPrice').value = data ? data.price : '';

    document.getElementById('prodCategory').value = data ? (data.category || '') : '';

    document.getElementById('prodStock').value = data ? data.stock : 99;

    document.getElementById('prodImage').value = data ? (data.image_url || '') : '';

    document.getElementById('adminModal').classList.add('open');

}



function closeAdminModal() { document.getElementById('adminModal').classList.remove('open'); }



async function saveProduct(e) {

    e.preventDefault();

    const id = document.getElementById('editProductId').value;

    const data = {

        name: document.getElementById('prodName').value.trim(),

        description: document.getElementById('prodDesc').value.trim(),

        price: parseFloat(document.getElementById('prodPrice').value),

        category: document.getElementById('prodCategory').value.trim(),

        stock: parseInt(document.getElementById('prodStock').value) || 99,

        image_url: document.getElementById('prodImage').value.trim(),

    };

    if (!data.name || isNaN(data.price)) { aToast('请填写商品名称和价格', 'error'); return; }

    try {

        if (id) { await aFetch(`/products/${id}`, { method: 'PUT', body: JSON.stringify(data) }); aToast('商品已更新', 'success'); }

        else { await aFetch('/products', { method: 'POST', body: JSON.stringify(data) }); aToast('商品已添加', 'success'); }

        closeAdminModal(); loadProducts(); loadDashboard();

    } catch (e) { aToast(e.message, 'error'); }

}



function editProduct(id) { aFetch(`/products/${id}`).then(p => showProductModal(p)).catch(e => aToast(e.message, 'error')); }



async function toggleProduct(id, available) {

    try { await aFetch(`/products/${id}`, { method: 'PUT', body: JSON.stringify({ is_available: available }) });

    aToast(`Product ${available ? 'activated' : 'deactivated'}`, 'success'); loadProducts();

    } catch (e) { aToast(e.message, 'error'); }

}



async function deleteProduct(id) {

    if (!confirm('确定要删除此商品吗？')) return;

    try { await aFetch(`/products/${id}`, { method: 'DELETE' }); aToast('商品已删除', 'success'); loadProducts(); loadDashboard(); }

    catch (e) { aToast(e.message, 'error'); }

}



async function loadMessages(status = 'all') {

    currentMessageFilter = status;

    try { const msgs = await aFetch(`/contacts${status !== 'all' ? '?status='+status : ''}`); renderMessages(msgs); }

    catch (e) { aToast('加载消息失败', 'error'); }

}



function filterMessages(status, btn) {

    document.querySelectorAll('#pageMessages .category-filter').forEach(b => b.classList.remove('active'));

    btn.classList.add('active'); loadMessages(status);

}



function renderMessages(msgs) {

    const container = document.getElementById('messagesContainer');

    if (!msgs || msgs.length === 0) { container.innerHTML = '<div class="empty-state">No messages</div>'; return; }

    container.innerHTML = `<table class="data-table"><thead><tr><th>Name</th><th>Email</th><th>Subject</th><th>Status</th><th>Date</th><th>Actions</th></tr></thead><tbody>${msgs.map(m => `

        <tr><td>${m.name}</td><td>${m.email || '-'}</td><td>${m.subject || '-'}</td>

        <td><span class="status-badge ${m.status}">${m.status}</span></td>

        <td>${new Date(m.created_at).toLocaleString()}</td>

        <td class="actions">

            <button onclick="viewMessage(${m.id})">View</button>

            ${m.status !== 'replied' ? '<button onclick="showReplyModal('+m.id+')">Reply</button>' : ''}

            <button onclick="markMessageRead(${m.id})">Mark Read</button>

        </td></tr>

    `).join('')}</tbody></table>`;

}



async function viewMessage(id) {

    try {

        const msgs = await aFetch('/contacts');

        const m = msgs.find(msg => msg.id === id);

        if (!m) return;

        const overlay = document.createElement('div');

        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index:5000;display:flex;align-items:center;justify-content:center;padding:24px;';

        overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

        const box = document.createElement('div');

        box.style.cssText = 'background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:12px;padding:32px;max-width:560px;width:100%;max-height:80vh;overflow-y:auto;position:relative;';

        box.innerHTML = '<button style="position:absolute;top:12px;right:12px;background:none;border:none;color:var(--text-muted);font-size:20px;cursor:pointer;" onclick="this.closest(\'div[style]\').remove()">x</button>'

            + '<h3 style="margin-bottom:16px;">Message Details</h3>'

            + '<div style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:8px;padding:16px;">'

            + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px;margin-bottom:12px;">'

            + `<div><strong>Name</strong><br><span style="color:var(--text-secondary)">${m.name}</span></div>`

            + `<div><strong>Email</strong><br><span style="color:var(--text-secondary)">${m.email || '-'}</span></div>`

            + `<div><strong>Phone</strong><br><span style="color:var(--text-secondary)">${m.phone || '-'}</span></div>`

            + `<div><strong>Date</strong><br><span style="color:var(--text-secondary)">${new Date(m.created_at).toLocaleString()}</span></div></div>`

            + `<div style="margin-top:12px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.05);"><strong>Subject: ${m.subject || '(No subject)'}</strong>`

            + `<p style="margin-top:8px;font-size:14px;color:var(--text-secondary);line-height:1.7;">${m.message}</p></div>`

            + (m.reply ? `<div style="margin-top:12px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.05);"><strong>Reply</strong><p style="margin-top:8px;font-size:14px;color:var(--accent);line-height:1.7;">${m.reply}</p></div>` : '')

            + '</div>';

        overlay.appendChild(box); document.body.appendChild(overlay);

    } catch {}

}



function showReplyModal(id) {

    document.getElementById('replyContactId').value = id;

    aFetch('/contacts').then(msgs => {

        const m = msgs.find(msg => msg.id === id);

        if (m) { document.getElementById('replyMessageInfo').innerHTML = `<strong>${m.name}</strong> - ${m.subject || '(No subject)'}<br><span style="color:var(--text-muted);font-size:12px;">${m.message.slice(0, 100)}${m.message.length > 100 ? '...' : ''}</span>`; }

    });

    document.getElementById('replyModal').classList.add('open');

}



function closeReplyModal() { document.getElementById('replyModal').classList.remove('open'); }



async function submitReply(e) {

    e.preventDefault();

    const id = document.getElementById('replyContactId').value;

    const reply = document.getElementById('replyContent').value.trim();

    if (!reply) { aToast('请输入回复内容', 'error'); return; }

    try { await aFetch(`/contacts/${id}/reply`, { method: 'PUT', body: JSON.stringify({ reply }) });

    aToast('回复已发送', 'success'); closeReplyModal(); document.getElementById('replyContent').value = ''; loadMessages(currentMessageFilter);

    } catch (e) { aToast(e.message, 'error'); }

}



async function markMessageRead(id) {

    try { await aFetch(`/contacts/${id}/status`, { method: 'PUT', body: JSON.stringify({ status: 'read' }) });

    loadMessages(currentMessageFilter); loadDashboard();

    } catch (e) { aToast(e.message, 'error'); }

}



document.addEventListener('DOMContentLoaded', () => { checkAdminAuth(); });


