/* ============================================
   OCIO Financial Markets — Main Script
   All pages: Home, Markets, About, Contact,
   Login, Register, Dashboard
   ============================================ */

'use strict';

/* ---------- Config ---------- */
const CONFIG = {
  COINGECKO_API: 'https://api.coingecko.com/api/v3',
  TICKER_COINS:  ['bitcoin','ethereum','binancecoin','solana','ripple','cardano','dogecoin','polkadot'],
  REFRESH_MS:    30000
};

/* ---------- State ---------- */
let marketData   = [];
let tickerTimer  = null;

/* ============================================
   TICKER
   ============================================ */
const FALLBACK_TICKER = [
  { symbol: 'BTC',  name: 'Bitcoin',  price: 68420.50, change: 2.41 },
  { symbol: 'ETH',  name: 'Ethereum', price: 3821.30,  change: 1.82 },
  { symbol: 'BNB',  name: 'BNB',      price: 605.10,   change: -0.54 },
  { symbol: 'SOL',  name: 'Solana',   price: 178.40,   change: 4.12 },
  { symbol: 'XRP',  name: 'Ripple',   price: 0.5830,   change: -1.20 },
  { symbol: 'ADA',  name: 'Cardano',  price: 0.4510,   change: 0.87 },
  { symbol: 'DOGE', name: 'Dogecoin', price: 0.1620,   change: 3.30 },
  { symbol: 'DOT',  name: 'Polkadot', price: 8.920,    change: -0.44 },
  { symbol: 'XAU',  name: 'Gold',     price: 2341.00,  change: 0.61 },
  { symbol: 'XAG',  name: 'Silver',   price: 28.14,    change: -0.23 }
];

const FALLBACK_MARKETS = [
  { id:'bitcoin', symbol:'BTC', name:'Bitcoin', price:68420.50, change:2.41, mcap:1340000000000, vol:28500000000, type:'crypto' },
  { id:'ethereum', symbol:'ETH', name:'Ethereum', price:3821.30, change:1.82, mcap:460000000000, vol:15200000000, type:'crypto' },
  { id:'binancecoin', symbol:'BNB', name:'BNB', price:605.10, change:-0.54, mcap:89000000000, vol:1800000000, type:'crypto' },
  { id:'solana', symbol:'SOL', name:'Solana', price:178.40, change:4.12, mcap:78000000000, vol:3200000000, type:'crypto' },
  { id:'ripple', symbol:'XRP', name:'Ripple', price:0.5830, change:-1.20, mcap:32000000000, vol:1400000000, type:'crypto' },
  { id:'cardano', symbol:'ADA', name:'Cardano', price:0.4510, change:0.87, mcap:16000000000, vol:520000000, type:'crypto' },
  { id:'dogecoin', symbol:'DOGE', name:'Dogecoin', price:0.1620, change:3.30, mcap:23000000000, vol:1100000000, type:'crypto' },
  { id:'polkadot', symbol:'DOT', name:'Polkadot', price:8.920, change:-0.44, mcap:12500000000, vol:340000000, type:'crypto' },
  { id:'gold', symbol:'XAU', name:'Gold', price:2341.00, change:0.61, mcap:null, vol:null, type:'metal' },
  { id:'silver', symbol:'XAG', name:'Silver', price:28.14, change:-0.23, mcap:null, vol:null, type:'metal' },
  { id:'platinum', symbol:'XPT', name:'Platinum', price:1012.50, change:0.35, mcap:null, vol:null, type:'metal' },
  { id:'apple', symbol:'AAPL', name:'Apple Inc.', price:189.84, change:1.15, mcap:2940000000000, vol:52000000, type:'stock' },
  { id:'microsoft', symbol:'MSFT', name:'Microsoft', price:417.50, change:0.72, mcap:3100000000000, vol:21000000, type:'stock' },
  { id:'tesla', symbol:'TSLA', name:'Tesla Inc.', price:248.30, change:-1.80, mcap:790000000000, vol:98000000, type:'stock' }
];

async function fetchTickerData() {
  try {
    const ids = CONFIG.TICKER_COINS.join(',');
    const url = `${CONFIG.COINGECKO_API}/coins/markets?vs_currency=usd&ids=${ids}&order=market_cap_desc&per_page=10&page=1&sparkline=false&price_change_percentage=24h`;
    const res  = await fetch(url);
    if (!res.ok) throw new Error('API error');
    const data = await res.json();
    marketData = data;
    return data.map(c => ({
      symbol: c.symbol.toUpperCase(),
      name:   c.name,
      price:  c.current_price,
      change: c.price_change_percentage_24h ?? 0
    }));
  } catch {
    return FALLBACK_TICKER;
  }
}

function renderTicker(coins) {
  const container = document.getElementById('ticker-items');
  if (!container) return;
  const items = [...coins, ...coins];
  container.innerHTML = items.map(c => {
    const up    = c.change >= 0;
    const arrow = up ? '▲' : '▼';
    const cls   = up ? 'ticker-up' : 'ticker-down';
    const fmt   = formatPrice(c.price);
    const pct   = Math.abs(c.change).toFixed(2);
    return `<span class="ticker-item">
        <span class="ticker-symbol">${c.symbol}</span>
        <span class="ticker-price">${fmt}</span>
        <span class="${cls}">${arrow} ${pct}%</span>
      </span>`;
  }).join('');
}

async function initTicker() {
  const coins = await fetchTickerData();
  renderTicker(coins);
  updateHeroPrices(coins);
  clearInterval(tickerTimer);
  tickerTimer = setInterval(async () => {
    const fresh = await fetchTickerData();
    renderTicker(fresh);
    updateHeroPrices(fresh);
  }, CONFIG.REFRESH_MS);
}

function updateHeroPrices(coins) {
  const btc = coins.find(c => c.symbol === 'BTC');
  const eth = coins.find(c => c.symbol === 'ETH');
  const btcEl = document.getElementById('btc-price');
  const ethEl = document.getElementById('eth-price');
  if (btcEl && btc) btcEl.textContent = formatPrice(btc.price);
  if (ethEl && eth) ethEl.textContent = formatPrice(eth.price);
}

/* ============================================
   HEADER
   ============================================ */
