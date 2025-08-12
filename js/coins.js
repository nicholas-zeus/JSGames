// js/coins.js
// Site-wide coin system (ES module)
// - IndexedDB for transactions (capped to 10k) + localStorage balance cache
// - Header badge, history modal (basic filters + paging), 2s toasts
// - Public toast(), centered on screen, and FULLSCREEN-SAFE (reparents to top layer)

export const Coins = (() => {
  // ---------- Config ----------
  const DB_NAME = 'coins-db';
  const DB_VERSION = 1;
  const STORE = 'tx'; // { seq(autoInc), ts, type:'earn'|'spend', amount, description, source, balanceAfter }
  const HARD_CAP = 10_000;

  const BAL_KEY = 'coins_balance';
  const FALLBACK_LOG_KEY = 'coins_tx_fallback';
  const FALLBACK_CAP = 500;

  // ---------- State ----------
  let balance = Number(localStorage.getItem(BAL_KEY) || 0);
  let bc; // BroadcastChannel
  let badgeBtn, modalBackdrop, modal, toastStack;
  const changeListeners = new Set();
  const nf = new Intl.NumberFormat();

  // ---------- Utilities ----------
  const now = () => Date.now();
  const byId = (id) => document.getElementById(id);
  const clampDesc = (d) => String(d ?? '').trim().slice(0, 140);
  const coinSVG = () =>
    `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#FFCF33"/><circle cx="12" cy="12" r="7.5" fill="none" stroke="rgba(0,0,0,.2)"/><text x="12" y="16" text-anchor="middle" font-size="11" font-weight="700" fill="#7A4">₵</text></svg>`;

  // Fullscreen helpers (for toast parenting)
  function fsElement() {
    return document.fullscreenElement
        || document.webkitFullscreenElement
        || document.mozFullScreenElement
        || document.msFullscreenElement
        || null;
  }
  function getToastParent() {
    // In fullscreen, toasts must be inside the fullscreen element (top layer)
    return fsElement() || document.body;
  }

  // Toasts (2s), centered; fullscreen-safe
  function toast(message) {
    if (!toastStack) {
      toastStack = document.createElement('div');
      toastStack.className = 'coin-toasts';
      toastStack.setAttribute('role', 'status');
      getToastParent().appendChild(toastStack);
    } else if (toastStack.parentNode !== getToastParent()) {
      // Move stack into/out of fullscreen element as needed
      getToastParent().appendChild(toastStack);
    }

    const t = document.createElement('div');
    t.className = 'coin-toast';
    t.innerHTML = `${coinSVG()} <span>${String(message)}</span>`;
    toastStack.appendChild(t);
    setTimeout(() => t.remove(), 2000);
  }

  function broadcast(evt, payload) {
    try { bc && bc.postMessage({ evt, payload }); } catch {}
    try { localStorage.setItem('__coins_ping__', String(Math.random())); } catch {}
  }

  // ---------- IndexedDB ----------
  function openDB() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) return reject(new Error('IDB not supported'));
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const s = db.createObjectStore(STORE, { keyPath: 'seq', autoIncrement: true });
          s.createIndex('ts', 'ts', { unique: false });
          s.createIndex('type', 'type', { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  function withStore(mode, fn) {
    return openDB().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const store = tx.objectStore(STORE);
      let result;
      Promise.resolve(fn(store)).then(r => { result = r; })
        .catch(reject);
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('IDB tx aborted'));
    }));
  }
  const reqToPromise = (req) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });

  async function countStore() {
    try { return await withStore('readonly', (s) => reqToPromise(s.count())); }
    catch { return 0; }
  }
  function trimOldest(n) {
    if (n <= 0) return Promise.resolve(0);
    return withStore('readwrite', (s) => new Promise((resolve, reject) => {
      let deleted = 0;
      const c = s.openCursor(); // oldest-first
      c.onsuccess = () => {
        const cur = c.result;
        if (cur && deleted < n) {
          s.delete(cur.primaryKey);
          deleted++;
          cur.continue();
        } else resolve(deleted);
      };
      c.onerror = () => reject(c.error);
    }));
  }
  async function insertTxn(txn) {
    try {
      await withStore('readwrite', (s) => reqToPromise(s.add(txn)));
      const c = await countStore();
      if (c > HARD_CAP) await trimOldest(c - HARD_CAP);
    } catch (e) {
      // fallback if IDB fails
      fallbackAppend(txn);
    }
  }
  async function readHistory({ offset = 0, limit = 25, type = 'all', search = '', since, until } = {}) {
    const items = [];
    let total = 0;
    try {
      await withStore('readonly', (s) => new Promise((resolve, reject) => {
        const req = s.openCursor(null, 'prev'); // newest-first
        let skipped = 0;
        const q = search?.toLowerCase().trim();
        req.onsuccess = () => {
          const cur = req.result;
          if (!cur) { resolve(); return; }
          const v = cur.value;
          if (type !== 'all' && v.type !== type) { cur.continue(); return; }
          if (since && v.ts < since) { cur.continue(); return; }
          if (until && v.ts > until) { cur.continue(); return; }
          if (q && !(`${v.description} ${v.source || ''}`.toLowerCase().includes(q))) { cur.continue(); return; }
          total++;
          if (skipped < offset) { skipped++; cur.continue(); return; }
          if (items.length < limit) items.push(v);
          cur.continue();
        };
        req.onerror = () => reject(req.error);
      }));
      return { items, total };
    } catch {
      // fallback read
      const list = fallbackRead().sort((a, b) => b.seq - a.seq);
      const filtered = list.filter(v => {
        if (type !== 'all' && v.type !== type) return false;
        if (since && v.ts < since) return false;
        if (until && v.ts > until) return false;
        if (search && !(`${v.description} ${v.source || ''}`.toLowerCase().includes(search.toLowerCase()))) return false;
        return true;
      });
      total = filtered.length;
      return { items: filtered.slice(offset, offset + limit), total };
    }
  }

  // ---------- Fallback (localStorage) ----------
  const fallbackRead = () => { try { return JSON.parse(localStorage.getItem(FALLBACK_LOG_KEY) || '[]'); } catch { return []; } };
  const fallbackWrite = (arr) => { try { localStorage.setItem(FALLBACK_LOG_KEY, JSON.stringify(arr)); } catch {} };
  function fallbackAppend(txn) {
    const arr = fallbackRead();
    arr.push({ ...txn, seq: (arr.at(-1)?.seq || 0) + 1 });
    const excess = arr.length - FALLBACK_CAP; if (excess > 0) arr.splice(0, excess);
    fallbackWrite(arr);
  }

  // ---------- UI ----------
  function mountBadge() {
    const root = document.querySelector('#coin-ui-root') || document.querySelector('.site-header');
    if (!root) return;
    badgeBtn = document.createElement('button');
    badgeBtn.className = 'coin-badge';
    badgeBtn.type = 'button';
    badgeBtn.innerHTML = `${coinSVG()} <span id="coinBalance">${nf.format(balance)}</span>`;
    badgeBtn.addEventListener('click', openModal);
    (document.querySelector('#coin-ui-root') || root).appendChild(badgeBtn);
  }
  function updateBadge() {
    const el = document.getElementById('coinBalance');
    if (el) el.textContent = nf.format(balance);
    const big = document.getElementById('coinBalanceBig');
    if (big) big.textContent = nf.format(balance);
  }

  function ensureModal() {
    if (!modalBackdrop) {
      modalBackdrop = document.createElement('div');
      modalBackdrop.className = 'coin-modal-backdrop';
      modalBackdrop.addEventListener('click', closeModal);
      document.body.appendChild(modalBackdrop);
    }
    if (!modal) {
      modal = document.createElement('div');
      modal.className = 'coin-modal';
      modal.innerHTML = `
        <header>
          <div style="display:flex;align-items:center;gap:.5rem">${coinSVG()}<strong>Coins</strong></div>
          <button type="button" aria-label="Close" id="coinClose" class="coin-badge">✕</button>
        </header>
        <div class="coin-body">
          <div style="margin:.25rem 0 .6rem; font-size:1.1rem;">Balance: <strong id="coinBalanceBig">${nf.format(balance)}</strong></div>
          <div class="coin-filters">
            <select id="coinType">
              <option value="all">All</option>
              <option value="earn">Earned</option>
              <option value="spend">Spent</option>
            </select>
            <input id="coinSearch" placeholder="Search description/source"/>
            <button id="coinRefresh">Refresh</button>
            <button id="coinExport">Export CSV</button>
          </div>
          <div id="coinList"></div>
        </div>
        <div class="coin-footer">
          <small id="coinCount">0 items</small>
          <div>
            <button id="coinPrev" class="coin-badge">Prev</button>
            <button id="coinNext" class="coin-badge">Next</button>
          </div>
        </div>`;
      document.body.appendChild(modal);
      byId('coinClose').onclick = closeModal;
      byId('coinRefresh').onclick = () => loadPage();
      byId('coinExport').onclick = exportCSV;
      byId('coinPrev').onclick = () => { page = Math.max(0, page - 1); loadPage(); };
      byId('coinNext').onclick = () => { page = page + 1; loadPage(); };
    }
  }
  function openModal() { ensureModal(); modalBackdrop.style.display = 'block'; modal.style.display = 'block'; page = 0; loadPage(); }
  function closeModal() { if (modalBackdrop) modalBackdrop.style.display = 'none'; if (modal) modal.style.display = 'none'; }

  let page = 0, pageSize = 25;
  async function loadPage() {
    updateBadge();
    const type = byId('coinType')?.value || 'all';
    const search = byId('coinSearch')?.value || '';
    const { items, total } = await readHistory({ offset: page * pageSize, limit: pageSize, type, search });
    byId('coinCount').textContent = `${total} items`;
    byId('coinList').innerHTML = items.map(renderRow).join('') || '<div style="opacity:.75">No items</div>';
  }
  function renderRow(v) {
    const date = new Date(v.ts).toLocaleString();
    const amt = (v.type === 'earn' ? '+' : '−') + nf.format(v.amount);
    const cls = v.type === 'earn' ? 'earn' : 'spend';
    const src = v.source ? ` • ${v.source}` : '';
    return `<div class="coin-row">
      <div class="date">${date}</div>
      <div class="amt ${cls}">${amt}</div>
      <div class="desc">${escapeHTML(v.description)}<small style="opacity:.7">${src}</small></div>
      <div class="bal">bal: ${nf.format(v.balanceAfter)}</div>
    </div>`;
  }
  function exportCSV() {
    readHistory({ offset: 0, limit: 10_000 }).then(({ items }) => {
      const rows = [['seq', 'ts', 'type', 'amount', 'description', 'source', 'balanceAfter']];
      items.sort((a, b) => a.seq - b.seq).forEach(v => rows.push([
        v.seq, new Date(v.ts).toISOString(), v.type, v.amount,
        (v.description || '').replaceAll('"', '""'), v.source || '', v.balanceAfter
      ]));
      const csv = rows.map(r => r.map(x => `"${String(x)}"`).join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'coins.csv'; a.click();
      URL.revokeObjectURL(url);
    });
  }
  function escapeHTML(s) { return String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])); }

  // ---------- Public API ----------
  async function init({ ui = true, source } = {}) {
    try { bc = new BroadcastChannel('coins'); bc.onmessage = (msg) => { if (msg?.data?.evt === 'balance') { balance = msg.data.payload; localStorage.setItem(BAL_KEY, String(balance)); updateBadge(); } }; } catch {}
    window.addEventListener('storage', (e) => { if (e.key === BAL_KEY) { balance = Number(localStorage.getItem(BAL_KEY) || 0); updateBadge(); } });
    try { if (navigator.storage?.persist) navigator.storage.persist(); } catch {}

    // React to fullscreen changes (reparent toast stack)
    ['fullscreenchange','webkitfullscreenchange','mozfullscreenchange','MSFullscreenChange']
      .forEach(ev => document.addEventListener(ev, () => { if (toastStack) getToastParent().appendChild(toastStack); }));

    // Sync cache with last txn if possible
    try {
      await openDB();
      const last = await withStore('readonly', (s) => new Promise((resolve, reject) => {
        const req = s.openCursor(null, 'prev');
        req.onsuccess = () => resolve(req.result?.value || null);
        req.onerror = () => reject(req.error);
      }));
      if (last && last.balanceAfter !== balance) {
        balance = Number(last.balanceAfter) || 0;
        localStorage.setItem(BAL_KEY, String(balance));
      }
    } catch {
      balance = Number(localStorage.getItem(BAL_KEY) || 0);
    }

    if (ui) { mountBadge(); updateBadge(); }
  }

  function getBalance() { return balance; }

  async function add(amount, description, meta) {
    const amt = Number(amount), desc = clampDesc(description);
    if (!Number.isInteger(amt) || amt <= 0) throw new Error('amount must be positive integer');
    if (!desc) throw new Error('description required');
    const txn = { ts: now(), type: 'earn', amount: amt, description: desc, source: meta?.source || meta?.page || undefined, balanceAfter: balance + amt };
    balance += amt; localStorage.setItem(BAL_KEY, String(balance)); updateBadge();
    toast(`+${nf.format(amt)} • ${desc}`); broadcast('balance', balance);
    await insertTxn(txn); changeListeners.forEach(cb => cb(balance, txn));
    return { ok: true, balance };
  }

  async function spend(amount, description, meta) {
    const amt = Number(amount), desc = clampDesc(description);
    if (!Number.isInteger(amt) || amt <= 0) throw new Error('amount must be positive integer');
    if (!desc) throw new Error('description required');
    if (balance < amt) return { ok: false, reason: 'insufficient', balance };
    const txn = { ts: now(), type: 'spend', amount: amt, description: desc, source: meta?.source || meta?.page || undefined, balanceAfter: balance - amt };
    balance -= amt; localStorage.setItem(BAL_KEY, String(balance)); updateBadge();
    toast(`-${nf.format(amt)} • ${desc}`); broadcast('balance', balance);
    await insertTxn(txn); changeListeners.forEach(cb => cb(balance, txn));
    return { ok: true, balance };
  }

  async function getHistory(opts) { return readHistory(opts); }
  function onChange(cb) { changeListeners.add(cb); return () => changeListeners.delete(cb); }

  // Expose
  return {
    init, getBalance, add, spend, getHistory, onChange,
    // public toaster: 2s auto-dismiss, same look as coin add/spend
    toast: (message) => toast(String(message)),
  };
})();
