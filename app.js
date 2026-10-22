/* =========================================================
   NIGHTPULSE — prototipo funcional, 100% cliente
   Datos y "visión IA" simulados en local. Sin red, sin keys.
   ========================================================= */
(() => {
"use strict";

/* ---------------- utils ---------------- */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const eur = (n) => n.toFixed(2).replace(".", ",") + " €";
const pad = (n) => String(n).padStart(2, "0");

const b64 = (s) => {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  bytes.forEach(b => bin += String.fromCharCode(b));
  return btoa(bin).replace(/=+$/, "");
};
const unb64 = (s) => new TextDecoder().decode(
  Uint8Array.from(atob(s + "===".slice((s.length + 3) % 4)), c => c.charCodeAt(0))
);
const fnv = (str) => {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16).padStart(8, "0");
};

const makeCode = (event, serial, iso) => {
  const raw = `${event}|${serial}|${iso}`;
  return `NP1.${b64(raw)}.${fnv(raw)}`;
};
const verifyCode = (code, expected) => {
  try {
    const [v, body, sig] = String(code).split(".");
    if (v !== "NP1" || !body || !sig) return { ok: false, reason: "Formato de QR no reconocido" };
    const raw = unb64(body);
    if (fnv(raw) !== sig) return { ok: false, reason: "Firma digital inválida · posible captura manipulada" };
    const [event, serial, iso] = raw.split("|");
    if (expected && event !== expected.event) return { ok: false, reason: "El evento del QR no coincide" };
    if (expected && iso !== expected.iso) return { ok: false, reason: "La fecha del QR no coincide con la entrada" };
    return { ok: true, data: { event, serial, iso } };
  } catch { return { ok: false, reason: "QR ilegible" }; }
};

/* ---------------- estado ---------------- */
const STORE = "nightpulse.state.v2";
const nowBase = Date.now();
const nightStart = 3 * 60 + 12;

const CLUBS = [
  { id: "circus",  name: "Circus",  short: "CI", x: 149, y: 322, cap: 500, inside: 468, entries: 610, exits: 142, rssi: -55, baseOcc: 94,
    address: "Rúa de Alfredo Brañas, 6", zone: "Ensanche", music: "House · comercial", queue: 72, wait: 12, trend: [62, 68, 74, 80, 85, 89, 92, 94] },
  { id: "blaster", name: "Blaster", short: "BL", x: 214, y: 353, cap: 700, inside: 609, entries: 789, exits: 180, rssi: -62, baseOcc: 87,
    address: "R. da República Arxentina, 6", zone: "Ensanche", music: "Hits · comercial", queue: 96, wait: 16, trend: [70, 74, 78, 82, 85, 87, 88, 87] },
  { id: "way",     name: "Way Club", short: "WA", x: 270, y: 169, cap: 350, inside: 301, entries: 420, exits: 119, rssi: -58, baseOcc: 86,
    address: "Rúa Nova, 13", zone: "Centro", music: "Tech house", queue: 48, wait: 8, trend: [58, 64, 70, 75, 79, 83, 85, 86] },
  { id: "rem",     name: "REM",     short: "RE", x: 49,  y: 330, cap: 450, inside: 396, entries: 512, exits: 116, rssi: -66, baseOcc: 88,
    address: "Rúa Nova de Abaixo, 26", zone: "Ensanche", music: "Electrónica", queue: 60, wait: 10, trend: [60, 66, 72, 78, 82, 85, 87, 88] },
  { id: "tarasca", name: "Tarasca", short: "TA", x: 336, y: 53,  cap: 200, inside: 136, entries: 200, exits: 64, rssi: -70, baseOcc: 68,
    address: "Rúa de Entremuros, 13", zone: "Zona Vella", music: "Pop · rock", queue: 18, wait: 3, trend: [40, 46, 52, 58, 62, 65, 67, 68] },
  { id: "momo",    name: "Momo",    short: "MO", x: 339, y: 145, cap: 160, inside: 82, entries: 140, exits: 58, rssi: -64, baseOcc: 51,
    address: "Rúa da Virxe da Cerca, 23", zone: "Zona Vella", music: "Indie · clásicos", queue: 10, wait: 2, trend: [30, 34, 38, 42, 45, 48, 50, 51] }
];

const LISTINGS = [
  { id: "l1", event: "Nochevieja Universitaria", venue: "Circus", date: "31 DIC · 23:00", iso: "2026-12-31", type: "General", price: 25, original: 28, seller: "Marta R.", rating: 4.9, serial: "CIR-4471", hue: "#7c3aed", fraud: false },
  { id: "l2", event: "Tech House Night", venue: "Way Club", date: "HOY · 23:30", iso: "2026-10-22", type: "VIP", price: 38, original: 35, seller: "Diego P.", rating: 4.7, serial: "WAY-1180", hue: "#0ea5e9", fraud: false },
  { id: "l3", event: "Urban Session", venue: "Blaster", date: "HOY · 01:00", iso: "2026-10-22", type: "General", price: 18, original: 22, seller: "Lucía G.", rating: 5.0, serial: "BLA-9932", hue: "#f43f5e", fraud: true },
  { id: "l4", event: "Afterhours · REM", venue: "REM", date: "HOY · 03:00", iso: "2026-10-22", type: "Mesa", price: 60, original: 75, seller: "Andrés M.", rating: 4.6, serial: "REM-2201", hue: "#22d3ee", fraud: false }
];

const RIDES = [
  { id: "r1", dest: "Centro", club: "Circus", depart: "03:25", seats: 4, taken: 2, price: 9,  members: ["MR", "DP"] },
  { id: "r2", dest: "Fontiñas", club: "Circus", depart: "03:40", seats: 3, taken: 1, price: 16, members: ["LG"] },
  { id: "r3", dest: "San Lázaro", club: "Circus", depart: "03:15", seats: 4, taken: 3, price: 18, members: ["AM", "JC", "SR"] }
];

const DEFAULT = {
  view: "noche",
  ticketTab: "buy",
  destination: "Centro",
  selectedClub: "circus",
  clubs: CLUBS,
  listings: LISTINGS.map(l => ({ ...l })),
  purchases: [],
  rides: RIDES.map(r => ({ ...r })),
  joinedRide: null,
  scans: [],
  vault: { revealAt: 0, revealed: false, demo: false, photos: [] },
  stats: { reports: 12, escrow: 63, squads: 3 }
};

function next8am() {
  const d = new Date(), t = new Date(d);
  t.setHours(8, 0, 0, 0);
  if (t.getTime() <= d.getTime()) t.setDate(t.getDate() + 1);
  return t.getTime();
}

// 08:00 según el reloj nocturno de la demo (03:12), no la hora real
function next8amNight() {
  const mins = nightStart + Math.floor((Date.now() - nowBase) / 60000);
  let diff = 8 * 60 - (mins % 1440);
  if (diff <= 0) diff += 1440;
  return Date.now() + diff * 60000;
}

function loadState() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(STORE) || "null"); } catch {}
  const s = { ...structuredClone(DEFAULT), ...(saved || {}) };
  s.clubs = (saved && saved.clubs) ? saved.clubs : structuredClone(CLUBS);
  s.clubs.forEach(c => {
    if (typeof c.inside !== "number") c.inside = Math.round(c.cap * (c.occ ?? 50) / 100);
    if (typeof c.entries !== "number") c.entries = c.inside + 120;
    if (typeof c.exits !== "number") c.exits = 120;
    if (typeof c.rssi !== "number") c.rssi = -58;
    if (typeof c.baseOcc !== "number") {
      const def = CLUBS.find(x => x.id === c.id);
      c.baseOcc = def ? def.baseOcc : 70;
    }
    c.occ = Math.round((c.inside / c.cap) * 100);
  });
  s.listings = (saved && saved.listings) ? saved.listings : structuredClone(LISTINGS);
  s.rides = (saved && saved.rides) ? saved.rides : structuredClone(RIDES);
  s.vault = { ...structuredClone(DEFAULT.vault), ...(saved && saved.vault ? saved.vault : {}) };
  if (!s.vault.photos || !s.vault.photos.length) {
    s.vault.photos = Array.from({ length: 12 }, (_, i) => ({ id: "p" + i, kind: "gen", seed: 1000 + i * 37 }));
  }
  if (!s.vault.revealAt) s.vault.revealAt = next8amNight();
  s.listings.forEach(l => { if (!l.code) l.code = makeCode(l.event, l.serial, l.fraud ? "2026-01-01" : l.iso); });
  s.scans = Array.isArray(s.scans) ? s.scans : [];
  if (!["noche", "aforo", "tickets", "taxi", "vault"].includes(s.view)) s.view = "noche";
  return s;
}

