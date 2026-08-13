/**
 * store.js — IndexedDB katmanı + göç + snapshot + yedek hatırlatma
 */

const DB_NAME    = 'gumruklu_yolcu';
const DB_VERSION = 1;
const STORE_GRP  = 'groups';
const STORE_SNAP = 'snapshots';

const LS_KEY      = 'customs_hierarchy_v1';
const LS_OLD_KEY  = 'customs_flight_records_v2';
const LS_MIGRATED = 'customs_idb_migrated_v1';
const LS_BACKUP   = 'customs_last_backup';
const LS_CHANGES  = 'customs_changes_since_backup';

const MAX_SNAPSHOTS = 5;

let _db = null;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_GRP)) {
        db.createObjectStore(STORE_GRP, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_SNAP)) {
        const ss = db.createObjectStore(STORE_SNAP, { keyPath: 'ts' });
        ss.createIndex('ts', 'ts', { unique: true });
      }
    };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = () => reject(req.error);
  });
}

async function getDB() {
  if (!_db) _db = await openDB();
  return _db;
}

/** Tüm grupları IndexedDB'den yükle. */
export async function loadGroups() {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE_GRP, 'readonly')
                  .objectStore(STORE_GRP).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror   = () => reject(req.error);
  });
}

/** Tüm grupları IndexedDB'ye kaydet (temizle + yaz). */
export async function saveGroups(groups) {
  const db = await getDB();
  await new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE_GRP, 'readwrite');
    const store = tx.objectStore(STORE_GRP);
    store.clear();
    for (const g of groups) store.put(g);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
  // Yedek sayacını artır
  const n = Number(localStorage.getItem(LS_CHANGES) || '0');
  localStorage.setItem(LS_CHANGES, String(n + 1));
}

/** Yıkıcı işlemden önce snapshot kaydet (son 5'i tut). */
export async function saveSnapshot(groups) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE_SNAP, 'readwrite');
    const store = tx.objectStore(STORE_SNAP);
    store.add({ ts: Date.now(), data: JSON.parse(JSON.stringify(groups)) });
    // Eskilerini sil
    const allReq = store.index('ts').getAllKeys();
    allReq.onsuccess = () => {
      const keys = (allReq.result || []).sort((a, b) => a - b);
      if (keys.length > MAX_SNAPSHOTS) {
        for (let i = 0; i < keys.length - MAX_SNAPSHOTS; i++) store.delete(keys[i]);
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

/** Tüm snapshot'ları döndür (yeniden eskiye). */
export async function getSnapshots() {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE_SNAP, 'readonly')
                  .objectStore(STORE_SNAP).index('ts').getAll();
    req.onsuccess = () => resolve((req.result || []).sort((a, b) => b.ts - a.ts));
    req.onerror   = () => reject(req.error);
  });
}

/**
 * Açılışta localStorage'dan IndexedDB'ye veri göçü.
 * Sadece bir kez çalışır.
 */
export async function migrate() {
  if (localStorage.getItem(LS_MIGRATED)) return [];

  // Yeni anahtar
  try {
    const v = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
    if (Array.isArray(v) && v.length) {
      await saveGroups(v);
      localStorage.setItem(LS_MIGRATED, '1');
      return v;
    }
  } catch (_) {}

  // Eski anahtar (v2)
  try {
    const { uid } = await import('./data.js');
    const old = JSON.parse(localStorage.getItem(LS_OLD_KEY) || '[]');
    if (Array.isArray(old) && old.length) {
      const g = {
        id: uid(), name: 'Genel',
        flights: old.map(f => ({
          id: f.id || uid(),
          flightNo: (f.flightNo || f.name || 'Uçuş').trim().toUpperCase(),
          date: f.date || '',
          label: f.name || '',
          passengers: (f.passengers || []).map(p => ({
            id: p.id || uid(),
            name: p.name || '',
            bags: Number(p.bags) || 0,
            weight: Number(p.weight) || 0,
            code: p.code || '',
            airportName: p.airportName || '',
            country: p.country || '',
            note: p.note || '',
            checked: !!p.checked
          }))
        }))
      };
      const groups = [g];
      await saveGroups(groups);
      localStorage.setItem(LS_MIGRATED, '1');
      return groups;
    }
  } catch (_) {}

  localStorage.setItem(LS_MIGRATED, '1');
  return [];
}

/* ---- Yedek hatırlatma ---- */

export function recordBackup() {
  localStorage.setItem(LS_BACKUP, new Date().toISOString().slice(0, 10));
  localStorage.setItem(LS_CHANGES, '0');
}

export function needsBackupReminder() {
  const last    = localStorage.getItem(LS_BACKUP);
  const changes = Number(localStorage.getItem(LS_CHANGES) || '0');
  if (!last) return changes >= 5;
  const days = Math.floor((Date.now() - new Date(last).getTime()) / 86_400_000);
  return days >= 5 || changes >= 20;
}

export function backupReminderMsg() {
  const last    = localStorage.getItem(LS_BACKUP);
  const changes = Number(localStorage.getItem(LS_CHANGES) || '0');
  if (!last) return `${changes} değişiklik kaydedildi, henüz yedek alınmadı.`;
  const days = Math.floor((Date.now() - new Date(last).getTime()) / 86_400_000);
  return `Son yedeğiniz ${days} gün önce · ${changes} değişiklik var.`;
}
