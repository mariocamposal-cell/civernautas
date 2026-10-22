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
const esc = (s) => String(s).replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

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
  const raw = JSON.stringify({ event, serial, iso });
  return `NP2.${b64(raw)}.${fnv(raw)}`;
};
const verifyCode = (code, expected) => {
  try {
    const [v, body, sig] = String(code).split(".");
    if (v !== "NP2" || !body || !sig) return { ok: false, reason: "Formato de QR no reconocido" };
    const raw = unb64(body);
    if (fnv(raw) !== sig) return { ok: false, reason: "Firma digital inválida · posible captura manipulada" };
    const { event, serial, iso } = JSON.parse(raw);
    if (expected && event !== expected.event) return { ok: false, reason: "El evento del QR no coincide" };
    if (expected && iso !== expected.iso) return { ok: false, reason: "La fecha del QR no coincide con la entrada" };
    if (expected && expected.today && iso !== expected.today) return { ok: false, reason: "La entrada no es para hoy" };
    return { ok: true, data: { event, serial, iso } };
  } catch { return { ok: false, reason: "QR ilegible" }; }
};

/* ---------------- estado ---------------- */
const STORE = "nightpulse.state.v3";
const LEGACY_STORE = "nightpulse.state.v1";
function isoOf(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function todayIso() { return isoOf(Date.now()); }
const DEMO_TODAY = todayIso();
const NIGHT_KEY = DEMO_TODAY;
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
  { id: "l1", event: "Noche Universitaria", venue: "Circus", date: "HOY · 23:00", iso: DEMO_TODAY, type: "General", price: 25, original: 28, seller: "Marta R.", sellerId: "marta", rating: 4.9, serial: "CIR-4471", hue: "#7c3aed", fraud: false },
  { id: "l2", event: "Tech House Night", venue: "Way Club", date: "HOY · 23:30", iso: DEMO_TODAY, type: "VIP", price: 38, original: 35, seller: "Diego P.", sellerId: "diego", rating: 4.7, serial: "WAY-1180", hue: "#0ea5e9", fraud: false },
  { id: "l3", event: "Urban Session", venue: "Blaster", date: "HOY · 01:00", iso: DEMO_TODAY, type: "General", price: 18, original: 22, seller: "Lucía G.", sellerId: "lucia", rating: 5.0, serial: "BLA-9932", hue: "#f43f5e", fraud: true },
  { id: "l4", event: "Afterhours · REM", venue: "REM", date: "HOY · 03:00", iso: DEMO_TODAY, type: "Mesa", price: 60, original: 75, seller: "Andrés M.", sellerId: "andres", rating: 4.6, serial: "REM-2201", hue: "#22d3ee", fraud: false },
  { id: "l5", event: "Nochevieja Universitaria", venue: "Circus", date: "31 DIC · 23:00", iso: "2026-12-31", type: "General", price: 28, original: 30, seller: "Nuria C.", sellerId: "nuria", rating: 4.8, serial: "CIR-8812", hue: "#f59e0b", fraud: false },
  { id: "l6", event: "Indie Night", venue: "Momo", date: "VIE · 30 OCT", iso: "2026-10-30", type: "General", price: 15, original: 18, seller: "Pablo S.", sellerId: "pablo", rating: 4.5, serial: "MOM-2244", hue: "#84cc16", fraud: false }
];

const SELLERS = {
  marta:  { name: "Marta R.",  rating: 4.9, sold: 18, bought: 6, since: "2024" },
  diego:  { name: "Diego P.",  rating: 4.7, sold: 7,  bought: 3, since: "2025" },
  lucia:  { name: "Lucía G.",  rating: 5.0, sold: 3,  bought: 9, since: "2025" },
  andres: { name: "Andrés M.", rating: 4.6, sold: 12, bought: 4, since: "2023" },
  nuria:  { name: "Nuria C.",  rating: 4.8, sold: 5,  bought: 2, since: "2025" },
  pablo:  { name: "Pablo S.",  rating: 4.5, sold: 9,  bought: 1, since: "2024" }
};

const RIDES = [
  { id: "r1", dest: "Centro", club: "Circus", depart: "03:25", seats: 4, taken: 2, price: 9,  members: ["MR", "DP"] },
  { id: "r2", dest: "Fontiñas", club: "Circus", depart: "03:40", seats: 3, taken: 1, price: 16, members: ["LG"] },
  { id: "r3", dest: "San Lázaro", club: "Circus", depart: "03:15", seats: 4, taken: 3, price: 18, members: ["AM", "JC", "SR"] }
];