let state = loadState();
let sensorPingAt = Date.now();

function save() {
  try { localStorage.setItem(STORE, JSON.stringify(state)); }
  catch { /* quota */ }
}

/* ---------------- sesión + edad ---------------- */
const SESSION_KEY = "np.session";

function ageFrom(str) {
  if (!str) return -1;
  const d = new Date(str + "T00:00:00");
  if (isNaN(d.getTime())) return -1;
  const n = new Date();
  let a = n.getFullYear() - d.getFullYear();
  const m = n.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && n.getDate() < d.getDate())) a--;
  return a;
}

function readSession() {
  try {
    const s = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
    if (!s || !s.email) return null;
    if (ageFrom(s.dob) < 18) { sessionStorage.removeItem(SESSION_KEY); return null; }
    return s;
  } catch { return null; }
}

function writeSession(email, dob) {
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify({ email, dob, at: Date.now() })); } catch {}
}

function clearSession() {
  try { sessionStorage.removeItem(SESSION_KEY); } catch {}
}

function showAuth(show) {
  const a = $("#auth");
  if (!a) return;
  a.classList.toggle("hidden", !show);
  if (show) setTimeout(() => $("#authEmail").focus(), 120);
}

/* ---------------- reloj nocturno ---------------- */
function nightNow() {
  const mins = nightStart + Math.floor((Date.now() - nowBase) / 60000);
  return { h: Math.floor(mins / 60) % 24, m: mins % 60 };
}
function clockStr() { const { h, m } = nightNow(); return `${pad(h)}:${pad(m)}`; }
function nowStr() { const { h, m } = nightNow(); return `${pad(h)}:${pad(m)}`; }

/* ---------------- toast / log / kpis ---------------- */
let toastTimer;
function toast(msg, kind = "") {
  const el = $("#toast");
  el.textContent = msg;
  el.className = "toast show " + kind;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.className = "toast " + kind, 2600);
}

function log(msg) {
  state._log = state._log || [];
  state._log.unshift({ t: nowStr(), msg });
  state._log = state._log.slice(0, 6);
  renderLog();
}
function renderLog() {
  const items = state._log && state._log.length ? state._log : [
    { t: "03:04", msg: "<b>Circus</b> · el sensor detecta 53 móviles en la puerta" },
    { t: "03:07", msg: "Escrow <b>#A21</b> liberado · 25,00 € al vendedor" },
    { t: "03:09", msg: "Puerta <b>Blaster</b> · 609/700 dentro" }
  ];
  $("#logList").innerHTML = items.map(i => `<li><span class="t">${i.t}</span><span>${i.msg}</span></li>`).join("");
}

function renderKpis() {
  const escrow = state.purchases.filter(p => p.status === "funded")
    .reduce((a, p) => a + p.price, 0) + Number(state.stats.escrow || 0);
  $("#kpis").innerHTML = `
    <div class="kpi"><b>${sensorDevices(clubById(state.selectedClub))}</b><span>Móviles</span></div>
    <div class="kpi"><b>${Math.round(escrow)} €</b><span>En escrow</span></div>
    <div class="kpi"><b>${state.rides.filter(r => r.taken < r.seats).length}</b><span>Squads</span></div>`;
}

/* ---------------- navegación ---------------- */
const MODULES = [
  { id: "noche",   n: "01", name: "Noche",              sub: "Aforo y cola en vivo" },
  { id: "aforo",   n: "02", name: "Aforo y tensión",    sub: "Contador de puerta" },
  { id: "tickets", n: "03", name: "Entrada",            sub: "Escrow + QR firmado" },
  { id: "taxi",    n: "04", name: "Taxi share",         sub: "Vuelta segura" },
  { id: "vault",   n: "05", name: "Álbum",              sub: "Party Vault hasta las 08:00" }
];
const TITLES = { noche: "Noche", aforo: "Aforo", tickets: "Entrada", taxi: "Taxi share", vault: "Álbum" };

const ICONS = {
  noche: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 10.5L12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9.5 21v-6h5v6"/></svg>',
  aforo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 3c3.5 4.2 6 7.1 6 10a6 6 0 11-12 0c0-2.9 2.5-5.8 6-10z"/><path d="M12 17c-1.7 0-3-1.3-3-3"/></svg>',
  tickets: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 8a2 2 0 002-2h12a2 2 0 002 2v2a2 2 0 000 4v2a2 2 0 00-2 2H6a2 2 0 00-2-2v-2a2 2 0 000-4z"/><path d="M14 7v10"/></svg>',
  taxi: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 16v-3.2L6 8h12l2 4.8V16"/><path d="M3 16h18"/><circle cx="7" cy="17.5" r="1.6"/><circle cx="17" cy="17.5" r="1.6"/><path d="M8 8l1-3h6l1 3"/></svg>',
  vault: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="6" width="18" height="14" rx="3"/><circle cx="12" cy="13" r="3.2"/><path d="M8 6l1-2h6l1 2"/></svg>'
};

function setView(id) {
  state.view = id; save();
  $$(".view").forEach(v => v.classList.toggle("active", v.id === "view-" + id));
  $$("#tabbar .tab").forEach(b => b.classList.toggle("active", b.dataset.view === id));
  $$("#moduleNav button").forEach(b => b.classList.toggle("active", b.dataset.view === id));
  $("#appTitle").textContent = TITLES[id];
  $("#view-" + id).scrollTop = 0;
  if (id === "noche") renderHome();
  if (id === "aforo") { renderClubs(); renderDoor(); }
  if (id === "tickets") renderTickets();
  if (id === "taxi") renderTaxi();
  if (id === "vault") renderVault();
}

/* ---------------- imágenes generadas ---------------- */
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

const photoCache = new Map();
function makePhoto(seed) {
  if (photoCache.has(seed)) return photoCache.get(seed);
  const S = 420;
  const c = document.createElement("canvas");
  c.width = S; c.height = S;
  const g = c.getContext("2d");
  const R = rng(seed * 31 + 7);
  const palettes = [
    ["#2b0b3f", "#7c3aed", "#ff3d81"],
    ["#04121f", "#0ea5e9", "#22d3ee"],
    ["#1a0a10", "#f43f5e", "#ffb020"],
    ["#0a1208", "#65a30d", "#c8ff2e"],
    ["#12081f", "#a855f7", "#22d3ee"]
  ];
  const p = palettes[seed % palettes.length];
  const bg = g.createLinearGradient(0, 0, S, S);
  bg.addColorStop(0, p[0]); bg.addColorStop(1, "#07050d");
  g.fillStyle = bg; g.fillRect(0, 0, S, S);

  for (let i = 0; i < 3; i++) {
    const x = R() * S, y = R() * S, r = 60 + R() * 170;
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, p[1] + "cc");
    rg.addColorStop(1, "transparent");
    g.fillStyle = rg; g.fillRect(0, 0, S, S);
  }
  // siluetas
  for (let i = 0; i < 5; i++) {
    const x = 40 + R() * (S - 80), y = 190 + R() * 190, sc = .7 + R() * .7;
    g.fillStyle = "rgba(4,3,8,.72)";
    g.beginPath(); g.arc(x, y - 46 * sc, 16 * sc, 0, 7); g.fill();
    g.beginPath(); g.roundRect(x - 20 * sc, y - 28 * sc, 40 * sc, 90 * sc, 16 * sc); g.fill();
  }
  // flash
  const fl = g.createRadialGradient(S * .5, S * .35, 0, S * .5, S * .35, S * .8);
  fl.addColorStop(0, "rgba(255,255,255,.28)");
  fl.addColorStop(.4, "rgba(255,255,255,.04)");
  fl.addColorStop(1, "transparent");
  g.fillStyle = fl; g.fillRect(0, 0, S, S);

  g.font = "600 15px ui-monospace, monospace";
  g.fillStyle = "rgba(255,255,255,.55)";
  g.fillText(`${pad(3 + (seed % 3))}:${pad((seed * 7) % 60)}  ·  SANTIAGO`, 18, S - 20);

  const url = c.toDataURL("image/jpeg", .74);
  photoCache.set(seed, url);
  return url;
}

