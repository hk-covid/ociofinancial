/* ============================================
   OCIO Financial Markets — Main Script
   All pages: Home, Markets, About, Contact,
   Login, Register, Dashboard
   ============================================ */

'use strict';

/* ============================================
   CLOUD SYNC ENGINE (Supabase)
   Syncs localStorage data across all devices
   ============================================ */
const SUPABASE_URL = 'https://ursrbmvgrpjhuogfimal.supabase.co';
const SUPABASE_KEY = 'sb_publishable_tPbGnhGMinGYFI5tc4KbvA_7Gu2Ketw';
const SYNC_ID = 2; // Using ID 2 for OCIO data
const SYNC_KEYS = ['ocio_users', 'ocio_deposits', 'ocio_withdrawals', 'ocio_wallet_addresses', 'ocio_giftcards'];
const originalSetItem = localStorage.setItem.bind(localStorage);

/* --- Cloud helper: GET all data from cloud --- */
async function cloudFetch() {
  try {
    const res = await fetch(SUPABASE_URL + '/rest/v1/otp_state?select=expectedOtp&id=eq.' + SYNC_ID, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Accept': 'application/json' },
      cache: 'no-store'
    });
    if (res.ok) {
      const rows = await res.json();
      const val = (rows && rows.length > 0) ? rows[0].expectedOtp : null;
      if (!val) return {}; // Return empty object to trigger initialization
      try { return JSON.parse(val); } catch(e) { return {}; }
    }
    return null;
  } catch (err) {
    console.warn('[CloudSync] Fetch failed:', err.message);
    return null;
  }
}

/* --- Cloud helper: PUT (overwrite) all data to cloud --- */
async function cloudPush(data) {
  try {
    const res = await fetch(SUPABASE_URL + '/rest/v1/otp_state', {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify({ id: SYNC_ID, expectedOtp: JSON.stringify(data) })
    });
    if (res.ok) {
      console.log('[CloudSync] Push successful');
      return true;
    }
    return false;
  } catch (err) {
    console.warn('[CloudSync] Push failed:', err.message);
    return false;
  }
}

/*
 * MERGE STRATEGY — Cloud is the master source of truth.
 *
 * IMPORTANT: Cloud data is VALIDATED before being treated as authoritative.
 * A user entry must have both email and password to be considered valid.
 * A cloud blob missing all keys (empty/corrupted) is ignored.
 *
 * For users:     Valid cloud users win for balance/details.
 *                Local users not in cloud (new registrations) are added.
 *                Invalid cloud users (no password) cannot overwrite valid local users.
 *                Local profile pictures are preserved if cloud doesn't have one.
 *
 * For transactions: Cloud wins. Local-only transactions (just submitted) are added.
 *                   Transactions have a unique `id` field for reliable deduplication.
 *
 * For wallet addresses: Cloud object wins entirely if it has content.
 */

/* --- Validate that cloud data is usable (not empty/corrupted) --- */
function isCloudDataValid(cloudData) {
  if (!cloudData || typeof cloudData !== 'object') return false;
  // Cloud must have at least one of the expected keys
  const hasAnyKey = SYNC_KEYS.some(k => cloudData[k] !== undefined);
  if (!hasAnyKey) return false;
  // If it has ocio_users, every user entry must have an email
  if (Array.isArray(cloudData.ocio_users)) {
    const validUsers = cloudData.ocio_users.filter(u => u && u.email);
    if (cloudData.ocio_users.length > 0 && validUsers.length === 0) return false;
  }
  return true;
}

/* --- Merge users: cloud master, local fills in new registrations only --- */
function mergeUsers(localArr, cloudArr) {
  if (!Array.isArray(localArr)) localArr = [];
  if (!Array.isArray(cloudArr)) cloudArr = [];

  // Only treat cloud users with valid email+password as authoritative.
  // This prevents a corrupted/test cloud entry (e.g. no password) from
  // clobbering a real user who registered on this device.
  const validCloudUsers = cloudArr.filter(u => u && u.email && u.password);

  const map = new Map();
  // Start with valid cloud users — they are authoritative
  validCloudUsers.forEach(u => map.set(u.email.toLowerCase(), u));

  // Add any local users that don't exist in cloud yet (just registered on this device)
  localArr.forEach(u => {
    if (!u || !u.email) return;
    const key = u.email.toLowerCase();
    if (!map.has(key)) {
      map.set(key, u); // New local user — add to merged set
    } else {
      // User exists in both — cloud wins, but preserve local profile pic if cloud lacks one
      const cloudUser = map.get(key);
      if (u.profilePic && !cloudUser.profilePic) {
        map.set(key, { ...cloudUser, profilePic: u.profilePic });
      }
      // Cloud balance and all other fields are authoritative — no local override
    }
  });
  return Array.from(map.values());
}

