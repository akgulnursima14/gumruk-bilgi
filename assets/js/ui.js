/**
 * ui.js — Modal, toast, DOM render yardımcıları
 */

import { esc, fmtDate } from './data.js';
import { exactAirport, airportAutocomplete } from './search.js';

export { esc, fmtDate };

/* ================================================================
   TOAST
   ================================================================ */

export function showToast(msg, type = '') {
  const c = document.getElementById('toastContainer');
  if (!c) return;
  const el = document.createElement('div');
  el.className = `toast${type ? ' ' + type : ''}`;
  el.textContent = msg;
  c.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transition = 'opacity .3s';
    setTimeout(() => el.remove(), 350);
  }, 3200);
}

/* ================================================================
   MODAL ALTYAPISI
   ================================================================ */

const _backdrop = () => document.getElementById('modalBackdrop');
let _openModal = null;

function focusables(el) {
  return [...el.querySelectorAll(
    'button:not([disabled]), input:not([disabled]), select:not([disabled]),' +
    'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )];
}

function trapFocus(e, modal) {
  if (e.key !== 'Tab') return;
  const els = focusables(modal);
  if (!els.length) { e.preventDefault(); return; }
  const first = els[0], last = els[els.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault(); last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault(); first.focus();
  }
}

function openModal(el) {
  const bd = _backdrop();
  if (bd) bd.hidden = false;
  el.hidden = false;
  _openModal = el;
  el._trapFn = e => trapFocus(e, el);
  document.addEventListener('keydown', el._trapFn);
  document.addEventListener('keydown', handleGlobalEsc);
  const first = focusables(el)[0];
  if (first) setTimeout(() => first.focus(), 50);
}

export function closeModal(el) {
  if (!el) return;
  const bd = _backdrop();
  if (bd) bd.hidden = true;
  el.hidden = true;
  if (el._trapFn) document.removeEventListener('keydown', el._trapFn);
  document.removeEventListener('keydown', handleGlobalEsc);
  _openModal = null;
}

function handleGlobalEsc(e) {
  if (e.key === 'Escape' && _openModal) closeModal(_openModal);
}

document.getElementById('modalBackdrop')
  ?.addEventListener('click', () => { if (_openModal) closeModal(_openModal); });

/* ================================================================
   ONAY MODALI
   ================================================================ */

export function showConfirm(msg, okLabel = 'Sil') {
  return new Promise(resolve => {
    const modal = document.getElementById('confirmModal');
    document.getElementById('confirmMsg').textContent = msg;
    const okBtn     = document.getElementById('confirmOk');
    const cancelBtn = document.getElementById('confirmCancel');
    okBtn.textContent = okLabel;

    const cleanup = result => {
      closeModal(modal);
      okBtn.onclick = null;
      cancelBtn.onclick = null;
      resolve(result);
    };
    okBtn.onclick     = () => cleanup(true);
    cancelBtn.onclick = () => cleanup(false);
    openModal(modal);
  });
}

/* ================================================================
   PROMPT MODALI
   ================================================================ */

export function showPrompt(title, label, defaultVal = '') {
  return new Promise(resolve => {
    const modal  = document.getElementById('promptModal');
    const input  = document.getElementById('promptInput');
    const errEl  = document.getElementById('promptError');
    document.getElementById('promptTitle').textContent = title;
    document.getElementById('promptLabel').textContent = label;
    input.value  = defaultVal;
    errEl.hidden = true;
    errEl.textContent = '';

    const okBtn     = document.getElementById('promptOk');
    const cancelBtn = document.getElementById('promptCancel');

    const cleanup = result => {
      closeModal(modal);
      okBtn.onclick     = null;
      cancelBtn.onclick = null;
      input.onkeydown   = null;
      resolve(result);
    };

    okBtn.onclick = () => {
      const v = input.value.trim();
      if (!v) { errEl.textContent = 'Bu alan boş bırakılamaz.'; errEl.hidden = false; return; }
      cleanup(v);
    };
    cancelBtn.onclick = () => cleanup(null);
    input.onkeydown   = e => { if (e.key === 'Enter') okBtn.click(); };
    openModal(modal);
  });
}

/* ================================================================
   YOLCU DÜZENLEME MODALI
   ================================================================ */

export function showEditPassModal(p, onSave) {
  const modal = document.getElementById('editPassModal');

  document.getElementById('editPName').value   = p.name || '';
  document.getElementById('editPBags').value   = p.bags ?? '';
  document.getElementById('editPWeight').value = p.weight ?? '';
  document.getElementById('editPAirport').value= p.code || '';
  document.getElementById('editPNote').value   = p.note || '';
  _updateEditPreview(p.code || '');

  ['editPNameErr','editPBagsErr','editPWeightErr','editPAirportErr'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.hidden = true; el.textContent = ''; }
  });

  const okBtn     = document.getElementById('editPassOk');
  const cancelBtn = document.getElementById('editPassCancel');

  const cleanup = () => {
    closeModal(modal);
    okBtn.onclick     = null;
    cancelBtn.onclick = null;
  };

  okBtn.onclick = async () => {
    const name   = document.getElementById('editPName').value.trim();
    const bags   = document.getElementById('editPBags').value.trim();
    const weight = document.getElementById('editPWeight').value.trim();
    const code   = document.getElementById('editPAirport').value.trim();
    const note   = document.getElementById('editPNote').value.trim();

    const showErr = (id, msg) => {
      const el = document.getElementById(id);
      if (el) { el.textContent = msg; el.hidden = false; }
    };
    const clearErr = id => {
      const el = document.getElementById(id);
      if (el) { el.hidden = true; el.textContent = ''; }
    };

    ['editPNameErr','editPBagsErr','editPWeightErr','editPAirportErr'].forEach(clearErr);
    let valid = true;

    if (!name)                                                              { showErr('editPNameErr', 'Yolcu adını yazın.'); valid = false; }
    if (bags === '' || !Number.isFinite(+bags) || +bags < 0)               { showErr('editPBagsErr', 'Geçerli çanta sayısı girin.'); valid = false; }
    if (weight === '' || !Number.isFinite(+weight) || +weight < 0)         { showErr('editPWeightErr', 'Geçerli ağırlık girin.'); valid = false; }
    if (!exactAirport(code))                                                { showErr('editPAirportErr', 'Geçerli havalimanı kodu girin.'); valid = false; }
    if (!valid) return;

    try {
      await onSave({ name, bags, weight, code, note });
      cleanup();
    } catch (err) {
      showErr('editPAirportErr', err.message);
    }
  };
  cancelBtn.onclick = cleanup;
  openModal(modal);
}