/* ---------------- saturación ---------------- */
function satFromOcc(occ) {
  return occ >= 90 ? "critica" : occ >= 72 ? "alta" : occ >= 45 ? "media" : "baja";
}
const satColor = { baja: "#22d3ee", media: "#c8ff2e", alta: "#ffb020", critica: "#ff3d81" };
const satLabel = { baja: "Baja", media: "Media", alta: "Alta", critica: "Crítica" };
const clubById = (id) => state.clubs.find(c => c.id === id) || state.clubs[0];
function clubByVenue(venue) {
  if (!venue) return clubById(state.selectedClub);
  const v = venue.toLowerCase();
  return state.clubs.find(c => v.includes(c.name.toLowerCase()) || c.name.toLowerCase().includes(v))
    || clubById(state.selectedClub);
}

/* ---------------- sensor pasivo + contador de puerta ---------------- */
function sensorDevices(c) {
  return Math.max(1, Math.round(c.queue / 1.35));
}

function renderSensor() {
  const c = clubById(state.selectedClub);
  if (!$("#sensorDevices")) return;
  $("#sensorDevices").textContent = sensorDevices(c);
  $("#sensorRssi").textContent = c.rssi;
  $("#sensorAge").textContent = Math.max(0, Math.floor((Date.now() - sensorPingAt) / 1000));
  if ($("#homeWait")) {
    $("#homeWait").innerHTML = `${c.wait} <small>min</small>`;
    $("#homeQueue").textContent = c.queue;
  }
}

function renderHome() {
  const c = clubById(state.selectedClub);
  const sel = $("#homeClub");
  if (!sel) return;
  if (!sel.options.length) {
    sel.innerHTML = state.clubs.map(x => `<option value="${x.id}">${x.name}</option>`).join("");
  }
  sel.value = c.id;

  const sat = satFromOcc(c.occ);
  const col = satColor[sat];
  const circ = 2 * Math.PI * 35;

  $("#homeName").textContent = c.name;
  $("#homeMeta").textContent = `${c.address || "Santiago de Compostela"} · ${c.zone || "Centro"}`;
  $("#homeInside").textContent = c.inside;
  $("#homeCap").textContent = c.cap;
  $("#homePct").innerHTML = `${c.occ}<span>%</span>`;
  $("#homeSat").className = "badge " + sat;
  $("#homeSat").textContent = satLabel[sat];
  $("#homeState").textContent = {
    baja: "Tranquilo", media: "Ambiente", alta: "Casi lleno", critica: "Saturación máxima"
  }[sat];
  $("#homeFill").style.width = Math.min(100, c.occ) + "%";
  $("#homeFill").style.background = col;
  $("#homeFree").textContent = Math.max(0, c.cap - c.inside);
  const ring = $("#homeRing");
  ring.setAttribute("stroke", col);
  ring.setAttribute("stroke-dasharray", `${(c.occ / 100) * circ} ${circ}`);

  $("#homeGroup").innerHTML = ["MR", "DP", "LG", "+"].map(x => `<div class="avatar">${x}</div>`).join("");
  renderSensor();
  renderKpis();
}

function openVenuePanel(clubId) {
  const c = clubById(clubId || state.selectedClub);
  const col = satColor[satFromOcc(c.occ)];
  const scans = (state.scans || []).slice(0, 5);

  openSheet(`
    <div class="sheet-head">
      <div><h3>Panel del local</h3><p>${c.name} · puerta principal</p></div>
      <button class="x-btn" data-close>✕</button>
    </div>
    <div class="panel-big"><b>${c.inside}</b><span>/ ${c.cap} · ${c.occ}%</span></div>
    <div class="door-bar" style="margin-bottom:12px"><i style="width:${Math.min(100, c.occ)}%;background:${col}"></i></div>
    <div class="stat-row" style="grid-template-columns:repeat(4,1fr)">
      <div class="stat"><span>En cola</span><b>${c.queue}</b></div>
      <div class="stat"><span>Espera</span><b>${c.wait}m</b></div>
      <div class="stat"><span>Entradas</span><b>${c.entries}</b></div>
      <div class="stat"><span>Salidas</span><b>${c.exits}</b></div>
    </div>
    <div class="section-title" style="margin:14px 0 6px"><h3>Últimos accesos</h3><span>${scans.length ? scans.length + " hoy" : "sin datos"}</span></div>
    <div class="scan-list">
      ${scans.length
        ? scans.map(s => `<div class="scan-item"><span>${s.time}</span><b>${s.event}</b><small>${s.type}</small></div>`).join("")
        : `<p class="scan-empty">Todavía no hay entradas validadas.</p>`}
    </div>
    <div class="note-box" style="margin-top:12px">
      <span style="color:#22d3ee">◉</span>
      <span>El aforo lo mueve el contador de puerta. El sensor Wi-Fi solo mide la cola de la calle.</span>
    </div>
  `);
}

function renderDoor() {
  const c = clubById(state.selectedClub);
  if (!$("#doorInside")) return;
  const sel = $("#doorClub");
  if (sel && sel.value !== c.id) sel.value = c.id;
  const pct = Math.round((c.inside / c.cap) * 100);
  const col = satColor[satFromOcc(pct)];
  $("#doorInside").textContent = c.inside;
  $("#doorCap").textContent = c.cap;
  $("#doorPct").textContent = pct + "%";
  $("#doorPct").style.color = col;
  $("#doorIn").textContent = c.entries;
  $("#doorOut").textContent = c.exits;
  $("#doorFill").style.width = Math.min(100, pct) + "%";
  $("#doorFill").style.background = col;
  const free = $("#doorFree");
  if (free) free.textContent = Math.max(0, c.cap - c.inside);
}

function doorMove(clubId, delta, announce) {
  const c = clubById(clubId);
  const before = c.inside;
  c.inside = clamp(c.inside + delta, 0, c.cap);
  const real = c.inside - before;
  if (real > 0) c.entries += real;
  if (real < 0) c.exits += -real;
  c.occ = Math.round((c.inside / c.cap) * 100);
  c.trend = [...c.trend.slice(-7), c.occ];
  save();
  updateMapPins();
  renderClubs();
  renderDoor();
  renderSensor();

  const numEl = $("#doorInside");
  if (numEl && clubId === state.selectedClub) {
    numEl.classList.remove("pop");
    void numEl.offsetWidth;
    numEl.classList.add("pop");
  }

  if (announce) {
    if (real === 0) {
      toast(delta > 0 ? "Aforo completo en " + c.name : "No queda nadie dentro", "bad");
    } else {
      toast(`${real > 0 ? "+" : ""}${real} ${real > 0 ? "dentro" : "fuera"} · ${c.name} ${c.occ}%`, real > 0 ? "good" : "");
      log(`Puerta <b>${c.name}</b> · ${real > 0 ? "+" : ""}${real} · ${c.inside}/${c.cap} dentro`);
    }
  }
  return real;
}

