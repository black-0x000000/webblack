// ===== UTILS =====
const Utils = {
  pad: (n) => String(n).padStart(2, '0'),

  escapeHTML: (str) => {
    return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  },
  
  formatTime: (t) => {
    t = t || 0;
    const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
    return `${Utils.pad(h)}:${Utils.pad(m)}:${Utils.pad(s)}`;
  },

  getRoleBadge: (role) => {
    if (role === 'owner') return '<span class="badge owner">👑 Owner</span>';
    if (role === 'admin') return '<span class="badge admin">Admin</span>';
    return '<span class="badge user">User</span>';
  },

  showError: (message) => {
    const errModal = document.getElementById('errorModal');
    if (errModal) {
      document.getElementById('errorMessage').textContent = message;
      errModal.classList.add('show');
    } else {
      alert(message);
    }
  },

  closeModal: (id) => {
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove('show');
  },

  writeLog: async (action, detail) => {
    try {
      const now = new Date();
      const timeStr = now.toLocaleString('vi-VN', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      });
      const logRef = db.ref('accounts/systemLog').push();
      await logRef.set({ action, detail, by: App.currentUser, time: timeStr, timestamp: now.getTime() });
    } catch (e) {
      console.warn("Could not write log (Permission denied or network error)", e);
    }
  }
};

// ===== CORE APP STATE =====
const App = {
  currentUser: sessionStorage.getItem('currentUser'),
  currentRole: sessionStorage.getItem('currentRole'),
  countdownInterval: null,
  currentView: 'web',

  async init() {
    await this.handleRouting();
    this.bindEvents();
    this.initDefaultAccounts();
    this.showRechargeTabForUser();
  },

  showRechargeTabForUser() {
    const rechargeTab = document.getElementById('rechargeTabBtn');
    if (rechargeTab && this.currentRole === 'user') {
      rechargeTab.style.display = 'inline-block';
    }
  },

  async handleRouting() {
    const path = window.location.pathname;
    const isLogin = path.endsWith('index.html') || path === '/' || path.endsWith('webblack/');

    if (!this.currentUser && !isLogin) {
      window.location.href = (window.location.pathname.includes('/tools/') || window.location.pathname.includes('/games/')) ? '../index.html' : 'index.html';
      return;
    }

    if (this.currentUser) {
      if (isLogin) {
        window.location.href = (window.location.pathname.includes('/tools/') || window.location.pathname.includes('/games/')) ? '../dashboard.html' : 'dashboard.html';
        return;
      }

      const titleEl = document.getElementById('topBarTitle');
      if (titleEl) titleEl.textContent = '👤 ' + this.currentUser;
      const adminNameEl = document.getElementById('adminName');
      if (adminNameEl) adminNameEl.textContent = this.currentUser;

      // Dashboard logic
      if (path.includes('dashboard.html')) {
        const adminHeader = document.querySelector('.admin-header');
        if (this.currentRole === 'user' && adminHeader) {
          adminHeader.style.display = 'none';
        }
        if (this.currentRole === 'user') {
          Timer.start();
        } else {
          Admin.watchUserTime();
        }
      }

      // Panel logic
      if (path.includes('panel.html')) {
        if (this.currentRole === 'user') {
          window.location.href = (window.location.pathname.includes('/tools/') || window.location.pathname.includes('/games/')) ? '../dashboard.html' : 'dashboard.html';
          return;
        }

        try {
          const snap = await db.ref('accounts/' + this.currentUser).once('value');
          const realRole = snap.val()?.role;
          if (realRole !== 'admin' && realRole !== 'owner') {
             sessionStorage.setItem('currentRole', 'user');
             window.location.href = (window.location.pathname.includes('/tools/') || window.location.pathname.includes('/games/')) ? '../dashboard.html' : 'dashboard.html';
             return;
          }
        } catch(e) {}

        if (this.currentRole === 'owner') {
          const tabLogBtn = document.getElementById('tabLogBtn');
          if (tabLogBtn) tabLogBtn.style.display = 'inline-block';
        }
        
        const tabNotifyBtn = document.getElementById('tabNotifyBtn');
        if (tabNotifyBtn && (this.currentRole === 'admin' || this.currentRole === 'owner')) {
          tabNotifyBtn.style.display = 'inline-block';
        }
        
        Admin.renderAll();
      }

      if ((path.includes('/tools/') || path.includes('/games/')) && this.currentRole === 'user') {
        Timer.start();
      }
    }
  },

  bindEvents() {
    const loginPass = document.getElementById('loginPass');
    const loginUser = document.getElementById('loginUser');
    if (loginPass) {
      loginPass.addEventListener('keydown', e => { if (e.key === 'Enter') Auth.login(); });
      loginUser.addEventListener('keydown', e => { if (e.key === 'Enter') Auth.login(); });
    }

    if (document.getElementById('btWidth')) {
      BitmapTool.init();
    }
  },

  async initDefaultAccounts() {
    try {
      const ownerSnap = await db.ref('accounts/black_0x000000').once('value');
      if (!ownerSnap.exists()) await db.ref('accounts/black_0x000000').set({ password: '1', role: 'owner', timeLeft: 0, createdBy: null });

      const adminSnap = await db.ref('accounts/admin').once('value');
      if (!adminSnap.exists()) await db.ref('accounts/admin').set({ password: 'admin123', role: 'admin', timeLeft: 0, createdBy: 'black_0x000000' });
    } catch(e) {
      console.error("Lỗi khởi tạo tài khoản:", e);
    }
  }
};

