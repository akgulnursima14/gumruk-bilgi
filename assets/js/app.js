/**
 * app.js — Uygulama giriş noktası: olay bağlama, sekmeler, açılış akışı
 */

import { loadAirports, exactAirport, esc, byIATA } from './data.js';
import {
  loadGroups, migrate, saveGroups,
  needsBackupReminder, backupReminderMsg, recordBackup
} from './store.js';
import { reverseSearch } from './search.js';
import {
  setData, getData, getActiveGroupId, getActiveFlightId,
  setActiveGroupId, setActiveFlightId,
  activeFlight, findGroupOfFlight,
  addGroup, renameGroup, deleteGroup,
  createFlight, deleteFlight, renameFlight,
  addPassenger, editPassenger, deletePassenger, togglePassenger
} from './records.js';
import {
  showToast, showConfirm, showPrompt, showEditPassModal, closeModal,
  updateAirportPreview, compactAirportHtml, reverseListHtml,
  exportFlightPDF, renderTree, renderWorkspace
} from './ui.js';
import { fetchFlight, isApiAvailable } from './flight-api.js';

/* ================================================================
   TEMA
   ================================================================ */

const html        = document.documentElement;
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');

function applyTheme(theme) {
  html.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
  const btn = document.getElementById('themeToggle');
  if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
}

applyTheme(localStorage.getItem('theme') || (prefersDark.matches ? 'dark' : 'light'));