/* --- Generate a unique transaction ID --- */
function generateTxId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
}

/* --- Merge transactions: cloud master, local adds new pending transactions --- */
function mergeTxArrays(localArr, cloudArr) {
  if (!Array.isArray(localArr)) localArr = [];
  if (!Array.isArray(cloudArr)) cloudArr = [];
  const map = new Map();

  // Unique key: prefer dedicated `id` field; fall back to composite key for legacy entries
  const txKey = tx => tx.id ||
    `${tx.email}|${tx.amount}|${tx.date}|${tx.method || tx.bank || ''}`;

  // Cloud is master
  cloudArr.forEach(tx => {
    if (!tx || !tx.email) return;
    map.set(txKey(tx), tx);
  });

  // Add local-only transactions (just submitted on this device)
  localArr.forEach(tx => {
    if (!tx || !tx.email) return;
    const key = txKey(tx);
    if (!map.has(key)) {
      map.set(key, tx); // New local transaction — add it
    } else {
      // Transaction exists in both. Cloud status wins unless cloud is still Pending
      // and local has been resolved (shouldn't happen, but handle gracefully)
      const existing = map.get(key);
      if (existing.status === 'Pending' && tx.status !== 'Pending') {
        map.set(key, tx); // Local resolved, cloud still pending — prefer resolved
      }
      // Otherwise cloud wins
    }
  });
  return Array.from(map.values());
}

/* --- Deep compare helper to detect local changes (status updates, new transactions, etc.) --- */
function hasLocalChanges(finalVal, cloudVal) {
  if (Array.isArray(finalVal) && Array.isArray(cloudVal)) {
    if (finalVal.length !== cloudVal.length) return true;
    for (let i = 0; i < finalVal.length; i++) {
      if (JSON.stringify(finalVal[i]) !== JSON.stringify(cloudVal[i])) return true;
    }
    return false;
  }
  if (typeof finalVal === 'object' && typeof cloudVal === 'object' && finalVal !== null && cloudVal !== null) {
    return JSON.stringify(finalVal) !== JSON.stringify(cloudVal);
  }
  return finalVal !== cloudVal;
}

/* --- Full sync: pull cloud data, merge with local, push merged result back --- */
async function cloudSyncFull() {
  const cloudData = await cloudFetch();

  // If the cloud is unreachable, just use local data without pushing
  if (!cloudData) {
    console.warn('[CloudSync] Could not reach cloud, using local data only');
    return false;
  }

  // CRITICAL: Validate cloud data before treating it as authoritative.
  // A corrupted or partially-initialized cloud blob (e.g. missing all keys,
  // or users without passwords) must NOT be allowed to wipe valid local data.
  if (!isCloudDataValid(cloudData)) {
    console.warn('[CloudSync] Cloud data failed validation — treating as empty. Will push local state.');
    // Push local data to repair the cloud blob, then return
    const repairData = {};
    SYNC_KEYS.forEach(k => {
      try { repairData[k] = JSON.parse(localStorage.getItem(k)); } catch { repairData[k] = null; }
      if (!repairData[k]) repairData[k] = (k === 'ocio_wallet_addresses') ? {} : [];
    });
    await cloudPush(repairData);
    return false;
  }

  let dataChanged = false;

  // Process each key
  SYNC_KEYS.forEach(key => {
    let localData;
    try { localData = JSON.parse(localStorage.getItem(key)); } catch { localData = null; }
    if (!localData) localData = (key === 'ocio_wallet_addresses') ? {} : [];

    const cloudVal = cloudData[key];

    let merged;
    if (key === 'ocio_users') {
      merged = mergeUsers(localData, Array.isArray(cloudVal) ? cloudVal : []);
    } else if (key === 'ocio_deposits' || key === 'ocio_withdrawals' || key === 'ocio_giftcards') {
      merged = mergeTxArrays(localData, Array.isArray(cloudVal) ? cloudVal : []);
    } else if (key === 'ocio_wallet_addresses') {
      // Object merge — cloud wins, local fills gaps
      if (cloudVal && typeof cloudVal === 'object' && !Array.isArray(cloudVal) && Object.keys(cloudVal).length > 0) {
        merged = { ...localData, ...cloudVal }; // cloud overrides local
      } else {
        merged = localData;
      }
    } else {
      merged = mergeTxArrays(localData, Array.isArray(cloudVal) ? cloudVal : []);
    }

    const mergedStr = JSON.stringify(merged);
    if (mergedStr !== localStorage.getItem(key)) {
      originalSetItem(key, mergedStr);
      dataChanged = true;
    }
  });

  // Push the fully merged state back to cloud ONLY if we actually merged local-only data
  // that the cloud didn't already have. This fixes Bug A (JSON.stringify order sensitivity),
  // Bug B (phantom PUTs on admin auto-poll), and Bug C (double-PUT after registration).
  const finalData = {};
  let needsPush = false;

  SYNC_KEYS.forEach(k => {
    try { finalData[k] = JSON.parse(localStorage.getItem(k)); } catch { finalData[k] = null; }
    if (!finalData[k]) finalData[k] = (k === 'ocio_wallet_addresses') ? {} : [];

    const cloudVal = cloudData[k] || ((k === 'ocio_wallet_addresses') ? {} : []);
    const finalVal = finalData[k];

    // If there are any content changes (new items, status updates, fee updates, etc.) between
    // local merged state and the remote cloud state, we flag that a push is required.
    if (hasLocalChanges(finalVal, cloudVal)) {
      needsPush = true;
    }
  });

  if (needsPush) {
    await cloudPush(finalData);
  }

  // After every sync, refresh the logged-in user's session data
  // from the freshly merged users list. This ensures that balance changes made
  // by the admin on another device are immediately visible to the user.
  refreshActiveUserSession();

  return dataChanged;
}