const DESTS = [
  { name: "Centro", eta: 8, price: 9 },
  { name: "Ensanche", eta: 10, price: 11 },
  { name: "Vista Alegre", eta: 14, price: 14 },
  { name: "Fontiñas", eta: 16, price: 16 },
  { name: "San Lázaro", eta: 18, price: 18 }
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
  crowdReports: [],
  karma: 120,
  wallet: 50,
  profile: { sold: 3, bought: 0 },
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

const isNum = (n) => typeof n === "number" && Number.isFinite(n);
const isObj = (o) => o !== null && typeof o === "object" && !Array.isArray(o);

function loadState() {
  try { localStorage.removeItem(LEGACY_STORE); localStorage.removeItem("nightpulse.state.v2"); } catch {}
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(STORE) || "null"); } catch {}
  // estado doutra versión (locais Aurora/Neón...): descártase enteiro
  if (isObj(saved) && Array.isArray(saved.clubs) && saved.clubs.length &&
      !saved.clubs.some(c => isObj(c) && CLUBS.some(x => x.id === c.id))) {
    saved = null;
  }
  const base = structuredClone(DEFAULT);
  const src = isObj(saved) ? saved : {};
  const s = { ...base, ...src };

  s.clubs = (Array.isArray(src.clubs) ? src.clubs : structuredClone(CLUBS))
    .filter(c => isObj(c) && CLUBS.some(x => x.id === c.id));
  if (!s.clubs.length) s.clubs = structuredClone(CLUBS);
  s.clubs.forEach(c => {
    const def = CLUBS.find(x => x.id === c.id) || CLUBS[0];
    c.name = typeof c.name === "string" ? c.name : def.name;
    c.short = typeof c.short === "string" ? c.short : def.short;
    c.cap = isNum(c.cap) && c.cap > 0 ? Math.round(c.cap) : def.cap;
    c.inside = isNum(c.inside) ? Math.round(c.inside) : Math.round(c.cap * (def.baseOcc ?? 50) / 100);
    c.inside = clamp(c.inside, 0, c.cap);
    c.entries = isNum(c.entries) ? Math.max(0, Math.round(c.entries)) : c.inside + 120;
    c.exits = isNum(c.exits) ? Math.max(0, Math.round(c.exits)) : 120;
    c.rssi = isNum(c.rssi) ? c.rssi : def.rssi;
    c.baseOcc = isNum(c.baseOcc) ? clamp(c.baseOcc, 0, 100) : def.baseOcc;
    c.queue = isNum(c.queue) ? clamp(Math.round(c.queue), 0, 200) : def.queue;
    c.wait = isNum(c.wait) ? Math.max(1, Math.round(c.wait)) : def.wait;
    c.x = isNum(c.x) ? c.x : def.x;
    c.y = isNum(c.y) ? c.y : def.y;
    c.address = typeof c.address === "string" ? c.address : (def.address || "");
    c.zone = typeof c.zone === "string" ? c.zone : (def.zone || "Centro");
    c.music = typeof c.music === "string" ? c.music : (def.music || "");
    c.occ = Math.round((c.inside / c.cap) * 100);
    c.trend = Array.isArray(c.trend) ? c.trend.filter(isNum).slice(-8) : [];
    if (!c.trend.length) c.trend = [c.occ];
  });

  s.listings = (Array.isArray(src.listings) ? src.listings : structuredClone(LISTINGS))
    .filter(l => isObj(l) && typeof l.id === "string" && typeof l.event === "string");
  s.listings.forEach(l => {
    l.venue = typeof l.venue === "string" ? l.venue : "Sala Aurora";
    l.date = typeof l.date === "string" ? l.date : "HOY";
    l.iso = typeof l.iso === "string" ? l.iso : DEMO_TODAY;
    if (l.date.startsWith("HOY")) l.iso = DEMO_TODAY;
    l.type = ["General", "VIP", "Mesa"].includes(l.type) ? l.type : "General";
    l.price = isNum(l.price) ? l.price : 25;
    l.original = isNum(l.original) ? l.original : l.price;
    l.seller = typeof l.seller === "string" ? l.seller : "Tú";
    if (!l.sellerId) {
      const byName = { "Marta R.": "marta", "Diego P.": "diego", "Lucía G.": "lucia", "Andrés M.": "andres", "Nuria C.": "nuria", "Pablo S.": "pablo", "Tú": "me" };
      l.sellerId = byName[l.seller] || "marta";
    }
    l.rating = isNum(l.rating) ? l.rating : 5;
    l.hue = typeof l.hue === "string" && /^#[0-9a-f]{3,8}$/i.test(l.hue) ? l.hue : "#a855f7";
    l.serial = typeof l.serial === "string" ? l.serial : "USR-0000";
    l.code = makeCode(l.event, l.serial, l.fraud ? "1999-01-01" : l.iso);
  });
  // se a lista gardada é antiga, engade os eventos novos sen borrar compras
  LISTINGS.forEach(def => {
    if (!s.listings.some(l => l.id === def.id)) {
      const l = { ...def };
      if (l.date.startsWith("HOY")) l.iso = DEMO_TODAY;
      l.code = makeCode(l.event, l.serial, l.fraud ? "1999-01-01" : l.iso);
      s.listings.push(l);
    }
  });

  s.purchases = (Array.isArray(src.purchases) ? src.purchases : [])
    .filter(p => isObj(p) && typeof p.id === "string" && typeof p.listingId === "string");
  s.purchases.forEach(p => {
    p.event = typeof p.event === "string" ? p.event : "Evento";
    p.venue = typeof p.venue === "string" ? p.venue : "Sala Aurora";
    p.date = typeof p.date === "string" ? p.date : "HOY";
    p.iso = typeof p.iso === "string" ? p.iso : DEMO_TODAY;
    p.type = typeof p.type === "string" ? p.type : "General";
    p.price = isNum(p.price) ? p.price : 0;
    p.fee = isNum(p.fee) ? p.fee : Math.round(p.price * 10) / 100;
    p.total = isNum(p.total) ? p.total : Math.round((p.price + p.fee) * 100) / 100;
    if (!["funded", "redeemed", "refunded"].includes(p.status)) p.status = "funded";
    p.code = typeof p.code === "string" ? p.code : "";
    if (p.status === "funded" && !p.code) p.status = "refunded";
  });

  s.profile = { sold: 3, bought: 0, ...(isObj(src.profile) ? src.profile : {}) };
  ["sold", "bought"].forEach(k => { if (!isNum(s.profile[k])) s.profile[k] = k === "sold" ? 3 : 0; });
  s.profile.bought = Math.max(s.profile.bought, s.purchases.filter(p => p.status !== "refunded").length);

  s.rides = (Array.isArray(src.rides) ? src.rides : structuredClone(RIDES)).filter(isObj);
  s.rides.forEach(r => {
    r.dest = typeof r.dest === "string" ? r.dest : "Moncloa";
    r.club = typeof r.club === "string" ? r.club : "Sala Aurora";
    r.depart = typeof r.depart === "string" ? r.depart : "03:30";
    r.seats = isNum(r.seats) ? clamp(Math.round(r.seats), 1, 8) : 4;
    r.taken = isNum(r.taken) ? clamp(Math.round(r.taken), 0, r.seats) : 1;
    r.price = isNum(r.price) ? r.price : 14;
    r.members = Array.isArray(r.members) ? r.members.filter(m => typeof m === "string").slice(0, r.seats) : [];
  });
  if (!s.rides.length) s.rides = structuredClone(RIDES);

  s.vault = { ...base.vault, ...(isObj(src.vault) ? src.vault : {}) };
  s.vault.revealed = !!s.vault.revealed;
  s.vault.demo = !!s.vault.demo;
  s.vault.photos = (Array.isArray(s.vault.photos) ? s.vault.photos : []).filter(p =>
    isObj(p) && (p.kind === "upload"
      ? typeof p.dataUrl === "string" && p.dataUrl.startsWith("data:image/")
      : isNum(p.seed)));
  if (!s.vault.photos.length) {
    s.vault.photos = Array.from({ length: 12 }, (_, i) => ({ id: "p" + i, kind: "gen", seed: 1000 + i * 37 }));
  }
  if (!isNum(s.vault.revealAt) || s.vault.revealAt <= 0) s.vault.revealAt = next8amNight();

  s.stats = { ...base.stats, ...(isObj(src.stats) ? src.stats : {}) };
  ["reports", "escrow", "squads"].forEach(k => { if (!isNum(s.stats[k])) s.stats[k] = base.stats[k]; });

  s.crowdReports = (Array.isArray(src.crowdReports) ? src.crowdReports : [])
    .filter(r => isObj(r) && typeof r.club === "string" && isNum(r.level) && isNum(r.at))
    .map(r => ({ ...r, night: typeof r.night === "string" && r.night ? r.night : isoOf(r.at) }))
    .slice(-80);
  s.karma = isNum(s.karma) ? s.karma : 120;
  s.wallet = isNum(s.wallet) ? Math.round(clamp(s.wallet, 0, 100000) * 100) / 100 : 50;

  s.scans = (Array.isArray(src.scans) ? src.scans : [])
    .filter(x => isObj(x) && typeof x.club === "string").slice(0, 8);
  s._log = (Array.isArray(src._log) ? src._log : [])
    .filter(x => isObj(x) && typeof x.t === "string" && typeof x.msg === "string").slice(0, 6);
  if (!["noche", "aforo", "tickets", "taxi", "vault"].includes(s.view)) s.view = "noche";
  if (!["buy", "sell", "mine"].includes(s.ticketTab)) s.ticketTab = "buy";
  if (!s.clubs.some(c => c.id === s.selectedClub)) s.selectedClub = s.clubs[0].id;
  if (!DESTS.some(d => d.name === s.destination)) s.destination = "Centro";
  if (!s.rides.some(r => r.id === s.joinedRide)) s.joinedRide = null;
  return s;
}