function initHeader() {
  const header = document.getElementById('site-header');
  if (!header) return;
  const onScroll = () => { header.classList.toggle('scrolled', window.scrollY > 8); };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

/* ============================================
   MOBILE MENU
   ============================================ */
function initMobileMenu() {
  const hamburger = document.getElementById('hamburger');
  const overlay   = document.getElementById('mobile-overlay');
  if (!hamburger || !overlay) return;
  const toggle = (force) => {
    const open = force !== undefined ? force : !hamburger.classList.contains('open');
    hamburger.classList.toggle('open', open);
    hamburger.setAttribute('aria-expanded', String(open));
    overlay.classList.toggle('open', open);
    overlay.setAttribute('aria-hidden', String(!open));
    document.body.style.overflow = open ? 'hidden' : '';
  };
  hamburger.addEventListener('click', () => toggle());
  overlay.querySelectorAll('a').forEach(a => { a.addEventListener('click', () => toggle(false)); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') toggle(false); });
  overlay.addEventListener('click', e => { if (e.target === overlay) toggle(false); });
}

/* ============================================
   SCROLL ANIMATIONS
   ============================================ */
function initScrollAnimations() {
  const items = document.querySelectorAll('[data-animate]');
  if (!items.length) return;
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      const delay = parseInt(el.dataset.delay ?? 0, 10);
      setTimeout(() => { el.classList.add('visible'); }, delay);
      observer.unobserve(el);
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
  items.forEach(el => observer.observe(el));
}

/* ============================================
   WHATSAPP BUTTON
   ============================================ */
function initWhatsApp() {
  const fab = document.getElementById('whatsapp-fab');
  if (!fab) return;
  fab.addEventListener('click', () => {
    const msg = encodeURIComponent('Hello, I\'m interested in OCIO Financial Markets. Could you help me?');
    window.open(`https://wa.me/?text=${msg}`, '_blank', 'noopener,noreferrer');
  });
}

/* ============================================
   ACTIVE NAV LINK
   ============================================ */
function initActiveNav() {
  const page  = window.location.pathname.split('/').pop() || 'index.html';
  const links = document.querySelectorAll('.nav-link');
  links.forEach(link => {
    const href = link.getAttribute('href') || '';
    const isActive = href === page || (page === '' && href === 'index.html');
    link.classList.toggle('active', isActive);
  });
}

/* ============================================
   CARD TILT
   ============================================ */
function initCardTilt() {
  const cards = document.querySelectorAll('.feature-card, .step-card');
  cards.forEach(card => {
    card.addEventListener('mousemove', e => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left - rect.width / 2;
      const y = e.clientY - rect.top - rect.height / 2;
      const maxTilt = 4;
      const tiltX = -(y / (rect.height / 2)) * maxTilt;
      const tiltY = (x / (rect.width / 2)) * maxTilt;
      card.style.transform = `translateY(-4px) rotateX(${tiltX}deg) rotateY(${tiltY}deg)`;
    });
    card.addEventListener('mouseleave', () => { card.style.transform = ''; });
  });
}

/* ============================================
   COUNTER ANIMATION
   ============================================ */
function animateCounter(el, target, duration = 1800) {
  const isDecimal = String(target).includes('.');
  const decimals  = isDecimal ? 1 : 0;
  const start     = performance.now();
  const step = (now) => {
    const elapsed = Math.min((now - start) / duration, 1);
    const eased   = 1 - Math.pow(1 - elapsed, 3);
    const current = eased * target;
    el.textContent = formatStatNumber(current, decimals, el.dataset.suffix ?? '');
    if (elapsed < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function initCounters() {
  const stats = document.querySelectorAll('.stat-number');
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      const raw = el.textContent.replace(/[^0-9.]/g, '');
      const val = parseFloat(raw);
      if (!isNaN(val)) animateCounter(el, val);
      observer.unobserve(el);
    });
  }, { threshold: 0.5 });
  stats.forEach(el => observer.observe(el));
}

/* ============================================
   AUTH HELPERS (localStorage-based demo)
   ============================================ */
const ADMIN_CREDS = { username: 'admin', password: 'Ocio@2024' };

function getAllUsers() {
  try { return JSON.parse(localStorage.getItem('ocio_users')) || []; }
  catch { return []; }
}

function saveAllUsers(users) {
  localStorage.setItem('ocio_users', JSON.stringify(users));
}

function addUserToList(user) {
  const users = getAllUsers();
  const exists = users.find(u => u.email === user.email);
  if (exists) {
    Object.assign(exists, user);
  } else {
    user.balance = user.balance ?? 0;
    user.joined = user.joined || new Date().toLocaleDateString();
    users.push(user);
  }
  saveAllUsers(users);
}

function getUserBalance(email) {
  const users = getAllUsers();
  const u = users.find(u => u.email === email);
  return u ? (u.balance || 0) : 0;
}

function saveUser(user) {
  localStorage.setItem('ocio_user', JSON.stringify(user));
  localStorage.setItem('ocio_logged_in', 'true');
  addUserToList(user);
}

function getUser() {
  try { return JSON.parse(localStorage.getItem('ocio_user')); }
  catch { return null; }
}

function isLoggedIn() {
  return localStorage.getItem('ocio_logged_in') === 'true';
}

function logout() {
  localStorage.removeItem('ocio_logged_in');
  window.location.href = 'login.html';
}

function requireAuth() {
  if (!isLoggedIn()) { window.location.href = 'login.html'; return false; }
  return true;
}

/* ============================================
   AVATAR DISPLAY HELPER
   ============================================ */
function updateAvatarDisplay() {
  if (document.getElementById('admin-login-screen') || document.getElementById('admin-dashboard')) {
    // If on admin panel, do not overwrite with client avatar
    const adminAvatar = document.querySelector('.dash-avatar');
    if (adminAvatar) {
      adminAvatar.innerHTML = `<span id="avatar-initials" style="font-weight:700;">AD</span>`;
    }
    return;
  }
  const user = getUser();
  if (!user) return;
  const avatars = document.querySelectorAll('.dash-avatar');
  avatars.forEach(av => {
    if (av.closest('.admin-tab')) return; // skip avatars inside admin tables
    if (user.profilePic) {
      av.innerHTML = `<img src="${user.profilePic}" alt="Avatar" />`;
    } else {
      const parts = user.name.split(' ');
      const initials = parts.map(p => p[0]).join('').toUpperCase().slice(0, 2) || 'U';
      av.innerHTML = `<span id="avatar-initials" style="font-weight:700;">${initials}</span>`;
    }
  });
}

function getUserAvatarHtml(name, email) {
  const allUsers = getAllUsers();
  const u = allUsers.find(usr => usr.email === email);
  if (u && u.profilePic) {
    return `<div class="dash-avatar" style="width:32px; height:32px; font-size:0.8rem; margin:0;"><img src="${u.profilePic}" alt="Avatar" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;" /></div>`;
  } else {
    const parts = (name || '').split(' ');
    const initials = parts.map(p => p[0]).join('').toUpperCase().slice(0, 2) || 'U';
    return `<div class="dash-avatar" style="width:32px; height:32px; font-size:0.8rem; margin:0; display:flex; align-items:center; justify-content:center; border-radius:50%; background:var(--blue-50); color:var(--blue-600);"><span style="font-weight:700;">${initials}</span></div>`;
  }
}

/* ============================================
   LOGIN PAGE
   ============================================ */
function initLogin() {
  const form = document.getElementById('login-form');
  if (!form) return;

  // Toggle password visibility
  form.querySelectorAll('.toggle-pw').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = btn.parentElement.querySelector('input');
      const isPassword = input.type === 'password';
      input.type = isPassword ? 'text' : 'password';
      btn.querySelector('i').className = isPassword ? 'fas fa-eye-slash' : 'fas fa-eye';
    });
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const errorEl = document.getElementById('login-error');

    if (!email || !password) {
      showError(errorEl, 'Please fill in all fields.');
      return;
    }
    if (!isValidEmail(email)) {
      showError(errorEl, 'Please enter a valid email address.');
      return;
    }

    // Check stored user
    const allUsers = getAllUsers();
    const existingUser = allUsers.find(u => u.email === email);

    if (existingUser) {
      if (existingUser.password !== password) {
        showError(errorEl, 'Invalid email or password.');
        return;
      }
      // Log in existing user
      saveUser(existingUser);
    } else {
      // Auto-create for new devices
      const name = email.split('@')[0];
      saveUser({ name, email, password, balance: 0 });
    }
    
    window.location.href = 'dashboard.html';
  });
}

/* ============================================
   REGISTER PAGE
   ============================================ */
function initRegister() {
  const form = document.getElementById('register-form');
  if (!form) return;

  // Toggle password visibility
  form.querySelectorAll('.toggle-pw').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = btn.parentElement.querySelector('input');
      const isPassword = input.type === 'password';
      input.type = isPassword ? 'text' : 'password';
      btn.querySelector('i').className = isPassword ? 'fas fa-eye-slash' : 'fas fa-eye';
    });
  });

  // Password strength
  const pwInput = document.getElementById('reg-password');
  const pwBar = document.querySelector('.pw-bar');
  if (pwInput && pwBar) {
    pwInput.addEventListener('input', () => {
      const val = pwInput.value;
      let strength = 0;
      if (val.length >= 8) strength++;
      if (/[A-Z]/.test(val)) strength++;
      if (/[0-9]/.test(val)) strength++;
      if (/[^A-Za-z0-9]/.test(val)) strength++;
      const pct = (strength / 4) * 100;
      const colors = ['#ef4444', '#f59e0b', '#3b82f6', '#22c55e'];
      pwBar.style.width = pct + '%';
      pwBar.style.background = colors[strength - 1] || '#e2e8f0';
    });
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('reg-name').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const confirm = document.getElementById('reg-confirm').value;
    const terms = document.getElementById('agree-terms').checked;
    const errorEl = document.getElementById('register-error');

    if (!name || !email || !password || !confirm) {
      showError(errorEl, 'Please fill in all fields.');
      return;
    }
    if (!isValidEmail(email)) {
      showError(errorEl, 'Please enter a valid email address.');
      return;
    }
    if (password.length < 8) {
      showError(errorEl, 'Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      showError(errorEl, 'Passwords do not match.');
      return;
    }
    if (!terms) {
      showError(errorEl, 'You must agree to the Terms of Service.');
      return;
    }

    const allUsers = getAllUsers();
    if (allUsers.find(u => u.email === email)) {
      showError(errorEl, 'An account with this email already exists.');
      return;
    }

    saveUser({ name, email, password, balance: 0 });
    window.location.href = 'dashboard.html';
  });
}

