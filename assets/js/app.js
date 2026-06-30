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

  formatNumber: (n) => {
    return new Intl.NumberFormat('vi-VN').format(n);
  },

  getRoleBadge: (role) => {
    if (role === 'owner') return '<span class="badge owner">👑 Owner</span>';
    if (role === 'admin') return '<span class="badge admin">Admin</span>';
    return '<span class="badge user">User</span>';
  },

  showError: (message, isSuccess = false) => {
    const errModal = document.getElementById('errorModal');
    if (errModal) {
      const icon = document.getElementById('modalIcon');
      const title = document.getElementById('modalTitle');
      
      if (isSuccess) {
        icon.textContent = '✅';
        title.textContent = 'Thành công!';
        title.style.color = 'var(--accent-green)';
      } else {
        icon.textContent = '⛔';
        title.textContent = 'Thông báo';
        title.style.color = 'var(--accent-red)';
      }
      
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

  generateCardCode: () => {
    let code = '';
    for (let i = 0; i < 16; i++) {
      code += Math.floor(Math.random() * 10);
    }
    return code;
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
    await this.initDefaultAccounts();
    this.showRechargeTabForUser();
    this.loadOnyxBalance();
    if (document.getElementById('werewolfCard')) {
      await Werewolf.checkGameStatus();
    }
  },

  loadOnyxBalance() {
    if (!this.currentUser) return;
    
    const el = document.getElementById('onyxDisplay');
    if (!el) return;
    
    if (this.currentRole !== 'user') {
      el.style.display = 'none';
      return;
    }
    
    el.style.display = 'flex';
    
    db.ref('accounts/' + this.currentUser + '/onyx').on('value', (snap) => {
      const balance = snap.val() || 0;
      const balanceEl = document.getElementById('onyxBalance');
      if (balanceEl) balanceEl.textContent = balance;
      
      const buyBalanceEl = document.getElementById('buyOnyxBalance');
      if (buyBalanceEl) buyBalanceEl.textContent = balance;
    });
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

      if (path.includes('dashboard.html')) {
        const adminHeader = document.querySelector('.admin-header');
        if (this.currentRole === 'user' && adminHeader) {
          adminHeader.style.display = 'none';
        }
        if (this.currentRole === 'user') {
          Timer.start();
          const userInput = document.getElementById('rechargeUser');
          if (userInput) userInput.value = this.currentUser;
        } else {
          Admin.watchUserTime();
        }
      }

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
          const tabCreateCardBtn = document.getElementById('tabCreateCardBtn');
          if (tabCreateCardBtn) tabCreateCardBtn.style.display = 'inline-block';
          const tabGameSystemBtn = document.getElementById('tabGameSystemBtn');
          if (tabGameSystemBtn) tabGameSystemBtn.style.display = 'inline-block';
        }
        
        const tabNotifyBtn = document.getElementById('tabNotifyBtn');
        if (tabNotifyBtn) {
          tabNotifyBtn.style.display = 'inline-block';
        }
        
        Admin.renderAll();
        Card.renderCardList();
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

    const cardInput = document.getElementById('cardCodeInput');
    if (cardInput) {
      cardInput.addEventListener('keydown', e => { if (e.key === 'Enter') redeemCard(); });
    }

    if (document.getElementById('btWidth')) {
      BitmapTool.init();
    }
  },

  async initDefaultAccounts() {
    try {
      const ownerSnap = await db.ref('accounts/black_0x000000').once('value');
      if (ownerSnap.exists()) {
        const ownerData = ownerSnap.val();
        if (ownerData.onyx !== undefined) {
          await db.ref('accounts/black_0x000000/onyx').remove();
        }
      }
      
      const adminSnap = await db.ref('accounts/admin').once('value');
      if (adminSnap.exists()) {
        const adminData = adminSnap.val();
        if (adminData.onyx !== undefined) {
          await db.ref('accounts/admin/onyx').remove();
        }
      }

      if (!ownerSnap.exists()) {
        await db.ref('accounts/black_0x000000').set({ 
          password: '1', 
          role: 'owner', 
          timeLeft: 0,
          createdBy: null 
        });
      }

      if (!adminSnap.exists()) {
        await db.ref('accounts/admin').set({ 
          password: 'admin123', 
          role: 'admin', 
          timeLeft: 0,
          createdBy: 'black_0x000000' 
        });
      }
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
    db.ref('cards').off();
    db.ref('gameLobbies').off();
    db.ref('gameHistory').off();
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
    
    let onyxHtml = '';
    if (acc.role === 'user') {
      onyxHtml = `<div style="font-size:0.85rem; color:var(--accent-cyan); margin-top:4px;">⚫ Onyx: <strong>${acc.onyx || 0}</strong></div>`;
    }
    
    card.innerHTML = `
      <div class="info-row"><strong>${Utils.escapeHTML(App.currentUser)}</strong>${Utils.getRoleBadge(acc.role)}</div>
      <div style="font-size:0.85rem; color:#718096;">${desc}</div>
      ${onyxHtml}`;
  },

  renderUserList() {
    const tbody = document.getElementById('userListBody');
    if (!tbody) return;
    
    const isViewerUser = App.currentRole === 'user';
    const colHeader = document.getElementById('onyxColHeader');
    if (colHeader) {
      colHeader.style.display = isViewerUser ? 'none' : '';
    }
    
    db.ref('accounts').on('value', (snapshot) => {
      const accounts = snapshot.val() || {};
      const others = Object.keys(accounts).filter(u => u !== App.currentUser && u !== 'systemLog' && u !== 'timeLog');

      if (others.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="empty-msg">Chưa có tài khoản nào khác.</td></tr>`;
        return;
      }

      tbody.innerHTML = others.map(u => {
        const acc = accounts[u];
        const timeStr = acc.role === 'user' ? Utils.formatTime(acc.timeLeft) : '—';
        const timeColor = (acc.role === 'user' && acc.timeLeft <= 60) ? 'color:#fc8181;' : '';
        
        const showOnyx = acc.role === 'user' && !isViewerUser;
        const onyxStr = showOnyx ? (acc.onyx || 0) : '—';
        const onyxColor = showOnyx ? 'color:var(--accent-cyan); font-weight:600;' : 'color:var(--text-muted);';
        
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
          <td>${Utils.escapeHTML(u)}</td>
          <td>${Utils.getRoleBadge(acc.role)}</td>
          <td class="time-cell" id="time-${u}" style="${timeColor}">${timeStr}</td>
          <td style="${onyxColor}">${onyxStr}</td>
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
      const badgeMap = { 'create':'create', 'delete':'delete', 'edit':'edit', 'time':'time', 'password':'pw', 'login':'login', 'recharge_request':'time', 'recharge_completed':'time', 'card_created':'create', 'card_redeemed':'time', 'buy_time':'time', 'game_purchase':'create' };
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

    const accountData = { 
      password: pass, 
      role: role, 
      timeLeft: 0, 
      createdBy: App.currentUser 
    };
    
    if (role === 'user') {
      accountData.onyx = 0;
      accountData.games = {};
    }

    await db.ref('accounts/' + uname).set(accountData);
    await Utils.writeLog('create', `${App.currentUser} đã tạo tài khoản ${uname} (vai trò: ${role})`);
    
    msg.className='form-msg ok'; msg.textContent=`✅ Tạo tài khoản "${Utils.escapeHTML(uname)}" (${role}) thành công!`;
    document.getElementById('newUsername').value = '';
    document.getElementById('newPassword').value = '';
    this.renderTimeTargets();
    restoreBtn();
  },

  async addTime() {
    const btn = document.querySelector('.btn-save');
    if (btn) { if (btn.disabled) return; btn.disabled = true; btn.textContent = 'Đang nạp...'; }
    const restoreBtn = () => { if (btn) { btn.disabled = false; btn.textContent = 'Nạp Thời Gian'; } };

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
    if (id === 'tabCreateCard') Card.renderCardList();
    if (id === 'tabGameSystem') GameSystem.renderGameHistory();
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

// ===== RECHARGE MODULE (Thời gian) =====
const Recharge = {
  async requestRecharge(seconds) {
    if (!App.currentUser) {
      Utils.showError('Vui lòng đăng nhập!');
      return;
    }

    const user = App.currentUser;
    const timeStr = Utils.formatTime(seconds);
    
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

  renderNotifications() {
    const container = document.getElementById('notifyList');
    if (!container) return;

    db.ref('rechargeRequests').orderByChild('timestamp').on('value', (snapshot) => {
      const requests = snapshot.val() || {};
      const entries = Object.entries(requests);

      if (entries.length === 0) {
        container.innerHTML = '<div class="empty-msg">Chưa có yêu cầu nạp thời gian.</div>';
        return;
      }

      entries.sort((a, b) => {
        const statusA = a[1].status || 'pending';
        const statusB = b[1].status || 'pending';
        if (statusA === 'pending' && statusB === 'completed') return -1;
        if (statusA === 'completed' && statusB === 'pending') return 1;
        return (b[1].timestamp || 0) - (a[1].timestamp || 0);
      });

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

      Utils.showError('Đã nạp thời gian thành công!', true);
      
    } catch (e) {
      console.error('Lỗi xử lý nạp:', e);
      Utils.showError('❌ Lỗi xử lý! Vui lòng thử lại.');
    }
  },

  async buyTimeWithOnyx(onyxCost, seconds) {
    if (!App.currentUser) {
      Utils.showError('Vui lòng đăng nhập!');
      return;
    }

    if (App.currentRole !== 'user') {
      Utils.showError('Chức năng này chỉ dành cho người dùng!');
      return;
    }

    const userRef = db.ref('accounts/' + App.currentUser);
    const msgEl = document.getElementById('buyTimeMsg');
    
    try {
      const snap = await userRef.once('value');
      const userData = snap.val();
      
      if (!userData) {
        msgEl.textContent = '❌ Không tìm thấy tài khoản!';
        msgEl.style.color = '#fc8181';
        return;
      }

      const currentOnyx = userData.onyx || 0;
      
      if (currentOnyx < onyxCost) {
        msgEl.textContent = `❌ Bạn không đủ Onyx! Cần ${onyxCost} Onyx, bạn có ${currentOnyx} Onyx.`;
        msgEl.style.color = '#fc8181';
        return;
      }

      const newOnyx = currentOnyx - onyxCost;
      const currentTime = userData.timeLeft || 0;
      const newTime = currentTime + seconds;

      await userRef.update({
        onyx: newOnyx,
        timeLeft: newTime
      });

      const balanceEl = document.getElementById('onyxBalance');
      if (balanceEl) balanceEl.textContent = newOnyx;
      
      const buyBalanceEl = document.getElementById('buyOnyxBalance');
      if (buyBalanceEl) buyBalanceEl.textContent = newOnyx;

      Timer.updateDisplay(newTime);

      const timeStr = Utils.formatTime(seconds);
      msgEl.textContent = `✅ Mua thành công! +${timeStr} thời gian. Đã trừ ${onyxCost} Onyx.`;
      msgEl.style.color = '#68d391';

      await Utils.writeLog('buy_time', `${App.currentUser} đã dùng ${onyxCost} Onyx để mua ${timeStr}`);

      setTimeout(() => {
        msgEl.textContent = '';
      }, 5000);

    } catch (e) {
      console.error('Lỗi mua thời gian:', e);
      msgEl.textContent = '❌ Lỗi hệ thống. Vui lòng thử lại!';
      msgEl.style.color = '#fc8181';
    }
  },

  cleanup() {
    db.ref('rechargeRequests').off();
  }
};

// ===== CARD MODULE (Onyx) =====
const Card = {
  priceMap: {
    5000: 10,
    10000: 20,
    20000: 40,
    50000: 102,
    100000: 204,
    200000: 408,
    500000: 1020
  },

  async createCard() {
    const select = document.getElementById('cardPrice');
    const price = parseInt(select.value);
    const onyx = this.priceMap[price];
    const code = Utils.generateCardCode();

    const checkSnap = await db.ref('cards/' + code).once('value');
    if (checkSnap.exists()) {
      return this.createCard();
    }

    const now = Date.now();
    const expireTime = now + 24 * 60 * 60 * 1000;

    await db.ref('cards/' + code).set({
      code: code,
      value: price,
      onyx: onyx,
      createdBy: App.currentUser,
      createdAt: now,
      expiredAt: expireTime,
      usedBy: null,
      usedAt: null,
      status: 'active'
    });

    await Utils.writeLog('card_created', `${App.currentUser} đã tạo thẻ ${code} - ${Utils.formatNumber(price)}đ`);

    const resultDiv = document.getElementById('createCardResult');
    resultDiv.style.display = 'block';
    document.getElementById('newCardCode').textContent = code;
    document.getElementById('newCardPrice').textContent = Utils.formatNumber(price) + 'đ → ' + onyx + ' Onyx';

    document.getElementById('createCardMsg').textContent = '';
    document.getElementById('createCardMsg').className = '';

    this.renderCardList();
  },

  renderCardList() {
    const container = document.getElementById('cardListContainer');
    if (!container) return;

    db.ref('cards').orderByChild('createdAt').limitToLast(50).on('value', (snapshot) => {
      const cards = snapshot.val() || {};
      const entries = Object.entries(cards);

      if (entries.length === 0) {
        container.innerHTML = '<div class="empty-msg">Chưa có thẻ nào được tạo.</div>';
        return;
      }

      const now = Date.now();
      
      entries.sort((a, b) => {
        const cardA = a[1];
        const cardB = b[1];
        
        const getPriority = (card) => {
          if (card.status === 'used') return 2;
          if (card.expiredAt < now) return 3;
          return 1;
        };
        
        const priorityA = getPriority(cardA);
        const priorityB = getPriority(cardB);
        
        if (priorityA !== priorityB) return priorityA - priorityB;
        return cardB.createdAt - cardA.createdAt;
      });

      container.innerHTML = entries.map(([code, card]) => {
        const isExpired = card.expiredAt < now;
        const statusText = card.status === 'used' ? '✅ Đã dùng' : 
                          isExpired ? '⏰ Hết hạn' : '🟢 Còn hiệu lực';
        const statusColor = card.status === 'used' ? '#68d391' : 
                           isExpired ? '#fc8181' : '#4f6ef7';
        const usedByText = card.usedBy ? ` - Đã dùng bởi ${card.usedBy}` : '';

        return `
          <div class="log-item">
            <span class="log-content">
              <span style="font-family:monospace; font-weight:600; color:var(--accent-cyan);">${code}</span>
              <span style="color:var(--text-muted);">${Utils.formatNumber(card.value)}đ → ${card.onyx} Onyx</span>
              <span style="color:${statusColor}; font-size:0.8rem;">${statusText}</span>
              ${usedByText}
            </span>
            <span class="log-time">${new Date(card.createdAt).toLocaleString('vi-VN')}</span>
          </div>
        `;
      }).join('');
    });
  },

  async redeemCard() {
    const codeInput = document.getElementById('cardCodeInput');
    const msgDiv = document.getElementById('cardRedeemMsg');
    const code = codeInput.value.trim().toUpperCase();

    msgDiv.textContent = '';
    msgDiv.className = '';

    if (!code || code.length !== 16) {
      msgDiv.textContent = '❌ Vui lòng nhập thông tin thẻ chính xác';
      msgDiv.style.color = '#fc8181';
      return;
    }

    try {
      const snap = await db.ref('cards/' + code).once('value');
      const card = snap.val();

      if (!card) {
        msgDiv.textContent = '❌ Vui lòng nhập thông tin thẻ chính xác';
        msgDiv.style.color = '#fc8181';
        return;
      }

      if (card.status === 'used') {
        msgDiv.textContent = '❌ Thẻ đã được nạp';
        msgDiv.style.color = '#fc8181';
        return;
      }

      if (card.expiredAt < Date.now()) {
        msgDiv.textContent = '❌ Thẻ đã hết hạn';
        msgDiv.style.color = '#fc8181';
        return;
      }

      const userRef = db.ref('accounts/' + App.currentUser);
      const userSnap = await userRef.once('value');
      const userData = userSnap.val();

      if (!userData) {
        msgDiv.textContent = '❌ Tài khoản không tồn tại';
        msgDiv.style.color = '#fc8181';
        return;
      }

      const currentOnyx = userData.onyx || 0;
      await userRef.update({ onyx: currentOnyx + card.onyx });

      await db.ref('cards/' + code).update({
        status: 'used',
        usedBy: App.currentUser,
        usedAt: Date.now()
      });

      await Utils.writeLog('card_redeemed', 
        `${App.currentUser} đã nạp thẻ ${code} (+${card.onyx} Onyx)`
      );

      msgDiv.textContent = '✅ Nạp thành công! +' + card.onyx + ' Onyx';
      msgDiv.style.color = '#68d391';
      codeInput.value = '';

      const balanceEl = document.getElementById('onyxBalance');
      if (balanceEl) balanceEl.textContent = currentOnyx + card.onyx;
      
      const buyBalanceEl = document.getElementById('buyOnyxBalance');
      if (buyBalanceEl) buyBalanceEl.textContent = currentOnyx + card.onyx;

      setTimeout(() => {
        Utils.closeModal('rechargeOnyxModal');
      }, 2000);

    } catch (e) {
      console.error('Lỗi nạp thẻ:', e);
      msgDiv.textContent = '❌ Lỗi hệ thống. Vui lòng thử lại!';
      msgDiv.style.color = '#fc8181';
    }
  }
};

// ===== WEREWOLF GAME MODULE =====
const Werewolf = {
  async hasPurchasedGame(username) {
    const snap = await db.ref('accounts/' + username + '/games/werewolf').once('value');
    return snap.val() || false;
  },

  async purchaseGame() {
    if (!App.currentUser) {
      Utils.showError('Vui lòng đăng nhập!');
      return;
    }

    if (App.currentRole !== 'user') {
      Utils.showError('Admin và Owner không cần mua game!');
      return;
    }

    const userRef = db.ref('accounts/' + App.currentUser);
    const snap = await userRef.once('value');
    const userData = snap.val();

    if (!userData) {
      Utils.showError('Không tìm thấy tài khoản!');
      return;
    }

    if (userData.games && userData.games.werewolf) {
      Utils.showError('Bạn đã mua game Ma Sói rồi!');
      return;
    }

    const currentOnyx = userData.onyx || 0;

    if (currentOnyx < 10) {
      Utils.showError('Bạn không đủ Onyx! Cần 10 Onyx để mua game.');
      return;
    }

    const newOnyx = currentOnyx - 10;

    await userRef.update({
      onyx: newOnyx,
      'games/werewolf': true
    });

    const balanceEl = document.getElementById('onyxBalance');
    if (balanceEl) balanceEl.textContent = newOnyx;

    const buyBalanceEl = document.getElementById('buyOnyxBalance');
    if (buyBalanceEl) buyBalanceEl.textContent = newOnyx;

    this.updateGameCardUI(true);

    Utils.showError('✅ Mua game Ma Sói thành công!', true);

    await Utils.writeLog('game_purchase', `${App.currentUser} đã mua game Ma Sói`);
  },

  updateGameCardUI(purchased) {
    const nameEl = document.getElementById('werewolfName');
    const statusEl = document.getElementById('werewolfStatus');
    const cardEl = document.getElementById('werewolfCard');

    if (purchased) {
      if (nameEl) nameEl.textContent = 'Ma Sói';
      if (statusEl) {
        statusEl.textContent = '✅ Đã mua - Click để chơi';
        statusEl.style.color = 'var(--accent-green)';
      }
      if (cardEl) {
        cardEl.style.borderColor = 'rgba(16, 185, 129, 0.5)';
        cardEl.onclick = () => window.location.href = 'games/werewolf.html';
      }
    } else {
      if (nameEl) nameEl.textContent = 'Ma Sói - 10 Onyx';
      if (statusEl) {
        statusEl.textContent = '🔒 Cần 10 Onyx để mở';
        statusEl.style.color = 'var(--text-muted)';
      }
      if (cardEl) {
        cardEl.style.borderColor = 'rgba(255, 100, 100, 0.3)';
        cardEl.onclick = () => handleWerewolfClick();
      }
    }
  },

  async checkGameStatus() {
    if (!App.currentUser) return;

    if (App.currentRole === 'admin' || App.currentRole === 'owner') {
      this.updateGameCardUI(true);
      return;
    }

    const purchased = await this.hasPurchasedGame(App.currentUser);
    this.updateGameCardUI(purchased);
  }
};

// ===== GAME SYSTEM MODULE (CHO OWNER) =====
const GameSystem = {
  renderGameHistory() {
    const container = document.getElementById('gameHistoryList');
    if (!container) return;
    
    db.ref('gameHistory').orderByChild('endedAt').limitToLast(20).on('value', (snapshot) => {
      const games = snapshot.val() || {};
      const entries = Object.entries(games).reverse();
      
      if (entries.length === 0) {
        container.innerHTML = '<div class="empty-msg">Chưa có ván chơi nào.</div>';
        return;
      }
      
      container.innerHTML = entries.map(([key, data]) => {
        const players = Object.entries(data.players || {}).map(([name, role]) => {
          const roleName = getRoleName(role);
          return `${name} - ${roleName}`;
        }).join('<br>');
        
        const winnerText = data.winner === 'werewolves' ? '🐺 Ma Sói' : '👨‍🌾 Dân Làng';
        const winnerColor = data.winner === 'werewolves' ? 'var(--accent-red)' : 'var(--accent-green)';
        const startTime = data.startedAt ? new Date(data.startedAt).toLocaleString('vi-VN') : 'N/A';
        const endTime = data.endedAt ? new Date(data.endedAt).toLocaleString('vi-VN') : 'N/A';
        
        return `
          <div class="log-item" style="flex-direction:column; align-items:flex-start; gap:8px;">
            <div style="display:flex; justify-content:space-between; width:100%; flex-wrap:wrap; gap:8px;">
              <span style="font-weight:700; color:var(--accent-cyan);">${data.lobbyName || 'Ván chơi'}</span>
              <span style="color:${winnerColor};">🏆 ${winnerText}</span>
            </div>
            <div style="font-size:0.85rem; color:var(--text-muted); width:100%;">
              <div><strong>Người chơi (${data.playerCount || 0}):</strong></div>
              <div style="padding-left:12px; font-size:0.8rem; line-height:1.6;">${players}</div>
            </div>
            <div style="display:flex; gap:16px; font-size:0.75rem; color:var(--text-muted); width:100%; flex-wrap:wrap;">
              <span>🟢 Bắt đầu: ${startTime}</span>
              <span>🔴 Kết thúc: ${endTime}</span>
            </div>
          </div>
        `;
      }).join('');
    });
  }
};

function getRoleName(role) {
  const map = {
    'werewolf': 'Ma Sói',
    'seer': 'Tiên Tri',
    'witch': 'Phù Thủy',
    'guard': 'Bảo Vệ',
    'hunter': 'Thợ Săn',
    'villager': 'Dân Làng'
  };
  return map[role] || role;
}

function switchGameSubTab(tab, event) {
  document.querySelectorAll('#tabGameSystem .settings-tabs .tab-btn').forEach(b => b.classList.remove('active'));
  if (event) event.currentTarget.classList.add('active');
  
  document.querySelectorAll('#tabGameSystem .tab-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('gameSubTab' + tab.charAt(0).toUpperCase() + tab.slice(1)).classList.add('active');
}

// ===== HÀM XỬ LÝ CLICK GAME MA SÓI =====
async function handleWerewolfClick() {
  if (!App.currentUser) {
    Utils.showError('Vui lòng đăng nhập!');
    return;
  }

  if (App.currentRole === 'admin' || App.currentRole === 'owner') {
    window.location.href = 'games/werewolf.html';
    return;
  }

  const purchased = await Werewolf.hasPurchasedGame(App.currentUser);
  
  if (purchased) {
    window.location.href = 'games/werewolf.html';
  } else {
    const modal = document.getElementById('buyGameModal');
    if (modal) {
      const snap = await db.ref('accounts/' + App.currentUser + '/onyx').once('value');
      document.getElementById('buyGameBalance').textContent = snap.val() || 0;
      document.getElementById('buyGameMsg').textContent = '';
      modal.classList.add('show');
    }
  }
}

async function confirmBuyGame() {
  await Werewolf.purchaseGame();
  document.getElementById('buyGameMsg').textContent = '✅ Mua thành công! Đang chuyển hướng...';
  document.getElementById('buyGameMsg').style.color = '#68d391';
  
  setTimeout(() => {
    Utils.closeModal('buyGameModal');
    window.location.href = 'games/werewolf.html';
  }, 1500);
}

// ===== FUNCTIONS FOR INLINE HTML =====
function openRechargeModal() {
  const modal = document.getElementById('rechargeOnyxModal');
  if (modal) {
    document.getElementById('rechargeUser').value = App.currentUser || '';
    document.getElementById('cardCodeInput').value = '';
    document.getElementById('cardRedeemMsg').textContent = '';
    document.getElementById('cardRedeemMsg').className = '';
    modal.classList.add('show');
  }
}

function redeemCard() {
  Card.redeemCard();
}

function createCard() {
  Card.createCard();
}

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
window.openRechargeModal = openRechargeModal;
window.redeemCard = redeemCard;
window.createCard = createCard;
window.buyTimeWithOnyx = (onyxCost, seconds) => Recharge.buyTimeWithOnyx(onyxCost, seconds);
window.handleWerewolfClick = handleWerewolfClick;
window.confirmBuyGame = confirmBuyGame;
window.Werewolf = Werewolf;
window.GameSystem = GameSystem;
window.switchGameSubTab = switchGameSubTab;

// ===== BOOTSTRAP =====
document.addEventListener('DOMContentLoaded', () => App.init());