// ===== AUTHENTICATION =====
const Auth = {
  async login() {
    const btn = document.querySelector('.btn-ok');
    if (btn) { if (btn.disabled) return; btn.disabled = true; btn.textContent = 'Đang xử lý...'; }
    
    const u = document.getElementById('loginUser').value.trim();
    const p = document.getElementById('loginPass').value;
    const err = document.getElementById('loginError');
    err.textContent = '';

    const restoreBtn = () => { if (btn) { btn.disabled = false; btn.textContent = 'OK'; } };

    if (!u || !p) { err.textContent = '❌ Vui lòng nhập đầy đủ.'; restoreBtn(); return; }

    try {
      const snapshot = await db.ref('accounts/' + u).once('value');
      const acc = snapshot.val();
      if (!acc) { err.textContent = '❌ Tài khoản không tồn tại.'; restoreBtn(); return; }
      if (acc.password !== p) { err.textContent = '❌ Mật khẩu không đúng.'; restoreBtn(); return; }
      if (acc.role === 'user' && acc.timeLeft <= 0) {
        err.textContent = '⚠️ Tài khoản hết thời gian. Liên hệ admin.'; restoreBtn(); return;
      }

      sessionStorage.setItem('currentUser', u);
      sessionStorage.setItem('currentRole', acc.role);
      App.currentUser = u;
      App.currentRole = acc.role;

      if (acc.role === 'admin' || acc.role === 'owner') await Utils.writeLog('login', u + ' đã đăng nhập');

      window.location.href = (window.location.pathname.includes('/tools/') || window.location.pathname.includes('/games/')) ? '../dashboard.html' : 'dashboard.html';
    } catch (e) {
      err.textContent = '❌ Lỗi kết nối Firebase: ' + e.message;
      restoreBtn();
    }
  },

  logout() {
    Timer.stop();
    sessionStorage.removeItem('currentUser');
    sessionStorage.removeItem('currentRole');
    App.currentUser = null;
    App.currentRole = null;
    db.ref('accounts').off();
    db.ref('accounts/systemLog').off();
    db.ref('rechargeRequests').off();
    window.location.href = (window.location.pathname.includes('/tools/') || window.location.pathname.includes('/games/')) ? '../index.html' : 'index.html';
  }
};

// ===== TIMER =====
const Timer = {
  start() {
    this.stop();
    const userRef = db.ref('accounts/' + App.currentUser);
    userRef.once('value').then(snapshot => {
      const acc = snapshot.val();
      if (!acc || acc.timeLeft <= 0) {
        this.handleTimeout();
        return;
      }

      let timeLeft = acc.timeLeft;
      this.updateDisplay(timeLeft);

      userRef.on('value', (snap) => {
        const newAcc = snap.val();
        if (!newAcc) return;
        if (newAcc.timeLeft > timeLeft) {
          const added = newAcc.timeLeft - timeLeft;
          timeLeft = newAcc.timeLeft;
          this.updateDisplay(timeLeft);
          const el = document.getElementById('timerDisplay');
          if (el) {
            el.style.color = '#68d391';
            el.textContent = '⏱ +' + added + 's ⬆';
            setTimeout(() => {
              if (el) {
                el.style.color = timeLeft <= 60 ? '#fc8181' : '';
                this.updateDisplay(timeLeft);
              }
            }, 2000);
          }
        }
      });

      App.countdownInterval = setInterval(() => {
        timeLeft--;
        if (timeLeft <= 0) {
          userRef.update({ timeLeft: 0 });
          this.handleTimeout();
          return;
        }
        userRef.transaction((currentData) => {
          if (currentData === null) return currentData;
          if (currentData.timeLeft === timeLeft + 1) currentData.timeLeft = timeLeft;
          else timeLeft = currentData.timeLeft;
          return currentData;
        });
        this.updateDisplay(timeLeft);
      }, 1000);
    });
  },

  stop() {
    if (App.countdownInterval) {
      clearInterval(App.countdownInterval);
      App.countdownInterval = null;
    }
    if (App.currentUser) db.ref('accounts/' + App.currentUser).off();
  },

  handleTimeout() {
    this.stop();
    Auth.logout();
    const err = document.getElementById('loginError');
    if (err) err.textContent = '⏰ Hết thời gian truy cập.';
  },

  updateDisplay(timeLeft) {
    const el = document.getElementById('timerDisplay');
    if (el) {
      el.textContent = '⏱ ' + Utils.formatTime(timeLeft);
      el.className = timeLeft <= 60 ? 'timer-danger' : '';
    }
  }
};