function initDashboard() {
  const dashBody = document.querySelector('.dashboard-body');
  if (!dashBody) return;
  // Skip if on withdraw or deposit page
  if (document.getElementById('wd-bank-form') || document.getElementById('dep-balance')) return;

  if (!requireAuth()) return;

  const user = getUser();
  if (!user) return;

  // Populate user info
  const nameEl = document.getElementById('dash-user-name');
  const greetingEl = document.getElementById('dash-greeting');

  if (nameEl) nameEl.textContent = user.name;
  if (greetingEl) {
    const hour = new Date().getHours();
    let greeting = 'Good evening';
    if (hour < 12) greeting = 'Good morning';
    else if (hour < 18) greeting = 'Good afternoon';
    greetingEl.textContent = `${greeting}, ${user.name.split(' ')[0]}!`;
  }

  // Get real balance
  const bal = getUserBalance(user.email);
  const fmtBal = '$' + bal.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});

  // Balance display
  const balEl = document.getElementById('stat-balance');
  if (balEl) balEl.textContent = fmtBal;

  const fundedSection = document.getElementById('dash-funded-section');
  const emptySection = document.getElementById('dash-empty-section');
  const pnlEl = document.getElementById('stat-pnl');
  const pnlBadge = document.getElementById('stat-pnl-badge');
  const assetsEl = document.getElementById('stat-assets');
  const balBadge = document.getElementById('stat-balance-badge');
  const tierEl = document.getElementById('stat-tier');

  if (bal > 0) {
    // FUNDED STATE
    if (fundedSection) fundedSection.style.display = 'block';
    if (emptySection) emptySection.style.display = 'none';

    // P&L
    const pnl = bal * 0.005;
    if (pnlEl) { pnlEl.textContent = '+$' + pnl.toLocaleString('en-US',{minimumFractionDigits:2, maximumFractionDigits:2}); pnlEl.classList.add('positive'); }
    if (pnlBadge) { pnlBadge.className = 'dash-stat-badge positive'; pnlBadge.innerHTML = '<i class="fas fa-arrow-up"></i> +0.5%'; }

    // Assets
    if (assetsEl) assetsEl.textContent = '4';
    const assetsBadge = document.getElementById('stat-assets-badge');
    if (assetsBadge) { assetsBadge.textContent = 'Active'; }

    // Balance badge
    if (balBadge) { balBadge.className = 'dash-stat-badge positive'; balBadge.innerHTML = '<i class="fas fa-arrow-trend-up"></i> +4.2%'; }

    // Tier
    if (tierEl) tierEl.textContent = bal >= 100000 ? 'Gold' : bal >= 10000 ? 'Silver' : 'Standard';

    // Populate holdings dynamically based on balance
    const holdingsList = document.getElementById('dash-holdings-list');
    if (holdingsList) {
      const btcVal = bal * 0.45;
      const ethVal = bal * 0.25;
      const goldVal = bal * 0.18;
      const solVal = bal * 0.12;
      holdingsList.innerHTML = `
        <div class="dash-holding-row"><div class="asset-info"><div class="asset-icon bitcoin"><i class="fab fa-bitcoin"></i></div><div><div class="asset-name">Bitcoin</div><div class="asset-amount">${(btcVal/68420).toFixed(4)} BTC</div></div></div><div class="asset-price-col"><div class="asset-price">$${btcVal.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</div><div class="asset-change positive">+2.4%</div></div></div>
        <div class="dash-holding-row"><div class="asset-info"><div class="asset-icon ethereum"><i class="fab fa-ethereum"></i></div><div><div class="asset-name">Ethereum</div><div class="asset-amount">${(ethVal/3821).toFixed(4)} ETH</div></div></div><div class="asset-price-col"><div class="asset-price">$${ethVal.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</div><div class="asset-change positive">+1.8%</div></div></div>
        <div class="dash-holding-row"><div class="asset-info"><div class="asset-icon gold"><i class="fas fa-coins"></i></div><div><div class="asset-name">Gold</div><div class="asset-amount">${(goldVal/2341).toFixed(2)} oz</div></div></div><div class="asset-price-col"><div class="asset-price">$${goldVal.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</div><div class="asset-change positive">+0.6%</div></div></div>
        <div class="dash-holding-row"><div class="asset-info"><div class="asset-icon solana"><i class="fas fa-bolt"></i></div><div><div class="asset-name">Solana</div><div class="asset-amount">${(solVal/178).toFixed(2)} SOL</div></div></div><div class="asset-price-col"><div class="asset-price">$${solVal.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</div><div class="asset-change positive">+5.2%</div></div></div>`;
    }
  } else {
    // EMPTY STATE ($0 balance)
    if (fundedSection) fundedSection.style.display = 'none';
    if (emptySection) emptySection.style.display = 'block';
    if (pnlEl) { pnlEl.textContent = '$0.00'; pnlEl.classList.remove('positive'); }
    if (pnlBadge) { pnlBadge.className = 'dash-stat-badge neutral'; pnlBadge.textContent = '—'; }
    if (assetsEl) assetsEl.textContent = '0';
    if (balBadge) { balBadge.className = 'dash-stat-badge neutral'; balBadge.textContent = '—'; }
    if (tierEl) tierEl.textContent = 'Standard';
  }

  // Populate recent transactions dynamically
  const txList = document.getElementById('dash-transactions-list');
  if (txList) {
    let deposits = [];
    let withdrawals = [];
    try { deposits = JSON.parse(localStorage.getItem('ocio_deposits')) || []; } catch {}
    try { withdrawals = JSON.parse(localStorage.getItem('ocio_withdrawals')) || []; } catch {}
    const userDeps = deposits.filter(d => d.email === user.email);
    const userWds = withdrawals.filter(w => w.email === user.email);
    const allTxs = [
      ...userDeps.map(d => ({
        type: 'Deposit',
        title: d.method === 'Direct Credit' ? 'Direct Credit' : `${d.method} Deposit`,
        amount: d.amount,
        date: d.date,
        status: d.status || 'Pending',
        timestamp: new Date(d.date).getTime() || 0,
        isPositive: true
      })),
      ...userWds.map(w => ({
        type: 'Withdrawal',
        title: `Withdrawal (${w.bank})`,
        amount: parseFloat(w.amount),
        date: w.date,
        status: w.status || 'Pending',
        timestamp: new Date(w.date).getTime() || 0,
        isPositive: false
      }))
    ];
    allTxs.sort((a, b) => b.timestamp - a.timestamp);
    
    if (allTxs.length === 0) {
      txList.innerHTML = `<div style="text-align:center; padding:1.5rem; color:var(--gray-400); font-size:0.9rem;">No recent transactions.</div>`;
    } else {
      txList.innerHTML = allTxs.slice(0, 5).map(tx => {
        const amtSign = tx.isPositive ? '+' : '-';
        const amtClass = tx.isPositive ? 'positive' : 'negative';
        const iconType = tx.isPositive ? 'deposit' : 'withdrawal';
        const icon = tx.isPositive ? 'plus' : 'minus';
        const isPending = tx.status === 'Pending';
        const pendingBadge = isPending ? ' <span style="font-size:0.7rem; background:#fef3c7; color:#d97706; padding:1px 6px; border-radius:100px; font-weight:700;">Pending</span>' : '';
        
        return `<div class="dash-tx-row">
          <div class="dash-tx-icon ${iconType}"><i class="fas fa-${icon}"></i></div>
          <div class="dash-tx-info">
            <div class="dash-tx-title">${tx.title}${pendingBadge}</div>
            <div class="dash-tx-date">${tx.date}</div>
          </div>
          <div class="dash-tx-amount ${amtClass}">${amtSign}$${tx.amount.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})}</div>
        </div>`;
      }).join('');
    }
  }

  // Sidebar toggle (mobile)
  const menuBtn = document.getElementById('dash-menu-btn');
  const sidebar = document.getElementById('dash-sidebar');
  const overlay = document.getElementById('dash-overlay');

  if (menuBtn && sidebar && overlay) {
    const toggleSidebar = (open) => {
      sidebar.classList.toggle('open', open);
      overlay.classList.toggle('open', open);
    };
    menuBtn.addEventListener('click', () => toggleSidebar(true));
    overlay.addEventListener('click', () => toggleSidebar(false));
  }

  // Logout
  const logoutBtn = document.getElementById('dash-logout');
  if (logoutBtn) logoutBtn.addEventListener('click', logout);

  // Handle Dashboard Tabs
  function showTab(tabName) {
    document.querySelectorAll('.dash-view').forEach(v => {
      v.style.display = 'none';
    });
    document.querySelectorAll('.dash-sidebar .dash-nav-item').forEach(item => {
      item.classList.remove('active');
    });

    const targetView = document.getElementById('view-' + tabName);
    const targetNav = document.getElementById('nav-' + tabName);

    if (targetView) targetView.style.display = 'block';
    if (targetNav) targetNav.classList.add('active');

    if (tabName === 'transactions') {
      renderDashboardTransactions();
    } else if (tabName === 'settings') {
      populateSettingsForm();
    }
  }

  // Parse URL tab parameter
  const urlParams = new URLSearchParams(window.location.search);
  const activeTab = urlParams.get('tab') || 'portfolio';
  showTab(activeTab);

  // Bind sidebar nav clicks
  ['portfolio', 'transactions', 'settings'].forEach(tab => {
    const navBtn = document.getElementById('nav-' + tab);
    if (navBtn) {
      navBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname + '?tab=' + tab;
        window.history.pushState({ path: newUrl }, '', newUrl);
        showTab(tab);
      });
    }
  });

  // Settings form submission
  const settingsForm = document.getElementById('settings-info-form');
  if (settingsForm) {
    settingsForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const updatedUser = getUser();
      if (!updatedUser) return;
      const newName = document.getElementById('settings-name').value.trim();
      const successEl = document.getElementById('settings-success');

      if (!newName) return;

      updatedUser.name = newName;
      localStorage.setItem('ocio_user', JSON.stringify(updatedUser));

      const allUsers = getAllUsers();
      const match = allUsers.find(u => u.email === updatedUser.email);
      if (match) {
        match.name = newName;
        saveAllUsers(allUsers);
      }

      if (nameEl) nameEl.textContent = newName;
      const greetingEl = document.getElementById('dash-greeting');
      if (greetingEl) {
        const hour = new Date().getHours();
        let greeting = 'Good evening';
        if (hour < 12) greeting = 'Good morning';
        else if (hour < 18) greeting = 'Good afternoon';
        greetingEl.textContent = `${greeting}, ${newName.split(' ')[0]}!`;
      }

      updateAvatarDisplay();

      if (successEl) {
        successEl.hidden = false;
        setTimeout(() => { successEl.hidden = true; }, 4000);
      }
    });
  }

  // Profile Picture Upload
  const profileUploadArea = document.getElementById('profile-upload-area');
  const profilePicFile = document.getElementById('profile-pic-file');
  if (profileUploadArea && profilePicFile) {
    profileUploadArea.addEventListener('click', () => profilePicFile.click());
    profilePicFile.addEventListener('change', () => {
      const file = profilePicFile.files[0];
      if (file) {
        if (!file.type.startsWith('image/')) {
          alert('Please select an image file.');
          return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
          const u = getUser();
          if (!u) return;
          const base64Img = e.target.result;
          u.profilePic = base64Img;
          localStorage.setItem('ocio_user', JSON.stringify(u));

          const allUsers = getAllUsers();
          const match = allUsers.find(usr => usr.email === u.email);
          if (match) {
            match.profilePic = base64Img;
            saveAllUsers(allUsers);
          }

          updateAvatarDisplay();
          populateSettingsForm();
        };
        reader.readAsDataURL(file);
      }
    });
  }
}