/*
 * refreshActiveUserSession — keeps the ocio_user session in sync with
 * the canonical ocio_users list after every cloud pull.
 *
 * Why this is critical:
 *   The dashboard reads balance/name from ocio_user (the session object).
 *   If the admin updates a user's balance on another device, that update
 *   is stored in ocio_users (cloud). Without this function, the user's
 *   local ocio_user session would still show the old balance.
 */
function refreshActiveUserSession() {
  try {
    const sessionStr = localStorage.getItem('ocio_user');
    if (!sessionStr) return; // Not logged in
    const sessionUser = JSON.parse(sessionStr);
    if (!sessionUser || !sessionUser.email) return;

    const allUsers = JSON.parse(localStorage.getItem('ocio_users')) || [];
    const freshUser = allUsers.find(u => u.email && u.email.toLowerCase() === sessionUser.email.toLowerCase());
    if (!freshUser) return; // User not found in master list

    // Preserve session-only fields that may not be in the master list
    if (sessionUser.profilePic && !freshUser.profilePic) {
      freshUser.profilePic = sessionUser.profilePic;
    }

    // Write the updated session back (bypassing our interceptor to avoid re-push loop)
    originalSetItem('ocio_user', JSON.stringify(freshUser));
    console.log('[CloudSync] Session refreshed. Balance:', freshUser.balance, 'Name:', freshUser.name);
  } catch (e) {
    console.warn('[CloudSync] refreshActiveUserSession error:', e);
  }
}

/* --- Intercept localStorage.setItem to auto-push changes to cloud --- */
localStorage.setItem = function(key, value) {
  originalSetItem(key, value);
  if (SYNC_KEYS.includes(key)) {
    // Debounce cloud pushes to avoid flooding the API
    if (window._cloudPushTimeout) clearTimeout(window._cloudPushTimeout);
    window._cloudPushTimeout = setTimeout(async () => {
      const data = {};
      SYNC_KEYS.forEach(k => {
        try { data[k] = JSON.parse(localStorage.getItem(k)); } catch { data[k] = null; }
        if (!data[k]) data[k] = (k === 'ocio_wallet_addresses') ? {} : [];
      });
      await cloudPush(data);
    }, 400);
  }
};

/* --- Push all sync data immediately to cloud (for critical operations) --- */
async function cloudPushAll() {
  if (window._cloudPushTimeout) {
    clearTimeout(window._cloudPushTimeout);
    window._cloudPushTimeout = null;
  }
  const data = {};
  SYNC_KEYS.forEach(k => {
    try { data[k] = JSON.parse(localStorage.getItem(k)); } catch { data[k] = null; }
    if (data[k] === null || data[k] === undefined) data[k] = (k === 'ocio_wallet_addresses') ? {} : [];
  });
  return await cloudPush(data);
}

/* --- Initialize: sync on every page load --- */
window._cloudSyncReady = cloudSyncFull().then(changed => {
  console.log('[CloudSync] Initial sync complete. Local data updated:', changed);
  // Refresh admin dashboard if it is currently visible
  if (document.getElementById('admin-dashboard') && document.getElementById('admin-dashboard').style.display !== 'none') {
    if (typeof renderAdminUsers === 'function') renderAdminUsers();
    if (typeof renderAdminDeposits === 'function') renderAdminDeposits();
    if (typeof renderAdminWithdrawals === 'function') renderAdminWithdrawals();
    if (typeof renderAdminGiftcards === 'function') renderAdminGiftcards();
  }
  return true;
});

/*
 * SELF-HEALING PUSH: If this device has any local users/transactions that
 * the cloud doesn't have yet (e.g. registered before sync was fixed, or
 * while cloud was offline), push them up on every page load.
 * This runs AFTER the initial cloudSyncFull() resolves so it doesn't race.
 */