/* ---------------- mapa ---------------- */
function buildMap() {
  const svg = $("#map");
  const defs = state.clubs.map(c => `
    <radialGradient id="halo-${c.id}">
      <stop offset="0%" stop-color="${satColor[satFromOcc(c.occ)]}" stop-opacity=".85"/>
      <stop offset="70%" stop-color="${satColor[satFromOcc(c.occ)]}" stop-opacity=".18"/>
      <stop offset="100%" stop-color="${satColor[satFromOcc(c.occ)]}" stop-opacity="0"/>
    </radialGradient>`).join("");

  let grid = "";
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 4; col++) {
      grid += `<rect x="${col * 97 + 7}" y="${row * 82 + 7}" width="${83}" height="${68}" rx="7"
        fill="#100c1e" stroke="rgba(255,255,255,.035)"/>`;
    }
  }

  const pins = state.clubs.map(c => {
    const col = satColor[satFromOcc(c.occ)];
    return `<g class="pin" data-club="${c.id}" transform="translate(${c.x},${c.y})">
      <circle class="halo" r="${26 + c.occ * .34}" fill="url(#halo-${c.id})"/>
      <circle r="11" fill="${col}" opacity=".16"/>
      <circle class="core" r="5" fill="${col}" stroke="#0b0816" stroke-width="1.6"/>
      <text y="19" text-anchor="middle">${c.name}</text>
    </g>`;
  }).join("");

  svg.innerHTML = `
    <defs>${defs}</defs>
    <rect width="390" height="410" fill="#0b0816"/>
    ${grid}
    <path d="M-20 300 Q 110 250 190 300 T 420 270" stroke="#0a1a26" stroke-width="26" fill="none" opacity=".9"/>
    <path d="M-20 300 Q 110 250 190 300 T 420 270" stroke="rgba(34,211,238,.08)" stroke-width="2" fill="none"/>
    <g opacity=".9">
      <circle cx="186" cy="196" r="5" fill="#22d3ee" opacity=".25">
        <animate attributeName="r" values="4;12;4" dur="3s" repeatCount="indefinite"/>
        <animate attributeName="opacity" values=".35;0;.35" dur="3s" repeatCount="indefinite"/>
      </circle>
      <circle cx="186" cy="196" r="3.4" fill="#22d3ee" stroke="#05040a" stroke-width="1.2"/>
      <text x="192" y="194" fill="rgba(34,211,238,.85)" font-size="7" font-weight="600">TÚ</text>
    </g>
    <text x="384" y="402" text-anchor="end" font-size="7" letter-spacing="1.2"
      fill="rgba(255,255,255,.32)">SANTIAGO · CENTRO</text>
    ${pins}`;

  svg.addEventListener("click", (e) => {
    const g = e.target.closest(".pin");
    if (g) openClub(g.dataset.club);
  });
}

function updateMapPins() {
  state.clubs.forEach(c => {
    const g = document.querySelector(`.pin[data-club="${c.id}"]`);
    if (!g) return;
    const col = satColor[satFromOcc(c.occ)];
    g.querySelector(".core").setAttribute("fill", col);
    g.querySelector(".halo").setAttribute("r", 26 + c.occ * .34);
  });
}

/* ---------------- aforo ---------------- */
function renderClubs() {
  const list = $("#clubList");
  if (!list) return;
  const sorted = [...state.clubs].sort((a, b) => b.occ - a.occ);
  list.innerHTML = sorted.map(c => {
    const col = satColor[satFromOcc(c.occ)];
    return `<button class="club-row" data-club="${c.id}">
      <div class="club-avatar">${c.short}</div>
      <div class="club-main">
        <b>${c.name}</b>
        <small>${c.inside}/${c.cap} dentro · ${c.queue} en cola</small>
      </div>
      <div class="club-meter">
        <div class="track"><div class="fill" style="width:${c.occ}%;background:${col}"></div></div>
        <small>${c.occ}%</small>
      </div>
      <span class="badge ${satFromOcc(c.occ)}">${satLabel[satFromOcc(c.occ)]}</span>
    </button>`;
  }).join("");

  const criticos = state.clubs.filter(c => inferSat(c) === "critica").length;
  const avg = Math.round(state.clubs.reduce((a, c) => a + c.occ, 0) / state.clubs.length);
  $("#aforoSummary").textContent = `${criticos} críticos · media ${avg}%`;
}
function inferSat(c) { return satFromOcc(c.occ); }