/* ---------- Dashboard Transactions Render ---------- */
function renderDashboardTransactions() {
  const tbody = document.getElementById('dash-transactions-tbody');
  const noTx = document.getElementById('dash-no-transactions');
  if (!tbody) return;

  const user = getUser();
  if (!user) return;

  let deposits = [];
  let withdrawals = [];
  try { deposits = JSON.parse(localStorage.getItem('ocio_deposits')) || []; } catch {}
  try { withdrawals = JSON.parse(localStorage.getItem('ocio_withdrawals')) || []; } catch {}

  const userDeps = deposits.filter(d => d.email === user.email);
  const userWds = withdrawals.filter(w => w.email === user.email);

  const allTxs = [
    ...userDeps.map(d => ({
      type: 'Deposit',
      detail: d.method === 'Direct Credit' ? 'Admin Direct Credit' : `${d.method} Deposit`,
      amount: d.amount,
      status: d.status || 'Pending',
      date: d.date,
      timestamp: new Date(d.date).getTime() || 0,
      isPositive: true
    })),
    ...userWds.map(w => ({
      type: 'Withdrawal',
      detail: `${w.bank} (Acct *${w.account.slice(-4)})`,
      amount: parseFloat(w.amount),
      status: w.status || 'Pending',
      date: w.date,
      timestamp: new Date(w.date).getTime() || 0,
      isPositive: false
    }))
  ];

  allTxs.sort((a, b) => b.timestamp - a.timestamp);

  if (allTxs.length === 0) {
    tbody.innerHTML = '';
    if (noTx) noTx.style.display = 'block';
    return;
  }

  if (noTx) noTx.style.display = 'none';

  tbody.innerHTML = allTxs.map(tx => {
    const isApp = tx.status === 'Approved';
    const isRej = tx.status === 'Rejected';
    const statusClass = isApp ? 'approved' : (isRej ? 'rejected' : 'pending');
    
    const amtSign = tx.isPositive ? '+' : '-';
    const amtClass = tx.isPositive ? 'positive' : 'negative';
    const typeIcon = tx.isPositive ? 'fa-plus' : 'fa-minus';
    const typeClass = tx.isPositive ? 'deposit' : 'withdrawal';

    return `<tr>
      <td>
        <div style="display:flex; align-items:center; gap:0.5rem;">
          <div class="dash-tx-icon ${typeClass}" style="width:28px; height:28px; font-size:0.75rem; margin-right:0;"><i class="fas ${typeIcon}"></i></div>
          <span style="font-weight:600;">${tx.type}</span>
        </div>
      </td>
      <td>${tx.detail}</td>
      <td class="${amtClass}" style="font-weight:700; font-family:'Outfit',sans-serif;">${amtSign}$${tx.amount.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})}</td>
      <td><span class="admin-badge-status ${statusClass}" style="padding: 2px 8px; font-size: 0.7rem;">${tx.status}</span></td>
      <td style="color:var(--gray-500); font-size:0.85rem;">${tx.date}</td>
    </tr>`;
  }).join('');
}

/* ---------- Populate Settings Helper ---------- */
function populateSettingsForm() {
  const user = getUser();
  if (!user) return;
  const nameInput = document.getElementById('settings-name');
  const emailInput = document.getElementById('settings-email');
  if (nameInput) nameInput.value = user.name;
  if (emailInput) emailInput.value = user.email;

  const previewAvatar = document.getElementById('settings-avatar-preview');
  if (previewAvatar) {
    if (user.profilePic) {
      previewAvatar.innerHTML = `<img src="${user.profilePic}" alt="Avatar" />`;
    } else {
      const parts = user.name.split(' ');
      const initials = parts.map(p => p[0]).join('').toUpperCase().slice(0, 2) || 'U';
      previewAvatar.innerHTML = `<span id="settings-avatar-initials" style="font-weight:700;">${initials}</span>`;
    }
  }
}

/* ============================================
   DEPOSIT PAGE
   ============================================ */
function initDeposit() {
  const depBal = document.getElementById('dep-balance');
  if (!depBal) return;
  if (!requireAuth()) return;

  const user = getUser();
  if (user) {
    const nameEl = document.getElementById('dash-user-name');
    const avatarEl = document.getElementById('avatar-initials');
    if (nameEl) nameEl.textContent = user.name;
    if (avatarEl) {
      const parts = user.name.split(' ');
      avatarEl.textContent = parts.map(p => p[0]).join('').toUpperCase().slice(0, 2) || 'U';
    }
    const bal = getUserBalance(user.email);
    depBal.textContent = '$' + bal.toLocaleString('en-US', {minimumFractionDigits:2});
    const refEl = document.getElementById('dep-ref-code');
    if (refEl) refEl.textContent = 'OCIO-' + user.email.split('@')[0].toUpperCase();
  }

  // Sidebar mobile
  const menuBtn = document.getElementById('dash-menu-btn');
  const sidebar = document.getElementById('dash-sidebar');
  const overlay = document.getElementById('dash-overlay');
  if (menuBtn && sidebar && overlay) {
    menuBtn.addEventListener('click', () => { sidebar.classList.toggle('open'); overlay.classList.toggle('open'); });
    overlay.addEventListener('click', () => { sidebar.classList.remove('open'); overlay.classList.remove('open'); });
  }
  const logoutBtn = document.getElementById('dash-logout');
  if (logoutBtn) logoutBtn.addEventListener('click', logout);

  // Crypto coin switcher (Loads dynamic wallet addresses configured by Admin)
  const cryptoCoin = document.getElementById('dep-crypto-coin');
  const cryptoAddr = document.getElementById('dep-crypto-addr');
  if (cryptoCoin && cryptoAddr) {
    function updateCryptoAddress() {
      let addrs = {
        btc: 'bc1qxn75r74yxn506avewznvleyg80epcvmaduunpv',
        eth: '0xACBb8780B0eA4aDb9c87e7E9cc80b8D17d5F6060',
        sol: 'DSkxE7spkNuX26EwWHiGuPpq8eZXzFTzpFGxFbckHavi',
        usdt: '0xACBb8780B0eA4aDb9c87e7E9cc80b8D17d5F6060',
        bnb: '0xACBb8780B0eA4aDb9c87e7E9cc80b8D17d5F606'
      };
      try {
        const saved = JSON.parse(localStorage.getItem('ocio_wallet_addresses'));
        if (saved) addrs = { ...addrs, ...saved };
      } catch {}
      
      const selected = cryptoCoin.value;
      if (selected.includes('BTC') || selected.includes('Bitcoin')) {
        cryptoAddr.textContent = addrs.btc;
      } else if (selected.includes('ETH') || selected.includes('Ethereum')) {
        cryptoAddr.textContent = addrs.eth;
      } else if (selected.includes('SOL') || selected.includes('Solana')) {
        cryptoAddr.textContent = addrs.sol;
      } else if (selected.includes('USDT') || selected.includes('Tether')) {
        cryptoAddr.textContent = addrs.usdt;
      } else if (selected.includes('BNB') || selected.includes('Binance')) {
        cryptoAddr.textContent = addrs.bnb;
      }
    }
    
    cryptoCoin.addEventListener('change', updateCryptoAddress);
    updateCryptoAddress(); // Initialize on boot
  }

  // Card deposit form
  const cardForm = document.getElementById('dep-card-form');
  if (cardForm) {
    cardForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const amount = parseFloat(document.getElementById('dep-card-amount').value);
      const sucEl = document.getElementById('dep-card-success');
      
      if (user && amount > 0) {
        let deps = [];
        try { deps = JSON.parse(localStorage.getItem('ocio_deposits')) || []; } catch {}
        deps.push({
          email: user.email,
          name: user.name,
          method: 'Card',
          amount: amount,
          status: 'Pending',
          date: new Date().toLocaleDateString()
        });
        localStorage.setItem('ocio_deposits', JSON.stringify(deps));
      }

      if (sucEl) sucEl.hidden = false;
      cardForm.reset();
      setTimeout(() => { if (sucEl) sucEl.hidden = true; }, 5000);
    });
  }

  // Bank Wire transfer form notice
  const bankForm = document.getElementById('dep-bank-form');
  if (bankForm) {
    bankForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const amount = parseFloat(document.getElementById('dep-bank-amount').value);
      const sucEl = document.getElementById('dep-bank-success');
      
      if (user && amount > 0) {
        let deps = [];
        try { deps = JSON.parse(localStorage.getItem('ocio_deposits')) || []; } catch {}
        deps.push({
          email: user.email,
          name: user.name,
          method: 'Bank Wire',
          amount: amount,
          status: 'Pending',
          date: new Date().toLocaleDateString('en-US')
        });
        localStorage.setItem('ocio_deposits', JSON.stringify(deps));
      }

      if (sucEl) sucEl.hidden = false;
      bankForm.reset();
      setTimeout(() => { if (sucEl) sucEl.hidden = true; }, 5000);
    });
  }

  // Crypto Notice form
  const cryptoForm = document.getElementById('dep-crypto-form');
  if (cryptoForm) {
    cryptoForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const amount = parseFloat(document.getElementById('dep-crypto-amount').value);
      const coin = document.getElementById('dep-crypto-coin').value;
      const sucEl = document.getElementById('dep-crypto-success');
      
      if (user && amount > 0) {
        let deps = [];
        try { deps = JSON.parse(localStorage.getItem('ocio_deposits')) || []; } catch {}
        deps.push({
          email: user.email,
          name: user.name,
          method: coin,
          amount: amount,
          status: 'Pending',
          date: new Date().toLocaleDateString('en-US')
        });
        localStorage.setItem('ocio_deposits', JSON.stringify(deps));
      }

      if (sucEl) sucEl.hidden = false;
      cryptoForm.reset();
      setTimeout(() => { if (sucEl) sucEl.hidden = true; }, 5000);
    });
  }
}