let state = loadState();
let sensorPingAt = Date.now();
let quotaWarned = false;
state.clubs.forEach(c => { recomputeOcc(c); });

function save() {
  try { localStorage.setItem(STORE, JSON.stringify(state)); return true; }
  catch {
    if (!quotaWarned) {
      quotaWarned = true;
      toast("Almacenamiento local lleno: los últimos cambios no se guardarán", "bad");
    }
    return false;
  }
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

function refreshFromStorage() {
  state = loadState();
  state.clubs.forEach(c => recomputeOcc(c));
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
  msg = String(msg).replace(/<[^>]*>/g, "");
  state._log = state._log || [];
  state._log.unshift({ t: nowStr(), msg });
  state._log = state._log.slice(0, 6);
  renderLog();
}
function renderLog() {
  const items = state._log && state._log.length ? state._log : [
    { t: "03:04", msg: "Circus · el sensor detecta 53 móviles en la puerta" },
    { t: "03:07", msg: "Escrow #A21 liberado · 25,00 € al vendedor" },
    { t: "03:09", msg: "Puerta Blaster · 609/700 dentro" }
  ];
  const ul = $("#logList");
  ul.replaceChildren(...items.map(i => {
    const li = document.createElement("li");
    const t = document.createElement("span");
    t.className = "t";
    t.textContent = i.t;
    const m = document.createElement("span");
    m.textContent = i.msg;
    li.append(t, m);
    return li;
  }));
}

function renderKpis() {
  const escrow = state.purchases.filter(p => p.status === "funded")
    .reduce((a, p) => a + (isNum(p.total) ? p.total : p.price), Number(state.stats.escrow || 0));
  $("#kpis").innerHTML = `
    <div class="kpi"><b>${sensorDevices(clubById(state.selectedClub))}</b><span>Móviles</span></div>
    <div class="kpi"><b>${eur(escrow)}</b><span>En escrow</span></div>
    <div class="kpi"><b>${state.rides.filter(r => r.taken < r.seats).length}</b><span>Squads</span></div>`;
}

/* ---------------- monedero + cuenta ---------------- */
function renderWallet() {
  const el = $("#walletChip");
  if (el) el.textContent = eur(state.wallet ?? 0);
}

function topUp(amount, silent) {
  state.wallet = Math.round(((state.wallet || 0) + amount) * 100) / 100;
  save();
  renderWallet();
  if (!silent) {
    toast(`+${eur(amount)} al monedero`, "good");
    log(`Recarga demo · +${eur(amount)} · saldo ${eur(state.wallet)}`);
  }
}

function openAccount() {
  const s = readSession();
  const email = (s && s.email) || "demo@civernautas.app";
  const age = s ? ageFrom(s.dob) : null;
  const mine = state.purchases.filter(p => p.status !== "refunded").length;
  const nextTier = KARMA_TIERS.find(t => t.karma > state.karma);

  openSheet(`
    <div class="sheet-head">
      <div><h3>Tu cuenta</h3><p>Monedero, karma y sesión</p></div>
      <button class="x-btn" data-close aria-label="Cerrar">✕</button>
    </div>
    <div class="acc-top">
      <div class="acc-avatar">${esc(email.charAt(0).toUpperCase())}</div>
      <div><b>${esc(email)}</b><small>${age ? age + " años · +18 verificado" : "Sesión demo"}</small></div>
    </div>
    <div class="wallet-card">
      <span>Monedero</span>
      <b>${eur(state.wallet)}</b>
      <small>Saldo disponible para entradas y reservas</small>
      <div class="topup-row">
        <button data-topup="10">+10 €</button>
        <button data-topup="20">+20 €</button>
        <button data-topup="50">+50 €</button>
      </div>
    </div>
    <div class="karma-card">
      <div class="karma-head"><span>Karma</span><b>★ ${state.karma}</b></div>
      <p>+10 por reporte de aforo y +10 al validar una entrada. Canjéalos por saldo.</p>
      <div class="karma-tiers">
        ${KARMA_TIERS.map(t => `<button data-redeem="${t.karma}" ${state.karma < t.karma ? "disabled" : ""}>${t.karma} → ${eur(t.eur)}</button>`).join("")}
      </div>
      ${nextTier
        ? `<div class="karma-progress"><i style="width:${Math.min(100, (state.karma / nextTier.karma) * 100)}%"></i></div>
           <small>Te faltan ${nextTier.karma - state.karma} para ${eur(nextTier.eur)}</small>`
        : `<small>Nivel máximo alcanzado</small>`}
    </div>
    <div class="acc-rows">
      <div><span>Compradas</span><b>${state.profile.bought}</b></div>
      <div><span>Vendidas</span><b>${state.profile.sold}</b></div>
      <div><span>Ciudad</span><b>Santiago de Compostela</b></div>
    </div>
    <div class="acc-actions">
      <button class="btn ghost" id="btnAccountTickets">Ver mis entradas</button>
      <button class="btn ghost" id="btnLogout">Cerrar sesión</button>
    </div>
    <p class="auth-legal" style="margin-top:12px">Recargas y pagos simulados. La sesión se cierra al cerrar la app.</p>
  `);

  $$("#sheet [data-topup]").forEach(b => b.addEventListener("click", () => {
    topUp(Number(b.dataset.topup));
    openAccount();
  }));

  $$("#sheet [data-redeem]").forEach(b => b.addEventListener("click", () => {
    redeemKarma(Number(b.dataset.redeem));
  }));

  $("#btnAccountTickets").addEventListener("click", () => {
    closeSheet();
    setTicketTab("mine");
    setView("tickets");
  });

  $("#btnLogout").addEventListener("click", logout);
}

const KARMA_TIERS = [
  { karma: 100, eur: 1 },
  { karma: 250, eur: 3 },
  { karma: 500, eur: 7 }
];

function redeemKarma(cost) {
  const tier = KARMA_TIERS.find(t => t.karma === cost);
  if (!tier) return;
  if (state.karma < tier.karma) return toast("Te falta karma para ese canje", "bad");

  state.karma -= tier.karma;
  state.wallet = Math.round((state.wallet + tier.eur) * 100) / 100;
  save();
  renderWallet();
  renderHome();
  toast(`Canjeado · +${eur(tier.eur)} al monedero`, "good");
  log(`Karma canjeado · ${tier.karma} pts → ${eur(tier.eur)} · saldo ${eur(state.wallet)}`);
  openAccount();
}

function sellerProfile(id) {
  if (id === "me") {
    return {
      name: "Tú",
      rating: 5,
      sold: state.profile?.sold ?? 0,
      bought: state.profile?.bought ?? 0,
      since: "2026"
    };
  }
  return SELLERS[id] || { name: "Vendedor", rating: 5, sold: 0, bought: 0, since: "2025" };
}

function openSeller(id) {
  const p = sellerProfile(id);
  const active = state.listings.filter(l => l.sellerId === id &&
    !state.purchases.some(x => x.listingId === l.id && x.status !== "refunded"));

  openSheet(`
    <div class="sheet-head">
      <div><h3>${esc(p.name)}</h3><p>Perfil de vendedor ${id === "me" ? "· tu cuenta" : "· identidad verificada"}</p></div>
      <button class="x-btn" data-close aria-label="Cerrar">✕</button>
    </div>
    <div class="seller-hero">
      <div class="seller-avatar">${esc(p.name.charAt(0))}</div>
      <div class="seller-id"><b>${esc(p.name)}</b><small>Miembro desde ${esc(p.since)}</small></div>
      <span class="badge media">★ ${esc(String(p.rating))}</span>
    </div>
    <div class="seller-stats">
      <div><span>Vendidas</span><b>${p.sold}</b></div>
      <div><span>Compradas</span><b>${p.bought}</b></div>
      <div><span>Valoración</span><b>${esc(String(p.rating))}</b></div>
    </div>
    <div class="section-title" style="margin:12px 0 6px"><h3>Entradas activas</h3><span>${active.length}</span></div>
    <div class="seller-list">
      ${active.length
        ? active.map(l => `<div class="seller-row"><div><b>${esc(l.event)}</b><small>${esc(l.venue)} · ${esc(l.date)}</small></div><span>${eur(l.price)}</span></div>`).join("")
        : `<p class="scan-empty">Sin entradas activas ahora mismo.</p>`}
    </div>
    <div class="note-box" style="margin-top:12px">
      <span>✓</span><span>Historial guardado en su perfil. Solo se valora después de completar una entrada.</span>
    </div>
  `);
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
/* ---------------- aforo híbrido ---------------- */
// Señal de reportes 1-tap, con decaimiento exponencial: pierde la mitad cada 30 min.
function userSignal(c) {
  const now = Date.now();
  const reps = (state.crowdReports || []).filter(r => r.club === c.id && now - r.at < 90 * 60000);
  if (!reps.length) return null;
  let sum = 0, w = 0;
  for (const r of reps) {
    const k = Math.pow(0.5, (now - r.at) / (30 * 60000));
    sum += r.level * k;
    w += k;
  }
  return { value: sum / w, count: reps.length };
}

// Cola estimada: personas en la cola (sensor) y presión normalizada por capacidad.
function queueEstimate(c) {
  return Math.max(0, Math.round(c.queue));
}
function queuePressure(c) {
  const ref = Math.max(20, Math.round(c.cap * 0.2)); // 20% de la capacidad = 100% de presión
  return clamp(Math.round((queueEstimate(c) / ref) * 100), 0, 99);
}

// W1 puerta + entradas 55% · W2 reportes 30% · W3 cola estimada 15%
function computeOcc(c) {
  const door = (c.inside / c.cap) * 100;
  const q = queuePressure(c);
  const u = userSignal(c);

  let sum = 0.55 * door + 0.15 * q;
  let weight = 0.70;

  if (u) {
    sum += 0.30 * u.value;
    weight += 0.30;
  }
  return clamp(Math.round(sum / weight), 3, 99);
}

function recomputeOcc(c) {
  c.occ = computeOcc(c);
}

function sensorDevices(c) {
  return Math.max(1, Math.round(c.queue / 1.35));
}

function renderSensor() {
  const c = clubById(state.selectedClub);
  if (!$("#sensorDevices")) return;
  $("#sensorDevices").textContent = sensorDevices(c);
  if ($("#sensorQueue")) $("#sensorQueue").textContent = queueEstimate(c);
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
    sel.innerHTML = state.clubs.map(x => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join("");
  }
  sel.value = c.id;

  const sat = satFromOcc(c.occ);
  const col = satColor[sat];
  const circ = 2 * Math.PI * 35;

  $("#homeName").textContent = c.name;
  $("#homeMeta").textContent = `${c.address || "Santiago de Compostela"} · ${c.zone || "Centro"}`;
  $("#homeInside").textContent = c.occ;
  $("#homePct").innerHTML = `${c.occ}<span>%</span>`;
  $("#homeSat").className = "badge " + sat;
  $("#homeSat").textContent = satLabel[sat];
  $("#homeState").textContent = {
    baja: "Tranquilo", media: "Ambiente", alta: "Casi lleno", critica: "Saturación máxima"
  }[sat];
  $("#homeFill").style.width = Math.min(100, c.occ) + "%";
  $("#homeFill").style.background = col;
  $("#homeCount").textContent = `${c.inside}/${c.cap}`;
  $("#homeFree").textContent = Math.max(0, c.cap - c.inside);
  $("#homeKarma").textContent = state.karma ?? 0;
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
  const scans = (state.scans || []).filter(s => s.club === c.id).slice(0, 5);
  const u = userSignal(c);
  const q = queuePressure(c);
  const qPeople = queueEstimate(c);
  const doorPct = Math.round((c.inside / c.cap) * 100);

  openSheet(`
    <div class="sheet-head">
      <div><h3>Panel del local</h3><p>${esc(c.name)} · puerta principal</p></div>
      <button class="x-btn" data-close aria-label="Cerrar">✕</button>
    </div>
    <div class="mini-label">Aforo estimado</div>
    <div class="panel-big"><b>${c.occ}%</b><span>contador ${c.inside}/${c.cap}</span></div>
    <div class="door-bar" style="margin-bottom:10px"><i style="width:${Math.min(100, c.occ)}%;background:${col}"></i></div>
    <div class="occ-src">
      <div><span>Puerta + entradas</span><i>peso 55%</i><b>${doorPct}%</b></div>
      <div><span>Reportes 1-tap</span><i>peso 30%</i><b>${u ? Math.round(u.value) + "%" : "—"}</b></div>
      <div><span>Cola estimada</span><i>${qPeople} personas · peso 15%</i><b>${Math.round(q)}%</b></div>
    </div>
    <div class="stat-row" style="grid-template-columns:repeat(4,1fr);margin-top:10px">
      <div class="stat"><span>En cola</span><b>${qPeople}</b></div>
      <div class="stat"><span>Espera</span><b>${c.wait}m</b></div>
      <div class="stat"><span>Entradas</span><b>${c.entries}</b></div>
      <div class="stat"><span>Salidas</span><b>${c.exits}</b></div>
    </div>
    <div class="section-title" style="margin:14px 0 6px"><h3>Últimos accesos</h3><span>${scans.length ? scans.length + " hoy" : "sin datos"}</span></div>
    <div class="scan-list">
      ${scans.length
        ? scans.map(s => `<div class="scan-item"><span>${esc(s.time)}</span><b>${esc(s.event)}</b><small>${esc(s.type)}</small></div>`).join("")
        : `<p class="scan-empty">Todavía no hay entradas validadas.</p>`}
    </div>
    <div class="note-box" style="margin-top:12px">
      <span style="color:#22d3ee">◉</span>
      <span>Fórmula: 55% puerta + entradas · 30% reportes · 15% cola estimada (personas en cola, normalizadas por capacidad). Los reportes caducan a los 30 min.</span>
    </div>
  `);
}

const CROWD_LEVELS = { 1: 40, 2: 70, 3: 95 };
const CROWD_LABEL = { 1: "Fluido", 2: "Pista llena", 3: "Aforo máximo" };
const reportedTonight = (clubId) => (state.crowdReports || [])
  .some(r => r.club === clubId && r.night === NIGHT_KEY);

function openCrowdCheck(clubId) {
  const c = clubById(clubId || state.selectedClub);
  const done = reportedTonight(c.id);
  openSheet(`
    <div class="sheet-head">
      <div><h3>¿Cómo está la sala?</h3><p>${esc(c.name)} · 1 toque · +10 karma</p></div>
      <button class="x-btn" data-close aria-label="Cerrar">✕</button>
    </div>
    <p class="check-intro">Tu reporte se pondera con la puerta y el sensor. Ganas 10 de karma, canjeable por saldo en Tu cuenta. Un reporte por local y noche.</p>
    ${done
      ? `<div class="note-box"><span>✅</span><span>Ya reportaste ${esc(c.name)} esta noche. Vuelve mañana para actualizarlo.</span></div>`
      : `<div class="check-opts">
          <button data-crowd="1" data-crowd-club="${esc(c.id)}">
            <span>🟢</span><div><b>Fluido</b><small>30–50% · se está bien</small></div>
          </button>
          <button data-crowd="2" data-crowd-club="${esc(c.id)}">
            <span>🟡</span><div><b>Pista llena</b><small>60–80% · hay ambiente</small></div>
          </button>
          <button data-crowd="3" data-crowd-club="${esc(c.id)}">
            <span>🔴</span><div><b>Aforo máximo</b><small>90–100% · agobiante</small></div>
          </button>
        </div>`}
    <p class="check-note">Cada reporte pierde la mitad de su peso cada 30 minutos. Solo uno por local y noche.</p>
  `);
}

function submitCrowd(clubId, level) {
  const c = clubById(clubId);
  const value = CROWD_LEVELS[level];
  if (!value) return;
  if (reportedTonight(c.id)) {
    closeSheet();
    return toast(`Ya reportaste ${c.name} esta noche`, "bad");
  }

  state.crowdReports.push({ club: c.id, level: value, at: Date.now(), night: NIGHT_KEY });
  state.crowdReports = state.crowdReports.slice(-80);
  state.karma = (state.karma || 0) + 10;

  recomputeOcc(c);
  c.trend = [...c.trend.slice(-7), c.occ];
  save();

  closeSheet();
  updateMapPins();
  renderClubs();
  renderDoor();
  renderHome();

  toast(`+10 karma · ${c.name} ${c.occ}% estimado`, "good");
  log(`Reporte de aforo en ${c.name} · ${CROWD_LABEL[level]} · +10 karma`);
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
  recomputeOcc(c);
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
      log(`Puerta ${c.name} · ${real > 0 ? "+" : ""}${real} · ${c.inside}/${c.cap} dentro`);
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
      <text y="19" text-anchor="middle">${esc(c.name)}</text>
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
    const grad = document.querySelector(`#halo-${c.id}`);
    if (grad) grad.querySelectorAll("stop").forEach(st => st.setAttribute("stop-color", col));
  });
}