// ===== ADMIN MODULE =====
const Admin = {
  renderAll() {
    this.renderMyAccount();
    this.renderUserList();
    this.renderTimeTargets();
    this.watchUserTime();
    if (App.currentRole === 'owner') {
      this.renderLog();
    }
  },

  async renderMyAccount() {
    const card = document.getElementById('myAccountCard');
    if (!card) return;
    const snap = await db.ref('accounts/' + App.currentUser).once('value');
    const acc = snap.val();
    if (!acc) return;
    const desc = acc.role === 'owner' ? '👑 Chủ sở hữu hệ thống — toàn quyền' : 'Quản trị viên hệ thống';
    card.innerHTML = `
      <div class="info-row"><strong>${Utils.escapeHTML(App.currentUser)}</strong>${Utils.getRoleBadge(acc.role)}</div>
      <div style="font-size:0.85rem; color:#718096;">${desc}</div>`;
  },

  renderUserList() {
    const tbody = document.getElementById('userListBody');
    if (!tbody) return;
    db.ref('accounts').on('value', (snapshot) => {
      const accounts = snapshot.val() || {};
      const others = Object.keys(accounts).filter(u => u !== App.currentUser && u !== 'systemLog' && u !== 'timeLog');

      if (others.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="empty-msg">Chưa có tài khoản nào khác.</td></tr>`;
        return;
      }

      tbody.innerHTML = others.map(u => {
        const acc = accounts[u];
        const timeStr = acc.role === 'user' ? Utils.formatTime(acc.timeLeft) : '—';
        const timeColor = (acc.role === 'user' && acc.timeLeft <= 60) ? 'color:#fc8181;' : '';
        
        const canEdit = App.currentRole === 'owner' || (App.currentRole === 'admin' && acc.role === 'user');
        
        const btnEdit = canEdit 
          ? `<button class="btn-sm btn-edit" onclick="Admin.openEdit('${u}')">Sửa</button>`
          : `<button class="btn-sm btn-edit" onclick="Utils.showError('Bạn không có quyền sửa tài khoản này!')" style="opacity:0.5;cursor:not-allowed;">Sửa</button>`;
        const btnDel = canEdit 
          ? `<button class="btn-sm btn-del" onclick="Admin.openDelete('${u}')">Xóa</button>`
          : `<button class="btn-sm btn-del" onclick="Utils.showError('Bạn không có quyền xóa tài khoản này!')" style="opacity:0.5;cursor:not-allowed;">Xóa</button>`;
        const btnPw = App.currentRole === 'owner' 
          ? `<button class="btn-sm btn-edit" onclick="Admin.openChangePw('${u}')" style="margin-left:6px;">🔑</button>` : '';

        return `<tr>
          <td>${Utils.escapeHTML(u)}</td><td>${Utils.getRoleBadge(acc.role)}</td>
          <td class="time-cell" id="time-${u}" style="${timeColor}">${timeStr}</td>
          <td>${btnEdit} ${btnDel} ${btnPw}</td>
        </tr>`;
      }).join('');
    });
  },

  watchUserTime() {
    db.ref('accounts').on('value', (snapshot) => {
      const accounts = snapshot.val() || {};
      Object.keys(accounts).filter(u => u !== App.currentUser && u !== 'systemLog' && u !== 'timeLog' && accounts[u].role === 'user').forEach(u => {
        const el = document.getElementById('time-' + u);
        if (el) {
          const t = accounts[u].timeLeft || 0;
          el.textContent = Utils.formatTime(t);
          el.style.color = t <= 60 ? '#fc8181' : '';
        }
      });
    });
  },

  async renderTimeTargets() {
    const sel = document.getElementById('addTarget');
    if (!sel) return;
    const snap = await db.ref('accounts').once('value');
    const accounts = snap.val() || {};
    const users = Object.keys(accounts).filter(u => u !== 'systemLog' && u !== 'timeLog' && accounts[u].role === 'user');
    sel.innerHTML = users.length ? users.map(u => `<option value="${Utils.escapeHTML(u)}">${Utils.escapeHTML(u)}</option>`).join('') : '<option value="">-- Không có user --</option>';
  },

  async renderTimeLog() {
    const container = document.getElementById('timeLogEntries');
    if (!container) return;
    const snap = await db.ref('accounts/timeLog').orderByKey().limitToLast(10).once('value');
    const logs = snap.val();
    if (!logs) { container.innerHTML = '<div class="empty-msg">Chưa có lịch sử nạp.</div>'; return; }
    const entries = Object.values(logs).reverse();
    container.innerHTML = entries.map(l => 
      `<div class="log-entry">[${l.time}] <strong>${Utils.escapeHTML(l.by)}</strong> → <strong>${Utils.escapeHTML(l.target)}</strong>: +${Utils.formatTime(l.added)}</div>`
    ).join('');
  },

  renderLog() {
    const container = document.getElementById('logEntries');
    if (!container) return;
    db.ref('accounts/systemLog').orderByChild('timestamp').limitToLast(100).on('value', (snapshot) => {
      const logs = snapshot.val();
      if (!logs) { container.innerHTML = '<div class="empty-msg">Chưa có hoạt động nào.</div>'; return; }
      const entries = Object.values(logs).reverse();
      const badgeMap = { 'create':'create', 'delete':'delete', 'edit':'edit', 'time':'time', 'password':'pw', 'login':'login' };
      container.innerHTML = entries.map(l => {
        const badge = badgeMap[l.action] || 'create';
        return `<div class="log-item">
          <span class="log-content"><span class="log-badge ${badge}">${Utils.escapeHTML(l.action).toUpperCase()}</span> ${Utils.escapeHTML(l.detail)}</span>
          <span class="log-time">${l.time}</span>
        </div>`;
      }).join('');
    });
  },

  async createAccount() {
    const btn = document.querySelector('.btn-create');
    if (btn) { if (btn.disabled) return; btn.disabled = true; btn.textContent = 'Đang xử lý...'; }
    const restoreBtn = () => { if (btn) { btn.disabled = false; btn.textContent = 'Tạo tài khoản'; } };

    const role = document.getElementById('newRole').value;
    const uname = document.getElementById('newUsername').value.trim();
    const pass = document.getElementById('newPassword').value;
    const msg = document.getElementById('createMsg');

    if (!uname) { msg.className='form-msg err'; msg.textContent='Vui lòng nhập tên đăng nhập.'; restoreBtn(); return; }
    if (!pass) { msg.className='form-msg err'; msg.textContent='Vui lòng nhập mật khẩu.'; restoreBtn(); return; }

    const snap = await db.ref('accounts/' + uname).once('value');
    if (snap.exists()) { msg.className='form-msg err'; msg.textContent='Tên đăng nhập đã tồn tại.'; restoreBtn(); return; }

    await db.ref('accounts/' + uname).set({ password: pass, role, timeLeft: 0, createdBy: App.currentUser });
    await Utils.writeLog('create', `${App.currentUser} đã tạo tài khoản ${uname} (vai trò: ${role})`);
    
    msg.className='form-msg ok'; msg.textContent=`✅ Tạo tài khoản "${Utils.escapeHTML(uname)}" (${role}) thành công!`;
    document.getElementById('newUsername').value = '';
    document.getElementById('newPassword').value = '';
    this.renderTimeTargets();
    restoreBtn();
  },

  async addTime() {
    const btn = document.querySelector('.btn-nap');
    if (btn) { if (btn.disabled) return; btn.disabled = true; btn.textContent = 'Đang nạp...'; }
    const restoreBtn = () => { if (btn) { btn.disabled = false; btn.textContent = 'Nạp'; } };

    const h = parseInt(document.getElementById('addHour').value) || 0;
    const m = parseInt(document.getElementById('addMin').value) || 0;
    const s = parseInt(document.getElementById('addSec').value) || 0;
    const target = document.getElementById('addTarget').value;
    const msg = document.getElementById('timeMsg');

    if (!target) { msg.className='form-msg err'; msg.textContent='Không có tài khoản người dùng.'; restoreBtn(); return; }
    const total = h * 3600 + m * 60 + s;
    if (total <= 0) { msg.className='form-msg err'; msg.textContent='Vui lòng nhập thời gian hợp lệ.'; restoreBtn(); return; }

    const snap = await db.ref('accounts/' + target).once('value');
    const acc = snap.val();
    if (!acc) { msg.className='form-msg err'; msg.textContent='Tài khoản không tồn tại.'; restoreBtn(); return; }

    await db.ref('accounts/' + target).update({ timeLeft: (acc.timeLeft || 0) + total });
    
    const now = new Date().toLocaleString('vi-VN');
    await db.ref('accounts/timeLog').push().set({ time: now, by: App.currentUser, target, added: total });
    await Utils.writeLog('time', `${App.currentUser} đã nạp +${Utils.formatTime(total)} cho ${target}`);

    msg.className='form-msg ok'; msg.textContent=`✅ Đã nạp ${Utils.formatTime(total)} cho "${Utils.escapeHTML(target)}".`;
    document.getElementById('addHour').value = 0; document.getElementById('addMin').value = 0; document.getElementById('addSec').value = 0;
    this.renderTimeLog();
    restoreBtn();
  },

  async openEdit(u) {
    const currentSnap = await db.ref('accounts/' + App.currentUser).once('value');
    const currentAcc = currentSnap.val();
    if (currentAcc.role === 'user') return Utils.showError('Bạn không có quyền!');

    const targetSnap = await db.ref('accounts/' + u).once('value');
    const targetAcc = targetSnap.val();
    if (!targetAcc) return;

    if (currentAcc.role === 'admin' && targetAcc.role === 'admin') return Utils.showError('Không được sửa Admin khác!');
    if (currentAcc.role === 'admin' && targetAcc.role === 'owner') return Utils.showError('Không được sửa Owner!');

    document.getElementById('editTarget').value = u;
    document.getElementById('editUsername').value = u;
    document.getElementById('editPassword').value = '';
    document.getElementById('editMsg').textContent = '';
    document.getElementById('editModal').classList.add('show');
  },

  async saveEdit() {
    const btn = document.querySelector('.btn-save');
    if (btn) { if (btn.disabled) return; btn.disabled = true; btn.textContent = 'Đang lưu...'; }
    const restoreBtn = () => { if (btn) { btn.disabled = false; btn.textContent = 'Lưu'; } };

    const oldName = document.getElementById('editTarget').value;
    const newName = document.getElementById('editUsername').value.trim();
    const newPass = document.getElementById('editPassword').value;
    const msg = document.getElementById('editMsg');

    if (!newName) { msg.className='form-msg err'; msg.textContent='Tên không được trống.'; restoreBtn(); return; }

    const snap = await db.ref('accounts/' + oldName).once('value');
    const acc = snap.val();
    if (!acc) { msg.className='form-msg err'; msg.textContent='Tài khoản không tồn tại.'; return; }

    if (newName !== oldName) {
      const existSnap = await db.ref('accounts/' + newName).once('value');
      if (existSnap.exists()) { msg.className='form-msg err'; msg.textContent='Tên đã tồn tại.'; return; }
      if (newPass) acc.password = newPass;
      await db.ref('accounts/' + newName).set(acc);
      await db.ref('accounts/' + oldName).remove();
      await Utils.writeLog('edit', `${App.currentUser} đã đổi tên ${oldName} → ${newName}`);
    } else {
      if (newPass) {
        acc.password = newPass;
        await db.ref('accounts/' + oldName).update({ password: newPass });
        await Utils.writeLog('password', `${App.currentUser} đã đổi mật khẩu của ${oldName}`);
      }
    }
    Utils.closeModal('editModal');
    restoreBtn();
  },

  deleteTarget: null,
  openDelete(u) {
    this.deleteTarget = u;
    document.getElementById('deleteTargetName').textContent = u;
    document.getElementById('deleteModal').classList.add('show');
  },

  async confirmDelete() {
    const btn = document.querySelector('.btn-confirm-del');
    if (btn) { if (btn.disabled) return; btn.disabled = true; btn.textContent = 'Đang xóa...'; }
    const restoreBtn = () => { if (btn) { btn.disabled = false; btn.textContent = 'Xóa'; } };

    if (!this.deleteTarget) { restoreBtn(); return; }
    const target = this.deleteTarget;
    
    const snap = await db.ref('accounts/' + target).once('value');
    if (!snap.exists()) { Utils.closeModal('deleteModal'); return; }
    
    await Utils.writeLog('delete', `${App.currentUser} đã xóa tài khoản ${target}`);
    await db.ref('accounts/' + target).remove();
    this.deleteTarget = null;
    Utils.closeModal('deleteModal');
    this.renderTimeTargets();
    restoreBtn();
  },

  async renderChangePwTab() {
    const container = document.getElementById('changePwContainer');
    if (!container) return;
    const snap = await db.ref('accounts/' + App.currentUser).once('value');
    const acc = snap.val();

    if (acc.role === 'owner') {
      container.innerHTML = `
        <p style="color:#a0aec0; margin-bottom:16px;">👑 Bạn là Owner. Bạn có thể đổi mật khẩu của bất kỳ tài khoản nào.</p>
        <div class="form-group" style="max-width:380px;">
          <label>Chọn tài khoản</label>
          <select id="changePwSelect" style="width:100%;padding:10px 14px;border:1px solid #2d3548;border-radius:8px;background:#151922;color:#e2e8f0;font-size:0.95rem;outline:none;"></select>
        </div>
        <button class="btn-create" onclick="Admin.openChangePwFromSelect()">🔑 Đổi mật khẩu</button>`;
      
      const allSnap = await db.ref('accounts').once('value');
      const accounts = allSnap.val() || {};
      document.getElementById('changePwSelect').innerHTML = Object.keys(accounts).filter(u => u !== 'systemLog' && u !== 'timeLog').map(u => 
        `<option value="${Utils.escapeHTML(u)}">${Utils.escapeHTML(u)} (${Utils.escapeHTML(accounts[u].role)})${u===App.currentUser?' ← Bạn':''}</option>`
      ).join('');
    } else if (acc.role === 'admin') {
      container.innerHTML = `
        <p style="color:#a0aec0; margin-bottom:16px;">🔑 Bạn chỉ có thể đổi mật khẩu của chính mình.</p>
        <div class="form-group" style="max-width:380px;">
          <label>Tài khoản</label>
          <input type="text" value="${App.currentUser} (chính bạn)" disabled style="width:100%;padding:10px 14px;border:1px solid #2d3548;border-radius:8px;background:#151922;color:#718096;font-size:0.95rem;outline:none;">
        </div>
        <button class="btn-create" onclick="Admin.openChangePw('${App.currentUser}')">🔑 Đổi mật khẩu</button>`;
    }
  },

  openChangePw(target) {
    document.getElementById('changePwTarget').textContent = target;
    document.getElementById('changePwNew').value = '';
    document.getElementById('changePwConfirm').value = '';
    document.getElementById('changePwMsg').textContent = '';
    document.getElementById('changePwModal').dataset.target = target;
    document.getElementById('changePwModal').classList.add('show');
  },

  openChangePwFromSelect() {
    const sel = document.getElementById('changePwSelect');
    if (!sel.value) return Utils.showError('Vui lòng chọn tài khoản.');
    this.openChangePw(sel.value);
  },

  async saveChangePw() {
    const btn = document.querySelector('#changePwModal .btn-save');
    if (btn) { if (btn.disabled) return; btn.disabled = true; btn.textContent = 'Đang lưu...'; }
    const restoreBtn = () => { if (btn) { btn.disabled = false; btn.textContent = 'Đổi mật khẩu'; } };

    const target = document.getElementById('changePwModal').dataset.target;
    const newPw = document.getElementById('changePwNew').value;
    const confirmPw = document.getElementById('changePwConfirm').value;
    const msg = document.getElementById('changePwMsg');

    if (!newPw || newPw.length < 3) { msg.className='form-msg err'; msg.textContent='Mật khẩu phải có ít nhất 3 ký tự.'; restoreBtn(); return; }
    if (newPw !== confirmPw) { msg.className='form-msg err'; msg.textContent='Xác nhận không khớp.'; restoreBtn(); return; }

    const snap = await db.ref('accounts/' + target).once('value');
    if (!snap.exists()) { msg.className='form-msg err'; msg.textContent='Tài khoản không tồn tại.'; return; }

    await db.ref('accounts/' + target).update({ password: newPw });
    await Utils.writeLog('password', `${App.currentUser} đã đổi mật khẩu của ${target}`);
    
    msg.className='form-msg ok'; msg.textContent='✅ Đổi mật khẩu thành công!';
    setTimeout(() => { Utils.closeModal('changePwModal'); restoreBtn(); }, 1500);
  }
};

// ===== UI NAVIGATION =====
const UI = {
  switchView(view) {
    App.currentView = view;
    document.getElementById('webView').classList.toggle('show', view === 'web');
    document.getElementById('settingsView').classList.toggle('show', view !== 'web');
    document.getElementById('btnWeb').classList.toggle('active', view === 'web');
    document.getElementById('btnSettings').classList.toggle('active', view !== 'web');
    
    if (view !== 'web') {
      Admin.renderTimeTargets();
      Admin.renderTimeLog();
      Admin.renderChangePwTab();
    }
  },

  switchWebTab(tab) {
    document.querySelectorAll('.web-tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.web-tab-content').forEach(content => content.classList.remove('active'));
    
    const btns = document.querySelectorAll('.web-tab-btn');
    if (tab === 'tools') {
      btns[0].classList.add('active');
      document.getElementById('webTabTools').classList.add('active');
    } else if (tab === 'game') {
      btns[1].classList.add('active');
      document.getElementById('webTabGame').classList.add('active');
    } else if (tab === 'recharge') {
      for (let i = 0; i < btns.length; i++) {
        if (btns[i].textContent.includes('NẠP THỜI GIAN')) {
          btns[i].classList.add('active');
          break;
        }
      }
      document.getElementById('webTabRecharge').classList.add('active');
    }
  },

  switchTab(id, event) {
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.settings-tabs .tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    if (event) event.currentTarget.classList.add('active');
    
    if (id === 'tabTime') { Admin.renderTimeTargets(); Admin.renderTimeLog(); }
    if (id === 'tabChangePw') Admin.renderChangePwTab();
    if (id === 'tabNotify') Recharge.renderNotifications();
  }
};

// ===== BITMAP TOOL =====
const BitmapTool = {
  width: 8, height: 8, pixels: [], mode: 'fill', isDrawing: false,

  init() {
    const wInput = document.getElementById('btWidth');
    const hInput = document.getElementById('btHeight');

    wInput.addEventListener('input', () => {
      let v = parseInt(wInput.value) || 1;
      this.width = Math.max(1, Math.min(192, v));
      this.initGrid();
    });
    hInput.addEventListener('input', () => {
      let v = parseInt(hInput.value) || 1;
      this.height = Math.max(1, Math.min(63, v));
      this.initGrid();
    });

    this.width = parseInt(wInput.value) || 8;
    this.height = parseInt(hInput.value) || 8;
    this.initGrid();

    document.addEventListener('mouseup', () => this.isDrawing = false);
  },

  initGrid() {
    document.getElementById('btWidth').value = this.width;
    document.getElementById('btHeight').value = this.height;

    const oldPixels = this.pixels;
    this.pixels = Array.from({ length: this.height }, (_, r) => 
      Array.from({ length: this.width }, (_, c) => oldPixels[r]?.[c] || 0)
    );

    this.render();
    this.updateHex();
  },

  render() {
    const grid = document.getElementById('pixelGrid');
    grid.style.gridTemplateColumns = `repeat(${this.width}, 14px)`;
    grid.innerHTML = '';

    for (let row = 0; row < this.height; row++) {
      for (let col = 0; col < this.width; col++) {
        const cell = document.createElement('div');
        cell.className = 'pixel-cell' + (this.pixels[row][col] ? ' lit' : '');
        cell.dataset.r = row; cell.dataset.c = col;

        const toggle = (e) => {
          e.preventDefault();
          this.isDrawing = true;
          this.togglePixel(row, col);
        };

        cell.addEventListener('mousedown', toggle);
        cell.addEventListener('touchstart', toggle, { passive: false });
        cell.addEventListener('mouseover', () => { if (this.isDrawing) this.togglePixel(row, col); });
        
        cell.addEventListener('touchmove', (e) => {
          e.preventDefault();
          const touch = e.touches[0];
          const el = document.elementFromPoint(touch.clientX, touch.clientY);
          if (el && el.classList.contains('pixel-cell')) {
            this.togglePixel(parseInt(el.dataset.r), parseInt(el.dataset.c));
          }
        }, { passive: false });

        grid.appendChild(cell);
      }
    }
  },

  togglePixel(r, c) {
    this.pixels[r][c] = this.mode === 'fill' ? 1 : 0;
    const cell = document.getElementById('pixelGrid').children[r * this.width + c];
    if (cell) cell.className = 'pixel-cell' + (this.pixels[r][c] ? ' lit' : '');
    this.updateHex();
  },

  setMode(m) {
    this.mode = m;
    document.getElementById('btStateLabel').textContent = m === 'fill' ? 'Tô' : 'Xóa';
    document.getElementById('btStateLabel').className = 'bt-state-indicator' + (m === 'fill' ? '' : ' erase');
    document.getElementById('btnFill').classList.toggle('active', m === 'fill');
    document.getElementById('btnErase').classList.toggle('active', m === 'erase');
  },

  clear() {
    this.pixels = Array.from({ length: this.height }, () => Array(this.width).fill(0));
    this.render();
    this.updateHex();
  },

  reset() {
    this.width = 8; this.height = 8;
    this.initGrid();
  },

  updateHex() {
    if (!this.width || !this.height || !this.pixels.length) {
      document.getElementById('btHexOutput').textContent = '—';
      return;
    }

    const hexParts = [];
    for (let r = 0; r < this.height; r++) {
      const padded = [...this.pixels[r]];
      while (padded.length % 8 !== 0) padded.push(0);

      for (let b = 0; b < padded.length; b += 8) {
        let byte = 0;
        for (let bit = 0; bit < 8; bit++) byte = (byte << 1) | padded[b + bit];
        hexParts.push(byte.toString(16).padStart(2, '0'));
      }
    }
    document.getElementById('btHexOutput').textContent = hexParts.join(' ');
  },

  open() { window.location.href = (window.location.pathname.includes('/tools/') || window.location.pathname.includes('/games/')) ? '../tools/bitmap.html' : 'tools/bitmap.html'; },
  close() { window.location.href = (window.location.pathname.includes('/tools/') || window.location.pathname.includes('/games/')) ? '../dashboard.html' : 'dashboard.html'; }
};

// ===== RECHARGE MODULE =====
const Recharge = {
  // User gửi yêu cầu nạp
  async requestRecharge(seconds) {
    if (!App.currentUser) {
      Utils.showError('Vui lòng đăng nhập!');
      return;
    }

    const user = App.currentUser;
    const timeStr = Utils.formatTime(seconds);
    
    // Kiểm tra xem đã có yêu cầu đang chờ xử lý chưa
    const snap = await db.ref('rechargeRequests').orderByChild('user').equalTo(user).once('value');
    const requests = snap.val() || {};
    const pending = Object.values(requests).some(r => r.status === 'pending');
    
    if (pending) {
      document.getElementById('rechargeMsg').textContent = '⏳ Bạn đã có yêu cầu đang chờ xử lý!';
      document.getElementById('rechargeMsg').style.color = '#fc8181';
      return;
    }

    try {
      const now = new Date();
      const timeStr2 = now.toLocaleString('vi-VN', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      });

      await db.ref('rechargeRequests').push().set({
        user: user,
        seconds: seconds,
        timeDisplay: timeStr,
        status: 'pending',
        requestTime: timeStr2,
        timestamp: now.getTime()
      });

      document.getElementById('rechargeMsg').textContent = `✅ Đã gửi yêu cầu nạp ${timeStr}. Vui lòng chờ admin duyệt!`;
      document.getElementById('rechargeMsg').style.color = '#68d391';
      
      await Utils.writeLog('recharge_request', `${user} yêu cầu nạp ${timeStr}`);
    } catch (e) {
      console.error('Lỗi gửi yêu cầu:', e);
      document.getElementById('rechargeMsg').textContent = '❌ Lỗi gửi yêu cầu. Vui lòng thử lại!';
      document.getElementById('rechargeMsg').style.color = '#fc8181';
    }
  },

  // Admin/Owner xem danh sách yêu cầu
  renderNotifications() {
    const container = document.getElementById('notifyList');
    if (!container) return;

    db.ref('rechargeRequests').orderByChild('timestamp').on('value', (snapshot) => {
      const requests = snapshot.val() || {};
      const entries = Object.entries(requests).reverse();

      if (entries.length === 0) {
        container.innerHTML = '<div class="empty-msg">Chưa có yêu cầu nạp thời gian.</div>';
        return;
      }

      container.innerHTML = entries.map(([key, req]) => {
        const statusClass = req.status === 'pending' ? 'pending' : 'completed';
        const statusText = req.status === 'pending' ? 'Chưa Nạp' : 'Đã Nạp';
        const btnDisabled = req.status === 'completed' ? 'disabled' : '';
        const btnText = req.status === 'pending' ? 'Nạp' : '✅ Đã nạp';

        return `
          <div class="notify-item" data-key="${key}">
            <div class="notify-info">
              <div class="notify-user">👤 Tài khoản: <strong>${Utils.escapeHTML(req.user)}</strong></div>
              <div class="notify-time">⏱ Nạp thêm: ${req.timeDisplay} (${req.requestTime})</div>
              <div><span class="notify-status ${statusClass}">${statusText}</span></div>
            </div>
            <div class="notify-actions">
              <button class="btn-notify-recharge" onclick="Recharge.processRecharge('${key}')" ${btnDisabled}>
                ${btnText}
              </button>
            </div>
          </div>
        `;
      }).join('');
    });
  },

  // Admin/Owner xử lý nạp
  async processRecharge(key) {
    try {
      const snap = await db.ref(`rechargeRequests/${key}`).once('value');
      const req = snap.val();
      
      if (!req || req.status === 'completed') {
        Utils.showError('Yêu cầu đã được xử lý!');
        return;
      }

      if (App.currentRole !== 'admin' && App.currentRole !== 'owner') {
        Utils.showError('Bạn không có quyền thực hiện!');
        return;
      }

      const userSnap = await db.ref(`accounts/${req.user}`).once('value');
      const userAcc = userSnap.val();
      
      if (!userAcc) {
        Utils.showError('Tài khoản không tồn tại!');
        return;
      }

      const currentTime = userAcc.timeLeft || 0;
      const newTime = currentTime + req.seconds;

      await db.ref(`accounts/${req.user}`).update({ timeLeft: newTime });
      
      await db.ref(`rechargeRequests/${key}`).update({ 
        status: 'completed',
        processedBy: App.currentUser,
        processedTime: new Date().toLocaleString('vi-VN')
      });

      await Utils.writeLog('recharge_completed', 
        `${App.currentUser} đã nạp ${req.timeDisplay} cho ${req.user}`
      );

      Utils.showError('✅ Đã nạp thời gian thành công!');
      
    } catch (e) {
      console.error('Lỗi xử lý nạp:', e);
      Utils.showError('❌ Lỗi xử lý! Vui lòng thử lại.');
    }
  },

  cleanup() {
    db.ref('rechargeRequests').off();
  }
};

// ===== EXPORTS FOR INLINE HTML ATTRIBUTES =====
window.doLogin = () => Auth.login();
window.doLogout = () => Auth.logout();
window.switchView = (v) => UI.switchView(v);
window.switchWebTab = (t) => UI.switchWebTab(t);
window.switchTab = (id, e) => UI.switchTab(id, e);
window.createAccount = () => Admin.createAccount();
window.addTime = () => Admin.addTime();
window.saveEdit = () => Admin.saveEdit();
window.confirmDelete = () => Admin.confirmDelete();
window.saveChangePw = () => Admin.saveChangePw();
window.closeModal = (id) => Utils.closeModal(id);
window.openBitmapTool = () => BitmapTool.open();
window.closeBitmapTool = () => BitmapTool.close();
window.setMode = (m) => BitmapTool.setMode(m);
window.clearPixels = () => BitmapTool.clear();
window.resetBitmap = () => BitmapTool.reset();
window.requestRecharge = (seconds) => Recharge.requestRecharge(seconds);
window.processRecharge = (key) => Recharge.processRecharge(key);

// ===== BOOTSTRAP =====
document.addEventListener('DOMContentLoaded', () => App.init());