window._cloudSyncReady.then(async () => {
  try {
    const cloudData = await cloudFetch();
    if (!cloudData) return;
    const cloudUsers = Array.isArray(cloudData.ocio_users) ? cloudData.ocio_users : [];
    const localUsers = getAllUsers();
    // Check if local has any users not present in cloud
    const cloudEmails = new Set(cloudUsers.map(u => u.email && u.email.toLowerCase()).filter(Boolean));
    const localOnlyUsers = localUsers.filter(u => u && u.email && u.password && !cloudEmails.has(u.email.toLowerCase()));
    if (localOnlyUsers.length > 0) {
      console.log('[CloudSync] Self-heal: pushing', localOnlyUsers.length, 'local-only user(s) to cloud');
      await cloudPushAll();
    }
  } catch(e) {
    console.warn('[CloudSync] Self-heal push failed:', e);
  }
});

// Auto-poll cloud every 15 seconds when the admin dashboard is active.
// Guard flag prevents overlapping syncs (which would spam PUT requests
// and trigger JSONBlob rate limiting).
setInterval(async () => {
  const dash = document.getElementById('admin-dashboard');
  if (!dash || dash.style.display === 'none') return;
  if (window._adminSyncInProgress) return;
  window._adminSyncInProgress = true;
  try {
    await cloudSyncFull();
    if (typeof renderAdminUsers === 'function') renderAdminUsers();
    if (typeof renderAdminDeposits === 'function') renderAdminDeposits();
    if (typeof renderAdminWithdrawals === 'function') renderAdminWithdrawals();
    if (typeof renderAdminGiftcards === 'function') renderAdminGiftcards();
  } catch(e) {
    console.warn('[Admin Poll] Sync error:', e);
  } finally {
    window._adminSyncInProgress = false;
  }
}, 15000);

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
  // Only save valid users (must have email)
  const validUsers = Array.isArray(users) ? users.filter(u => u && u.email) : [];
  localStorage.setItem('ocio_users', JSON.stringify(validUsers));
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