/* ---------------- aforo ---------------- */
function renderClubs() {
  const list = $("#clubList");
  if (!list) return;
  const sorted = [...state.clubs].sort((a, b) => b.occ - a.occ);
  list.innerHTML = sorted.map(c => {
    const col = satColor[satFromOcc(c.occ)];
    return `<button class="club-row" data-club="${esc(c.id)}">
      <div class="club-avatar">${esc(c.short)}</div>
      <div class="club-main">
        <b>${esc(c.name)}</b>
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
      <div><h3>${esc(c.name)}</h3><p>Aforo ${c.cap} personas · actualizado ahora</p></div>
      <button class="x-btn" data-close aria-label="Cerrar">✕</button>
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
    <p class="sheet-door-note">El aforo lo mueve el contador de puerta; cada QR validado suma 1. No hay botón de +1.</p>
    <button class="btn ghost small" style="width:100%;margin-bottom:6px" data-checkin="${esc(c.id)}">Reportar aforo · +10 karma</button>
    <button class="btn primary" data-venue-panel="${esc(c.id)}">Abrir panel del local</button>
  `);
}

function initHome() {
  const sel = $("#homeClub");
  sel.innerHTML = state.clubs.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join("");
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
  const fee = Math.round(listing.price * 0.1 * 100) / 100;
  return {
    id: "p" + Date.now().toString(36),
    listingId: listing.id,
    event: listing.event,
    venue: listing.venue,
    date: listing.date,
    iso: listing.iso,
    type: listing.type,
    price: listing.price,
    fee,
    total: Math.round((listing.price + fee) * 100) / 100,
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

const hasActivePurchase = (listingId) => state.purchases.some(p => p.listingId === listingId && p.status !== "refunded");

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
      ${state.listings.map(l => {
        const mine = state.purchases.find(p => p.listingId === l.id && p.status !== "refunded");
        return `
        <article class="listing">
          <div class="listing-top">
            <div class="listing-art" style="background:linear-gradient(150deg,${esc(l.hue)},#0d0a18)">
              ${esc(l.type)}<br>${esc(l.date.split(" · ")[0])}
            </div>
            <div class="listing-info">
              <h4>${esc(l.event)}</h4>
              <div class="meta">${esc(l.venue)} · ${esc(l.date)}</div>
              <div class="tag-row">
                <span class="tag ${l.type.toLowerCase() === "vip" ? "vip" : ""}">${esc(l.type)}</span>
                <span class="tag verified">QR verificado</span>
                ${l.price < l.original ? '<span class="tag deal">bajo coste</span>' : ""}
              </div>
              <div class="meta" style="margin-top:5px">
                <button class="seller-link" data-seller="${esc(l.sellerId || "marta")}">
                  ${esc(l.seller)} · ★ ${esc(String(l.rating))} · ${sellerProfile(l.sellerId || "marta").sold} ventas
                </button>
              </div>
            </div>
          </div>
          <div class="listing-buy">
            <div class="price">
              <b>${eur(l.price)}</b>
              ${l.price < l.original ? `<s>${eur(l.original)}</s>` : ""}
              <small>protegido por escrow</small>
            </div>
            <button class="buy-btn" data-buy="${esc(l.id)}" ${mine ? 'disabled style="opacity:.4"' : ""}>${mine ? (mine.status === "redeemed" ? "Validada" : "En tu cartera") : "Comprar"}</button>
          </div>
        </article>`;
      }).join("")}
      <p style="font-size:9.5px;color:var(--tx-3);text-align:center;margin-top:6px;line-height:1.5">
        El vendedor no cobra hasta que tu QR se valida en la puerta.
      </p>`;
    return;
  }

  if (state.ticketTab === "sell") {
    body.innerHTML = `
      <div class="form">
        <label class="field"><span>Evento</span>
          <input id="sellEvent" value="Afterhours · Rooftop" maxlength="60" />
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
        <label class="field"><span>Precio (€)</span>
          <input id="sellPrice" type="number" min="5" max="300" value="30" />
        </label>
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
        <p style="font-size:10px;margin-top:4px">Compra una en el marketplace.</p>
      </div>
      <button class="btn ghost" id="btnGoBuy">Ver entradas en venta</button>`;
    $("#btnGoBuy").addEventListener("click", () => setTicketTab("buy"));
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
        <div><h4>${esc(p.event)}</h4><small>${esc(p.venue)} · ${esc(p.date)}</small></div>
        <span class="status-pill ${esc(p.status)}">${stLabel}</span>
      </div>
      <div class="e-code">${esc(p.code)}</div>
      <div class="e-status">
        <small style="font-size:9px;color:var(--tx-2)">${label}</small>
        <b style="font-size:13px">${eur(p.price)}</b>
      </div>
      <div class="steps">
        ${steps.map(s => `<div class="step-dot ${s ? "on" : ""}"></div>`).join("")}
      </div>
      ${p.status === "funded"
        ? `<button class="btn primary small" style="width:100%;margin-top:11px" data-validate="${esc(p.id)}">Validar en la puerta</button>`
        : ""}
    </div>`;
  }).join("");
}