function _updateEditPreview(code) {
  const el = document.getElementById('editPAirportPreview');
  if (!el) return;
  if (!code) { el.className = 'airport-preview'; el.textContent = ''; return; }
  const a = exactAirport(code.trim().toUpperCase());
  if (!a)  { el.className = 'airport-preview warn'; el.textContent = `${code.toUpperCase()} bulunamadı.`; return; }
  el.className = 'airport-preview ok';
  el.textContent = `${a.i || a.o || a.d} → ${a.n} (${a.ct || a.cc || ''})`;
}

document.getElementById('editPAirport')?.addEventListener('input', e => {
  e.target.value = e.target.value.toUpperCase();
  _updateEditPreview(e.target.value);
});

/* ================================================================
   HAVALİMANI AUTOCOMPLETE
   ================================================================ */

export function setupAirportAutocomplete(inputId, listId) {
  const input = document.getElementById(inputId);
  const list  = document.getElementById(listId);
  if (!input || !list) return;

  let suggestions = [];
  let selIdx      = -1;

  const render = items => {
    suggestions = items;
    if (!items.length) { list.hidden = true; return; }
    list.innerHTML = items.map((a, i) => {
      const code = a.i || a.o || a.d;
      return `<div class="autocomplete-item${i === selIdx ? ' selected' : ''}"
                   data-idx="${i}" role="option" aria-selected="${i === selIdx}">
        <div class="autocomplete-code">${esc(code)}</div>
        <div>
          <div class="autocomplete-name">${esc(a.n)}</div>
          <div class="autocomplete-place">${esc([a.m, a.ct].filter(Boolean).join(', '))}</div>
        </div>
      </div>`;
    }).join('');
    list.hidden = false;

    list.querySelectorAll('.autocomplete-item').forEach(el => {
      el.addEventListener('mousedown', e => {
        e.preventDefault();
        const a = suggestions[+el.dataset.idx];
        input.value = (a.i || a.o || a.d || '').toUpperCase();
        list.hidden = true;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
    });
  };

  input.addEventListener('input', () => {
    selIdx = -1;
    const val = input.value.trim();
    if (val.length < 2) { list.hidden = true; return; }
    render(airportAutocomplete(val));
  });

  input.addEventListener('keydown', e => {
    if (list.hidden || !suggestions.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selIdx = Math.min(selIdx + 1, suggestions.length - 1);
      render(suggestions);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selIdx = Math.max(selIdx - 1, 0);
      render(suggestions);
    } else if ((e.key === 'Enter' || e.key === 'Tab') && selIdx >= 0) {
      e.preventDefault();
      const a = suggestions[selIdx];
      input.value = (a.i || a.o || a.d || '').toUpperCase();
      list.hidden = true;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    } else if (e.key === 'Escape') {
      list.hidden = true;
    }
  });

  input.addEventListener('blur', () => setTimeout(() => { list.hidden = true; }, 180));
}

/* ================================================================
   HAVALİMANI ÖNIZLEME (form)
   ================================================================ */

export function updateAirportPreview(code) {
  const el = document.getElementById('airportPreview');
  if (!el) return;
  if (!code) {
    el.className = 'airport-preview';
    el.textContent = 'Havalimanı kodunu yazınca bilgi görünür.';
    return;
  }
  const a = exactAirport(code.trim().toUpperCase());
  if (!a) {
    el.className = 'airport-preview warn';
    el.textContent = `${code.toUpperCase()} bulunamadı.`;
    return;
  }
  el.className = 'airport-preview ok';
  el.textContent = `${a.i || a.o || a.d} → ${a.n} (${a.ct || a.cc || ''})`;
}

/* ================================================================
   HAVALİMANI ARAMA SONUÇ HTML'LERİ
   ================================================================ */

export function compactAirportHtml(a) {
  const code = a.i || a.o || a.d || '—';
  return `<div class="compact-airport">
    <div class="code-plate">${esc(code)}</div>
    <div class="compact-main">
      <div class="compact-name">${esc(a.n)}</div>
      <div class="compact-place">${esc([a.m, a.ct].filter(Boolean).join(', '))}</div>
    </div>
    <div class="compact-icao">${a.o && a.o !== code ? `ICAO<br><b>${esc(a.o)}</b>` : ''}</div>
  </div>`;
}

export function reverseListHtml(matches) {
  return `<div class="reverse-list">${matches.map(a => `
    <div class="reverse-item" data-code="${esc(a.i || a.o || a.d)}" role="button" tabindex="0">
      <div class="code-plate sm">${esc(a.i || a.o || a.d)}</div>
      <div>
        <div class="reverse-name">${esc(a.n)}</div>
        <div class="reverse-place">${esc([a.m, a.ct].filter(Boolean).join(', '))}</div>
      </div>
    </div>`).join('')}</div>`;
}

/* ================================================================
   PDF RAPORU
   ================================================================ */

export function exportFlightPDF(f, g) {
  const passengers = f.passengers || [];
  const totalBags   = passengers.reduce((s, p) => s + (+p.bags   || 0), 0);
  const totalWeight = passengers.reduce((s, p) => s + (+p.weight || 0), 0).toFixed(1);

  const rows = passengers.map((p, i) =>
    `<tr>
      <td>${i + 1}</td>
      <td>${esc(p.name)}</td>
      <td style="text-align:right">${esc(p.bags)}</td>
      <td style="text-align:right">${esc(p.weight)} kg</td>
      <td>${esc(p.code || '')} — ${esc(p.airportName || '')} (${esc(p.country || '')})</td>
      <td style="text-align:center">${p.checked ? '✓' : ''}</td>
      <td>${esc(p.note || '')}</td>
    </tr>`
  ).join('');

  const w = window.open('', '_blank');
  if (!w) { showToast('PDF penceresi açılamadı. Açılır pencere engelini kontrol edin.', 'err'); return; }

  w.document.write(`<!doctype html><html lang="tr"><head>
  <meta charset="utf-8">
  <title>${esc(g.name)} — ${esc(f.flightNo)}</title>
  <style>
    @page { size: A4 landscape; margin: 12mm }
    body { font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 10pt }
    h1   { font-size: 17pt; margin: 0 0 4px }
    .meta { margin-bottom: 10px; color: #555; font-size: 9pt }
    table { width: 100%; border-collapse: collapse; table-layout: fixed }
    th, td { border: 1px solid #888; padding: 5px 6px; vertical-align: top; overflow-wrap: anywhere }
    th { background: #eee; font-size: 9pt }
    .totals { margin-top: 8px; font-size: 9pt; color: #333 }
  </style>
  </head><body>
  <h1>${esc(g.name)} — ${esc(f.flightNo)}</h1>
  <div class="meta">
    ${f.date  ? `Tarih: ${esc(fmtDate(f.date))}` : ''}
    ${f.label ? ` &nbsp;|&nbsp; ${esc(f.label)}` : ''}
    &nbsp;|&nbsp; Yolcu sayısı: ${passengers.length}
  </div>
  <table>
    <thead><tr>
      <th style="width:4%">#</th>
      <th style="width:18%">Yolcu</th>
      <th style="width:7%;text-align:right">Çanta</th>
      <th style="width:9%;text-align:right">Ağırlık</th>
      <th style="width:32%">Geldiği havalimanı</th>
      <th style="width:6%;text-align:center">Tik</th>
      <th>Not</th>
    </tr></thead>
    <tbody>${rows || '<tr><td colspan="7">Yolcu kaydı yok.</td></tr>'}</tbody>
  </table>
  <div class="totals">
    Toplam: <b>${passengers.length}</b> yolcu &nbsp;|&nbsp;
    <b>${totalBags}</b> çanta &nbsp;|&nbsp;
    <b>${totalWeight}</b> kg
  </div>
  <script>window.onload = () => setTimeout(() => window.print(), 250)<\/script>
  </body></html>`);
  w.document.close();
}

/* ================================================================
   AĞAÇ RENDER
   ================================================================ */

export function renderTree(data, activeGroupId, activeFlightId, handlers) {
  const tree = document.getElementById('tree');
  const tot  = document.getElementById('groupTotal');
  if (!tree) return;
  if (tot) tot.textContent = `${data.length} klasör`;

  if (!data.length) {
    tree.innerHTML = '<div class="muted small" style="padding:8px">' +
      'Henüz klasör yok. "+ Yeni Ana Klasör" ile başlayın.</div>';
    return;
  }

  tree.innerHTML = data.map(g => `
    <div class="group">
      <div class="group-head ${g.id === activeGroupId ? 'active' : ''}" data-gid="${esc(g.id)}">
        <div>
          <div class="group-name">${esc(g.name)}</div>
          <div class="muted small">${(g.flights || []).length} uçuş</div>
        </div>
        <div class="group-actions">
          <button class="tiny add-flight" data-gid="${esc(g.id)}" title="Uçuş ekle">+</button>
          <button class="tiny rename-group" data-gid="${esc(g.id)}" title="Yeniden adlandır">Ad</button>
          <button class="tiny danger del-group" data-gid="${esc(g.id)}" title="Sil">Sil</button>
        </div>
      </div>
      <div class="flight-list">
        ${(g.flights || []).length
          ? (g.flights || []).map(f => `
            <div class="flight-item ${f.id === activeFlightId ? 'active' : ''}"
                 data-gid="${esc(g.id)}" data-fid="${esc(f.id)}">
              <div class="flight-line">${esc(f.flightNo || 'Uçuş')}</div>
              <div class="flight-meta">
                ${f.date ? esc(fmtDate(f.date)) : ''}
                ${f.label ? ` · ${esc(f.label)}` : ''}
                · ${(f.passengers || []).length} yolcu
              </div>
            </div>`).join('')
          : '<div class="muted small" style="padding:8px">Henüz uçuş yok. + ile ekle.</div>'
        }
      </div>
    </div>`).join('');

  tree.querySelectorAll('.group-head').forEach(el =>
    el.addEventListener('click', e => {
      if (e.target.closest('button')) return;
      handlers.selectGroup(el.dataset.gid);
    }));
  tree.querySelectorAll('.flight-item').forEach(el =>
    el.addEventListener('click', () => handlers.selectFlight(el.dataset.gid, el.dataset.fid)));
  tree.querySelectorAll('.add-flight').forEach(b =>
    b.addEventListener('click', () => handlers.addFlight(b.dataset.gid)));
  tree.querySelectorAll('.rename-group').forEach(b =>
    b.addEventListener('click', () => handlers.renameGroup(b.dataset.gid)));
  tree.querySelectorAll('.del-group').forEach(b =>
    b.addEventListener('click', () => handlers.deleteGroup(b.dataset.gid)));
}

/* ================================================================
   ÇALIŞMA ALANI RENDER
   ================================================================ */

// Sıralama & filtre durumu (modül seviyesi — oturum boyunca kalır)
let _filter = '';
let _sort   = { col: '', dir: 1 };

export function renderWorkspace(f, g, handlers) {
  const wrap = document.getElementById('workspace');
  if (!wrap) return;

  if (!f || !g) {
    wrap.innerHTML = `<div class="flight-empty">
      <div>
        <div style="font-size:2.6rem;margin-bottom:12px">📂</div>
        <h3>Bir uçuş seçin</h3>
        <div class="muted small" style="margin-top:6px">
          Sol panelden uçuş seçin veya yeni uçuş ekleyin.
        </div>
      </div>
    </div>`;
    return;
  }

  const ps       = f.passengers || [];
  const checked  = ps.filter(p => p.checked).length;
  const totBags  = ps.reduce((s, p) => s + (+p.bags   || 0), 0);
  const totWt    = ps.reduce((s, p) => s + (+p.weight || 0), 0).toFixed(1);

  wrap.innerHTML = `
    <div class="flight-head">
      <div>
        <div class="flight-title">
          <span class="code-plate sm">${esc(f.flightNo)}</span>
          ${f.label ? `<span>· ${esc(f.label)}</span>` : ''}
        </div>
        <div class="flight-sub">${esc(g.name)}${f.date ? ` · ${esc(fmtDate(f.date))}` : ''}</div>
      </div>
      <div class="flight-head-actions">
        <button id="pdfFlight"     class="btn btn-primary btn-sm">PDF Raporu</button>
        <button id="renameFlight"  class="btn btn-secondary btn-sm">Uçuş No Değiştir</button>
        <button id="deleteFlight"  class="btn btn-danger btn-sm">Uçuşu Sil</button>
      </div>
    </div>

    <div class="section-card">
      <div class="section-head"><h3>Yolcu Ekle</h3></div>
      <div class="add-grid">
        <div>
          <label class="label" for="pName">Yolcu adı</label>
          <input id="pName" class="input" placeholder="Ad Soyad" autocomplete="off">
        </div>
        <div>
          <label class="label" for="pBags">Çanta</label>
          <input id="pBags" class="input" type="number" min="0" step="1" placeholder="0">
        </div>
        <div>
          <label class="label" for="pWeight">Ağırlık (kg)</label>
          <input id="pWeight" class="input" type="number" min="0" step="0.1" placeholder="0.0">
        </div>
        <div class="airport-ac-wrap">
          <label class="label" for="pAirport">Hav. kodu</label>
          <input id="pAirport" class="input" placeholder="AYT / LTAI" autocomplete="off"
                 aria-autocomplete="list" aria-controls="pAirportList">
          <div id="pAirportList" class="autocomplete-list" hidden role="listbox"></div>
        </div>
        <div>
          <label class="label" for="pNote">Not</label>
          <input id="pNote" class="input" placeholder="İsteğe bağlı">
        </div>
        <div style="padding-top:22px">
          <button id="addPassengerBtn" class="btn btn-primary" style="width:100%">Ekle</button>
        </div>
      </div>
      <div id="airportPreview" class="airport-preview">Havalimanı kodunu yazınca bilgi görünür.</div>
      <div id="addPassError" class="field-error" hidden></div>
    </div>

    <div class="section-card">
      <div class="section-head"><h3>Yolcu Listesi</h3></div>
      <div class="stats">
        <span class="stat">Yolcu: <b>${ps.length}</b></span>
        <span class="stat">Tikli: <b>${checked}</b></span>
        <span class="stat">Kalan: <b>${ps.length - checked}</b></span>
        <span class="stat">Toplam çanta: <b>${totBags}</b></span>
        <span class="stat">Toplam ağırlık: <b>${totWt} kg</b></span>
      </div>
      <div class="list-tools">
        <input id="passengerFilter" class="input list-search"
               placeholder="Ara: ad, kod, ülke, not…"
               value="${esc(_filter)}"
               aria-label="Yolcular arasında ara">
      </div>
      ${_passengerTableHtml(f)}
    </div>
  `;

  // Olay bağlama
  document.getElementById('pdfFlight')    ?.addEventListener('click', () => handlers.pdfFlight());
  document.getElementById('renameFlight') ?.addEventListener('click', () => handlers.renameFlight());
  document.getElementById('deleteFlight') ?.addEventListener('click', () => handlers.deleteFlight());
  document.getElementById('addPassengerBtn')?.addEventListener('click', () => handlers.addPassenger());

  const pAirport = document.getElementById('pAirport');
  pAirport?.addEventListener('input', e => {
    e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    updateAirportPreview(e.target.value);
  });

  setupAirportAutocomplete('pAirport', 'pAirportList');

  document.getElementById('passengerFilter')?.addEventListener('input', e => {
    _filter = e.target.value;
    _rerenderTable(f, handlers);
  });

  _wireTable(f, handlers);
}

function _passengerTableHtml(f) {
  let ps = [...(f.passengers || [])];

  if (_filter) {
    const t = _filter.toLowerCase();
    ps = ps.filter(p =>
      (p.name        || '').toLowerCase().includes(t) ||
      (p.code        || '').toLowerCase().includes(t) ||
      (p.airportName || '').toLowerCase().includes(t) ||
      (p.country     || '').toLowerCase().includes(t) ||
      (p.note        || '').toLowerCase().includes(t)
    );
  }

  if (_sort.col) {
    ps.sort((a, b) => {
      switch (_sort.col) {
        case 'name':    return _sort.dir * (a.name || '').localeCompare(b.name || '', 'tr');
        case 'country': return _sort.dir * (a.country || '').localeCompare(b.country || '', 'tr');
        case 'bags':    return _sort.dir * (+a.bags   - +b.bags);
        case 'weight':  return _sort.dir * (+a.weight - +b.weight);
        case 'checked': return _sort.dir * (+a.checked - +b.checked);
        default: return 0;
      }
    });
  }

  if (!ps.length) {
    return _filter
      ? '<div class="muted small">Arama sonucu bulunamadı.</div>'
      : '<div class="muted small">Henüz yolcu eklenmedi. Yukarıdan ilk yolcuyu ekleyin.</div>';
  }

  const si = col => _sort.col === col ? (_sort.dir === 1 ? ' ↑' : ' ↓') : '';
  const sa = col => _sort.col === col
    ? `aria-sort="${_sort.dir === 1 ? 'ascending' : 'descending'}"`
    : '';

  return `<div class="tablewrap"><table>
    <thead><tr>
      <th class="checkcell">Tik</th>
      <th class="sortable" data-col="name"    ${sa('name')}>Yolcu${si('name')}</th>
      <th class="sortable num" data-col="bags" ${sa('bags')}>Çanta${si('bags')}</th>
      <th class="sortable num" data-col="weight" ${sa('weight')}>Ağırlık${si('weight')}</th>
      <th>Geldiği havalimanı</th>
      <th class="sortable" data-col="country" ${sa('country')}>Ülke${si('country')}</th>
      <th>Not</th>
      <th></th>
    </tr></thead>
    <tbody>
      ${ps.map(p => `
        <tr>
          <td class="checkcell" data-label="Tik">
            <input type="checkbox" class="pass-check" data-id="${esc(p.id)}"
                   ${p.checked ? 'checked' : ''} aria-label="${esc(p.name)}">
          </td>
          <td data-label="Yolcu"><b>${esc(p.name)}</b></td>
          <td class="num" data-label="Çanta">${esc(p.bags)}</td>
          <td class="num" data-label="Ağırlık">${esc(p.weight)} kg</td>
          <td data-label="Havalimanı">
            <span class="code-plate sm">${esc(p.code || '—')}</span>
            ${p.airportName ? `<span style="margin-left:6px">${esc(p.airportName)}</span>` : ''}
          </td>
          <td data-label="Ülke">${esc(p.country || '')}</td>
          <td class="note-cell" data-label="Not">${esc(p.note || '—')}</td>
          <td>
            <button class="btn btn-secondary btn-sm edit-pass" data-id="${esc(p.id)}">Düzenle</button>
            <button class="btn btn-danger btn-sm del-pass" data-id="${esc(p.id)}" style="margin-left:4px">Sil</button>
          </td>
        </tr>`).join('')}
    </tbody>
  </table></div>`;
}

function _rerenderTable(f, handlers) {
  const section = document.querySelector('#workspace .section-card:last-child');
  if (!section) return;
  const old = section.querySelector('.tablewrap, .muted');
  if (!old) return;
  const tmp = document.createElement('div');
  tmp.innerHTML = _passengerTableHtml(f);
  old.replaceWith(tmp.firstChild || tmp);
  _wireTable(f, handlers);
}

function _wireTable(f, handlers) {
  document.querySelectorAll('.pass-check').forEach(el =>
    el.addEventListener('change', () => handlers.togglePassenger(f, el.dataset.id, el.checked)));
  document.querySelectorAll('.edit-pass').forEach(b =>
    b.addEventListener('click', () => handlers.editPassenger(f, b.dataset.id)));
  document.querySelectorAll('.del-pass').forEach(b =>
    b.addEventListener('click', () => handlers.deletePassenger(f, b.dataset.id)));
  document.querySelectorAll('th.sortable').forEach(th =>
    th.addEventListener('click', () => {
      const col = th.dataset.col;
      if (_sort.col === col) _sort.dir *= -1;
      else { _sort.col = col; _sort.dir = 1; }
      _rerenderTable(f, handlers);
    }));
}
