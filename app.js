/* จดสลิป — main app */
(function () {
  'use strict';
  const APP_VERSION = '0.1.2';
  const $ = (s, el = document) => el.querySelector(s);
  const app = $('#app');
  const layer = $('#layer');

  /* ================= storage (IndexedDB, memory fallback) ================= */
  const DB = (() => {
    let db = null;
    const mem = { tx: new Map(), kv: new Map() };
    function open() {
      return new Promise((res) => {
        try {
          const r = indexedDB.open('jodslip', 1);
          r.onupgradeneeded = () => {
            const d = r.result;
            if (!d.objectStoreNames.contains('tx')) d.createObjectStore('tx', { keyPath: 'id' });
            if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
          };
          r.onsuccess = () => { db = r.result; res(true); };
          r.onerror = () => res(false);
        } catch (e) { res(false); }
      });
    }
    function store(name, mode) { return db.transaction(name, mode).objectStore(name); }
    const wrap = (req) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
    return {
      get ok() { return !!db; },
      open,
      async allTx() { if (!db) return [...mem.tx.values()]; return wrap(store('tx', 'readonly').getAll()); },
      async putTx(t) { if (!db) { mem.tx.set(t.id, t); return; } return wrap(store('tx', 'readwrite').put(t)); },
      async delTx(id) { if (!db) { mem.tx.delete(id); return; } return wrap(store('tx', 'readwrite').delete(id)); },
      async clearTx() { if (!db) { mem.tx.clear(); return; } return wrap(store('tx', 'readwrite').clear()); },
      async get(k) { if (!db) return mem.kv.get(k); return wrap(store('kv', 'readonly').get(k)); },
      async set(k, v) { if (!db) { mem.kv.set(k, v); return; } return wrap(store('kv', 'readwrite').put(v, k)); },
    };
  })();

  /* ================= categories ================= */
  const DEFAULT_CATS = [
    { id: 'food', kind: 'expense', e: '🍜', n: 'อาหาร' },
    { id: 'travel', kind: 'expense', e: '🚕', n: 'เดินทาง' },
    { id: 'home', kind: 'expense', e: '🧺', n: 'ของใช้' },
    { id: 'shop', kind: 'expense', e: '🛍️', n: 'ช้อปปิ้ง' },
    { id: 'bills', kind: 'expense', e: '💡', n: 'บิล/ค่าน้ำไฟ' },
    { id: 'rent', kind: 'expense', e: '🏠', n: 'ค่าหอ/ที่พัก' },
    { id: 'trip', kind: 'expense', e: '🏕️', n: 'เที่ยว' },
    { id: 'fun', kind: 'expense', e: '🎬', n: 'บันเทิง' },
    { id: 'health', kind: 'expense', e: '💊', n: 'สุขภาพ' },
    { id: 'study', kind: 'expense', e: '📚', n: 'เรียน' },
    { id: 'gift', kind: 'expense', e: '💝', n: 'ให้พ่อ/แม่' },
    { id: 'other', kind: 'expense', e: '📦', n: 'อื่นๆ' },
    { id: 'allow', kind: 'income', e: '💰', n: 'เงินเดือน/ค่าขนม' },
    { id: 'job', kind: 'income', e: '💼', n: 'งานเสริม' },
    { id: 'recv', kind: 'income', e: '📥', n: 'ได้รับโอน' },
    { id: 'inc_other', kind: 'income', e: '✨', n: 'รายรับอื่นๆ' },
  ];
  // order matters: specific before broad
  const KEYWORDS = [
    ['travel', ['bolt', 'grab', 'กลับหอ', 'กลีบหอ', 'ไปหอ', 'กลับบ้าน', 'ขนส่งมวลชน', 'ขสมก', 'องค์การขนส่ง', 'รถบัส', 'วิน', 'มอไซ', 'แท็กซี่', 'taxi', 'bts', 'mrt', 'รถไฟ', 'รถเมล์', 'รถตู้', 'น้ำมัน', 'ทางด่วน', 'ค่ารถ', 'เรือ', 'สองแถว', 'ptt', 'ปตท', 'muvmi', 'ตั๋วรถ', 'ค่าเดินทาง', 'ที่จอดรถ']],
    ['trip', ['อุทยาน', 'ที่พัก', 'โรงแรม', 'รีสอร์ท', 'ทริป', 'เที่ยว', 'แคมป์', 'agoda', 'booking', 'airbnb', 'ตั๋วเครื่องบิน', 'airasia', 'nokair']],
    ['rent', ['ค่าหอ', 'ค่าห้อง', 'ค่าเช่า', 'หอพัก', 'คอนโด']],
    ['bills', ['ค่าไฟ', 'ค่าน้ำ', 'เน็ต', 'internet', 'wifi', 'ค่าโทร', 'ais', 'dtac', 'truemove', 'true', '3bb', 'netflix', 'spotify', 'youtube', 'icloud', 'google', 'ค่าบัตร', 'ประกัน']],
    ['study', ['หนังสือ', 'ค่าเทอม', 'ปริ้น', 'print', 'ถ่ายเอกสาร', 'คอร์ส', 'ชีท', 'เครื่องเขียน', 'ค่าเรียน']],
    ['health', ['ร้านยา', 'ค่ายา', 'ซื้อยา', 'หมอ', 'คลินิก', 'โรงพยาบาล', 'ทำฟัน', 'ฟิตเนส', 'gym', 'วิตามิน']],
    ['fun', ['ดูหนัง', 'โรงหนัง', 'major', 'sf ', 'เกม', 'game', 'steam', 'คอนเสิร์ต', 'คาราโอเกะ', 'บัตรคอน']],
    ['gift', ['ให้พ่อ', 'ให้แม่', 'ส่งพ่อ', 'ส่งแม่', 'ส่งเงินบ้าน', 'ส่งบ้าน', 'เงินพ่อ', 'เงินแม่', 'ค่าขนมพ่อ', 'ค่าขนมแม่']],
    ['shop', ['shopee', 'lazada', 'tiktok', 'เสื้อ', 'กางเกง', 'รองเท้า', 'กระเป๋า', 'ขาตั้ง', 'กล้อง', 'หูฟัง', 'สายชาร์จ', 'uniqlo', 'ไอที']],
    ['home', ['ของใช้', 'สบู่', 'ยาสีฟัน', 'ผงซักฟอก', 'ซักผ้า', 'ทิชชู่', 'แชมพู', 'lotus', 'โลตัส', 'bigc', 'บิ๊กซี', 'makro', 'แม็คโคร', 'tops', 'ท็อปส์', 'watsons', 'boots']],
    ['food', ['ข้าว', 'กับข้าว', 'ก๋วยเตี๋ยว', 'บัวลอย', 'ขนม', 'ชานม', 'ชาเย็น', 'ชาไทย', 'กาแฟ', 'cafe', 'coffee', 'ส้มตำ', 'หมูกระทะ', 'ชาบู', 'ปิ้งย่าง', 'บุฟเฟ่ต์', 'หมู', 'ไก่', 'ไข่', 'ผลไม้', 'มื้อ', 'อาหาร', 'ไอติม', 'ไอศกรีม', 'เครป', 'ขนมปัง', 'น้ำปั่น', 'นม', 'starbucks', 'kfc', 'mcdonald', 'mk', '7-11', '711', 'เซเว่น', 'lineman', 'foodpanda', 'grabfood', 'robinhood', 'ข้าวมัน', 'ราดหน้า', 'โจ๊ก', 'สุกี้', 'หมาล่า', 'ปลา', 'กุ้ง', 'ยำ', 'ลูกชิ้น', 'โรตี', 'ไส้กรอก', 'ไส้หมู', 'คอหมู', 'แหนม', 'แมลง', 'ทอด', 'ย่าง', 'ปิ้ง', 'ผัด', 'แกง', 'ต้ม', 'เลม่อน', 'มะนาว', 'น้ำผึ้ง', 'น้ำปั่น', 'น้ำส้ม', 'โกโก้', 'ชา', 'น้ำ']],
  ];
  const INCOME_KEYWORDS = [
    ['allow', ['เงินเดือน', 'ค่าขนม', 'เงินใช้', 'รายเดือน']],
    ['job', ['ค่าจ้าง', 'ค่าสอน', 'ฟรีแลนซ์', 'freelance', 'ค่างาน', 'ติว']],
  ];
  const SPLIT_HINTS = ['กับข้าว', 'มื้อเย็น', 'ข้าวเย็น', 'หาร', 'ของเข้าห้อง', 'ของใช้ในห้อง'];

  /* ================= state ================= */
  const S = {
    settings: null,
    txs: [],
    view: 'home',
    month: ymOf(new Date()),
    queue: [], qi: 0,
    installEvt: null,
    ocr: { worker: null, status: 'idle', progress: 0, error: null },
  };

  function defaultSettings() {
    return {
      onboarded: false, myNames: '', partnerName: '', budget: 0,
      customCats: [], learn: { memo: {}, party: {}, fix: {} }, ocrReady: false, lastSettleAt: null,
    };
  }
  const cats = () => DEFAULT_CATS.concat(S.settings.customCats || []);
  const catById = (id) => cats().find((c) => c.id === id) || DEFAULT_CATS.find((c) => c.id === 'other');
  const myNameList = () => (S.settings.myNames || '').split(/[,،\n]/).map((s) => s.trim()).filter(Boolean);
  const partnerList = () => (S.settings.partnerName || '').split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
  const partnerLabel = () => partnerList()[0] || 'แฟน';

  async function saveSettings() { await DB.set('settings', S.settings); }

  /* ================= utils ================= */
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function pad(n) { return String(n).padStart(2, '0'); }
  function ymOf(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; }
  function todayISO() { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
  function nowTime() { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function money(n, opts = {}) {
    const v = Math.round((+n || 0) * 100) / 100;
    const s = Math.abs(v).toLocaleString('th-TH', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 });
    return (opts.sign && v > 0 ? '+' : opts.sign && v < 0 ? '−' : v < 0 ? '−' : '') + '฿' + s;
  }
  const dFmt = (iso, o) => { try { return new Intl.DateTimeFormat('th-TH', o).format(new Date(iso + 'T12:00')); } catch (e) { return iso; } };
  const monthLabel = (ym) => dFmt(ym + '-01', { month: 'long', year: 'numeric' });
  const dayLabel = (iso) => {
    const t = todayISO();
    const y = new Date(); y.setDate(y.getDate() - 1);
    if (iso === t) return 'วันนี้';
    if (iso === `${y.getFullYear()}-${pad(y.getMonth() + 1)}-${pad(y.getDate())}`) return 'เมื่อวาน';
    return dFmt(iso, { weekday: 'short', day: 'numeric', month: 'short' });
  };
  const fullDate = (iso) => dFmt(iso, { day: 'numeric', month: 'short', year: 'numeric' });
  const normText = (s) => (s || '').toLowerCase().replace(/[\s.,\-_:;!?'"()]/g, '');
  function addMonths(ym, k) { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 + k, 1); return ymOf(d); }
  function daysIn(ym) { const [y, m] = ym.split('-').map(Number); return new Date(y, m, 0).getDate(); }

  function toast(msg, ms = 2400) {
    const t = document.createElement('div');
    t.className = 'toast'; t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), ms);
  }

  /* ================= money logic ================= */
  // How much of this record counts as *my* expense / income
  function myExpense(t) {
    if (t.type !== 'expense') return 0;
    if (t.splitMode && t.splitMode !== 'none') return +t.myShare || 0;
    return t.payer === 'partner' ? 0 : +t.amount || 0;
  }
  function myIncome(t) { return t.type === 'income' ? +t.amount || 0 : 0; }
  function splitDelta(t) {
    // + : partner owes me, − : I owe partner
    if (t.type !== 'expense' || !t.splitMode || t.splitMode === 'none' || t.settled) return 0;
    const share = +t.myShare || 0;
    return t.payer === 'partner' ? -share : (+t.amount || 0) - share;
  }
  const openSplitBalance = () => S.txs.reduce((a, t) => a + splitDelta(t), 0);
  function monthTx(ym) { return S.txs.filter((t) => (t.date || '').startsWith(ym)); }
  function sumMonth(ym) {
    const list = monthTx(ym);
    return {
      expense: list.reduce((a, t) => a + myExpense(t), 0),
      income: list.reduce((a, t) => a + myIncome(t), 0),
      count: list.length,
    };
  }
  function sortTx(list) {
    return list.slice().sort((a, b) => ((b.date || '') + (b.time || '')).localeCompare((a.date || '') + (a.time || '')) || (b.createdAt || 0) - (a.createdAt || 0));
  }

  /* ================= category guessing & learning ================= */
  function guessCategory(type, memo, party) {
    const learn = S.settings.learn || { memo: {}, party: {} };
    const m = normText(memo);
    const kindOk = (id) => { const c = cats().find((x) => x.id === id); return c && c.kind === (type === 'income' ? 'income' : 'expense'); };
    if (m && learn.memo[m] && kindOk(learn.memo[m].cat)) return learn.memo[m].cat;
    if (m) {
      let best = null;
      for (const k of Object.keys(learn.memo)) if (k.length >= 3 && m.includes(k) && kindOk(learn.memo[k].cat) && (!best || k.length > best.length)) best = k;
      if (best) return learn.memo[best].cat;
    }
    const p = SlipParser.normName(party);
    if (p && learn.party[p] && kindOk(learn.party[p])) return learn.party[p];
    const hay = (memo + ' ' + (party || '')).toLowerCase();
    const memoL = (memo || '').toLowerCase();
    const table = type === 'income' ? INCOME_KEYWORDS : KEYWORDS;
    for (const src of [memoL, hay]) {
      for (const [cat, words] of table) if (words.some((w) => src.includes(w))) return cat;
    }
    return type === 'income' ? 'recv' : 'other';
  }
  function guessSplit(memo) {
    const m = normText(memo);
    const learn = S.settings.learn || { memo: {} };
    if (m && learn.memo[m] && learn.memo[m].split) return learn.memo[m].split;
    return SPLIT_HINTS.some((w) => (memo || '').includes(w)) ? 'half' : 'none';
  }
  function learnFrom(t, ocrMemo) {
    const L = S.settings.learn || (S.settings.learn = { memo: {}, party: {}, fix: {} });
    L.fix = L.fix || {};
    // remember how the user corrected a misread note, so the same misread is fixed next time
    const raw = normText(ocrMemo);
    if (raw && raw !== normText(t.memo) && t.memo) L.fix[raw] = t.memo;
    if (raw && L.fix[raw] && raw !== normText(t.memo) && !t.memo) delete L.fix[raw];
    if (t.type !== 'expense' && t.type !== 'income') return;
    const m = normText(t.memo);
    if (m) L.memo[m] = { cat: t.category, split: t.type === 'expense' ? (t.splitMode || 'none') : undefined };
    const p = SlipParser.normName(t.party);
    if (p && p.length >= 3) L.party[p] = t.category;
  }

  /* ================= drafts ================= */
  function blankDraft() {
    return {
      id: null, source: 'manual', type: 'expense', amount: '', memo: '', party: '', category: 'food',
      date: todayISO(), time: nowTime(), payer: 'me', splitMode: 'none', myShare: '',
      bank: null, bankName: null, ref: null, dedupeKey: null, thumb: null, checks: {},
    };
  }
  function draftFromSlip(p, thumb, info) {
    const me = myNameList(), partner = partnerList();
    const rMe = !!p.receiver && SlipParser.matchesAny(p.receiver, me);
    const sPartner = !!p.sender && SlipParser.matchesAny(p.sender, partner);
    let type = 'expense', party = p.receiver;
    // Slips on this phone are almost always our own outgoing transfers, so a transfer whose
    // receiver is us is a move between our own accounts — unless it clearly came from the partner.
    if (p.sender && p.receiver && SlipParser.sameName(p.sender, p.receiver)) type = 'self';
    else if (rMe && sPartner) { type = 'income'; party = p.sender; }
    else if (rMe) type = 'self';
    else if (p.receiver && SlipParser.matchesAny(p.receiver, partner) && openSplitBalance() < 0) type = 'settle';
    const fix = (S.settings.learn.fix || {})[normText(p.memo)];
    const memo = fix || p.memo || '';
    const d = blankDraft();
    Object.assign(d, {
      source: 'slip', type, amount: p.amount != null ? String(p.amount) : '', memo, party: party || '',
      date: p.date || todayISO(), time: p.time || '', bank: p.bank, bankName: p.bankName, ref: p.ref,
      dedupeKey: info.dedupeKey, thumb, kind: p.kind, ocrMemo: p.memo || '',
    });
    d.category = guessCategory(type, memo, party);
    d.splitMode = type === 'expense' ? guessSplit(memo) : 'none';
    if (d.splitMode === 'half' && d.amount) d.myShare = String(Math.round(+d.amount * 50) / 100);
    d.checks = {
      amount: p.amount == null || p.amountFrom === 'guess',
      date: !p.date,
      time: !p.time,
      memo: !p.memoFound && !fix,
      party: !party,
    };
    d.ocrFailed = !!info.ocrFailed;
    return d;
  }
  function draftFromTx(t) {
    return Object.assign(blankDraft(), JSON.parse(JSON.stringify(t)), {
      amount: String(t.amount ?? ''), myShare: t.myShare != null ? String(t.myShare) : '', checks: {},
    });
  }
  function draftToTx(d) {
    const amount = Math.round(parseFloat(String(d.amount).replace(/,/g, '')) * 100) / 100;
    if (!(amount > 0)) return { error: 'ใส่จำนวนเงินก่อนนะ' };
    let myShare = null;
    let splitMode = d.type === 'expense' ? d.splitMode || 'none' : 'none';
    if (splitMode === 'half') myShare = Math.round(amount * 50) / 100;
    if (splitMode === 'custom') {
      myShare = Math.round(parseFloat(String(d.myShare).replace(/,/g, '')) * 100) / 100;
      if (!(myShare >= 0) || myShare > amount) return { error: 'ส่วนของเราต้องอยู่ระหว่าง 0 ถึงยอดรวม' };
    }
    return {
      tx: {
        id: d.id || uid(), source: d.source, type: d.type, amount, memo: (d.memo || '').trim(), party: (d.party || '').trim(),
        category: d.type === 'expense' || d.type === 'income' ? d.category : null,
        date: d.date || todayISO(), time: d.time || '', payer: d.source === 'manual' ? d.payer : 'me',
        splitMode, myShare, settled: !!d.settled,
        bank: d.bank || null, bankName: d.bankName || null, ref: d.ref || null, dedupeKey: d.dedupeKey || null,
        thumb: d.thumb || null, kind: d.kind || null, createdAt: d.createdAt || Date.now(), demo: !!d.demo,
      },
    };
  }

  /* ================= image / QR / OCR ================= */
  const CDN = {
    tesseract: 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js',
    worker: 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js',
    core: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5',
    jsqr: 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js',
  };
  const hasSW = () => !!(navigator.serviceWorker && navigator.serviceWorker.controller);
  const local = (p) => new URL('./vendor/' + p, location.href).href;
  const loaded = {};
  function loadScript(src) {
    if (loaded[src]) return loaded[src];
    loaded[src] = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.async = true; s.onload = res;
      s.onerror = () => { delete loaded[src]; rej(new Error('load ' + src)); };
      document.head.appendChild(s);
    });
    return loaded[src];
  }

  async function fileToCanvas(file) {
    let src;
    try { src = await createImageBitmap(file); } catch (e) {
      src = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); });
    }
    const w = src.width, h = src.height;
    const k = Math.min(1, 2200 / Math.max(w, h));
    const c = document.createElement('canvas');
    c.width = Math.round(w * k); c.height = Math.round(h * k);
    c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
    return c;
  }
  function thumbOf(canvas) {
    const w = 360, k = w / canvas.width;
    const c = document.createElement('canvas');
    c.width = w; c.height = Math.round(canvas.height * k);
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
    x.drawImage(canvas, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.62);
  }

  async function detectQR(canvas) {
    if ('BarcodeDetector' in window) {
      try {
        const det = new window.BarcodeDetector({ formats: ['qr_code'] });
        const r = await det.detect(canvas);
        if (r && r.length) { const b = r[0].boundingBox; return { text: r[0].rawValue, box: { x: b.x, y: b.y, w: b.width, h: b.height } }; }
      } catch (e) { /* fall through */ }
    }
    try {
      await loadScript(hasSW() ? local('jsQR.js') : CDN.jsqr);
      for (const scale of [1, 0.6]) {
        const w = Math.round(canvas.width * scale), h = Math.round(canvas.height * scale);
        let ctx, cw = canvas;
        if (scale !== 1) { cw = document.createElement('canvas'); cw.width = w; cw.height = h; cw.getContext('2d').drawImage(canvas, 0, 0, w, h); }
        ctx = cw.getContext('2d', { willReadFrequently: true });
        const img = ctx.getImageData(0, 0, w, h);
        const q = window.jsQR(img.data, w, h, { inversionAttempts: 'dontInvert' });
        if (q && q.data) {
          const L = q.location, xs = [L.topLeftCorner.x, L.topRightCorner.x, L.bottomLeftCorner.x, L.bottomRightCorner.x], ys = [L.topLeftCorner.y, L.topRightCorner.y, L.bottomLeftCorner.y, L.bottomRightCorner.y];
          const x = Math.min(...xs) / scale, y = Math.min(...ys) / scale;
          return { text: q.data, box: { x, y, w: (Math.max(...xs) / scale) - x, h: (Math.max(...ys) / scale) - y } };
        }
      }
    } catch (e) { /* no QR lib */ }
    return null;
  }

  function prepForOCR(canvas, qrBox) {
    const target = Math.max(1000, Math.min(1400, canvas.width));
    const k = target / canvas.width;
    const c = document.createElement('canvas');
    c.width = Math.round(canvas.width * k); c.height = Math.round(canvas.height * k);
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(canvas, 0, 0, c.width, c.height);
    if (qrBox) { // cover the QR so it doesn't become noise text
      const p = 14;
      x.fillStyle = '#fff';
      x.fillRect(qrBox.x * k - p, qrBox.y * k - p, qrBox.w * k + 2 * p, qrBox.h * k + 2 * p);
    }
    const img = x.getImageData(0, 0, c.width, c.height), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      let g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      g = (g - 70) * (255 / 140); // stretch: dark text darker, pale backgrounds white
      g = g < 0 ? 0 : g > 255 ? 255 : g;
      d[i] = d[i + 1] = d[i + 2] = g;
    }
    x.putImageData(img, 0, 0);
    return c;
  }

  async function ensureOCR(onProgress) {
    if (S.ocr.worker) return S.ocr.worker;
    if (S.ocr.loading) return S.ocr.loading;
    S.ocr.status = 'loading';
    S.ocr.loading = (async () => {
      const sw = hasSW();
      await loadScript(sw ? local('tesseract.min.js') : CDN.tesseract);
      const opts = {
        logger: (m) => {
          if (m && typeof m.progress === 'number' && /load|init/i.test(m.status || '')) { S.ocr.progress = m.progress; onProgress && onProgress(m); }
        },
      };
      if (sw) Object.assign(opts, { workerPath: local('worker.min.js'), corePath: local('core/'), langPath: local('lang'), workerBlobURL: false });
      else Object.assign(opts, { workerPath: CDN.worker, corePath: CDN.core });
      const w = await window.Tesseract.createWorker(['tha', 'eng'], 1, opts);
      await w.setParameters({ tessedit_pageseg_mode: '6', preserve_interword_spaces: '1' });
      S.ocr.worker = w; S.ocr.status = 'ready';
      if (!S.settings.ocrReady) { S.settings.ocrReady = true; saveSettings(); }
      return w;
    })().catch((e) => { S.ocr.status = 'error'; S.ocr.error = e; S.ocr.loading = null; throw e; });
    return S.ocr.loading;
  }

  // Re-read the "บันทึกช่วยจำ" line on its own, enlarged, as a single text line.
  // Keep whichever reading Tesseract is more confident about.
  async function rereadMemo(w, canvas, data, text) {
    try {
      const lines = (data && data.lines) || [];
      const i = lines.findIndex((l) => /บันทึก|ช่วยจ/.test((l.text || '').replace(/\s+/g, '')));
      if (i < 0) return text;
      let line = lines[i];
      const rest = (line.text || '').replace(/\s+/g, '').replace(/^.*?(บันทึกช่วยจ[ำา]|ช่วยจ[ำา]|บันทึก)[:：]?/, '');
      if (!rest && lines[i + 1]) line = lines[i + 1]; // SCB puts the note on the next line
      const b = line.bbox; if (!b) return text;
      const pad = 8, x0 = Math.max(0, b.x0 - pad), y0 = Math.max(0, b.y0 - pad);
      const cw = Math.min(canvas.width, b.x1 + pad) - x0, ch = Math.min(canvas.height, b.y1 + pad) - y0;
      if (cw < 20 || ch < 8) return text;
      const k = 2.2, c = document.createElement('canvas');
      c.width = Math.round(cw * k); c.height = Math.round(ch * k) + 40;
      const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
      x.imageSmoothingQuality = 'high';
      x.drawImage(canvas, x0, y0, cw, ch, 0, 20, c.width, c.height - 40);
      await w.setParameters({ tessedit_pageseg_mode: '7' });
      const r2 = await w.recognize(c);
      await w.setParameters({ tessedit_pageseg_mode: '6' });
      const t2 = (r2.data.text || '').trim();
      if (!t2 || (r2.data.confidence || 0) < (line.confidence || 0)) return text;
      const all = text.split('\n');
      const at = all.findIndex((l) => l.trim() === (line.text || '').trim());
      if (at < 0) return text;
      all[at] = line === lines[i] && !/บันทึก|ช่วยจ/.test(t2.replace(/\s+/g, '')) ? 'บันทึกช่วยจำ: ' + t2 : t2;
      return all.join('\n');
    } catch (e) {
      try { await w.setParameters({ tessedit_pageseg_mode: '6' }); } catch (e2) { /* ignore */ }
      return text;
    }
  }

  /* ================= import pipeline ================= */
  async function importFiles(files) {
    files = [...files].filter((f) => /^image\//.test(f.type) || /\.(jpe?g|png|webp|heic)$/i.test(f.name));
    if (!files.length) return;
    const st = { total: files.length, done: 0, dup: 0, phase: 'กำลังเตรียม…', ocrNote: '' };
    const drafts = [];
    renderProcessing(st);
    const keys = new Set(S.txs.map((t) => t.dedupeKey).filter(Boolean));
    let ocrOk = true;
    for (const f of files) {
      st.phase = `กำลังอ่านสลิป ${st.done + 1} จาก ${st.total}`; renderProcessing(st);
      try {
        const canvas = await fileToCanvas(f);
        const qr = await detectQR(canvas);
        const pq = qr ? SlipParser.parseQR(qr.text) : null;
        const key = pq ? (pq.ref ? `${pq.bankCode || ''}:${pq.ref}` : 'qr:' + pq.raw) : null;
        if (key && keys.has(key)) { st.dup++; st.done++; continue; }
        const thumb = thumbOf(canvas);
        let text = '', ocrFailed = false;
        if (ocrOk) {
          try {
            const w = await ensureOCR((m) => { st.ocrNote = `โหลดตัวอ่านสลิป ${Math.round((m.progress || 0) * 100)}% (ครั้งแรกครั้งเดียว)`; renderProcessing(st); });
            st.ocrNote = ''; renderProcessing(st);
            const prepped = prepForOCR(canvas, qr && qr.box);
            const r = await w.recognize(prepped);
            text = r.data.text || '';
            text = await rereadMemo(w, prepped, r.data, text);
          } catch (e) {
            console.warn('OCR unavailable', e); ocrOk = false; ocrFailed = true;
          }
        } else ocrFailed = true;
        const p = SlipParser.parseSlip(text, qr && qr.text);
        let dkey = key;
        if (!dkey && p.amount && p.date && p.time) dkey = `sig:${p.date}T${p.time}:${p.amount}`;
        if (dkey && keys.has(dkey)) { st.dup++; st.done++; continue; }
        if (dkey) keys.add(dkey);
        drafts.push(draftFromSlip(p, thumb, { dedupeKey: dkey, ocrFailed }));
      } catch (e) {
        console.error(e);
      }
      st.done++;
    }
    closeLayer();
    if (!drafts.length) { toast(st.dup ? `ทุกใบบันทึกไว้แล้ว (ข้าม ${st.dup} ใบ)` : 'อ่านรูปไม่ได้ ลองเลือกใหม่อีกครั้ง'); return; }
    // oldest first so review follows the timeline
    drafts.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    S.queue = drafts; S.qi = 0; S.queueDup = st.dup; S.queueOcrFailed = !ocrOk;
    renderReview();
  }

  /* ================= rendering: main views ================= */
  function render() {
    document.querySelectorAll('#tabs [data-nav]').forEach((b) => b.classList.toggle('on', b.dataset.nav === S.view));
    const v = { home: viewHome, summary: viewSummary, split: viewSplit, settings: viewSettings, guide: viewGuide }[S.view] || viewHome;
    app.innerHTML = v();
    afterRender();
  }

  const header = (title, withMonth) => `
    <div class="top">
      <div class="brand"><img src="icon-192.png" alt="">${esc(title)}</div>
      ${withMonth ? `<div class="month"><button data-action="mprev" aria-label="เดือนก่อน">‹</button><span>${esc(monthLabel(S.month))}</span><button data-action="mnext" aria-label="เดือนถัดไป">›</button></div>` : ''}
    </div>`;

  function txRow(t) {
    const c = t.category ? catById(t.category) : null;
    let ico = c ? c.e : t.type === 'self' ? '🔁' : t.type === 'settle' ? '🤝' : '📦';
    let title = t.memo || (c ? c.n : '') || t.party || 'รายการ';
    let sub = [t.party && t.memo ? t.party : (c && t.memo ? c.n : ''), t.time].filter(Boolean).join(' · ');
    let amt, cls;
    if (t.type === 'expense') {
      const mine = myExpense(t);
      cls = 'ex'; amt = money(-(t.payer === 'partner' && t.splitMode === 'none' ? 0 : mine));
      if (t.splitMode && t.splitMode !== 'none') amt += `<span class="sub-amt">จากทั้งหมด ${money(t.amount)}</span>`;
    } else if (t.type === 'income') { cls = 'in'; amt = money(t.amount, { sign: true }); }
    else { cls = 'nc'; amt = money(t.amount) + `<span class="sub-amt">ไม่นับ</span>`; }
    let tags = '';
    if (t.type === 'expense' && t.splitMode && t.splitMode !== 'none') tags += `<span class="tag">${t.payer === 'partner' ? partnerLabel() + 'จ่าย' : 'หาร'}</span>`;
    if (t.type === 'self') tags += `<span class="tag grey">โอนเข้าตัวเอง</span>`;
    if (t.type === 'settle') tags += `<span class="tag grey">เคลียร์ยอดหาร</span>`;
    if (t.demo) tags += `<span class="tag grey">ตัวอย่าง</span>`;
    return `<button class="item" data-action="edit" data-id="${t.id}">
      <div class="ico">${ico}</div>
      <div class="mid"><div class="t"><span class="tt">${esc(title)}</span></div><div class="s">${tags}${esc(sub) || (tags ? '' : '&nbsp;')}</div></div>
      <div class="amt num ${cls}">${amt}</div></button>`;
  }

  function txList(list) {
    const byDay = {};
    for (const t of sortTx(list)) (byDay[t.date] = byDay[t.date] || []).push(t);
    return Object.keys(byDay).sort().reverse().map((d) => {
      const tot = byDay[d].reduce((a, t) => a + myExpense(t), 0);
      return `<div class="day"><span>${esc(dayLabel(d))}</span><span class="num">${tot ? 'ใช้ ' + money(tot) : ''}</span></div>
        <div class="list">${byDay[d].map(txRow).join('')}</div>`;
    }).join('');
  }

  function viewHome() {
    const s = sumMonth(S.month);
    const list = monthTx(S.month);
    const bal = openSplitBalance();
    const budget = +S.settings.budget || 0;
    let budgetHtml = '';
    if (budget > 0) {
      const pct = Math.min(100, (s.expense / budget) * 100);
      const isCur = S.month === ymOf(new Date());
      const left = budget - s.expense;
      const daysLeft = isCur ? daysIn(S.month) - new Date().getDate() + 1 : 0;
      budgetHtml = `<div class="budget"><div class="bar"><i class="${left < 0 ? 'over' : ''}" style="width:${pct}%"></i></div>
        <div class="meta num"><span>${left >= 0 ? 'เหลืองบ ' + money(left) : 'เกินงบ ' + money(-left)}</span><span>${isCur && left > 0 && daysLeft > 0 ? 'ใช้ได้วันละ ' + money(Math.floor(left / daysLeft)) : 'งบ ' + money(budget)}</span></div></div>`;
    }
    const chips = [];
    if (Math.abs(bal) >= 0.01) chips.push(`<button class="link-chip" data-nav="split"><span class="dot"></span>${bal > 0 ? `${esc(partnerLabel())}ติดเรา` : `เราติด${esc(partnerLabel())}`} <b class="num">${money(Math.abs(bal))}</b> ›</button>`);
    if (S.installEvt) chips.push(`<button class="link-chip" data-action="install">📲 ติดตั้งลงหน้าจอ</button>`);
    if (!DB.ok) chips.push(`<span class="link-chip warn">⚠️ เครื่องนี้บันทึกถาวรไม่ได้ ข้อมูลจะหายเมื่อปิดแอพ</span>`);
    return `${header('จดสลิป', true)}
      <div class="card hero">
        <div class="label">ใช้ไปเดือนนี้</div>
        <div class="big num">${money(s.expense)}</div>
        <div class="row">
          <div class="pill in"><small>รายรับ</small><b class="num">${money(s.income)}</b></div>
          <div class="pill bal"><small>คงเหลือ</small><b class="num">${money(s.income - s.expense)}</b></div>
        </div>${budgetHtml}
      </div>
      ${chips.length ? `<div class="chip-row">${chips.join('')}</div>` : ''}
      ${list.length ? txList(list) : `<div class="card empty"><div class="em">🧾</div><h3>ยังไม่มีรายการเดือนนี้</h3>
        <p>กดปุ่ม <b>+</b> ด้านล่าง แล้วเลือกสลิปจากอัลบั้มได้ทีละหลายใบ</p>
        <button class="btn primary" data-action="add">เพิ่มสลิป</button></div>`}`;
  }

  function viewSummary() {
    const ym = S.month;
    const s = sumMonth(ym);
    const prev = sumMonth(addMonths(ym, -1));
    const list = monthTx(ym);
    const byCat = {};
    list.forEach((t) => { const v = myExpense(t); if (v > 0) byCat[t.category] = (byCat[t.category] || 0) + v; });
    const rows = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
    const max = rows.length ? rows[0][1] : 1;
    const n = daysIn(ym);
    const isCur = ym === ymOf(new Date());
    const daysSoFar = isCur ? new Date().getDate() : n;
    const daily = Array.from({ length: n }, (_, i) => {
      const d = `${ym}-${pad(i + 1)}`;
      return list.filter((t) => t.date === d).reduce((a, t) => a + myExpense(t), 0);
    });
    const diff = prev.expense ? ((s.expense - prev.expense) / prev.expense) * 100 : null;
    const incRows = {};
    list.forEach((t) => { if (t.type === 'income') incRows[t.category] = (incRows[t.category] || 0) + t.amount; });
    return `${header('สรุป', true)}
      <div class="stats">
        <div class="stat"><small>รายจ่ายรวม</small><b class="num">${money(s.expense)}</b></div>
        <div class="stat"><small>รายรับรวม</small><b class="num">${money(s.income)}</b></div>
        <div class="stat"><small>เฉลี่ยต่อวัน</small><b class="num">${money(Math.round(s.expense / Math.max(1, daysSoFar)))}</b></div>
        <div class="stat"><small>เทียบเดือนก่อน</small><b class="num">${diff == null ? '–' : (diff > 0 ? '▲ ' : diff < 0 ? '▼ ' : '') + Math.abs(Math.round(diff)) + '%'}</b></div>
      </div>
      <div class="sec-title">ใช้ไปกับอะไรบ้าง <small>นับเฉพาะส่วนของเรา</small></div>
      <div class="card">${rows.length ? rows.map(([id, v]) => {
        const c = catById(id);
        return `<div class="cat-row"><div class="e">${c.e}</div>
          <div><div class="n"><span>${esc(c.n)}</span><small class="num">${Math.round((v / s.expense) * 100)}%</small></div><div class="b"><i style="width:${(v / max) * 100}%"></i></div></div>
          <div class="v num">${money(v)}</div></div>`;
      }).join('') : '<div class="muted center">ยังไม่มีรายจ่ายเดือนนี้</div>'}</div>
      <div class="sec-title">รายจ่ายรายวัน <small>แตะแท่งเพื่อดูยอด</small></div>
      <div class="card chart" id="daily">${dailyChart(daily, ym)}</div>
      ${Object.keys(incRows).length ? `<div class="sec-title">รายรับ</div><div class="card">${Object.entries(incRows).map(([id, v]) => { const c = catById(id); return `<div class="cat-row"><div class="e">${c.e}</div><div class="n"><span>${esc(c.n)}</span></div><div class="v num">${money(v)}</div></div>`; }).join('')}</div>` : ''}`;
  }

  function dailyChart(vals, ym) {
    const W = 340, H = 150, padL = 4, padB = 22, top = 12;
    const n = vals.length, max = Math.max(1, ...vals);
    const bw = (W - padL * 2) / n;
    const today = ym === ymOf(new Date()) ? new Date().getDate() : 0;
    const y = (v) => H - padB - (v / max) * (H - padB - top);
    let bars = '';
    vals.forEach((v, i) => {
      const x = padL + i * bw;
      const h = H - padB - y(v);
      if (v > 0) {
        const r = Math.min(4, bw / 2 - 1, h);
        const x0 = x + 1, x1 = x + bw - 1, yb = H - padB, yt = y(v);
        bars += `<path d="M${x0},${yb}V${yt + r}Q${x0},${yt} ${x0 + r},${yt}H${x1 - r}Q${x1},${yt} ${x1},${yt + r}V${yb}Z" fill="var(--bar)"/>`;
      }
      bars += `<rect x="${x}" y="0" width="${bw}" height="${H}" fill="transparent" data-day="${i + 1}" data-v="${v}"/>`;
    });
    const ticks = [1, 8, 15, 22, n].map((d) => `<text x="${padL + (d - 0.5) * bw}" y="${H - 6}" font-size="10" text-anchor="middle" fill="var(--muted)">${d}</text>`).join('');
    const tmark = today ? `<line x1="${padL + (today - 0.5) * bw}" x2="${padL + (today - 0.5) * bw}" y1="${top}" y2="${H - padB}" stroke="var(--line)" stroke-dasharray="3 3"/>` : '';
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="รายจ่ายรายวัน">
      <line x1="0" x2="${W}" y1="${H - padB}" y2="${H - padB}" stroke="var(--line)"/>
      ${tmark}${bars}${ticks}
      <text x="${W - 2}" y="10" font-size="10" text-anchor="end" fill="var(--muted)">สูงสุด ${money(max)}</text>
    </svg><div class="tip hide" id="tip"></div>`;
  }

  function viewSplit() {
    const bal = openSplitBalance();
    const open = sortTx(S.txs.filter((t) => splitDelta(t) !== 0));
    const settles = sortTx(S.txs.filter((t) => t.type === 'settle')).slice(0, 5);
    const P = esc(partnerLabel());
    return `${header('หารกัน', false)}
      <div class="card owe">
        <div class="who">${Math.abs(bal) < 0.01 ? 'ตอนนี้ไม่มียอดค้าง' : bal > 0 ? `${P}ติดเรา` : `เราติด${P}`}</div>
        <div class="big num">${money(Math.abs(bal))}</div>
        <div class="note">นับจากรายการที่หารและยังไม่เคลียร์ในเครื่องนี้</div>
      </div>
      <div class="card">
        <div class="field" style="margin-bottom:8px"><label>${P}บันทึกว่าเราติด${P}อยู่เท่าไหร่ (ดูจากเครื่อง${P})</label>
          <input class="input num" id="theirBal" inputmode="decimal" placeholder="0" value="${esc(S.theirBal || '')}"></div>
        <div id="netBox" class="split-box">${netText(bal)}</div>
        <button class="btn primary block mt" data-action="settle" ${open.length ? '' : 'disabled'}>เคลียร์ยอดแล้ว</button>
        <p class="hint center">ต่างคนต่างจดก็ได้ ตอนสิ้นเดือนเปิดเทียบกัน แล้วโอนส่วนต่างให้กันครั้งเดียว</p>
      </div>
      <div class="sec-title">รายการที่ยังไม่เคลียร์ <small>${open.length} รายการ</small></div>
      ${open.length ? `<div class="list">${open.map(txRow).join('')}</div>` : '<div class="card muted center">ยังไม่มีรายการที่หาร<br><small>ตอนตรวจสลิป กด “หารครึ่ง” ได้เลย</small></div>'}
      ${settles.length ? `<div class="sec-title">ประวัติการเคลียร์</div><div class="list">${settles.map(txRow).join('')}</div>` : ''}`;
  }
  function netText(bal) {
    const theirs = parseFloat(String(S.theirBal || '0').replace(/,/g, '')) || 0;
    const net = bal - theirs; // + : partner should transfer to me
    const P = esc(partnerLabel());
    if (Math.abs(net) < 0.01) return 'สรุป: <b>ไม่ต้องโอนให้กัน</b> 🎉';
    return net > 0 ? `สรุป: <b>${P}โอนให้เรา ${money(net)}</b>` : `สรุป: <b>เราโอนให้${P} ${money(-net)}</b>`;
  }

  function viewSettings() {
    const st = S.settings;
    const ocr = S.ocr.status === 'ready' || st.ocrReady ? '✅ พร้อมใช้ออฟไลน์' : S.ocr.status === 'loading' ? 'กำลังโหลด…' : S.ocr.status === 'error' ? '⚠️ โหลดไม่สำเร็จ' : 'ยังไม่โหลด';
    const learnCount = Object.keys(st.learn.memo).length + Object.keys(st.learn.party).length + Object.keys(st.learn.fix || {}).length;
    const demoCount = S.txs.filter((t) => t.demo).length;
    return `${header('ตั้งค่า', false)}
      <div class="group-title">ข้อมูลของเรา</div>
      <div class="set-group">
        <button class="set-row" data-action="editNames"><span class="e">🙋</span>ชื่อเรา (ตามบัญชีธนาคาร)<span class="r">${esc(st.myNames || 'ยังไม่ได้ตั้ง')}</span></button>
        <button class="set-row" data-action="editNames"><span class="e">💞</span>ชื่อแฟน<span class="r">${esc(st.partnerName || 'ยังไม่ได้ตั้ง')}</span></button>
        <button class="set-row" data-action="editBudget"><span class="e">🎯</span>งบรายเดือน<span class="r num">${st.budget ? money(st.budget) : 'ไม่ตั้ง'}</span></button>
        <button class="set-row" data-action="cats"><span class="e">🏷️</span>หมวดหมู่<span class="r">${cats().length} หมวด ›</span></button>
      </div>
      <div class="group-title">ตัวอ่านสลิป</div>
      <div class="set-group">
        <button class="set-row" data-action="prepOCR"><span class="e">🔎</span>โหลดตัวอ่านสลิปไว้ใช้ออฟไลน์<span class="r">${ocr}</span></button>
        <button class="set-row" data-action="resetLearn"><span class="e">🧠</span>ล้างสิ่งที่แอพจำไว้<span class="r">${learnCount} คำ</span></button>
      </div>
      <div class="group-title">สำรองข้อมูล (ทำทุกเดือนนะ)</div>
      <div class="set-group">
        <button class="set-row" data-action="export"><span class="e">💾</span>สำรองข้อมูลเป็นไฟล์<span class="r">${S.txs.length} รายการ</span></button>
        <button class="set-row" data-action="import"><span class="e">📂</span>กู้คืนจากไฟล์</button>
        ${demoCount ? `<button class="set-row" data-action="clearDemo"><span class="e">🧹</span>ลบข้อมูลตัวอย่าง<span class="r">${demoCount} รายการ</span></button>` : `<button class="set-row" data-action="addDemo"><span class="e">🧪</span>ใส่ข้อมูลตัวอย่างไว้ลองเล่น</button>`}
        <button class="set-row danger" data-action="wipe"><span class="e">🗑️</span>ลบข้อมูลทั้งหมด</button>
      </div>
      <div class="group-title">อื่นๆ</div>
      <div class="set-group">
        <button class="set-row" data-nav="guide"><span class="e">📖</span>วิธีใช้งาน<span class="r">›</span></button>
        ${S.installEvt ? '<button class="set-row" data-action="install"><span class="e">📲</span>ติดตั้งลงหน้าจอ</button>' : ''}
      </div>
      <p class="hint center">จดสลิป v${APP_VERSION} · ข้อมูลทั้งหมดเก็บในเครื่องนี้เท่านั้น ไม่ส่งไปที่ไหน</p>`;
  }

  function viewGuide() {
    return `<div class="top"><button class="btn ghost" data-nav="settings" style="padding-left:0">‹ ตั้งค่า</button></div>
    <div class="guide">
      <h2 style="margin:0 0 4px">วิธีใช้จดสลิป</h2>
      <p class="muted" style="margin-top:0">ใช้เวลาอ่าน 2 นาที</p>
      <h3>1. ติดตั้งลงหน้าจอ</h3>
      <div class="card"><p><b>Android (Chrome):</b> เปิดลิงก์แอพ → เมนู <span class="kbd">⋮</span> → <b>ติดตั้งแอป</b> หรือ <b>เพิ่มลงในหน้าจอหลัก</b></p>
      <p style="margin:0"><b>iPhone (Safari):</b> เปิดลิงก์ → ปุ่มแชร์ <span class="kbd">⬆︎</span> → <b>เพิ่มไปยังหน้าจอโฮม</b> (ต้องเปิดใน Safari เท่านั้น)</p></div>
      <h3>2. เพิ่มสลิป</h3>
      <div class="card"><ol><li>กดปุ่ม <span class="kbd">+</span> → <b>เลือกสลิปจากอัลบั้ม</b></li>
      <li>เลือกได้ทีละหลายใบ ถ้าเผลอเลือกใบที่เคยบันทึกแล้ว แอพจะข้ามให้เอง</li>
      <li>ครั้งแรกแอพต้องต่อเน็ตเพื่อโหลดตัวอ่านสลิป (ประมาณ 10–20 MB) หลังจากนั้นใช้ออฟไลน์ได้</li></ol></div>
      <h3>3. ตรวจทานก่อนบันทึก</h3>
      <div class="card"><ol><li>ช่องที่เป็น<span style="background:var(--warn-soft);padding:0 4px;border-radius:4px">สีเหลือง</span> คือช่องที่แอพไม่มั่นใจ ดูอีกทีนะ</li>
      <li>เลือกหมวด ถ้าแก้หมวด แอพจะจำไว้ใช้ครั้งหน้า</li>
      <li>ถ้าเป็นค่ากับข้าวที่กินด้วยกัน กด <b>หารครึ่ง</b> หรือ <b>กำหนดเอง</b></li>
      <li>สลิปโอนเข้าบัญชีตัวเองจะถูกแยกเป็น “โอนเข้าตัวเอง” ไม่นับเป็นรายจ่าย</li></ol></div>
      <h3>4. หารกับแฟน</h3>
      <div class="card"><p>หน้า <b>หารกัน</b> จะบอกว่าแฟนติดเราเท่าไหร่ ตอนสิ้นเดือนดูยอดในเครื่องแฟน กรอกลงช่อง แล้วแอพจะบอกว่าใครต้องโอนให้ใคร พอโอนเสร็จกด <b>เคลียร์ยอดแล้ว</b></p>
      <p style="margin:0">ถ้าแฟนจ่ายแทนเรา (ไม่มีสลิปในเครื่องเรา) กด <span class="kbd">+</span> → <b>จดเอง</b> → เลือก “${esc(partnerLabel())}จ่าย”</p></div>
      <h3>5. สำรองข้อมูล</h3>
      <div class="card"><p style="margin:0">ข้อมูลอยู่ในเครื่องนี้เท่านั้น ถ้าลบแอพหรือเปลี่ยนมือถือ ข้อมูลจะหาย กด <b>ตั้งค่า → สำรองข้อมูลเป็นไฟล์</b> เดือนละครั้ง แล้วเก็บไฟล์ไว้ใน Drive หรือส่งเข้า LINE ตัวเอง</p></div>
    </div>`;
  }

  function afterRender() {
    const chart = $('#daily');
    if (chart) {
      const tip = $('#tip', chart);
      chart.addEventListener('click', (e) => {
        const r = e.target.closest('[data-day]');
        if (!r) { tip.classList.add('hide'); return; }
        const box = chart.getBoundingClientRect(), rb = r.getBoundingClientRect();
        tip.textContent = `${r.dataset.day} ${dFmt(S.month + '-01', { month: 'short' })} · ${money(+r.dataset.v)}`;
        tip.style.left = (rb.left - box.left + rb.width / 2) + 'px';
        tip.style.top = '6px';
        tip.classList.remove('hide');
      });
    }
    const tb = $('#theirBal');
    if (tb) tb.addEventListener('input', () => { S.theirBal = tb.value; $('#netBox').innerHTML = netText(openSplitBalance()); });
  }

  /* ================= layers: sheets & dialogs ================= */
  function openLayer(html, cls = '') {
    layer.innerHTML = `<div class="scrim" data-scrim><div class="sheet ${cls}">${html}</div></div>`;
    document.body.style.overflow = 'hidden';
  }
  function closeLayer() { layer.innerHTML = ''; document.body.style.overflow = ''; }
  function ask(title, msg, okText, danger) {
    return new Promise((res) => {
      layer.insertAdjacentHTML('beforeend', `<div class="scrim" id="askScrim" style="align-items:center"><div class="dialog"><h3 style="margin:0">${esc(title)}</h3><p>${msg}</p>
        <div class="btn-row"><button class="btn" data-a="no">ยกเลิก</button><button class="btn ${danger ? 'danger' : 'primary'}" data-a="yes">${esc(okText)}</button></div></div></div>`);
      const sc = $('#askScrim');
      sc.addEventListener('click', (e) => {
        const a = e.target.closest('[data-a]');
        if (!a && e.target !== sc) return;
        sc.remove();
        if (!layer.querySelector('.sheet')) document.body.style.overflow = '';
        res(!!a && a.dataset.a === 'yes');
      });
    });
  }

  function openAdd() {
    openLayer(`<div class="grab"></div><h2>เพิ่มรายการ <button class="x" data-action="close">✕</button></h2>
      <button class="big-choice" data-action="pick"><div class="ico">🧾</div><div><b>เลือกสลิปจากอัลบั้ม</b><small>เลือกได้หลายใบพร้อมกัน แอพจะอ่านให้</small></div></button>
      <button class="big-choice" data-action="manual"><div class="ico">✍️</div><div><b>จดเอง</b><small>เงินสด รายรับ หรือ${esc(partnerLabel())}จ่ายแทน</small></div></button>`);
  }

  function renderProcessing(st) {
    const pct = st.total ? (st.done / st.total) * 100 : 0;
    const html = `<div class="grab"></div><h2>กำลังอ่านสลิป</h2>
      <div class="card"><div style="font-weight:600">${esc(st.phase)}</div>
      <div class="progress"><i style="width:${pct}%"></i></div>
      <div class="hint">${st.dup ? `ข้ามใบที่เคยบันทึกแล้ว ${st.dup} ใบ · ` : ''}อ่านในเครื่อง ไม่ส่งรูปไปที่ไหน</div>
      ${st.ocrNote ? `<div class="notice ok mt">${esc(st.ocrNote)}</div>` : ''}</div>`;
    const sheet = layer.querySelector('.sheet.processing');
    if (sheet) sheet.innerHTML = html; else openLayer(html, 'processing');
  }

  /* ---------- review / edit form ---------- */
  let D = null; // current draft
  let formMode = 'review'; // review | edit | manual

  function renderReview() {
    D = S.queue[S.qi];
    formMode = 'review';
    renderForm();
  }
  function openEdit(id) {
    const t = S.txs.find((x) => x.id === id);
    if (!t) return;
    D = draftFromTx(t);
    formMode = 'edit';
    renderForm();
  }
  function openManual() {
    D = blankDraft();
    formMode = 'manual';
    renderForm();
  }

  function fieldCls(k) { return D.checks && D.checks[k] ? 'field check' : 'field'; }
  function renderForm() {
    const isSlip = D.source === 'slip';
    const n = S.queue.length;
    let head = '';
    if (formMode === 'review') {
      head = `<div class="grab"></div><h2>ตรวจสลิป ${S.qi + 1}/${n} <button class="x" data-action="closeReview">✕</button></h2>
        ${n > 1 ? `<div class="steps">${S.queue.map((_, i) => `<i class="${i === S.qi ? 'on' : i < S.qi ? 'done' : ''}"></i>`).join('')}</div>` : ''}
        ${S.qi === 0 && S.queueDup ? `<div class="notice ok">ข้ามสลิปที่เคยบันทึกแล้ว ${S.queueDup} ใบ</div>` : ''}
        ${D.ocrFailed ? `<div class="notice">อ่านตัวหนังสือในสลิปไม่ได้ ${navigator.onLine ? '' : '(ตอนนี้ออฟไลน์ และยังไม่เคยโหลดตัวอ่านสลิป)'} กรอกเองจากรูปได้เลย</div>` : ''}`;
    } else {
      head = `<div class="grab"></div><h2>${formMode === 'edit' ? 'แก้ไขรายการ' : 'จดเอง'} <button class="x" data-action="close">✕</button></h2>`;
    }
    const slip = isSlip ? `<div class="slip-prev">${D.thumb ? `<img src="${D.thumb}" alt="สลิป" data-action="viewImg">` : ''}
      <div class="meta">${D.bankName ? `<b>${esc(D.bankName)}</b> · ` : ''}${D.kind === 'bill' ? 'จ่ายบิล' : 'โอนเงิน'}<br>
      ${D.ref ? `<span class="muted">อ้างอิง ${esc(D.ref)}</span><br>` : ''}
      ${D.date ? `${esc(fullDate(D.date))}${D.time ? ' · ' + esc(D.time) + ' น.' : ''}` : ''}</div></div>` : '';
    const types = [['expense', 'รายจ่าย'], ['income', 'รายรับ'], ['self', 'โอนเข้าตัวเอง'], ['settle', 'เคลียร์ยอดหาร']];
    const typeSeg = `<div class="field"><label>ประเภท</label><div class="chips">${types.filter(([k]) => isSlip || k !== 'self' || D.type === 'self').map(([k, l]) => `<button data-set="type" data-v="${k}" class="${D.type === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      ${D.type === 'self' || D.type === 'settle' ? '<div class="hint">รายการนี้ไม่นับเป็นรายรับหรือรายจ่าย</div>' : ''}</div>`;
    const amt = `<div class="${fieldCls('amount')}"><label>จำนวนเงิน (บาท)</label><input class="input amount num" data-f="amount" inputmode="decimal" placeholder="0.00" value="${esc(D.amount)}">${D.checks.amount ? '<div class="hint">ตรวจยอดอีกที</div>' : ''}</div>`;
    const memo = `<div class="${fieldCls('memo')}"><label>โน้ต</label><input class="input" data-f="memo" placeholder="เช่น กับข้าวเย็น" value="${esc(D.memo)}">${D.checks.memo && isSlip ? '<div class="hint">ไม่เจอบันทึกช่วยจำในสลิป เติมเองได้</div>' : ''}</div>`;
    const showCat = D.type === 'expense' || D.type === 'income';
    const catList = cats().filter((c) => c.kind === (D.type === 'income' ? 'income' : 'expense'));
    const cat = showCat ? `<div class="field"><label>หมวด</label><div class="chips">${catList.map((c) => `<button data-set="category" data-v="${c.id}" class="${D.category === c.id ? 'on' : ''}">${c.e} ${esc(c.n)}</button>`).join('')}</div></div>` : '';
    const P = esc(partnerLabel());
    let split = '';
    if (D.type === 'expense') {
      const modes = [['none', 'ไม่หาร'], ['half', 'หารครึ่ง'], ['custom', 'กำหนดเอง']];
      split = `<div class="field"><label>หารกับ${P}</label>
        ${D.source === 'manual' ? `<div class="seg" style="margin-bottom:8px">${[['me', 'เราจ่าย'], ['partner', P + 'จ่าย']].map(([k, l]) => `<button data-set="payer" data-v="${k}" class="${D.payer === k ? 'on' : ''}">${l}</button>`).join('')}</div>` : ''}
        <div class="seg">${modes.map(([k, l]) => `<button data-set="splitMode" data-v="${k}" class="${D.splitMode === k ? 'on' : ''}">${l}</button>`).join('')}</div>
        ${D.splitMode === 'custom' ? `<div class="mt"><label class="flabel">ส่วนของเรา (บาท)</label><input class="input num" data-f="myShare" inputmode="decimal" placeholder="0" value="${esc(D.myShare)}"></div>` : ''}
        <div class="split-box" id="splitInfo">${splitInfo()}</div></div>`;
    }
    const partyLabel = D.type === 'income' ? 'ได้รับจาก' : 'จ่ายให้ / ร้าน';
    const party = `<div class="${fieldCls('party')}"><label>${partyLabel}</label><input class="input" data-f="party" value="${esc(D.party)}" placeholder="ไม่ใส่ก็ได้"></div>`;
    const dt = `<div class="two"><div class="${fieldCls('date')}"><label>วันที่</label><input class="input" type="date" data-f="date" value="${esc(D.date)}"></div>
      <div class="${fieldCls('time')}"><label>เวลา</label><input class="input" type="time" data-f="time" value="${esc(D.time)}"></div></div>
      <div class="hint" id="beDate" style="margin:-8px 2px 14px">${D.date ? esc(dFmt(D.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })) : ''}</div>`;
    let btns;
    if (formMode === 'review') btns = `<div class="btn-row"><button class="btn" data-action="skip">ข้ามใบนี้</button><button class="btn primary" data-action="saveDraft">บันทึก${S.qi < n - 1 ? ' แล้วไปต่อ' : ''}</button></div>`;
    else if (formMode === 'edit') btns = `<button class="btn primary block" data-action="saveDraft">บันทึก</button><button class="btn danger block mt" data-action="delete">ลบรายการนี้</button>`;
    else btns = `<button class="btn primary block" data-action="saveDraft">บันทึก</button>`;
    const html = head + slip + typeSeg + amt + memo + cat + split + party + dt + btns;
    const existing = layer.querySelector('.sheet.form');
    if (existing) { const top = existing.scrollTop; existing.innerHTML = html; existing.scrollTop = top; }
    else openLayer(html, 'form full');
  }
  function splitInfo() {
    const a = parseFloat(String(D.amount).replace(/,/g, '')) || 0;
    const P = esc(partnerLabel());
    if (D.splitMode === 'none') return D.payer === 'partner' ? `${P}จ่ายทั้งหมด ไม่นับเป็นรายจ่ายของเรา` : `นับเป็นรายจ่ายของเรา <b>${money(a)}</b>`;
    const mine = D.splitMode === 'half' ? a / 2 : parseFloat(String(D.myShare).replace(/,/g, '')) || 0;
    const other = a - mine;
    return D.payer === 'partner'
      ? `ส่วนของเรา <b>${money(mine)}</b> → เราติด${P} <b>${money(mine)}</b>`
      : `ส่วนของเรา <b>${money(mine)}</b> · ${P}ต้องคืนเรา <b>${money(Math.max(0, other))}</b>`;
  }

  async function saveDraft() {
    const r = draftToTx(D);
    if (r.error) { toast(r.error); return; }
    const t = r.tx;
    if (formMode === 'edit') {
      const old = S.txs.find((x) => x.id === t.id);
      if (old) t.settled = old.settled && JSON.stringify([old.amount, old.myShare, old.splitMode, old.payer]) === JSON.stringify([t.amount, t.myShare, t.splitMode, t.payer]);
    }
    learnFrom(t, D.ocrMemo);
    await DB.putTx(t);
    const i = S.txs.findIndex((x) => x.id === t.id);
    if (i >= 0) S.txs[i] = t; else S.txs.push(t);
    await saveSettings();
    if (formMode === 'review') {
      S.qi++;
      if (S.qi < S.queue.length) { renderReview(); toast('บันทึกแล้ว'); return; }
      S.queue = [];
      closeLayer();
      toast(`บันทึกครบแล้ว 🎉`);
      S.month = t.date.slice(0, 7);
    } else { closeLayer(); toast('บันทึกแล้ว'); }
    render();
  }

  /* ================= onboarding & small editors ================= */
  function openOnboarding() {
    const st = S.settings;
    openLayer(`<div class="center" style="padding:6px 0 4px"><img src="icon-192.png" alt="" style="width:64px;height:64px;border-radius:18px"></div>
      <h2 style="justify-content:center">ยินดีต้อนรับสู่จดสลิป</h2>
      <p class="center muted" style="margin-top:-6px">ส่งสลิปให้แอพ แล้วแอพจดให้ ข้อมูลอยู่ในเครื่องนี้เท่านั้น</p>
      <div class="field"><label>ชื่อเรา (ตามชื่อบัญชีธนาคาร)</label><input class="input" id="obMe" placeholder="เช่น สมชาย" value="${esc(st.myNames)}">
        <div class="hint">ใช้แยกสลิปที่โอนเข้าบัญชีตัวเอง และสลิปรายรับ ใส่หลายชื่อได้โดยคั่นด้วย ,</div></div>
      <div class="field"><label>ชื่อแฟน</label><input class="input" id="obP" placeholder="เช่น สมหญิง" value="${esc(st.partnerName)}"></div>
      <div class="field"><label>งบรายเดือน (ไม่ใส่ก็ได้)</label><input class="input num" id="obB" inputmode="numeric" placeholder="เช่น 8000" value="${st.budget || ''}"></div>
      <button class="btn primary block" data-action="obDone">เริ่มใช้งาน</button>
      <button class="btn ghost block mt" data-action="obDemo">ขอดูข้อมูลตัวอย่างก่อน</button>`, 'onb');
  }
  async function finishOnboarding(withDemo) {
    S.settings.myNames = $('#obMe').value.trim();
    S.settings.partnerName = $('#obP').value.trim();
    S.settings.budget = parseFloat($('#obB').value) || 0;
    S.settings.onboarded = true;
    await saveSettings();
    if (withDemo) await addDemo();
    closeLayer(); render();
    if (!withDemo) toast('กด + เพื่อเพิ่มสลิปแรกได้เลย');
    warmOCR();
  }
  function openNames() {
    const st = S.settings;
    openLayer(`<div class="grab"></div><h2>ชื่อ <button class="x" data-action="close">✕</button></h2>
      <div class="field"><label>ชื่อเรา (ตามบัญชีธนาคาร)</label><input class="input" id="nmMe" value="${esc(st.myNames)}"><div class="hint">ใส่หลายชื่อได้ คั่นด้วย , เช่น ชื่อไทย, ชื่ออังกฤษ</div></div>
      <div class="field"><label>ชื่อแฟน</label><input class="input" id="nmP" value="${esc(st.partnerName)}"></div>
      <button class="btn primary block" data-action="saveNames">บันทึก</button>`);
  }
  function openBudget() {
    openLayer(`<div class="grab"></div><h2>งบรายเดือน <button class="x" data-action="close">✕</button></h2>
      <div class="field"><label>งบต่อเดือน (บาท) ใส่ 0 ถ้าไม่ตั้ง</label><input class="input amount num" id="bgt" inputmode="numeric" value="${S.settings.budget || ''}"></div>
      <button class="btn primary block" data-action="saveBudget">บันทึก</button>`);
  }
  function openCats() {
    const custom = S.settings.customCats || [];
    openLayer(`<div class="grab"></div><h2>หมวดหมู่ <button class="x" data-action="close">✕</button></h2>
      <div class="card">${cats().map((c) => `<div class="cat-edit"><span style="font-size:20px">${c.e}</span>${esc(c.n)} <small class="muted">${c.kind === 'income' ? 'รายรับ' : ''}</small>${custom.find((x) => x.id === c.id) ? `<button data-action="delCat" data-id="${c.id}">ลบ</button>` : ''}</div>`).join('')}</div>
      <div class="sec-title">เพิ่มหมวดใหม่</div>
      <div class="two" style="grid-template-columns:70px 1fr"><input class="input" id="ncE" placeholder="🐶" maxlength="4"><input class="input" id="ncN" placeholder="ชื่อหมวด เช่น ค่าน้องหมา"></div>
      <div class="seg mt" id="ncK"><button class="on" data-k="expense">รายจ่าย</button><button data-k="income">รายรับ</button></div>
      <button class="btn primary block mt" data-action="addCat">เพิ่มหมวด</button>`);
    $('#ncK').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; $('#ncK').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); });
  }

  /* ================= demo data ================= */
  async function addDemo() {
    const ym = ymOf(new Date()), pym = addMonths(ym, -1);
    const today = new Date().getDate();
    const d = (base, day) => `${base}-${pad(Math.max(1, Math.min(day, base === ym ? today : 28)))}`;
    const P = partnerLabel();
    const rows = [
      [pym, 1, '09:10', 'income', 6000, 'ค่าขนมเดือนนี้', 'แม่', 'allow'],
      [pym, 3, '19:20', 'expense', 240, 'กับข้าวเย็น', 'ร้านป้าแดง', 'food', 'half'],
      [pym, 9, '12:05', 'expense', 65, 'ข้าวมันไก่', 'โรงอาหาร', 'food'],
      [pym, 14, '20:00', 'expense', 3500, 'ค่าหอ', 'หอพัก', 'rent'],
      [pym, 20, '18:40', 'expense', 389, 'Shopee เสื้อ', 'Shopee', 'shop'],
      [ym, 1, '08:30', 'income', 6000, 'ค่าขนมเดือนนี้', 'แม่', 'allow'],
      [ym, 2, '18:05', 'expense', 180, 'กับข้าวเย็น', 'ร้านป้าแดง', 'food', 'half'],
      [ym, 3, '21:47', 'expense', 203, 'Bolt กลับหอ', 'Bolt', 'travel'],
      [ym, 4, '18:00', 'expense', 30, 'บัวลอยไข่หวาน', 'ร้านบัวลอย', 'food'],
      [ym, 5, '19:15', 'expense', 320, 'หมูกระทะ', 'ร้านหมูกระทะ', 'food', 'half', 'partner'],
      [ym, 6, '14:04', 'expense', 134, 'ขาตั้งกล้อง', 'ร้านกล้อง', 'shop'],
      [ym, 7, '10:12', 'expense', 560, 'ค่าเข้าพักอุทยาน', 'กรมอุทยานฯ', 'trip', 'half'],
      [ym, 8, '12:30', 'expense', 450, 'ค่าไฟห้อง', 'การไฟฟ้า', 'bills', 'half'],
      [ym, 9, '17:45', 'expense', 215, 'ของใช้เข้าห้อง', 'โลตัส', 'home', 'half'],
      [ym, 10, '23:06', 'self', 3000, 'เงินใช้รายเดือน', 'บัญชีตัวเอง', null],
    ];
    const now = Date.now();
    for (const [i, r] of rows.entries()) {
      const [base, day, time, type, amount, memo, party, category, split, payer] = r;
      const t = {
        id: 'demo' + i + uid(), source: payer === 'partner' ? 'manual' : 'slip', type, amount, memo, party, category,
        date: d(base, day), time, payer: payer || 'me', splitMode: split || 'none', myShare: split ? amount / 2 : null,
        settled: base === pym, demo: true, createdAt: now + i,
      };
      if (payer === 'partner') t.party = P;
      await DB.putTx(t); S.txs.push(t);
    }
  }

  /* ================= backup ================= */
  async function exportData() {
    const data = { app: 'jodslip', version: 1, exportedAt: new Date().toISOString(), settings: S.settings, txs: S.txs };
    const name = `jodslip-backup-${todayISO()}.json`;
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    try {
      const file = new File([blob], name, { type: 'application/json' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'สำรองข้อมูลจดสลิป' }); return; }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    try {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      toast('ดาวน์โหลดไฟล์สำรองแล้ว');
    } catch (e) { toast('เครื่องนี้ดาวน์โหลดไฟล์ไม่ได้'); }
  }
  async function importData(file) {
    try {
      const data = JSON.parse(await file.text());
      if (data.app !== 'jodslip' || !Array.isArray(data.txs)) throw new Error('bad');
      const have = new Set(S.txs.map((t) => t.id));
      let n = 0;
      for (const t of data.txs) if (!have.has(t.id)) { await DB.putTx(t); S.txs.push(t); n++; }
      if (data.settings && data.settings.learn) {
        S.settings.learn.memo = Object.assign({}, data.settings.learn.memo, S.settings.learn.memo);
        S.settings.learn.party = Object.assign({}, data.settings.learn.party, S.settings.learn.party);
        const ids = new Set((S.settings.customCats || []).map((c) => c.id));
        S.settings.customCats = (S.settings.customCats || []).concat((data.settings.customCats || []).filter((c) => !ids.has(c.id)));
        await saveSettings();
      }
      toast(`กู้คืน ${n} รายการ`); render();
    } catch (e) { toast('ไฟล์นี้ไม่ใช่ไฟล์สำรองของจดสลิป'); }
  }

  function warmOCR() {
    if (!navigator.onLine || S.settings.ocrReady || !hasSW()) return;
    // download the reader quietly in the background so the first import is fast and offline-ready
    setTimeout(() => ensureOCR().catch(() => {}), 1500);
  }

  /* ================= events ================= */
  document.addEventListener('click', async (e) => {
    const nav = e.target.closest('[data-nav]');
    if (nav) { closeLayer(); S.view = nav.dataset.nav; render(); window.scrollTo(0, 0); return; }
    if (e.target.matches('[data-scrim]') && !layer.querySelector('.onb, .processing, .form')) { closeLayer(); return; }
    const set = e.target.closest('[data-set]');
    if (set && D) {
      const k = set.dataset.set, v = set.dataset.v;
      D[k] = v;
      if (k === 'type') { D.category = guessCategory(v, D.memo, D.party); if (v !== 'expense') D.splitMode = 'none'; }
      if (k === 'category') D._catTouched = true;
      renderForm(); return;
    }
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const a = el.dataset.action;
    switch (a) {
      case 'add': openAdd(); break;
      case 'close': closeLayer(); break;
      case 'pick': closeLayer(); $('#pick').value = ''; $('#pick').click(); break;
      case 'manual': openManual(); break;
      case 'mprev': S.month = addMonths(S.month, -1); render(); break;
      case 'mnext': S.month = addMonths(S.month, 1); render(); break;
      case 'edit': openEdit(el.dataset.id); break;
      case 'saveDraft': saveDraft(); break;
      case 'skip':
        S.qi++;
        if (S.qi < S.queue.length) renderReview(); else { S.queue = []; closeLayer(); render(); }
        break;
      case 'closeReview': {
        const left = S.queue.length - S.qi;
        if (await ask('ปิดหน้าตรวจสลิป?', `ยังเหลือ ${left} ใบที่ยังไม่บันทึก ถ้าปิดตอนนี้ต้องเลือกสลิปใหม่ภายหลัง`, 'ปิดเลย')) { S.queue = []; closeLayer(); render(); }
        break;
      }
      case 'delete':
        if (await ask('ลบรายการนี้?', 'ลบแล้วกู้คืนไม่ได้', 'ลบ', true)) {
          await DB.delTx(D.id); S.txs = S.txs.filter((t) => t.id !== D.id); closeLayer(); render(); toast('ลบแล้ว');
        }
        break;
      case 'viewImg':
        layer.insertAdjacentHTML('beforeend', `<div class="viewer" id="viewer"><img src="${D.thumb}" alt="สลิป"></div>`);
        $('#viewer').addEventListener('click', (ev) => { ev.stopPropagation(); $('#viewer').remove(); });
        break;
      case 'settle': {
        const bal = openSplitBalance();
        const theirs = parseFloat(String(S.theirBal || '0').replace(/,/g, '')) || 0;
        const net = bal - theirs;
        const P = esc(partnerLabel());
        if (await ask('เคลียร์ยอดหารแล้ว?', `รายการที่หารทั้งหมดจะถูกนับว่าเคลียร์แล้ว ${Math.abs(net) >= 0.01 ? (net > 0 ? `(${P}โอนให้เรา ${money(net)})` : `(เราโอนให้${P} ${money(-net)})`) : ''}`, 'เคลียร์แล้ว')) {
          for (const t of S.txs) if (splitDelta(t) !== 0) { t.settled = true; await DB.putTx(t); }
          const rec = { id: uid(), source: 'manual', type: 'settle', amount: Math.abs(net), memo: net >= 0 ? `${partnerLabel()}โอนคืนเรา` : `เราโอนคืน${partnerLabel()}`, party: partnerLabel(), category: null, date: todayISO(), time: nowTime(), payer: 'me', splitMode: 'none', myShare: null, settled: true, createdAt: Date.now() };
          await DB.putTx(rec); S.txs.push(rec);
          S.theirBal = ''; render(); toast('เคลียร์ยอดเรียบร้อย');
        }
        break;
      }
      case 'editNames': openNames(); break;
      case 'saveNames':
        S.settings.myNames = $('#nmMe').value.trim(); S.settings.partnerName = $('#nmP').value.trim();
        await saveSettings(); closeLayer(); render(); break;
      case 'editBudget': openBudget(); break;
      case 'saveBudget': S.settings.budget = parseFloat($('#bgt').value) || 0; await saveSettings(); closeLayer(); render(); break;
      case 'cats': openCats(); break;
      case 'addCat': {
        const n = $('#ncN').value.trim(); if (!n) { toast('ใส่ชื่อหมวดก่อน'); break; }
        const k = $('#ncK .on').dataset.k;
        S.settings.customCats = (S.settings.customCats || []).concat([{ id: 'c_' + uid(), kind: k, e: $('#ncE').value.trim() || '🏷️', n }]);
        await saveSettings(); openCats(); toast('เพิ่มหมวดแล้ว'); break;
      }
      case 'delCat':
        S.settings.customCats = S.settings.customCats.filter((c) => c.id !== el.dataset.id);
        await saveSettings(); openCats(); break;
      case 'prepOCR':
        if (S.ocr.status === 'ready') { toast('ตัวอ่านสลิปพร้อมใช้แล้ว'); break; }
        toast('กำลังโหลดตัวอ่านสลิป…');
        S.ocr.status = 'loading'; render();
        ensureOCR(() => {}).then(() => { toast('พร้อมใช้ออฟไลน์แล้ว ✅'); render(); })
          .catch(() => { toast(navigator.onLine ? 'โหลดไม่สำเร็จ (ใช้ได้เฉพาะตอนติดตั้งเป็นแอพ)' : 'ต้องต่อเน็ตครั้งแรกก่อนนะ'); render(); });
        break;
      case 'resetLearn':
        if (await ask('ล้างสิ่งที่แอพจำไว้?', 'แอพจะลืมว่าโน้ตไหนเป็นหมวดอะไร (รายการที่บันทึกไว้ไม่หาย)', 'ล้าง', true)) {
          S.settings.learn = { memo: {}, party: {}, fix: {} }; await saveSettings(); render();
        }
        break;
      case 'export': exportData(); break;
      case 'import': $('#restore').value = ''; $('#restore').click(); break;
      case 'addDemo': await addDemo(); S.view = 'home'; render(); toast('ใส่ข้อมูลตัวอย่างแล้ว'); break;
      case 'clearDemo':
        for (const t of S.txs.filter((x) => x.demo)) await DB.delTx(t.id);
        S.txs = S.txs.filter((x) => !x.demo); render(); toast('ลบข้อมูลตัวอย่างแล้ว'); break;
      case 'wipe':
        if (await ask('ลบข้อมูลทั้งหมด?', 'รายการทั้งหมดในเครื่องนี้จะหายไป แนะนำให้สำรองข้อมูลก่อน', 'ลบทั้งหมด', true)) {
          await DB.clearTx(); S.txs = []; render(); toast('ลบข้อมูลแล้ว');
        }
        break;
      case 'install':
        if (S.installEvt) { S.installEvt.prompt(); S.installEvt = null; render(); }
        break;
      case 'obDone': finishOnboarding(false); break;
      case 'obDemo': finishOnboarding(true); break;
    }
  });

  document.addEventListener('input', (e) => {
    const f = e.target.dataset && e.target.dataset.f;
    if (!f || !D) return;
    D[f] = e.target.value;
    if (D.checks) D.checks[f] = false;
    e.target.closest('.field') && e.target.closest('.field').classList.remove('check');
    if (f === 'amount' || f === 'myShare') { const si = $('#splitInfo'); if (si) si.innerHTML = splitInfo(); }
    if (f === 'date') { const b = $('#beDate'); if (b) b.textContent = D.date ? dFmt(D.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : ''; }
    if (f === 'memo' && D.type !== 'self' && D.type !== 'settle' && !D._catTouched && formMode !== 'edit') {
      const g = guessCategory(D.type, D.memo, D.party);
      if (g !== D.category) {
        D.category = g;
        layer.querySelectorAll('[data-set="category"]').forEach((b) => b.classList.toggle('on', b.dataset.v === g));
      }
    }
  });

  $('#pick').addEventListener('change', (e) => importFiles(e.target.files));
  $('#restore').addEventListener('change', (e) => e.target.files[0] && importData(e.target.files[0]));
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); S.installEvt = e; if (S.view === 'home' || S.view === 'settings') render(); });

  // Android: slips shared from a banking app arrive through the share target
  async function checkShared() {
    if (!/[?&]shared=1/.test(location.search) || !('caches' in window)) return;
    try {
      const c = await caches.open('jodslip-share');
      const keys = await c.keys();
      const files = [];
      for (const k of keys) { const r = await c.match(k); const b = await r.blob(); files.push(new File([b], k.url.split('/').pop(), { type: b.type || 'image/jpeg' })); await c.delete(k); }
      history.replaceState(null, '', location.pathname);
      if (files.length) importFiles(files);
    } catch (e) { console.warn(e); }
  }

  /* ================= boot ================= */
  async function boot() {
    await DB.open();
    S.settings = Object.assign(defaultSettings(), (await DB.get('settings')) || {});
    S.settings.learn = Object.assign({ memo: {}, party: {}, fix: {} }, S.settings.learn || {});
    S.txs = await DB.allTx();
    render();
    if (!S.settings.onboarded) openOnboarding();
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* ignore */ }
    if ('serviceWorker' in navigator) {
      try {
        await navigator.serviceWorker.register('sw.js');
        if (!navigator.serviceWorker.controller) {
          navigator.serviceWorker.addEventListener('controllerchange', () => { if (S.settings.onboarded) warmOCR(); }, { once: true });
        }
      } catch (e) { /* not available here (e.g. preview frame) */ }
    }
    if (S.settings.onboarded) warmOCR();
    checkShared();
  }
  boot();
})();