function openBuySheet(id) {
  const l = state.listings.find(x => x.id === id);
  if (!l) return;
  const fee = Math.round(l.price * 0.1 * 100) / 100;
  const total = Math.round((l.price + fee) * 100) / 100;
  const enough = state.wallet >= total;

  openSheet(`
    <div class="sheet-head">
      <div><h3>${esc(l.event)}</h3><p>${esc(l.venue)} · ${esc(l.date)}</p></div>
      <button class="x-btn" data-close aria-label="Cerrar">✕</button>
    </div>
    <div class="pay-summary">
      <div class="pay-row"><span>Entrada ${esc(l.type)}</span><b>${eur(l.price)}</b></div>
      <div class="pay-row"><span>Protección escrow (10%)</span><b>${eur(fee)}</b></div>
      <div class="pay-row"><span>Vendedor recibe</span><b>${eur(l.price)}</b></div>
      <div class="pay-row"><span>Monedero disponible</span><b class="${enough ? "" : "bad"}">${eur(state.wallet)}</b></div>
      <div class="pay-row total"><span>Total a autorizar</span><b>${eur(total)}</b></div>
    </div>
    <div class="escrow-track">
      <div class="esc-step active" id="esc0"><div class="bullet">1</div><div class="txt"><b>Autorizas el pago</b><small>No se cobra todavía</small></div></div>
      <div class="esc-step" id="esc1"><div class="bullet">2</div><div class="txt"><b>Fondos retenidos</b><small>Escrow de NIGHTPULSE</small></div></div>
      <div class="esc-step" id="esc2"><div class="bullet">3</div><div class="txt"><b>Validación en puerta</b><small>QR firmado + puerta</small></div></div>
      <div class="esc-step" id="esc3"><div class="bullet">4</div><div class="txt"><b>Pago liberado</b><small>Solo si entras</small></div></div>
    </div>
    <div id="buyAction">
      ${enough ? `
        <button class="btn primary" id="btnPay">Pagar con monedero · ${eur(total)}</button>
        <p style="font-size:9px;color:var(--tx-3);text-align:center;margin-top:8px">Se descuenta del saldo. Demo sin cargo real.</p>
      ` : `
        <div class="pay-warn"><span>⚠️</span><span>Te faltan ${eur(total - state.wallet)} para esta entrada.</span></div>
        <button class="btn primary" id="btnTopupBuy">Añadir 20 € y continuar</button>
      `}
    </div>
  `);

  const tb = $("#btnTopupBuy");
  if (tb) tb.addEventListener("click", () => {
    topUp(20, true);
    toast("Saldo añadido · elige pagar", "good");
    openBuySheet(l.id);
  });

  const pay = $("#btnPay");
  if (!pay) return;

  pay.addEventListener("click", async () => {
    refreshFromStorage();
    if (hasActivePurchase(l.id)) {
      closeSheet();
      renderTickets();
      return toast("Ya tienes esa entrada en tu cartera", "bad");
    }
    if (state.wallet < total) {
      toast("Saldo insuficiente · recarga el monedero", "bad");
      return openBuySheet(l.id);
    }

    $("#buyAction").innerHTML = `<div class="btn ghost" style="justify-content:center">Autorizando pago…</div>`;
    await sleep(900);

    state.wallet = Math.round((state.wallet - total) * 100) / 100;
    const p = makePurchase(l);
    state.purchases.unshift(p);
    state.profile.bought = (state.profile.bought || 0) + 1;
    save();
    renderWallet();

    $("#esc0").classList.remove("active");
    ["esc0", "esc1"].forEach(id => $("#" + id).classList.add("done"));
    $("#esc2").classList.add("active");
    $("#buyAction").innerHTML = `
      <div class="scan-verdict ok" style="margin-bottom:11px">
        <span class="icon">🛡️</span>
        <div><b>${eur(total)} retenidos en escrow</b><small>Saldo restante ${eur(state.wallet)} · el vendedor cobrará cuando entres.</small></div>
      </div>
      <button class="btn primary" id="btnSeeTicket">Ver mi entrada</button>`;
    $("#btnSeeTicket").addEventListener("click", () => {
      closeSheet();
      setTicketTab("mine");
      setView("tickets");
    });
    renderKpis();
    log(`Compra protegida · ${l.event} · ${eur(total)} · saldo ${eur(state.wallet)}`);
    toast(`Pagado · saldo ${eur(state.wallet)}`, "good");
  });
}

