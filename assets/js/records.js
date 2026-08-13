/**
 * records.js — Klasör/uçuş/yolcu iş mantığı ve durum yönetimi
 */

import { exactAirport, uid, fmtDate, esc } from './data.js';
import { saveGroups, saveSnapshot } from './store.js';

export { esc, fmtDate };

/* ---- Uygulama durumu ---- */
let _data          = [];
let _activeGroupId = null;
let _activeFlightId= null;

export function setData(groups) {
  _data = groups;
  _activeGroupId  = _data[0]?.id || null;
  _activeFlightId = _data[0]?.flights?.[0]?.id || null;
}

export function getData()            { return _data; }
export function getActiveGroupId()   { return _activeGroupId; }
export function getActiveFlightId()  { return _activeFlightId; }
export function setActiveGroupId(id) { _activeGroupId  = id; }
export function setActiveFlightId(id){ _activeFlightId = id; }

export function activeGroup() {
  return _data.find(g => g.id === _activeGroupId) || null;
}

export function activeFlight() {
  for (const g of _data) {
    const f = (g.flights || []).find(x => x.id === _activeFlightId);
    if (f) return f;
  }
  return null;
}

export function findGroupOfFlight(fid) {
  return _data.find(g => (g.flights || []).some(f => f.id === fid)) || null;
}

/* ---- Yardımcı kaydet ---- */
async function save()         { await saveGroups(_data); }
async function saveWithSnap() { await saveGroups(_data); await saveSnapshot(_data); }

/* ---- Klasör işlemleri ---- */

export async function addGroup(name) {
  const g = { id: uid(), name: name.trim(), flights: [] };
  _data.push(g);
  _activeGroupId  = g.id;
  _activeFlightId = null;
  await save();
  return g;
}

export async function renameGroup(id, name) {
  const g = _data.find(x => x.id === id);
  if (!g) return;
  g.name = name.trim();
  await save();
}

export async function deleteGroup(id) {
  _data = _data.filter(x => x.id !== id);
  _activeGroupId  = _data[0]?.id || null;
  _activeFlightId = _data[0]?.flights?.[0]?.id || null;
  await saveWithSnap();
}

/* ---- Uçuş işlemleri ---- */

export async function createFlight(groupId, no, date, label) {
  const g = _data.find(x => x.id === groupId);
  if (!g) return null;
  const f = {
    id: uid(),
    flightNo: (no || '').trim().toUpperCase(),
    date: date || '',
    label: (label || '').trim(),
    passengers: []
  };
  g.flights.push(f);
  _activeGroupId  = g.id;
  _activeFlightId = f.id;
  await save();
  return f;
}

export async function deleteFlight(fid) {
  const g = findGroupOfFlight(fid);
  if (!g) return;
  g.flights = g.flights.filter(x => x.id !== fid);
  _activeFlightId = g.flights[0]?.id || null;
  await saveWithSnap();
}

export async function renameFlight(fid, no) {
  const f = _data.flatMap(g => g.flights || []).find(x => x.id === fid);
  if (!f) return;
  f.flightNo = no.trim().toUpperCase();
  await save();
}

/* ---- Yolcu işlemleri ---- */

export async function addPassenger(flight, { name, bags, weight, code, note }) {
  const a = exactAirport(code);
  if (!a) throw new Error('Geçerli bir havalimanı kodu girin (IATA, ICAO veya ident).');
  flight.passengers.push({
    id: uid(),
    name: name.trim(),
    bags: Number(bags),
    weight: Number(weight),
    code: (a.i || a.o || a.d || code).toUpperCase(),
    airportName: a.n,
    country: a.ct || a.cc || '',
    note: (note || '').trim(),
    checked: false
  });
  await save();
}

export async function editPassenger(flight, pid, { name, bags, weight, code, note }) {
  const p = flight.passengers.find(x => x.id === pid);
  if (!p) return;
  const a = exactAirport(code);
  if (!a) throw new Error('Geçerli bir havalimanı kodu girin.');
  p.name        = name.trim() || p.name;
  p.bags        = Number(bags);
  p.weight      = Number(weight);
  p.code        = (a.i || a.o || a.d || code).toUpperCase();
  p.airportName = a.n;
  p.country     = a.ct || a.cc || '';
  p.note        = (note || '').trim();
  await save();
}

export async function deletePassenger(flight, pid) {
  flight.passengers = flight.passengers.filter(x => x.id !== pid);
  await save();
}

export async function togglePassenger(flight, pid, checked) {
  const p = flight.passengers.find(x => x.id === pid);
  if (!p) return;
  p.checked = checked;
  await save();
}
