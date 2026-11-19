/* จดสลิป — slip parser
 * Turns QR payload + OCR text of a Thai bank slip into a draft record.
 * Works in the browser (window.SlipParser) and in Node (module.exports).
 */
(function (root) {
  'use strict';

  const BANKS = {
    '002': { id: 'bbl', name: 'กรุงเทพ' },
    '004': { id: 'kbank', name: 'กสิกรไทย' },
    '006': { id: 'ktb', name: 'กรุงไทย' },
    '011': { id: 'ttb', name: 'ทีทีบี' },
    '014': { id: 'scb', name: 'ไทยพาณิชย์' },
    '025': { id: 'bay', name: 'กรุงศรี' },
    '030': { id: 'gsb', name: 'ออมสิน' },
    '034': { id: 'baac', name: 'ธ.ก.ส.' },
    '069': { id: 'kkp', name: 'เกียรตินาคินภัทร' },
    '073': { id: 'lhb', name: 'แลนด์ แอนด์ เฮ้าส์' },
  };

  const TH_MONTHS = [
    ['มี.ค.', 3], ['มิ.ย.', 6], ['ม.ค.', 1], ['ก.พ.', 2], ['เม.ย.', 4], ['พ.ค.', 5],
    ['ก.ค.', 7], ['ส.ค.', 8], ['ก.ย.', 9], ['ต.ค.', 10], ['พ.ย.', 11], ['ธ.ค.', 12],
  ];

  /* ---------- QR (Slip-Verify mini QR, EMVCo-style TLV) ---------- */
  function parseTLV(s) {
    const out = {};
    let i = 0;
    while (i + 4 <= s.length) {
      const tag = s.slice(i, i + 2);
      const len = parseInt(s.slice(i + 2, i + 4), 10);
      if (!/^\d{2}$/.test(tag) || isNaN(len) || i + 4 + len > s.length) return null;
      out[tag] = s.slice(i + 4, i + 4 + len);
      i += 4 + len;
    }
    return i === s.length ? out : null;
  }

  function parseQR(payload) {
    if (!payload || typeof payload !== 'string') return null;
    const p = payload.trim();
    const top = parseTLV(p);
    if (top && top['00']) {
      const inner = parseTLV(top['00']);
      if (inner && inner['01'] && inner['02']) {
        const code = inner['01'];
        return { bankCode: code, bank: (BANKS[code] || {}).id || null, ref: inner['02'], raw: p };
      }
    }
    return { bankCode: null, bank: null, ref: null, raw: p };
  }

  /* Many banks encode the date in the reference number. */
  function dateFromRef(bank, ref, now) {
    if (!ref) return null;
    now = now || new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const valid = (y, m, d) => {
      const dt = new Date(y, m - 1, d);
      return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
    };
    try {
      if (bank === 'scb') {
        const m = /^(20\d{2})(\d{2})(\d{2})/.exec(ref);
        if (m && valid(+m[1], +m[2], +m[3])) return { date: `${m[1]}-${m[2]}-${m[3]}`, time: null };
      }
      if (bank === 'ktb') {
        const m = /^\d{2}(\d{2})(\d{2})(\d{2})/.exec(ref);
        if (m) {
          const y = 2000 + +m[1];
          if (valid(y, +m[2], +m[3])) return { date: `${y}-${m[2]}-${m[3]}`, time: null };
        }
      }
      if (bank === 'kbank') {
        // 0 + 2-digit year? + day-of-year (3) + HHMMSS
        const m = /^\d{3}(\d{3})(\d{2})(\d{2})(\d{2})/.exec(ref);
        if (m) {
          const doy = +m[1], hh = +m[2], mi = +m[3];
          if (doy >= 1 && doy <= 366 && hh < 24 && mi < 60) {
            // pick the most recent year where that day-of-year is not in the future
            for (let y = now.getFullYear(); y >= now.getFullYear() - 2; y--) {
              const dt = new Date(y, 0, doy);
              if (dt.getFullYear() !== y) continue;
              if (dt <= new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)) {
                return { date: `${y}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`, time: `${pad(hh)}:${pad(mi)}` };
              }
            }
          }
        }
      }
    } catch (e) { /* ignore */ }
    return null;
  }

  /* ---------- text helpers ---------- */
  const TH = '฀-๿';
  function cleanLine(s) {
    return s
      .replace(/[​-‍﻿]/g, '')
      .replace(/ํา/g, 'ำ') // ํา -> ำ
      .replace(/[“”"|¦©®°•■□▪▫◆◇►▼▲`~]/g, ' ')
      .replace(new RegExp(`([${TH}])\\s+(?=[${TH}])`, 'g'), '$1') // OCR puts spaces between Thai glyphs
      .replace(/\s{2,}/g, ' ')
      .trim();
  }
  const compact = (s) => s.replace(/\s+/g, '');

  const RE_MONEY = /(\d{1,3}(?:[,.]\d{3})+|\d+)[.,](\d{2})(?!\d)/g;
  function moneyIn(line) {
    line = line.replace(/(\d)\s*([,.])\s*(?=\d{2,3}(?:[,.\s]|$|\D))/g, '$1$2'); // OCR spaces inside numbers
    const out = [];
    let m;
    RE_MONEY.lastIndex = 0;
    while ((m = RE_MONEY.exec(line))) {
      const v = parseFloat(m[1].replace(/[,.]/g, '') + '.' + m[2]);
      if (!isNaN(v)) out.push(v);
    }
    return out;
  }

  const RE_ACCOUNT = /([xX×]{2,}|\d{3}-\d|\d-\d{4,}|\(?\d{10,}\)?)/;
  const RE_BANKLINE = /^(ธ\.\S{2,12}|ธนาคาร\S{0,12}|กสิกรไทย|กรุงไทย|กรุงเทพ|ไทยพาณิชย์|กรุงศรี|ออมสิน|ทีทีบี|รหัสพร้อมเพย์|พร้อมเพย์|promptpay|scb|ktb|kbank|bbl|ttb)$/i;
  const RE_TITLE = /^(นางสาว|น\.ส\.|นาย|นาง|ด\.ช\.|ด\.ญ\.|mr\.?|mrs\.?|ms\.?|miss)\s*/i;
  const RE_NOISE_LINE = /(สำเร็จ|รหัสอ้างอิง|เลขที่รายการ|ค่าธรรมเนียม|สแกน|ตรวจสอบ|ผู้รับเงินสามารถ|krungthai|^k\+?$|^scb\s*\W*$|วันที่ทำรายการ|รหัสอุทยาน|วันกำหนด|^บาท$)/i;

  function parseThaiDate(text) {
    // normalise month abbreviations that lost their dots
    let t = text;
    for (const [abbr] of TH_MONTHS) {
      const bare = abbr.replace(/\./g, '');
      const loose = bare.split('').join('\\.?\\s?') + '\\.?';
      t = t.replace(new RegExp(loose, 'g'), abbr);
    }
    const monthAlt = TH_MONTHS.map(([a]) => a.replace(/\./g, '\\.')).join('|');
    const re = new RegExp(`(\\d{1,2})\\s*(${monthAlt})\\s*(\\d{4}|\\d{2})(?:[^\\d\\n]{0,6}(\\d{1,2})\\s*[:.]\\s*(\\d{2}))?`);
    const m = re.exec(t);
    if (!m) return null;
    const day = +m[1];
    const month = TH_MONTHS.find(([a]) => a === m[2])[1];
    let year = +m[3];
    if (year < 100) year += 2500;
    if (year > 2400) year -= 543;
    if (day < 1 || day > 31) return null;
    const pad = (n) => String(n).padStart(2, '0');
    let time = null;
    if (m[4] != null) {
      const hh = +m[4], mi = +m[5];
      if (hh < 24 && mi < 60) time = `${pad(hh)}:${pad(mi)}`;
    }
    return { date: `${year}-${pad(month)}-${pad(day)}`, time };
  }

  const RE_TITLE_ANY = /(นางสาว|น\.ส\.|นาย|นาง|mr\.?|mrs\.?|ms\.?|miss)\s*/i;
  function cleanName(s) {
    if (!s) return '';
    let n = s;
    const t = RE_TITLE_ANY.exec(n);
    if (t && t.index > 0 && t.index <= 6) n = n.slice(t.index); // icon noise in front of the title
    n = n.replace(/^[^A-Za-z฀-๿(]+/, '').replace(/[^A-Za-z฀-๿.)]+$/, '').trim();
    if (/^\(/.test(n) && !/\)/.test(n)) n = n.replace(/^\(\S{0,3}\s*/, '');
    n = n.replace(/^\(?\s*[5S][0OoCc]{1,2}[8B](?=\s)/, 'SCB'); // "SCB มณี SHOP" often comes out as "( 50o8 มณี SHOP"
    // put back a space after a title that OCR glued on
    n = n.replace(RE_TITLE, (t) => t.trim() + ' ');
    return n.trim();
  }

  function isContentLine(l) {
    const c = compact(l);
    if (c.length < 2) return false;
    if (RE_NOISE_LINE.test(c)) return false;
    if (RE_BANKLINE.test(c)) return false;
    if (RE_ACCOUNT.test(c) && !/[฀-๿]{3,}/.test(c.replace(/รหัส|บัญชี/g, ''))) return false;
    if (/^\d[\d\s:.,\-]*$/.test(c)) return false;
    if (/^(จาก|ไปยัง|จำนวน|บันทึก)/.test(c)) return false;
    if (/(ม\.ค\.|ก\.พ\.|มี\.ค\.|เม\.ย\.|พ\.ค\.|มิ\.ย\.|ก\.ค\.|ส\.ค\.|ก\.ย\.|ต\.ค\.|พ\.ย\.|ธ\.ค\.)\s*\d{2}/.test(l)) return false;
    // must contain some letters
    const letters = (c.match(/[A-Za-zก-ฮ]/g) || []).length;
    return letters >= 2 && letters / c.length > 0.35;
  }

  function afterLabel(line, labelRe) {
    const m = labelRe.exec(line);
    if (!m) return '';
    return line.slice(m.index + m[0].length).replace(/^\s*[:：]\s*/, '').trim();
  }

  /* ---------- main ---------- */
  function parseSlip(ocrText, qrPayload, opts) {
    opts = opts || {};
    const qr = parseQR(qrPayload);
    const rawLines = (ocrText || '').split(/\r?\n/);
    const lines = rawLines.map(cleanLine).filter((l) => l.length > 0);
    const all = lines.join('\n');
    const allC = compact(all).toLowerCase();

    const r = {
      bank: qr && qr.bank,
      bankCode: qr && qr.bankCode,
      ref: qr && qr.ref,
      qrRaw: qr && qr.raw,
      kind: /จ่ายบิล|ชำระบิล|billpayment/i.test(allC) ? 'bill' : 'transfer',
      date: null, time: null, dateFrom: null,
      amount: null, amountFrom: null,
      fee: null,
      sender: '', receiver: '',
      memo: '', memoFound: false,
      lines,
    };

    // bank by text if QR missing (check KBank / KTB first: a KBank bill to "SCB ..." mentions SCB)
    if (!r.bank) {
      if (/k\+|kplus|กสิกร/.test(allC)) r.bank = 'kbank';
      else if (/krungthai|กรุงไทย/.test(allC)) r.bank = 'ktb';
      else if (/^scb|ไทยพาณิชย์|scb/.test(allC)) r.bank = 'scb';
    }
    r.bankName = r.bank ? (Object.values(BANKS).find((b) => b.id === r.bank) || {}).name : null;

    // ---- date & time
    const od = parseThaiDate(all);
    const rd = dateFromRef(r.bank, r.ref, opts.now);
    if (rd && od && rd.date === od.date) {
      r.date = od.date; r.time = od.time || rd.time; r.dateFrom = 'both';
    } else if (rd) {
      r.date = rd.date; r.time = rd.time || (od && od.date === rd.date ? od.time : null) || (od ? od.time : null); r.dateFrom = 'ref';
    } else if (od) {
      r.date = od.date; r.time = od.time; r.dateFrom = 'ocr';
    }

    // ---- amount
    const idxAmt = lines.findIndex((l) => /จ[ำา]?นวน|amount/i.test(compact(l)));
    if (idxAmt >= 0) {
      for (let k = idxAmt; k <= Math.min(idxAmt + 2, lines.length - 1); k++) {
        if (k > idxAmt && /ค่าธรรมเนียม|fee/i.test(compact(lines[k]))) break;
        const v = moneyIn(lines[k]).find((x) => x > 0);
        if (v != null) {
          r.amount = v; r.amountFrom = 'label';
          if (/\d[.,]\s?\d{2}[.,]\d{2}(?!\d)/.test(lines[k]) || /\d[,.]\s+\d/.test(lines[k])) r.amountSuspicious = true;
          break;
        }
      }
    }
    const idxFee = lines.findIndex((l) => /ค่าธรรมเนียม|fee/i.test(compact(l)));
    if (idxFee >= 0) {
      for (let k = idxFee; k <= Math.min(idxFee + 1, lines.length - 1); k++) {
        const v = moneyIn(lines[k]);
        if (v.length) { r.fee = v[0]; break; }
      }
    }
    if (r.amount == null) {
      const cands = [];
      lines.forEach((l, i) => {
        if (i === idxFee || i === idxFee + 1) return;
        moneyIn(l).forEach((v) => { if (v > 0) cands.push(v); });
      });
      if (cands.length) { r.amount = Math.max(...cands); r.amountFrom = 'guess'; }
    }

    // ---- memo
    const reMemo = /บันทึกช่วยจ[ำา]|บันทึก|ช่วยจ[ำา]|memo|note/i;
    const idxMemo = lines.findIndex((l) => reMemo.test(l));
    if (idxMemo >= 0) {
      let v = afterLabel(lines[idxMemo], reMemo);
      if (!v && idxMemo + 1 < lines.length) v = lines[idxMemo + 1];
      v = (v || '').replace(/^[:：\s]+/, '').trim();
      if (v && !/^(ผู้รับเงิน|สแกน)/.test(v)) { r.memo = v; r.memoFound = true; }
    }

    // ---- sender / receiver
    const idxFrom = lines.findIndex((l) => /^จาก/.test(compact(l)) && !/^จากนั้น/.test(compact(l)));
    const idxTo = lines.findIndex((l) => /^ไปยัง/.test(compact(l)));
    const firstContentIdx = (i, stopAt) => {
      for (let k = i; k < Math.min(stopAt, lines.length); k++) if (isContentLine(lines[k])) return k;
      return -1;
    };
    // last 4 visible digits of the account printed under a name: "xxx-x-x9410-x" → 9410
    const acctAfter = (i, stopAt) => {
      if (i < 0) return null;
      for (let k = i + 1; k <= Math.min(i + 3, (stopAt == null ? lines.length : stopAt) - 1, lines.length - 1); k++) {
        const c = compact(lines[k]);
        if (/[xX×*]{2,}/.test(c) || /\d{3}-\d/.test(c) || /^\(?\d{10,}\)?$/.test(c)) {
          const d = c.replace(/\D/g, '');
          if (d.length >= 3) return d.slice(-4);
        }
      }
      return null;
    };
    let sIdx = -1, rIdx = -1;
    if (idxFrom >= 0 || idxTo >= 0) {
      if (idxFrom >= 0) {
        const same = afterLabel(lines[idxFrom], /^จาก/);
        if (same && isContentLine(same)) { r.sender = cleanName(same); sIdx = idxFrom; }
        else { sIdx = firstContentIdx(idxFrom + 1, idxTo > idxFrom ? idxTo : idxFrom + 4); r.sender = cleanName(sIdx >= 0 ? lines[sIdx] : ''); }
        r.senderAcct = acctAfter(sIdx, idxTo > idxFrom ? idxTo : undefined);
      }
      if (idxTo >= 0) {
        const same = afterLabel(lines[idxTo], /^ไปยัง/);
        if (same && isContentLine(same)) { r.receiver = cleanName(same); rIdx = idxTo; }
        else { rIdx = firstContentIdx(idxTo + 1, idxTo + 4); r.receiver = cleanName(rIdx >= 0 ? lines[rIdx] : ''); }
        r.receiverAcct = acctAfter(rIdx, idxAmt > rIdx ? idxAmt : undefined);
      }
    } else {
      // K PLUS style: sender block, then receiver block, before "จำนวน"
      const stop = idxAmt >= 0 ? idxAmt : lines.length;
      const ci = [];
      for (let k = 0; k < stop; k++) if (isContentLine(lines[k])) ci.push(k);
      // prefer lines with a personal title for the sender
      const ti = ci.findIndex((k) => RE_TITLE.test(lines[k]));
      const start = ti >= 0 ? ti : 0;
      r.sender = cleanName(ci[start] != null ? lines[ci[start]] : '');
      sIdx = ci[start] != null ? ci[start] : -1;
      r.senderAcct = acctAfter(sIdx, ci[start + 1] != null ? ci[start + 1] : stop);
      let rv = ci[start + 1] != null ? lines[ci[start + 1]] : '';
      // long names wrap: "นางสาว พลอยรัศญ์ กล่อม" + "ปัญญา", "SCB มณี SHOP (ร้านแหนม" + "ทอด)"
      const rk = ci[start + 1];
      if (rk != null && ci[start + 2] === rk + 1 && lines[rk + 1].length <= 24 && !isContentLine(lines[rk + 2] || '')) {
        rv += (/[\u0E00-\u0E7F]$/.test(rv) && /^[\u0E00-\u0E7F]/.test(lines[rk + 1]) ? '' : ' ') + lines[rk + 1];
      }
      r.receiver = cleanName(rv);
      r.receiverAcct = rk != null ? acctAfter(rk, stop) : null;
    }

    return r;
  }

  /* ---------- name matching ---------- */
  // Titles are stripped after punctuation is removed, so OCR variants like "น ส", "น.ส", "u.ส." still work
  const RE_TITLE_BARE = /^(นางสาว|นส|นาย|นาง|ดช|ดญ|mrs|mr|ms|miss)/;
  function normName(s) {
    let x = (s || '').toLowerCase().replace(/[^a-z\u0E00-\u0E7F]/g, '');
    const y = x.replace(RE_TITLE_BARE, '');
    if (y.length >= 3) x = y;
    return x;
  }
  function sameName(a, b) {
    const x = normName(a), y = normName(b);
    if (x.length < 3 || y.length < 3) return false;
    const [s, l] = x.length <= y.length ? [x, y] : [y, x];
    if (l.startsWith(s)) return true;
    if (s.length >= 4 && l.startsWith(s.slice(0, Math.max(4, s.length - 1)))) return true;
    if (s.length >= 4 && l.includes(s)) return true; // e.g. a leftover title or icon noise in front
    // tolerate misread letters (OCR typos in our own name, e.g. ณฐพงศ์ read as ณฐธุพงศ์)
    if (s.length >= 4) {
      const tol = s.length >= 7 ? 2 : 1;
      for (const n of [s.length - 1, s.length, s.length + 1]) if (n <= l.length && lev(s, l.slice(0, n)) <= tol) return true;
    }
    const ks = skeleton(s), kl = skeleton(l);
    if (ks.length >= 4) {
      const tol = ks.length >= 5 ? 2 : 1;
      for (let st = 0; st <= Math.min(2, kl.length - 1); st++)
        for (let n = ks.length - tol; n <= ks.length + tol; n++)
          if (n > 0 && st + n <= kl.length && lev(ks, kl.slice(st, st + n)) <= tol) return true;
    }
    return false;
  }
  // consonants only: drop Thai vowels and tone marks, which OCR gets wrong most often
  function skeleton(x) { return x.replace(/[\u0E30-\u0E3A\u0E40-\u0E4E]/g, ''); }
  function lev(a, b) {
    const m = a.length, n = b.length, d = Array.from({ length: m + 1 }, (_, i) => [i]);
    for (let j = 1; j <= n; j++) d[0][j] = j;
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[m][n];
  }
  // a readable name, not OCR garbage (used to decide whether a sender is really someone else)
  function looksLikeName(s) {
    if (!s) return false;
    if (/\d/.test(s)) return false;
    const letters = (s.match(/[A-Za-zก-ฮ]/g) || []).length;
    if (letters < 4) return false;
    return RE_TITLE_ANY.test(s) || /^[ก-๛A-Za-z .()]+$/.test(s);
  }
  function matchesAny(name, list) {
    return (list || []).some((n) => n && sameName(name, n));
  }

  const api = { parseSlip, parseQR, dateFromRef, parseThaiDate, normName, sameName, matchesAny, looksLikeName, moneyIn, cleanLine, BANKS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SlipParser = api;
})(typeof self !== 'undefined' ? self : this);
