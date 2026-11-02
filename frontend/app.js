// ─── API Helper ──────────────────────────────────────────────────────────────
const API = '/api';
let authToken = null;
let currentUser = null;
let currentRole = null;
let eventsCache = [];
let coordActiveTab = 'tasks'; // tasks | events | volunteers
let adminActiveTab = 'events'; // events | users
let adminSearchQuery = '';
let adminSortField = 'date';
let adminSortDir = 'asc';

async function apiFetch(path, options = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
    const res = await fetch(API + path, { ...options, headers: { ...headers, ...(options.headers || {}) } });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
}

// ─── Utility ─────────────────────────────────────────────────────────────────
function notify(msg, type = 'success') {
    const t = document.getElementById('notification');
    const icon = t.querySelector('i');
    document.getElementById('notification-text').textContent = msg;
    icon.className = type === 'error'
        ? 'fas fa-circle-exclamation text-rose-400 text-sm'
        : 'fas fa-sparkles text-indigo-400 text-sm';
    t.style.opacity = '1';
    t.style.transform = 'translateY(0) translateX(-50%)';
    setTimeout(() => {
        t.style.opacity = '0';
        t.style.transform = 'translateY(-120%) translateX(-50%)';
    }, 3500);
}

function formatDate(str) {
    return new Date(str).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function isOpen(ev) {
    return ev.reg_count < ev.seat_limit && new Date(ev.deadline) > new Date();
}

function setLoading(btnEl, loading) {
    if (!btnEl) return;
    if (loading) {
        btnEl.dataset.origText = btnEl.innerHTML;
        btnEl.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Loading...';
        btnEl.disabled = true;
    } else {
        btnEl.innerHTML = btnEl.dataset.origText || btnEl.innerHTML;
        btnEl.disabled = false;
    }
}

// ─── View Switching ───────────────────────────────────────────────────────────
function showView(viewId) {
    document.querySelectorAll('.page-view').forEach(v => {
        v.style.display = 'none';
        v.classList.remove('active');
    });
    const target = document.getElementById(`view-${viewId}`);
    if (!target) return;
    target.style.display = 'flex';
    target.classList.add('active');
    window.scrollTo(0, 0);
}

function showLoginPage(role) {
    showView(`login-${role}`);
    const prefixMap = { admin: 'admin', coordinator: 'coord', student: 'student' };
    const p = prefixMap[role];
    const uEl = document.getElementById(`${p}-username`);
    const pwEl = document.getElementById(`${p}-password`);
    const errEl = document.getElementById(`${p}-login-error`);
    if (uEl) uEl.value = '';
    if (pwEl) pwEl.value = '';
    if (errEl) errEl.classList.add('hidden');
}

function togglePassword(inputId, btn) {
    const input = document.getElementById(inputId);
    const icon = btn.querySelector('i');
    if (input.type === 'password') {
        input.type = 'text';
        icon.classList.replace('fa-eye', 'fa-eye-slash');
    } else {
        input.type = 'password';
        icon.classList.replace('fa-eye-slash', 'fa-eye');
    }
}

// ─── Login ────────────────────────────────────────────────────────────────────
async function handleLogin(e, role) {
    e.preventDefault();
    const prefixMap = { admin: 'admin', coordinator: 'coord', student: 'student' };
    const p = prefixMap[role];
    const username = document.getElementById(`${p}-username`).value.trim();
    const password = document.getElementById(`${p}-password`).value;
    const errEl = document.getElementById(`${p}-login-error`);
    const btn = e.target.querySelector('button[type="submit"]');

    errEl.classList.add('hidden');
    setLoading(btn, true);

    try {
        const data = await apiFetch('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });
        authToken = data.token;
        currentUser = data.user;
        // Verify role matches the portal they chose
        if (currentUser.role !== role) {
            throw new Error(`This account is not a ${role}`);
        }
        navigateTo(role);
    } catch (err) {
        errEl.querySelector('span').textContent = err.message || 'Invalid credentials';
        errEl.classList.remove('hidden');
        const form = e.target;
        form.classList.add('animate-shake');
        setTimeout(() => form.classList.remove('animate-shake'), 500);
    } finally {
        setLoading(btn, false);
    }
}

// ─── Main Navigation ──────────────────────────────────────────────────────────
function navigateTo(role) {
    currentRole = role;

    document.querySelectorAll('.page-view').forEach(v => {
        v.style.display = 'none';
        v.classList.remove('active');
    });

    const target = document.getElementById(`view-${role}`);
    if (!target) return;

    if (role === 'login') {
        target.style.display = 'flex';
    } else {
        target.style.display = 'block';
        const navContainer = target.querySelector('.nav-container');
        if (navContainer) {
            const template = document.getElementById('nav-template');
            const content = template.content.cloneNode(true);
            const roleText = content.querySelector('.role-display');
            const nameText = content.querySelector('.user-name');
            roleText.textContent = (role === 'add-event') ? 'Admin' : role;
            if (nameText && currentUser) nameText.textContent = currentUser.name;
            const dot = content.querySelector('.role-dot');
            if (role.includes('admin') || role === 'add-event') dot.classList.add('bg-blue-500');
            if (role === 'coordinator') dot.classList.add('bg-emerald-500');
            if (role === 'student') dot.classList.add('bg-indigo-500');
            navContainer.innerHTML = '';
            navContainer.appendChild(content);
        }
    }

    target.classList.add('active');
    window.scrollTo(0, 0);
    renderView();
    if (role !== 'login') notify(`Welcome back, ${currentUser?.name || role}!`);
}

function logout() {
    authToken = null;
    currentUser = null;
    currentRole = null;
    eventsCache = [];
    showView('login');
}

// ─── Render Dispatcher ────────────────────────────────────────────────────────
function renderView() {
    if (currentRole === 'student') renderStudent();
    if (currentRole === 'admin') renderAdmin();
    if (currentRole === 'coordinator') renderCoordinator();
}

// ─── Student View ─────────────────────────────────────────────────────────────
async function renderStudent() {
    const grid = document.getElementById('student-grid');
    grid.innerHTML = `<div class="col-span-full flex justify-center py-20"><i class="fas fa-spinner fa-spin text-3xl text-indigo-400"></i></div>`;

    try {
        eventsCache = await apiFetch('/events');
    } catch (err) {
        grid.innerHTML = `<div class="col-span-full text-center py-20 text-rose-400 font-bold">${err.message}</div>`;
        return;
    }

    if (!eventsCache.length) {
        grid.innerHTML = `<div class="col-span-full text-center py-20 text-slate-300 font-black text-xs uppercase">No events yet</div>`;
        return;
    }

    grid.innerHTML = eventsCache.map(ev => {
        const active = isOpen(ev);
        return `
            <div class="event-card group bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden flex flex-col transition-all duration-300">
                <div class="h-40 ${ev.color} relative p-8 flex flex-col justify-end">
                    <span class="relative z-10 px-3 py-1 bg-black/10 backdrop-blur-md text-white text-[9px] font-black rounded-xl uppercase tracking-widest border border-white/20 w-fit">
                        ${ev.location}
                    </span>
                </div>
                <div class="p-8 flex-grow flex flex-col">
                    <h3 class="text-xl font-black text-slate-800 mb-3 leading-tight">${ev.title}</h3>
                    <p class="text-slate-500 text-xs leading-relaxed mb-6 line-clamp-2">${ev.description}</p>
                    <div class="space-y-3 mb-8 text-[11px] font-bold text-slate-500">
                        <div class="flex items-center gap-3"><i class="fas fa-clock text-indigo-500"></i> ${formatDate(ev.date)}</div>
                        <div class="flex items-center gap-3"><i class="fas fa-user-friends text-indigo-500"></i> ${ev.reg_count}/${ev.seat_limit} Claimed</div>
                        <div class="flex items-center gap-3"><i class="fas fa-hourglass-half text-rose-400"></i> Deadline: ${formatDate(ev.deadline)}</div>
                    </div>
                    <button onclick="openRegModal(${ev.id})" class="mt-auto w-full py-4 rounded-2xl font-black text-[9px] uppercase tracking-widest transition-all ${active ? 'bg-slate-900 text-white hover:bg-indigo-600' : 'bg-slate-100 text-slate-300 cursor-not-allowed'}">
                        ${active ? 'View & Register' : 'Closed'}
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// ─── Admin View ───────────────────────────────────────────────────────────────


// ─── Admin View ───────────────────────────────────────────────────────────────
async function renderAdmin() {
    const content = document.getElementById('admin-content');
    if (content) content.innerHTML = adminLoadingHTML();
    try {
        const [stats, events, users] = await Promise.all([
            apiFetch('/stats'),
            apiFetch('/events'),
            apiFetch('/users')
        ]);
        eventsCache = events;
        renderAdminStats(stats);
        renderAdminTab(adminActiveTab, stats, events, users);
    } catch (err) { notify(err.message, 'error'); }
}

function adminLoadingHTML() {
    return `<div class="flex justify-center py-20"><i class="fas fa-spinner fa-spin text-3xl text-blue-400"></i></div>`;
}

function switchAdminTab(tab) {
    adminActiveTab = tab;
    ['events','users'].forEach(t => {
        const btn = document.getElementById(`admin-tab-${t}`);
        if (!btn) return;
        btn.className = t === tab
            ? 'px-5 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest bg-blue-600 text-white shadow transition-all'
            : 'px-5 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest bg-white text-slate-400 border border-slate-100 hover:border-blue-200 hover:text-blue-600 transition-all';
    });
    renderAdmin();
}

function renderAdminTab(tab, stats, events, users) {
    const content = document.getElementById('admin-content');
    if (!content) return;
    if (tab === 'events') renderAdminEvents(content, stats, events);
    if (tab === 'users')  renderAdminUsers(content, users);
}

function renderAdminStats(stats) {
    const ids = {
        'stat-admin-events': stats.totalEvents,
        'stat-admin-regs':   stats.totalRegs,
        'stat-admin-tasks':  stats.totalTasks,
        'stat-admin-vols':   stats.totalVols
    };
    Object.entries(ids).forEach(([id, val]) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    });
    // Active/locked breakdown
    const activeEl = document.getElementById('stat-admin-active');
    if (activeEl) activeEl.textContent = `${stats.activeEvents} active`;
    const doneEl = document.getElementById('stat-admin-done');
    if (doneEl) doneEl.textContent = `${stats.completedTasks} done`;
}

// ── Admin Events Tab ──────────────────────────────────────────────────────────
function renderAdminEvents(container, stats, events) {
    // Filter + sort
    let filtered = events.filter(ev =>
        !adminSearchQuery ||
        ev.title.toLowerCase().includes(adminSearchQuery.toLowerCase()) ||
        ev.location.toLowerCase().includes(adminSearchQuery.toLowerCase())
    );
    filtered.sort((a, b) => {
        let va = a[adminSortField] ?? '', vb = b[adminSortField] ?? '';
        if (typeof va === 'string') va = va.toLowerCase();
        if (typeof vb === 'string') vb = vb.toLowerCase();
        return adminSortDir === 'asc' ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
    });

    container.innerHTML = `
      <div class="space-y-6">
        <!-- Search + Sort bar -->
        <div class="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div class="relative flex-1 max-w-sm">
            <i class="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
            <input id="admin-search" type="text" placeholder="Search events..." value="${adminSearchQuery}"
              oninput="adminSearchQuery=this.value; renderAdmin()"
              class="w-full pl-10 pr-4 py-3 rounded-2xl bg-white border border-slate-100 shadow-sm font-bold text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          </div>
          <div class="flex items-center gap-2">
            <select onchange="adminSortField=this.value; renderAdmin()"
              class="px-3 py-2.5 rounded-xl bg-white border border-slate-100 font-bold text-xs focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="date"      ${adminSortField==='date'      ?'selected':''}>Sort: Date</option>
              <option value="title"     ${adminSortField==='title'     ?'selected':''}>Sort: Title</option>
              <option value="reg_count" ${adminSortField==='reg_count' ?'selected':''}>Sort: Registrations</option>
              <option value="seat_limit"${adminSortField==='seat_limit'?'selected':''}>Sort: Capacity</option>
            </select>
            <button onclick="adminSortDir=adminSortDir==='asc'?'desc':'asc'; renderAdmin()"
              class="px-3 py-2.5 rounded-xl bg-white border border-slate-100 font-bold text-xs hover:bg-blue-50 transition-all">
              <i class="fas fa-arrow-${adminSortDir==='asc'?'up':'down'} text-blue-500"></i>
            </button>
            <button onclick="exportRegistrationsCSV()"
              class="px-4 py-2.5 rounded-xl bg-white border border-slate-100 font-black text-[9px] uppercase tracking-widest hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-600 transition-all flex items-center gap-2">
              <i class="fas fa-download text-xs"></i> Export CSV
            </button>
          </div>
        </div>

        <!-- Events table -->
        <div class="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-left min-w-[900px]">
              <thead>
                <tr class="text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                  <th class="px-8 py-5">Event</th>
                  <th class="px-8 py-5">Status</th>
                  <th class="px-8 py-5">Registrations</th>
                  <th class="px-8 py-5">Volunteers</th>
                  <th class="px-8 py-5">Tasks</th>
                  <th class="px-8 py-5 text-right">Operations</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-50" id="admin-table">
                ${filtered.length ? filtered.map(ev => adminEventRow(ev)).join('') :
                  `<tr><td colspan="6" class="px-8 py-12 text-center text-slate-300 font-black text-xs uppercase">
                    ${adminSearchQuery ? 'No events match your search' : 'No events yet — create one!'}
                  </td></tr>`}
              </tbody>
            </table>
          </div>
        </div>
        <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest">
          Showing ${filtered.length} of ${events.length} events
        </p>
      </div>
    `;
}

function adminEventRow(ev) {
    const open = isOpen(ev);
    const regPct = ev.seat_limit > 0 ? Math.min(100, Math.round(ev.reg_count / ev.seat_limit * 100)) : 0;
    const volPct = ev.vols_needed > 0 ? Math.min(100, Math.round((ev.vol_count || 0) / ev.vols_needed * 100)) : 0;
    return `
      <tr class="hover:bg-blue-50/20 transition-all cursor-pointer" onclick="openEventDetailModal(${ev.id})">
        <td class="px-8 py-5">
          <div class="flex items-center gap-3">
            <div class="w-3 h-10 rounded-full ${ev.color} shrink-0"></div>
            <div>
              <div class="font-black text-slate-900 text-sm leading-none mb-1">${ev.title}</div>
              <div class="text-[9px] text-slate-400 font-bold">${ev.location} · ${formatDate(ev.date)}</div>
            </div>
          </div>
        </td>
        <td class="px-8 py-5" onclick="event.stopPropagation()">
          <span class="px-3 py-1 rounded-lg text-[8px] font-black tracking-widest uppercase ${open ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}">
            ${open ? 'Active' : 'Locked'}
          </span>
        </td>
        <td class="px-8 py-5" onclick="event.stopPropagation()">
          <div class="space-y-1">
            <div class="flex items-center gap-2">
              <div class="h-1.5 w-20 bg-slate-100 rounded-full overflow-hidden">
                <div class="h-full bg-indigo-500 rounded-full" style="width:${regPct}%"></div>
              </div>
              <span class="text-xs font-bold text-slate-500">${ev.reg_count}/${ev.seat_limit}</span>
            </div>
          </div>
        </td>
        <td class="px-8 py-5" onclick="event.stopPropagation()">
          <div class="flex items-center gap-2">
            <div class="h-1.5 w-16 bg-slate-100 rounded-full overflow-hidden">
              <div class="h-full bg-emerald-500 rounded-full" style="width:${volPct}%"></div>
            </div>
            <span class="text-xs font-bold text-slate-500">${ev.vol_count || 0}/${ev.vols_needed}</span>
          </div>
        </td>
        <td class="px-8 py-5 text-xs font-bold text-slate-500" onclick="event.stopPropagation()">
          ${ev.task_count || 0} tasks
        </td>
        <td class="px-8 py-5" onclick="event.stopPropagation()">
          <div class="flex items-center justify-end gap-2">
            <button onclick="openEventDetailModal(${ev.id})"
              class="px-3 py-2 bg-slate-50 text-slate-600 hover:bg-blue-600 hover:text-white rounded-xl text-[8px] font-black uppercase tracking-widest transition-all">
              <i class="fas fa-expand-alt"></i>
            </button>
            <button onclick="openEditEventModal(${ev.id})"
              class="px-3 py-2 bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white rounded-xl text-[8px] font-black uppercase tracking-widest transition-all">
              <i class="fas fa-pen"></i>
            </button>
            <button onclick="openDelegateModal(${ev.id}, '${escHtml(ev.title)}')"
              class="px-3 py-2 bg-slate-900 text-white hover:bg-blue-600 rounded-xl text-[8px] font-black uppercase tracking-widest transition-all">
              Delegate
            </button>
            <button onclick="deleteEvent(${ev.id}, this)"
              class="px-3 py-2 bg-rose-50 text-rose-400 hover:bg-rose-500 hover:text-white rounded-xl text-[8px] font-black uppercase tracking-widest transition-all">
              <i class="fas fa-trash-alt"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
}

// ── Event Detail Modal ────────────────────────────────────────────────────────
async function openEventDetailModal(eventId) {
    openGenericModal('<i class="fas fa-calendar-alt mr-2 text-blue-500"></i> Event Details', adminLoadingHTML());
    try {
        const [ev, regs, vols, tasks] = await Promise.all([
            apiFetch(`/events/${eventId}`),
            apiFetch(`/events/${eventId}/registrations`),
            apiFetch(`/events/${eventId}/volunteers`),
            apiFetch(`/events/${eventId}/tasks`)
        ]);
        const regPct = ev.seat_limit > 0 ? Math.min(100, Math.round(ev.reg_count / ev.seat_limit * 100)) : 0;
        const approvedVols = vols.filter(v => v.status === 'approved').length;
        const volPct = ev.vols_needed > 0 ? Math.min(100, Math.round(approvedVols / ev.vols_needed * 100)) : 0;
        const completedTasks = tasks.filter(t => t.status === 'completed').length;

        const body = `
          <div class="space-y-6">
            <!-- Header banner -->
            <div class="h-20 ${ev.color} rounded-2xl flex items-end p-5">
              <div>
                <h3 class="text-white font-black text-xl leading-none">${ev.title}</h3>
                <p class="text-white/70 text-[10px] font-bold mt-1">${ev.location}</p>
              </div>
            </div>

            <!-- Info grid -->
            <div class="grid grid-cols-2 gap-4 text-sm">
              <div class="bg-slate-50 p-4 rounded-2xl">
                <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Event Date</p>
                <p class="font-black text-slate-800">${formatDate(ev.date)}</p>
              </div>
              <div class="bg-slate-50 p-4 rounded-2xl">
                <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Reg. Deadline</p>
                <p class="font-black text-rose-500">${formatDate(ev.deadline)}</p>
              </div>
            </div>

            <p class="text-slate-600 text-sm leading-relaxed">${ev.description}</p>

            <!-- Stats row -->
            <div class="grid grid-cols-3 gap-3">
              <div class="bg-indigo-50 border border-indigo-100 p-4 rounded-2xl text-center">
                <p class="text-xl font-black text-indigo-600">${ev.reg_count}/${ev.seat_limit}</p>
                <p class="text-[9px] font-black text-indigo-400 uppercase mt-1">Registrations</p>
                <div class="h-1 w-full bg-indigo-100 rounded-full mt-2 overflow-hidden">
                  <div class="h-full bg-indigo-500 rounded-full" style="width:${regPct}%"></div>
                </div>
              </div>
              <div class="bg-emerald-50 border border-emerald-100 p-4 rounded-2xl text-center">
                <p class="text-xl font-black text-emerald-600">${approvedVols}/${ev.vols_needed}</p>
                <p class="text-[9px] font-black text-emerald-400 uppercase mt-1">Volunteers</p>
                <div class="h-1 w-full bg-emerald-100 rounded-full mt-2 overflow-hidden">
                  <div class="h-full bg-emerald-500 rounded-full" style="width:${volPct}%"></div>
                </div>
              </div>
              <div class="bg-blue-50 border border-blue-100 p-4 rounded-2xl text-center">
                <p class="text-xl font-black text-blue-600">${completedTasks}/${tasks.length}</p>
                <p class="text-[9px] font-black text-blue-400 uppercase mt-1">Tasks Done</p>
                <div class="h-1 w-full bg-blue-100 rounded-full mt-2 overflow-hidden">
                  <div class="h-full bg-blue-500 rounded-full" style="width:${tasks.length > 0 ? Math.round(completedTasks/tasks.length*100) : 0}%"></div>
                </div>
              </div>
            </div>

            <!-- Registrations list -->
            <div>
              <h4 class="font-black text-slate-800 text-sm mb-3 flex items-center gap-2">
                <i class="fas fa-users text-indigo-500 text-xs"></i> Registered Attendees
                <button onclick="exportEventCSV(${ev.id}, '${escHtml(ev.title)}')"
                  class="ml-auto text-[8px] font-black text-emerald-600 hover:text-emerald-700 uppercase tracking-widest flex items-center gap-1">
                  <i class="fas fa-download"></i> CSV
                </button>
              </h4>
              ${regs.length ? `
              <div class="max-h-40 overflow-y-auto space-y-2 pr-1">
                ${regs.map((r,i) => `
                  <div class="flex items-center justify-between px-4 py-2.5 bg-slate-50 rounded-xl">
                    <div class="flex items-center gap-3">
                      <span class="text-[9px] font-black text-slate-400 w-5">${i+1}</span>
                      <div>
                        <p class="font-bold text-slate-800 text-xs leading-none">${r.name}</p>
                        <p class="text-[9px] text-slate-400 font-bold">${r.email}</p>
                      </div>
                    </div>
                    <span class="text-[9px] text-slate-400 font-bold">${new Date(r.created_at).toLocaleDateString()}</span>
                  </div>
                `).join('')}
              </div>` : `<p class="text-slate-300 text-xs font-black uppercase text-center py-4">No registrations yet</p>`}
            </div>

            <!-- Tasks list -->
            <div>
              <h4 class="font-black text-slate-800 text-sm mb-3 flex items-center gap-2">
                <i class="fas fa-tasks text-blue-500 text-xs"></i> Tasks
                <button onclick="closeGenericModal(); openDelegateModal(${ev.id}, '${escHtml(ev.title)}')"
                  class="ml-auto text-[8px] font-black text-blue-600 hover:text-blue-700 uppercase tracking-widest flex items-center gap-1">
                  <i class="fas fa-plus"></i> Add Task
                </button>
              </h4>
              ${tasks.length ? `
              <div class="space-y-2">
                ${tasks.map(t => `
                  <div class="flex items-center justify-between px-4 py-2.5 bg-slate-50 rounded-xl">
                    <div>
                      <p class="font-bold text-slate-800 text-xs">${t.title}</p>
                      <p class="text-[9px] text-slate-400 font-bold">${t.coordinator_name || 'Unassigned'}</p>
                    </div>
                    <span class="px-2 py-1 rounded-lg text-[8px] font-black tracking-widest uppercase ${
                      t.status==='completed' ? 'bg-emerald-100 text-emerald-700' :
                      t.status==='in-progress' ? 'bg-blue-100 text-blue-700' :
                      'bg-amber-100 text-amber-700'
                    }">${t.status}</span>
                  </div>
                `).join('')}
              </div>` : `<p class="text-slate-300 text-xs font-black uppercase text-center py-4">No tasks yet</p>`}
            </div>

            <!-- Action buttons -->
            <div class="flex gap-3 pt-2">
              <button onclick="closeGenericModal(); openEditEventModal(${ev.id})"
                class="flex-1 py-3 bg-blue-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-blue-500 transition-all">
                <i class="fas fa-pen mr-2"></i> Edit Event
              </button>
              <button onclick="closeGenericModal(); openDelegateModal(${ev.id}, '${escHtml(ev.title)}')"
                class="flex-1 py-3 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-700 transition-all">
                <i class="fas fa-user-plus mr-2"></i> Delegate Task
              </button>
            </div>
          </div>
        `;
        updateGenericModalBody(body);
    } catch (err) {
        updateGenericModalBody(`<p class="text-rose-400 font-bold">${err.message}</p>`);
    }
}

// ── Edit Event Modal ──────────────────────────────────────────────────────────
async function openEditEventModal(eventId) {
    openGenericModal('<i class="fas fa-pen mr-2 text-blue-500"></i> Edit Event', adminLoadingHTML());
    try {
        const ev = await apiFetch(`/events/${eventId}`);
        const colorOptions = [
            'bg-indigo-600','bg-rose-600','bg-blue-600','bg-emerald-600','bg-violet-600','bg-amber-600'
        ].map(c => `<option value="${c}" ${ev.color===c?'selected':''}>${c.replace('bg-','').replace('-600','')}</option>`).join('');

        updateGenericModalBody(`
          <form onsubmit="submitEditEvent(event, ${ev.id})" class="space-y-4">
            <div>
              <label class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Event Title</label>
              <input id="edit-ev-title" required value="${escHtml(ev.title)}"
                class="w-full p-3 rounded-xl bg-slate-50 border border-slate-100 font-bold text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            </div>
            <div>
              <label class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Description</label>
              <textarea id="edit-ev-desc" rows="3"
                class="w-full p-3 rounded-xl bg-slate-50 border border-slate-100 font-medium text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">${ev.description || ''}</textarea>
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Start Date</label>
                <input id="edit-ev-date" type="datetime-local" required value="${ev.date}"
                  class="w-full p-3 rounded-xl bg-slate-50 border border-slate-100 font-bold text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              </div>
              <div>
                <label class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Reg. Deadline</label>
                <input id="edit-ev-deadline" type="datetime-local" required value="${ev.deadline}"
                  class="w-full p-3 rounded-xl bg-slate-50 border border-slate-100 font-bold text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              </div>
              <div>
                <label class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Venue</label>
                <input id="edit-ev-venue" required value="${escHtml(ev.location)}"
                  class="w-full p-3 rounded-xl bg-slate-50 border border-slate-100 font-bold text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              </div>
              <div>
                <label class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Max Seats</label>
                <input id="edit-ev-limit" type="number" required value="${ev.seat_limit}"
                  class="w-full p-3 rounded-xl bg-slate-50 border border-slate-100 font-bold text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              </div>
              <div>
                <label class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Volunteers Needed</label>
                <input id="edit-ev-vols" type="number" required value="${ev.vols_needed}"
                  class="w-full p-3 rounded-xl bg-slate-50 border border-slate-100 font-bold text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              </div>
              <div>
                <label class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Color Theme</label>
                <select id="edit-ev-color"
                  class="w-full p-3 rounded-xl bg-slate-50 border border-slate-100 font-bold text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  ${colorOptions}
                </select>
              </div>
            </div>
            <button type="submit"
              class="w-full py-4 bg-blue-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-blue-500 transition-all shadow-lg mt-2">
              Save Changes
            </button>
          </form>
        `);
    } catch (err) {
        updateGenericModalBody(`<p class="text-rose-400 font-bold">${err.message}</p>`);
    }
}

async function submitEditEvent(e, eventId) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    setLoading(btn, true);
    try {
        await apiFetch(`/events/${eventId}`, {
            method: 'PUT',
            body: JSON.stringify({
                title:       document.getElementById('edit-ev-title').value,
                description: document.getElementById('edit-ev-desc').value,
                date:        document.getElementById('edit-ev-date').value,
                deadline:    document.getElementById('edit-ev-deadline').value,
                location:    document.getElementById('edit-ev-venue').value,
                seat_limit:  parseInt(document.getElementById('edit-ev-limit').value),
                vols_needed: parseInt(document.getElementById('edit-ev-vols').value),
                color:       document.getElementById('edit-ev-color').value
            })
        });
        closeGenericModal();
        notify('Event updated!');
        renderAdmin();
    } catch (err) {
        notify(err.message, 'error');
        setLoading(btn, false);
    }
}

// ── Delegate Task Modal (proper form with coordinator picker) ─────────────────
async function openDelegateModal(eventId, eventTitle) {
    openGenericModal(`<i class="fas fa-user-plus mr-2 text-blue-500"></i> Delegate Task — ${eventTitle}`, adminLoadingHTML());
    try {
        const [coords, tasks] = await Promise.all([
            apiFetch('/coordinators'),
            apiFetch(`/events/${eventId}/tasks`)
        ]);
        const coordOptions = coords.length
            ? coords.map(c => `<option value="${c.username}">${c.name} (@${c.username})</option>`).join('')
            : '<option value="">No coordinators found</option>';

        updateGenericModalBody(`
          <form onsubmit="submitDelegateTask(event, ${eventId}, '${escHtml(eventTitle)}')" class="space-y-4">
            <div>
              <label class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Task Title *</label>
              <input id="delegate-task-title" required placeholder="e.g. Set up registration desk"
                class="w-full p-3 rounded-xl bg-slate-50 border border-slate-100 font-bold text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            </div>
            <div>
              <label class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Assign to Coordinator</label>
              <select id="delegate-coord"
                class="w-full p-3 rounded-xl bg-slate-50 border border-slate-100 font-bold text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Unassigned</option>
                ${coordOptions}
              </select>
            </div>
            <button type="submit" ${!coords.length ? 'disabled' : ''}
              class="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-blue-600 transition-all shadow-lg disabled:opacity-50">
              Assign Task
            </button>
          </form>

          ${tasks.length ? `
          <div class="mt-6 pt-6 border-t border-slate-100">
            <h4 class="font-black text-slate-700 text-xs uppercase tracking-widest mb-3">Existing Tasks</h4>
            <div class="space-y-2 max-h-48 overflow-y-auto">
              ${tasks.map(t => `
                <div class="flex items-center justify-between px-4 py-2.5 bg-slate-50 rounded-xl">
                  <div>
                    <p class="font-bold text-slate-800 text-xs">${t.title}</p>
                    <p class="text-[9px] text-slate-400 font-bold">${t.coordinator_name || 'Unassigned'}</p>
                  </div>
                  <span class="px-2 py-1 rounded-lg text-[8px] font-black tracking-widest uppercase ${
                    t.status==='completed' ? 'bg-emerald-100 text-emerald-700' :
                    t.status==='in-progress' ? 'bg-blue-100 text-blue-700' :
                    'bg-amber-100 text-amber-700'
                  }">${t.status}</span>
                </div>
              `).join('')}
            </div>
          </div>` : ''}
        `);
    } catch (err) {
        updateGenericModalBody(`<p class="text-rose-400 font-bold">${err.message}</p>`);
    }
}

async function submitDelegateTask(e, eventId, eventTitle) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const title = document.getElementById('delegate-task-title').value.trim();
    const coord = document.getElementById('delegate-coord').value;
    if (!title) return;
    setLoading(btn, true);
    try {
        await apiFetch(`/events/${eventId}/tasks`, {
            method: 'POST',
            body: JSON.stringify({ title, coordinator_username: coord || undefined })
        });
        notify(coord ? `Task assigned to ${coord}` : 'Task created (unassigned)');
        closeGenericModal();
        renderAdmin();
    } catch (err) {
        notify(err.message, 'error');
        setLoading(btn, false);
    }
}

// Keep old delegateWork as alias for backward compat
async function delegateWork(eventId) {
    const ev = eventsCache.find(e => e.id === eventId);
    openDelegateModal(eventId, ev ? ev.title : 'Event');
}

// ── User Management Tab ───────────────────────────────────────────────────────
function renderAdminUsers(container, users) {
    const admins = users.filter(u => u.role === 'admin');
    const coords = users.filter(u => u.role === 'coordinator');
    const students = users.filter(u => u.role === 'student');

    container.innerHTML = `
      <div class="space-y-6">
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-black text-slate-800 flex items-center gap-3">
            <i class="fas fa-users text-blue-500"></i> User Management
            <span class="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-lg text-[9px] font-black">${users.length} users</span>
          </h3>
          <button onclick="openCreateUserModal()"
            class="bg-blue-600 text-white px-5 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-blue-500 transition-all shadow-lg shadow-blue-500/20 flex items-center gap-2">
            <i class="fas fa-user-plus text-xs"></i> Add User
          </button>
        </div>

        <!-- Role summary cards -->
        <div class="grid grid-cols-3 gap-4">
          <div class="bg-blue-50 border border-blue-100 p-5 rounded-2xl text-center">
            <p class="text-2xl font-black text-blue-600">${admins.length}</p>
            <p class="text-[9px] font-black text-blue-400 uppercase tracking-widest mt-1">Admins</p>
          </div>
          <div class="bg-emerald-50 border border-emerald-100 p-5 rounded-2xl text-center">
            <p class="text-2xl font-black text-emerald-600">${coords.length}</p>
            <p class="text-[9px] font-black text-emerald-400 uppercase tracking-widest mt-1">Coordinators</p>
          </div>
          <div class="bg-indigo-50 border border-indigo-100 p-5 rounded-2xl text-center">
            <p class="text-2xl font-black text-indigo-600">${students.length}</p>
            <p class="text-[9px] font-black text-indigo-400 uppercase tracking-widest mt-1">Students</p>
          </div>
        </div>

        <!-- Users table -->
        <div class="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-left min-w-[700px]">
              <thead>
                <tr class="text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                  <th class="px-8 py-5">User</th>
                  <th class="px-8 py-5">Role</th>
                  <th class="px-8 py-5">Activity</th>
                  <th class="px-8 py-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-50">
                ${users.map(u => `
                  <tr class="hover:bg-slate-50/50 transition-all">
                    <td class="px-8 py-5">
                      <div class="flex items-center gap-3">
                        <div class="w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm text-white ${
                          u.role==='admin' ? 'bg-blue-500' : u.role==='coordinator' ? 'bg-emerald-500' : 'bg-indigo-500'
                        }">
                          ${u.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p class="font-black text-slate-900 text-sm leading-none">${u.name}</p>
                          <p class="text-[9px] text-slate-400 font-bold mt-0.5">@${u.username} · ${u.email || 'no email'}</p>
                        </div>
                      </div>
                    </td>
                    <td class="px-8 py-5">
                      <span class="px-3 py-1 rounded-lg text-[8px] font-black tracking-widest uppercase ${
                        u.role==='admin' ? 'bg-blue-100 text-blue-700' :
                        u.role==='coordinator' ? 'bg-emerald-100 text-emerald-700' :
                        'bg-indigo-100 text-indigo-700'
                      }">${u.role}</span>
                    </td>
                    <td class="px-8 py-5 text-xs font-bold text-slate-500">
                      ${u.reg_count} registrations · ${u.task_count} tasks
                    </td>
                    <td class="px-8 py-5">
                      <div class="flex items-center justify-end gap-2">
                        <button onclick="openEditUserModal(${u.id}, '${escHtml(u.name)}', '${escHtml(u.email||'')}', '${u.role}')"
                          class="px-3 py-2 bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white rounded-xl text-[8px] font-black uppercase tracking-widest transition-all">
                          <i class="fas fa-pen"></i>
                        </button>
                        <button onclick="openResetPasswordModal(${u.id}, '${escHtml(u.name)}')"
                          class="px-3 py-2 bg-amber-50 text-amber-600 hover:bg-amber-500 hover:text-white rounded-xl text-[8px] font-black uppercase tracking-widest transition-all">
                          <i class="fas fa-key"></i>
                        </button>
                        <button onclick="deleteUser(${u.id}, '${escHtml(u.name)}', this)"
                          class="px-3 py-2 bg-rose-50 text-rose-400 hover:bg-rose-500 hover:text-white rounded-xl text-[8px] font-black uppercase tracking-widest transition-all">
                          <i class="fas fa-trash-alt"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
}

function openCreateUserModal() {
    openGenericModal('<i class="fas fa-user-plus mr-2 text-blue-500"></i> Create User', `
      <form onsubmit="submitCreateUser(event)" class="space-y-4">
        <div class="grid grid-cols-2 gap-4">
          <div class="col-span-2">
            <label class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Full Name *</label>
            <input id="new-user-name" required placeholder="e.g. Priya Sharma"
              class="w-full p-3 rounded-xl bg-slate-50 border border-slate-100 font-bold text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          </div>
          <div>
            <label class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Username *</label>
            <input id="new-user-username" required placeholder="priya_s"
              class="w-full p-3 rounded-xl bg-slate-50 border border-slate-100 font-bold text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          </div>
          <div>
            <label class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Role *</label>
            <select id="new-user-role"
              class="w-full p-3 rounded-xl bg-slate-50 border border-slate-100 font-bold text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="student">Student</option>
              <option value="coordinator">Coordinator</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div class="col-span-2">
            <label class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Email</label>
            <input id="new-user-email" type="email" placeholder="user@college.edu"
              class="w-full p-3 rounded-xl bg-slate-50 border border-slate-100 font-bold text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          </div>
          <div class="col-span-2">
            <label class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Password *</label>
            <input id="new-user-password" type="password" required placeholder="Min 6 characters"
              class="w-full p-3 rounded-xl bg-slate-50 border border-slate-100 font-bold text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          </div>
        </div>
        <button type="submit"
          class="w-full py-4 bg-blue-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-blue-500 transition-all shadow-lg">
          Create User
        </button>
      </form>
    `);
}

async function submitCreateUser(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    setLoading(btn, true);
    try {
        await apiFetch('/users', {
            method: 'POST',
            body: JSON.stringify({
                name:     document.getElementById('new-user-name').value.trim(),
                username: document.getElementById('new-user-username').value.trim(),
                email:    document.getElementById('new-user-email').value.trim(),
                role:     document.getElementById('new-user-role').value,
                password: document.getElementById('new-user-password').value
            })
        });
        closeGenericModal();
        notify('User created!');
        renderAdmin();
    } catch (err) {
        notify(err.message, 'error');
        setLoading(btn, false);
    }
}

function openEditUserModal(userId, name, email, role) {
    openGenericModal('<i class="fas fa-pen mr-2 text-blue-500"></i> Edit User', `
      <form onsubmit="submitEditUser(event, ${userId})" class="space-y-4">
        <div>
          <label class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Full Name *</label>
          <input id="edit-user-name" required value="${name}"
            class="w-full p-3 rounded-xl bg-slate-50 border border-slate-100 font-bold text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
        </div>
        <div>
          <label class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Email</label>
          <input id="edit-user-email" type="email" value="${email}"
            class="w-full p-3 rounded-xl bg-slate-50 border border-slate-100 font-bold text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
        </div>
        <div>
          <label class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Role *</label>
          <select id="edit-user-role"
            class="w-full p-3 rounded-xl bg-slate-50 border border-slate-100 font-bold text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="student"     ${role==='student'     ?'selected':''}>Student</option>
            <option value="coordinator" ${role==='coordinator' ?'selected':''}>Coordinator</option>
            <option value="admin"       ${role==='admin'       ?'selected':''}>Admin</option>
          </select>
        </div>
        <button type="submit"
          class="w-full py-4 bg-blue-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-blue-500 transition-all shadow-lg">
          Save Changes
        </button>
      </form>
    `);
}

async function submitEditUser(e, userId) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    setLoading(btn, true);
    try {
        await apiFetch(`/users/${userId}`, {
            method: 'PUT',
            body: JSON.stringify({
                name:  document.getElementById('edit-user-name').value.trim(),
                email: document.getElementById('edit-user-email').value.trim(),
                role:  document.getElementById('edit-user-role').value
            })
        });
        closeGenericModal();
        notify('User updated!');
        renderAdmin();
    } catch (err) {
        notify(err.message, 'error');
        setLoading(btn, false);
    }
}