function sparkline(trend, color) {
  const w = 300, h = 38, pad = 4;
  const lo = Math.min(...trend) - 4;
  const hi = Math.max(...trend) + 4;
  const span = Math.max(1, hi - lo);
  const pts = trend.map((v, i) =>
    `${((i / (trend.length - 1)) * w).toFixed(1)},${(h - ((v - lo) / span) * (h - pad * 2) - pad).toFixed(1)}`
  ).join(" ");
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
    <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    <polygon points="0,${h} ${pts} ${w},${h}" fill="${color}" opacity=".1"/>
  </svg>`;
}

function openClub(id) {
  const c = clubById(id);
  const col = satColor[satFromOcc(c.occ)];
  const circ = 2 * Math.PI * 40;
  const dash = (c.occ / 100) * circ;
  const sat = satFromOcc(c.occ);
  const desc = {
    baja: "Entra sin esperar. Hay sitio de sobra.",
    media: "Ambiente lleno pero se entra rápido.",
    alta: "Cola real. Calcula 15–25 minutos.",
    critica: "Saturación máxima. Valora otro local."
  }[sat];

  openSheet(`
    <div class="sheet-head">
      <div><h3>${c.name}</h3><p>Aforo ${c.cap} personas · actualizado ahora</p></div>
      <button class="x-btn" data-close>✕</button>
    </div>
    <div class="gauge-wrap">
      <div class="gauge">
        <svg width="96" height="96">
          <circle cx="48" cy="48" r="40" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="7"/>
          <circle cx="48" cy="48" r="40" fill="none" stroke="${col}" stroke-width="7"
            stroke-linecap="round" stroke-dasharray="${dash} ${circ}"/>
        </svg>
        <div class="val"><div><b>${c.occ}%</b><span>aforo</span></div></div>
      </div>
      <div class="gauge-info">
        <h4><span class="badge ${sat}">${satLabel[sat]}</span></h4>
        <p>${desc}</p>
      </div>
    </div>
    ${sparkline(c.trend, col)}
    <div class="stat-row">
      <div class="stat"><span>En cola</span><b>${c.queue}</b></div>
      <div class="stat"><span>Espera</span><b>${c.wait} min</b></div>
      <div class="stat"><span>Móviles</span><b>${sensorDevices(c)}</b></div>
    </div>
    <div class="sheet-door">
      <div><span>Dentro</span><b>${c.inside}</b></div>
      <div><span>Entradas</span><b>${c.entries}</b></div>
      <div><span>Salidas</span><b>${c.exits}</b></div>
    </div>
    <p class="sheet-door-note">El aforo sube solo al validar un QR en la puerta. No hay botón de +1.</p>
    <button class="btn primary" data-venue-panel="${c.id}">Abrir panel del local</button>
  `);
}

function initHome() {
  const sel = $("#homeClub");
  sel.innerHTML = state.clubs.map(c => `<option value="${c.id}">${c.name}</option>`).join("");
  sel.value = state.selectedClub;
  sel.addEventListener("change", () => {
    state.selectedClub = sel.value;
    save();
    $("#doorClub").value = sel.value;
    renderHome();
    renderDoor();
    renderSensor();
    toast("Local: " + clubById(sel.value).name);
  });

  $("#homeGoAforo").addEventListener("click", () => setView("aforo"));
  $("#btnVenuePanel").addEventListener("click", () => openVenuePanel(state.selectedClub));
}

/* ---------------- tickets ---------------- */
function makePurchase(listing) {
  return {
    id: "p" + Date.now().toString(36),
    listingId: listing.id,
    event: listing.event,
    venue: listing.venue,
    date: listing.date,
    iso: listing.iso,
    type: listing.type,
    price: listing.price,
    code: listing.code,
    status: "funded",
    created: Date.now()
  };
}

function setTicketTab(tab) {
  state.ticketTab = tab; save();
  $$("#ticketSeg button").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
  renderTickets();
}

function renderTickets() {
  const body = $("#ticketsBody");
  if (!body) return;
  $$("#ticketSeg button").forEach(b => b.classList.toggle("active", b.dataset.tab === state.ticketTab));

  if (state.ticketTab === "buy") {
    body.innerHTML = `
      <div class="note-box">
        <span>🛡️</span>
        <span>El pago queda <b>retenido en escrow</b>. Si el QR no valida en la puerta, se te devuelve solo.</span>
      </div>
      <div style="height:10px"></div>
      ${state.listings.map(l => `
        <article class="listing">
          <div class="listing-top">
            <div class="listing-art" style="background:linear-gradient(150deg,${l.hue},#0d0a18)">
              ${l.type}<br>${l.date.split(" · ")[0]}
            </div>
            <div class="listing-info">
              <h4>${l.event}</h4>
              <div class="meta">${l.venue} · ${l.date}</div>
              <div class="tag-row">
                <span class="tag ${l.type.toLowerCase() === "vip" ? "vip" : ""}">${l.type}</span>
                <span class="tag verified">QR verificado</span>
                ${l.price < l.original ? '<span class="tag deal">bajo coste</span>' : ""}
              </div>
              <div class="meta" style="margin-top:5px">${l.seller} · ★ ${l.rating}</div>
            </div>
          </div>
          <div class="listing-buy">
            <div class="price">
              <b>${eur(l.price)}</b>
              ${l.price < l.original ? `<s>${eur(l.original)}</s>` : ""}
              <small>protegido por escrow</small>
            </div>
            <button class="buy-btn" data-buy="${l.id}" ${state.purchases.some(p => p.listingId === l.id) ? "disabled style=\"opacity:.4\"" : ""}>${state.purchases.some(p => p.listingId === l.id) ? "En tu cartera" : "Comprar"}</button>
          </div>
        </article>`).join("")}
      <p style="font-size:9.5px;color:var(--tx-3);text-align:center;margin-top:6px;line-height:1.5">
        El vendedor no cobra hasta que tu QR se valida en la puerta.
      </p>`;
    return;
  }

  if (state.ticketTab === "sell") {
    body.innerHTML = `
      <div class="form">
        <label class="field"><span>Evento</span>
          <input id="sellEvent" value="Afterhours · Rooftop" />
        </label>
        <div class="form-row">
          <label class="field"><span>Local</span>
            <select id="sellVenue">
              <option>Circus</option><option>Blaster</option><option>Way Club</option><option>REM</option><option>Tarasca</option><option>Momo</option>
            </select>
          </label>
          <label class="field"><span>Tipo</span>
            <select id="sellType"><option>General</option><option>VIP</option><option>Mesa</option></select>
          </label>
        </div>
        <div class="form-row">
          <label class="field"><span>Precio (€)</span>
            <input id="sellPrice" type="number" min="5" max="300" value="30" />
          </label>
          <label class="field"><span>Precio original</span>
            <input value="35 €" disabled />
          </label>
        </div>
        <button class="btn primary" id="btnPublish">Publicar con verificación IA</button>
      </div>
      <div style="height:12px"></div>
      <div class="note-box"><span>🔍</span><span>La IA comprueba el QR, la fecha y el recinto antes de publicar. Si algo no cuadra, no sale al mercado.</span></div>
      <div style="height:12px"></div>
      <p style="font-size:10px;color:var(--tx-2);line-height:1.55">
        Comisión de plataforma: <b>10%</b>, la paga el comprador. Tú recibes el 100% de tu precio cuando el comprador entra.
      </p>`;
    $("#btnPublish").addEventListener("click", publishListing);
    return;
  }

  // mis entradas
  if (!state.purchases.length) {
    body.innerHTML = `
      <div style="text-align:center;padding:34px 10px;color:var(--tx-3)">
        <div style="font-size:30px;margin-bottom:8px">🎟️</div>
        <p style="font-size:12px;color:var(--tx-2)">Todavía no tienes entradas.</p>
        <p style="font-size:10px;margin-top:4px">Compra una en el marketplace o valida un QR.</p>
      </div>
      <button class="btn ghost" id="btnScanAny">Validar una entrada</button>`;
    $("#btnScanAny").addEventListener("click", () => {
      if (!state.purchases.length) {
        toast("Compra una entrada primero", "bad");
        setTicketTab("buy");
        return;
      }
    });
    return;
  }

  body.innerHTML = state.purchases.map(p => {
    const steps = [
      p.status !== "refunded",
      true,
      p.status === "redeemed" || p.status === "refunded",
      p.status === "redeemed"
    ];
    const label = p.status === "redeemed" ? "Validada · fondos liberados"
      : p.status === "refunded" ? "Rechazada · reembolsada"
      : "Fondos retenidos hasta la puerta";
    const stLabel = p.status === "redeemed" ? "validada" : p.status === "refunded" ? "reembolsada" : "en escrow";
    return `<div class="escrow-ticket" style="margin-bottom:10px">
      <div class="e-ticket-head">
        <div><h4>${p.event}</h4><small>${p.venue} · ${p.date}</small></div>
        <span class="status-pill ${p.status}">${stLabel}</span>
      </div>
      <div class="e-code">${p.code}</div>
      <div class="e-status">
        <small style="font-size:9px;color:var(--tx-2)">${label}</small>
        <b style="font-size:13px">${eur(p.price)}</b>
      </div>
      <div class="steps">
        ${steps.map(s => `<div class="step-dot ${s ? "on" : ""}"></div>`).join("")}
      </div>
      ${p.status === "funded"
        ? `<button class="btn primary small" style="width:100%;margin-top:11px" data-scan="${p.id}">Validar en la puerta</button>`
        : ""}
    </div>`;
  }).join("") + `<button class="btn ghost small" id="btnScanAny2" style="width:100%;margin-top:2px">Validar otra entrada</button>`;

  const any = $("#btnScanAny2");
  if (any) any.addEventListener("click", () => {
    const p = state.purchases.find(x => x.status === "funded");
    if (!p) return toast("No hay entradas pendientes de validar", "bad");
    openScanner(p.id);
  });
}

function openBuySheet(id) {
  const l = state.listings.find(x => x.id === id);
  if (!l) return;
  const fee = Math.round(l.price * 0.1 * 100) / 100;
  const total = Math.round((l.price + fee) * 100) / 100;

  openSheet(`
    <div class="sheet-head">
      <div><h3>${l.event}</h3><p>${l.venue} · ${l.date}</p></div>
      <button class="x-btn" data-close>✕</button>
    </div>
    <div class="pay-summary">
      <div class="pay-row"><span>Entrada ${l.type}</span><b>${eur(l.price)}</b></div>
      <div class="pay-row"><span>Protección escrow (10%)</span><b>${eur(fee)}</b></div>
      <div class="pay-row"><span>Vendedor recibe</span><b>${eur(l.price)}</b></div>
      <div class="pay-row total"><span>Total a autorizar</span><b>${eur(total)}</b></div>
    </div>
    <div class="escrow-track">
      <div class="esc-step active" id="esc0"><div class="bullet">1</div><div class="txt"><b>Autorizas el pago</b><small>No se cobra todavía</small></div></div>
      <div class="esc-step" id="esc1"><div class="bullet">2</div><div class="txt"><b>Fondos retenidos</b><small>Escrow de NIGHTPULSE</small></div></div>
      <div class="esc-step" id="esc2"><div class="bullet">3</div><div class="txt"><b>Validación en puerta</b><small>QR firmado + puerta</small></div></div>
      <div class="esc-step" id="esc3"><div class="bullet">4</div><div class="txt"><b>Pago liberado</b><small>Solo si entras</small></div></div>
    </div>
    <div id="buyAction">
      <button class="btn primary" id="btnPay">Pagar y retener en escrow</button>
      <p style="font-size:9px;color:var(--tx-3);text-align:center;margin-top:8px">Demo: no se realiza ningún cargo real.</p>
    </div>
  `);

  $("#btnPay").addEventListener("click", async () => {
    $("#buyAction").innerHTML = `<div class="btn ghost" style="justify-content:center">Autorizando pago…</div>`;
    await sleep(1100);
    const p = makePurchase(l);
    state.purchases.unshift(p);
    save();
    $("#esc0").classList.remove("active");
    ["esc0", "esc1"].forEach(id => $("#" + id).classList.add("done"));
    $("#esc2").classList.add("active");
    $("#buyAction").innerHTML = `
      <div class="scan-verdict ok" style="margin-bottom:11px">
        <span class="icon">🛡️</span>
        <div><b>${eur(total)} retenidos en escrow</b><small>El vendedor cobrará cuando entres.</small></div>
      </div>
      <button class="btn primary" id="btnSeeTicket">Ver mi entrada</button>`;
    $("#btnSeeTicket").addEventListener("click", () => {
      closeSheet();
      setTicketTab("mine");
      setView("tickets");
    });
    renderKpis();
    log(`Compra protegida · <b>${l.event}</b> · ${eur(l.price)} en escrow`);
    toast("Pago retenido en escrow", "good");
  });
}

async function publishListing() {
  const btn = $("#btnPublish");
  const event = $("#sellEvent").value.trim() || "Evento sin nombre";
  const venue = $("#sellVenue").value;
  const type = $("#sellType").value;
  const price = clamp(Number($("#sellPrice").value) || 25, 5, 300);

  btn.disabled = true;
  btn.textContent = "Verificando QR con IA…";
  await sleep(1400);

  const iso = "2026-10-22";
  const serial = "USR-" + Math.floor(1000 + Math.random() * 8999);
  const l = {
    id: "l" + Date.now().toString(36),
    event, venue, date: "HOY · 04:00", iso, type,
    price, original: Math.round(price * 1.15),
    seller: "Tú", rating: 5.0, serial, hue: "#a855f7",
    fraud: false, code: makeCode(event, serial, iso)
  };
  state.listings.unshift(l);
  save();
  toast("Entrada publicada · QR verificado", "good");
  log(`<b>${event}</b> publicado con QR válido · ${eur(price)}`);
  setTicketTab("buy");
}

/* ---------------- escáner ---------------- */
function openScanner(purchaseId) {
  const p = state.purchases.find(x => x.id === purchaseId);
  if (!p) return;
  const el = $("#scanner");
  el.className = "scanner open";
  el.innerHTML = `
    <div class="scanner-head">
      <b>Validar entrada</b>
      <button class="x-btn" data-scan-close>✕</button>
    </div>
    <div class="scan-frame scan-corners">
      <span></span>
      <div class="scan-line"></div>
      <svg class="scan-qr" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" stroke-width="1.4">
        <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
        <rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM21 14v3M14 21h4"/>
      </svg>
    </div>
    <div class="scanner-foot">
      <b>Buscando QR…</b>
      <small>Acércalo al lector · verificación firmada</small>
    </div>`;

  setTimeout(async () => {
    const v = verifyCode(p.code, { event: p.event, iso: p.iso });
    const club = clubByVenue(p.venue);
    const resultado = {
      firma_ok: v.ok,
      evento: p.event,
      tipo_entrada: p.type,
      riesgo_fraude: v.ok ? "bajo" : "alto",
      score_riesgo: v.ok ? 12 : 94,
      decision: v.ok ? "aceptar" : "rechazar",
      motivo: v.reason || "QR y evento coinciden"
    };

    if (v.ok) {
      p.status = "redeemed";
      p.clubId = club.id;
      doorMove(club.id, 1, false);        // el aforo sube solo al validar el QR
      state.scans.unshift({ event: p.event, type: p.type, time: nowStr(), club: club.id });
      state.scans = state.scans.slice(0, 8);
      resultado.aforo_actualizado = `${club.inside}/${club.cap}`;
      resultado.aforo_pct = club.occ;
      burst();
      log(`Entrada validada · <b>${p.event}</b> · aforo ${club.name} ${club.inside}/${club.cap}`);
      toast(`Entrada válida · aforo ${club.name} ${club.occ}%`, "good");
    } else {
      p.status = "refunded";
      log(`Entrada rechazada · <b>${p.event}</b> · reembolso automático`);
      toast("Entrada rechazada · reembolso emitido", "bad");
    }
    save();
    renderKpis();
    renderTickets();

    el.innerHTML = `
      <div class="scanner-head">
        <b>Resultado</b>
        <button class="x-btn" data-scan-close>✕</button>
      </div>
      <div class="scan-result" style="flex:1;display:flex;flex-direction:column;justify-content:center">
        <div class="scan-verdict ${v.ok ? "ok" : "bad"}">
          <span class="icon">${v.ok ? "✅" : "⛔"}</span>
          <div>
            <b>${v.ok ? "Entrada válida" : "Entrada rechazada"}</b>
            <small>${v.ok ? `QR verificado · aforo ${club.inside}/${club.cap}` : v.reason}</small>
          </div>
        </div>
        <div class="stat-row">
          <div class="stat"><span>Riesgo</span><b>${resultado.score_riesgo}/100</b></div>
          <div class="stat"><span>Firma</span><b>${v.ok ? "OK" : "FALLO"}</b></div>
          <div class="stat"><span>Aforo</span><b>${v.ok ? club.occ + "%" : "—"}</b></div>
        </div>
        <pre style="margin:0;padding:10px;border-radius:9px;background:#070511;border:1px solid rgba(255,255,255,.08);font-family:var(--mono);font-size:9px;line-height:1.55;color:#9fdfc8;white-space:pre-wrap">${JSON.stringify(resultado, null, 2)}</pre>
        <div style="height:12px"></div>
        ${v.ok ? `<button class="btn ghost small" style="width:100%;margin-bottom:8px" data-scan-aforo="${club.id}">Ver aforo en vivo</button>` : ""}
        <button class="btn ${v.ok ? "primary" : "ghost"}" data-scan-close>${v.ok ? "Entrar al local" : "Cerrar y ver reembolso"}</button>
      </div>`;
  }, 1700);

  el.onclick = (e) => {
    const a = e.target.closest("[data-scan-aforo]");
    if (a) {
      state.selectedClub = a.dataset.scanAforo;
      save();
      $("#homeClub").value = state.selectedClub;
      $("#doorClub").value = state.selectedClub;
      el.className = "scanner";
      el.innerHTML = "";
      setView("aforo");
      renderDoor();
      return;
    }
    if (e.target.closest("[data-scan-close]")) {
      el.className = "scanner";
      el.innerHTML = "";
    }
  };
}

/* ---------------- taxi ---------------- */
const DESTS = [
  { name: "Centro", eta: 8, price: 9 },
  { name: "Ensanche", eta: 10, price: 11 },
  { name: "Vista Alegre", eta: 14, price: 14 },
  { name: "Fontiñas", eta: 16, price: 16 },
  { name: "San Lázaro", eta: 18, price: 18 }
];

function renderTaxi() {
  const club = clubById(state.selectedClub);
  $("#taxiClub").textContent = club.name;
  $("#taxiHour").textContent = clockStr();

  $("#destChips").innerHTML = DESTS.map(d =>
    `<button class="chip ${state.destination === d.name ? "active" : ""}" data-dest="${d.name}">
      ${d.name} <span class="n">${d.eta} min</span>
    </button>`).join("");

  const joined = state.rides.find(r => r.id === state.joinedRide);
  $("#squadBox").innerHTML = joined ? `
    <div class="squad">
      <div class="squad-head">
        <b>Squad confirmado · ${joined.dest}</b>
        <span class="badge media">${joined.taken}/${joined.seats}</span>
      </div>
      <div class="avatars">
        ${joined.members.map(m => `<div class="avatar">${m}</div>`).join("")}
        ${Array.from({ length: Math.max(0, joined.seats - joined.members.length) }).map(() => `<div class="avatar empty">+</div>`).join("")}
      </div>
      <div class="ride-meta"><span>Salida <b>${joined.depart}</b></span><span>VTC <b>${joined.price} €</b></span><span>~<b>${Math.round(joined.price / Math.max(1, joined.taken))} €</b>/persona</span></div>
      <button class="btn ghost small" style="width:100%" id="btnWhatsapp">Compartir en WhatsApp</button>
    </div>` : "";

  $("#rideList").innerHTML = state.rides.map(r => {
    const full = r.taken >= r.seats;
    return `<div class="ride">
      <div class="ride-info">
        <b>${r.dest} · ${r.depart}</b>
        <small>${r.club} · ${full ? "completo" : (r.seats - r.taken) + " plazas libres"} · ${Math.round(r.price / r.seats)} €/pers</small>
        <div class="seats">${Array.from({ length: r.seats }).map((_, i) => `<i class="${i < r.taken ? "on" : ""}"></i>`).join("")}</div>
      </div>
      <button class="join-btn" data-join="${r.id}" ${full || (joined && joined.id === r.id) ? "disabled" : ""}>
        ${joined && joined.id === r.id ? "dentro" : full ? "lleno" : "unirme"}
      </button>
    </div>`;
  }).join("");

  const wa = $("#btnWhatsapp");
  if (wa) wa.addEventListener("click", () => {
    const txt = `Voy en VTC desde ${club.name} a ${joined.dest} a las ${joined.depart}. Quedan ${joined.seats - joined.taken} plazas. Únete en NIGHTPULSE.`;
    window.open("https://wa.me/?text=" + encodeURIComponent(txt), "_blank");
    log("Squad compartido por WhatsApp");
  });
}

function joinRide(id) {
  const r = state.rides.find(x => x.id === id);
  if (!r || r.taken >= r.seats) return;
  r.taken++;
  if (!r.members.includes("TÚ")) r.members.unshift("TÚ");
  state.joinedRide = r.id;
  save();
  renderTaxi();
  renderKpis();
  toast("Te has unido al squad a " + r.dest, "good");
  log(`Nuevo squad a <b>${r.dest}</b> · ${r.taken}/${r.seats} plazas`);
}

function createRide() {
  const d = DESTS.find(x => x.name === state.destination) || DESTS[0];
  const nm = nightStart + Math.floor((Date.now() - nowBase) / 60000) + 15;
  const dep = `${pad(Math.floor(nm / 60) % 24)}:${pad(nm % 60)}`;
  const r = {
    id: "r" + Date.now().toString(36),
    dest: d.name, club: clubById(state.selectedClub).name, depart: dep,
    seats: 4, taken: 1, price: d.price, members: ["TÚ"]
  };
  state.rides.unshift(r);
  state.joinedRide = r.id;
  save();
  renderTaxi();
  renderKpis();
  toast("Squad creado · comparte el enlace", "good");
  log(`Squad creado a <b>${d.name}</b> · salida ${dep}`);
}

/* ---------------- vault ---------------- */
function vaultMs() { return state.vault.revealAt - Date.now(); }

function revealVault(silent) {
  if (state.vault.revealed) return;
  state.vault.revealed = true;
  save();
  renderVault();
  if (!silent) {
    burst();
    toast("Álbum revelado · ya podéis verlo todo", "good");
    log("Party Vault revelado · <b>" + state.vault.photos.length + " fotos</b> desbloqueadas");
  }
}

function renderVault() {
  const v = state.vault;
  const grid = $("#vaultGrid");
  if (!grid) return;

  const left = Math.max(0, vaultMs());
  if (left <= 0 && !v.revealed) revealVault(true);

  $("#vaultChip").textContent = v.revealed ? "🔓 Revelado" : "🔒 Bloqueado";
  $("#vaultChip").classList.toggle("open", v.revealed);
  $("#vaultTitle").textContent = clubById(state.selectedClub).name + " · Carrete desechable";
  $("#vaultSub").textContent = v.revealed
    ? "Álbum revelado · " + (v.demo ? "modo demo" : "08:00")
    : (v.demo ? "Modo demo · se revela en segundos" : "Se revela a las 08:00");

  $("#vaultMembers").innerHTML = ["MR", "DP", "LG", "AM", "+4"].map(x => `<div class="avatar">${x}</div>`).join("");
  $("#vaultCount").textContent = `${v.photos.length} fotos`;

  grid.innerHTML = v.photos.map((p, i) => {
    const src = p.kind === "upload" ? p.dataUrl : makePhoto(p.seed);
    return `<div class="vault-photo ${v.revealed ? "revealed" : ""}" style="transition-delay:${v.revealed ? i * 55 : 0}ms">
      <img src="${src}" alt="Foto del álbum" loading="lazy">
      <div class="lock">${v.revealed ? "" : "🔒"}</div>
    </div>`;
  }).join("");

  $("#vaultNote").textContent = v.revealed
    ? "Revelado. El carrete ya es historia del grupo."
    : "Nadie puede verlas todavía. Ni tú.";

  const btn = $("#btnVaultUpload");
  btn.disabled = v.revealed;
  btn.style.opacity = v.revealed ? .45 : 1;

  tickCountdown();
}

function tickCountdown() {
  const v = state.vault;
  const box = $("#vaultCountdown");
  if (!box) return;

  if (v.revealed) {
    box.classList.add("revealed");
    $("#cdH").textContent = "00"; $("#cdM").textContent = "00"; $("#cdS").textContent = "00";
    return;
  }
  const ms = Math.max(0, vaultMs());
  if (ms <= 0) { revealVault(true); return; }

  const s = Math.floor(ms / 1000);
  $("#cdH").textContent = pad(Math.floor(s / 3600));
  $("#cdM").textContent = pad(Math.floor((s % 3600) / 60));
  $("#cdS").textContent = pad(s % 60);
  box.classList.toggle("urgent", ms < 120000);
}

async function addVaultFiles(files) {
  if (state.vault.revealed) return toast("El álbum ya se reveló", "bad");
  let added = 0;
  for (const f of Array.from(files).slice(0, 6)) {
    if (!f.type.startsWith("image/")) continue;
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.src = url;
    await img.decode().catch(() => {});
    const S = 420;
    const c = document.createElement("canvas");
    c.width = S; c.height = S;
    const g = c.getContext("2d");
    const scale = Math.max(S / img.width, S / img.height);
    const w = img.width * scale, h = img.height * scale;
    g.drawImage(img, (S - w) / 2, (S - h) / 2, w, h);
    state.vault.photos.unshift({
      id: "u" + Date.now().toString(36) + added,
      kind: "upload",
      dataUrl: c.toDataURL("image/jpeg", .72)
    });
    added++;
  }
  if (!added) return;
  save();
  renderVault();
  toast(`${added} foto${added > 1 ? "s" : ""} bloqueada${added > 1 ? "s" : ""} hasta el revelado`, "good");
  log(`${added} foto${added > 1 ? "s" : ""} nueva${added > 1 ? "s" : ""} en el <b>Party Vault</b>`);
}

/* ---------------- sheet ---------------- */
function openSheet(html) {
  const s = $("#sheet");
  s.innerHTML = `<div class="sheet-card"><div class="grabber"></div>${html}</div>`;
  requestAnimationFrame(() => s.classList.add("open"));
}
function closeSheet() {
  const s = $("#sheet");
  s.classList.remove("open");
  setTimeout(() => { if (!s.classList.contains("open")) s.innerHTML = ""; }, 300);
}

/* ---------------- confetti ---------------- */
function burst() {
  const host = $("#burst");
  const colors = ["#a855f7", "#22d3ee", "#c8ff2e", "#ff3d81", "#ffb020", "#ffffff"];
  for (let i = 0; i < 26; i++) {
    const s = document.createElement("span");
    s.className = "confetti";
    s.style.left = "50%";
    s.style.top = "45%";
    s.style.background = colors[i % colors.length];
    s.style.setProperty("--dx", (Math.random() * 2 - 1) * 160 + "px");
    s.style.setProperty("--dy", (Math.random() * -.9 - .1) * 260 + "px");
    s.style.setProperty("--rot", Math.random() * 720 - 360 + "deg");
    s.style.animationDelay = Math.random() * .15 + "s";
    host.appendChild(s);
    setTimeout(() => s.remove(), 1700);
  }
}

/* ---------------- init ---------------- */
function initNav() {
  $("#moduleNav").innerHTML = MODULES.map(m => `
    <button data-view="${m.id}">
      <span class="num">${m.n}</span>
      <span class="mtxt"><b>${m.name}</b><small>${m.sub}</small></span>
    </button>`).join("");

  $("#tabbar").innerHTML = MODULES.map(m => `
    <button class="tab" data-view="${m.id}">
      ${ICONS[m.id]}<span>${m.name.split(" ")[0]}</span>
    </button>`).join("");

  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-view]");
    if (b) setView(b.dataset.view);
  });

  $("#btnRevealNow").addEventListener("click", () => { revealVault(false); setView("vault"); });
  $("#btnResetTimer").addEventListener("click", () => {
    state.vault.revealAt = Date.now() + 60000;
    state.vault.revealed = false;
    state.vault.demo = true;
    save();
    renderVault();
    setView("vault");
    toast("Revelado en 60 s · modo demo", "good");
    log("Temporizador del vault reiniciado a <b>60 s</b>");
  });
  $("#btnReset").addEventListener("click", () => {
    localStorage.removeItem(STORE);
    location.reload();
  });
}

function initTickets() {
  $("#ticketSeg").addEventListener("click", (e) => {
    const b = e.target.closest("[data-tab]");
    if (b) setTicketTab(b.dataset.tab);
  });
  $("#ticketsBody").addEventListener("click", (e) => {
    const b = e.target.closest("[data-buy]");
    if (b) return openBuySheet(b.dataset.buy);
    const s = e.target.closest("[data-scan]");
    if (s) return openScanner(s.dataset.scan);
  });
}

function initTaxi() {
  $("#destChips").addEventListener("click", (e) => {
    const b = e.target.closest("[data-dest]");
    if (!b) return;
    state.destination = b.dataset.dest;
    save();
    renderTaxi();
  });
  $("#rideList").addEventListener("click", (e) => {
    const b = e.target.closest("[data-join]");
    if (b && !b.disabled) joinRide(b.dataset.join);
  });
  $("#btnCreateRide").addEventListener("click", createRide);
  $("#btnSober").addEventListener("click", () => {
    toast("Aviso enviado a tu contacto de confianza", "good");
    log("Sober Squad activado · contacto avisado");
  });
  $("#btnCopyCode").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText("NOCHE-247");
      toast("Código NOCHE-247 copiado", "good");
    } catch {
      toast("Código del grupo: NOCHE-247");
    }
  });
}

function initVault() {
  $("#btnVaultUpload").addEventListener("click", () => {
    if (state.vault.revealed) return toast("El álbum ya se reveló", "bad");
    $("#vaultInput").click();
  });
  $("#vaultInput").addEventListener("change", (e) => {
    addVaultFiles(e.target.files);
    e.target.value = "";
  });
  $("#vaultCard").addEventListener("click", (e) => {
    if (e.target.closest("#vaultCountdown") && !state.vault.revealed) {
      state.vault.revealAt = Date.now() + 60000;
      state.vault.demo = true;
      save();
      renderVault();
      toast("Revelado en 60 s · modo demo", "good");
    }
  });
}

function initMisc() {
  $("#clubList").addEventListener("click", (e) => {
    const row = e.target.closest("[data-club]");
    if (!row) return;
    state.selectedClub = row.dataset.club;
    save();
    $("#homeClub").value = state.selectedClub;
    $("#doorClub").value = state.selectedClub;
    renderDoor();
    renderSensor();
    openClub(row.dataset.club);
  });

  const dsel = $("#doorClub");
  dsel.innerHTML = state.clubs.map(c => `<option value="${c.id}">${c.name}</option>`).join("");
  dsel.value = state.selectedClub;
  dsel.addEventListener("change", () => {
    state.selectedClub = dsel.value;
    save();
    $("#homeClub").value = dsel.value;
    renderHome();
    renderDoor();
    renderSensor();
    toast("Aforo de " + clubById(dsel.value).name);
  });

  $("#doorScan").addEventListener("click", () => {
    const p = state.purchases.find(x => x.status === "funded" && clubByVenue(x.venue).id === state.selectedClub)
      || state.purchases.find(x => x.status === "funded");
    if (!p) {
      setView("tickets");
      setTicketTab("buy");
      toast("Compra una entrada y valídala en la puerta", "bad");
      return;
    }
    openScanner(p.id);
  });

  document.addEventListener("click", (e) => {
    const vp = e.target.closest("[data-venue-panel]");
    if (vp) {
      closeSheet();
      openVenuePanel(vp.dataset.venuePanel);
      return;
    }
    if (e.target.closest("[data-close]")) closeSheet();
    if (e.target.id === "sheet") closeSheet();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeSheet();
      const sc = $("#scanner");
      if (sc.classList.contains("open")) { sc.className = "scanner"; sc.innerHTML = ""; }
    }
  });

  setInterval(() => {
    $("#clock").textContent = clockStr();
    $("#mapAge").textContent = Math.max(0, Number($("#mapAge").textContent) + 1) % 30;
    tickCountdown();
    if (state.view === "noche") {
      const el = $("#sensorAge");
      if (el) el.textContent = Math.max(0, Math.floor((Date.now() - sensorPingAt) / 1000));
    }
  }, 1000);

  // sensor pasivo: nueva lectura de la cola cada 8 s
  setInterval(() => {
    if (document.hidden) return;
    state.clubs.forEach(c => {
      c.queue = clamp(c.queue + Math.round(Math.random() * 8 - 4), 0, 180);
      c.wait = Math.max(1, Math.round(c.queue / 6));
    });
    sensorPingAt = Date.now();
    save();
    if (state.view === "noche") renderSensor();
  }, 8000);

  // contador de puerta: entradas y salidas reales cada 20 s
  setInterval(() => {
    if (document.hidden) return;
    state.clubs.forEach(c => {
      // tráfico con reversión a la ocupación típica del local
      const target = c.cap * c.baseOcc / 100;
      const pull = Math.round((target - c.inside) * 0.2);
      const net = clamp(pull + Math.round(Math.random() * 4 - 2), -5, 5);
      const before = c.inside;
      c.inside = clamp(c.inside + net, 0, c.cap);
      const real = c.inside - before;
      if (real > 0) c.entries += real;
      else if (real < 0) c.exits += -real;
      c.occ = Math.round((c.inside / c.cap) * 100);
      c.trend = [...c.trend.slice(-7), c.occ];
    });
    save();
    updateMapPins();
    if (state.view === "aforo") { renderClubs(); renderDoor(); }
    $("#mapAge").textContent = "0";
  }, 20000);
}

function initAuth() {
  const dob = $("#authDob");
  const max = new Date();
  max.setFullYear(max.getFullYear() - 18);
  dob.max = max.toISOString().slice(0, 10);
  dob.min = "1900-01-01";

  $("#authForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const err = $("#authError");
    const email = $("#authEmail").value.trim();
    const pass = $("#authPass").value;
    const dobv = dob.value;

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { err.textContent = "Introduce un email válido."; return; }
    if (pass.length < 6) { err.textContent = "La contraseña debe tener al menos 6 caracteres."; return; }
    if (!dobv) { err.textContent = "Introduce tu fecha de nacimiento."; return; }
    const age = ageFrom(dobv);
    if (age < 0) { err.textContent = "Esa fecha no es válida."; return; }
    if (age < 18) { err.textContent = "Debes ser mayor de 18 años para entrar."; return; }
    if (age > 110) { err.textContent = "Revisa la fecha de nacimiento."; return; }

    err.textContent = "";
    writeSession(email, dobv);
    $("#authPass").value = "";
    showAuth(false);
    toast("Bienvenido a NIGHTPULSE", "good");
    log("Sesión iniciada · " + email);
  });

  $("#authDemo").addEventListener("click", () => {
    $("#authEmail").value = "demo@civernautas.app";
    $("#authPass").value = "noche247";
    $("#authDob").value = "2000-01-01";
    $("#authError").textContent = "";
    $("#authForm").requestSubmit();
  });

  $("#btnLogout").addEventListener("click", logout);

  showAuth(!readSession());
}

function logout() {
  clearSession();
  showAuth(true);
  setView("noche");
  $("#authEmail").value = "";
  $("#authPass").value = "";
  $("#authDob").value = "";
  $("#authError").textContent = "";
  toast("Sesión cerrada");
  log("Sesión cerrada");
}

function init() {
  initNav();
  initAuth();
  initHome();
  buildMap();
  renderClubs();
  initTickets();
  renderTickets();
  initTaxi();
  renderTaxi();
  initVault();
  renderVault();
  initMisc();
  renderLog();
  renderKpis();
  renderSensor();
  renderDoor();
  renderHome();
  $("#clock").textContent = clockStr();
  setView(state.view || "noche");

  // bienvenida
  setTimeout(() => toast("Demo lista · todo en vivo"), 700);
}

document.addEventListener("DOMContentLoaded", init);
})();