async function publishListing() {
  const btn = $("#btnPublish");
  const event = ($("#sellEvent").value.trim() || "Evento sin nombre").slice(0, 60);
  const venue = $("#sellVenue").value;
  const type = $("#sellType").value;
  const price = clamp(Math.round((Number($("#sellPrice").value) || 25) * 100) / 100, 5, 300);

  btn.disabled = true;
  btn.textContent = "Verificando QR con IA…";
  await sleep(1400);

  const iso = todayIso();
  const serial = "USR-" + Math.floor(1000 + Math.random() * 8999);
  const l = {
    id: "l" + Date.now().toString(36),
    event, venue, date: "HOY · 04:00", iso, type,
    price, original: price,
    seller: "Tú", sellerId: "me", rating: 5.0, serial, hue: "#a855f7",
    fraud: false, code: makeCode(event, serial, iso)
  };
  state.listings.unshift(l);
  save();
  toast("Entrada publicada · QR verificado", "good");
  log(`${event} publicado con QR válido · ${eur(price)}`);
  setTicketTab("buy");
}

/* ---------------- validación en puerta ---------------- */
function openValidatePicker() {
  refreshFromStorage();
  const pending = state.purchases.filter(p => p.status === "funded");
  if (!pending.length) {
    setView("tickets");
    setTicketTab("buy");
    toast("Compra una entrada para validarla en la puerta", "bad");
    return;
  }
  openSheet(`
    <div class="sheet-head">
      <div><h3>Validar entrada</h3><p>Elige la entrada que vas a validar en la puerta.</p></div>
      <button class="x-btn" data-close aria-label="Cerrar">✕</button>
    </div>
    ${pending.map(p => `
      <button class="btn ghost" data-validate="${esc(p.id)}"
        style="width:100%;margin-bottom:8px;justify-content:space-between;text-align:left">
        <span><b style="font-size:11px">${esc(p.event)}</b><br>
          <small style="font-size:9px;color:var(--tx-3)">${esc(p.venue)} · ${esc(p.date)}</small></span>
        <small>${eur(p.price)}</small>
      </button>`).join("")}
  `);
}