function openResetPasswordModal(userId, userName) {
    openGenericModal(`<i class="fas fa-key mr-2 text-amber-500"></i> Reset Password — ${userName}`, `
      <form onsubmit="submitResetPassword(event, ${userId})" class="space-y-4">
        <div>
          <label class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 block">New Password *</label>
          <input id="reset-password" type="password" required placeholder="Min 6 characters"
            class="w-full p-3 rounded-xl bg-slate-50 border border-slate-100 font-bold text-sm focus:outline-none focus:ring-2 focus:ring-amber-500">
        </div>
        <button type="submit"
          class="w-full py-4 bg-amber-500 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-amber-400 transition-all shadow-lg">
          Reset Password
        </button>
      </form>
    `);
}

async function submitResetPassword(e, userId) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    setLoading(btn, true);
    try {
        await apiFetch(`/users/${userId}/password`, {
            method: 'PATCH',
            body: JSON.stringify({ password: document.getElementById('reset-password').value })
        });
        closeGenericModal();
        notify('Password reset!');
    } catch (err) {
        notify(err.message, 'error');
        setLoading(btn, false);
    }
}

async function deleteUser(userId, userName, btn) {
    if (!confirm(`Delete user "${userName}"? This cannot be undone.`)) return;
    setLoading(btn, true);
    try {
        await apiFetch(`/users/${userId}`, { method: 'DELETE' });
        notify(`${userName} removed`);
        renderAdmin();
    } catch (err) {
        notify(err.message, 'error');
        setLoading(btn, false);
    }
}