/* --- Direct cloud user lookup (bypasses full sync, more reliable for login) --- */
async function cloudFetchUser(email) {
  try {
    const cloudData = await cloudFetch();
    if (!cloudData || !Array.isArray(cloudData.ocio_users)) return null;
    return cloudData.ocio_users.find(u => u && u.email && u.email.toLowerCase() === email.toLowerCase()) || null;
  } catch (e) {
    return null;
  }
}

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

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim().toLowerCase();
    const password = document.getElementById('login-password').value.trim();
    const errorEl = document.getElementById('login-error');
    const submitBtn = form.querySelector('button[type="submit"]');

    if (!email || !password) {
      showError(errorEl, 'Please fill in all fields.');
      return;
    }
    if (!isValidEmail(email)) {
      showError(errorEl, 'Please enter a valid email address.');
      return;
    }

    // Show loading state
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Signing in...'; }

    // STEP 1: Fetch the entire cloud data object to check network status
    let cloudData = null;
    let networkError = false;
    try {
      cloudData = await cloudFetch();
      if (!cloudData) networkError = true;
    } catch (e) {
      networkError = true;
    }

    let foundUser = null;

    if (!networkError && cloudData && Array.isArray(cloudData.ocio_users)) {
      foundUser = cloudData.ocio_users.find(u => u && u.email && u.email.toLowerCase() === email);
    }

    // MarieDupre specific app: Only allow her exact credentials
    if (email !== 'petemariedunn@gmail.com' || password !== 'MarieDupre') {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Sign In'; }
      showError(errorEl, 'Invalid email or password.');
      return;
    }

    // Auth passed — retrieve her canonical data from the cloud
    if (!foundUser) {
      if (networkError) {
         console.warn('[Login] Server unreachable, using local pre-seeded profile fallback');
         foundUser = {
           name: 'MarieDupre',
           email: 'petemariedunn@gmail.com',
           password: 'MarieDupre',
           withdrawalFee: 5000,
           balance: 270,
           joined: '5/24/2026'
         };
      } else {
         if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Sign In'; }
         showError(errorEl, 'Account not found. Please contact support.');
         return;
      }
    }

    // Auth passed — store the cloud-authoritative user as the session
    originalSetItem('ocio_user', JSON.stringify(foundUser));
    originalSetItem('ocio_logged_in', 'true');

    // Also merge into local ocio_users so getUserBalance() works on dashboard
    const localUsers = getAllUsers();
    const idx = localUsers.findIndex(u => u && u.email && u.email.toLowerCase() === email);
    if (idx >= 0) {
      localUsers[idx] = foundUser;
    } else {
      localUsers.push(foundUser);
    }
    originalSetItem('ocio_users', JSON.stringify(localUsers));

    // Run full sync in background to pull deposits/withdrawals/balance updates
    cloudSyncFull().catch(() => {});

    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Sign In'; }
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

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('reg-name').value.trim();
    const email = document.getElementById('reg-email').value.trim().toLowerCase();
    const password = document.getElementById('reg-password').value;
    const confirm = document.getElementById('reg-confirm').value;
    const terms = document.getElementById('agree-terms').checked;
    const errorEl = document.getElementById('register-error');
    const submitBtn = form.querySelector('button[type="submit"]');

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

    // Show loading state
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Creating account...'; }

    // ONE EMAIL PER ACCOUNT — direct GET from cloud (never rate-limited) plus
    // local check. This is more reliable than cloudSyncFull() which ends with
    // a rate-limited PUT that can make the local state stale.
    let cloudCheckUsers = [];
    try {
      const cloudCheck = await cloudFetch();
      if (cloudCheck && Array.isArray(cloudCheck.ocio_users)) {
        cloudCheckUsers = cloudCheck.ocio_users;
      }
    } catch {}
    const localUsersForCheck = getAllUsers();
    const registeredEmails = new Set([
      ...cloudCheckUsers.map(u => u && u.email ? u.email.toLowerCase() : ''),
      ...localUsersForCheck.map(u => u && u.email ? u.email.toLowerCase() : '')
    ]);
    registeredEmails.delete('');
    if (registeredEmails.has(email)) {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Create Account'; }
      showError(errorEl, 'An account with this email already exists.');
      return;
    }

    const newUser = {
      name,
      email,
      password,
      balance: 0,
      joined: new Date().toLocaleDateString('en-US')
    };

    // Prepare what the cloud should look like after adding this user
    const mergedForSave = mergeUsers(localUsersForCheck, cloudCheckUsers);
    mergedForSave.push(newUser);

    const payload = {};
    SYNC_KEYS.forEach(k => {
      if (k === 'ocio_users') {
        payload[k] = mergedForSave;
      } else {
        try { payload[k] = JSON.parse(localStorage.getItem(k)); } catch { payload[k] = null; }
        if (!payload[k]) payload[k] = (k === 'ocio_wallet_addresses') ? {} : [];
      }
    });

    // Strict Cloud-First Registration: Push directly to cloud before saving locally
    let pushOk = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      if (attempt > 1) await new Promise(r => setTimeout(r, attempt * 800));
      pushOk = await cloudPush(payload);
      if (pushOk) {
        console.log('[Register] Account pushed to cloud on attempt', attempt, ':', email);
        break;
      }
    }

    if (!pushOk) {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Create Account'; }
      showError(errorEl, 'Server is currently busy (Rate Limited). Please try again in a few minutes.');
      return;
    }

    // Push succeeded! NOW we can safely save locally and log in.
    originalSetItem('ocio_users', JSON.stringify(mergedForSave));
    originalSetItem('ocio_user', JSON.stringify(newUser));
    originalSetItem('ocio_logged_in', 'true');

    cloudSyncFull().catch(() => {});
    window.location.href = 'dashboard.html';
  });
}