function showValidationResult(p, resultado, v, club) {
  openSheet(`
    <div class="sheet-head">
      <div><h3>Resultado</h3><p>${esc(p.event)} · ${esc(p.venue)}</p></div>
      <button class="x-btn" data-close aria-label="Cerrar">✕</button>
    </div>
    <div class="scan-verdict ${v.ok ? "ok" : "bad"}">
      <span class="icon">${v.ok ? "✅" : "⛔"}</span>
      <div>
        <b>${v.ok ? "Entrada válida" : "Entrada rechazada"}</b>
        <small>${v.ok ? `QR verificado · aforo ${club.inside}/${club.cap}` : esc(v.reason)}</small>
      </div>
    </div>
    <div class="stat-row">
      <div class="stat"><span>Riesgo</span><b>${resultado.score_riesgo}/100</b></div>
      <div class="stat"><span>Firma</span><b>${v.ok ? "OK" : "FALLO"}</b></div>
      <div class="stat"><span>Aforo</span><b>${v.ok ? club.occ + "%" : "—"}</b></div>
    </div>
    <pre style="margin:0;padding:10px;border-radius:9px;background:#070511;border:1px solid rgba(255,255,255,.08);font-family:var(--mono);font-size:9px;line-height:1.55;color:#9fdfc8;white-space:pre-wrap">${esc(JSON.stringify(resultado, null, 2))}</pre>
    <div style="height:12px"></div>
    ${v.ok ? `<p class="check-note" style="text-align:center;margin-bottom:8px">+10 karma por validar · el reporte de aforo suma otros +10 (1/local/noche)</p>` : ""}
    ${v.ok ? `<button class="btn ghost small" style="width:100%;margin-bottom:8px" id="btnResultAforo">Ver aforo en vivo</button>` : ""}
    <button class="btn ${v.ok ? "primary" : "ghost"}" ${v.ok ? 'id="btnResultEnter"' : "data-close"}>${v.ok ? "Entrar al local" : "Cerrar"}</button>
  `);
  const aforoBtn = $("#btnResultAforo");
  if (aforoBtn) aforoBtn.addEventListener("click", () => {
    closeSheet();
    state.selectedClub = club.id;
    save();
    $("#homeClub").value = club.id;
    $("#doorClub").value = club.id;
    setView("aforo");
    renderDoor();
  });
  const enterBtn = $("#btnResultEnter");
  if (enterBtn) enterBtn.addEventListener("click", () => {
    closeSheet();
    openCrowdCheck(club.id);
  });
}

function validateTicket(purchaseId) {
  // Relee o estado para non validar dúas veces dende dúas pestanas
  refreshFromStorage();
  const p = state.purchases.find(x => x.id === purchaseId);
  if (!p) return toast("Entrada no encontrada", "bad");
  if (p.status !== "funded") {
    toast(p.status === "redeemed" ? "Esa entrada ya fue validada" : "Esa entrada fue reembolsada", "bad");
    setView("tickets");
    setTicketTab("mine");
    return;
  }

  const club = clubByVenue(p.venue);
  const v = verifyCode(p.code, { event: p.event, iso: p.iso });
  const resultado = {
    firma_ok: v.ok,
    evento: p.event,
    tipo_entrada: p.type,
    riesgo_fraude: v.ok ? "bajo" : "alto",
    score_riesgo: v.ok ? 12 : 94,
    decision: v.ok ? "aceptar" : "rechazar",
    motivo: v.reason || "QR y evento coinciden"
  };

  if (v.ok && p.iso !== todayIso()) {
    return toast("La entrada no es para hoy · consérvala para su fecha", "bad");
  }
  if (v.ok && club.inside >= club.cap) {
    return toast(`Aforo completo en ${club.name} · inténtalo en unos minutos`, "bad");
  }

  if (v.ok) {
    p.status = "redeemed";
    p.clubId = club.id;
    doorMove(club.id, 1, false);        // el aforo sube solo al validar el QR
    state.scans.unshift({ event: p.event, type: p.type, time: nowStr(), club: club.id });
    state.scans = state.scans.slice(0, 8);
    state.karma = (state.karma || 0) + 10;   // check-in real: entré con una entrada válida
    resultado.aforo_actualizado = `${club.inside}/${club.cap}`;
    resultado.aforo_pct = club.occ;
    resultado.karma_otorgado = 10;
    resultado.karma_total = state.karma;
    burst();
    log(`Entrada validada · ${p.event} · +10 karma · aforo ${club.name} ${club.inside}/${club.cap}`);
    toast(`Entrada válida · +10 karma · aforo ${club.name} ${club.occ}%`, "good");
  } else {
    p.status = "refunded";
    const back = isNum(p.total) ? p.total : p.price;
    state.wallet = Math.round((state.wallet + back) * 100) / 100;
    renderWallet();
    log(`Entrada rechazada · ${p.event} · ${eur(back)} devueltos al monedero`);
    toast(`Entrada rechazada · ${eur(back)} devueltos al monedero`, "bad");
  }
  save();
  renderKpis();
  renderClubs();
  renderDoor();
  renderTickets();
  renderHome();
  showValidationResult(p, resultado, v, club);
}