// ── CSV Export ────────────────────────────────────────────────────────────────
async function exportRegistrationsCSV() {
    try {
        const events = eventsCache.length ? eventsCache : await apiFetch('/events');
        const allRegs = await Promise.all(
            events.map(ev => apiFetch(`/events/${ev.id}/registrations`)
                .then(regs => regs.map(r => ({ ...r, event_title: ev.title, event_location: ev.location })))
                .catch(() => [])
            )
        );
        const rows = allRegs.flat();
        if (!rows.length) { notify('No registrations to export', 'error'); return; }

        const csv = [
            ['Event', 'Location', 'Name', 'Email', 'Registered At'].join(','),
            ...rows.map(r => [
                `"${r.event_title}"`, `"${r.event_location}"`,
                `"${r.name}"`, `"${r.email}"`,
                `"${new Date(r.created_at).toLocaleString()}"`
            ].join(','))
        ].join('\n');

        downloadCSV(csv, 'eventopia_registrations.csv');
        notify(`Exported ${rows.length} registrations`);
    } catch (err) {
        notify(err.message, 'error');
    }
}

async function exportEventCSV(eventId, eventTitle) {
    try {
        const regs = await apiFetch(`/events/${eventId}/registrations`);
        if (!regs.length) { notify('No registrations to export', 'error'); return; }

        const csv = [
            ['#', 'Name', 'Email', 'Registered At'].join(','),
            ...regs.map((r, i) => [
                i + 1, `"${r.name}"`, `"${r.email}"`,
                `"${new Date(r.created_at).toLocaleString()}"`
            ].join(','))
        ].join('\n');

        downloadCSV(csv, `${eventTitle.replace(/\s+/g,'_')}_registrations.csv`);
        notify(`Exported ${regs.length} registrations`);
    } catch (err) {
        notify(err.message, 'error');
    }
}

function downloadCSV(csv, filename) {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
}
﻿async function updateTaskStatus(taskId, status) {
    try {
        await apiFetch(`/tasks/${taskId}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ status })
        });
        notify(`Task marked as ${status}`);
        renderCoordinator();
    } catch (err) {
        notify(err.message, 'error');
    }
}