document.getElementById('themeToggle')?.addEventListener('click', () => {
  applyTheme(html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
});

/* ================================================================
   SEKMELER
   ================================================================ */

function switchTab(id) {
  document.querySelectorAll('.tab').forEach(t => {
    const active = t.dataset.tab === id;
    t.classList.toggle('active', active);
    t.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === id));
  if (id === 'flights') renderAll();
}

document.querySelectorAll('.tab').forEach(t => {
  t.addEventListener('click', () => switchTab(t.dataset.tab));
  t.addEventListener('keydown', e => {
    const tabs = [...document.querySelectorAll('.tab')];
    const idx  = tabs.indexOf(t);
    if (e.key === 'ArrowRight') { e.preventDefault(); tabs[(idx + 1) % tabs.length].focus(); }
    if (e.key === 'ArrowLeft')  { e.preventDefault(); tabs[(idx - 1 + tabs.length) % tabs.length].focus(); }
  });
});

/* ================================================================
   UÇUŞ MODAL
   ================================================================ */

function openFlightModal(groupId) {
  const data = getData();
  if (!data.length) { showToast('Önce bir ana klasör oluşturun.', 'warn'); return; }
  const sel = document.getElementById('flightGroup');
  sel.innerHTML = data.map(g =>
    `<option value="${esc(g.id)}" ${g.id === (groupId || getActiveGroupId()) ? 'selected' : ''}>${esc(g.name)}</option>`
  ).join('');
  document.getElementById('flightNo').value    = '';
  document.getElementById('flightLabel').value = '';
  document.getElementById('flightDate').value  = new Date().toISOString().slice(0, 10);

  const modal = document.getElementById('flightModal');
  const bd    = document.getElementById('modalBackdrop');
  modal.classList.add('open');
  bd.classList.add('open');
  setTimeout(() => document.getElementById('flightNo').focus(), 50);
}

function closeFlightModal() {
  document.getElementById('flightModal').classList.remove('open');
  document.getElementById('modalBackdrop').classList.remove('open');
}

document.getElementById('cancelFlight')?.addEventListener('click', closeFlightModal);
document.getElementById('modalBackdrop')?.addEventListener('click', closeFlightModal);

document.getElementById('createFlight')?.addEventListener('click', async () => {
  const gid   = document.getElementById('flightGroup').value;
  const no    = document.getElementById('flightNo').value.trim();
  const date  = document.getElementById('flightDate').value;
  const label = document.getElementById('flightLabel').value.trim();
  if (!no) { showToast('Uçuş numarasını yazın.', 'warn'); return; }
  await createFlight(gid, no, date, label);
  closeFlightModal();
  showToast('Uçuş eklendi.', 'ok');
  renderAll();
});

/* ================================================================
   ÇALIŞMA ALANI HANDLER'LARI
   ================================================================ */

const wsHandlers = {
  addPassenger: async () => {
    const f      = activeFlight(); if (!f) return;
    const name   = document.getElementById('pName')?.value.trim()   || '';
    const bags   = document.getElementById('pBags')?.value.trim()   || '';
    const weight = document.getElementById('pWeight')?.value.trim() || '';
    const code   = document.getElementById('pAirport')?.value.trim()|| '';
    const note   = document.getElementById('pNote')?.value.trim()   || '';
    const errEl  = document.getElementById('addPassError');

    const show = msg => {
      if (errEl) { errEl.textContent = msg; errEl.hidden = false; errEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
      showToast(msg, 'warn');
    };
    if (errEl) errEl.hidden = true;

    if (!name) { show('Yolcu adını yazın.'); return; }
    if (bags === '' || !Number.isFinite(+bags) || +bags < 0) { show('Çanta sayısını kontrol edin (0 veya daha büyük sayı).'); return; }
    if (weight === '' || !Number.isFinite(+weight) || +weight < 0) { show('Ağırlığı kontrol edin (0 veya daha büyük sayı).'); return; }
    if (code && byIATA.size === 0) { show('Havalimanı verisi henüz yüklenmedi. Kodu boş bırakın veya birkaç saniye bekleyin.'); return; }

    try {
      await addPassenger(f, { name, bags, weight, code, note });
      ['pName','pBags','pWeight','pAirport','pNote'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
      });
      updateAirportPreview('');
      showToast('Yolcu eklendi.', 'ok');
      renderAll();
    } catch (err) { show(err.message); }
  },

  pdfFlight: () => {
    const f = activeFlight();
    const g = findGroupOfFlight(getActiveFlightId());
    if (f && g) exportFlightPDF(f, g);
  },

  renameFlight: async () => {
    const f = activeFlight(); if (!f) return;
    const n = await showPrompt('Uçuş numarasını değiştir', 'Yeni uçuş numarası:', f.flightNo);
    if (!n) return;
    await renameFlight(getActiveFlightId(), n);
    showToast('Uçuş numarası güncellendi.', 'ok');
    renderAll();
  },

  deleteFlight: async () => {
    const f = activeFlight(); if (!f) return;
    const ok = await showConfirm(`${f.flightNo} uçuşu ve yolcuları silinsin mi?`, 'Sil');
    if (!ok) return;
    const fid = getActiveFlightId();
    setActiveFlightId(null);
    await deleteFlight(fid);
    showToast('Uçuş silindi.', 'ok');
    renderAll();
  },

  togglePassenger: async (f, pid, checked) => {
    await togglePassenger(f, pid, checked);
    // Formu silmemek için sadece istatistikleri güncelle
    const ps  = f.passengers || [];
    const chk = ps.filter(p => p.checked).length;
    const totalBags = ps.reduce((s, p) => s + (+p.bags   || 0), 0);
    const totalWt   = ps.reduce((s, p) => s + (+p.weight || 0), 0).toFixed(1);
    const statsEl   = document.querySelector('#workspace .stats');
    if (statsEl) {
      statsEl.innerHTML = `
        <span class="stat">Yolcu: <b>${ps.length}</b></span>
        <span class="stat">Tikli: <b>${chk}</b></span>
        <span class="stat">Kalan: <b>${ps.length - chk}</b></span>
        <span class="stat">Toplam çanta: <b>${totalBags}</b></span>
        <span class="stat">Toplam ağırlık: <b>${totalWt} kg</b></span>
      `;
    }
    renderTree(getData(), getActiveGroupId(), getActiveFlightId(), treeHandlers);
  },

  editPassenger: (f, pid) => {
    const p = (f.passengers || []).find(x => x.id === pid); if (!p) return;
    showEditPassModal(p, async updates => {
      await editPassenger(f, pid, updates);
      showToast('Yolcu güncellendi.', 'ok');
      renderAll();
    });
  },

  deletePassenger: async (f, pid) => {
    const p = (f.passengers || []).find(x => x.id === pid); if (!p) return;
    const ok = await showConfirm(`"${p.name}" silinsin mi?`, 'Sil');
    if (!ok) return;
    await deletePassenger(f, pid);
    showToast('Yolcu silindi.', 'ok');
    renderAll();
  }
};

/* ================================================================
   AĞAÇ HANDLER'LARI
   ================================================================ */

const treeHandlers = {
  selectGroup: id => { setActiveGroupId(id); setActiveFlightId(null); renderAll(); },
  selectFlight: (gid, fid) => { setActiveGroupId(gid); setActiveFlightId(fid); renderAll(); },
  addFlight: gid => openFlightModal(gid),

  renameGroup: async gid => {
    const g = getData().find(x => x.id === gid); if (!g) return;
    const n = await showPrompt('Klasörü yeniden adlandır', 'Yeni ad:', g.name);
    if (!n) return;
    await renameGroup(gid, n);
    showToast('Klasör adı güncellendi.', 'ok');
    renderAll();
  },

  deleteGroup: async gid => {
    const g = getData().find(x => x.id === gid); if (!g) return;
    const ok = await showConfirm(`"${g.name}" ve altındaki tüm uçuşlar silinsin mi?`, 'Sil');
    if (!ok) return;
    await deleteGroup(gid);
    showToast('Klasör silindi.', 'ok');
    renderAll();
  }
};

function renderAll() {
  renderTree(getData(), getActiveGroupId(), getActiveFlightId(), treeHandlers);
  renderWorkspace(activeFlight(), findGroupOfFlight(getActiveFlightId()), wsHandlers);
}

/* ================================================================
   UÇUŞ KAYDEDICI ARAÇ ÇUBUĞU
   ================================================================ */

document.getElementById('newGroup')?.addEventListener('click', async () => {
  const n = await showPrompt('Yeni ana klasör', 'Klasör adı (örn. THY, PEGASUS):', '');
  if (!n) return;
  await addGroup(n);
  showToast('Klasör oluşturuldu.', 'ok');
  renderAll();
});

document.getElementById('newFlight')?.addEventListener('click',
  () => openFlightModal(getActiveGroupId()));

/* Yedekle */
document.getElementById('backupData')?.addEventListener('click', () => {
  const blob = new Blob(
    [JSON.stringify({ version: 4, exportedAt: new Date().toISOString(), groups: getData() }, null, 2)],
    { type: 'application/json' }
  );
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href = url;
  a.download = `gumruklu-ucus-yedek-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  recordBackup();
  checkBackupReminder();
  showToast('Yedek indirildi.', 'ok');
});

/* Yedeği geri yükle */
document.getElementById('restoreData')?.addEventListener('click',
  () => document.getElementById('restoreInput')?.click());

document.getElementById('restoreInput')?.addEventListener('change', async e => {
  const file = e.target.files?.[0]; if (!file) return;
  const text = await file.text().catch(() => null);
  e.target.value = '';
  if (!text) { showToast('Dosya okunamadı.', 'err'); return; }
  try {
    const x        = JSON.parse(text);
    const incoming = Array.isArray(x) ? x : x.groups;
    if (!Array.isArray(incoming)) throw new Error('Geçersiz format.');
    const totF = incoming.reduce((s, g) => s + (g.flights?.length || 0), 0);
    const totP = incoming.reduce((s, g) =>
      s + (g.flights || []).reduce((ss, f) => ss + (f.passengers?.length || 0), 0), 0);
    const ok = await showConfirm(
      `${incoming.length} klasör, ${totF} uçuş, ${totP} yolcu yüklenecek. Mevcut kayıtların üzerine yazılsın mı?`,
      'Yükle'
    );
    if (!ok) return;
    setData(incoming);
    await saveGroups(incoming);
    showToast('Yedek geri yüklendi.', 'ok');
    renderAll();
  } catch (err) {
    showToast(`Yedek okunamadı: ${err.message}`, 'err');
  }
});

/* ================================================================
   YEDEK HATIRLATMA
   ================================================================ */

function checkBackupReminder() {
  const banner = document.getElementById('backup-reminder');
  if (!banner) return;
  if (needsBackupReminder()) {
    const msg = banner.querySelector('.backup-msg');
    if (msg) msg.textContent = backupReminderMsg();
    banner.hidden = false;
  } else {
    banner.hidden = true;
  }
}

document.querySelector('.backup-now-btn')?.addEventListener('click',
  () => document.getElementById('backupData')?.click());
document.querySelector('.backup-dismiss-btn')?.addEventListener('click', () => {
  const banner = document.getElementById('backup-reminder');
  if (banner) banner.hidden = true;
});

/* ================================================================
   HAVALİMANI ARAMA SEKMESİ
   ================================================================ */

const qEl     = document.getElementById('q');
const resultEl= document.getElementById('result');

function renderSearch() {
  if (!qEl || !resultEl) return;
  const raw = qEl.value.trim();
  if (!raw) { resultEl.innerHTML = ''; return; }
  const exact = exactAirport(raw.toUpperCase());
  if (exact) { resultEl.innerHTML = compactAirportHtml(exact); return; }
  const matches = reverseSearch(raw);
  if (!matches.length) {
    resultEl.innerHTML = `<div class="muted small" style="margin-top:8px">"${esc(raw)}" için eşleşme bulunamadı.</div>`;
    return;
  }
  if (matches.length === 1) { resultEl.innerHTML = compactAirportHtml(matches[0]); return; }
  resultEl.innerHTML = reverseListHtml(matches);
  resultEl.querySelectorAll('.reverse-item').forEach(el => {
    const select = () => { qEl.value = el.dataset.code; renderSearch(); qEl.focus(); };
    el.addEventListener('click', select);
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(); } });
  });
}

document.getElementById('find')?.addEventListener('click', renderSearch);
qEl?.addEventListener('keydown', e => { if (e.key === 'Enter') renderSearch(); });
qEl?.addEventListener('input', () => {
  if ((qEl.value.trim()).length >= 2) renderSearch(); else resultEl.innerHTML = '';
});
document.querySelectorAll('#single .chip').forEach(el =>
  el.addEventListener('click', () => { qEl.value = el.dataset.code; renderSearch(); qEl.focus(); }));

/* ================================================================
   UÇUŞ BİLGİSİ SEKMESİ
   ================================================================ */

const sfNo   = document.getElementById('standaloneFlightNo');
const sfDate = document.getElementById('standaloneFlightDate');
if (sfDate && !sfDate.value) sfDate.value = new Date().toISOString().slice(0, 10);

function sfObj() {
  return {
    flightNo: (sfNo?.value || '').trim().toUpperCase(),
    date:     sfDate?.value || ''
  };
}
const gfQuery  = f => [f.flightNo, f.date, 'flight status'].filter(Boolean).join(' ');
const gfUrl    = f => 'https://www.google.com/search?q=' + encodeURIComponent(gfQuery(f));
const gfFlUrl  = f => 'https://www.google.com/travel/flights?hl=tr&q=' + encodeURIComponent(gfQuery(f));

function updateStandalonePreview() {
  const f   = sfObj();
  const box = document.getElementById('standaloneFlightPreview');
  if (!box) return;
  if (!f.flightNo) { box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = `<b>Arama:</b> ${esc(gfQuery(f))}`;
}

async function queryFlight() {
  const f = sfObj();
  if (!f.flightNo) { showToast('Uçuş numarasını yazın.', 'warn'); return; }

  const resEl = document.getElementById('flightApiResult');
  if (!resEl) return;

  if (isApiAvailable()) {
    resEl.hidden  = false;
    resEl.innerHTML = '<div class="muted small">Uçuş bilgisi aranıyor…</div>';
    try {
      const flight = await fetchFlight(f.flightNo, f.date);
      const dep = flight.departure || {};
      const arr = flight.arrival   || {};
      resEl.innerHTML = `
        <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap;margin-bottom:12px">
          <div class="code-plate">${esc(dep.iata || dep.icao || '?')}</div>
          <div style="font-size:1.5rem;color:var(--muted)">→</div>
          <div class="code-plate">${esc(arr.iata || arr.icao || '?')}</div>
        </div>
        <div><b>Kalkış:</b> ${esc(dep.name || '—')} (${esc(dep.country || '')})</div>
        <div><b>Varış:</b>  ${esc(arr.name || '—')} (${esc(arr.country || '')})</div>
        ${flight.status ? `<div style="margin-top:6px"><b>Durum:</b> ${esc(flight.status)}</div>` : ''}
        <button class="btn btn-secondary btn-sm" id="applyDep" style="margin-top:12px">
          Bu kalkışı yolcu formuna uygula
        </button>
      `;
      document.getElementById('applyDep')?.addEventListener('click', () => {
        switchTab('flights');
        const inp = document.getElementById('pAirport');
        if (inp) {
          inp.value = (dep.iata || dep.icao || '').toUpperCase();
          inp.dispatchEvent(new Event('input', { bubbles: true }));
        }
        showToast('Kalkış kodu yolcu formuna aktarıldı.', 'ok');
      });
    } catch (err) {
      resEl.innerHTML = `<div class="muted small">${esc(err.message)}</div>
        <div class="muted small" style="margin-top:4px">Google üzerinden devam edebilirsiniz.</div>`;
    }
  } else {
    // GitHub Pages — doğrudan Google'a yönlendir
    updateStandalonePreview();
    window.open(gfUrl(f), '_blank', 'noopener');
  }
}

sfNo?.addEventListener('input', e => {
  e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  updateStandalonePreview();
});
sfNo?.addEventListener('keydown',  e => { if (e.key === 'Enter') queryFlight(); });
sfDate?.addEventListener('change', updateStandalonePreview);

document.getElementById('standaloneFlightSearch')?.addEventListener('click', queryFlight);
document.getElementById('standaloneGoogleSearch')?.addEventListener('click', () => {
  const f = sfObj();
  if (!f.flightNo) { showToast('Uçuş numarasını yazın.', 'warn'); return; }
  window.open(gfUrl(f), '_blank', 'noopener');
});
document.getElementById('standaloneGoogleFlights')?.addEventListener('click', () => {
  const f = sfObj();
  if (!f.flightNo) { showToast('Uçuş numarasını yazın.', 'warn'); return; }
  window.open(gfFlUrl(f), '_blank', 'noopener');
});

/* ================================================================
   AÇILIŞ
   ================================================================ */

async function init() {
  const loadingEl = document.getElementById('data-loading');
  const searchUI  = document.getElementById('search-ui');
  const errorEl   = document.getElementById('data-error');

  // 1. Havalimanı verisi
  try {
    await loadAirports();
    if (loadingEl) loadingEl.hidden = true;
    if (searchUI)  searchUI.hidden  = false;
  } catch (err) {
    if (loadingEl) loadingEl.hidden = true;
    if (errorEl)   { errorEl.textContent = `Havalimanı verisi yüklenemedi: ${err.message}`; errorEl.hidden = false; }
  }

  // 2. Kayıt verisi (IndexedDB + göç)
  try {
    await migrate();
    const groups = await loadGroups();
    setData(groups);
  } catch (err) {
    console.error('Kayıt verisi yüklenemedi:', err);
    setData([]);
  }

  // 3. Yedek hatırlatma
  checkBackupReminder();

  // 4. Başlangıç sekme render
  if (document.querySelector('.tab.active')?.dataset.tab === 'flights') renderAll();

  qEl?.focus();
}

init();