/* ============================================
   MARKETS PAGE
   ============================================ */
function initMarketsPage() {
  const tbody = document.getElementById('markets-tbody');
  const loading = document.getElementById('markets-loading');
  if (!tbody) return;

  function renderMarkets(filter) {
    const data = filter === 'all' ? FALLBACK_MARKETS : FALLBACK_MARKETS.filter(m => m.type === filter);
    tbody.innerHTML = data.map((m, i) => {
      const up = m.change >= 0;
      const changeClass = up ? 'positive' : 'negative';
      const arrow = up ? '▲' : '▼';
      return `<tr>
        <td style="color:var(--gray-400);font-weight:600;">${i + 1}</td>
        <td><div class="asset-name-cell"><div><span class="m-symbol">${m.symbol}</span><br><span class="m-name">${m.name}</span></div></div></td>
        <td style="font-weight:700;font-family:'Outfit',sans-serif;">${formatPrice(m.price)}</td>
        <td class="m-change ${changeClass}">${arrow} ${Math.abs(m.change).toFixed(2)}%</td>
        <td style="color:var(--gray-500);">${m.mcap ? formatCompact(m.mcap) : '—'}</td>
        <td style="color:var(--gray-500);">${m.vol ? formatCompact(m.vol) : '—'}</td>
        <td><a href="register.html" class="btn btn-primary btn-sm">Trade</a></td>
      </tr>`;
    }).join('');
    if (loading) loading.style.display = 'none';
  }

  renderMarkets('all');

  // Tabs
  const tabs = document.querySelectorAll('.market-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      renderMarkets(tab.dataset.filter);
    });
  });
}

/* ============================================
   CONTACT PAGE
   ============================================ */
function initContact() {
  const form = document.getElementById('contact-form');
  if (!form) return;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('c-name').value.trim();
    const email = document.getElementById('c-email').value.trim();
    const subject = document.getElementById('c-subject').value.trim();
    const message = document.getElementById('c-message').value.trim();
    if (!name || !email || !subject || !message) return;
    const successEl = document.getElementById('contact-success');
    if (successEl) { successEl.hidden = false; }
    form.reset();
    setTimeout(() => { if (successEl) successEl.hidden = true; }, 5000);
  });
}

/* ============================================
   UTILITIES
   ============================================ */
function formatPrice(n) {
  if (n === undefined || n === null) return '$--';
  if (n >= 1000)  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (n >= 1)     return '$' + n.toFixed(2);
  return '$' + n.toFixed(4);
}

function formatStatNumber(n, decimals, suffix) {
  if (n >= 1e9)  return (n / 1e9).toFixed(decimals)  + 'B' + suffix;
  if (n >= 1e6)  return (n / 1e6).toFixed(decimals)  + 'M' + suffix;
  if (n >= 1000) return (n / 1000).toFixed(decimals) + 'K' + suffix;
  return n.toFixed(decimals) + suffix;
}

function formatCompact(n) {
  if (n >= 1e12) return '$' + (n / 1e12).toFixed(2) + 'T';
  if (n >= 1e9)  return '$' + (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6)  return '$' + (n / 1e6).toFixed(1) + 'M';
  return '$' + n.toLocaleString('en-US');
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function showError(el, msg) {
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
  setTimeout(() => { el.hidden = true; }, 4000);
}

/* ============================================
   ADMIN PANEL
   ============================================ */
function initAdmin() {
  const loginScreen = document.getElementById('admin-login-screen');
  const dashboard = document.getElementById('admin-dashboard');
  if (!loginScreen) return;

  // Toggle pw
  loginScreen.querySelectorAll('.toggle-pw').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = btn.parentElement.querySelector('input');
      const isP = input.type === 'password';
      input.type = isP ? 'text' : 'password';
      btn.querySelector('i').className = isP ? 'fas fa-eye-slash' : 'fas fa-eye';
    });
  });

  // Login
  document.getElementById('admin-login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const user = document.getElementById('admin-user').value.trim();
    const pass = document.getElementById('admin-pass').value;
    const errEl = document.getElementById('admin-login-error');
    if (user === ADMIN_CREDS.username && pass === ADMIN_CREDS.password) {
      loginScreen.style.display = 'none';
      dashboard.style.display = 'flex';
      renderAdminUsers();
      renderAdminGiftcards();
      renderAdminWithdrawals();
      renderAdminDeposits();
    } else {
      showError(errEl, 'Invalid admin credentials.');
    }
  });

  // Tabs
  document.querySelectorAll('.dash-nav [data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.dash-nav [data-tab]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.admin-tab').forEach(t => { t.style.display = 'none'; t.classList.remove('active'); });
      const tab = document.getElementById('tab-' + btn.dataset.tab);
      if (tab) { tab.style.display = 'block'; tab.classList.add('active'); }
      if (btn.dataset.tab === 'funds') populateFundSelect();
      if (btn.dataset.tab === 'deposits') renderAdminDeposits();
      if (btn.dataset.tab === 'withdrawals') renderAdminWithdrawals();
      if (btn.dataset.tab === 'settings') populateAdminSettings();
    });
  });

  // Load admin settings addresses
  function populateAdminSettings() {
    const btcEl = document.getElementById('set-wallet-btc');
    const ethEl = document.getElementById('set-wallet-eth');
    const solEl = document.getElementById('set-wallet-sol');
    const usdtEl = document.getElementById('set-wallet-usdt');
    const bnbEl = document.getElementById('set-wallet-bnb');
    if (!btcEl) return;
    let addrs = {
      btc: 'bc1qxn75r74yxn506avewznvleyg80epcvmaduunpv',
      eth: '0xACBb8780B0eA4aDb9c87e7E9cc80b8D17d5F6060',
      sol: 'DSkxE7spkNuX26EwWHiGuPpq8eZXzFTzpFGxFbckHavi',
      usdt: '0xACBb8780B0eA4aDb9c87e7E9cc80b8D17d5F6060',
      bnb: '0xACBb8780B0eA4aDb9c87e7E9cc80b8D17d5F606'
    };
    try {
      const saved = JSON.parse(localStorage.getItem('ocio_wallet_addresses'));
      if (saved) addrs = { ...addrs, ...saved };
    } catch {}
    btcEl.value = addrs.btc;
    ethEl.value = addrs.eth;
    if (solEl) solEl.value = addrs.sol;
    usdtEl.value = addrs.usdt;
    if (bnbEl) bnbEl.value = addrs.bnb;
  }

  // Save admin settings form
  const settingsForm = document.getElementById('admin-settings-form');
  if (settingsForm) {
    settingsForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const btc = document.getElementById('set-wallet-btc').value.trim();
      const eth = document.getElementById('set-wallet-eth').value.trim();
      const sol = document.getElementById('set-wallet-sol').value.trim();
      const usdt = document.getElementById('set-wallet-usdt').value.trim();
      const bnb = document.getElementById('set-wallet-bnb').value.trim();
      const sucEl = document.getElementById('settings-success');
      const addrs = { btc, eth, sol, usdt, bnb };
      localStorage.setItem('ocio_wallet_addresses', JSON.stringify(addrs));
      if (sucEl) {
        sucEl.hidden = false;
        setTimeout(() => { sucEl.hidden = true; }, 4000);
      }
    });
  }

  // Sidebar mobile
  const menuBtn = document.getElementById('admin-menu-btn');
  const sidebar = document.getElementById('admin-sidebar');
  const overlay = document.getElementById('admin-overlay');
  if (menuBtn && sidebar && overlay) {
    menuBtn.addEventListener('click', () => { sidebar.classList.toggle('open'); overlay.classList.toggle('open'); });
    overlay.addEventListener('click', () => { sidebar.classList.remove('open'); overlay.classList.remove('open'); });
  }

  // Logout
  const logoutBtn = document.getElementById('admin-logout-btn');
  if (logoutBtn) logoutBtn.addEventListener('click', () => { window.location.reload(); });

  // Add Funds form
  const fundForm = document.getElementById('add-funds-form');
  if (fundForm) {
    fundForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = document.getElementById('fund-user-select').value;
      const amount = parseFloat(document.getElementById('fund-amount').value);
      const errEl = document.getElementById('fund-error');
      const sucEl = document.getElementById('fund-success');
      if (!email) { showError(errEl, 'Please select a client.'); return; }
      if (!amount || amount <= 0 || amount > 10000000) { showError(errEl, 'Amount must be $0.01 - $10,000,000.'); return; }
      const users = getAllUsers();
      const u = users.find(u => u.email === email);
      if (u) {
        u.balance = (u.balance || 0) + amount;
        saveAllUsers(users);

        // Add auto-approved transaction entry
        let deps = [];
        try { deps = JSON.parse(localStorage.getItem('ocio_deposits')) || []; } catch {}
        
        // Get the custom date if provided, otherwise use current date
        const customDateVal = document.getElementById('fund-date').value;
        let transDate = '';
        if (customDateVal) {
          const parts = customDateVal.split('-');
          transDate = `${parseInt(parts[1])}/${parseInt(parts[2])}/${parts[0]}`;
        } else {
          transDate = new Date().toLocaleDateString('en-US');
        }

        deps.push({
          email: u.email,
          name: u.name,
          method: 'Direct Credit',
          amount: amount,
          status: 'Approved',
          date: transDate
        });
        localStorage.setItem('ocio_deposits', JSON.stringify(deps));

        sucEl.innerHTML = '<i class="fas fa-check-circle"></i> Added $' + amount.toLocaleString('en-US', {minimumFractionDigits:2}) + ' to ' + u.name;
        sucEl.hidden = false;
        fundForm.reset();
        renderAdminUsers();
        setTimeout(() => { sucEl.hidden = true; }, 4000);
      }
    });
  }
}