async function initDashboard() {
  const dashBody = document.querySelector('.dashboard-body');
  if (!dashBody) return;
  // Skip if on withdraw or deposit page
  if (document.getElementById('wd-bank-form') || document.getElementById('dep-balance')) return;

  if (!requireAuth()) return;

  // Wait for cloud sync and then explicitly do another sync to ensure
  // the dashboard always shows the latest admin-set values.
  try {
    await window._cloudSyncReady;
    // Re-run a full sync to catch any admin changes made after page load started
    await cloudSyncFull();
  } catch(e) {}

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
async function initDeposit() {
  const depBal = document.getElementById('dep-balance');
  if (!depBal) return;
  if (!requireAuth()) return;

  try { await window._cloudSyncReady; } catch(e) {}

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
          id: generateTxId(),
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
          id: generateTxId(),
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
          id: generateTxId(),
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
  document.getElementById('admin-login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = document.getElementById('admin-user').value.trim();
    const pass = document.getElementById('admin-pass').value;
    const errEl = document.getElementById('admin-login-error');
    const submitBtn = document.querySelector('#admin-login-form button[type="submit"]');

    if (user === ADMIN_CREDS.username && pass === ADMIN_CREDS.password) {
      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Syncing...'; }
      // Full sync pulls all users, deposits, withdrawals from cloud before rendering
      try { await cloudSyncFull(); } catch(e) {}
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Sign In'; }

      loginScreen.style.display = 'none';
      dashboard.style.display = 'flex';
      renderAdminUsers();
      renderAdminGiftcards();
      renderAdminWithdrawals();
      renderAdminDeposits();
      populateFundSelect();
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
      if (btn.dataset.tab === 'email') populateEmailSelect();
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
    fundForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('fund-user-select').value;
      const amount = parseFloat(document.getElementById('fund-amount').value);
      const errEl = document.getElementById('fund-error');
      const sucEl = document.getElementById('fund-success');
      const submitBtn = fundForm.querySelector('button[type="submit"]');
      if (!email) { showError(errEl, 'Please select a client.'); return; }
      if (!amount || amount <= 0 || amount > 10000000) { showError(errEl, 'Amount must be $0.01 - $10,000,000.'); return; }

      // Disable button during operation
      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Saving...'; }

      // Fetch latest state from cloud with a GET (no PUT, no rate-limit risk)
      // so we apply the balance change on top of the true canonical data.
      try {
        const latestCloud = await cloudFetch();
        if (latestCloud && isCloudDataValid(latestCloud)) {
          SYNC_KEYS.forEach(k => {
            const val = latestCloud[k];
            if (val !== undefined) {
              originalSetItem(k, JSON.stringify(val));
            }
          });
        }
      } catch {}

      const users = getAllUsers();
      const u = users.find(u => u.email === email);
      if (u) {
        u.balance = (u.balance || 0) + amount;
        originalSetItem('ocio_users', JSON.stringify(users));

        // Add auto-approved deposit transaction
        let deps = [];
        try { deps = JSON.parse(localStorage.getItem('ocio_deposits')) || []; } catch {}

        const customDateVal = document.getElementById('fund-date').value;
        let transDate = '';
        if (customDateVal) {
          const parts = customDateVal.split('-');
          transDate = `${parseInt(parts[1])}/${parseInt(parts[2])}/${parts[0]}`;
        } else {
          transDate = new Date().toLocaleDateString('en-US');
        }

        deps.push({
          id: generateTxId(),
          email: u.email,
          name: u.name,
          method: 'Direct Credit',
          amount: amount,
          status: 'Approved',
          date: transDate
        });
        originalSetItem('ocio_deposits', JSON.stringify(deps));

        // Push with retries — a single PUT can be silently dropped under rate limiting
        let fundPushOk = false;
        for (let attempt = 1; attempt <= 4; attempt++) {
          if (attempt > 1) await new Promise(r => setTimeout(r, attempt * 700));
          try {
            fundPushOk = await cloudPushAll();
            if (fundPushOk) {
              console.log('[Admin] Funds pushed to cloud (attempt', attempt, ') for:', email);
              break;
            }
          } catch (err) {
            console.warn('[Admin] Fund push attempt', attempt, 'failed:', err);
          }
        }
        if (!fundPushOk) {
          console.warn('[Admin] All fund push attempts failed for:', email);
        }

        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Add Funds'; }
        sucEl.innerHTML = '<i class="fas fa-check-circle"></i> Added $' + amount.toLocaleString('en-US', {minimumFractionDigits:2}) + ' to ' + u.name;
        sucEl.hidden = false;
        fundForm.reset();
        renderAdminUsers();
        populateFundSelect();
        setTimeout(() => { sucEl.hidden = true; }, 4000);
      } else {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Add Funds'; }
        showError(errEl, 'User not found. Please sync and try again.');
      }
    });
  }

  // Send Email form
  const emailForm = document.getElementById('admin-email-form');
  if (emailForm) {
    emailForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = document.getElementById('email-user-select').value;
      const subject = document.getElementById('email-subject').value.trim();
      const body = document.getElementById('email-body').value.trim();
      const errEl = document.getElementById('email-error');
      const sucEl = document.getElementById('email-success');
      
      if (!email) { showError(errEl, 'Please select a client.'); return; }
      if (!subject) { showError(errEl, 'Please enter a subject.'); return; }
      if (!body) { showError(errEl, 'Please enter a message body.'); return; }

      sucEl.hidden = false;
      
      const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(email)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      
      setTimeout(() => {
        window.open(gmailUrl, '_blank', 'noopener,noreferrer');
        sucEl.hidden = true;
        emailForm.reset();
      }, 1000);
    });

    const mailtoBtn = document.getElementById('btn-mail-client');
    if (mailtoBtn) {
      mailtoBtn.addEventListener('click', () => {
        const email = document.getElementById('email-user-select').value;
        const subject = document.getElementById('email-subject').value.trim();
        const body = document.getElementById('email-body').value.trim();
        const errEl = document.getElementById('email-error');
        
        if (!email) { showError(errEl, 'Please select a client.'); return; }
        
        const mailtoUrl = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        window.location.href = mailtoUrl;
      });
    }
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
      <td style="vertical-align:middle;">
        <div style="display:flex; gap:6px; flex-wrap:nowrap;">
          <button class="admin-action-btn accept" style="background: var(--blue-600); border: 1px solid var(--blue-700); padding: 5px 8px; font-size: 0.75rem;" onclick="handleEmailUserClick('${u.email}')" title="Email User">
            <i class="fas fa-envelope"></i>
          </button>
          <button class="admin-action-btn" style="background: #f59e0b; border: 1px solid #d97706; color: #fff; padding: 5px 8px; font-size: 0.75rem; border-radius: 6px; font-weight: 700; cursor: pointer;" onclick="handleClearUserTransactions('${u.email}')" title="Clear Transactions">
            <i class="fas fa-eraser"></i> Clear Tx
          </button>
          <button class="admin-action-btn reject" style="background: #ef4444; border: 1px solid #dc2626; padding: 5px 8px; font-size: 0.75rem;" onclick="handleDeleteUser('${u.email}')" title="Delete User">
            <i class="fas fa-trash"></i> Delete
          </button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

