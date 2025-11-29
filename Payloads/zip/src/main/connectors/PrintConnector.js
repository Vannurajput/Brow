const { BrowserWindow } = require('electron');
const log = require('../../logger');

/* ---------- utils ---------- */
function escapeHtml(text) {
  if (text == null) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
function isNum(v) { const n = Number(v); return Number.isFinite(n); }
function money(v) { return isNum(v) ? Number(v).toFixed(2) : '0.00'; }

/* ---------- HTML builder tuned for 80mm printers ---------- */
function buildReceiptHtml(payload) {
  const blocks = Array.isArray(payload?.data) ? payload.data : [];

  // Make the inner printable width slightly smaller than the paper
  // so we never hit the driver’s unprintable margins.
  const printableMm = Math.min(72, Number(payload?.printable_mm) || 70);
  const leftOffsetMm = Number(payload?.left_offset_mm) || 0;   // + moves right
  const fontSizePx   = Number(payload?.font_size_px) || 13;
  const sepChars     = Number(payload?.item_length) || 42;

  const priceColMm = Math.max(18, Math.min(28, Math.round(printableMm * 0.35))); // ~35% width
  const qtyColMm   = 8;  // small fixed column for quantity

  const css = `
    @page { size: 80mm auto; margin: 0; }
    html, body { margin: 0; padding: 0; }
    body {
      font-family: monospace;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      font-size: ${fontSizePx}px;
      background: #fff;
    }
    /* Our inner "paper". Left-aligned with a little padding + optional nudge */
    .paper {
      width: ${printableMm}mm;
      margin: 0;
      padding: 3mm 2mm 3mm 4mm;    /* LEFT padding protects against clipping */
      transform: translateX(${leftOffsetMm}mm);
      box-sizing: border-box;
    }

    .center { text-align: center; }
    .right  { text-align: right; }
    .left   { text-align: left; }

    .logo { margin: 2mm 0 3mm; text-align: center; }
    .logo img { max-width: 100%; height: auto; display: inline-block; }

    .line  { margin: 1mm 0; }
    .sep   { margin: 2mm 0 2mm; border-top: 1px dashed #000; }

    /* Item rows: qty | name | price */
    .row {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 2mm;
      margin: 0.5mm 0;
    }
    .row.head { font-weight: 700; margin-top: 2mm; }
    .qty {
      flex: 0 0 ${qtyColMm}mm;
      text-align: right;
      white-space: nowrap;
    }
    .name {
      flex: 1 1 auto;
      min-width: 0;
      word-break: break-word;
      white-space: pre-wrap;
      padding-right: 2mm;
    }
    .amount {
      flex: 0 0 ${priceColMm}mm;
      text-align: right;
      white-space: nowrap;
    }
    .bold { font-weight: 700; }
  `;

  let html = '';
  html += '<!DOCTYPE html><html><head><meta charset="UTF-8" />';
  html += '<title>Receipt</title>';
  html += `<style>${css}</style></head><body>`;
  html += `<div class="paper">`;

  for (const block of blocks) {
    const type = block?.type;
    const d = block?.data || {};

    // LOGO
    if (type === 'logo' && d.url) {
      html += `<div class="logo"><img src="${escapeHtml(d.url)}" alt="logo"/></div>`;
    }

    // HEADER (centered)
    if (type === 'header') {
      if (d.top_title) html += `<div class="center bold line">${escapeHtml(d.top_title)}</div>`;
      (d.sub_titles || []).forEach(t => { html += `<div class="center line">${escapeHtml(t)}</div>`; });
      (d.address || []).forEach(a => { html += `<div class="center line">${escapeHtml(a)}</div>`; });
      if (d.bill_no)   html += `<div class="center line">Bill No: ${escapeHtml(d.bill_no)}</div>`;
      if (d.ticket_no) html += `<div class="center line">Ticket: ${escapeHtml(d.ticket_no)}</div>`;
      if (d.date_of_bill || d.time) {
        const dt = `${d.date_of_bill ? escapeHtml(d.date_of_bill) : ''}${d.time ? ' ' + escapeHtml(d.time) : ''}`;
        html += `<div class="center line">${dt}</div>`;
      }
      if (d.order_type) html += `<div class="center line">Order Type: ${escapeHtml(d.order_type)}</div>`;
      if (d.employee)   html += `<div class="center line">Employee: ${escapeHtml(d.employee)}</div>`;
      if (d.till)       html += `<div class="center line">Till: ${escapeHtml(d.till)}</div>`;
      html += `<div class="sep"></div>`;
    }

    // SEPARATOR (text dashes)
    if (type === 'separator') {
      const len = Number(d.separator_length) || sepChars;
      html += `<div class="line">${'-'.repeat(Math.max(4, len))}</div>`;
    }

    // ITEMS: header row + qty | name | price
    if (type === 'item' && Array.isArray(d.itemdata)) {
      // ---- NEW: column header once, before the items ----
      html += `
        <div class="row head">
          <div class="name">Item</div>
          <div class="qty">Qty</div>
          <div class="amount">Price</div>
        </div>
        <div class="sep"></div>
      `;
      // ---------------------------------------------------

      for (const it of d.itemdata) {
        const qty = isNum(it.quantity) ? Number(it.quantity) : 1;
        const name = (it.item_name || '').trim();
        const amount = isNum(it.item_amount) ? it.item_amount
                      : isNum(it.price) ? it.price : 0;

        html += `
          <div class="row">
            <div class="name">${escapeHtml(name)}</div>
            <div class="qty">${qty}</div>
            <div class="amount">${money(amount)}</div>
          </div>
        `;
      }
      html += `<div class="sep"></div>`;
    }

    // SUMMARY (key left, value right)
    if (type === 'summary' && Array.isArray(d.summary)) {
      for (const s of d.summary) {
        html += `
          <div class="row">
            <div class="name">${escapeHtml(s.key)}</div>
            <div class="amount">${money(s.value)}</div>
          </div>
        `;
      }
    }

    // BIG SUMMARY (bold)
    if (type === 'bigsummary' && Array.isArray(d.bigsummary)) {
      html += `<div class="sep"></div>`;
      for (const s of d.bigsummary) {
        html += `
          <div class="row bold">
            <div class="name">${escapeHtml(s.key)}</div>
            <div class="amount">${money(s.value)}</div>
          </div>
        `;
      }
      html += `<div class="sep"></div>`;
    }

    // FOOTER (align per JSON)
    if (type === 'footer' && Array.isArray(d.footer_text)) {
      const align = (d.align || 'center').toLowerCase();
      const cls = (align === 'left' || align === 'right' || align === 'center') ? align : 'center';
      html += `<div class="${cls}">`;
      d.footer_text.forEach(f => { html += `<div class="line">${escapeHtml(f)}</div>`; });
      html += `</div>`;
    }
  }

  html += `</div></body></html>`;
  return html;
}

/* ---------- main connector ---------- */
class PrintConnector {
  async execute(payload) {
    log.info('[PrintConnector] execute called with payload');
    if (!payload || typeof payload !== 'object') {
      log.error('[PrintConnector] invalid or missing payload:', payload);
      throw new Error('PrintConnector: invalid payload');
    }

    const html = buildReceiptHtml(payload);

    const win = new BrowserWindow({
      width: 480,
      height: 800,
      show: false,
      webPreferences: { sandbox: true }
    });

    const url = 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
    await new Promise((resolve, reject) => {
      win.webContents.once('did-finish-load', resolve);
      win.webContents.once('did-fail-load', (_e, code, desc) =>
        reject(new Error(`PrintConnector: failed to load HTML (${code}) ${desc}`))
      );
      win.loadURL(url);
    });

    const deviceName = Array.isArray(payload.printer_name) ? payload.printer_name[0] : undefined;

    return await new Promise((resolve) => {
      win.webContents.print(
        { silent: true, deviceName, printBackground: true },
        (success, reason) => {
          if (!win.isDestroyed()) win.close();
          if (!success) {
            log.error('[PrintConnector] print failed:', reason || 'unknown');
            resolve({ ok: false, error: reason || 'print failed' });
          } else {
            log.info('[PrintConnector] print job sent');
            resolve({ ok: true, printed: true, silent: true });
          }
        }
      );
    });
  }
}

module.exports = PrintConnector;