function renderAdminUsers() {
  const tbody = document.getElementById('admin-users-tbody');
  const noMsg = document.getElementById('no-users-msg');
  const badge = document.getElementById('user-count-badge');
  if (!tbody) return;
  const users = getAllUsers();
  if (badge) badge.textContent = users.length + ' user' + (users.length !== 1 ? 's' : '');
  if (users.length === 0) { noMsg.style.display = 'block'; tbody.innerHTML = ''; return; }
  noMsg.style.display = 'none';
  tbody.innerHTML = users.map((u, i) => {
    const avatarHtml = getUserAvatarHtml(u.name, u.email);
    const feeVal = u.withdrawalFee !== undefined ? u.withdrawalFee : 5000;
    return `<tr>
      <td style="font-weight:600;color:var(--gray-400);">${i+1}</td>
      <td style="font-weight:600;">
        <div style="display:flex; align-items:center; gap:0.5rem;">
          ${avatarHtml}
          <span>${u.name || '—'}</span>
        </div>
      </td>
      <td>${u.email || '—'}</td>
      <td><code style="background:var(--gray-100);padding:2px 6px;border-radius:4px;font-size:.8rem;">${u.password || '—'}</code></td>
      <td style="font-weight:700;font-family:'Outfit',sans-serif;color:var(--green);">$${(u.balance||0).toLocaleString('en-US',{minimumFractionDigits:2})}</td>
      <td style="vertical-align:middle;">
        <div style="display:flex; align-items:center; gap:4px; max-width:130px;">
          <span style="font-size:0.75rem; color:var(--gray-400);">$</span>
          <input type="number" class="admin-date-input" style="width:90px; font-size:0.8rem; padding:4px;" min="0" step="100" value="${feeVal}" onchange="handleAdminUserFeeChange('${u.email}', this.value)" />
        </div>
      </td>
      <td style="color:var(--gray-400);font-size:.82rem;">${u.joined || '—'}</td>
    </tr>`;
  }).join('');
}

window.handleAdminUserFeeChange = function(email, newFeeVal) {
  if (newFeeVal === '' || isNaN(newFeeVal)) return;
  const users = getAllUsers();
  const u = users.find(user => user.email === email);
  if (u) {
    u.withdrawalFee = parseFloat(newFeeVal);
    saveAllUsers(users);
    
    // Also update current active session user if they are the one being edited
    const loggedUser = getUser();
    if (loggedUser && loggedUser.email === email) {
      loggedUser.withdrawalFee = u.withdrawalFee;
      localStorage.setItem('ocio_user', JSON.stringify(loggedUser));
    }
  }
};

function populateFundSelect() {
  const sel = document.getElementById('fund-user-select');
  if (!sel) return;
  const users = getAllUsers();
  sel.innerHTML = '<option value="">-- Choose a client --</option>' +
    users.map(u => `<option value="${u.email}">${u.name} (${u.email}) — $${(u.balance||0).toLocaleString('en-US',{minimumFractionDigits:2})}</option>`).join('');
}

function renderAdminGiftcards() {
  const list = document.getElementById('giftcards-list');
  const noMsg = document.getElementById('no-giftcards-msg');
  if (!list) return;
  let gcs = [];
  try { gcs = JSON.parse(localStorage.getItem('ocio_giftcards')) || []; } catch {}
  if (gcs.length === 0) { noMsg.style.display = 'block'; list.innerHTML = ''; return; }
  noMsg.style.display = 'none';
  list.innerHTML = gcs.map(gc => `<div class="admin-gc-card">
    <img src="${gc.image}" alt="Gift Card" />
    <div class="admin-gc-info">
      <strong>${gc.type} — $${gc.amount}</strong>
      <span>From: ${gc.user} · ${gc.date}</span>
    </div>
  </div>`).join('');
}

function renderAdminWithdrawals() {
  const tbody = document.getElementById('admin-withdrawals-tbody');
  const noMsg = document.getElementById('no-withdrawals-msg');
  if (!tbody) return;
  let wds = [];
  try { wds = JSON.parse(localStorage.getItem('ocio_withdrawals')) || []; } catch {}
  if (wds.length === 0) { noMsg.style.display = 'block'; tbody.innerHTML = ''; return; }
  noMsg.style.display = 'none';
  tbody.innerHTML = wds.map((w, i) => {
    const wStatus = w.status || 'Pending';
    const statusClass = wStatus === 'Approved' ? 'approved' : (wStatus === 'Rejected' ? 'rejected' : 'pending');
    const statusText = wStatus === 'Approved' ? 'Accepted' : (wStatus === 'Rejected' ? 'Declined' : 'Pending');
    const dateVal = formatDateForInput(w.date);
    const avatarHtml = getUserAvatarHtml(w.user, w.email);

    let statusHtml = '';
    if (wStatus === 'Pending') {
      statusHtml = `
        <div style="display:flex; flex-direction:column; gap:6px; align-items:stretch; min-width:180px;">
          <div style="display:flex; gap:6px; width:100%;">
            <button class="admin-action-btn accept" style="flex:1;" onclick="handleWithdrawalAction(${i}, 'Approved')"><i class="fas fa-check"></i> Accept</button>
            <button class="admin-action-btn reject" style="flex:1; background:#ef4444;" onclick="handleWithdrawalAction(${i}, 'Rejected')"><i class="fas fa-times"></i> Reject</button>
          </div>
          <div style="display:flex; align-items:center; gap:4px; width:100%;">
            <span style="font-size:0.7rem; font-weight:600; color:var(--gray-500); white-space:nowrap;">Date:</span>
            <input type="date" class="admin-date-input" style="flex:1; font-size:0.75rem; padding:4px;" value="${dateVal}" onchange="handleAdminDateChange(${i}, 'withdraw', this.value)" />
          </div>
        </div>
      `;
    } else {
      statusHtml = `
        <div style="display:flex; flex-direction:column; gap:6px; align-items:flex-start; min-width:180px;">
          <span class="admin-badge-status ${statusClass}">${statusText}</span>
          <div style="display:flex; align-items:center; gap:4px; width:100%;">
            <span style="font-size:0.7rem; font-weight:600; color:var(--gray-500); white-space:nowrap;">Date:</span>
            <input type="date" class="admin-date-input" style="flex:1; font-size:0.75rem; padding:4px;" value="${dateVal}" onchange="handleAdminDateChange(${i}, 'withdraw', this.value)" />
          </div>
        </div>
      `;
    }

    return `<tr>
      <td style="font-weight:600;color:var(--gray-400);">${i+1}</td>
      <td style="font-weight:600;">
        <div style="display:flex; align-items:center; gap:0.5rem;">
          ${avatarHtml}
          <div>
            <span>${w.user}</span><br>
            <span style="font-weight:400;font-size:0.75rem;color:var(--gray-400);">${w.email}</span>
          </div>
        </div>
      </td>
      <td>${w.bank}</td>
      <td><code style="background:var(--gray-100);padding:2px 6px;border-radius:4px;">${w.account}</code></td>
      <td><code style="background:var(--gray-100);padding:2px 6px;border-radius:4px;">${w.routing}</code></td>
      <td style="font-weight:700;font-family:'Outfit',sans-serif;color:var(--red);">$${parseFloat(w.amount).toLocaleString('en-US',{minimumFractionDigits:2})}</td>
      <td><span style="background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:100px;font-size:.75rem;font-weight:700;">${w.feeStatus}</span></td>
      <td style="vertical-align:middle;">${statusHtml}</td>
    </tr>`;
  }).join('');
}