window.handleAdminUserFeeChange = async function(email, newFeeVal) {
  if (newFeeVal === '' || isNaN(newFeeVal)) return;
  const users = getAllUsers();
  const u = users.find(user => user.email === email);
  if (u) {
    u.withdrawalFee = parseFloat(newFeeVal);
    // Use originalSetItem to avoid debounce, then push immediately
    originalSetItem('ocio_users', JSON.stringify(users));
    for (let attempt = 1; attempt <= 4; attempt++) {
      if (attempt > 1) await new Promise(r => setTimeout(r, attempt * 700));
      try { if (await cloudPushAll()) break; } catch {}
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

function populateEmailSelect() {
  const sel = document.getElementById('email-user-select');
  if (!sel) return;
  const users = getAllUsers();
  sel.innerHTML = '<option value="">-- Choose a client --</option>' +
    users.map(u => `<option value="${u.email}">${u.name} (${u.email})</option>`).join('');
}

window.handleEmailUserClick = function(email) {
  const emailBtn = document.querySelector('.dash-nav [data-tab="email"]');
  if (emailBtn) {
    emailBtn.click();
    const sel = document.getElementById('email-user-select');
    if (sel) {
      sel.value = email;
    }
  }
};

window.handleDeleteUser = async function(email) {
  if (!confirm(`Are you sure you want to permanently delete the user account for ${email}? This action cannot be undone.`)) {
    return;
  }
  const users = getAllUsers();
  const filteredUsers = users.filter(u => u.email !== email);
  originalSetItem('ocio_users', JSON.stringify(filteredUsers));
  
  // Also delete their deposits and withdrawals so we don't have orphan data
  let deps = [];
  let wds = [];
  try { deps = JSON.parse(localStorage.getItem('ocio_deposits')) || []; } catch {}
  try { wds = JSON.parse(localStorage.getItem('ocio_withdrawals')) || []; } catch {}
  
  const filteredDeps = deps.filter(d => d.email !== email);
  const filteredWds = wds.filter(w => w.email !== email);
  
  originalSetItem('ocio_deposits', JSON.stringify(filteredDeps));
  originalSetItem('ocio_withdrawals', JSON.stringify(filteredWds));
  
  // Push changes to cloud with retries
  for (let attempt = 1; attempt <= 4; attempt++) {
    if (attempt > 1) await new Promise(r => setTimeout(r, attempt * 700));
    try { if (await cloudPushAll()) break; } catch {}
  }
  
  alert(`User account ${email} and all associated transactions have been successfully deleted.`);
  renderAdminUsers();
  populateFundSelect();
  if (typeof populateEmailSelect === 'function') populateEmailSelect();
};

window.handleClearUserTransactions = async function(email) {
  if (!confirm(`Are you sure you want to clear the entire transaction history (deposits and withdrawals) for ${email}?`)) {
    return;
  }
  let deps = [];
  let wds = [];
  try { deps = JSON.parse(localStorage.getItem('ocio_deposits')) || []; } catch {}
  try { wds = JSON.parse(localStorage.getItem('ocio_withdrawals')) || []; } catch {}
  
  const filteredDeps = deps.filter(d => d.email !== email);
  const filteredWds = wds.filter(w => w.email !== email);
  
  originalSetItem('ocio_deposits', JSON.stringify(filteredDeps));
  originalSetItem('ocio_withdrawals', JSON.stringify(filteredWds));
  
  // Push changes to cloud with retries
  for (let attempt = 1; attempt <= 4; attempt++) {
    if (attempt > 1) await new Promise(r => setTimeout(r, attempt * 700));
    try { if (await cloudPushAll()) break; } catch {}
  }
  
  alert(`All transaction history for ${email} has been cleared.`);
};

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
      let actionBtnHtml = '';
      if (dStatus === 'Approved') {
        actionBtnHtml = `<button class="admin-action-btn reject" style="font-size: 0.72rem; padding: 4px 8px; background: #ef4444; border: none; border-radius: 4px; color: white; cursor: pointer; display: flex; align-items: center; gap: 4px;" onclick="handleDepositDeduct(${i})"><i class="fas fa-minus-circle"></i> Deduct</button>`;
      }
      statusHtml = `
        <div style="display:flex; flex-direction:column; gap:6px; align-items:flex-start; min-width:180px;">
          <div style="display:flex; align-items:center; gap:6px;">
            <span class="admin-badge-status ${statusClass}">${statusText}</span>
            ${actionBtnHtml}
          </div>
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
      originalSetItem('ocio_deposits', JSON.stringify(deps));
      renderAdminDeposits();
    }
  } else if (type === 'withdraw') {
    let wds = [];
    try { wds = JSON.parse(localStorage.getItem('ocio_withdrawals')) || []; } catch {}
    if (wds[index]) {
      wds[index].date = formattedDate;
      originalSetItem('ocio_withdrawals', JSON.stringify(wds));
      renderAdminWithdrawals();
    }
  }
  // Debounced push (reuses existing pattern) so rapid date edits coalesce into one PUT
  if (window._cloudPushTimeout) clearTimeout(window._cloudPushTimeout);
  window._cloudPushTimeout = setTimeout(async () => {
    for (let attempt = 1; attempt <= 3; attempt++) {
      if (attempt > 1) await new Promise(r => setTimeout(r, attempt * 600));
      try { if (await cloudPushAll()) break; } catch {}
    }
  }, 600);
};

window.handleDepositAction = async function(index, status) {
  let deps = [];
  try { deps = JSON.parse(localStorage.getItem('ocio_deposits')) || []; } catch {}
  if (deps[index] && deps[index].status === 'Pending') {
    deps[index].status = status;
    originalSetItem('ocio_deposits', JSON.stringify(deps));
    if (status === 'Approved') {
      const users = getAllUsers();
      const u = users.find(user => user.email === deps[index].email);
      if (u) {
        u.balance = (u.balance || 0) + parseFloat(deps[index].amount);
        originalSetItem('ocio_users', JSON.stringify(users));
      }
    }
    // Push with retries to survive rate limiting
    for (let attempt = 1; attempt <= 4; attempt++) {
      if (attempt > 1) await new Promise(r => setTimeout(r, attempt * 700));
      try { if (await cloudPushAll()) break; } catch {}
    }
    renderAdminDeposits();
    renderAdminUsers();
  }
};

window.handleDepositDeduct = async function(index) {
  let deps = [];
  try { deps = JSON.parse(localStorage.getItem('ocio_deposits')) || []; } catch {}
  if (deps[index] && deps[index].status === 'Approved') {
    const amount = parseFloat(deps[index].amount);
    const users = getAllUsers();
    const u = users.find(user => user.email === deps[index].email);
    if (u) {
      // Deduct the deposit amount
      u.balance = Math.max(0, (u.balance || 0) - amount);
      // Mark as Rejected (Declined)
      deps[index].status = 'Rejected';
      originalSetItem('ocio_users', JSON.stringify(users));
      originalSetItem('ocio_deposits', JSON.stringify(deps));

      // Push changes to cloud with retries
      for (let attempt = 1; attempt <= 4; attempt++) {
        if (attempt > 1) await new Promise(r => setTimeout(r, attempt * 700));
        try { if (await cloudPushAll()) break; } catch {}
      }
      renderAdminDeposits();
      renderAdminUsers();
      populateFundSelect();
    }
  }
};

window.handleWithdrawalAction = async function(index, status) {
  let wds = [];
  try { wds = JSON.parse(localStorage.getItem('ocio_withdrawals')) || []; } catch {}
  if (wds[index] && wds[index].status === 'Pending') {
    wds[index].status = status;
    originalSetItem('ocio_withdrawals', JSON.stringify(wds));
    if (status === 'Approved') {
      const users = getAllUsers();
      const u = users.find(user => user.email === wds[index].email);
      if (u) {
        u.balance = Math.max(0, (u.balance || 0) - parseFloat(wds[index].amount));
        originalSetItem('ocio_users', JSON.stringify(users));
      }
    }
    // Push with retries to survive rate limiting
    for (let attempt = 1; attempt <= 4; attempt++) {
      if (attempt > 1) await new Promise(r => setTimeout(r, attempt * 700));
      try { if (await cloudPushAll()) break; } catch {}
    }
    renderAdminWithdrawals();
    renderAdminUsers();
  }
};

/* ============================================
   WITHDRAW PAGE
   ============================================ */
async function initWithdraw() {
  const bankForm = document.getElementById('wd-bank-form');
  if (!bankForm) return;

  if (!requireAuth()) return;

  try { await window._cloudSyncReady; } catch(e) {}

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
      id: generateTxId(),
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