/* ---------------- taxi ---------------- */
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
        <b>Squad confirmado · ${esc(joined.dest)}</b>
        <span class="badge media">${joined.taken}/${joined.seats}</span>
      </div>
      <div class="avatars">
        ${joined.members.map(m => `<div class="avatar">${esc(m)}</div>`).join("")}
        ${Array.from({ length: Math.max(0, joined.seats - joined.members.length) }).map(() => `<div class="avatar empty">+</div>`).join("")}
      </div>
      <div class="ride-meta"><span>Salida <b>${esc(joined.depart)}</b></span><span>VTC <b>${joined.price} €</b></span><span>~<b>${Math.round(joined.price / Math.max(1, joined.taken))} €</b>/persona</span></div>
      <button class="btn ghost small" style="width:100%" id="btnWhatsapp">Compartir en WhatsApp</button>
    </div>` : "";

  $("#rideList").innerHTML = state.rides.map(r => {
    const full = r.taken >= r.seats;
    return `<div class="ride">
      <div class="ride-info">
        <b>${esc(r.dest)} · ${esc(r.depart)}</b>
        <small>${esc(r.club)} · ${full ? "completo" : (r.seats - r.taken) + " plazas libres"} · ${Math.round(r.price / r.seats)} €/pers</small>
        <div class="seats">${Array.from({ length: r.seats }).map((_, i) => `<i class="${i < r.taken ? "on" : ""}"></i>`).join("")}</div>
      </div>
      <button class="join-btn" data-join="${esc(r.id)}" ${full || (joined && joined.id === r.id) ? "disabled" : ""}>
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

function leaveCurrentRide() {
  const prev = state.rides.find(x => x.id === state.joinedRide);
  if (!prev) return;
  prev.taken = Math.max(0, prev.taken - 1);
  prev.members = prev.members.filter(m => m !== "TÚ");
}

function joinRide(id) {
  const r = state.rides.find(x => x.id === id);
  if (!r) return;
  if (state.joinedRide === r.id) return toast("Ya estás dentro de ese squad");
  if (r.taken >= r.seats) return toast("Ese squad ya está completo", "bad");

  // sae do squad anterior para non ocupar prazas en dous coches á vez
  leaveCurrentRide();

  r.taken++;
  if (!r.members.includes("TÚ")) r.members.unshift("TÚ");
  state.joinedRide = r.id;
  save();
  renderTaxi();
  renderKpis();
  toast("Te has unido al squad a " + r.dest, "good");
  log(`Nuevo squad a ${r.dest} · ${r.taken}/${r.seats} plazas`);
}

function createRide() {
  const d = DESTS.find(x => x.name === state.destination) || DESTS[0];
  const nm = nightStart + Math.floor((Date.now() - nowBase) / 60000) + 15;
  const dep = `${pad(Math.floor(nm / 60) % 24)}:${pad(nm % 60)}`;
  leaveCurrentRide();
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
  log(`Squad creado a ${d.name} · salida ${dep}`);
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
    log("Party Vault revelado · " + state.vault.photos.length + " fotos desbloqueadas");
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
      <img src="${esc(src)}" alt="Foto del álbum" loading="lazy">
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
    URL.revokeObjectURL(url);
    added++;
  }
  if (!added) return toast("Selecciona archivos de imagen", "bad");
  const ok = save();
  renderVault();
  toast(ok
    ? `${added} foto${added > 1 ? "s" : ""} bloqueada${added > 1 ? "s" : ""} hasta el revelado`
    : "Fotos añadidas, pero el almacenamiento local está lleno: no se guardarán",
    ok ? "good" : "bad");
  log(`${added} foto${added > 1 ? "s" : ""} nueva${added > 1 ? "s" : ""} en el Party Vault`);
}

/* ---------------- sheet ---------------- */
let lastFocus = null;
function openSheet(html) {
  const s = $("#sheet");
  lastFocus = document.activeElement;
  s.innerHTML = `<div class="sheet-card" role="dialog" aria-modal="true" aria-label="Panel"><div class="grabber"></div>${html}</div>`;
  s.setAttribute("aria-hidden", "false");
  const show = () => {
    if (s.getAttribute("aria-hidden") !== "false") return;
    s.classList.add("open");
    const first = s.querySelector("button, [href], input, select, textarea");
    if (first && !s.contains(document.activeElement)) first.focus({ preventScroll: true });
  };
  requestAnimationFrame(show);
  setTimeout(show, 80);   // respaldo se o navegador non pinta frames (pestana oculta)
}
function closeSheet() {
  const s = $("#sheet");
  s.classList.remove("open");
  s.setAttribute("aria-hidden", "true");
  setTimeout(() => { if (!s.classList.contains("open")) s.innerHTML = ""; }, 300);
  if (lastFocus && lastFocus.isConnected) {
    try { lastFocus.focus({ preventScroll: true }); } catch {}
  }
  lastFocus = null;
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
    log("Temporizador del vault reiniciado a 60 s");
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
    const sl = e.target.closest("[data-seller]");
    if (sl) return openSeller(sl.dataset.seller);
    const b = e.target.closest("[data-buy]");
    if (b) return openBuySheet(b.dataset.buy);
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
  dsel.innerHTML = state.clubs.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join("");
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

  $("#doorScan").addEventListener("click", openValidatePicker);

  document.addEventListener("click", (e) => {
    const ck = e.target.closest("[data-checkin]");
    if (ck) {
      openCrowdCheck(ck.dataset.checkin);
      return;
    }
    const crowd = e.target.closest("[data-crowd]");
    if (crowd) {
      submitCrowd(crowd.dataset.crowdClub, Number(crowd.dataset.crowd));
      return;
    }
    const vp = e.target.closest("[data-venue-panel]");
    if (vp) {
      closeSheet();
      openVenuePanel(vp.dataset.venuePanel);
      return;
    }
    const val = e.target.closest("[data-validate]");
    if (val) {
      validateTicket(val.dataset.validate);
      return;
    }
    if (e.target.closest("[data-close]")) closeSheet();
    if (e.target.id === "sheet") closeSheet();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeSheet();
  });

  // sincroniza o estado se outra pestana modifica localStorage
  window.addEventListener("storage", (e) => {
    if (e.key !== STORE) return;
    refreshFromStorage();
    renderLog();
    renderKpis();
    renderSensor();
    renderHome();
    if (state.view === "aforo") { renderClubs(); renderDoor(); }
    if (state.view === "tickets") renderTickets();
    if (state.view === "taxi") renderTaxi();
    if (state.view === "vault") renderVault();
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
      recomputeOcc(c);
    });
    sensorPingAt = Date.now();
    save();
    if (state.view === "noche") renderHome();
    if (state.view === "aforo") renderClubs();
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
      recomputeOcc(c);
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
  dob.max = new Date().toISOString().slice(0, 10);
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
    setView("noche");
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

  $("#btnWallet").addEventListener("click", openAccount);

  showAuth(!readSession());
}

function logout() {
  closeSheet();
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
  renderWallet();
  renderSensor();
  renderDoor();
  renderHome();
  $("#clock").textContent = clockStr();
  setView(state.view || "noche");

  // bienvenida
  setTimeout(() => toast("Demo lista · todo en vivo"), 700);

  // PWA instalable (require un service worker en Chrome/Android)
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
}

document.addEventListener("DOMContentLoaded", init);
})();