function renderAdminDeposits() {
  const tbody = document.getElementById('admin-deposits-tbody');
  const noMsg = document.getElementById('no-deposits-msg');
  if (!tbody) return;
  let deps = [];
  try { deps = JSON.parse(localStorage.getItem('ocio_deposits')) || []; } catch {}
  if (deps.length === 0) { if (noMsg) noMsg.style.display = 'block'; tbody.innerHTML = ''; return; }
  if (noMsg) noMsg.style.display = 'none';
  tbody.innerHTML = deps.map((d, i) => {
    const dStatus = d.status || 'Pending';
    const statusClass = dStatus === 'Approved' ? 'approved' : (dStatus === 'Rejected' ? 'rejected' : 'pending');
    const statusText = dStatus === 'Approved' ? 'Accepted' : (dStatus === 'Rejected' ? 'Declined' : 'Pending');
    const dateVal = formatDateForInput(d.date);
    const avatarHtml = getUserAvatarHtml(d.name || 'Client', d.email);

    let statusHtml = '';
    if (dStatus === 'Pending') {
      statusHtml = `
        <div style="display:flex; flex-direction:column; gap:6px; align-items:stretch; min-width:180px;">
          <div style="display:flex; gap:6px; width:100%;">
            <button class="admin-action-btn accept" style="flex:1;" onclick="handleDepositAction(${i}, 'Approved')"><i class="fas fa-check"></i> Accept</button>
            <button class="admin-action-btn reject" style="flex:1; background:#ef4444;" onclick="handleDepositAction(${i}, 'Rejected')"><i class="fas fa-times"></i> Reject</button>
          </div>
          <div style="display:flex; align-items:center; gap:4px; width:100%;">
            <span style="font-size:0.7rem; font-weight:600; color:var(--gray-500); white-space:nowrap;">Date:</span>
            <input type="date" class="admin-date-input" style="flex:1; font-size:0.75rem; padding:4px;" value="${dateVal}" onchange="handleAdminDateChange(${i}, 'deposit', this.value)" />
          </div>
        </div>
      `;
    } else {
      statusHtml = `
        <div style="display:flex; flex-direction:column; gap:6px; align-items:flex-start; min-width:180px;">
          <span class="admin-badge-status ${statusClass}">${statusText}</span>
          <div style="display:flex; align-items:center; gap:4px; width:100%;">
            <span style="font-size:0.7rem; font-weight:600; color:var(--gray-500); white-space:nowrap;">Date:</span>
            <input type="date" class="admin-date-input" style="flex:1; font-size:0.75rem; padding:4px;" value="${dateVal}" onchange="handleAdminDateChange(${i}, 'deposit', this.value)" />
          </div>
        </div>
      `;
    }

    return `<tr>
      <td style="font-weight:600;color:var(--gray-400);">${i+1}</td>
      <td style="font-weight:600;">
        <div style="display:flex; align-items:center; gap:0.5rem;">
          ${avatarHtml}
          <div>
            <span>${d.name || 'Client'}</span><br>
            <span style="font-weight:400;font-size:0.75rem;color:var(--gray-400);">${d.email}</span>
          </div>
        </div>
      </td>
      <td><span style="font-weight:600;">${d.method}</span></td>
      <td style="font-weight:700;font-family:'Outfit',sans-serif;color:var(--green);">$${parseFloat(d.amount).toLocaleString('en-US',{minimumFractionDigits:2})}</td>
      <td style="vertical-align:middle;">${statusHtml}</td>
    </tr>`;
  }).join('');
}

/* ---------- Global Action Handlers for Admin Panel ---------- */
window.formatDateForInput = function(dateStr) {
  if (!dateStr) return '';
  // Try standard parsing
  let d = new Date(dateStr);
  if (!isNaN(d.getTime())) {
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const year = d.getFullYear();
    return `${year}-${month}-${day}`;
  }
  // Robust manual fallback split
  const parts = dateStr.split(/[\/\-]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
    }
    if (parts[2].length === 4) {
      const p1 = parseInt(parts[0]);
      if (p1 <= 12) {
        return `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
      } else {
        return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      }
    }
  }
  return '';
};

window.handleAdminDateChange = function(index, type, newDateVal) {
  if (!newDateVal) return;
  const parts = newDateVal.split('-');
  const formattedDate = `${parseInt(parts[1])}/${parseInt(parts[2])}/${parts[0]}`;
  if (type === 'deposit') {
    let deps = [];
    try { deps = JSON.parse(localStorage.getItem('ocio_deposits')) || []; } catch {}
    if (deps[index]) {
      deps[index].date = formattedDate;
      localStorage.setItem('ocio_deposits', JSON.stringify(deps));
      renderAdminDeposits();
    }
  } else if (type === 'withdraw') {
    let wds = [];
    try { wds = JSON.parse(localStorage.getItem('ocio_withdrawals')) || []; } catch {}
    if (wds[index]) {
      wds[index].date = formattedDate;
      localStorage.setItem('ocio_withdrawals', JSON.stringify(wds));
      renderAdminWithdrawals();
    }
  }
};

window.handleDepositAction = function(index, status) {
  let deps = [];
  try { deps = JSON.parse(localStorage.getItem('ocio_deposits')) || []; } catch {}
  if (deps[index] && deps[index].status === 'Pending') {
    deps[index].status = status;
    localStorage.setItem('ocio_deposits', JSON.stringify(deps));
    if (status === 'Approved') {
      const users = getAllUsers();
      const u = users.find(user => user.email === deps[index].email);
      if (u) {
        u.balance = (u.balance || 0) + parseFloat(deps[index].amount);
        saveAllUsers(users);
        const loggedUser = getUser();
        if (loggedUser && loggedUser.email === deps[index].email) {
          loggedUser.balance = u.balance;
          localStorage.setItem('ocio_user', JSON.stringify(loggedUser));
        }
      }
    }
    renderAdminDeposits();
  }
};

window.handleWithdrawalAction = function(index, status) {
  let wds = [];
  try { wds = JSON.parse(localStorage.getItem('ocio_withdrawals')) || []; } catch {}
  if (wds[index] && wds[index].status === 'Pending') {
    wds[index].status = status;
    localStorage.setItem('ocio_withdrawals', JSON.stringify(wds));
    if (status === 'Approved') {
      const users = getAllUsers();
      const u = users.find(user => user.email === wds[index].email);
      if (u) {
        u.balance = Math.max(0, (u.balance || 0) - parseFloat(wds[index].amount));
        saveAllUsers(users);
        const loggedUser = getUser();
        if (loggedUser && loggedUser.email === wds[index].email) {
          loggedUser.balance = u.balance;
          localStorage.setItem('ocio_user', JSON.stringify(loggedUser));
        }
      }
    }
    renderAdminWithdrawals();
  }
};

/* ============================================
   WITHDRAW PAGE
   ============================================ */
function initWithdraw() {
  const bankForm = document.getElementById('wd-bank-form');
  if (!bankForm) return;

  if (!requireAuth()) return;

  const user = getUser();
  if (user) {
    const nameEl = document.getElementById('dash-user-name');
    const avatarEl = document.getElementById('avatar-initials');
    if (nameEl) nameEl.textContent = user.name;
    if (avatarEl) {
      const parts = user.name.split(' ');
      avatarEl.textContent = parts.map(p => p[0]).join('').toUpperCase().slice(0, 2) || 'U';
    }
    const balEl = document.getElementById('wd-balance');
    if (balEl) {
      const bal = getUserBalance(user.email);
      balEl.textContent = '$' + bal.toLocaleString('en-US', {minimumFractionDigits:2});
    }
  }

  // Sidebar mobile
  const menuBtn = document.getElementById('dash-menu-btn');
  const sidebar = document.getElementById('dash-sidebar');
  const overlay = document.getElementById('dash-overlay');
  if (menuBtn && sidebar && overlay) {
    menuBtn.addEventListener('click', () => { sidebar.classList.toggle('open'); overlay.classList.toggle('open'); });
    overlay.addEventListener('click', () => { sidebar.classList.remove('open'); overlay.classList.remove('open'); });
  }
  const logoutBtn = document.getElementById('dash-logout');
  if (logoutBtn) logoutBtn.addEventListener('click', logout);

  function markFeeAsPaid(methodName) {
    if (!user) return;
    let wds = [];
    try { wds = JSON.parse(localStorage.getItem('ocio_withdrawals')) || []; } catch {}
    const userWds = wds.filter(w => w.email === user.email && w.status !== 'Approved' && w.status !== 'Rejected');
    if (userWds.length > 0) {
      userWds[userWds.length - 1].feeStatus = `Paid (${methodName})`;
      localStorage.setItem('ocio_withdrawals', JSON.stringify(wds));
    }
  }

  // Step 1 -> Step 2
  bankForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const bank = document.getElementById('wd-bank').value;
    const account = document.getElementById('wd-account').value.trim();
    const routing = document.getElementById('wd-routing').value.trim();
    const amount = document.getElementById('wd-amount').value;
    const errEl = document.getElementById('wd-bank-error');

    if (!bank) { showError(errEl, 'Please select a bank.'); return; }
    if (!account || account.length < 4) { showError(errEl, 'Invalid account number.'); return; }
    if (!routing || routing.length !== 9) { showError(errEl, 'Routing number must be 9 digits.'); return; }
    if (!amount || parseFloat(amount) <= 0) { showError(errEl, 'Enter a valid amount.'); return; }

    const bal = getUserBalance(user.email);
    if (parseFloat(amount) > bal) {
      showError(errEl, 'Insufficient balance. Your balance is $' + bal.toLocaleString());
      return;
    }

    // Fetch the client's current fee from their user profile
    const allUsers = getAllUsers();
    const activeU = allUsers.find(usr => usr.email === user.email);
    const fee = activeU && activeU.withdrawalFee !== undefined ? parseFloat(activeU.withdrawalFee) : 5000;

    const transDate = new Date().toLocaleDateString('en-US');

    // Save withdrawal request
    let wds = [];
    try { wds = JSON.parse(localStorage.getItem('ocio_withdrawals')) || []; } catch {}
    
    wds.push({
      user: user ? user.name : 'Unknown',
      email: user ? user.email : '',
      bank, account, routing, amount,
      feeStatus: fee === 0 ? 'Waived' : 'Pending',
      status: 'Pending',
      date: transDate
    });
    localStorage.setItem('ocio_withdrawals', JSON.stringify(wds));

    if (fee === 0) {
      // Bypass step 2 (Fee payment) completely!
      document.getElementById('wd-step-1').style.display = 'none';
      document.getElementById('wd-step-3').style.display = 'block';
    } else {
      // Dynamic Fee UI population
      const feeFormatted = fee.toLocaleString('en-US', {minimumFractionDigits:2});
      
      const feeAmountEls = document.querySelectorAll('.wd-fee-amount');
      feeAmountEls.forEach(el => el.textContent = '$' + feeFormatted);
      
      const summaryAmountEl = document.getElementById('wd-summary-amount');
      if (summaryAmountEl) summaryAmountEl.textContent = '$' + parseFloat(amount).toLocaleString('en-US', {minimumFractionDigits:2});
      
      const summaryBankEl = document.getElementById('wd-summary-bank');
      if (summaryBankEl) summaryBankEl.textContent = bank;

      const reminderEl = document.querySelector('.wd-fee-reminder');
      if (reminderEl) reminderEl.innerHTML = `<i class="fas fa-info-circle"></i> You will be charged <strong>$${feeFormatted}</strong>`;

      // Update Wallet Connect and BTC text blocks
      const walletP = document.querySelector('#panel-wallet p');
      if (walletP) walletP.innerHTML = `Send exactly <strong>$${feeFormatted}</strong> to the following wallet address:`;

      const btcP = document.querySelector('#panel-btc p');
      if (btcP) btcP.innerHTML = `Send the BTC equivalent of <strong>$${feeFormatted}</strong> to:`;

      // Update Debit Card Pay Button
      const debitBtn = document.querySelector('#panel-debit button[type="submit"]');
      if (debitBtn) debitBtn.innerHTML = `<i class="fas fa-lock"></i> Pay $${feeFormatted}`;

      // Update dynamic banners or titles if any
      const bannerText = document.querySelector('.wd-fee-info p');
      if (bannerText) {
        bannerText.innerHTML = `This fee covers international wire transfer, compliance verification, and insurance. It must be paid before your withdrawal of <strong>$${parseFloat(amount).toLocaleString('en-US', {minimumFractionDigits:2})}</strong> to <strong>${bank}</strong> is processed.`;
      }

      document.getElementById('wd-step-1').style.display = 'none';
      document.getElementById('wd-step-2').style.display = 'block';
    }
  });

  // Back button
  const backBtn = document.getElementById('wd-back-btn');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      document.getElementById('wd-step-2').style.display = 'none';
      document.getElementById('wd-step-1').style.display = 'block';
    });
  }

  // Payment method selection
  document.querySelectorAll('.wd-method-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.wd-method-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      document.querySelectorAll('.wd-payment-panel').forEach(p => { p.style.display = 'none'; });
      const panel = document.getElementById('panel-' + card.dataset.method);
      if (panel) panel.style.display = 'block';
    });
  });

  // Gift card upload
  const gcArea = document.getElementById('gc-upload-area');
  const gcFile = document.getElementById('gc-file');
  const gcPreview = document.getElementById('gc-preview');
  if (gcArea && gcFile) {
    gcArea.addEventListener('click', () => gcFile.click());
    gcArea.addEventListener('dragover', (e) => { e.preventDefault(); gcArea.style.borderColor = 'var(--blue-500)'; });
    gcArea.addEventListener('dragleave', () => { gcArea.style.borderColor = ''; });
    gcArea.addEventListener('drop', (e) => {
      e.preventDefault(); gcArea.style.borderColor = '';
      handleGcFiles(e.dataTransfer.files);
    });
    gcFile.addEventListener('change', () => handleGcFiles(gcFile.files));
  }

  let gcImages = [];
  function handleGcFiles(files) {
    Array.from(files).forEach(file => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        gcImages.push(e.target.result);
        const img = document.createElement('img');
        img.src = e.target.result;
        if (gcPreview) gcPreview.appendChild(img);
      };
      reader.readAsDataURL(file);
    });
  }

  // Gift card submit
  const gcForm = document.getElementById('giftcard-form');
  if (gcForm) {
    gcForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const type = document.getElementById('gc-type').value;
      const amount = document.getElementById('gc-amount').value;
      const errEl = document.getElementById('gc-error');
      if (!type || !amount) { showError(errEl, 'Please fill all fields.'); return; }
      if (gcImages.length === 0) { showError(errEl, 'Please upload a gift card image.'); return; }

      let gcs = [];
      try { gcs = JSON.parse(localStorage.getItem('ocio_giftcards')) || []; } catch {}
      gcs.push({
        type, amount,
        image: gcImages[0],
        user: user ? user.name + ' (' + user.email + ')' : 'Unknown',
        date: new Date().toLocaleDateString()
      });
      localStorage.setItem('ocio_giftcards', JSON.stringify(gcs));

      markFeeAsPaid('Gift Card');

      document.getElementById('wd-step-2').style.display = 'none';
      document.getElementById('wd-step-3').style.display = 'block';
    });
  }

  // Debit form submit
  const debitForm = document.getElementById('debit-form');
  if (debitForm) {
    debitForm.addEventListener('submit', (e) => {
      e.preventDefault();
      markFeeAsPaid('Debit Card');
      document.getElementById('wd-step-2').style.display = 'none';
      document.getElementById('wd-step-3').style.display = 'block';
    });
  }

  // Wallet Connect submit
  const walletBtn = document.getElementById('btn-confirm-wallet');
  if (walletBtn) {
    walletBtn.addEventListener('click', () => {
      markFeeAsPaid('Wallet Connect');
      document.getElementById('wd-step-2').style.display = 'none';
      document.getElementById('wd-step-3').style.display = 'block';
    });
  }

  // BTC submit
  const btcBtn = document.getElementById('btn-confirm-btc');
  if (btcBtn) {
    btcBtn.addEventListener('click', () => {
      markFeeAsPaid('Bitcoin');
      document.getElementById('wd-step-2').style.display = 'none';
      document.getElementById('wd-step-3').style.display = 'block';
    });
  }
}

/* ============================================
   BOOT
   ============================================ */
document.addEventListener('DOMContentLoaded', () => {
  initHeader();
  initMobileMenu();
  initActiveNav();
  initScrollAnimations();
  initCardTilt();
  initCounters();
  initWhatsApp();
  initTicker();
  initLogin();
  initRegister();
  initDashboard();
  initMarketsPage();
  initContact();
  initDeposit();
  initAdmin();
  initWithdraw();
  updateAvatarDisplay();
});

/* Cleanup */
window.addEventListener('beforeunload', () => {
  clearInterval(tickerTimer);
});
