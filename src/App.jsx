import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@supabase/supabase-js";
import {
  Search, Bell, ChevronDown, ChevronRight, ChevronLeft,
  Trash2, Loader2, Plus, Circle, CircleDot, CheckCircle2, Pencil, ListChecks,
  List as ListIcon, Flag, Calendar as CalendarIcon, ChevronsDown, ChevronsUp, X,
  RefreshCw, Cloud, CloudOff, Download, Upload, Settings, Lock, Unlock, Info, GripVertical, EyeOff, Star, Inbox, CalendarX, ArrowRight,
} from "lucide-react";

// ---------- Supabase ----------
// Project "task-app", created for this app. The anon key is meant to be
// public — it's restricted by the row-level security policy on app_data
// (each row is scoped to auth.uid(), see the SQL migration).
const SUPABASE_URL = "https://ezbhodcepwpoxehlaejp.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV6YmhvZGNlcHdwb3hlaGxhZWpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg5MjIxMDksImV4cCI6MjEwNDQ5ODEwOX0.mnFrUb0bOj_WAQ1fTPDp-8mkuCwwLVVaIRbYSJ8r5eA";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---------- client-side encryption (Web Crypto API) ----------
// Zero-knowledge: the passphrase and the derived key never leave this
// browser. Supabase only ever stores { salt, iv, ciphertext } — random-
// looking bytes it cannot make sense of. PBKDF2-SHA256 with a high
// iteration count derives an AES-256-GCM key from the passphrase; GCM's
// auth tag also means a wrong passphrase fails loudly (decrypt throws)
// instead of silently returning garbage.
const PBKDF2_ITERATIONS = 310000;

function randomBytes(n) {
  return crypto.getRandomValues(new Uint8Array(n));
}

function bytesToB64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function b64ToBytes(b64) {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

async function deriveKeyFromPassphrase(passphrase, saltB64) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: b64ToBytes(saltB64), iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptPayload(key, obj) {
  const iv = randomBytes(12);
  const enc = new TextEncoder();
  const ciphertextBuf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(JSON.stringify(obj)));
  return { iv: bytesToB64(iv), ciphertext: bytesToB64(new Uint8Array(ciphertextBuf)) };
}

async function decryptPayload(key, envelope) {
  const plainBuf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: b64ToBytes(envelope.iv) },
    key,
    b64ToBytes(envelope.ciphertext)
  );
  return JSON.parse(new TextDecoder().decode(plainBuf));
}

// ---------- constants ----------

const PALETTE = ["#4C8DFF", "#34D399", "#A78BFA", "#FB923C", "#F0554B", "#2DD4BF", "#F5C451", "#F472B6", "#60A5FA", "#84CC16"];

const PRIORITIES = ["Baja", "Media", "Alta"];
const STATUSES = ["Por hacer", "Haciendo", "Hecho"];

const STATUS_ICON = {
  "Por hacer": Circle,
  "Haciendo": CircleDot,
  "Hecho": CheckCircle2,
};

const WEEKDAY_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MONTH_LABELS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
const MONTH_ABBR = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const WEEKDAY_FULL_BY_JSDAY = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

// ---------- generic helpers ----------

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function nextColor(areas) {
  return PALETTE[areas.length % PALETTE.length];
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function isoOf(y, m, d) {
  // m is 0-indexed
  return `${y}-${pad2(m + 1)}-${pad2(d)}`;
}

function dateToISOLocal(d) {
  return isoOf(d.getFullYear(), d.getMonth(), d.getDate());
}

// Fixed-date public holidays (month-day, no year).
const HOLIDAYS_BY_COUNTRY = {
  AR: [
    ["01-01", "Año Nuevo"], ["03-24", "Día de la Memoria"], ["04-02", "Día del Veterano y de los Caídos en Malvinas"],
    ["05-01", "Día del Trabajador"], ["05-25", "Revolución de Mayo"], ["06-17", "Paso a la Inmortalidad del Gral. Güemes"],
    ["06-20", "Día de la Bandera"], ["07-09", "Día de la Independencia"], ["12-08", "Inmaculada Concepción"], ["12-25", "Navidad"],
  ],
  ES: [["01-01", "Año Nuevo"], ["01-06", "Reyes"], ["05-01", "Día del Trabajador"], ["08-15", "Asunción"], ["10-12", "Fiesta Nacional"], ["11-01", "Todos los Santos"], ["12-06", "Día de la Constitución"], ["12-08", "Inmaculada Concepción"], ["12-25", "Navidad"]],
  MX: [["01-01", "Año Nuevo"], ["05-01", "Día del Trabajo"], ["09-16", "Independencia"], ["11-20", "Revolución"], ["12-25", "Navidad"]],
  US: [["01-01", "New Year's Day"], ["07-04", "Independence Day"], ["11-11", "Veterans Day"], ["12-25", "Christmas"]],
  BR: [["01-01", "Ano Novo"], ["04-21", "Tiradentes"], ["05-01", "Dia do Trabalho"], ["09-07", "Independência"], ["10-12", "N. Sra. Aparecida"], ["11-02", "Finados"], ["11-15", "Proclamação da República"], ["12-25", "Natal"]],
  CL: [["01-01", "Año Nuevo"], ["05-01", "Día del Trabajo"], ["05-21", "Glorias Navales"], ["09-18", "Independencia"], ["09-19", "Glorias del Ejército"], ["12-25", "Navidad"]],
  none: [],
};

// Anonymous Gregorian algorithm — Easter Sunday for a given year.
function computeEasterSunday(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = March, 4 = April
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

// Argentina moves a handful of holidays to the nearest Monday by decree
// (1584/2010): Tue/Wed → preceding Monday, Thu/Fri → following Monday.
function nearestMonday(date) {
  const dow = date.getDay(); // 0 Sun .. 6 Sat
  const d = new Date(date);
  if (dow === 2) d.setDate(d.getDate() - 1);
  else if (dow === 3) d.setDate(d.getDate() - 2);
  else if (dow === 4) d.setDate(d.getDate() + 4);
  else if (dow === 5) d.setDate(d.getDate() + 3);
  return d;
}

function movableHolidaysFor(countryCode, year) {
  if (countryCode !== "AR") return [];
  const easter = computeEasterSunday(year);
  const addDays = (n) => { const d = new Date(easter); d.setDate(d.getDate() + n); return d; };
  const sanMartin = nearestMonday(new Date(year, 7, 17));
  const diversidad = nearestMonday(new Date(year, 9, 12));
  const soberania = nearestMonday(new Date(year, 10, 20));
  return [
    [dateToISOLocal(addDays(-48)), "Carnaval"],
    [dateToISOLocal(addDays(-47)), "Carnaval"],
    [dateToISOLocal(addDays(-2)), "Viernes Santo"],
    [dateToISOLocal(sanMartin), "Paso a la Inmortalidad del Gral. San Martín"],
    [dateToISOLocal(diversidad), "Día del Respeto a la Diversidad Cultural"],
    [dateToISOLocal(soberania), "Día de la Soberanía Nacional"],
  ];
}

function isHoliday(iso, countryCode) {
  const list = HOLIDAYS_BY_COUNTRY[countryCode];
  if (!list || !list.length) return null;
  const monthDay = iso.slice(5); // "MM-DD"
  const hit = list.find(([md]) => md === monthDay);
  if (hit) return hit[1];
  const year = Number(iso.slice(0, 4));
  const movableHit = movableHolidaysFor(countryCode, year).find(([d]) => d === iso);
  return movableHit ? movableHit[1] : null;
}


function todayISO() {
  return dateToISOLocal(new Date());
}

function fmtDate(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

const LOCAL_PREFS_KEY = "taskapp_prefs_v1";

function loadLocalPrefs() {
  try {
    const raw = localStorage.getItem(LOCAL_PREFS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveLocalPrefs(patch) {
  try {
    const current = loadLocalPrefs();
    localStorage.setItem(LOCAL_PREFS_KEY, JSON.stringify({ ...current, ...patch }));
  } catch {
    /* storage unavailable (private mode, etc.) — just skip persisting */
  }
}

function maskEmail(email) {
  if (!email) return "";
  const at = email.indexOf("@");
  return at === -1 ? email : email.slice(0, at) + "...";
}

function isOverdue(iso, status) {
  if (!iso || status === "Hecho") return false;
  return iso < todayISO();
}

function addDaysISO(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return dateToISOLocal(dt);
}

function weekdayFullOf(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return WEEKDAY_FULL_BY_JSDAY[new Date(y, m - 1, d).getDay()];
}

const WEEKDAY_LABELS_SUN_FIRST = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function buildMonthGrid(year, month, sundayFirst) {
  const rawDay = new Date(year, month, 1).getDay(); // 0 = Sunday (JS native)
  const firstWeekday = sundayFirst ? rawDay : (rawDay + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();
  const cells = [];
  for (let i = firstWeekday - 1; i >= 0; i--) {
    const d = daysInPrevMonth - i;
    const m = month === 0 ? 11 : month - 1;
    const y = month === 0 ? year - 1 : year;
    cells.push({ iso: isoOf(y, m, d), day: d, inMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ iso: isoOf(year, month, d), day: d, inMonth: true });
  }
  let nextDay = 1;
  const nextMonth = month === 11 ? 0 : month + 1;
  const nextYear = month === 11 ? year + 1 : year;
  while (cells.length % 7 !== 0) {
    cells.push({ iso: isoOf(nextYear, nextMonth, nextDay), day: nextDay, inMonth: false });
    nextDay++;
  }
  return cells;
}

function buildWeekDays(anchorIso, sundayFirst) {
  const [y, m, d] = anchorIso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const dow = sundayFirst ? dt.getDay() : (dt.getDay() + 6) % 7;
  const weekStart = new Date(dt);
  weekStart.setDate(dt.getDate() - dow);
  const days = [];
  for (let i = 0; i < 7; i++) {
    const cur = new Date(weekStart);
    cur.setDate(weekStart.getDate() + i);
    days.push({ iso: dateToISOLocal(cur), day: cur.getDate() });
  }
  return days;
}

// ---------- local (no-AI) free-text parser ----------

const PRIORITY_KEYWORDS = {
  Alta: ["urgente", "rápido", "rapido", "alta prioridad", "prioridad alta", "alta"],
  Baja: ["baja prioridad", "prioridad baja", "baja"],
  Media: ["media prioridad", "prioridad media", "media"],
};

const WEEKDAY_WORDS = [
  { dow: 0, words: ["domingo"] },
  { dow: 1, words: ["lunes"] },
  { dow: 2, words: ["martes"] },
  { dow: 3, words: ["miércoles", "miercoles"] },
  { dow: 4, words: ["jueves"] },
  { dow: 5, words: ["viernes"] },
  { dow: 6, words: ["sábado", "sabado"] },
];

function stripPhrase(text, phrase) {
  const idx = text.toLowerCase().indexOf(phrase.toLowerCase());
  if (idx === -1) return null;
  return text.slice(0, idx) + text.slice(idx + phrase.length);
}

function cleanTitle(text, fallback) {
  const cleaned = text
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s,.\-:;]+|[\s,.\-:;]+$/g, "")
    .trim();
  const base = cleaned || fallback.trim();
  if (!base) return "Tarea sin título";
  return base.charAt(0).toUpperCase() + base.slice(1);
}

function nextDow(base, dow) {
  const diff = (dow - base.getDay() + 7) % 7;
  const d = new Date(base);
  d.setDate(d.getDate() + diff);
  return d;
}

function parseFragmentDate(text, today) {
  let remaining = text;

  const explicit = remaining.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/);
  if (explicit) {
    const day = parseInt(explicit[1], 10);
    const month = parseInt(explicit[2], 10);
    let year = explicit[3] ? parseInt(explicit[3], 10) : today.getFullYear();
    if (year < 100) year += 2000;
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      const iso = `${year}-${pad2(month)}-${pad2(day)}`;
      const stripped = remaining.slice(0, explicit.index) + remaining.slice(explicit.index + explicit[0].length);
      return { date: iso, text: stripped };
    }
  }

  const phrases = [
    { phrase: "pasado mañana", get: () => dateToISOLocal(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 2)) },
    { phrase: "pasado manana", get: () => dateToISOLocal(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 2)) },
    { phrase: "hoy", get: () => dateToISOLocal(today) },
    { phrase: "mañana", get: () => dateToISOLocal(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)) },
    { phrase: "manana", get: () => dateToISOLocal(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)) },
    { phrase: "fin de semana", get: () => dateToISOLocal(nextDow(today, 6)) },
    { phrase: "finde", get: () => dateToISOLocal(nextDow(today, 6)) },
  ];
  for (const p of phrases) {
    const stripped = stripPhrase(remaining, p.phrase);
    if (stripped !== null) return { date: p.get(), text: stripped };
  }

  for (const wd of WEEKDAY_WORDS) {
    for (const w of wd.words) {
      const stripped = stripPhrase(remaining, `el ${w}`);
      if (stripped !== null) return { date: dateToISOLocal(nextDow(today, wd.dow)), text: stripped };
    }
    for (const w of wd.words) {
      const stripped = stripPhrase(remaining, w);
      if (stripped !== null) return { date: dateToISOLocal(nextDow(today, wd.dow)), text: stripped };
    }
  }

  return { date: null, text: remaining };
}

function parseFragmentPriority(text) {
  let remaining = text;
  for (const level of Object.keys(PRIORITY_KEYWORDS)) {
    for (const w of PRIORITY_KEYWORDS[level]) {
      const stripped = stripPhrase(remaining, w);
      if (stripped !== null) return { priority: level, text: stripped };
    }
  }
  return { priority: "Media", text: remaining };
}

function parseFragmentAreaProject(text, areas, selectedAreaId, selectedProjectId) {
  const remaining = text;

  if (selectedAreaId !== "all") {
    const area = areas.find((a) => a.id === selectedAreaId);
    if (!area) return { areaId: null, projectId: null, text: remaining };
    if (selectedProjectId) return { areaId: area.id, projectId: selectedProjectId, text: remaining };
    let best = null;
    (area.projects || []).forEach((p) => {
      const stripped = stripPhrase(remaining, p.name);
      if (stripped !== null && (!best || p.name.length > best.len)) best = { id: p.id, len: p.name.length, stripped };
    });
    if (best) return { areaId: area.id, projectId: best.id, text: best.stripped };
    return { areaId: area.id, projectId: null, text: remaining };
  }

  let best = null;
  areas.forEach((a) => {
    (a.projects || []).forEach((p) => {
      const stripped = stripPhrase(remaining, p.name);
      if (stripped !== null && (!best || p.name.length > best.len)) {
        best = { areaId: a.id, projectId: p.id, len: p.name.length, stripped };
      }
    });
  });
  if (!best) {
    areas.forEach((a) => {
      const stripped = stripPhrase(remaining, a.name);
      if (stripped !== null && (!best || a.name.length > best.len)) {
        best = { areaId: a.id, projectId: null, len: a.name.length, stripped };
      }
    });
  }
  if (best) return { areaId: best.areaId, projectId: best.projectId, text: best.stripped };
  return { areaId: null, projectId: null, text: remaining };
}

function parseFreeTextLocal(rawText, { areas, selectedAreaId, selectedProjectId }) {
  const today = new Date();
  const fragments = rawText.split(/\n|,/).map((f) => f.trim()).filter(Boolean);

  return fragments.map((fragment) => {
    let working = fragment;
    const dateResult = parseFragmentDate(working, today);
    working = dateResult.text;
    const priorityResult = parseFragmentPriority(working);
    working = priorityResult.text;
    const areaResult = parseFragmentAreaProject(working, areas, selectedAreaId, selectedProjectId);
    working = areaResult.text;
    return {
      title: cleanTitle(working, fragment),
      date: dateResult.date,
      priority: priorityResult.priority,
      areaId: areaResult.areaId,
      projectId: areaResult.projectId,
      note: "",
    };
  });
}

// ---------- seed data ----------
// Empty by default so you can test creating areas, projects and tasks from scratch.

const seedAreas = [];

const BOOT_STYLES = `
  .boot-screen {
    --bg: #0f1116; --surface: #161921; --surface-2: #1d212b; --border: rgba(255,255,255,0.075);
    --text: #eceef3; --text-dim: #9ba2b0; --text-faint: #646c7a; --amber: #f2ab43; --alta: #f25f55; --blue: #5b97ff; --good: #3ecf6a;
    font-family: 'Geist', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: radial-gradient(1200px 600px at 50% -10%, rgba(242,171,67,0.07), transparent 60%), var(--bg);
    display: flex; align-items: center; justify-content: center;
    height: 100vh; height: 100dvh; min-height: 480px; color: var(--text);
  }
  .mono { font-variant-numeric: tabular-nums; }
  .boot-msg { color: var(--text-faint); font-size: 14px; }

  .boot-screen * { box-sizing: border-box; }
  .boot-screen button, .boot-screen input { font-family: inherit; }
  .auth-card { width: 360px; background: var(--surface); border: 1px solid var(--border); border-radius: 18px; padding: 32px 30px 28px; box-shadow: 0 30px 80px -20px rgba(0,0,0,0.7); }
  .brand { display: flex; align-items: center; gap: 8px; font-weight: 600; font-size: 17.5px; color: var(--text); margin-bottom: 20px; }
  .brand-dot { width: 9px; height: 9px; border-radius: 3px; background: var(--amber); box-shadow: 0 0 0 3px rgba(242,171,67,0.16); transform: rotate(45deg); }

  .auth-divider { display: flex; align-items: center; gap: 10px; margin: 18px 0; color: var(--text-faint); font-size: 11.5px; }
  .auth-divider::before, .auth-divider::after { content: ""; flex: 1; height: 1px; background: var(--border); }

  .auth-input {
    width: 100%; background: var(--surface-2); border: 1px solid var(--border); border-radius: 10px;
    padding: 11px 13px; color: var(--text); font-size: 14px; outline: none; margin-bottom: 10px; transition: border-color .12s;
  }
  .auth-input:focus { border-color: rgba(242,171,67,0.5); }
  .auth-error { font-size: 12.5px; color: var(--alta); margin-bottom: 10px; line-height: 1.5; }
  .auth-notice { font-size: 12.5px; color: var(--blue); margin-bottom: 10px; line-height: 1.5; }

  .auth-btn {
    width: 100%; background: var(--amber); color: #1b1304; border: none; border-radius: 10px;
    padding: 12px; font-size: 14px; font-weight: 650; cursor: pointer;
  }
  .auth-btn:hover { filter: brightness(1.08); }
  .auth-btn:disabled { opacity: 0.6; cursor: default; }

  .auth-switch { width: 100%; background: none; border: none; color: var(--text-dim); font-size: 12.5px; padding: 12px 0 0; cursor: pointer; }
  .auth-switch:hover { color: var(--text); }

  .auth-guest-btn {
    width: 100%; padding: 10px; border-radius: 9px; border: 1px dashed var(--border); background: none;
    color: var(--text-dim); font-size: 13px; cursor: pointer;
  }
  .auth-guest-btn:hover { color: var(--text); border-color: var(--text-faint); }
  .auth-guest-hint { font-size: 11px; color: var(--text-faint); text-align: center; margin-top: 8px; line-height: 1.4; }
  .modal-text { font-size: 13px; color: var(--text-dim); line-height: 1.55; }
`;

const seedTasks = [];

// ---------- UI atoms ----------

function IconBtn({ icon: Icon, label, onClick, active }) {
  return (
    <button className={`iconbtn ${active ? "iconbtn--active" : ""}`} onClick={onClick} title={label}>
      <Icon size={15} strokeWidth={2} />
      <span>{label}</span>
    </button>
  );
}

function PriorityBadge({ value, onClick }) {
  return (
    <button className={`badge badge--priority badge--${value}`} onClick={onClick}>
      {value}
    </button>
  );
}

function StatusPill({ value, onClick }) {
  const Icon = STATUS_ICON[value];
  return (
    <button className={`pill pill--${value.replace(" ", "")}`} onClick={onClick}>
      <Icon size={13} strokeWidth={2.2} />
      {value}
    </button>
  );
}

function DateField({ value, onChange, overdue, weekStartsSunday }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  const [cursor, setCursor] = useState(() => {
    if (value) {
      const [y, m] = value.split("-").map(Number);
      return { year: y, month: m - 1 };
    }
    const t = new Date();
    return { year: t.getFullYear(), month: t.getMonth() };
  });
  const grid = useMemo(() => buildMonthGrid(cursor.year, cursor.month, weekStartsSunday), [cursor, weekStartsSunday]);
  const weekdayLabels = weekStartsSunday ? WEEKDAY_LABELS_SUN_FIRST : WEEKDAY_LABELS;

  const POP_W = 220;
  const POP_H = 300;

  function openPicker() {
    const rect = btnRef.current.getBoundingClientRect();
    let left = rect.left;
    let top = rect.bottom + 6;
    if (left + POP_W > window.innerWidth - 8) left = window.innerWidth - POP_W - 8;
    if (left < 8) left = 8;
    if (top + POP_H > window.innerHeight - 8) top = rect.top - POP_H - 6;
    if (top < 8) top = 8;
    setPos({ top, left });
    setOpen(true);
  }

  function changeMonth(delta) {
    setCursor((c) => {
      let month = c.month + delta, year = c.year;
      if (month < 0) { month = 11; year -= 1; }
      if (month > 11) { month = 0; year += 1; }
      return { year, month };
    });
  }

  function pick(iso) {
    onChange(iso);
    setOpen(false);
  }

  return (
    <span className="datefield">
      <button
        ref={btnRef}
        type="button"
        className={`datefield-btn ${!value ? "datefield-btn--empty" : ""} ${overdue ? "datefield-btn--overdue" : ""}`}
        onClick={openPicker}
      >
        {value ? fmtDate(value) : "dd/mm/aaaa"}
      </button>
      {open && pos && createPortal(
        <>
          <div className="popover-scrim" onClick={() => setOpen(false)} />
          <div className="datefield-pop" style={{ top: pos.top, left: pos.left }} onClick={(e) => e.stopPropagation()}>
            <div className="datefield-pop-head">
              <button type="button" className="cal-nav-btn" onClick={() => changeMonth(-1)}><ChevronLeft size={13} /></button>
              <span className="datefield-pop-label">{MONTH_LABELS[cursor.month]} {cursor.year}</span>
              <button type="button" className="cal-nav-btn" onClick={() => changeMonth(1)}><ChevronRight size={13} /></button>
            </div>
            <div className="datefield-grid">
              {weekdayLabels.map((w) => <div key={w} className="datefield-wd">{w[0]}</div>)}
              {grid.map((cell) => (
                <button
                  type="button"
                  key={cell.iso}
                  className={`datefield-day ${!cell.inMonth ? "datefield-day--out" : ""} ${cell.iso === value ? "datefield-day--selected" : ""} ${cell.iso === todayISO() ? "datefield-day--today" : ""}`}
                  onClick={() => pick(cell.iso)}
                >
                  {cell.day}
                </button>
              ))}
            </div>
            <div className="datefield-pop-actions">
              <button type="button" className="datefield-action" onClick={() => pick(todayISO())}>Hoy</button>
              <button type="button" className="datefield-action" onClick={() => pick(null)}>Limpiar</button>
            </div>
          </div>
        </>,
        document.body
      )}
    </span>
  );
}

function QuickAddRow({ placeholder, onAdd, indent, general }) {
  const [active, setActive] = useState(false);
  const [val, setVal] = useState("");
  function submit() {
    const clean = val.trim();
    if (!clean) { setActive(false); setVal(""); return; }
    onAdd(clean);
    setVal("");
  }
  if (!active) {
    return (
      <div
        className={`quick-add-row quick-add-row--ghost ${indent ? "quick-add-row--indent" : ""}`}
        onClick={() => { setVal(""); setActive(true); }}
        title={general ? "Agregar tarea general (sin proyecto)" : "Agregar tarea"}
      />
    );
  }
  return (
    <div className={`quick-add-row ${indent ? "quick-add-row--indent" : ""}`}>
      <input
        autoFocus
        type="text"
        className="quick-add-input"
        placeholder={placeholder || (general ? "Nueva tarea general" : "Nueva tarea")}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); submit(); }
          if (e.key === "Escape") { setActive(false); setVal(""); }
        }}
        onBlur={() => { setActive(false); setVal(""); }}
      />
    </div>
  );
}

// ---------- main component ----------

export default function TaskApp() {
  const [areas, setAreas] = useState(seedAreas);
  const [tasks, setTasks] = useState(seedTasks);

  // ---- auth ----
  const [session, setSession] = useState(null);
  const [authView, setAuthView] = useState("login"); // login | signup
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authNotice, setAuthNotice] = useState("");

  // ---- client-side (zero-knowledge) encryption ----
  const encryptionKeyRef = useRef(null); // CryptoKey, in-memory only, never persisted
  const encSaltRef = useRef(null); // this user's salt (not secret, just needs to stay consistent)
  const pendingRowsRef = useRef(null); // fetched task_kv rows while waiting to unlock
  const pendingSaltRef = useRef(null);
  const pendingLegacyEnvelopeRef = useRef(null); // old single-blob envelope, only during one-time migration
  const [encPass, setEncPass] = useState("");
  const [encPass2, setEncPass2] = useState("");
  const [encError, setEncError] = useState("");
  const [encBusy, setEncBusy] = useState(false);
  const [isEncrypted, setIsEncrypted] = useState(false);

  // ---- mobile: separate drill-down navigation (areas -> area -> task) ----
  const [isMobile, setIsMobile] = useState(() => (typeof window !== "undefined" ? window.innerWidth <= 820 : false));
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 820px)");
    const onChange = () => setIsMobile(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  const [mobileScreen, setMobileScreen] = useState(() => (loadLocalPrefs().mobileScreen === "area" ? "area" : "areas")); // areas | area | task | quickadd
  const [mobileAreaId, setMobileAreaId] = useState(() => loadLocalPrefs().mobileAreaId || null);
  const [mobileTaskId, setMobileTaskId] = useState(null);
  const [mobileExpandedFilter, setMobileExpandedFilter] = useState(null); // null | "pendientes" | "vencidas"
  const [mobileSearch, setMobileSearch] = useState("");
  const [mobileAddingArea, setMobileAddingArea] = useState(false);
  const [mobileNewAreaName, setMobileNewAreaName] = useState("");
  const [mobileAddingProjectAreaId, setMobileAddingProjectAreaId] = useState(null);
  const [mobileNewProjectName, setMobileNewProjectName] = useState("");
  const [mobileQuickAddAreaId, setMobileQuickAddAreaId] = useState(null);
  const [mobileQuickAddText, setMobileQuickAddText] = useState("");
  const mobileSwipeRef = useRef({ x: 0, y: 0, tracking: false });
  const [mobileCompletingIds, setMobileCompletingIds] = useState(() => new Set());
  const [mobileRevealedTaskId, setMobileRevealedTaskId] = useState(null);
  const [mobileRevealedAreaId, setMobileRevealedAreaId] = useState(null);
  const [mobileQuickAddProjectId, setMobileQuickAddProjectId] = useState(null);
  const [mobileDraggingTaskId, setMobileDraggingTaskId] = useState(null);
  useEffect(() => {
    if (!mobileDraggingTaskId) return;
    function blockScroll(e) { e.preventDefault(); }
    document.addEventListener("touchmove", blockScroll, { passive: false });
    return () => document.removeEventListener("touchmove", blockScroll);
  }, [mobileDraggingTaskId]);
  const [mobileCollapsedProjects, setMobileCollapsedProjects] = useState(() => new Set(loadLocalPrefs().mobileCollapsedProjects || []));
  const [mobileInlineAddKey, setMobileInlineAddKey] = useState(null); // "areaId:projectId" or "areaId:general"
  const [mobileInlineAddText, setMobileInlineAddText] = useState("");
  const [mobileDragOffsetY, setMobileDragOffsetY] = useState(0);
  const [mobileDropTarget, setMobileDropTarget] = useState(null); // { id, position: "before" | "after" } | null
  const mobileLongPressRef = useRef({ timer: null, x: 0, y: 0, taskId: null, lastOverKey: null });
  const statusClickGuardRef = useRef({ id: null, time: 0 });
  const [showEncSettings, setShowEncSettings] = useState(false);
  const [encSettingsView, setEncSettingsView] = useState("status"); // status | disable-confirm | enable

  // ---- Supabase persistence (direct, real-time) ----
  const [bootStatus, setBootStatus] = useState("checking-session"); // checking-session | auth | loading | ready
  const [lastSyncAt, setLastSyncAt] = useState(null);
  const [saving, setSaving] = useState(false);
  const [syncError, setSyncError] = useState(false);
  const saveRetryRef = useRef({ attempt: 0, timer: null });
  const hasLoadedRef = useRef(false);
  const lastWriteAtRef = useRef(new Map()); // rowKey -> ms, echo-guard per row
  const areasSnapshotRef = useRef("[]"); // last-saved areas JSON, for diffing
  const taskSnapshotsRef = useRef(new Map()); // taskId -> last-saved JSON, for diffing

  const [selectedAreaId, setSelectedAreaId] = useState(() => loadLocalPrefs().selectedAreaId || "all");
  const [selectedProjectId, setSelectedProjectId] = useState(() => loadLocalPrefs().selectedProjectId || null);
  const [hideCompleted, setHideCompleted] = useState(true);
  const [desktopExpandedFilter, setDesktopExpandedFilter] = useState(() => loadLocalPrefs().desktopExpandedFilter || null); // null | "pendientes" | "vencidas"
  const viewBeforeFilterRef = useRef(null);

  function toggleDesktopExpandedFilter(kind) {
    setDesktopExpandedFilter((f) => {
      if (f === kind) {
        // turning off — go back to whatever view was active before
        if (viewBeforeFilterRef.current) setView(viewBeforeFilterRef.current);
        viewBeforeFilterRef.current = null;
        return null;
      }
      if (f === null) viewBeforeFilterRef.current = view; // first time activating — remember where we were
      setView("lista");
      return kind;
    });
  }
  const [appLang, setAppLang] = useState(() => loadLocalPrefs().appLang || "es");
  const [weekStartsSunday, setWeekStartsSunday] = useState(() => !!loadLocalPrefs().weekStartsSunday);
  const [holidayCountry, setHolidayCountry] = useState(() => loadLocalPrefs().holidayCountry || "AR");
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("texto");
  const [freeText, setFreeText] = useState("");
  const [collapsed, setCollapsed] = useState(() => loadLocalPrefs().collapsed || {});
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [editingTitleId, setEditingTitleId] = useState(null);
  const freshTaskIdRef = useRef(null);
  const titleKeyHandledRef = useRef(null);
  const focusEndRef = useRef(false);
  const areaKeyHandledRef = useRef(false);
  const projectKeyHandledRef = useRef(false);
  const inlineAddEscapedRef = useRef(false);
  const mobileScreenTapRef = useRef(false);

  const [manualTitle, setManualTitle] = useState("");
  const [manualArea, setManualArea] = useState("");
  const [manualProjectId, setManualProjectId] = useState("");
  const [toast, setToast] = useState("");

  const [renamingAreaId, setRenamingAreaId] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [addingArea, setAddingArea] = useState(false);
  const [newAreaName, setNewAreaName] = useState("");
  const [colorPickerAreaId, setColorPickerAreaId] = useState(null);
  const [areaFilterMode, setAreaFilterMode] = useState(() => loadLocalPrefs().areaFilterMode || "off"); // "off" | "solo" | "mute"

  const [addingProjectAreaId, setAddingProjectAreaId] = useState(null);
  const [newProjectName, setNewProjectName] = useState("");
  const [renamingProjectId, setRenamingProjectId] = useState(null);
  const [renameProjectAreaId, setRenameProjectAreaId] = useState(null);
  const [renameProjectValue, setRenameProjectValue] = useState("");
  const [collapsedProjects, setCollapsedProjects] = useState(() => loadLocalPrefs().collapsedProjects || {});
  const [panelAddingProjectAreaId, setPanelAddingProjectAreaId] = useState(null);
  const [panelNewProjectName, setPanelNewProjectName] = useState("");
  const [panelAddingArea, setPanelAddingArea] = useState(false);
  const [panelNewAreaName, setPanelNewAreaName] = useState("");

  const [draggedTaskId, setDraggedTaskId] = useState(null);
  const [dragOverKey, setDragOverKey] = useState(null);
  const [urgentIndex, setUrgentIndex] = useState(0);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [showNotifPanel, setShowNotifPanel] = useState(false);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [confirmingWipe, setConfirmingWipe] = useState(false);
  const restoreInputRef = useRef(null);

  const [deleteTarget, setDeleteTarget] = useState(null); // { type: 'area'|'project', id, areaId? }

  const [view, setView] = useState(() => {
    const saved = loadLocalPrefs().view;
    return saved === "calendario" || saved === "prioridad" ? saved : "lista";
  });
  const [calView, setCalView] = useState(() => {
    const saved = loadLocalPrefs().calView;
    return saved === "semana" || saved === "dia" ? saved : "mes";
  });
  const [calCursor, setCalCursor] = useState(() => {
    const t = new Date();
    return { year: t.getFullYear(), month: t.getMonth() };
  });
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [pickerYear, setPickerYear] = useState(() => new Date().getFullYear());
  const monthPickerRef = useRef(null);
  const [weekAnchor, setWeekAnchor] = useState(todayISO());
  const [dayAnchor, setDayAnchor] = useState(todayISO());
  const [selectedDay, setSelectedDay] = useState(todayISO());
  const [dayQuickTitle, setDayQuickTitle] = useState("");
  // ---- calendar interactions (drag to reschedule, popovers, inline add) ----
  const [calDragTaskId, setCalDragTaskId] = useState(null);
  const [calDropTarget, setCalDropTarget] = useState(null); // iso | "undated"
  const [calPopover, setCalPopover] = useState(null); // { kind: "task"|"day", id, x, y }
  const [calAddDay, setCalAddDay] = useState(null);
  const [calAddText, setCalAddText] = useState("");
  const [calUndatedOpen, setCalUndatedOpen] = useState(() => loadLocalPrefs().calUndatedOpen !== false);
  const [calPopTitle, setCalPopTitle] = useState("");

  const noteInputRef = useRef(null);
  const newAreaInputRef = useRef(null);
  const renameInputRef = useRef(null);
  const newProjectInputRef = useRef(null);
  const renameProjectInputRef = useRef(null);
  const panelNewProjectInputRef = useRef(null);
  const panelNewAreaInputRef = useRef(null);

  // ---- auth: watch the session; load/reset app data whenever it changes ----
  useEffect(() => {
    let cancelled = false;

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      setBootStatus(data.session ? "loading" : "auth");
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (event === "TOKEN_REFRESHED") {
        // Same user, just a renewed access token (this fires whenever a
        // background tab regains focus, among other times) — nothing about
        // our loaded/unlocked state actually changed, so don't touch it.
        return;
      }
      setSession(newSession);
      if (!newSession) {
        hasLoadedRef.current = false;
        encryptionKeyRef.current = null;
        encSaltRef.current = null;
        pendingRowsRef.current = null;
        pendingSaltRef.current = null;
        pendingLegacyEnvelopeRef.current = null;
        lastWriteAtRef.current = new Map();
        areasSnapshotRef.current = "[]";
        taskSnapshotsRef.current = new Map();
        setEncPass(""); setEncPass2(""); setEncError("");
        setAreas([]);
        setTasks([]);
        setBootStatus("auth");
      } else if (bootStatus !== "ready" || !hasLoadedRef.current) {
        setBootStatus("loading");
      }
    });

    return () => { cancelled = true; sub.subscription.unsubscribe(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- per-row storage helpers (mirrors Gastos App: one row per piece of
  // data, not one big blob) ----
  function looksEncryptedValue(raw) {
    if (typeof raw !== "string" || !raw.startsWith("{")) return false;
    try {
      const p = JSON.parse(raw);
      return !!(p && p.__enc && p.iv && p.ciphertext);
    } catch {
      return false;
    }
  }

  async function encryptRowValue(key, obj) {
    return JSON.stringify({ __enc: true, ...(await encryptPayload(key, obj)) });
  }

  async function getRowValue(row, key) {
    if (looksEncryptedValue(row.value)) {
      if (!key) return undefined; // locked — skip, next unlock will resync
      try {
        return await decryptPayload(key, JSON.parse(row.value));
      } catch {
        return undefined;
      }
    }
    try {
      return JSON.parse(row.value);
    } catch {
      return undefined;
    }
  }

  function taskRowKey(id) {
    return `task:${id}`;
  }

  // ---- load current data for this user, then stay live via realtime ----
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    const userId = session.user.id;

    async function migrateLegacyBlobIfNeeded() {
      // One-time: older sessions stored everything as a single row in
      // app_data. If this user has never been split into task_kv rows yet,
      // pull that legacy row in and fan it out into per-row storage.
      const { data: legacyRow } = await supabase.from("app_data").select("data,updated_at").maybeSingle();
      if (!legacyRow || !legacyRow.data) return { migratedAreas: null, migratedTasks: null, needsUnlock: false, legacyEnvelope: null };
      if (legacyRow.data.encrypted) {
        return { migratedAreas: null, migratedTasks: null, needsUnlock: true, legacyEnvelope: legacyRow.data };
      }
      return {
        migratedAreas: legacyRow.data.areas || [],
        migratedTasks: legacyRow.data.tasks || [],
        needsUnlock: false,
        legacyEnvelope: null,
      };
    }

    async function writeRowsForMigration(areasVal, tasksVal, key, salt) {
      const rows = [];
      const areasValue = key ? await encryptRowValue(key, areasVal) : JSON.stringify(areasVal);
      rows.push({ user_id: userId, key: "areas", value: areasValue, updated_at: new Date().toISOString() });
      for (const t of tasksVal) {
        const value = key ? await encryptRowValue(key, t) : JSON.stringify(t);
        rows.push({ user_id: userId, key: taskRowKey(t.id), value, updated_at: new Date().toISOString() });
      }
      if (key && salt) {
        rows.push({ user_id: userId, key: "__enc_meta__", value: JSON.stringify({ encrypted: true, salt }), updated_at: new Date().toISOString() });
      }
      if (rows.length) await supabase.from("task_kv").upsert(rows, { onConflict: "user_id,key" });
    }

    function applyRows(rows, key) {
      return (async () => {
        let newAreas = [];
        const tasksArr = [];
        for (const row of rows) {
          if (row.key === "__enc_meta__") continue;
          const value = await getRowValue(row, key);
          if (value === undefined) continue;
          if (row.key === "areas") newAreas = value || [];
          else if (row.key.startsWith("task:")) tasksArr.push(value);
        }
        tasksArr.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        setAreas(newAreas);
        setTasks(tasksArr);
        areasSnapshotRef.current = JSON.stringify(newAreas);
        taskSnapshotsRef.current = new Map(tasksArr.map((t) => [t.id, JSON.stringify(t)]));
      })();
    }

    async function load() {
      const { data: rows, error } = await supabase.from("task_kv").select("key,value,updated_at");
      if (cancelled) return;
      if (error) {
        console.error(error);
        showToast("No se pudo conectar con Supabase");
        return;
      }

      const hasAnyRow = rows && rows.length > 0;
      if (!hasAnyRow) {
        const legacy = await migrateLegacyBlobIfNeeded();
        if (cancelled) return;
        if (legacy.needsUnlock) {
          pendingLegacyEnvelopeRef.current = legacy.legacyEnvelope;
          setBootStatus("enc-unlock");
          return;
        }
        if (legacy.migratedAreas) {
          await writeRowsForMigration(legacy.migratedAreas, legacy.migratedTasks, null, null);
          setAreas(legacy.migratedAreas);
          setTasks(legacy.migratedTasks);
          areasSnapshotRef.current = JSON.stringify(legacy.migratedAreas);
          taskSnapshotsRef.current = new Map(legacy.migratedTasks.map((t) => [t.id, JSON.stringify(t)]));
        } else {
          setAreas([]);
          setTasks([]);
          areasSnapshotRef.current = JSON.stringify([]);
          taskSnapshotsRef.current = new Map();
        }
        setIsEncrypted(false);
        hasLoadedRef.current = true;
        setBootStatus("ready");
        return;
      }

      const metaRow = rows.find((r) => r.key === "__enc_meta__");
      let meta = { encrypted: false };
      if (metaRow) {
        try { meta = JSON.parse(metaRow.value); } catch { meta = { encrypted: false }; }
      }
      setIsEncrypted(!!meta.encrypted);
      if (meta.encrypted) {
        if (encryptionKeyRef.current) {
          await applyRows(rows, encryptionKeyRef.current);
          hasLoadedRef.current = true;
          setBootStatus("ready");
          return;
        }
        pendingRowsRef.current = rows;
        pendingSaltRef.current = meta.salt;
        setBootStatus("enc-unlock");
        return;
      }
      await applyRows(rows, null);
      hasLoadedRef.current = true;
      setBootStatus("ready");
    }
    load();

    async function resyncNow() {
      if (cancelled || !hasLoadedRef.current) return;
      const { data: rows, error } = await supabase.from("task_kv").select("key,value,updated_at");
      if (error || cancelled || !rows) return;
      if (encryptionKeyRef.current == null && rows.some((r) => r.key !== "__enc_meta__" && looksEncryptedValue(r.value))) return; // locked
      await applyRows(rows, encryptionKeyRef.current);
      for (const row of rows) {
        const ts = new Date(row.updated_at).getTime();
        if (ts > (lastWriteAtRef.current.get(row.key) || 0)) lastWriteAtRef.current.set(row.key, ts);
      }
      setLastSyncAt(Date.now());
    }

    const channel = supabase
      .channel(`task_kv_changes_${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "task_kv", filter: `user_id=eq.${userId}` },
        async (payload) => {
          const row = payload.new;
          if (!row || !row.updated_at || row.key === "__enc_meta__") return; // deletes (no .new) resolve on next resync
          const ts = new Date(row.updated_at).getTime();
          if (ts <= (lastWriteAtRef.current.get(row.key) || 0)) return; // our own echo or stale
          lastWriteAtRef.current.set(row.key, ts);
          const value = await getRowValue(row, encryptionKeyRef.current);
          if (value === undefined) return; // locked; next unlock resyncs everything
          if (row.key === "areas") {
            setAreas(value || []);
            areasSnapshotRef.current = JSON.stringify(value || []);
          } else if (row.key.startsWith("task:")) {
            const id = row.key.slice(5);
            setTasks((prev) => {
              const idx = prev.findIndex((t) => t.id === id);
              if (idx === -1) return [...prev, value];
              const copy = [...prev];
              copy[idx] = value;
              return copy;
            });
            taskSnapshotsRef.current.set(id, JSON.stringify(value));
          }
          setLastSyncAt(ts);
        }
      )
      .subscribe();

    // Mobile browsers routinely suspend or silently drop an idle WebSocket
    // in the background, and the realtime handler above only reacts to
    // inserts/updates (matching Gastos App — deletes resolve here instead).
    // Actively re-check whenever the tab/app regains focus, and on a short
    // interval while it's open.
    function onVisible() { if (document.visibilityState === "visible") resyncNow(); }
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    const pollId = setInterval(resyncNow, 15000);

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      clearInterval(pollId);
    };
  }, [session]);

  async function handleEncSetup() {
    setEncError("");
    if (encPass.length < 8) { setEncError("Usá al menos 8 caracteres."); return; }
    if (encPass !== encPass2) { setEncError("Las contraseñas no coinciden."); return; }
    if (!window.isSecureContext || !window.crypto?.subtle) {
      setEncError("El cifrado necesita HTTPS (o localhost). Esta página no cumple ese requisito.");
      return;
    }
    setEncBusy(true);
    try {
      const salt = bytesToB64(randomBytes(16));
      const key = await deriveKeyFromPassphrase(encPass, salt);
      const updatedAt = new Date().toISOString();
      const rows = [
        { user_id: session.user.id, key: "areas", value: await encryptRowValue(key, areas), updated_at: updatedAt },
        ...(await Promise.all(tasks.map(async (t) => ({
          user_id: session.user.id, key: taskRowKey(t.id), value: await encryptRowValue(key, t), updated_at: updatedAt,
        })))),
        { user_id: session.user.id, key: "__enc_meta__", value: JSON.stringify({ encrypted: true, salt }), updated_at: updatedAt },
      ];
      for (const r of rows) lastWriteAtRef.current.set(r.key, new Date(updatedAt).getTime());
      const { error } = await supabase.from("task_kv").upsert(rows, { onConflict: "user_id,key" });
      if (error) throw error;
      encryptionKeyRef.current = key;
      encSaltRef.current = salt;
      areasSnapshotRef.current = JSON.stringify(areas);
      taskSnapshotsRef.current = new Map(tasks.map((t) => [t.id, JSON.stringify(t)]));
      setLastSyncAt(new Date(updatedAt).getTime());
      setEncPass(""); setEncPass2("");
      setIsEncrypted(true);
      setShowEncSettings(false);
      setEncSettingsView("status");
      hasLoadedRef.current = true;
      setBootStatus("ready");
      showToast("Cifrado activado");
    } catch (err) {
      console.error("handleEncSetup", err);
      setEncError("No se pudo activar el cifrado: " + String(err.message || err));
    } finally {
      setEncBusy(false);
    }
  }

  async function handleEncUnlock() {
    setEncError("");
    if (!encPass) { setEncError("Ingresá tu contraseña de cifrado."); return; }
    setEncBusy(true);
    try {
      // Legacy single-blob migration path: decrypt the old envelope once,
      // then fan it out into per-row storage using this same passphrase.
      if (pendingLegacyEnvelopeRef.current) {
        const envelope = pendingLegacyEnvelopeRef.current;
        const key = await deriveKeyFromPassphrase(encPass, envelope.salt);
        const data = await decryptPayload(key, envelope);
        const areasVal = data.areas || [];
        const tasksVal = data.tasks || [];
        const updatedAt = new Date().toISOString();
        const rows = [
          { user_id: session.user.id, key: "areas", value: await encryptRowValue(key, areasVal), updated_at: updatedAt },
          ...(await Promise.all(tasksVal.map(async (t) => ({
            user_id: session.user.id, key: taskRowKey(t.id), value: await encryptRowValue(key, t), updated_at: updatedAt,
          })))),
          { user_id: session.user.id, key: "__enc_meta__", value: JSON.stringify({ encrypted: true, salt: envelope.salt }), updated_at: updatedAt },
        ];
        for (const r of rows) lastWriteAtRef.current.set(r.key, new Date(updatedAt).getTime());
        await supabase.from("task_kv").upsert(rows, { onConflict: "user_id,key" });
        encryptionKeyRef.current = key;
        encSaltRef.current = envelope.salt;
        setAreas(areasVal);
        setTasks(tasksVal);
        areasSnapshotRef.current = JSON.stringify(areasVal);
        taskSnapshotsRef.current = new Map(tasksVal.map((t) => [t.id, JSON.stringify(t)]));
        pendingLegacyEnvelopeRef.current = null;
        setEncPass("");
        setIsEncrypted(true);
        hasLoadedRef.current = true;
        setBootStatus("ready");
        return;
      }

      const rows = pendingRowsRef.current || [];
      const key = await deriveKeyFromPassphrase(encPass, pendingSaltRef.current);
      let newAreas = [];
      const tasksArr = [];
      let verifiedOne = false;
      for (const row of rows) {
        if (row.key === "__enc_meta__") continue;
        const value = await decryptPayload(key, JSON.parse(row.value)); // throws on wrong password
        verifiedOne = true;
        if (row.key === "areas") newAreas = value || [];
        else if (row.key.startsWith("task:")) tasksArr.push(value);
      }
      encryptionKeyRef.current = key;
      encSaltRef.current = pendingSaltRef.current;
      setAreas(newAreas);
      setTasks(tasksArr);
      areasSnapshotRef.current = JSON.stringify(newAreas);
      taskSnapshotsRef.current = new Map(tasksArr.map((t) => [t.id, JSON.stringify(t)]));
      setEncPass("");
      setIsEncrypted(true);
      hasLoadedRef.current = true;
      setBootStatus("ready");
    } catch (err) {
      console.error("handleEncUnlock", err);
      setEncError(err?.name === "OperationError" ? "Contraseña incorrecta." : "No se pudo desbloquear: " + String(err.message || err));
    } finally {
      setEncBusy(false);
    }
  }

  async function handleDisableEncryption() {
    setEncError("");
    if (!encPass) { setEncError("Ingresá tu contraseña de cifrado actual."); return; }
    setEncBusy(true);
    try {
      const { data: rows, error: fetchErr } = await supabase.from("task_kv").select("key,value");
      if (fetchErr || !rows) throw new Error("no-rows");
      const someEncrypted = rows.find((r) => r.key !== "__enc_meta__" && looksEncryptedValue(r.value));
      const testKey = await deriveKeyFromPassphrase(encPass, encSaltRef.current);
      if (someEncrypted) await decryptPayload(testKey, JSON.parse(someEncrypted.value)); // throws if wrong

      const updatedAt = new Date().toISOString();
      const writeRows = [
        { user_id: session.user.id, key: "areas", value: JSON.stringify(areas), updated_at: updatedAt },
        ...tasks.map((t) => ({ user_id: session.user.id, key: taskRowKey(t.id), value: JSON.stringify(t), updated_at: updatedAt })),
        { user_id: session.user.id, key: "__enc_meta__", value: JSON.stringify({ encrypted: false }), updated_at: updatedAt },
      ];
      for (const r of writeRows) lastWriteAtRef.current.set(r.key, new Date(updatedAt).getTime());
      const { error } = await supabase.from("task_kv").upsert(writeRows, { onConflict: "user_id,key" });
      if (error) throw error;

      encryptionKeyRef.current = null;
      encSaltRef.current = null;
      areasSnapshotRef.current = JSON.stringify(areas);
      taskSnapshotsRef.current = new Map(tasks.map((t) => [t.id, JSON.stringify(t)]));
      setLastSyncAt(new Date(updatedAt).getTime());
      setIsEncrypted(false);
      setEncPass("");
      setShowEncSettings(false);
      setEncSettingsView("status");
      showToast("Cifrado desactivado");
    } catch (err) {
      console.error("handleDisableEncryption", err);
      setEncError(err?.name === "OperationError" ? "Contraseña incorrecta." : "No se pudo desactivar: " + String(err.message || err));
    } finally {
      setEncBusy(false);
    }
  }

  function closeEncSettings() {
    setShowEncSettings(false);
    setEncSettingsView("status");
    setEncPass(""); setEncPass2(""); setEncError("");
  }

  const forceImmediateSaveRef = useRef(false);

  // ---- autosave (debounced); diffs against the last-saved snapshot and
  // sends only the rows that actually changed, instead of one big blob ----
  useEffect(() => {
    if (!session || !hasLoadedRef.current || bootStatus !== "ready") return;
    const delay = forceImmediateSaveRef.current ? 0 : 150;
    forceImmediateSaveRef.current = false;
    const id = setTimeout(() => { saveDiff(); }, delay);
    return () => clearTimeout(id);
  }, [areas, tasks, bootStatus, session]);

  const savingLockRef = useRef(false);
  const savePendingRef = useRef(false);

  async function saveDiff() {
    if (savingLockRef.current) { savePendingRef.current = true; return; }
    savingLockRef.current = true;
    try {
    clearTimeout(saveRetryRef.current.timer);
    setSaving(true);
    try {
      const key = encryptionKeyRef.current;
      const updatedAt = new Date().toISOString();
      const writes = [];
      const deleteKeys = [];

      const areasJson = JSON.stringify(areasRef.current);
      if (areasJson !== areasSnapshotRef.current) {
        writes.push({ rowKey: "areas", value: key ? await encryptRowValue(key, areasRef.current) : areasJson });
      }

      const prevMap = taskSnapshotsRef.current;
      const currentIds = new Set();
      for (const t of tasksRef.current) {
        currentIds.add(t.id);
        const json = JSON.stringify(t);
        if (prevMap.get(t.id) !== json) {
          writes.push({ rowKey: taskRowKey(t.id), value: key ? await encryptRowValue(key, t) : json });
        }
      }
      for (const id of prevMap.keys()) {
        if (!currentIds.has(id)) deleteKeys.push(taskRowKey(id));
      }

      if (!writes.length && !deleteKeys.length) { setSaving(false); return; }

      for (const w of writes) lastWriteAtRef.current.set(w.rowKey, new Date(updatedAt).getTime());

      if (writes.length) {
        const { error } = await supabase.from("task_kv").upsert(
          writes.map((w) => ({ user_id: session.user.id, key: w.rowKey, value: w.value, updated_at: updatedAt })),
          { onConflict: "user_id,key" }
        );
        if (error) throw error;
      }
      if (deleteKeys.length) {
        const { error } = await supabase.from("task_kv").delete().eq("user_id", session.user.id).in("key", deleteKeys);
        if (error) throw error;
      }

      areasSnapshotRef.current = areasJson;
      for (const t of tasksRef.current) taskSnapshotsRef.current.set(t.id, JSON.stringify(t));
      for (const dk of deleteKeys) taskSnapshotsRef.current.delete(dk.slice(5));

      setLastSyncAt(new Date(updatedAt).getTime());
      setSyncError(false);
      saveRetryRef.current.attempt = 0;
    } catch (err) {
      console.error("autosave failed", err);
      setSyncError(true);
      const attempt = saveRetryRef.current.attempt + 1;
      saveRetryRef.current.attempt = attempt;
      const delay = Math.min(30000, 5000 * attempt);
      saveRetryRef.current.timer = setTimeout(() => { saveDiff(); }, delay);
    } finally {
      setSaving(false);
    }
    } finally {
      savingLockRef.current = false;
      if (savePendingRef.current) {
        savePendingRef.current = false;
        saveDiff(); // something changed while we were saving — catch up right away
      }
    }
  }


  function withTimeout(promise, ms = 12000, message = "Se agotó el tiempo de espera — revisá tu conexión a internet.") {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
    ]);
  }

  async function handleEmailSignIn() {
    setAuthError(""); setAuthNotice("");
    if (!authEmail.trim() || !authPassword) { setAuthError("Completá email y contraseña."); return; }
    setAuthBusy(true);
    try {
      const { error } = await withTimeout(supabase.auth.signInWithPassword({ email: authEmail.trim(), password: authPassword }));
      if (error) setAuthError(error.message);
    } catch (err) {
      setAuthError(String(err.message || err));
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleEmailSignUp() {
    setAuthError(""); setAuthNotice("");
    if (!authEmail.trim() || !authPassword) { setAuthError("Completá email y contraseña."); return; }
    if (authPassword.length < 6) { setAuthError("La contraseña necesita al menos 6 caracteres."); return; }
    setAuthBusy(true);
    try {
      const { data, error } = await withTimeout(supabase.auth.signUp({ email: authEmail.trim(), password: authPassword }));
      if (error) { setAuthError(error.message); return; }
      if (data.session) return; // confirmación de email desactivada: ya quedó logueado
      setAuthNotice("Te mandamos un mail para confirmar la cuenta — revisá tu bandeja de entrada.");
    } catch (err) {
      setAuthError(String(err.message || err));
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleGuestLogin() {
    setAuthError(""); setAuthNotice("");
    setAuthBusy(true);
    try {
      const { error } = await withTimeout(supabase.auth.signInAnonymously());
      if (error) setAuthError("No se pudo entrar como invitado — el proyecto necesita tener 'Anonymous sign-ins' activado en Supabase.");
    } catch (err) {
      setAuthError(String(err.message || err));
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
  }

  useEffect(() => {
    if (manualArea && !areas.some((a) => a.id === manualArea)) setManualArea("");
  }, [areas]);

  useEffect(() => { setManualProjectId(selectedProjectId || ""); }, [selectedAreaId, selectedProjectId]);

  useEffect(() => { if (addingArea) newAreaInputRef.current?.focus(); }, [addingArea]);
  useEffect(() => {
    if (renamingAreaId) { renameInputRef.current?.focus(); renameInputRef.current?.select(); }
  }, [renamingAreaId]);
  useEffect(() => { if (addingProjectAreaId) newProjectInputRef.current?.focus(); }, [addingProjectAreaId]);
  useEffect(() => { if (panelAddingProjectAreaId) panelNewProjectInputRef.current?.focus(); }, [panelAddingProjectAreaId]);
  useEffect(() => { if (panelAddingArea) panelNewAreaInputRef.current?.focus(); }, [panelAddingArea]);
  useEffect(() => {
    if (renamingProjectId) { renameProjectInputRef.current?.focus(); renameProjectInputRef.current?.select(); }
  }, [renamingProjectId]);

  const areaMap = useMemo(() => Object.fromEntries(areas.map((a) => [a.id, a])), [areas]);

  const tasksRef = useRef(tasks);
  const areasRef = useRef(areas);
  useEffect(() => { tasksRef.current = tasks; }, [tasks]);
  useEffect(() => { areasRef.current = areas; }, [areas]);

  useEffect(() => {
    saveLocalPrefs({ appLang, weekStartsSunday, holidayCountry, view, selectedAreaId, selectedProjectId, collapsedProjects, collapsed, calView, desktopExpandedFilter });
  }, [appLang, weekStartsSunday, holidayCountry, view, selectedAreaId, selectedProjectId, collapsedProjects, collapsed, calView, desktopExpandedFilter]);

  useEffect(() => {
    saveLocalPrefs({ areaFilterMode });
  }, [areaFilterMode]);

  useEffect(() => {
    saveLocalPrefs({ calUndatedOpen });
  }, [calUndatedOpen]);

  useEffect(() => {
    saveLocalPrefs({ mobileCollapsedProjects: Array.from(mobileCollapsedProjects) });
  }, [mobileCollapsedProjects]);

  useEffect(() => {
    // Only remember "areas" (nivel 1) or "area" (nivel 2) as a landing spot —
    // task detail and quickadd are transient, so falling back to the area
    // screen they were opened from makes more sense than reopening those.
    if (mobileScreen === "areas") {
      saveLocalPrefs({ mobileScreen: "areas", mobileAreaId: null });
    } else if (mobileAreaId) {
      saveLocalPrefs({ mobileScreen: "area", mobileAreaId });
    }
  }, [mobileScreen, mobileAreaId]);

  useEffect(() => {
    if (bootStatus !== "ready" || !hasLoadedRef.current) return;
    if (mobileAreaId && !areas.some((a) => a.id === mobileAreaId)) {
      setMobileAreaId(null);
      setMobileScreen("areas");
    }
    if (selectedAreaId !== "all" && !areas.some((a) => a.id === selectedAreaId)) {
      setSelectedAreaId("all");
    }
    if (selectedProjectId) {
      const owningArea = selectedAreaId !== "all" ? areas.find((a) => a.id === selectedAreaId) : null;
      if (!owningArea || !(owningArea.projects || []).some((p) => p.id === selectedProjectId)) {
        setSelectedProjectId(null);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootStatus, areas]);

  function isGeneralArea(area) {
    return !!area && area.name.trim().toLowerCase() === "general";
  }

  const orderedAreas = useMemo(() => {
    return [...areas].sort((a, b) => (isGeneralArea(a) ? -1 : 0) - (isGeneralArea(b) ? -1 : 0));
  }, [areas]);
  const visibleOrderedAreas = useMemo(() => {
    if (areaFilterMode === "solo") return orderedAreas.filter((a) => a.favorite);
    if (areaFilterMode === "mute") return orderedAreas.filter((a) => !a.favorite);
    return orderedAreas;
  }, [orderedAreas, areaFilterMode]);

  function toggleAreaFavorite(id) {
    setAreas((prev) => prev.map((a) => (a.id === id ? { ...a, favorite: !a.favorite } : a)));
  }

  const pendientes = tasks.filter((t) => t.status !== "Hecho" || mobileCompletingIds.has(t.id)).length;
  const vencidas = tasks.filter((t) => isOverdue(t.date, t.status) || mobileCompletingIds.has(t.id)).length;

  const areaCounts = useMemo(() => {
    const map = {};
    areas.forEach((a) => (map[a.id] = 0));
    tasks.forEach((t) => { if (t.status !== "Hecho") map[t.areaId] = (map[t.areaId] || 0) + 1; });
    return map;
  }, [tasks, areas]);

  const projectCounts = useMemo(() => {
    const map = {};
    tasks.forEach((t) => { if (t.projectId && t.status !== "Hecho") map[t.projectId] = (map[t.projectId] || 0) + 1; });
    return map;
  }, [tasks]);

  const visibleTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (selectedAreaId !== "all" && t.areaId !== selectedAreaId) return false;
      if (selectedAreaId !== "all" && selectedProjectId && t.projectId !== selectedProjectId) return false;
      if (hideCompleted && t.status === "Hecho" && !mobileCompletingIds.has(t.id)) return false;
      if (search.trim() && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
      if (areaFilterMode !== "off") {
        const taskArea = areaMap[t.areaId];
        const isFav = !!(taskArea && taskArea.favorite);
        if (areaFilterMode === "solo" && !isFav) return false;
        if (areaFilterMode === "mute" && isFav) return false;
      }
      return true;
    });
  }, [tasks, selectedAreaId, selectedProjectId, hideCompleted, search, mobileCompletingIds, areaFilterMode, areaMap]);

  const grouped = useMemo(() => {
    const isSearching = !!search.trim();
    const byArea = {};
    visibleTasks.forEach((t) => {
      if (!byArea[t.areaId]) byArea[t.areaId] = [];
      byArea[t.areaId].push(t);
    });
    const relevantAreas = selectedAreaId === "all" ? visibleOrderedAreas : orderedAreas.filter((a) => a.id === selectedAreaId);
    return relevantAreas
      .map((a) => {
        const allTasks = byArea[a.id] || [];
        const byProject = {};
        const noProject = [];
        allTasks.forEach((t) => {
          if (t.projectId) {
            if (!byProject[t.projectId]) byProject[t.projectId] = [];
            byProject[t.projectId].push(t);
          } else {
            noProject.push(t);
          }
        });
        let projectGroups = (a.projects || []).map((p) => ({ project: p, tasks: byProject[p.id] || [] }));
        if (isSearching) projectGroups = projectGroups.filter((g) => g.tasks.length > 0);
        return { area: a, allTasks, noProject, projectGroups };
      })
      .filter((g) => !isSearching || g.allTasks.length > 0);
  }, [visibleTasks, orderedAreas, visibleOrderedAreas, selectedAreaId, search]);

  const groupedByPriority = useMemo(() => {
    const buckets = { Alta: [], Media: [], Baja: [] };
    visibleTasks.forEach((t) => { (buckets[t.priority] || buckets.Media).push(t); });
    return ["Alta", "Media", "Baja"].map((priority) => ({ priority, tasks: buckets[priority] }));
  }, [visibleTasks]);

  const urgentItems = useMemo(() => {
    const today = todayISO();
    const tomorrow = addDaysISO(today, 1);
    const items = [];
    tasks.forEach((t) => { if (t.status !== "Hecho" && t.date && t.date < today) items.push({ task: t, kind: "vencida", label: "Vencida" }); });
    tasks.forEach((t) => { if (t.status !== "Hecho" && t.date === today) items.push({ task: t, kind: "hoy", label: "Hoy" }); });
    tasks.forEach((t) => { if (t.status !== "Hecho" && t.date === tomorrow) items.push({ task: t, kind: "manana", label: "Mañana" }); });
    return items;
  }, [tasks]);

  useEffect(() => {
    if (urgentItems.length === 0) return;
    setUrgentIndex((i) => (i >= urgentItems.length ? 0 : i));
    const id = setInterval(() => setUrgentIndex((i) => (i + 1) % urgentItems.length), 3000);
    return () => clearInterval(id);
  }, [urgentItems.length]);

  function fireUrgentNotification() {
    if (!notificationsEnabled || typeof Notification === "undefined") return;
    if (urgentItems.length === 0) return;
    const vencidas = urgentItems.filter((i) => i.kind === "vencida").length;
    const hoy = urgentItems.filter((i) => i.kind === "hoy").length;
    const manana = urgentItems.filter((i) => i.kind === "manana").length;
    const parts = [];
    if (vencidas) parts.push(`${vencidas} vencida${vencidas === 1 ? "" : "s"}`);
    if (hoy) parts.push(`${hoy} para hoy`);
    if (manana) parts.push(`${manana} para mañana`);
    try {
      new Notification("Task App", { body: `Tenés ${parts.join(", ")}.`, silent: false });
    } catch { /* not available outside Electron/a notification-capable browser */ }
  }

  useEffect(() => {
    if (!notificationsEnabled) return;
    fireUrgentNotification();
    const id = setInterval(fireUrgentNotification, 60 * 60 * 1000); // cada hora
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notificationsEnabled]);

  // Same filters the list view applies (área, proyecto, favoritas, búsqueda,
  // ocultar hechas), so the calendar never shows something the list hides.
  const calendarPasses = useCallback((t) => {
    if (selectedAreaId !== "all" && t.areaId !== selectedAreaId) return false;
    if (selectedAreaId !== "all" && selectedProjectId && t.projectId !== selectedProjectId) return false;
    if (hideCompleted && t.status === "Hecho") return false;
    if (search.trim() && !t.title.toLowerCase().includes(search.trim().toLowerCase())) return false;
    if (areaFilterMode !== "off") {
      const taskArea = areaMap[t.areaId];
      const isFav = !!(taskArea && taskArea.favorite);
      if (areaFilterMode === "solo" && !isFav) return false;
      if (areaFilterMode === "mute" && isFav) return false;
    }
    return true;
  }, [selectedAreaId, selectedProjectId, hideCompleted, search, areaFilterMode, areaMap]);

  const tasksByDate = useMemo(() => {
    const map = {};
    tasks.forEach((t) => {
      if (!t.date || !calendarPasses(t)) return;
      if (!map[t.date]) map[t.date] = [];
      map[t.date].push(t);
    });
    const rank = { Alta: 0, Media: 1, Baja: 2 };
    Object.values(map).forEach((list) => list.sort((a, b) => (
      (a.status === "Hecho") - (b.status === "Hecho")
      || (rank[a.priority] ?? 1) - (rank[b.priority] ?? 1)
      || (a.order ?? 0) - (b.order ?? 0)
    )));
    return map;
  }, [tasks, calendarPasses]);

  const undatedTasks = useMemo(
    () => tasks.filter((t) => !t.date && t.status !== "Hecho" && calendarPasses(t)),
    [tasks, calendarPasses]
  );

  const overdueBeforeToday = useMemo(() => {
    const today = todayISO();
    return tasks.filter((t) => t.date && t.date < today && t.status !== "Hecho" && calendarPasses(t))
      .sort((a, b) => (a.date < b.date ? -1 : 1));
  }, [tasks, calendarPasses]);

  const monthGrid = useMemo(() => buildMonthGrid(calCursor.year, calCursor.month, weekStartsSunday), [calCursor, weekStartsSunday]);
  const weekDays = useMemo(() => buildWeekDays(weekAnchor, weekStartsSunday), [weekAnchor, weekStartsSunday]);
  const focusedDate = selectedDay;

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(""), 2600);
  }

  function exportData() {
    const blob = new Blob([JSON.stringify({ areas, tasks }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "taskapp_backup_" + new Date().toISOString().slice(0, 10) + ".json";
    a.click();
    URL.revokeObjectURL(a.href);
    showToast("Backup descargado");
  }

  function restoreData(evt) {
    const file = evt.target.files[0];
    evt.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      let data;
      try { data = JSON.parse(e.target.result); } catch (err) { showToast("Archivo inválido"); return; }
      if (!Array.isArray(data.areas) || !Array.isArray(data.tasks)) { showToast("El archivo no tiene el formato esperado"); return; }
      setAreas(data.areas);
      setTasks(data.tasks);
      showToast("Datos restaurados");
    };
    reader.readAsText(file);
  }

  function wipeAllData() {
    setAreas([]);
    setTasks([]);
    setConfirmingWipe(false);
    showToast("Todo borrado");
  }

  function selectArea(id) {
    setSelectedAreaId(id);
    setSelectedProjectId(null);
  }

  function ensureArea(name) {
    const clean = name.trim();
    const existing = areas.find((a) => a.name.toLowerCase() === clean.toLowerCase());
    if (existing) return existing.id;
    const id = uid();
    setAreas((prev) => [...prev, { id, name: clean, color: nextColor(prev), projects: [] }]);
    return id;
  }

  function handleProcesar() {
    if (!freeText.trim()) return;
    const items = parseFreeTextLocal(freeText, { areas, selectedAreaId, selectedProjectId });
    setAreas((currentAreas) => {
      let workingAreas = currentAreas;
      function resolveAreaId(id) {
        if (id) return id;
        const existing = workingAreas.find((a) => a.name.toLowerCase() === "general");
        if (existing) return existing.id;
        const newId = uid();
        workingAreas = [...workingAreas, { id: newId, name: "General", color: nextColor(workingAreas), projects: [] }];
        return newId;
      }
      const newTasks = items.map((it) => ({
        id: uid(),
        areaId: resolveAreaId(it.areaId),
        projectId: it.projectId || null,
        title: it.title,
        note: "",
        status: "Por hacer",
        priority: it.priority,
        date: it.date,
      }));
      setTasks((prev) => {
        let list = prev;
        for (const nt of newTasks) list = insertAtEndOfGroup(list, nt);
        return list;
      });
      showToast(`${newTasks.length} tarea${newTasks.length === 1 ? "" : "s"} creada${newTasks.length === 1 ? "" : "s"}`);
      return workingAreas;
    });
    setFreeText("");
  }

  function addManualTask() {
    if (!manualTitle.trim()) return;
    const areaId = selectedAreaId !== "all" ? selectedAreaId : (manualArea || ensureArea("General"));
    const projectId = selectedAreaId !== "all" ? (manualProjectId || null) : null;
    setTasks((prev) => [
      { id: uid(), areaId, projectId, title: manualTitle.trim(), note: "", status: "Por hacer", priority: "Media", date: null },
      ...prev,
    ]);
    setManualTitle("");
    setManualProjectId("");
    showToast("Tarea creada");
  }

  function addTaskForFocusedDay() {
    if (!dayQuickTitle.trim()) return;
    const areaId = selectedAreaId !== "all" ? selectedAreaId : (manualArea || ensureArea("General"));
    const projectId = selectedAreaId !== "all" ? (manualProjectId || null) : null;
    setTasks((prev) => [
      { id: uid(), areaId, projectId, title: dayQuickTitle.trim(), note: "", status: "Por hacer", priority: "Media", date: focusedDate },
      ...prev,
    ]);
    setDayQuickTitle("");
    showToast("Tarea creada");
  }

  function cycleStatus(id) {
    const now = Date.now();
    if (statusClickGuardRef.current.id === id && now - statusClickGuardRef.current.time < 300) return;
    statusClickGuardRef.current = { id, time: now };
    setTasks((prev) => prev.map((t) => {
      if (t.id !== id) return t;
      const i = STATUSES.indexOf(t.status);
      return { ...t, status: STATUSES[(i + 1) % STATUSES.length] };
    }));
  }

  function cyclePriority(id) {
    setTasks((prev) => prev.map((t) => {
      if (t.id !== id) return t;
      const i = PRIORITIES.indexOf(t.priority);
      return { ...t, priority: PRIORITIES[(i + 1) % PRIORITIES.length] };
    }));
  }

  function setDate(id, date) {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, date: date || null } : t)));
  }

  function setNote(id, note) {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, note } : t)));
  }

  function commitTaskTitle(id, value) {
    const clean = value.trim();
    if (clean) setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, title: clean } : t)));
    setEditingTitleId(null);
  }

  function discardTitleEditing(id) {
    // Leaving without pressing Enter always discards — a fresh (chained)
    // task that was never confirmed gets removed; an existing task being
    // renamed just keeps its original title untouched.
    if (freshTaskIdRef.current === id) {
      removeTask(id);
      freshTaskIdRef.current = null;
    }
    setEditingTitleId(null);
  }

  function desktopBlurTitleEditing(id, value) {
    if (titleKeyHandledRef.current === id) { titleKeyHandledRef.current = null; return; }
    // A task that was never confirmed (fresh — created mid-chain via Enter,
    // or the very first one) always gets discarded on blur, no matter how
    // much partial text is sitting in the box. Only a click away from an
    // ALREADY-existing task is a real edit, and that one saves.
    if (freshTaskIdRef.current === id) {
      removeTask(id);
      freshTaskIdRef.current = null;
      setEditingTitleId(null);
      return;
    }
    const clean = value.trim();
    if (clean) {
      setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, title: clean } : t)));
    }
    setEditingTitleId(null);
  }

  function removeTask(id) {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }

  function toggleCollapse(areaId) {
    setCollapsed((prev) => ({ ...prev, [areaId]: !prev[areaId] }));
  }

  function createArea() {
    const name = newAreaName.trim();
    if (name) ensureArea(name);
    setNewAreaName("");
  }

  function discardNewArea() {
    setNewAreaName("");
    setAddingArea(false);
  }

  function createAreaFromPanel() {
    const name = panelNewAreaName.trim();
    if (name) ensureArea(name);
    setPanelNewAreaName("");
  }

  function discardNewAreaFromPanel() {
    setPanelNewAreaName("");
    setPanelAddingArea(false);
  }

  const orderCounterRef = useRef(Date.now());
  function nextOrder() {
    orderCounterRef.current += 1;
    return orderCounterRef.current;
  }

  function reassignGroupOrder(list, areaId, projectId) {
    // Give every task in this one area+project group a clean, unique,
    // sequential order value based on its position in `list`. Interpolating
    // fractions between neighbors forever can converge onto the same value
    // for two different tasks (a tie), which is exactly the kind of thing
    // that made some reorders silently fail to stick — a fresh, unambiguous
    // renumbering on every move can't collide.
    let n = 0;
    return list.map((t) => {
      if (t.areaId === areaId && t.projectId === projectId) {
        n += 1;
        return t.order === n * 1000 ? t : { ...t, order: n * 1000 };
      }
      return t;
    });
  }

  function handleDropOnTarget(areaId, projectId) {
    if (!draggedTaskId) return;
    setTasks((prev) => {
      const fromIdx = prev.findIndex((t) => t.id === draggedTaskId);
      if (fromIdx === -1) return prev;
      const list = [...prev];
      const [moved] = list.splice(fromIdx, 1);
      list.push({ ...moved, areaId, projectId });
      return reassignGroupOrder(list, areaId, projectId);
    });
    forceImmediateSaveRef.current = true;
    setDraggedTaskId(null);
    setDragOverKey(null);
  }

  function reorderTask(taskId, beforeTaskId) {
    if (taskId === beforeTaskId) return;
    setTasks((prev) => {
      const fromIdx = prev.findIndex((t) => t.id === taskId);
      if (fromIdx === -1) return prev;
      const list = [...prev];
      const [moved] = list.splice(fromIdx, 1);

      let areaId = moved.areaId;
      let projectId = moved.projectId;
      let insertIdx = list.length;

      if (beforeTaskId != null) {
        const targetIdx = list.findIndex((t) => t.id === beforeTaskId);
        if (targetIdx !== -1) {
          areaId = list[targetIdx].areaId;
          projectId = list[targetIdx].projectId;
          insertIdx = targetIdx;
        } else {
          insertIdx = -1; // unknown target — bail below
        }
      } else {
        // No target given — move to the end of the task's own current group.
        let lastIdx = -1;
        for (let i = 0; i < list.length; i++) {
          if (list[i].areaId === areaId && list[i].projectId === projectId) lastIdx = i;
        }
        insertIdx = lastIdx + 1;
      }

      if (insertIdx === -1) return prev;
      const movedUpdated = { ...moved, areaId, projectId };
      list.splice(insertIdx, 0, movedUpdated);
      return reassignGroupOrder(list, areaId, projectId);
    });
    forceImmediateSaveRef.current = true;
    setDraggedTaskId(null);
    setDragOverKey(null);
  }

  function startRename(area) {
    setRenamingAreaId(area.id);
    setRenameValue(area.name);
  }

  function commitRename() {
    const name = renameValue.trim();
    if (name) setAreas((prev) => prev.map((a) => (a.id === renamingAreaId ? { ...a, name } : a)));
    setRenamingAreaId(null);
  }

  function discardRename() {
    setRenamingAreaId(null);
  }

  function setAreaColor(id, color) {
    setAreas((prev) => prev.map((a) => (a.id === id ? { ...a, color } : a)));
  }

  function createProjectWithName(areaId, name) {
    const clean = name.trim();
    if (!clean) return;
    setAreas((prev) => prev.map((a) => (
      a.id === areaId ? { ...a, projects: [...(a.projects || []), { id: uid(), name: clean }] } : a
    )));
  }

  function createProject(areaId) {
    createProjectWithName(areaId, newProjectName);
    setNewProjectName("");
    setAddingProjectAreaId(null);
  }

  function createProjectFromPanel(areaId) {
    createProjectWithName(areaId, panelNewProjectName);
    setPanelNewProjectName("");
    setPanelAddingProjectAreaId(null);
  }

  function toggleProjectCollapse(id) {
    setCollapsedProjects((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function insertAtEndOfGroup(list, newTask) {
    let lastIdx = -1;
    for (let i = 0; i < list.length; i++) {
      if (list[i].areaId === newTask.areaId && list[i].projectId === newTask.projectId) lastIdx = i;
    }
    const taggedTask = { ...newTask, order: newTask.order ?? nextOrder() };
    const copy = [...list];
    copy.splice(lastIdx + 1, 0, taggedTask);
    return copy;
  }

  function addQuickTask(areaId, projectId, title) {
    if (!title.trim()) return;
    const newTask = { id: uid(), areaId, projectId: projectId || null, title: title.trim(), note: "", status: "Por hacer", priority: "Media", date: null };
    setTasks((prev) => insertAtEndOfGroup(prev, newTask));
    showToast("Tarea creada");
  }

  function backspaceMergeWithPrevious(t, keyGuardRef) {
    const idx = tasks.findIndex((x) => x.id === t.id);
    let prevTask = null;
    for (let i = idx - 1; i >= 0; i--) {
      if (tasks[i].areaId === t.areaId && tasks[i].projectId === t.projectId) { prevTask = tasks[i]; break; }
    }
    if (!prevTask) return false; // first task in its group — nothing to merge into
    if (keyGuardRef) keyGuardRef.current = t.id; // suppress this input's own blur logic
    freshTaskIdRef.current = null;
    removeTask(t.id);
    focusEndRef.current = true;
    setEditingTitleId(prevTask.id);
    return true;
  }

  function commitTitleAndAddNext(task, value) {
    const clean = value.trim();
    const newId = uid();
    setTasks((prev) => {
      const list = prev.map((t) => (t.id === task.id ? { ...t, title: clean || t.title } : t));
      const newTask = { id: newId, areaId: task.areaId, projectId: task.projectId, title: "", note: "", status: "Por hacer", priority: "Media", date: null };
      return insertAtEndOfGroup(list, newTask);
    });
    setEditingTitleId(newId);
    freshTaskIdRef.current = newId;
  }

  function handleTitleEscape(taskId) {
    if (freshTaskIdRef.current === taskId) {
      removeTask(taskId);
      freshTaskIdRef.current = null;
    }
    setEditingTitleId(null);
  }

  function startRenameProject(areaId, project) {
    setRenamingProjectId(project.id);
    setRenameProjectAreaId(areaId);
    setRenameProjectValue(project.name);
  }

  function commitRenameProject() {
    const name = renameProjectValue.trim();
    if (name) {
      setAreas((prev) => prev.map((a) => (
        a.id === renameProjectAreaId
          ? { ...a, projects: a.projects.map((p) => (p.id === renamingProjectId ? { ...p, name } : p)) }
          : a
      )));
    }
    setRenamingProjectId(null);
  }

  function discardRenameProject() {
    setRenamingProjectId(null);
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    if (deleteTarget.type === "area") {
      setTasks((prev) => prev.filter((t) => t.areaId !== deleteTarget.id));
      setAreas((prev) => prev.filter((a) => a.id !== deleteTarget.id));
      if (selectedAreaId === deleteTarget.id) selectArea("all");
      showToast("Área eliminada");
    } else if (deleteTarget.type === "project") {
      setAreas((prev) => prev.map((a) => (
        a.id === deleteTarget.areaId
          ? { ...a, projects: (a.projects || []).filter((p) => p.id !== deleteTarget.id) }
          : a
      )));
      setTasks((prev) => prev.filter((t) => t.projectId !== deleteTarget.id));
      if (selectedProjectId === deleteTarget.id) setSelectedProjectId(null);
      showToast("Proyecto eliminado");
    } else if (deleteTarget.type === "task") {
      removeTask(deleteTarget.id);
      if (mobileScreen === "task" && mobileTaskId === deleteTarget.id) {
        setMobileScreen("area");
        setMobileTaskId(null);
      }
      showToast("Tarea eliminada");
    }
    setDeleteTarget(null);
  }

  function changeMonth(delta) {
    setCalCursor((c) => {
      let month = c.month + delta, year = c.year;
      if (month < 0) { month = 11; year -= 1; }
      if (month > 11) { month = 0; year += 1; }
      return { year, month };
    });
  }

  function changeWeek(delta) { setWeekAnchor((a) => addDaysISO(a, delta * 7)); }
  function changeDay(delta) { setDayAnchor((a) => addDaysISO(a, delta)); }

  useEffect(() => {
    if (!showMonthPicker) return;
    function onDocClick(e) {
      if (monthPickerRef.current && !monthPickerRef.current.contains(e.target)) setShowMonthPicker(false);
    }
    function onKey(e) { if (e.key === "Escape") setShowMonthPicker(false); }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [showMonthPicker]);

  function openMonthPicker() {
    setPickerYear(calCursor.year);
    setShowMonthPicker(true);
  }

  function pickMonth(monthIdx) {
    const t = todayISO();
    const [ty, tm] = t.split("-").map(Number);
    focusDay(ty === pickerYear && tm - 1 === monthIdx ? t : isoOf(pickerYear, monthIdx, 1));
    setShowMonthPicker(false);
  }

  // One focused day drives every calendar view: month cursor, week and
  // day all follow it, so switching views never "loses" where you were.
  function focusDay(iso) {
    const [y, m] = iso.split("-").map(Number);
    setSelectedDay(iso);
    setDayAnchor(iso);
    setWeekAnchor(iso);
    setCalCursor((c) => (c.year === y && c.month === m - 1 ? c : { year: y, month: m - 1 }));
  }

  function goToday() {
    focusDay(todayISO());
  }

  function switchCalView(v) {
    setWeekAnchor(selectedDay);
    setDayAnchor(selectedDay);
    setCalView(v);
    setCalPopover(null);
  }

  function goPrevNext(dir) {
    setCalPopover(null);
    if (calView === "mes") {
      let month = calCursor.month + dir, year = calCursor.year;
      if (month < 0) { month = 11; year -= 1; }
      if (month > 11) { month = 0; year += 1; }
      const t = todayISO();
      const [ty, tm] = t.split("-").map(Number);
      focusDay(ty === year && tm - 1 === month ? t : isoOf(year, month, 1));
    } else if (calView === "semana") {
      focusDay(addDaysISO(selectedDay, dir * 7));
    } else {
      focusDay(addDaysISO(selectedDay, dir));
    }
  }

  function moveSelectedDay(delta) {
    focusDay(addDaysISO(selectedDay, delta));
  }

  const calKeyRef = useRef(null);
  calKeyRef.current = { moveSelectedDay, goPrevNext, goToday, switchCalView, calView, calPopover };
  useEffect(() => {
    if (view !== "calendario" || isMobile) return;
    function handleKey(e) {
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = calKeyRef.current;
      if (e.key === "Escape") { setCalPopover(null); setCalAddDay(null); return; }
      if (k.calPopover) return;
      const horizontal = 1;
      const vertical = k.calView === "dia" ? 1 : 7;
      if (e.key === "ArrowLeft") { e.preventDefault(); k.moveSelectedDay(-horizontal); }
      else if (e.key === "ArrowRight") { e.preventDefault(); k.moveSelectedDay(horizontal); }
      else if (e.key === "ArrowUp") { e.preventDefault(); k.moveSelectedDay(-vertical); }
      else if (e.key === "ArrowDown") { e.preventDefault(); k.moveSelectedDay(vertical); }
      else if (e.key === "PageUp") { e.preventDefault(); k.goPrevNext(-1); }
      else if (e.key === "PageDown") { e.preventDefault(); k.goPrevNext(1); }
      else if (e.key === "Home" || e.key === "t" || e.key === "T") { e.preventDefault(); k.goToday(); }
      else if (e.key === "m" || e.key === "M") k.switchCalView("mes");
      else if (e.key === "s" || e.key === "S") k.switchCalView("semana");
      else if (e.key === "d" || e.key === "D") k.switchCalView("dia");
      else if (e.key === "Enter") { e.preventDefault(); setCalAddDay(selectedDayRef.current); setCalAddText(""); }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [view, isMobile]);

  const selectedDayRef = useRef(selectedDay);
  selectedDayRef.current = selectedDay;

  // ---- calendar actions ----
  function calSetTaskDate(id, iso) {
    const t = tasks.find((x) => x.id === id);
    if (!t || (t.date || null) === (iso || null)) return;
    setDate(id, iso);
    showToast(iso ? `Movida al ${fmtDate(iso)}` : "Sin fecha");
  }

  function calDragProps(t) {
    return {
      draggable: true,
      onDragStart: (e) => {
        e.dataTransfer.setData("text/plain", t.id);
        e.dataTransfer.effectAllowed = "move";
        setCalDragTaskId(t.id);
        setCalPopover(null);
      },
      onDragEnd: () => { setCalDragTaskId(null); setCalDropTarget(null); },
    };
  }

  function calDropProps(target) {
    return {
      onDragOver: (e) => {
        if (!calDragTaskId) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (calDropTarget !== target) setCalDropTarget(target);
      },
      onDragLeave: (e) => {
        if (!e.currentTarget.contains(e.relatedTarget) && calDropTarget === target) setCalDropTarget(null);
      },
      onDrop: (e) => {
        e.preventDefault();
        const id = e.dataTransfer.getData("text/plain") || calDragTaskId;
        setCalDragTaskId(null);
        setCalDropTarget(null);
        if (id) calSetTaskDate(id, target === "undated" ? null : target);
      },
    };
  }

  function openCalTaskPopover(e, t) {
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    setCalPopTitle(t.title);
    setCalPopover({ kind: "task", id: t.id, x: r.left, y: r.bottom, top: r.top });
  }

  function openCalDayPopover(e, iso) {
    e.stopPropagation();
    const cell = e.currentTarget.closest(".cal-cell") || e.currentTarget;
    const r = cell.getBoundingClientRect();
    setCalPopover({ kind: "day", id: iso, x: r.left, y: r.top, w: r.width });
  }

  function commitCalAdd(iso) {
    const title = calAddText.trim();
    if (!title) { setCalAddDay(null); return; }
    const areaId = selectedAreaId !== "all" ? selectedAreaId : ensureArea("General");
    const projectId = selectedAreaId !== "all" ? (selectedProjectId || null) : null;
    setTasks((prev) => [
      { id: uid(), areaId, projectId, title, note: "", status: "Por hacer", priority: "Media", date: iso },
      ...prev,
    ]);
    setCalAddText("");
    showToast("Tarea creada");
  }

  function commitCalPopTitle(id) {
    const clean = calPopTitle.trim();
    if (clean) setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, title: clean } : t)));
  }

  function toggleTaskDone(id) {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status: t.status === "Hecho" ? "Por hacer" : "Hecho" } : t)));
  }

  function colGroupFor(showArea) {
    return (
      <colgroup>
        <col style={{ width: showArea ? "28%" : "34%" }} />
        {showArea && <col style={{ width: "18%" }} />}
        <col style={{ width: showArea ? "18%" : "26%" }} />
        <col style={{ width: "14%" }} />
        <col style={{ width: "10%" }} />
        <col style={{ width: "10%" }} />
        <col style={{ width: "4%" }} />
      </colgroup>
    );
  }

  // ======================= MOBILE (drill-down UI) =======================
  // Areas -> Área (proyectos + notas) -> Nota (opciones extra), plus a
  // dedicated fast-entry screen for the "+" button. Same data, same
  // handlers, same sync/encryption as the desktop table view — this is
  // purely an alternate presentation for narrow screens.

  function openMobileArea(areaId) {
    setMobileAreaId(areaId);
    setMobileScreen("area");
    setMobileSearch("");
  }
  function openMobileTask(taskId, areaId) {
    setMobileTaskId(taskId);
    if (areaId) setMobileAreaId(areaId);
    setMobileScreen("task");
  }
  function mobileGoBack() {
    setMobileRevealedTaskId(null);
    if (mobileScreen === "task") { setMobileScreen("area"); setMobileTaskId(null); }
    else if (mobileScreen === "quickadd") { setMobileScreen(mobileAreaId ? "area" : "areas"); }
    else if (mobileScreen === "area") { setMobileScreen("areas"); setMobileAreaId(null); setMobileSearch(""); }
  }
  function mobileToggleDone(id, currentlyDone) {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status: currentlyDone ? "Por hacer" : "Hecho" } : t)));
    if (!currentlyDone) {
      setMobileCompletingIds((prev) => new Set(prev).add(id));
      setTimeout(() => {
        setMobileCompletingIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
      }, 1000);
    }
  }
  function mobileCountFor(areaId) {
    return tasks.filter((t) => t.areaId === areaId && (t.status !== "Hecho" || mobileCompletingIds.has(t.id))).length;
  }
  function toggleMobileFilter(kind) {
    setMobileExpandedFilter((cur) => (cur === kind ? null : kind));
  }
  function openMobileQuickAdd() {
    setMobileQuickAddAreaId(mobileAreaId || (areas[0] && areas[0].id) || null);
    setMobileQuickAddProjectId(null);
    setMobileQuickAddText("");
    setMobileScreen("quickadd");
  }

  // Swipe from near the left edge to the right = go back, like iOS.
  function mobileSwipeHandlers(canGoBack) {
    if (!canGoBack) return {};
    return {
      onTouchStart: (e) => {
        const touch = e.touches[0];
        mobileSwipeRef.current = { x: touch.clientX, y: touch.clientY, tracking: touch.clientX < 36 };
      },
      onTouchEnd: (e) => {
        if (!mobileSwipeRef.current.tracking) return;
        const touch = e.changedTouches[0];
        const dx = touch.clientX - mobileSwipeRef.current.x;
        const dy = Math.abs(touch.clientY - mobileSwipeRef.current.y);
        mobileSwipeRef.current.tracking = false;
        if (dx > 70 && dy < 60) mobileGoBack();
      },
    };
  }

  function renderMobileBrandBar() {
    return <div className="m-brand-row"><span className="brand-dot" /><span className="m-brand-name">Task App</span></div>;
  }

  function renderMobileUrgentBar() {
    const current = urgentItems[urgentIndex] || null;
    return (
      <div
        className={`urgent-bar ${current ? "urgent-bar--tappable" : ""}`}
        onClick={() => { if (current) openMobileTask(current.task.id, current.task.areaId); }}
      >
        <span className={`urgent-label ${current ? "" : "urgent-label--off"}`}><span className={`urgent-dot ${current ? "" : "urgent-dot--off"}`} />URGENTES</span>
        {current ? (
          <>
            <span className={`urgent-chip urgent-chip--${current.kind}`}>
              {current.kind === "vencida" ? "Vencida" : current.kind === "hoy" ? "Hoy" : "Mañana"}
            </span>
            <span className="urgent-title">{current.task.title}</span>
          </>
        ) : (
          <span className="urgent-empty">Sin vencimientos ni alertas por ahora.</span>
        )}
      </div>
    );
  }

  function renderMobileTaskIcons(t) {
    return (
      <button className="m-task-icons" onClick={() => openMobileTask(t.id, t.areaId)} title="Ver detalle">
        <Flag size={15} className={`m-flag m-flag--${t.priority}`} />
        {t.date && <CalendarIcon size={15} className={isOverdue(t.date, t.status) ? "m-cal m-cal--overdue" : "m-cal"} />}
        <Info size={16} className={`m-info-icon ${t.status === "Hecho" ? "m-info-icon--done" : t.status === "Haciendo" ? "m-info-icon--doing" : ""}`} />
      </button>
    );
  }

  function taskRowSwipeHandlers(t) {
    return {
      onTouchStart: (e) => {
        const touch = e.touches[0];
        mobileSwipeRef.current = { x: touch.clientX, y: touch.clientY, tracking: true, taskId: t.id };
      },
      onTouchMove: () => {},
      onTouchEnd: (e) => {
        if (!mobileSwipeRef.current.tracking) return;
        const touch = e.changedTouches[0];
        const dx = touch.clientX - mobileSwipeRef.current.x;
        const dy = Math.abs(touch.clientY - mobileSwipeRef.current.y);
        mobileSwipeRef.current.tracking = false;
        if (dy > 60) return;
        if (dx < -50) setMobileRevealedTaskId(t.id);
        else if (dx > 50) {
          if (mobileRevealedTaskId === t.id) setMobileRevealedTaskId(null);
          else if (mobileSwipeRef.current.x < 36) mobileGoBack();
        }
      },
    };
  }

  function dragHandleHandlers(t) {
    return {
      onTouchStart: (e) => {
        e.stopPropagation();
        e.preventDefault();
        const touch = e.touches[0];
        mobileLongPressRef.current.x = touch.clientX;
        mobileLongPressRef.current.y = touch.clientY;
        mobileLongPressRef.current.taskId = t.id;
        setMobileDraggingTaskId(t.id);
        setMobileDragOffsetY(0);
        setMobileDropTarget(null);
        if (navigator.vibrate) navigator.vibrate(10);
      },
      onTouchMove: (e) => {
        e.stopPropagation();
        e.preventDefault();
        const touch = e.touches[0];
        setMobileDragOffsetY(touch.clientY - mobileLongPressRef.current.y);
        const el = document.elementFromPoint(touch.clientX, touch.clientY);
        const rowEl = el && el.closest && el.closest("[data-task-id]");
        const overId = rowEl && rowEl.getAttribute("data-task-id");
        if (overId && overId !== t.id) {
          const rect = rowEl.getBoundingClientRect();
          const position = touch.clientY > rect.top + rect.height / 2 ? "after" : "before";
          setMobileDropTarget((prev) => (prev && prev.id === overId && prev.position === position ? prev : { id: overId, position }));
        }
      },
      onTouchEnd: (e) => {
        e.stopPropagation();
        const drop = mobileDropTarget;
        if (drop) {
          if (drop.position === "before") {
            reorderTask(t.id, drop.id);
          } else {
            const allRows = Array.from(document.querySelectorAll("[data-task-id]"));
            const idx = allRows.findIndex((r) => r.getAttribute("data-task-id") === drop.id);
            const nextRow = allRows[idx + 1];
            const nextId = nextRow && nextRow.getAttribute("data-task-id");
            reorderTask(t.id, nextId && nextId !== t.id ? nextId : null);
          }
        }
        setMobileDraggingTaskId(null);
        setMobileDragOffsetY(0);
        setMobileDropTarget(null);
      },
    };
  }

  function renderMobileTaskRow(t, opts) {
    const showArea = !!(opts && typeof opts === "object" && opts.showArea);
    const rowArea = showArea ? areaMap[t.areaId] : null;
    const rowProject = rowArea && t.projectId ? rowArea.projects?.find((p) => p.id === t.projectId) : null;
    const done = t.status === "Hecho";
    const completing = mobileCompletingIds.has(t.id);
    const revealed = mobileRevealedTaskId === t.id;
    const dropBefore = mobileDropTarget && mobileDropTarget.id === t.id && mobileDropTarget.position === "before";
    const dropAfter = mobileDropTarget && mobileDropTarget.id === t.id && mobileDropTarget.position === "after";
    return (
      <div
        key={t.id}
        data-task-id={t.id}
        className={`m-task-row ${revealed ? "m-task-row--revealed" : ""} ${mobileDraggingTaskId === t.id ? "m-task-row--dragging" : ""} ${dropBefore ? "m-task-row--drop-before" : ""} ${dropAfter ? "m-task-row--drop-after" : ""}`}
        style={mobileDraggingTaskId === t.id ? { transform: `translateY(${mobileDragOffsetY}px)` } : undefined}
        {...taskRowSwipeHandlers(t)}
      >
        <button className="m-check" onClick={() => mobileToggleDone(t.id, done)}>
          {done || completing ? <CheckCircle2 size={17} color="var(--good)" /> : <Circle size={17} color="var(--text-faint)" />}
        </button>
        <div className="m-task-main">
          {editingTitleId === t.id ? (
            <input
              autoFocus
              className="m-task-title-input"
              defaultValue={t.title}
              ref={(el) => {
                if (el && focusEndRef.current) {
                  focusEndRef.current = false;
                  const len = el.value.length;
                  el.focus();
                  el.setSelectionRange(len, len);
                }
              }}
              onBlur={(e) => {
                if (titleKeyHandledRef.current === t.id) { titleKeyHandledRef.current = null; return; }
                const textAtBlur = e.target.value;
                mobileScreenTapRef.current = false;
                setTimeout(() => {
                  const wasScreenTap = mobileScreenTapRef.current;
                  mobileScreenTapRef.current = false;
                  // The keyboard's own "visto"/checkmark just blurs with no
                  // click following it — if there's text, that's a confirm,
                  // so save the edit (but don't chain a new task, unlike
                  // Enter). A tap on the empty screen elsewhere always fires
                  // a click right after the blur — that's always a discard.
                  if (!wasScreenTap && textAtBlur.trim()) {
                    if (freshTaskIdRef.current === t.id) freshTaskIdRef.current = null;
                    commitTaskTitle(t.id, textAtBlur);
                  } else {
                    discardTitleEditing(t.id);
                  }
                }, 0);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); titleKeyHandledRef.current = t.id; commitTitleAndAddNext(t, e.target.value); }
                if (e.key === "Escape") { titleKeyHandledRef.current = t.id; handleTitleEscape(t.id); }
                if (e.key === "Backspace" && e.target.value === "") {
                  if (backspaceMergeWithPrevious(t, titleKeyHandledRef)) e.preventDefault();
                }
              }}
            />
          ) : (
            <span className={`m-task-title ${done ? "m-task-title--done" : ""}`} onClick={() => setEditingTitleId(t.id)}>{t.title}</span>
          )}
          {editingNoteId === t.id ? (
            <input
              autoFocus
              className="m-task-note-input"
              defaultValue={t.note}
              onBlur={(e) => { setNote(t.id, e.target.value); setEditingNoteId(null); }}
              onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); if (e.key === "Escape") setEditingNoteId(null); }}
            />
          ) : t.note ? (
            <span className="m-task-note" onClick={() => setEditingNoteId(t.id)}>{t.note}</span>
          ) : null}
          {rowArea && (
            <span className="m-task-area" onClick={() => openMobileArea(rowArea.id)}>
              <span className="m-task-area-dot" style={{ background: rowArea.color }} />
              {rowArea.name}{rowProject ? ` / ${rowProject.name}` : ""}
            </span>
          )}
        </div>
        {revealed ? (
          <button className="m-row-delete" onClick={() => setDeleteTarget({ type: "task", id: t.id })}>
            <Trash2 size={16} /> Eliminar
          </button>
        ) : (
          <>
            {renderMobileTaskIcons(t)}
            <button className="m-drag-handle" {...dragHandleHandlers(t)}>
              <GripVertical size={18} />
            </button>
          </>
        )}
      </div>
    );
  }

  function areaSwipeHandlers(areaId) {
    const state = { x: 0, y: 0 };
    return {
      onTouchStart: (e) => {
        const touch = e.touches[0];
        state.x = touch.clientX; state.y = touch.clientY;
      },
      onTouchEnd: (e) => {
        const touch = e.changedTouches[0];
        const dx = touch.clientX - state.x;
        const dy = Math.abs(touch.clientY - state.y);
        if (dy > 60) return;
        if (dx < -50) setMobileRevealedAreaId(areaId);
        else if (dx > 50 && mobileRevealedAreaId === areaId) setMobileRevealedAreaId(null);
      },
    };
  }

  function renderMobileAreasScreen() {
    const q = mobileSearch.trim().toLowerCase();
    const matchedAreas = q ? areas.filter((a) => a.name.toLowerCase().includes(q)) : [];
    const matchedTasks = q ? tasks.filter((t) => t.title.toLowerCase().includes(q) || (t.note || "").toLowerCase().includes(q)) : [];
    const favFilteredTasks = areaFilterMode === "off" ? tasks : tasks.filter((t) => {
      const taskArea = areaMap[t.areaId];
      const isFav = !!(taskArea && taskArea.favorite);
      if (areaFilterMode === "solo") return isFav;
      if (areaFilterMode === "mute") return !isFav;
      return true;
    });
    const filteredTasks = mobileExpandedFilter === "vencidas"
      ? favFilteredTasks.filter((t) => isOverdue(t.date, t.status) || mobileCompletingIds.has(t.id))
      : mobileExpandedFilter === "pendientes"
      ? favFilteredTasks.filter((t) => t.status !== "Hecho" || mobileCompletingIds.has(t.id))
      : null;

    return (
      <div className="m-screen">
        {renderMobileBrandBar()}
        <div className="m-topbar">
          <div className="m-toolbar">
            <div className="m-search">
              <Search size={15} className="m-search-icon" />
              <input placeholder="Buscar" value={mobileSearch} onChange={(e) => { setMobileSearch(e.target.value); setMobileExpandedFilter(null); }} />
            </div>
            <button className={`m-pill ${hideCompleted ? "m-pill--on" : ""}`} onClick={() => setHideCompleted((v) => !v)} title="Ocultar hechas">
              {hideCompleted ? <CheckCircle2 size={18} /> : <Circle size={18} />}
            </button>
            <button
              className={`m-pill ${areaFilterMode !== "off" ? "m-pill--on" : ""}`}
              onClick={() => setAreaFilterMode((m) => (m === "off" ? "solo" : m === "solo" ? "mute" : "off"))}
              title={areaFilterMode === "solo" ? "Mostrando solo favoritas — tocá para ocultarlas" : areaFilterMode === "mute" ? "Ocultando favoritas — tocá para apagar el filtro" : "Filtro de favoritas (apagado)"}
            >
              {areaFilterMode === "mute" ? <EyeOff size={18} /> : <Star size={18} fill={areaFilterMode === "solo" ? "currentColor" : "none"} />}
            </button>
            <button className="m-add-btn" onClick={openMobileQuickAdd} title="Nueva nota"><Plus size={20} strokeWidth={2.6} /></button>
            {syncError ? (
              <button className="m-pill m-pill--bad" onClick={saveDiff} title="No se pudo guardar — tocá para reintentar"><CloudOff size={18} /></button>
            ) : (
              <button className="m-pill" onClick={() => setShowSettingsPanel(true)} title="Configuración"><Settings size={18} /></button>
            )}
          </div>
        </div>
        <div className="m-filters">
          <button className={`m-filter ${mobileExpandedFilter === "pendientes" ? "m-filter--active" : ""}`} onClick={() => toggleMobileFilter("pendientes")}>
            Pendientes <b>{pendientes}</b>
          </button>
          <button className={`m-filter ${mobileExpandedFilter === "vencidas" ? "m-filter--active" : ""}`} onClick={() => toggleMobileFilter("vencidas")}>
            Vencidas <b className={vencidas > 0 ? "m-filter-bad" : ""}>{vencidas}</b>
          </button>
        </div>

        <div
          className={`m-list ${mobileDraggingTaskId ? "m-list--dragging" : ""}`}
          onClick={(e) => {
            if (mobileRevealedAreaId) setMobileRevealedAreaId(null);
            if (e.target === e.currentTarget) {
              const generalArea = areas.find((a) => isGeneralArea(a));
              const generalId = generalArea ? generalArea.id : ensureArea("General");
              openMobileArea(generalId);
              setMobileInlineAddKey(`${generalId}:general`);
              setMobileInlineAddText("");
            }
          }}
        >
          {q ? (
            <>
              {matchedAreas.length === 0 && matchedTasks.length === 0 && <div className="m-empty-hint">Sin resultados para "{mobileSearch}"</div>}
              {matchedAreas.map((a) => (
                <button key={a.id} className="m-area-card" style={{ "--chip": a.color }} onClick={() => openMobileArea(a.id)}>
                  <span className="m-area-bar" style={{ background: a.color }} />
                  <span className="m-area-name">{a.name.toUpperCase()}</span>
                  <span className="m-area-count">{mobileCountFor(a.id)}</span>
                  <ChevronRight size={16} className="m-area-chevron" />
                </button>
              ))}
              {matchedTasks.map((t) => {
                const a = areaMap[t.areaId];
                return (
                  <button key={t.id} className="m-search-task" onClick={() => openMobileTask(t.id, t.areaId)}>
                    <span className="m-search-task-dot" style={{ background: a?.color || "var(--text-faint)" }} />
                    <span className="m-search-task-title">{t.title}</span>
                    <span className="m-search-task-area">{a?.name}</span>
                  </button>
                );
              })}
            </>
          ) : mobileExpandedFilter ? (
            <>
              {filteredTasks.length === 0
                ? <div className="m-empty-hint">{mobileExpandedFilter === "vencidas" ? "No hay nada vencido." : "No hay pendientes."}</div>
                : (
                  <div className="m-card">
                    <div className="m-card-title">{mobileExpandedFilter === "vencidas" ? "Vencidas" : "Pendientes"} <span>{filteredTasks.length}</span></div>
                    {filteredTasks.map((t) => renderMobileTaskRow(t, { showArea: true }))}
                  </div>
                )}
            </>
          ) : (
            <>
              {visibleOrderedAreas.map((a) => (
                renamingAreaId === a.id ? (
                  <div key={a.id} className="m-area-card m-area-card--renaming" style={{ "--chip": a.color }}>
                    <span className="m-area-bar" style={{ background: a.color }} />
                    <input
                      ref={renameInputRef}
                      className="m-inline-rename-input"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") setRenamingAreaId(null); }}
                      onBlur={discardRename}
                    />
                  </div>
                ) : mobileRevealedAreaId === a.id ? (
                  <div key={a.id} className="m-area-card m-area-card--revealed" style={{ "--chip": a.color }}>
                    <span className="m-area-bar" style={{ background: a.color }} />
                    <span className="m-area-name">{a.name.toUpperCase()}</span>
                    <button className="m-row-delete" onClick={() => setDeleteTarget({ type: "area", id: a.id })}>
                      <Trash2 size={16} /> Eliminar
                    </button>
                  </div>
                ) : (
                  <button key={a.id} className="m-area-card" style={{ "--chip": a.color }} onClick={() => openMobileArea(a.id)} {...areaSwipeHandlers(a.id)}>
                    <span className="m-area-bar" style={{ background: a.color }} />
                    <span
                      role="button"
                      className={`fav-star-btn ${a.favorite ? "fav-star-btn--active" : ""}`}
                      onClick={(e) => { e.stopPropagation(); toggleAreaFavorite(a.id); }}
                    >
                      <Star size={15} fill={a.favorite ? "currentColor" : "none"} />
                    </span>
                    <span className="m-area-name">{a.name.toUpperCase()}</span>
                    <span className="m-area-count">{mobileCountFor(a.id)}</span>
                    <ChevronRight size={16} className="m-area-chevron" />
                  </button>
                )
              ))}

              {mobileAddingArea ? (
                <div className="m-inline-add">
                  <input
                    autoFocus
                    placeholder="Nombre del área"
                    value={mobileNewAreaName}
                    onChange={(e) => setMobileNewAreaName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { areaKeyHandledRef.current = true; const n = mobileNewAreaName.trim(); if (n) ensureArea(n); setMobileNewAreaName(""); setMobileAddingArea(false); }
                      if (e.key === "Escape") { areaKeyHandledRef.current = true; setMobileNewAreaName(""); setMobileAddingArea(false); }
                    }}
                    onBlur={() => {
                      if (areaKeyHandledRef.current) { areaKeyHandledRef.current = false; return; }
                      const nameAtBlur = mobileNewAreaName;
                      mobileScreenTapRef.current = false;
                      setTimeout(() => {
                        const wasScreenTap = mobileScreenTapRef.current;
                        mobileScreenTapRef.current = false;
                        const n = nameAtBlur.trim();
                        if (!wasScreenTap && n) ensureArea(n);
                        setMobileNewAreaName("");
                        setMobileAddingArea(false);
                      }, 0);
                    }}
                  />
                </div>
              ) : (
                <button className="m-add-area-btn" onClick={() => setMobileAddingArea(true)}><Plus size={14} /> Nueva área</button>
              )}
            </>
          )}
        </div>

        <div className="m-session-bar">
          <div>
            <div className="m-account-name">{session?.user?.is_anonymous ? "Invitado" : (maskEmail(session?.user?.email))}</div>
            <div className="m-account-sub">{session?.user?.is_anonymous ? "Sesión de prueba" : "Con cuenta"}</div>
          </div>
          <button className="m-account-logout" onClick={handleLogout}>Salir</button>
        </div>
        {renderMobileUrgentBar()}
      </div>
    );
  }

  function toggleMobileProjectCollapse(projectId) {
    setMobileCollapsedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId); else next.add(projectId);
      return next;
    });
  }

  function renderMobileInlineAdd(areaId, projectId) {
    const key = `${areaId}:${projectId || "general"}`;
    if (mobileInlineAddKey !== key) {
      return <div className="m-inline-add-zone" onClick={() => { setMobileInlineAddKey(key); setMobileInlineAddText(""); }} />;
    }
    function submitAndContinue() {
      const clean = mobileInlineAddText.trim();
      if (!clean) { setMobileInlineAddKey(null); return; }
      addQuickTask(areaId, projectId, clean);
      setMobileInlineAddText("");
    }
    return (
      <div className="m-inline-add-zone m-inline-add-zone--active">
        <input
          autoFocus
          placeholder="Nueva tarea..."
          value={mobileInlineAddText}
          onChange={(e) => setMobileInlineAddText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); submitAndContinue(); }
            if (e.key === "Escape") { inlineAddEscapedRef.current = true; setMobileInlineAddKey(null); setMobileInlineAddText(""); }
          }}
          onBlur={() => {
            if (inlineAddEscapedRef.current) { inlineAddEscapedRef.current = false; setMobileInlineAddKey(null); setMobileInlineAddText(""); return; }
            const textAtBlur = mobileInlineAddText;
            mobileScreenTapRef.current = false;
            setTimeout(() => {
              const wasScreenTap = mobileScreenTapRef.current;
              mobileScreenTapRef.current = false;
              const clean = textAtBlur.trim();
              // The keyboard's own "visto"/checkmark just blurs with no click
              // following it — if there's text, that's a confirm, so create
              // the task. A tap on the empty screen elsewhere always fires a
              // click right after the blur — that's always a discard.
              if (!wasScreenTap && clean) addQuickTask(areaId, projectId, clean);
              setMobileInlineAddKey(null);
              setMobileInlineAddText("");
            }, 0);
          }}
        />
      </div>
    );
  }

  function renderMobileAreaScreen() {
    const area = areaMap[mobileAreaId];
    if (!area) { setMobileScreen("areas"); return null; }
    const projects = area.projects || [];
    const q = mobileSearch.trim().toLowerCase();
    const matchesQuery = (t) => !q || t.title.toLowerCase().includes(q) || (t.note || "").toLowerCase().includes(q);
    const matchesVisibility = (t) => matchesQuery(t) && (!hideCompleted || t.status !== "Hecho" || mobileCompletingIds.has(t.id));
    const tasksOf = (projectId) => tasks.filter((t) => t.areaId === area.id && t.projectId === projectId).filter(matchesVisibility);
    const generalTasks = tasks.filter((t) => t.areaId === area.id && !t.projectId).filter(matchesVisibility);

    return (
      <div className="m-screen" style={{ "--chip": area.color }} {...mobileSwipeHandlers(true)}>
        {renderMobileBrandBar()}
        <div className="m-topbar">
          <div className="m-toolbar">
            <button className="m-pill" onClick={mobileGoBack} title="Volver"><ChevronLeft size={20} /></button>
            <div className="m-header-title"><span className="m-header-dot" style={{ background: area.color }} />{area.name.toUpperCase()}</div>
            <button className={`m-pill ${hideCompleted ? "m-pill--on" : ""}`} onClick={() => setHideCompleted((v) => !v)} title="Ocultar hechas">
              {hideCompleted ? <CheckCircle2 size={18} /> : <Circle size={18} />}
            </button>
          </div>
          <div className="m-toolbar">
            <div className="m-search">
              <Search size={15} className="m-search-icon" />
              <input placeholder="Buscar en esta área" value={mobileSearch} onChange={(e) => setMobileSearch(e.target.value)} />
            </div>
            <button className="m-add-btn" onClick={openMobileQuickAdd} title="Nueva nota"><Plus size={20} strokeWidth={2.6} /></button>
          </div>
        </div>

        <div
          className={`m-list ${mobileDraggingTaskId ? "m-list--dragging" : ""}`}
          onClick={(e) => {
            if (mobileRevealedTaskId) setMobileRevealedTaskId(null);
            if (e.target === e.currentTarget) {
              mobileScreenTapRef.current = true;
              const key = `${area.id}:general`;
              if (mobileInlineAddKey !== key) {
                setMobileInlineAddKey(key);
                setMobileInlineAddText("");
              }
            }
          }}
        >
          {q ? (
            <>
              {tasks.filter((t) => t.areaId === area.id && matchesQuery(t)).length === 0 && (
                <div className="m-empty-hint">Sin resultados para "{mobileSearch}"</div>
              )}
              {tasks.filter((t) => t.areaId === area.id && matchesQuery(t)).length > 0 && (
                <div className="m-card">{tasks.filter((t) => t.areaId === area.id && matchesQuery(t)).map((t) => renderMobileTaskRow(t))}</div>
              )}
            </>
          ) : (
            <>
          {projects.map((p) => {
            const projectTaskCount = tasksOf(p.id).length;
            const collapsed = projectTaskCount > 0 && mobileCollapsedProjects.has(p.id);
            const isRenaming = renamingProjectId === p.id && renameProjectAreaId === area.id;
            return (
              <div key={p.id} className={`m-project-block ${collapsed ? "m-project-block--collapsed" : ""}`}>
                {isRenaming ? (
                  <div className="m-project-header">
                    <input
                      className="m-inline-rename-input m-inline-rename-input--project"
                      value={renameProjectValue}
                      onChange={(e) => setRenameProjectValue(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") commitRenameProject(); if (e.key === "Escape") setRenamingProjectId(null); }}
                      onBlur={discardRenameProject}
                      autoFocus
                    />
                  </div>
                ) : (
                  <div
                    className="m-project-header"
                    onClick={() => toggleMobileProjectCollapse(p.id)}
                  >
                    <span className="m-project-name">{p.name.toUpperCase()}</span>
                    <span className="m-project-count">{projectTaskCount}</span>
                    {projectTaskCount > 0 && <ChevronDown size={16} className="m-project-chev" />}
                    <span className="m-project-actions">
                      <button className="m-project-action-btn" onClick={(e) => { e.stopPropagation(); startRenameProject(area.id, p); }}>
                        <Pencil size={14} />
                      </button>
                      <button className="m-project-action-btn" onClick={(e) => { e.stopPropagation(); setDeleteTarget({ type: "project", id: p.id, areaId: area.id }); }}>
                        <Trash2 size={14} />
                      </button>
                    </span>
                  </div>
                )}
                {!collapsed && (
                  <div className="m-project-tasks">
                    {tasksOf(p.id).map((t) => renderMobileTaskRow(t))}
                    {renderMobileInlineAdd(area.id, p.id)}
                  </div>
                )}
              </div>
            );
          })}

          <div className={`m-project-block m-project-block--general ${projects.length > 0 && generalTasks.length === 0 ? "m-project-block--bare" : ""}`}>
            {projects.length > 0 && generalTasks.length > 0 && (
              <div className="m-project-header m-project-header--static">
                <span className="m-project-name m-project-name--general">SIN PROYECTO</span>
                <span className="m-project-count">{generalTasks.length}</span>
              </div>
            )}
            {generalTasks.map((t) => renderMobileTaskRow(t))}
            {renderMobileInlineAdd(area.id, null)}
          </div>
            </>
          )}
        </div>

        {!isGeneralArea(area) && (
          <div className="m-sticky-footer">
            {mobileAddingProjectAreaId === area.id ? (
              <div className="m-inline-add">
                <input
                  autoFocus
                  placeholder="Nombre del proyecto"
                  value={mobileNewProjectName}
                  onChange={(e) => setMobileNewProjectName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { projectKeyHandledRef.current = true; createProjectWithName(area.id, mobileNewProjectName); setMobileNewProjectName(""); setMobileAddingProjectAreaId(null); }
                    if (e.key === "Escape") { projectKeyHandledRef.current = true; setMobileNewProjectName(""); setMobileAddingProjectAreaId(null); }
                  }}
                  onBlur={() => {
                    if (projectKeyHandledRef.current) { projectKeyHandledRef.current = false; return; }
                    setMobileNewProjectName(""); setMobileAddingProjectAreaId(null);
                  }}
                />
              </div>
            ) : (
              <button className="m-add-area-btn" onClick={() => setMobileAddingProjectAreaId(area.id)}><Plus size={14} /> Nuevo proyecto</button>
            )}
          </div>
        )}

        {renderMobileUrgentBar()}
      </div>
    );
  }

  function renderMobileTaskScreen() {
    const t = tasks.find((x) => x.id === mobileTaskId);
    if (!t) { setMobileScreen("area"); return null; }
    const area = areaMap[t.areaId];
    const project = area?.projects?.find((p) => p.id === t.projectId);

    function moveToArea(newAreaId) {
      setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, areaId: newAreaId, projectId: null } : x)));
    }
    function moveToProject(newProjectId) {
      setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, projectId: newProjectId || null } : x)));
    }

    return (
      <div className="m-screen" style={{ "--chip": area?.color }} {...mobileSwipeHandlers(true)}>
        {renderMobileBrandBar()}
        <div className="m-topbar">
          <div className="m-toolbar">
            <button className="m-pill" onClick={mobileGoBack} title="Volver"><ChevronLeft size={20} /></button>
            <div className="m-header-title"><span className="m-header-dot" style={{ background: area?.color }} />{area?.name?.toUpperCase()}{project ? ` · ${project.name}` : ""}</div>
            <button className="m-pill m-pill--danger" onClick={() => { setDeleteTarget({ type: "task", id: t.id }); }} title="Eliminar tarea"><Trash2 size={17} /></button>
          </div>
        </div>

        <div className="m-task-detail">
          <textarea
            className="m-task-detail-title"
            defaultValue={t.title}
            rows={1}
            ref={(el) => { if (el) { el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; } }}
            onInput={(e) => { e.target.style.height = "auto"; e.target.style.height = e.target.scrollHeight + "px"; }}
            onBlur={(e) => commitTaskTitle(t.id, e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.target.blur(); } }}
          />
          <textarea
            className="m-task-detail-note"
            placeholder="Agregar una nota…"
            defaultValue={t.note}
            onBlur={(e) => setNote(t.id, e.target.value)}
          />

          <div className="m-task-detail-options">
            <div className="m-option-row">
              <span className="m-option-label">Estado</span>
              <StatusPill value={t.status} onClick={() => cycleStatus(t.id)} />
            </div>
            <div className="m-option-row">
              <span className="m-option-label">Prioridad</span>
              <PriorityBadge value={t.priority} onClick={() => cyclePriority(t.id)} />
            </div>
            <div className="m-option-row">
              <span className="m-option-label">Fecha</span>
              <DateField value={t.date} onChange={(v) => setDate(t.id, v)} overdue={isOverdue(t.date, t.status)} weekStartsSunday={weekStartsSunday} />
            </div>
            <div className="m-option-row">
              <span className="m-option-label">Área</span>
              <select className="m-option-select" value={t.areaId} onChange={(e) => moveToArea(e.target.value)}>
                {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            {area?.projects?.length > 0 && (
              <div className="m-option-row">
                <span className="m-option-label">Proyecto</span>
                <select className="m-option-select" value={t.projectId || ""} onChange={(e) => moveToProject(e.target.value)}>
                  <option value="">General</option>
                  {area.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            )}
          </div>
        </div>
        {renderMobileUrgentBar()}
      </div>
    );
  }

  function renderMobileQuickAddScreen() {
    const area = areaMap[mobileQuickAddAreaId] || areas[0];
    if (!area) {
      return (
        <div className="m-screen">
          <div className="m-header">
            <button className="m-back" onClick={mobileGoBack}><ChevronLeft size={20} /></button>
            <span className="m-header-title">Nueva nota</span>
          </div>
          <div className="m-empty-hint">Creá un área primero.</div>
        </div>
      );
    }
    const projectId = area.projects?.some((p) => p.id === mobileQuickAddProjectId) ? mobileQuickAddProjectId : null;
    const recent = tasks.filter((x) => x.areaId === area.id && x.projectId === projectId);
    function submit() {
      const title = mobileQuickAddText.trim();
      if (!title) return;
      addQuickTask(area.id, projectId, title);
      setMobileQuickAddText("");
    }
    return (
      <div className="m-screen" {...mobileSwipeHandlers(true)}>
        {renderMobileBrandBar()}
        <div className="m-topbar">
        <div className="m-toolbar">
          <button className="m-pill" onClick={mobileGoBack} title="Volver"><ChevronLeft size={20} /></button>
          <select
            className="m-quickadd-area-select"
            value={area.id}
            onChange={(e) => { setMobileQuickAddAreaId(e.target.value); setMobileQuickAddProjectId(null); }}
          >
            {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          {area.projects?.length > 0 && (
            <select
              className="m-quickadd-area-select"
              value={projectId || ""}
              onChange={(e) => setMobileQuickAddProjectId(e.target.value || null)}
            >
              <option value="">General</option>
              {area.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
        </div>
        </div>
        <div className="m-quickadd-input-row">
          <input
            autoFocus
            placeholder="Escribí una nota y tocá Enter..."
            value={mobileQuickAddText}
            onChange={(e) => setMobileQuickAddText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            onBlur={() => { if (mobileQuickAddText.trim()) submit(); }}
          />
          <button className="m-quickadd-send" onClick={submit}><Plus size={18} /></button>
        </div>
        <div className="m-list">
          {recent.map((t) => (
            <div key={t.id} className="m-quickadd-item">
              <Circle size={14} color="var(--text-faint)" />
              {t.title}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ================= CALENDAR =================
  function areaColorOf(t) {
    return areaMap[t.areaId]?.color || "#8d94a0";
  }

  function longDateLabel(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    return `${weekdayFullOf(iso)} ${d} de ${MONTH_LABELS[m - 1].toLowerCase()}${y !== new Date().getFullYear() ? ` de ${y}` : ""}`;
  }

  function relativeDayLabel(iso) {
    const t = todayISO();
    if (iso === t) return "Hoy";
    if (iso === addDaysISO(t, 1)) return "Mañana";
    if (iso === addDaysISO(t, -1)) return "Ayer";
    return null;
  }

  function renderCalChip(t, { wrap = false } = {}) {
    const overdue = isOverdue(t.date, t.status);
    const done = t.status === "Hecho";
    return (
      <button
        key={t.id}
        type="button"
        className={`cal-chip ${wrap ? "cal-chip--wrap" : ""} ${done ? "cal-chip--done" : ""} ${overdue ? "cal-chip--overdue" : ""} ${calDragTaskId === t.id ? "cal-chip--dragging" : ""} ${calPopover?.kind === "task" && calPopover.id === t.id ? "cal-chip--open" : ""}`}
        style={{ "--chip": areaColorOf(t) }}
        onClick={(e) => openCalTaskPopover(e, t)}
        title={`${t.title} · ${areaMap[t.areaId]?.name || ""}`}
        {...calDragProps(t)}
      >
        {t.priority === "Alta" && !done && <span className="cal-chip-prio" aria-label="Prioridad alta" />}
        <span className="cal-chip-text">{t.title}</span>
      </button>
    );
  }

  function renderCalInlineAdd(iso) {
    if (calAddDay !== iso) return null;
    return (
      <input
        className="cal-inline-add"
        autoFocus
        placeholder="Nueva tarea…"
        value={calAddText}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => setCalAddText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commitCalAdd(iso);
          if (e.key === "Escape") { setCalAddDay(null); setCalAddText(""); }
        }}
        onBlur={() => { if (calAddText.trim()) commitCalAdd(iso); setCalAddDay(null); setCalAddText(""); }}
      />
    );
  }

  function renderAgendaRow(t, { showDate = false, big = false } = {}) {
    const a = areaMap[t.areaId];
    const p = t.projectId ? a?.projects?.find((x) => x.id === t.projectId) : null;
    const done = t.status === "Hecho";
    const overdue = isOverdue(t.date, t.status);
    return (
      <div
        key={t.id}
        className={`agenda-row ${big ? "agenda-row--big" : ""} ${done ? "agenda-row--done" : ""} ${calDragTaskId === t.id ? "agenda-row--dragging" : ""}`}
        style={{ "--chip": a?.color || "#8d94a0" }}
        {...calDragProps(t)}
      >
        <button className="agenda-check" onClick={() => toggleTaskDone(t.id)} title={done ? "Marcar como pendiente" : "Marcar como hecha"}>
          {done ? <CheckCircle2 size={big ? 18 : 16} /> : <Circle size={big ? 18 : 16} />}
        </button>
        <button className="agenda-main" onClick={(e) => openCalTaskPopover(e, t)}>
          <span className="agenda-title">{t.title}</span>
          <span className="agenda-meta">
            <span className="agenda-area-dot" />
            {a?.name}{p ? ` / ${p.name}` : ""}
            {showDate && t.date && <span className={overdue ? "agenda-date agenda-date--overdue" : "agenda-date"}>{fmtDate(t.date)}</span>}
          </span>
        </button>
        {t.priority === "Alta" && !done && <Flag size={13} className="agenda-flag" />}
        {t.status === "Haciendo" && <CircleDot size={14} className="agenda-doing" title="Haciendo" />}
      </div>
    );
  }

  function renderMiniMonth() {
    const today = todayISO();
    const labels = weekStartsSunday ? WEEKDAY_LABELS_SUN_FIRST : WEEKDAY_LABELS;
    return (
      <div className="mini-month">
        <div className="mini-month-head">
          <span className="mini-month-label">{MONTH_LABELS[calCursor.month]} {calCursor.year}</span>
          <span className="mini-month-nav">
            <button className="mini-nav-btn" onClick={() => { setCalCursor((c) => (c.month === 0 ? { year: c.year - 1, month: 11 } : { ...c, month: c.month - 1 })); }} title="Mes anterior"><ChevronLeft size={14} /></button>
            <button className="mini-nav-btn" onClick={() => { setCalCursor((c) => (c.month === 11 ? { year: c.year + 1, month: 0 } : { ...c, month: c.month + 1 })); }} title="Mes siguiente"><ChevronRight size={14} /></button>
          </span>
        </div>
        <div className="mini-month-grid">
          {labels.map((w) => <span key={w} className="mini-wd">{w.slice(0, 1)}</span>)}
          {monthGrid.map((cell) => {
            const has = (tasksByDate[cell.iso] || []).some((t) => t.status !== "Hecho");
            return (
              <button
                key={cell.iso}
                className={`mini-day ${!cell.inMonth ? "mini-day--out" : ""} ${cell.iso === today ? "mini-day--today" : ""} ${cell.iso === selectedDay ? "mini-day--selected" : ""}`}
                onClick={() => focusDay(cell.iso)}
              >
                {cell.day}
                {has && <span className="mini-dot" />}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  function renderCalSidePanel() {
    const dayTasks = tasksByDate[selectedDay] || [];
    const rel = relativeDayLabel(selectedDay);
    const holidayName = isHoliday(selectedDay, holidayCountry);
    return (
      <aside className="cal-side">
        {renderMiniMonth()}

        {calView !== "dia" && (
          <section className={`cal-side-section ${calDropTarget === selectedDay ? "cal-side-section--drop" : ""}`} {...calDropProps(selectedDay)}>
            <div className="cal-side-day-head">
              <div>
                <div className="cal-side-day-title">{rel ? `${rel}, ` : ""}{longDateLabel(selectedDay).replace(/^./, (c) => (rel ? c.toLowerCase() : c))}</div>
                {holidayName && <div className="cal-side-holiday">{holidayName}</div>}
              </div>
              <span className="cal-side-count">{dayTasks.filter((t) => t.status !== "Hecho").length}</span>
            </div>
            <div className="cal-side-add">
              <Plus size={14} />
              <input
                type="text"
                placeholder="Agregar a este día"
                value={dayQuickTitle}
                onChange={(e) => setDayQuickTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addTaskForFocusedDay()}
              />
            </div>
            <div className="cal-side-list">
              {dayTasks.length === 0 && <div className="cal-side-empty">Día libre. Escribí arriba o arrastrá una tarea acá.</div>}
              {dayTasks.map((t) => renderAgendaRow(t))}
            </div>
          </section>
        )}

        <section className={`cal-side-section cal-side-section--undated ${calDropTarget === "undated" ? "cal-side-section--drop" : ""}`} {...calDropProps("undated")}>
          <button className="cal-side-toggle" onClick={() => setCalUndatedOpen((v) => !v)}>
            <Inbox size={14} />
            <span>Sin fecha</span>
            <span className="cal-side-count">{undatedTasks.length}</span>
            <span className="cal-side-toggle-chev">{calUndatedOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
          </button>
          {calUndatedOpen && (
            <div className="cal-side-list">
              {undatedTasks.length === 0
                ? <div className="cal-side-empty">Todo tiene fecha. Arrastrá una tarea acá para sacársela.</div>
                : <>
                    <div className="cal-side-hint">Arrastralas a un día para agendarlas.</div>
                    {undatedTasks.map((t) => renderAgendaRow(t))}
                  </>}
            </div>
          )}
        </section>
      </aside>
    );
  }

  function renderCalPopover() {
    if (!calPopover) return null;
    const vw = window.innerWidth, vh = window.innerHeight;
    if (calPopover.kind === "day") {
      const list = tasksByDate[calPopover.id] || [];
      const w = Math.max(240, Math.min(300, (calPopover.w || 240) + 40));
      const left = Math.min(Math.max(8, calPopover.x - 20), vw - w - 8);
      const top = Math.min(calPopover.y - 6, vh - 360);
      return createPortal(
        <>
          <div className="cal-pop-scrim" onClick={() => setCalPopover(null)} />
          <div className="cal-pop cal-pop--day" style={{ left, top, width: w }} onClick={(e) => e.stopPropagation()}>
            <div className="cal-pop-day-head">
              <span>{longDateLabel(calPopover.id)}</span>
              <button className="cal-pop-close" onClick={() => setCalPopover(null)}><X size={14} /></button>
            </div>
            <div className="cal-pop-day-list">{list.map((t) => renderCalChip(t, { wrap: true }))}</div>
          </div>
        </>,
        document.body
      );
    }
    const t = tasks.find((x) => x.id === calPopover.id);
    if (!t) return null;
    const a = areaMap[t.areaId];
    const p = t.projectId ? a?.projects?.find((x) => x.id === t.projectId) : null;
    const w = 300;
    const left = Math.min(Math.max(8, calPopover.x), vw - w - 8);
    const fitsBelow = calPopover.y + 250 < vh;
    const style = fitsBelow ? { left, top: calPopover.y + 6, width: w } : { left, bottom: vh - calPopover.top + 6, width: w };
    return createPortal(
      <>
        <div className="cal-pop-scrim" onClick={() => { commitCalPopTitle(t.id); setCalPopover(null); }} />
        <div className="cal-pop cal-pop--task tt-portal" style={{ ...style, "--chip": a?.color || "#8d94a0" }} onClick={(e) => e.stopPropagation()}>
          <div className="cal-pop-area">
            <span className="cal-pop-area-dot" />
            {a?.name}{p ? ` / ${p.name}` : ""}
            <button className="cal-pop-close" onClick={() => { commitCalPopTitle(t.id); setCalPopover(null); }}><X size={14} /></button>
          </div>
          <textarea
            className="cal-pop-title"
            rows={Math.max(1, Math.min(4, Math.ceil(calPopTitle.length / 30)))}
            value={calPopTitle}
            onChange={(e) => setCalPopTitle(e.target.value)}
            onBlur={() => commitCalPopTitle(t.id)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitCalPopTitle(t.id); e.currentTarget.blur(); } }}
          />
          {t.note && <div className="cal-pop-note">{t.note}</div>}
          <div className="cal-pop-fields">
            <span className="cal-pop-label">Estado</span>
            <StatusPill value={t.status} onClick={() => cycleStatus(t.id)} />
            <span className="cal-pop-label">Prioridad</span>
            <span><PriorityBadge value={t.priority} onClick={() => cyclePriority(t.id)} /></span>
            <span className="cal-pop-label">Fecha</span>
            <DateField value={t.date} onChange={(v) => setDate(t.id, v)} overdue={isOverdue(t.date, t.status)} weekStartsSunday={weekStartsSunday} />
          </div>
          <div className="cal-pop-actions">
            {t.date && t.date !== todayISO() && (
              <button className="cal-pop-btn" onClick={() => calSetTaskDate(t.id, todayISO())}><ArrowRight size={13} /> Pasar a hoy</button>
            )}
            {t.date && (
              <button className="cal-pop-btn" onClick={() => { calSetTaskDate(t.id, null); setCalPopover(null); }}><CalendarX size={13} /> Quitar fecha</button>
            )}
            <span style={{ flex: 1 }} />
            <button className="cal-pop-btn cal-pop-btn--danger" onClick={() => { setCalPopover(null); setDeleteTarget({ type: "task", id: t.id }); }} title="Eliminar"><Trash2 size={13} /></button>
          </div>
        </div>
      </>,
      document.body
    );
  }

  function renderCalendar() {
    const today = todayISO();
    const labels = weekStartsSunday ? WEEKDAY_LABELS_SUN_FIRST : WEEKDAY_LABELS;
    const weeks = monthGrid.length / 7;
    const maxChips = weeks >= 6 ? 3 : 4;
    const isWeekendIdx = (i) => (weekStartsSunday ? i === 0 || i === 6 : i >= 5);

    let title;
    if (calView === "mes") title = `${MONTH_LABELS[calCursor.month]} ${calCursor.year}`;
    else if (calView === "semana") {
      const a = weekDays[0].iso.split("-").map(Number), b = weekDays[6].iso.split("-").map(Number);
      title = a[1] === b[1]
        ? `${a[2]} – ${b[2]} de ${MONTH_LABELS[a[1] - 1].toLowerCase()} ${a[0]}`
        : `${a[2]} ${MONTH_ABBR[a[1] - 1].toLowerCase()} – ${b[2]} ${MONTH_ABBR[b[1] - 1].toLowerCase()} ${b[0]}`;
    } else title = longDateLabel(selectedDay);

    const dayCellHandlers = (iso) => ({
      onClick: () => { focusDay(iso); setCalPopover(null); },
      onDoubleClick: (e) => { if (e.target.closest(".cal-chip")) return; focusDay(iso); setCalAddDay(iso); setCalAddText(""); },
      ...calDropProps(iso),
    });

    return (
      <div className="calendar-wrap">
        <div className="cal-main">
          <div className="cal-toolbar">
            <div className="cal-title-wrap month-picker-wrap" ref={monthPickerRef}>
              <button
                className="cal-title"
                onClick={() => (showMonthPicker ? setShowMonthPicker(false) : openMonthPicker())}
                title="Elegir mes"
              >
                {title}
                <ChevronDown size={16} className="cal-title-chev" />
              </button>
              {showMonthPicker && (
                <div className="month-picker-pop">
                  <div className="month-picker-header">
                    <button className="cal-nav-btn" onClick={() => setPickerYear((y) => y - 1)}><ChevronLeft size={14} /></button>
                    <span className="month-picker-year">{pickerYear}</span>
                    <button className="cal-nav-btn" onClick={() => setPickerYear((y) => y + 1)}><ChevronRight size={14} /></button>
                  </div>
                  <div className="month-picker-grid">
                    {MONTH_ABBR.map((m, i) => (
                      <button
                        key={m}
                        className={`month-picker-cell ${pickerYear === calCursor.year && i === calCursor.month ? "month-picker-cell--selected" : ""}`}
                        onClick={() => pickMonth(i)}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="cal-nav">
              <button className="cal-nav-btn" onClick={() => goPrevNext(-1)} title="Anterior (RePág)"><ChevronLeft size={16} /></button>
              <button className="cal-today-btn" onClick={goToday} title="Ir a hoy (T)">Hoy</button>
              <button className="cal-nav-btn" onClick={() => goPrevNext(1)} title="Siguiente (AvPág)"><ChevronRight size={16} /></button>
            </div>
            <div className="cal-toolbar-spacer" />
            <div className="cal-view-switch" role="tablist">
              {[["mes", "Mes", "M"], ["semana", "Semana", "S"], ["dia", "Día", "D"]].map(([k, label, key]) => (
                <button key={k} role="tab" aria-selected={calView === k} className={`seg-btn ${calView === k ? "seg-btn--active" : ""}`} onClick={() => switchCalView(k)} title={`${label} (${key})`}>{label}</button>
              ))}
            </div>
          </div>

          {calView === "mes" && (
            <div className="cal-month" style={{ "--weeks": weeks }}>
              <div className="cal-month-head">
                {labels.map((w, i) => <div key={w} className={`cal-weekday ${isWeekendIdx(i) ? "cal-weekday--weekend" : ""}`}>{w}</div>)}
              </div>
              <div className="cal-month-body">
                {monthGrid.map((cell, idx) => {
                  const dayTasks = tasksByDate[cell.iso] || [];
                  const isToday = cell.iso === today;
                  const isSelected = cell.iso === selectedDay;
                  const holidayName = isHoliday(cell.iso, holidayCountry);
                  const cap = maxChips - (holidayName ? 1 : 0);
                  const shown = dayTasks.length > cap ? dayTasks.slice(0, cap - 1) : dayTasks;
                  const hidden = dayTasks.length - shown.length;
                  return (
                    <div
                      key={cell.iso}
                      className={`cal-cell ${!cell.inMonth ? "cal-cell--out" : ""} ${isWeekendIdx(idx % 7) ? "cal-cell--weekend" : ""} ${isToday ? "cal-cell--today" : ""} ${isSelected ? "cal-cell--selected" : ""} ${holidayName ? "cal-cell--holiday" : ""} ${calDropTarget === cell.iso ? "cal-cell--drop" : ""} ${cell.iso < today && cell.inMonth ? "cal-cell--past" : ""}`}
                      {...dayCellHandlers(cell.iso)}
                    >
                      <div className="cal-cell-head">
                        <span className="cal-cell-num">{cell.day === 1 && !cell.inMonth ? `${cell.day} ${MONTH_ABBR[Number(cell.iso.slice(5, 7)) - 1].toLowerCase()}` : cell.day}</span>
                        <button
                          className="cal-cell-add"
                          title="Agregar tarea"
                          onClick={(e) => { e.stopPropagation(); focusDay(cell.iso); setCalAddDay(cell.iso); setCalAddText(""); }}
                        ><Plus size={13} /></button>
                      </div>
                      {holidayName && <div className="cal-cell-holiday" title={holidayName}>{holidayName}</div>}
                      <div className="cal-cell-tasks">
                        {shown.map((t) => renderCalChip(t))}
                        {hidden > 0 && (
                          <button className="cal-more" onClick={(e) => openCalDayPopover(e, cell.iso)}>{hidden} más</button>
                        )}
                        {renderCalInlineAdd(cell.iso)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {calView === "semana" && (
            <div className="cal-week">
              {weekDays.map((d, i) => {
                const dayTasks = tasksByDate[d.iso] || [];
                const isToday = d.iso === today;
                const holidayName = isHoliday(d.iso, holidayCountry);
                return (
                  <div
                    key={d.iso}
                    className={`cal-week-col ${isWeekendIdx(i) ? "cal-cell--weekend" : ""} ${isToday ? "cal-cell--today" : ""} ${d.iso === selectedDay ? "cal-cell--selected" : ""} ${calDropTarget === d.iso ? "cal-cell--drop" : ""} ${d.iso < today ? "cal-cell--past" : ""}`}
                    {...dayCellHandlers(d.iso)}
                  >
                    <div className="cal-week-head">
                      <span className="cal-week-wd">{labels[i]}</span>
                      <span className="cal-week-num">{d.day}</span>
                    </div>
                    {holidayName && <div className="cal-week-holiday">{holidayName}</div>}
                    <div className="cal-week-tasks">
                      {dayTasks.map((t) => renderCalChip(t, { wrap: true }))}
                      {renderCalInlineAdd(d.iso)}
                      {calAddDay !== d.iso && (
                        <button className="cal-week-add" onClick={(e) => { e.stopPropagation(); focusDay(d.iso); setCalAddDay(d.iso); setCalAddText(""); }}>
                          <Plus size={13} /> Agregar
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {calView === "dia" && (() => {
            const dayTasks = tasksByDate[selectedDay] || [];
            const pending = dayTasks.filter((t) => t.status !== "Hecho");
            const done = dayTasks.filter((t) => t.status === "Hecho");
            const holidayName = isHoliday(selectedDay, holidayCountry);
            const rel = relativeDayLabel(selectedDay);
            const showOverdue = selectedDay === today && overdueBeforeToday.length > 0;
            return (
              <div className={`cal-day-view ${calDropTarget === selectedDay ? "cal-day-view--drop" : ""}`} {...calDropProps(selectedDay)}>
                <div className="cal-day-hero">
                  <span className={`cal-day-hero-num ${selectedDay === today ? "cal-day-hero-num--today" : ""}`}>{Number(selectedDay.slice(8))}</span>
                  <div>
                    <div className="cal-day-hero-wd">{rel || weekdayFullOf(selectedDay)}</div>
                    <div className="cal-day-hero-sub">
                      {`${Number(selectedDay.slice(8))} de ${MONTH_LABELS[Number(selectedDay.slice(5, 7)) - 1].toLowerCase()} de ${selectedDay.slice(0, 4)}`}
                      {holidayName && <span className="cal-day-hero-holiday">{holidayName}</span>}
                    </div>
                  </div>
                  <span style={{ flex: 1 }} />
                  <span className="cal-day-hero-count">{pending.length} {pending.length === 1 ? "pendiente" : "pendientes"}</span>
                </div>
                <div className="cal-day-add">
                  <Plus size={16} />
                  <input
                    type="text"
                    placeholder={`Agregar tarea para ${rel ? rel.toLowerCase() : "este día"}`}
                    value={dayQuickTitle}
                    onChange={(e) => setDayQuickTitle(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addTaskForFocusedDay()}
                  />
                </div>
                <div className="cal-day-list">
                  {pending.length === 0 && done.length === 0 && (
                    <div className="cal-day-empty">Nada agendado. Agregá una tarea arriba o arrastrá una desde "Sin fecha".</div>
                  )}
                  {pending.map((t) => renderAgendaRow(t, { big: true }))}
                  {done.length > 0 && <div className="cal-day-subhead">Hechas</div>}
                  {done.map((t) => renderAgendaRow(t, { big: true }))}
                </div>
                {showOverdue && (
                  <div className="cal-day-overdue">
                    <div className="cal-day-subhead cal-day-subhead--bad">
                      Atrasadas <span>{overdueBeforeToday.length}</span>
                      <span style={{ flex: 1 }} />
                      <button
                        className="cal-pop-btn"
                        onClick={() => { overdueBeforeToday.forEach((t) => setDate(t.id, today)); showToast(`${overdueBeforeToday.length} pasadas a hoy`); }}
                      >
                        <ArrowRight size={13} /> Pasar todas a hoy
                      </button>
                    </div>
                    {overdueBeforeToday.map((t) => renderAgendaRow(t, { big: true, showDate: true }))}
                  </div>
                )}
              </div>
            );
          })()}

          <div className="cal-footer-hint">
            Doble clic en un día para agregar · arrastrá tareas para cambiarles la fecha · flechas para moverte, T para hoy
          </div>
        </div>
        {renderCalSidePanel()}
        {renderCalPopover()}
      </div>
    );
  }

  function renderTaskTable(list, { showArea = false, showHeader = false, indent = false } = {}) {
    return (
      <table>
        {colGroupFor(showArea)}
        {showHeader && (
          <thead>
            <tr>
              <th>Tarea</th>
              {showArea && <th>Área</th>}
              <th className="col-center">Detalle</th>
              <th className="col-center">Estado</th>
              <th className="col-center">Prioridad</th>
              <th className="col-center">Fecha</th>
              <th></th>
            </tr>
          </thead>
        )}
        <tbody>
          {list.map((t) => {
            const taskArea = areaMap[t.areaId];
            const taskProject = t.projectId ? taskArea?.projects?.find((p) => p.id === t.projectId) : null;
            return (
              <tr
                key={t.id}
                draggable={editingTitleId !== t.id && editingNoteId !== t.id}
                className={`${draggedTaskId === t.id ? "row-dragging" : ""} ${dragOverKey === `task:${t.id}` ? "row-drag-over" : ""}`}
                onDragStart={(e) => { setDraggedTaskId(t.id); e.dataTransfer.effectAllowed = "move"; }}
                onDragEnd={() => { setDraggedTaskId(null); setDragOverKey(null); }}
                onDragOver={(e) => { if (draggedTaskId && draggedTaskId !== t.id) { e.preventDefault(); e.stopPropagation(); setDragOverKey(`task:${t.id}`); } }}
                onDrop={(e) => { e.preventDefault(); e.stopPropagation(); reorderTask(draggedTaskId, t.id); }}
              >
                <td className={`td-title ${indent ? "td-indent" : ""}`} onDoubleClick={() => { if (editingTitleId !== t.id) setEditingTitleId(t.id); }}>
                  <div className="td-title-row">
                    <button className="row-check" onClick={() => mobileToggleDone(t.id, t.status === "Hecho")}>
                      {t.status === "Hecho" || mobileCompletingIds.has(t.id)
                        ? <CheckCircle2 size={14} color="var(--good)" />
                        : <Circle size={14} color="var(--text-faint)" />}
                    </button>
                    {editingTitleId === t.id ? (
                    <input
                      autoFocus
                      className="title-input"
                      defaultValue={t.title}
                      ref={(el) => {
                        if (el && focusEndRef.current) {
                          focusEndRef.current = false;
                          const len = el.value.length;
                          el.focus();
                          el.setSelectionRange(len, len);
                        }
                      }}
                      onBlur={(e) => desktopBlurTitleEditing(t.id, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { e.preventDefault(); titleKeyHandledRef.current = t.id; commitTitleAndAddNext(t, e.target.value); }
                        if (e.key === "Escape") { titleKeyHandledRef.current = t.id; handleTitleEscape(t.id); }
                        if (e.key === "Backspace" && e.target.value === "") {
                          if (backspaceMergeWithPrevious(t, titleKeyHandledRef)) e.preventDefault();
                        }
                      }}
                    />
                  ) : (
                    <span className={`task-title ${t.status === "Hecho" ? "task-title--done" : ""}`}>
                      {t.title}
                    </span>
                  )}
                  </div>
                </td>
                {showArea && (
                  <td>
                    <span className="area-tag">
                      <span className="area-tag-dot" style={{ background: taskArea?.color || "var(--text-faint)" }} />
                      {taskArea?.name || "—"}{taskProject ? ` · ${taskProject.name}` : ""}
                    </span>
                  </td>
                )}
                <td className="td-detalle">
                  {editingNoteId === t.id ? (
                    <input
                      ref={noteInputRef}
                      autoFocus
                      className="note-input"
                      defaultValue={t.note}
                      onBlur={(e) => { setNote(t.id, e.target.value); setEditingNoteId(null); }}
                      onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
                    />
                  ) : t.note ? (
                    <button className="note-btn" onClick={() => setEditingNoteId(t.id)}>
                      <span className="note-text">{t.note}</span>
                    </button>
                  ) : (
                    <button className="note-btn" onClick={() => setEditingNoteId(t.id)}>+ nota</button>
                  )}
                </td>
                <td className="col-center"><StatusPill value={t.status} onClick={() => cycleStatus(t.id)} /></td>
                <td className="col-center"><PriorityBadge value={t.priority} onClick={() => cyclePriority(t.id)} /></td>
                <td className="col-center">
                  <DateField
                    value={t.date}
                    onChange={(v) => setDate(t.id, v)}
                    overdue={isOverdue(t.date, t.status)}
                    weekStartsSunday={weekStartsSunday}
                  />
                </td>
                <td><button className="row-del" onClick={() => removeTask(t.id)}><Trash2 size={14} /></button></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  }

  if (bootStatus === "checking-session" || bootStatus === "loading") {
    return (
      <div className="tt-root boot-screen">
        <style>{BOOT_STYLES}</style>
        <div className="boot-msg mono">Cargando...</div>
      </div>
    );
  }

  if (bootStatus === "auth") {
    return (
      <div className="tt-root boot-screen">
        <style>{BOOT_STYLES}</style>
        <div className="auth-card">
          <div className="brand"><span className="brand-dot" />Task App</div>

          <input
            type="email"
            className="auth-input"
            placeholder="Email"
            value={authEmail}
            onChange={(e) => setAuthEmail(e.target.value)}
            autoFocus
          />
          <input
            type="password"
            className="auth-input"
            placeholder="Contraseña"
            value={authPassword}
            onChange={(e) => setAuthPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (authView === "login" ? handleEmailSignIn() : handleEmailSignUp())}
          />

          {authError && <div className="auth-error">{authError}</div>}
          {authNotice && <div className="auth-notice">{authNotice}</div>}

          <button className="auth-btn" disabled={authBusy} onClick={authView === "login" ? handleEmailSignIn : handleEmailSignUp}>
            {authBusy ? "Un momento..." : authView === "login" ? "Ingresar" : "Crear cuenta"}
          </button>

          <button
            className="auth-switch"
            onClick={() => { setAuthView(authView === "login" ? "signup" : "login"); setAuthError(""); setAuthNotice(""); }}
          >
            {authView === "login" ? "¿No tenés cuenta? Creá una" : "¿Ya tenés cuenta? Ingresá"}
          </button>

          <div className="auth-divider"><span>o</span></div>

          <button className="auth-guest-btn" disabled={authBusy} onClick={handleGuestLogin}>
            Probar sin cuenta
          </button>
          <p className="auth-guest-hint">Entrás directo, sin registrarte. Tus datos quedan atados a este navegador.</p>
        </div>
      </div>
    );
  }

  if (bootStatus === "enc-unlock") {
    return (
      <div className="tt-root boot-screen">
        <style>{BOOT_STYLES}</style>
        <div className="auth-card">
          <div className="brand"><span className="brand-dot" />Task App</div>
          <div className="modal-text" style={{ marginBottom: 16 }}>
            Tus datos están cifrados. Ingresá tu contraseña de cifrado para desbloquearlos.
          </div>
          <input
            type="password"
            className="auth-input"
            placeholder="Contraseña de cifrado"
            value={encPass}
            onChange={(e) => setEncPass(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleEncUnlock()}
            autoFocus
          />
          {encError && <div className="auth-error">{encError}</div>}
          <button className="auth-btn" disabled={encBusy} onClick={handleEncUnlock}>
            {encBusy ? "Desbloqueando..." : "Desbloquear"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="tt-root">
      <style>{`
        :root, .tt-root {
          --bg: #0f1116;
          --side: #12141a;
          --surface: #161921;
          --surface-2: #1d212b;
          --surface-3: #262b37;
          --weekend: rgba(0,0,0,0.16);
          --border: rgba(255,255,255,0.075);
          --border-strong: rgba(255,255,255,0.13);
          --text: #eceef3;
          --text-dim: #9ba2b0;
          --text-faint: #646c7a;
          --amber: #f2ab43;
          --amber-soft: rgba(242,171,67,0.13);
          --amber-line: rgba(242,171,67,0.5);
          --blue: #5b97ff;
          --alta: #f25f55;
          --media: #f2ab43;
          --baja: #646c7a;
          --good: #3ecf6a;
          --radius-lg: 14px;
          --shadow-pop: 0 20px 50px -12px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.07);
          --font: 'Geist', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        }
        .tt-root {
          position: relative;
          font-family: var(--font);
          font-feature-settings: "ss01", "cv11";
          -webkit-font-smoothing: antialiased;
          background: var(--bg);
          color: var(--text);
          display: flex;
          flex-direction: column;
          height: 100vh;
          height: 100dvh;
          min-height: 640px;
          overflow: hidden;
          text-align: left;
        }
        .tt-root button, .tt-root input, .tt-root select, .tt-root textarea { font-family: inherit; }
        .tt-root :focus-visible { outline: 2px solid var(--amber-line); outline-offset: 1px; }
        .tt-root * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 10px; height: 10px; }
        ::-webkit-scrollbar-track { background: var(--bg); }
        ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 999px; border: 2px solid var(--bg); }
        ::-webkit-scrollbar-thumb:hover { background: var(--text-faint); }
        ::-webkit-scrollbar-corner { background: var(--bg); }
        .mono { font-variant-numeric: tabular-nums; }
        .tt-body { display: flex; flex: 1; min-height: 0; }

        /* ---- sidebar ---- */
        .sidebar {
          width: 248px;
          flex-shrink: 0;
          background: var(--side);
          border-right: 1px solid var(--border);
          display: flex;
          flex-direction: column;
          padding: 18px 12px 12px;
          overflow-y: auto;
        }
        .brand { display: flex; align-items: center; gap: 8px; padding: 4px 6px 20px; font-weight: 600; font-size: 17px; letter-spacing: -0.01em; }
        .brand-dot { width: 9px; height: 9px; border-radius: 3px; background: var(--amber); box-shadow: 0 0 0 3px rgba(242,171,67,0.16); transform: rotate(45deg); }
        .side-label { font-size: 12.5px; color: var(--text-faint); font-weight: 600; letter-spacing: 0.06em; padding: 0 6px; margin: 14px 0 6px; }
        .side-label-row { display: flex; align-items: center; justify-content: space-between; margin: 14px 0 6px; padding: 0 2px 0 6px; }
        .side-label-row .side-label { margin: 0; padding: 0; }
        .side-label-action { background: none; border: none; color: var(--text-faint); cursor: pointer; padding: 3px; border-radius: 5px; display: flex; }
        .side-label-action:hover { color: var(--text-dim); background: var(--surface-2); }
        .fav-star-btn { background: none; border: none; padding: 2px; color: var(--text-faint); display: flex; flex-shrink: 0; }
        .fav-star-btn--active { color: var(--amber); }
        .side-item {
          display: flex; align-items: center; justify-content: space-between;
          padding: 7px 9px; border-radius: 8px; font-size: 14px; color: var(--text-dim);
          cursor: pointer; margin-bottom: 2px; transition: background .12s, color .12s;
          user-select: none;
        }
        .side-item:hover { background: rgba(255,255,255,0.04); color: var(--text); }
        .side-item--active { background: var(--surface-2); color: var(--text); font-weight: 500; }
        .side-item--active .side-item-left > svg { color: var(--amber); }
        .side-item--disabled { cursor: default; opacity: 0.45; }
        .side-item--disabled:hover { background: none; color: var(--text-dim); }
        .side-item-left { display: flex; align-items: center; gap: 9px; min-width: 0; flex: 1; }
        .side-item-right { display: flex; align-items: center; gap: 2px; flex-shrink: 0; }
        .side-item-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-transform: uppercase; }
        .side-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; border: none; padding: 0; cursor: pointer; }
        .side-dot-wrap { position: relative; display: flex; }
        .side-count { font-size: 12px; color: var(--text-dim); font-weight: 700; margin-right: 4px; min-width: 16px; text-align: right; }
        .side-item--active .side-count { color: var(--text); }
        .add-area-btn, .add-project-btn {
          margin-top: 10px; padding: 8px; border-radius: 7px; border: 1px dashed var(--border);
          background: transparent; color: var(--text-faint); font-size: 13.5px; cursor: pointer;
          display: flex; align-items: center; justify-content: center; gap: 6px;
        }
        .add-area-btn:hover, .add-project-btn:hover { color: var(--text-dim); border-color: var(--text-faint); }
        .sidebar-spacer { flex: 1; }
        .account-row {
          display: flex; align-items: center; justify-content: space-between; gap: 10px;
          padding: 12px; border-top: 1px solid var(--border);
        }
        .account-name { font-size: 13px; color: var(--text-dim); font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 150px; }
        .account-sub { font-size: 11px; color: var(--text-faint); margin-top: 2px; }
        .account-logout {
          background: none; border: 1px solid var(--border); border-radius: 7px; color: var(--text-faint);
          font-size: 11.5px; padding: 5px 10px; cursor: pointer; flex-shrink: 0;
        }
        .account-logout:hover { color: var(--alta); border-color: rgba(242,95,85,0.4); }
        .notif-toggle-row {
          display: flex; align-items: center; justify-content: space-between; gap: 10px;
          padding: 12px; margin-top: 8px; border-top: 1px solid var(--border);
        }
        .notif-toggle-title { font-size: 13.5px; color: var(--text-dim); font-weight: 600; }
        .notif-toggle-sub { font-size: 12px; color: var(--text-faint); margin-top: 2px; }
        .switch {
          width: 34px; height: 20px; border-radius: 999px; background: var(--surface-2); border: 1px solid var(--border);
          padding: 2px; cursor: pointer; flex-shrink: 0; display: flex; align-items: center;
        }
        .switch-knob { width: 14px; height: 14px; border-radius: 50%; background: var(--text-faint); transition: transform .15s, background .15s; }
        .switch--on { background: rgba(91,151,255,0.25); border-color: rgba(91,151,255,0.5); }
        .switch--on .switch-knob { background: var(--blue); transform: translateX(14px); }

        .rename-input, .rename-project-input {
          background: var(--surface-2); border: 1px solid var(--amber); border-radius: 5px;
          color: var(--text); font-size: 14px; padding: 3px 6px; width: 100%; outline: none;
        }
        .area-edit-btn {
          background: none; border: none; color: var(--text-faint); cursor: pointer;
          padding: 3px; border-radius: 5px; opacity: 0; flex-shrink: 0; display: flex;
        }
        .side-item:hover .area-edit-btn { opacity: 1; }
        .area-edit-btn:hover { color: var(--text); background: var(--border); }
        .area-edit-btn--danger:hover { color: var(--alta); background: rgba(242,95,85,0.14); }
        .new-area-input {
          margin-top: 10px; background: var(--surface-2); border: 1px solid var(--amber);
          border-radius: 7px; color: var(--text); font-size: 13.5px; padding: 8px; width: 100%; outline: none;
        }

        .project-list { margin: 2px 0 6px 20px; padding-left: 10px; border-left: 1px solid var(--border); display: flex; flex-direction: column; gap: 1px; }
        .project-item {
          display: flex; align-items: center; gap: 8px; padding: 5px 7px; border-radius: 6px;
          font-size: 13px; color: var(--text-dim); cursor: pointer;
        }
        .project-item:hover { background: var(--surface-2); color: var(--text); }
        .project-item:hover .area-edit-btn { opacity: 1; }
        .project-item--active { background: var(--surface-2); color: var(--text); }
        .project-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
        .project-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-transform: uppercase; }
        .project-count { font-size: 11.5px; color: var(--text-faint); font-weight: 400; min-width: 16px; text-align: right; margin-right: 4px; }
        .new-project-input { margin: 3px 0 6px 20px; width: calc(100% - 20px); background: var(--surface-2); border: 1px solid var(--amber); border-radius: 6px; color: var(--text); font-size: 13px; padding: 6px 8px; outline: none; }
        .add-project-btn { margin: 2px 0 8px 20px; padding: 5px 8px; font-size: 12.5px; width: calc(100% - 20px); }

        .popover-scrim { position: fixed; inset: 0; z-index: 60; background: transparent; }
        .color-popover {
          position: absolute; top: 20px; left: 0; z-index: 61; width: 130px;
          background: var(--surface-2); border: 1px solid var(--border); border-radius: 10px;
          padding: 8px; display: flex; flex-wrap: wrap; gap: 6px; box-shadow: var(--shadow-pop);
        }
        .color-swatch { width: 20px; height: 20px; border-radius: 50%; border: 1px solid rgba(255,255,255,0.18); cursor: pointer; padding: 0; transition: transform .1s; }
        .color-swatch:hover { transform: scale(1.15); }

        /* ---- main ---- */
        .main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
        .topbar { display: flex; align-items: center; gap: 8px; height: 60px; flex-shrink: 0; padding: 0 20px; border-bottom: 1px solid var(--border); }
        .topbar h1 {
          font-size: 17.5px; font-weight: 600; margin: 0; letter-spacing: -0.01em;
          width: 155px; flex-shrink: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .search-wrap {
          display: flex; align-items: center; gap: 7px; background: var(--surface); border: 1px solid var(--border);
          border-radius: 9px; height: 32px; padding: 0 11px; flex: 1; min-width: 130px; max-width: 320px; margin-left: 6px; transition: border-color .12s;
        }
        .search-wrap:focus-within { border-color: var(--amber-line); }
        .search-wrap input { background: none; border: none; outline: none; color: var(--text); font-size: 13.5px; width: 100%; }
        .search-wrap input::placeholder { color: var(--text-faint); }
        .fav-filter-btn { display: flex; align-items: center; gap: 6px; }
        .fav-filter-btn--active { color: var(--amber); border-color: rgba(242,171,67,0.4); background: rgba(242,171,67,0.08); }
        .topbar-spacer { flex: 1; }
        .counter { font-size: 12.5px; height: 32px; padding: 0 11px; border-radius: 9px; background: var(--surface); border: 1px solid var(--border); cursor: pointer; font-family: inherit; color: var(--text-dim); display: flex; gap: 5px; align-items: center; white-space: nowrap; flex-shrink: 0; }
        .counter b { color: var(--text); font-weight: 700; }
        .counter--warn b { color: var(--alta); }
        .counter--clickable { cursor: pointer; }
        .counter--clickable:hover { border-color: var(--border-strong); }
        .counter--active { border-color: var(--amber); background: rgba(242,171,67,0.08); }
        .iconbtn {
          display: flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--text-dim); background: var(--surface);
          border: 1px solid var(--border); border-radius: 9px; height: 32px; padding: 0 11px; cursor: pointer; white-space: nowrap;
          transition: color .12s, border-color .12s, background .12s;
        }
        .iconbtn:hover { color: var(--text); border-color: var(--border-strong); }
        .iconbtn--active { color: var(--amber); border-color: rgba(242,171,67,0.4); background: rgba(242,171,67,0.08); }
        .icon-only { padding: 0; width: 32px; justify-content: center; }
        .sync-indicator { cursor: default; color: var(--text-dim); }
        .sync-indicator--error { color: var(--alta) !important; border-color: rgba(242,95,85,0.4) !important; }
        .m-fav-btn--active { color: var(--amber) !important; border-color: rgba(242,171,67,0.4) !important; }
        .sync-indicator:hover { color: var(--text-dim); border-color: var(--border); }
        .lang-select { width: auto; padding: 0 6px 0 9px; cursor: pointer; font-size: 12px; font-weight: 650; }

        .bell-wrap { position: relative; display: inline-flex; }
        .bell-dot { position: absolute; top: 4px; right: 4px; width: 6px; height: 6px; border-radius: 50%; background: var(--alta); border: 1.5px solid var(--surface); }
        .notif-panel {
          position: absolute; top: 34px; right: 0; z-index: 61; width: 280px; max-height: 340px;
          display: flex; flex-direction: column; background: var(--surface-2); border: 1px solid var(--border);
          border-radius: 10px; box-shadow: var(--shadow-pop); overflow: hidden;
        }
        .notif-panel-head { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; font-size: 13px; font-weight: 700; border-bottom: 1px solid var(--border); }
        .notif-panel-count { color: var(--text-faint); font-weight: 400; }
        .notif-panel-list { overflow-y: auto; padding: 6px; display: flex; flex-direction: column; gap: 4px; }
        .notif-panel-empty { padding: 16px; text-align: center; font-size: 13px; color: var(--text-faint); }
        .notif-row { display: flex; flex-direction: column; gap: 3px; padding: 8px 8px; border-radius: 7px; }
        .notif-row:hover { background: var(--surface); }
        .notif-row-title { font-size: 13.5px; color: var(--text); }
        .notif-row-meta { font-size: 12px; color: var(--text-faint); }

        /* ---- input card ---- */
        .input-card { width: calc(100% - 40px); margin: 18px auto; max-width: 1320px; height: 160px; border: 1px solid var(--border); border-radius: var(--radius-lg); overflow: hidden; background: var(--surface); flex-shrink: 0; }
        .tabs { display: flex; border-bottom: 1px solid var(--border); }
        .tab-btn { padding: 11px 16px; font-size: 13.5px; font-weight: 500; color: var(--text-faint); background: none; border: none; cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px; transition: color .12s; }
        .tab-btn:hover { color: var(--text-dim); }
        .tab-btn--active { color: var(--text); border-bottom-color: var(--amber); }
        .input-body { padding: 14px 16px; display: flex; gap: 12px; align-items: flex-start; }
        .input-body textarea {
          flex: 1; background: var(--bg); border: 1px solid var(--border); border-radius: 10px;
          color: var(--text); padding: 10px 12px; font-size: 14px; font-family: inherit; resize: none;
          min-height: 38px; outline: none; line-height: 1.4;
        }
        .input-body textarea:focus { border-color: rgba(242,171,67,0.5); }
        .input-body textarea::placeholder { color: var(--text-faint); }
        .procesar-btn {
          background: var(--amber); color: #1b1304; border: none; border-radius: 10px; padding: 12px 18px;
          font-size: 13.5px; font-weight: 650; cursor: pointer; display: flex; align-items: center; gap: 7px;
          white-space: nowrap; flex-shrink: 0; transition: filter .12s;
        }
        .procesar-btn:hover { filter: brightness(1.08); }
        .procesar-btn:disabled { opacity: 0.55; cursor: default; }
        .spin { animation: tt-spin 0.8s linear infinite; }
        @keyframes tt-spin { to { transform: rotate(360deg); } }
        @keyframes tt-toast-in { from { opacity: 0; transform: translate(-50%, 6px); } }
        .hint-text { padding: 0 16px 12px; font-size: 12.5px; color: var(--text-faint); line-height: 1.5; }
        .manual-form { padding: 14px 16px; display: flex; gap: 10px; flex-wrap: wrap; align-items: flex-start; }
        .manual-form input[type=text] { flex: 1; min-width: 160px; background: var(--surface-2); border: 1px solid var(--border); border-radius: 9px; color: var(--text); padding: 10px 12px; font-size: 14px; outline: none; }
        .manual-form select { background: var(--surface-2); border: 1px solid var(--border); border-radius: 9px; color: var(--text); padding: 10px 12px; font-size: 13.5px; outline: none; }
        .manual-area-fixed { display: flex; align-items: center; gap: 7px; background: var(--surface-2); border: 1px solid var(--border); border-radius: 9px; padding: 10px 12px; font-size: 13.5px; color: var(--text-dim); }

        /* ---- groups / table ---- */
        .groups { flex: 1; overflow-y: auto; width: calc(100% - 40px); max-width: 1320px; margin: 0 auto; padding: 0 0 24px; }
        .groups--first-view { padding-top: 18px; }
        .group { border: 1px solid var(--border); border-radius: var(--radius-lg); margin-bottom: 16px; overflow: hidden; background: var(--surface); }
        .group-head { display: flex; align-items: center; gap: 10px; padding: 14px 18px; cursor: pointer; user-select: none; transition: background .12s; }
        .group-head { background: linear-gradient(90deg, color-mix(in srgb, var(--chip, transparent) 9%, transparent), transparent 45%); }
        .group-head:hover { background-color: rgba(255,255,255,0.02); }
        .group-bar { width: 4px; align-self: stretch; border-radius: 3px; box-shadow: 0 0 12px -2px var(--chip, transparent); }
        .group-name { font-weight: 650; font-size: 14px; letter-spacing: 0.03em; flex: 1; text-transform: uppercase; }
        .group-count { font-size: 12px; font-weight: 500; color: var(--text-dim); background: var(--surface-2); padding: 4px 10px; border-radius: 999px; }
        .chev { color: var(--text-faint); }

        .subgroup { }
        .subgroup-head { display: flex; align-items: center; gap: 8px; padding: 10px 16px; cursor: pointer; user-select: none; }
        .subgroup-head:hover { background: var(--surface-2); }
        .subgroup-dot { width: 6px; height: 6px; border-radius: 50%; }
        .subgroup-name { flex: 1; font-size: 15px; font-weight: 800; letter-spacing: 0.03em; text-transform: uppercase; }
        .subgroup-count { font-size: 12.5px; color: var(--text-dim); background: var(--surface-2); padding: 3px 9px; border-radius: 999px; }
        .subgroup-actions { display: flex; align-items: center; gap: 4px; margin-left: 4px; }
        .subgroup-action-btn { background: none; border: none; padding: 5px; border-radius: 6px; color: var(--text-faint); display: flex; }
        .subgroup-action-btn:hover { color: var(--text); background: var(--surface); }

        .quick-add-row { display: flex; align-items: center; gap: 8px; padding: 9px 16px; border-top: 1px solid var(--border); min-height: 38px; box-sizing: border-box; }
        .quick-add-row--ghost { cursor: text; border-top: 1px solid var(--border); }
        .quick-add-row--indent { padding-left: 40px; }
        .quick-add-input { flex: 1; background: none; border: none; outline: none; color: var(--text-dim); font-size: 13.5px; }
        .quick-add-input::placeholder { color: var(--text-faint); }
        .quick-add-input:focus { color: var(--text); }

        .group-footer { padding: 10px 14px; }
        .panel-add-project-btn {
          display: flex; align-items: center; justify-content: center; gap: 7px; width: 100%; padding: 10px;
          background: var(--surface-2); border: 1px dashed var(--border); border-radius: 9px;
          color: var(--text-dim); font-size: 13px; font-weight: 600; cursor: pointer; text-align: center;
        }
        .panel-add-project-btn:hover { color: var(--amber); border-color: rgba(242,171,67,0.5); }
        .panel-new-project-input {
          width: 100%; padding: 10px 12px; background: var(--surface-2); border: 1px dashed var(--amber); border-radius: 9px;
          color: var(--text); font-size: 13.5px; outline: none;
        }

        table { width: 100%; border-collapse: collapse; table-layout: fixed; }
        thead th { text-align: left; font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-faint); font-weight: 600; padding: 8px 16px; border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); background: rgba(255,255,255,0.012); }
        .area-columns-header { margin-bottom: -1px; }
        tbody tr { border-bottom: 1px solid var(--border); }
        tbody tr:last-child { border-bottom: none; }
        tbody tr { transition: background .1s; }
        tbody tr:hover { background: rgba(255,255,255,0.028); }
        tbody tr:hover .row-del { opacity: 1; }
        tbody tr[draggable] { cursor: grab; }
        tbody tr.row-dragging { opacity: 0.4; }
        tbody tr.row-drag-over { box-shadow: inset 0 2px 0 var(--amber); }
        td { padding: 10px 16px; font-size: 14px; vertical-align: middle; }
        .task-title { color: var(--text); }
        .task-title--done { color: var(--text-faint); text-decoration: line-through; }
        .note-btn { color: var(--text-faint); font-size: 13px; cursor: pointer; background: none; border: none; padding: 0; }
        .note-btn:hover { color: var(--text-dim); }
        .row-check { background: none; border: none; padding: 2px; display: inline-flex; flex-shrink: 0; cursor: pointer; }
        .td-detalle { text-align: center; }
        .td-title { }
        .td-title-row { display: flex; align-items: center; gap: 10px; }
        .td-indent .td-title-row { padding-left: 24px; }
        .col-center { text-align: center; }
        .note-input { background: var(--surface-2); border: 1px solid var(--border); border-radius: 6px; color: var(--text-dim); font-size: 13px; padding: 5px 8px 5px 3px; width: 85%; outline: none; }
        .title-input { background: var(--surface-2); border: 1px solid var(--amber); border-radius: 6px; color: var(--text); font-size: 14px; padding: 5px 8px 5px 3px; width: 100%; flex: 1; min-width: 0; outline: none; }
        .note-text { color: var(--text-dim); font-size: 13.5px; }

        .pill { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; padding: 5px 10px; border-radius: 999px; border: 1px solid var(--border); background: var(--surface-2); color: var(--text-dim); cursor: pointer; }
        .pill--Porhacer { color: var(--text-dim); }
        .pill--Haciendo { color: var(--blue); border-color: rgba(91,151,255,0.35); background: rgba(91,151,255,0.08); }
        .pill--Hecho { color: #34D399; border-color: rgba(52,211,153,0.35); background: rgba(52,211,153,0.08); }

        .badge--priority { border: none; cursor: pointer; font-size: 12px; font-weight: 650; padding: 5px 10px; border-radius: 7px; }
        .badge--Alta { background: rgba(242,95,85,0.14); color: var(--alta); }
        .badge--Media { background: rgba(242,171,67,0.14); color: var(--media); }
        .badge--Baja { background: rgba(86,93,104,0.2); color: var(--text-dim); }

        .datefield { position: relative; display: inline-block; }
        .datefield-btn { background: none; border: none; color: var(--text-dim); font-size: 13.5px; cursor: pointer; padding: 5px 7px; border-radius: 6px; font-variant-numeric: tabular-nums; }
        .datefield-btn:hover { background: var(--surface-2); }
        .datefield-btn--empty { color: var(--text-faint); }
        .datefield-btn--overdue { color: var(--alta); font-weight: 600; }
        .datefield-pop {
          position: fixed; z-index: 200; width: 232px;
          font-family: var(--font);
          background: var(--surface-2); border-radius: 12px; color: var(--text);
          padding: 10px; box-shadow: var(--shadow-pop);
        }
        .datefield-pop-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
        .datefield-pop-label { font-size: 13px; font-weight: 700; color: var(--text); }
        .datefield-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
        .datefield-wd { font-size: 10.5px; color: var(--text-faint); text-align: center; padding: 2px 0; }
        .datefield-day { background: none; border: none; color: var(--text-dim); font-size: 12px; padding: 6px 0; border-radius: 6px; cursor: pointer; font-variant-numeric: tabular-nums; }
        .datefield-day:hover { background: var(--border); }
        .datefield-day--out { opacity: 0.3; }
        .datefield-day--today { color: var(--amber); font-weight: 700; }
        .datefield-day--selected { background: var(--amber); color: #1b1304; font-weight: 700; }
        .datefield-day { font-family: inherit; }
        .datefield-pop-actions { display: flex; justify-content: space-between; margin-top: 8px; border-top: 1px solid var(--border); padding-top: 8px; }
        .datefield-action { background: none; border: none; color: var(--text-dim); font-size: 12px; cursor: pointer; padding: 4px 6px; border-radius: 6px; }
        .datefield-action:hover { background: var(--border); color: var(--text); }

        .row-del { opacity: 0; background: none; border: none; color: var(--text-faint); cursor: pointer; padding: 4px; border-radius: 5px; transition: opacity .12s; }
        .row-del:hover { color: var(--alta); background: rgba(242,95,85,0.1); }

        .group-head--dragover { background: rgba(242,171,67,0.08); box-shadow: inset 0 0 0 1px var(--amber); }
        .subgroup--dragover { background: rgba(242,171,67,0.06); box-shadow: inset 0 0 0 1px var(--amber); }
        .empty-hint { padding: 14px 16px; font-size: 13px; color: var(--text-faint); font-style: italic; }
        .area-tag { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: var(--text-dim); }
        .area-tag-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }

        .panel-add-area-btn {
          display: flex; align-items: center; justify-content: center; gap: 7px; width: 100%; padding: 14px;
          margin-top: 4px; border: 1px dashed var(--border); border-radius: 12px; background: none;
          color: var(--text-faint); font-size: 14px; cursor: pointer;
        }
        .panel-add-area-btn:hover { color: var(--text-dim); border-color: var(--text-faint); }
        .panel-new-area-input {
          width: 100%; padding: 14px 16px; margin-top: 4px; border: 1px dashed var(--amber); border-radius: 12px;
          background: var(--surface); color: var(--text); font-size: 14px; outline: none;
        }

        .empty-state { text-align: center; padding: 60px 20px; color: var(--text-faint); font-size: 14px; }

        .toast {
          position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%); z-index: 90;
          background: var(--surface-3); color: var(--text); font-weight: 500;
          font-size: 13.5px; padding: 10px 16px; border-radius: 11px; box-shadow: var(--shadow-pop);
          animation: tt-toast-in .18s ease-out;
        }

        /* ---- urgent ticker bar ---- */
        .urgent-bar {
          flex-shrink: 0; height: 46px; border-top: 1px solid var(--border); background: var(--side);
          display: flex; align-items: center; gap: 12px; padding: 0 20px;
        }
        .urgent-label { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 800; letter-spacing: 0.06em; color: var(--alta); flex-shrink: 0; }
        .urgent-label--off { color: var(--text-faint); }
        .urgent-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--alta); }
        .urgent-dot--off { background: var(--text-faint); }
        .urgent-empty { font-size: 13px; color: var(--text-faint); }
        .urgent-chip { font-size: 11.5px; font-weight: 650; padding: 3px 9px; border-radius: 999px; flex-shrink: 0; }
        .urgent-chip--vencida { background: rgba(242,95,85,0.16); color: var(--alta); }
        .urgent-chip--hoy { background: rgba(242,171,67,0.16); color: var(--amber); }
        .urgent-chip--manana { background: rgba(91,151,255,0.16); color: var(--blue); }
        .urgent-title { font-size: 14px; font-weight: 600; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .urgent-meta { font-size: 12.5px; color: var(--text-faint); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .urgent-spacer { flex: 1; }
        .urgent-count { font-size: 12px; color: var(--text-faint); flex-shrink: 0; }

        /* ---- calendar ---- */
        .calendar-wrap { flex: 1; min-height: 0; display: flex; }
        .cal-main { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; padding: 16px 20px 10px; }
        .cal-toolbar { display: flex; align-items: center; gap: 14px; margin-bottom: 14px; flex-wrap: wrap; }
        .cal-title-wrap { position: relative; }
        .cal-title {
          display: flex; align-items: center; gap: 6px; background: none; border: none; color: var(--text);
          font: inherit; font-size: 22px; font-weight: 650; letter-spacing: -0.025em; padding: 4px 8px; margin-left: -8px;
          border-radius: 9px; cursor: pointer;
        }
        .cal-title::first-letter { text-transform: uppercase; }
        .cal-title:hover { background: var(--surface); }
        .cal-title-chev { color: var(--text-faint); margin-top: 2px; }
        .cal-nav { display: flex; align-items: center; gap: 2px; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 2px; }
        .cal-nav-btn { width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; border-radius: 7px; border: none; background: none; color: var(--text-dim); cursor: pointer; flex-shrink: 0; }
        .cal-nav-btn:hover { color: var(--text); background: var(--surface-2); }
        .cal-today-btn { height: 28px; padding: 0 12px; border: none; background: none; color: var(--text); font: inherit; font-size: 13px; font-weight: 600; border-radius: 7px; cursor: pointer; }
        .cal-today-btn:hover { background: var(--surface-2); }
        .month-picker-wrap { position: relative; }
        .month-picker-pop {
          position: absolute; top: calc(100% + 6px); left: 0; z-index: 40;
          background: var(--surface-2); border-radius: 12px; padding: 12px; box-shadow: var(--shadow-pop); width: 248px;
        }
        .month-picker-header { display: flex; align-items: center; justify-content: center; gap: 12px; margin-bottom: 10px; }
        .month-picker-year { font-size: 14px; font-weight: 700; min-width: 44px; text-align: center; font-variant-numeric: tabular-nums; }
        .month-picker-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; }
        .month-picker-cell { padding: 9px 0; font: inherit; font-size: 12.5px; font-weight: 600; color: var(--text-dim); background: none; border: none; border-radius: 8px; cursor: pointer; }
        .month-picker-cell:hover { color: var(--text); background: var(--surface-3); }
        .month-picker-cell--selected { background: var(--amber); color: #1b1304; }
        .month-picker-cell--selected:hover { background: var(--amber); color: #1b1304; }
        .cal-view-switch { display: flex; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 2px; }
        .seg-btn { padding: 6px 13px; font: inherit; font-size: 12.5px; font-weight: 500; color: var(--text-dim); background: none; border: none; border-radius: 7px; cursor: pointer; }
        .seg-btn:hover { color: var(--text); }
        .seg-btn--active { background: var(--surface-3); color: var(--text); font-weight: 600; }
        .cal-toolbar-spacer { flex: 1; }
        .cal-footer-hint { font-size: 11.5px; color: var(--text-faint); padding: 8px 2px 0; }

        /* month */
        .cal-month { flex: 1; min-height: 0; display: flex; flex-direction: column; border: 1px solid var(--border); border-radius: var(--radius-lg); overflow: hidden; background: var(--surface); }
        .cal-month-head { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); border-bottom: 1px solid var(--border); }
        .cal-weekday { padding: 9px 12px; font-size: 12px; font-weight: 600; color: var(--text-dim); }
        .cal-weekday--weekend { color: var(--text-faint); }
        .cal-month-body {
          flex: 1; min-height: 0; overflow-y: auto; display: grid;
          grid-template-columns: repeat(7, minmax(0, 1fr)); grid-template-rows: repeat(var(--weeks), minmax(96px, 1fr));
        }
        .cal-cell {
          position: relative; min-width: 0; min-height: 0; overflow: hidden; padding: 6px 6px 6px;
          display: flex; flex-direction: column; gap: 5px; border-right: 1px solid var(--border); border-bottom: 1px solid var(--border);
          transition: background .12s, box-shadow .12s;
        }
        .cal-cell:nth-child(7n) { border-right: none; }
        .cal-cell:nth-last-child(-n+7) { border-bottom: none; }
        .cal-cell--weekend { background: var(--weekend); }
        .cal-cell--selected { background: rgba(242,171,67,0.045); box-shadow: inset 0 0 0 1.5px var(--amber-line); }
        .cal-cell--drop, .cal-week-col.cal-cell--drop { background: var(--amber-soft); box-shadow: inset 0 0 0 2px var(--amber); }
        .cal-cell-head { display: flex; align-items: center; gap: 6px; min-height: 24px; }
        .cal-cell-num {
          height: 24px; min-width: 24px; padding: 0 7px; border-radius: 999px; flex-shrink: 0;
          display: inline-flex; align-items: center; justify-content: center;
          font-size: 12.5px; font-weight: 600; color: var(--text-dim); font-variant-numeric: tabular-nums;
        }
        .cal-cell--past .cal-cell-num { color: var(--text-faint); }
        .cal-cell--out .cal-cell-num { color: var(--text-faint); opacity: 0.7; }
        .cal-cell--out .cal-chip { opacity: 0.5; }
        .cal-cell--holiday .cal-cell-num { color: var(--alta); }
        .cal-cell--today .cal-cell-num { background: var(--amber); color: #1b1304; font-weight: 700; }
        .cal-cell-holiday { margin: -3px 0 0 4px; font-size: 11px; line-height: 1.3; color: var(--alta); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex-shrink: 0; }
        .cal-cell-add {
          margin-left: auto; width: 22px; height: 22px; flex-shrink: 0; border: none; border-radius: 6px; background: none;
          color: var(--text-faint); display: flex; align-items: center; justify-content: center; cursor: pointer; opacity: 0; transition: opacity .12s;
        }
        .cal-cell:hover .cal-cell-add, .cal-cell-add:focus-visible { opacity: 1; }
        .cal-cell-add:hover { background: var(--surface-3); color: var(--text); }
        .cal-cell-tasks { display: flex; flex-direction: column; gap: 3px; min-width: 0; min-height: 0; }

        .cal-chip {
          display: flex; align-items: center; gap: 5px; width: 100%; min-width: 0; flex-shrink: 0; text-align: left;
          font: inherit; font-size: 12px; line-height: 1.3; color: var(--text); padding: 3px 7px 3px 9px;
          border: none; border-radius: 6px; cursor: pointer;
          background: color-mix(in srgb, var(--chip) 15%, transparent); box-shadow: inset 2.5px 0 0 var(--chip);
          transition: background .12s;
        }
        .cal-chip:hover { background: color-mix(in srgb, var(--chip) 26%, transparent); }
        .cal-chip:focus-visible { outline: 2px solid var(--amber); outline-offset: 1px; }
        .cal-chip-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .cal-chip--wrap { align-items: flex-start; padding: 6px 8px 6px 10px; font-size: 12.5px; }
        .cal-chip--wrap .cal-chip-prio { margin-top: 5px; }
        .cal-chip--wrap .cal-chip-text { white-space: normal; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; }
        .cal-chip-prio { width: 6px; height: 6px; border-radius: 50%; background: var(--alta); flex-shrink: 0; }
        .cal-chip--overdue { color: #ffc1bb; }
        .cal-chip--done { background: transparent; color: var(--text-faint); box-shadow: inset 2.5px 0 0 color-mix(in srgb, var(--chip) 35%, transparent); }
        .cal-chip--done .cal-chip-text { text-decoration: line-through; }
        .cal-chip--dragging { opacity: 0.35; }
        .cal-chip--open { box-shadow: inset 2.5px 0 0 var(--chip), 0 0 0 1.5px var(--chip); }
        .cal-more { align-self: flex-start; font: inherit; font-size: 11.5px; font-weight: 600; color: var(--text-dim); background: none; border: none; padding: 2px 8px; border-radius: 6px; cursor: pointer; }
        .cal-more:hover { background: var(--surface-3); color: var(--text); }
        .cal-inline-add {
          width: 100%; flex-shrink: 0; font: inherit; font-size: 12px; background: var(--bg); color: var(--text);
          border: 1px solid var(--amber-line); border-radius: 6px; padding: 4px 7px; outline: none;
        }

        /* week */
        .cal-week { flex: 1; min-height: 0; display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); border: 1px solid var(--border); border-radius: var(--radius-lg); overflow: hidden; background: var(--surface); }
        .cal-week-col { min-width: 0; min-height: 0; display: flex; flex-direction: column; border-right: 1px solid var(--border); transition: background .12s, box-shadow .12s; }
        .cal-week-col:last-child { border-right: none; }
        .cal-week-head { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; padding: 12px 12px 10px; border-bottom: 1px solid var(--border); }
        .cal-week-wd { font-size: 12px; font-weight: 600; color: var(--text-dim); }
        .cal-week-num {
          height: 38px; min-width: 38px; margin-left: -6px; padding: 0 6px; border-radius: 999px;
          display: inline-flex; align-items: center; justify-content: center;
          font-size: 24px; font-weight: 600; letter-spacing: -0.03em; font-variant-numeric: tabular-nums;
        }
        .cal-cell--past .cal-week-num { color: var(--text-faint); }
        .cal-cell--today .cal-week-num { background: var(--amber); color: #1b1304; }
        .cal-week-holiday { font-size: 11.5px; color: var(--alta); padding: 8px 12px 0; }
        .cal-week-tasks { flex: 1; min-height: 0; overflow-y: auto; padding: 8px; display: flex; flex-direction: column; gap: 5px; }
        .cal-week-add {
          display: flex; align-items: center; gap: 6px; font: inherit; font-size: 12px; color: var(--text-faint);
          background: none; border: 1px dashed transparent; border-radius: 7px; padding: 6px 8px; cursor: pointer; opacity: 0; transition: opacity .12s;
        }
        .cal-week-col:hover .cal-week-add, .cal-week-add:focus-visible { opacity: 1; }
        .cal-week-add:hover { border-color: var(--border-strong); color: var(--text-dim); }

        /* day */
        .cal-day-view { flex: 1; min-height: 0; overflow-y: auto; border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--surface); padding: 24px 28px 28px; transition: box-shadow .12s; }
        .cal-day-view--drop { box-shadow: inset 0 0 0 2px var(--amber); }
        .cal-day-view > * { max-width: 780px; }
        .cal-day-hero { display: flex; align-items: center; gap: 16px; margin-bottom: 20px; }
        .cal-day-hero-num {
          width: 64px; height: 64px; border-radius: 18px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;
          background: var(--surface-2); font-size: 34px; font-weight: 650; letter-spacing: -0.04em; font-variant-numeric: tabular-nums;
        }
        .cal-day-hero-num--today { background: var(--amber); color: #1b1304; }
        .cal-day-hero-wd { font-size: 21px; font-weight: 650; letter-spacing: -0.02em; }
        .cal-day-hero-sub { font-size: 13.5px; color: var(--text-dim); margin-top: 3px; display: flex; gap: 10px; flex-wrap: wrap; }
        .cal-day-hero-holiday { color: var(--alta); }
        .cal-day-hero-count { font-size: 12.5px; font-weight: 600; color: var(--text-dim); background: var(--surface-2); padding: 5px 11px; border-radius: 999px; }
        .cal-day-add {
          display: flex; align-items: center; gap: 10px; padding: 11px 14px; margin-bottom: 14px;
          border: 1px dashed var(--border-strong); border-radius: 11px; color: var(--text-faint);
        }
        .cal-day-add:focus-within { border-style: solid; border-color: var(--amber-line); }
        .cal-day-add input { flex: 1; background: none; border: none; outline: none; color: var(--text); font: inherit; font-size: 14.5px; }
        .cal-day-add input::placeholder { color: var(--text-faint); }
        .cal-day-list { display: flex; flex-direction: column; gap: 6px; }
        .cal-day-empty { font-size: 13.5px; color: var(--text-faint); padding: 18px 2px; }
        .cal-day-subhead { display: flex; align-items: center; gap: 8px; font-size: 12.5px; font-weight: 600; color: var(--text-dim); margin: 18px 0 8px; }
        .cal-day-subhead span { font-variant-numeric: tabular-nums; }
        .cal-day-subhead--bad { color: var(--alta); }
        .cal-day-overdue { margin-top: 18px; padding-top: 2px; border-top: 1px solid var(--border); display: flex; flex-direction: column; gap: 6px; }

        /* agenda rows (side panel + day view) */
        .agenda-row {
          display: flex; align-items: center; gap: 8px; padding: 6px 9px 6px 8px; border-radius: 9px; cursor: grab;
          background: var(--surface-2); box-shadow: inset 2.5px 0 0 var(--chip); transition: background .12s;
        }
        .agenda-row:hover { background: var(--surface-3); }
        .agenda-row--big { padding: 10px 14px 10px 12px; gap: 12px; }
        .agenda-row--dragging { opacity: 0.4; }
        .agenda-check { flex-shrink: 0; display: flex; padding: 2px; background: none; border: none; color: var(--text-faint); cursor: pointer; border-radius: 50%; }
        .agenda-check:hover { color: var(--good); }
        .agenda-row--done .agenda-check { color: var(--good); }
        .agenda-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; padding: 0; background: none; border: none; color: inherit; font: inherit; text-align: left; cursor: pointer; }
        .agenda-title { font-size: 13px; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .agenda-row--big .agenda-title { font-size: 14.5px; white-space: normal; }
        .agenda-row--done .agenda-title { color: var(--text-faint); text-decoration: line-through; }
        .agenda-meta { display: flex; align-items: center; gap: 5px; min-width: 0; font-size: 11.5px; color: var(--text-faint); white-space: nowrap; overflow: hidden; }
        .agenda-row--big .agenda-meta { font-size: 12.5px; }
        .agenda-area-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--chip); flex-shrink: 0; }
        .agenda-date { margin-left: 6px; font-variant-numeric: tabular-nums; }
        .agenda-date--overdue { color: var(--alta); }
        .agenda-flag { color: var(--alta); flex-shrink: 0; }
        .agenda-doing { color: var(--blue); flex-shrink: 0; }

        /* side panel */
        .cal-side {
          width: 300px; flex-shrink: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 14px;
          padding: 16px 14px 24px; border-left: 1px solid var(--border); background: var(--side);
        }
        .mini-month-head { display: flex; align-items: center; justify-content: space-between; padding: 2px 2px 8px 6px; }
        .mini-month-label { font-size: 13.5px; font-weight: 650; }
        .mini-month-nav { display: flex; gap: 2px; }
        .mini-nav-btn { width: 26px; height: 26px; display: flex; align-items: center; justify-content: center; border: none; border-radius: 7px; background: none; color: var(--text-dim); cursor: pointer; }
        .mini-nav-btn:hover { background: var(--surface-2); color: var(--text); }
        .mini-month-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
        .mini-wd { text-align: center; font-size: 10.5px; font-weight: 600; color: var(--text-faint); padding: 2px 0 4px; }
        .mini-day {
          position: relative; height: 31px; border: none; border-radius: 8px; background: none; cursor: pointer;
          color: var(--text-dim); font: inherit; font-size: 12px; font-variant-numeric: tabular-nums;
        }
        .mini-day:hover { background: var(--surface-2); color: var(--text); }
        .mini-day--out { color: var(--text-faint); opacity: 0.6; }
        .mini-day--today { color: var(--amber); font-weight: 700; }
        .mini-day--selected, .mini-day--selected:hover { background: var(--amber); color: #1b1304; font-weight: 700; opacity: 1; }
        .mini-dot { position: absolute; left: 50%; bottom: 3px; width: 3px; height: 3px; margin-left: -1.5px; border-radius: 50%; background: currentColor; opacity: 0.75; }
        .cal-side-section { border-top: 1px solid var(--border); padding-top: 14px; transition: background .12s, box-shadow .12s; border-radius: 2px; }
        .cal-side-section--drop { background: var(--amber-soft); box-shadow: 0 0 0 2px var(--amber); border-radius: 10px; }
        .cal-side-day-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; padding: 0 2px; margin-bottom: 10px; }
        .cal-side-day-title { font-size: 14px; font-weight: 650; letter-spacing: -0.01em; }
        .cal-side-holiday { font-size: 12px; color: var(--alta); margin-top: 3px; }
        .cal-side-count { flex-shrink: 0; font-size: 11.5px; font-weight: 600; color: var(--text-dim); background: var(--surface-2); padding: 2px 8px; border-radius: 999px; font-variant-numeric: tabular-nums; }
        .cal-side-add { display: flex; align-items: center; gap: 8px; padding: 7px 10px; margin-bottom: 10px; color: var(--text-faint); border: 1px dashed var(--border-strong); border-radius: 9px; }
        .cal-side-add:focus-within { border-style: solid; border-color: var(--amber-line); }
        .cal-side-add input { flex: 1; min-width: 0; background: none; border: none; outline: none; color: var(--text); font: inherit; font-size: 13px; }
        .cal-side-add input::placeholder { color: var(--text-faint); }
        .cal-side-list { display: flex; flex-direction: column; gap: 5px; }
        .cal-side-empty { font-size: 12.5px; line-height: 1.5; color: var(--text-faint); padding: 6px 2px; }
        .cal-side-hint { font-size: 11.5px; color: var(--text-faint); padding: 0 2px 4px; }
        .cal-side-toggle { display: flex; align-items: center; gap: 8px; width: 100%; padding: 2px 2px 10px; background: none; border: none; color: var(--text); font: inherit; font-size: 13.5px; font-weight: 600; cursor: pointer; }
        .cal-side-toggle > svg:first-child { color: var(--text-dim); }
        .cal-side-toggle .cal-side-count { margin-left: auto; }
        .cal-side-toggle-chev { display: flex; color: var(--text-faint); }

        /* popovers (rendered in a portal on <body>) */
        .cal-pop-scrim { position: fixed; inset: 0; z-index: 150; }
        .cal-pop {
          position: fixed; z-index: 151; padding: 12px 14px; border-radius: 13px; color: var(--text);
          font-family: var(--font); background: var(--surface-2); box-shadow: var(--shadow-pop);
          animation: tt-pop-in .14s ease-out;
        }
        @keyframes tt-pop-in { from { opacity: 0; transform: translateY(-4px) scale(.985); } }
        .cal-pop-area { display: flex; align-items: center; gap: 7px; font-size: 12px; color: var(--text-dim); margin-bottom: 4px; }
        .cal-pop-area-dot { width: 9px; height: 9px; border-radius: 3px; background: var(--chip); }
        .cal-pop-close { margin-left: auto; display: flex; padding: 4px; border: none; border-radius: 6px; background: none; color: var(--text-faint); cursor: pointer; }
        .cal-pop-close:hover { background: var(--surface-3); color: var(--text); }
        .cal-pop-title {
          display: block; width: calc(100% + 12px); margin: 0 -6px; padding: 4px 6px; border: none; border-radius: 7px; outline: none; resize: none;
          background: none; color: var(--text); font: inherit; font-size: 15.5px; font-weight: 600; line-height: 1.35;
        }
        .cal-pop-title:hover { background: rgba(255,255,255,0.03); }
        .cal-pop-title:focus { background: var(--bg); }
        .cal-pop-note { font-size: 12.5px; line-height: 1.45; color: var(--text-dim); margin: 2px 0 4px; }
        .cal-pop-fields { display: grid; grid-template-columns: 72px 1fr; align-items: center; gap: 8px 10px; margin-top: 8px; padding: 10px 0; border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); }
        .cal-pop-fields > * { justify-self: start; }
        .cal-pop-label { font-size: 12px; color: var(--text-faint); }
        .cal-pop-actions { display: flex; align-items: center; gap: 6px; padding-top: 10px; flex-wrap: wrap; }
        .cal-pop-btn {
          display: inline-flex; align-items: center; gap: 5px; padding: 6px 9px; border: none; border-radius: 7px;
          background: var(--surface-3); color: var(--text-dim); font: inherit; font-size: 12px; font-weight: 500; cursor: pointer;
        }
        .cal-pop-btn:hover { color: var(--text); background: #2f3542; }
        .cal-pop-btn--danger:hover { color: var(--alta); background: rgba(242,95,85,0.14); }
        .cal-pop-day-head { display: flex; align-items: center; font-size: 13.5px; font-weight: 650; margin-bottom: 8px; }
        .cal-pop-day-list { display: flex; flex-direction: column; gap: 4px; max-height: 300px; overflow-y: auto; }

        @media (max-width: 1400px) {
          .cal-side { width: 264px; }
        }
        @media (max-width: 1300px), (max-height: 760px) {
          .cal-footer-hint { display: none; }
        }
        @media (max-width: 1160px) {
          .cal-side { display: none; }
        }
        @media (prefers-reduced-motion: reduce) {
          .cal-pop { animation: none; }
        }

        /* ---- modal ---- */
        .modal-overlay { position: absolute; inset: 0; background: rgba(6,7,10,0.62); -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px); display: flex; align-items: center; justify-content: center; z-index: 70; }
        .modal-card { position: relative; width: 340px; background: var(--surface-2); border-radius: 16px; padding: 22px; box-shadow: var(--shadow-pop); }
        .settings-modal-card { width: 560px; max-width: 90vw; max-height: 88vh; overflow-y: auto; padding: 28px 32px; border-radius: 18px; }
        .settings-modal-card .modal-title { font-size: 17px; margin-bottom: 18px; }
        .settings-modal-card .settings-group-title:first-of-type { margin-top: 0; }
        .settings-modal-card .settings-row { padding: 16px 0; gap: 24px; }
        .settings-modal-card .settings-row-title { font-size: 15px; }
        .settings-modal-card .settings-row-desc { max-width: 340px; }
        .settings-modal-card .settings-select { min-width: 190px; }
        .modal-close {
          position: absolute; top: 12px; right: 12px; background: none; border: none; color: var(--text-faint);
          cursor: pointer; padding: 4px; border-radius: 6px; display: flex;
        }
        .modal-close:hover { color: var(--text); background: var(--surface); }
        .settings-note { font-size: 12px; color: var(--text-faint); line-height: 1.5; margin: -8px 0 18px; }
        .modal-title { font-size: 16px; font-weight: 700; margin-bottom: 8px; }
        .modal-text { font-size: 13.5px; color: var(--text-dim); line-height: 1.5; margin-bottom: 18px; }
        .modal-actions { display: flex; justify-content: flex-end; gap: 8px; }
        .modal-btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 9px; font-size: 13.5px; font-weight: 500; cursor: pointer; border: none; font-family: inherit; }
        .modal-btn--cancel { background: var(--surface); border: 1px solid var(--border); color: var(--text-dim); }
        .modal-btn--cancel:hover { color: var(--text); }
        .modal-btn--danger { background: var(--alta); color: #fff; font-weight: 700; }
        .modal-btn--danger:hover { filter: brightness(1.08); }
        .modal-btn--primary { background: var(--amber); color: #1b1304; font-weight: 700; }
        .modal-btn--primary:hover { filter: brightness(1.08); }
        .modal-btn--primary:disabled { opacity: 0.6; cursor: default; }
        .settings-input {
          width: 100%; background: var(--surface); border: 1px solid var(--border); border-radius: 8px;
          padding: 9px 11px; color: var(--text); font-size: 13.5px; outline: none; margin-bottom: 8px;
        }
        .settings-input:focus { border-color: rgba(242,171,67,0.5); }
        .settings-error { font-size: 12.5px; color: var(--alta); margin-bottom: 10px; }
        .settings-check { display: flex; align-items: center; gap: 8px; font-size: 13.5px; color: var(--text-dim); margin-bottom: 18px; }
        .settings-group-title { font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-faint); font-weight: 700; margin: 20px 4px 6px; }
        .settings-row-title { font-size: 14.5px; font-weight: 700; color: var(--text); margin-bottom: 4px; }
        .settings-row-desc { font-size: 13px; color: var(--text-dim); line-height: 1.5; margin-bottom: 12px; }
        .settings-row { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 14px 0; border-top: 1px solid var(--border); }
        .settings-row .settings-row-desc { margin-bottom: 0; }
        .settings-select {
          background: var(--surface-2); border: 1px solid var(--border); border-radius: 8px;
          color: var(--text); font-size: 13px; padding: 8px 10px; flex-shrink: 0;
        }

        /* ---------- MOBILE ----------
           Same shell and measurements as Gastos App v146 mobile: thin brand
           bar, a toolbar of 40px bordered square buttons, section cards with a
           3px colored left edge, 14px rows, session bar + alert bar pinned at
           the bottom, centered modals. Task keeps its amber accent. */
        @media (max-width: 820px) {
          .tt-root { border-radius: 0; min-height: 100vh; min-height: 100dvh; height: 100dvh; font-size: 13px; }
          .tt-root, .tt-root * { touch-action: manipulation; }

          /* ---- modals: centered cards, like Gastos ---- */
          .modal-overlay { align-items: center; padding: 12px; }
          .auth-card, .modal-card { max-width: 100%; width: 100%; border-radius: 16px; padding: 20px; }
          .settings-modal-card { width: 100%; max-width: 100%; max-height: 85vh; padding: 18px 16px; border-radius: 16px; }
          .settings-modal-card .modal-title { font-size: 18px; margin-bottom: 10px; }
          .settings-modal-card .settings-group-title { margin: 20px 2px 6px; font-size: 12px; }
          .settings-modal-card .settings-group-title:first-of-type { margin-top: 4px; }
          .settings-modal-card .settings-row {
            padding: 14px; margin-top: 8px; gap: 12px; border-top: none; border-radius: 10px; background: var(--surface);
          }
          .settings-modal-card .settings-row-title { font-size: 15px; margin-bottom: 0; }
          .settings-modal-card .settings-row-desc { display: none; }
          .settings-modal-card .settings-select { min-width: 0; max-width: 150px; font-size: 13px; }
          .settings-modal-card .modal-btn { font-size: 13px; padding: 7px 10px; white-space: nowrap; flex-shrink: 0; }
          .settings-modal-card .settings-row > div[style] { flex-wrap: wrap; justify-content: flex-end; }
          .modal-actions .modal-btn { padding: 9px 14px; font-size: 14px; }

          /* ---- bottom bars: session + urgentes (Gastos: sesión + ALERTAS) ---- */
          .m-session-bar {
            display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-shrink: 0;
            padding: 10px 16px; background: var(--surface); border-top: 1px solid var(--border);
          }
          .m-account-name { font-size: 13.5px; color: var(--text-dim); font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
          .m-account-sub { font-size: 11.5px; color: var(--text-faint); }
          .m-account-logout { background: none; border: 1px solid var(--border); border-radius: 8px; color: var(--text-faint); font-size: 11.5px; padding: 5px 10px; flex-shrink: 0; }
          .urgent-bar {
            height: 46px; min-height: 46px; max-height: 46px; padding: 0 16px calc(0px + env(safe-area-inset-bottom)); gap: 10px;
            background: var(--side); border-top: 1px solid var(--border); overflow: hidden; box-sizing: content-box;
          }
          .urgent-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13.5px; font-weight: 600; }
          .urgent-empty { font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
          .urgent-bar--tappable { cursor: pointer; }
          .urgent-bar--tappable:active { background: var(--surface); }

          /* ---- shell ---- */
          .m-screen { display: flex; flex-direction: column; height: 100%; min-height: 0; background: var(--bg); }
          .m-brand-row {
            display: flex; align-items: center; gap: 8px; flex-shrink: 0; min-height: 42px;
            padding: calc(8px + env(safe-area-inset-top)) 10px 8px 12px;
            background: var(--surface); border-bottom: 1px solid var(--border);
            font-size: 16px; font-weight: 600; letter-spacing: -0.01em; color: var(--text);
          }
          .m-brand-row .brand-dot { width: 8px; height: 8px; border-radius: 50%; transform: none; box-shadow: 0 0 0 3px rgba(242,171,67,0.15); }
          .m-topbar { display: flex; flex-direction: column; gap: 10px; padding: 10px 12px; flex-shrink: 0; border-bottom: 1px solid var(--border); }
          .m-toolbar { display: flex; align-items: center; gap: 8px; }
          .m-pill {
            width: 40px; height: 40px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; padding: 0;
            background: var(--surface); border: 1px solid var(--border); border-radius: 9px; color: var(--text-dim);
          }
          .m-pill:active { background: var(--surface-2); color: var(--text); }
          .m-pill--on { background: rgba(242,171,67,0.10); border-color: var(--amber-line); color: var(--amber); }
          .m-pill--bad { color: var(--alta); border-color: rgba(242,95,85,0.45); }
          .m-pill--danger { color: var(--text-faint); }
          .m-pill--danger:active { color: var(--alta); background: rgba(242,95,85,0.12); }
          .m-search {
            flex: 1; min-width: 0; height: 40px; display: flex; align-items: center; gap: 8px; padding: 0 12px;
            background: var(--surface-2); border: 1px solid var(--border); border-radius: 9px; transition: border-color .12s;
          }
          .m-search:focus-within { border-color: var(--amber); }
          .m-search-icon { color: var(--text-faint); flex-shrink: 0; }
          .m-search input { flex: 1; min-width: 0; background: none; border: none; outline: none; color: var(--text); font-size: 15px; }
          .m-search input::placeholder { color: var(--text-faint); }
          .m-add-btn {
            width: 40px; height: 40px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;
            background: var(--amber); color: #1a1200; border: none; border-radius: 9px;
          }
          .m-header-title {
            flex: 1; min-width: 0; height: 40px; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 0 10px;
            background: var(--surface); border: 1px solid var(--border); border-radius: 8px;
            font-size: 15px; font-weight: 700; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
          }
          .m-header-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }

          /* fallback header (quick add without areas) */
          .m-header { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid var(--border); flex-shrink: 0; }
          .m-back { width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; background: var(--surface); border: 1px solid var(--border); border-radius: 9px; color: var(--text-dim); }

          /* Pendientes / Vencidas: the row Gastos uses for the month nav */
          .m-filters { display: flex; gap: 10px; padding: 18px 12px 12px; flex-shrink: 0; }
          .m-filter {
            flex: 1; height: 40px; display: flex; align-items: center; justify-content: center; gap: 8px;
            background: var(--surface); border: 1px solid var(--border); border-radius: 8px;
            color: var(--text); font-size: 15px; font-weight: 700;
          }
          .m-filter b { font-weight: 700; color: var(--text-dim); font-variant-numeric: tabular-nums; }
          .m-filter-bad { color: var(--alta) !important; }
          .m-filter--active { background: var(--amber-soft); border-color: var(--amber); }
          .m-filter--active b { color: var(--text); }

          .m-list {
            flex: 1; overflow-y: auto; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; padding: 0 12px 30px;
            display: flex; flex-direction: column; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none;
          }
          .m-topbar + .m-list { padding-top: 18px; }
          .m-list--dragging { overflow-y: hidden; touch-action: none; }
          .m-empty-hint { padding: 30px 10px; text-align: center; color: var(--text-faint); font-size: 14px; }

          /* ---- area list: each area is a Gastos section header ---- */
          .m-area-card {
            width: 100%; display: flex; align-items: center; gap: 10px; text-align: left; flex-shrink: 0;
            padding: 12px 14px; margin-bottom: 12px; color: var(--text);
            background: linear-gradient(90deg, color-mix(in srgb, var(--chip, transparent) 10%, transparent), transparent 55%), var(--surface);
            border: 1px solid var(--border); border-left: 3px solid var(--chip, var(--border)); border-radius: 12px;
          }
          .m-area-card:active { background-color: var(--surface-2); }
          .m-area-bar { display: none; }
          .m-area-card .fav-star-btn { padding: 2px; margin: -2px 0; }
          .m-area-name { flex: 1; min-width: 0; font-size: 15px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          .m-area-count {
            flex-shrink: 0; background: var(--surface-2); border: 1px solid var(--border); border-radius: 20px; padding: 3px 10px;
            font-size: 14px; font-weight: 600; color: var(--text-dim); font-variant-numeric: tabular-nums;
          }
          .m-area-chevron { color: var(--text-faint); flex-shrink: 0; }

          .m-search-task {
            width: 100%; display: flex; align-items: center; gap: 10px; text-align: left;
            background: var(--surface); border: 1px solid var(--border); border-radius: 12px;
            padding: 14px; margin-bottom: 8px; color: var(--text); flex-shrink: 0;
          }
          .m-search-task-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
          .m-search-task-title { flex: 1; font-size: 15px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          .m-search-task-area { font-size: 12px; color: var(--text-faint); flex-shrink: 0; }

          .m-inline-add, .m-add-area-btn {
            width: 100%; flex-shrink: 0; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 12px 14px;
            background: none; border: 1px dashed var(--border-strong); border-radius: 12px; color: var(--text-dim); font-size: 14px;
          }
          .m-inline-add { justify-content: flex-start; border-style: solid; border-color: var(--amber); background: var(--surface); }
          .m-inline-add input { flex: 1; background: none; border: none; outline: none; color: var(--text); font-size: 15px; }
          .m-area-card--renaming { background: var(--surface-2); }
          .m-area-card--revealed { background: rgba(242,95,85,0.07); }
          .m-inline-rename-input {
            flex: 1; min-width: 0; background: none; border: none; border-bottom: 1.5px solid var(--amber); outline: none;
            color: var(--text); font-size: 15px; font-weight: 700; font-family: inherit; padding: 2px 0;
          }
          .m-inline-rename-input--project { font-size: 15px; }

          /* ---- cards with rows (Gastos .mobileSection / .mobileRow) ---- */
          .m-card, .m-project-block {
            flex-shrink: 0; margin-bottom: 12px; overflow: hidden;
            background: var(--surface); border: 1px solid var(--border); border-radius: 12px;
          }
          .m-card-title, .m-project-header {
            display: flex; align-items: center; gap: 8px; padding: 12px 14px;
            border-left: 3px solid var(--chip, var(--border));
            background: linear-gradient(90deg, color-mix(in srgb, var(--chip, transparent) 10%, transparent), transparent 55%);
            font-size: 15px; font-weight: 700; color: var(--text);
            -webkit-touch-callout: none; -webkit-user-select: none; user-select: none; cursor: pointer;
          }
          .m-card { --chip: var(--amber); }
          .m-card-title { cursor: default; }
          .m-card-title span, .m-project-count {
            background: var(--surface-2); border: 1px solid var(--border); border-radius: 20px; padding: 2px 9px;
            font-size: 13px; font-weight: 600; color: var(--text-dim); font-variant-numeric: tabular-nums;
          }
          .m-project-header--static { cursor: default; border-left-color: var(--border-strong); background: none; }
          .m-project-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          .m-project-name--general { color: var(--text-dim); }
          .m-project-chev { color: var(--text-faint); transition: transform .15s; }
          .m-project-block--collapsed .m-project-chev { transform: rotate(-90deg); }
          .m-project-actions { display: flex; align-items: center; }
          .m-project-action-btn { background: none; border: none; padding: 6px; border-radius: 7px; color: var(--text-faint); display: flex; }
          .m-project-block--bare { background: none; border: none; overflow: visible; }
          .m-project-block--bare .m-inline-add-zone { border: 1px dashed var(--border-strong); border-radius: 12px; justify-content: center; }
          .m-project-block--bare .m-inline-add-zone::before { content: "+ Tarea sin proyecto"; }
          .m-project-tasks { }

          .m-inline-add-zone { min-height: 48px; display: flex; align-items: center; padding: 0 14px; cursor: text; -webkit-user-select: none; user-select: none; }
          .m-inline-add-zone::before { content: "+ Agregar tarea"; font-size: 14px; color: var(--text-faint); }
          .m-inline-add-zone--active { min-height: 0; padding: 8px 10px; }
          .m-inline-add-zone--active::before { content: none; }
          .m-inline-add-zone--active input {
            width: 100%; background: var(--surface-2); border: 1px solid var(--amber); border-radius: 8px;
            outline: none; color: var(--text); font-size: 15.5px; padding: 9px 11px; font-family: inherit;
          }

          /* task row = Gastos mobileRow */
          .m-task-row {
            display: flex; align-items: center; gap: 10px; padding: 14px 6px 14px 10px; position: relative;
            border-bottom: 1px solid var(--border); background: transparent;
            -webkit-user-select: none; user-select: none; -webkit-touch-callout: none;
          }
          .m-card > .m-task-row:last-child { border-bottom: none; }
          .m-task-row--dragging { z-index: 10; box-shadow: 0 10px 28px rgba(0,0,0,0.55); border-radius: 10px; background: var(--surface-2); pointer-events: none; }
          .m-task-row--drop-before { box-shadow: inset 0 2px 0 0 var(--amber); }
          .m-task-row--drop-after { box-shadow: inset 0 -2px 0 0 var(--amber); }
          .m-task-row--revealed { background: rgba(242,95,85,0.07); }
          .m-row-delete {
            flex-shrink: 0; display: flex; align-items: center; gap: 6px; background: var(--alta); color: #fff;
            border: none; border-radius: 8px; padding: 9px 13px; font-size: 13.5px; font-weight: 650;
          }
          .m-check { background: none; border: none; padding: 2px; flex-shrink: 0; display: flex; }
          .m-check svg { width: 20px; height: 20px; }
          .m-task-main { flex: 1; min-width: 0; text-align: left; background: none; border: none; display: flex; flex-direction: column; gap: 3px; }
          .m-task-title { font-size: 15.5px; color: var(--text); line-height: 1.35; }
          .m-task-title--done { color: var(--text-faint); text-decoration: line-through; }
          .m-task-title-input, .m-task-note-input {
            width: 100%; background: var(--surface-2); border: 1px solid var(--amber); border-radius: 8px;
            outline: none; color: var(--text); font-size: 15px; padding: 6px 8px; font-family: inherit;
          }
          .m-task-note { font-size: 13px; color: var(--text-faint); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
          .m-task-note--empty { color: var(--text-faint); opacity: 0.6; }
          .m-task-area { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-faint); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
          .m-task-area-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
          .m-task-icons { display: flex; flex-direction: row; gap: 9px; align-items: center; flex-shrink: 0; background: none; border: none; padding: 8px 2px; }
          .m-drag-handle { flex-shrink: 0; background: none; border: none; padding: 8px 4px; color: var(--text-faint); opacity: 0.7; touch-action: none; }
          .m-flag { color: var(--text-faint); }
          .m-flag--Baja { color: var(--text-faint); opacity: 0.6; }
          .m-flag--Media { color: var(--amber); }
          .m-flag--Alta { color: var(--alta); }
          .m-cal { color: var(--text-faint); }
          .m-cal--overdue { color: var(--alta); }
          .m-info-icon { color: var(--text-faint); }
          .m-info-icon--doing { color: var(--blue); }
          .m-info-icon--done { color: var(--good); }

          .m-sticky-footer { padding: 10px 12px; flex-shrink: 0; border-top: 1px solid var(--border); }
          .m-sticky-footer .m-add-area-btn { border-style: solid; border-color: var(--border); background: var(--surface); border-radius: 10px; }

          /* ---- task detail ---- */
          .m-task-detail { flex: 1; overflow-y: auto; overscroll-behavior: contain; padding: 18px 12px 30px; }
          .m-task-detail-title {
            width: 100%; background: none; border: none; outline: none; color: var(--text); padding: 0 2px;
            font-size: 20px; font-weight: 700; letter-spacing: -0.01em; margin-bottom: 12px; font-family: inherit;
            resize: none; overflow: hidden; line-height: 1.3;
          }
          .m-task-detail-note {
            width: 100%; min-height: 80px; background: var(--surface); border: 1px solid var(--border);
            border-radius: 12px; padding: 12px 14px; color: var(--text-dim); font-size: 15px; line-height: 1.5;
            outline: none; resize: vertical; font-family: inherit;
          }
          .m-task-detail-note:focus { border-color: var(--amber); color: var(--text); }
          .m-task-detail-note::placeholder { color: var(--text-faint); }
          .m-task-detail-options { margin-top: 12px; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
          .m-option-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 14px; min-height: 56px; border-bottom: 1px solid var(--border); }
          .m-option-row:last-child { border-bottom: none; }
          .m-option-label { font-size: 15px; color: var(--text); font-weight: 600; }
          .m-option-select {
            background: var(--surface-2); border: 1px solid var(--border); border-radius: 8px;
            color: var(--text); font-size: 14.5px; padding: 8px 10px; max-width: 60%; font-family: inherit;
          }
          .m-task-detail .datefield-btn { font-size: 15px; padding: 8px 12px; background: var(--surface-2); border: 1px solid var(--border); border-radius: 8px; }
          .m-task-detail .pill { font-size: 14px; padding: 7px 12px; }
          .m-task-detail .badge { font-size: 14px; padding: 7px 12px; border-radius: 8px; }

          /* ---- quick add ---- */
          .m-quickadd-area-select {
            flex: 1; min-width: 0; height: 40px; background: var(--surface); border: 1px solid var(--border); border-radius: 9px;
            color: var(--text); font-size: 15px; font-weight: 700; padding: 0 10px; font-family: inherit;
          }
          .m-quickadd-input-row { display: flex; gap: 8px; padding: 18px 12px 12px; flex-shrink: 0; }
          .m-quickadd-input-row input {
            flex: 1; min-width: 0; height: 44px; background: var(--surface-2); border: 1px solid var(--amber); border-radius: 9px;
            padding: 0 12px; color: var(--text); font-size: 15.5px; outline: none; font-family: inherit;
          }
          .m-quickadd-send { width: 44px; flex-shrink: 0; border-radius: 9px; border: none; background: var(--amber); color: #1a1200; display: flex; align-items: center; justify-content: center; }
          .m-quickadd-input-row + .m-list { padding-top: 0; }
          .m-quickadd-item { display: flex; align-items: center; gap: 10px; padding: 14px; font-size: 15px; color: var(--text-dim); border-bottom: 1px solid var(--border); flex-shrink: 0; }

          .toast { bottom: calc(120px + env(safe-area-inset-bottom)); }
        }
      `}</style>

      {isMobile ? (
        mobileScreen === "task" ? renderMobileTaskScreen()
        : mobileScreen === "quickadd" ? renderMobileQuickAddScreen()
        : mobileScreen === "area" ? renderMobileAreaScreen()
        : renderMobileAreasScreen()
      ) : (
      <>
      {/* Sidebar */}
      <div className="tt-body">
      <aside className="sidebar">
        <div className="brand"><span className="brand-dot" />Task App</div>

        <div className="side-label">VISTAS</div>
        <div className={`side-item ${view === "lista" ? "side-item--active" : ""}`} onClick={() => setView("lista")}>
          <span className="side-item-left"><ListIcon size={14} /> Lista</span>
        </div>
        <div className={`side-item ${view === "prioridad" ? "side-item--active" : ""}`} onClick={() => setView("prioridad")}>
          <span className="side-item-left"><Flag size={14} /> Por prioridad</span>
        </div>
        <div className={`side-item ${view === "calendario" ? "side-item--active" : ""}`} onClick={() => setView("calendario")}>
          <span className="side-item-left"><CalendarIcon size={14} /> Calendario</span>
        </div>

        <div className="side-label-row">
          <span className="side-label">ÁREAS</span>
        </div>
        <div className={`side-item ${selectedAreaId === "all" ? "side-item--active" : ""}`} onClick={() => selectArea("all")}>
          <span className="side-item-left">
            <span className="side-dot" style={{ background: "var(--text-faint)" }} />
            <span className="side-item-name">Todas</span>
          </span>
          <span className="side-count mono">{tasks.filter((t) => t.status !== "Hecho").length}</span>
        </div>

        {visibleOrderedAreas.map((a) => (
          <div
            key={a.id}
            className={`side-item ${selectedAreaId === a.id ? "side-item--active" : ""}`}
            onClick={() => { if (renamingAreaId !== a.id) selectArea(a.id); }}
          >
            {renamingAreaId === a.id ? (
              <input
                ref={renameInputRef}
                className="rename-input"
                value={renameValue}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={discardRename}
                onKeyDown={(e) => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") setRenamingAreaId(null); }}
              />
            ) : (
              <>
                <span className="side-item-left">
                  <span className="side-dot-wrap">
                    <button
                      className="side-dot"
                      style={{ background: a.color }}
                      onClick={(e) => { e.stopPropagation(); setColorPickerAreaId(colorPickerAreaId === a.id ? null : a.id); }}
                      title="Cambiar color"
                    />
                    {colorPickerAreaId === a.id && (
                      <>
                        <div className="popover-scrim" onClick={(e) => { e.stopPropagation(); setColorPickerAreaId(null); }} />
                        <div className="color-popover" onClick={(e) => e.stopPropagation()}>
                          {PALETTE.map((c) => (
                            <button
                              key={c}
                              className="color-swatch"
                              style={{ background: c }}
                              onClick={() => { setAreaColor(a.id, c); setColorPickerAreaId(null); }}
                            />
                          ))}
                        </div>
                      </>
                    )}
                  </span>
                  <button
                    className={`fav-star-btn ${a.favorite ? "fav-star-btn--active" : ""}`}
                    onClick={(e) => { e.stopPropagation(); toggleAreaFavorite(a.id); }}
                    title={a.favorite ? "Quitar de favoritos" : "Marcar como favorita"}
                  >
                    <Star size={13} fill={a.favorite ? "currentColor" : "none"} />
                  </button>
                  <span className="side-item-name">{a.name}</span>
                </span>
                <span className="side-item-right">
                  <span className="side-count mono">{areaCounts[a.id] || 0}</span>
                  {!isGeneralArea(a) && (
                    <>
                      <button className="area-edit-btn" title="Renombrar área" onClick={(e) => { e.stopPropagation(); startRename(a); }}>
                        <Pencil size={12} />
                      </button>
                      <button className="area-edit-btn area-edit-btn--danger" title="Eliminar área" onClick={(e) => { e.stopPropagation(); setDeleteTarget({ type: "area", id: a.id }); }}>
                        <Trash2 size={12} />
                      </button>
                    </>
                  )}
                </span>
              </>
            )}
          </div>
        ))}

        {addingArea ? (
          <input
            ref={newAreaInputRef}
            className="new-area-input"
            placeholder="Nombre del área..."
            value={newAreaName}
            onChange={(e) => setNewAreaName(e.target.value)}
            onBlur={discardNewArea}
            onKeyDown={(e) => { if (e.key === "Enter") createArea(); if (e.key === "Escape") { setNewAreaName(""); setAddingArea(false); } }}
          />
        ) : (
          <button className="add-area-btn" onClick={() => setAddingArea(true)}><Plus size={13} /> Nueva área</button>
        )}

        <div className="sidebar-spacer" />

        <div className="account-row">
          <div className="account-info">
            <div className="account-name">{session?.user?.is_anonymous ? "Invitado" : (maskEmail(session?.user?.email))}</div>
            <div className="account-sub">{session?.user?.is_anonymous ? "Sesión de prueba" : "Con cuenta"}</div>
          </div>
          <button className="account-logout" onClick={handleLogout} title="Cerrar sesión">Salir</button>
        </div>

        <div className="notif-toggle-row">
          <div>
            <div className="notif-toggle-title">Notificaciones</div>
            <div className="notif-toggle-sub">{notificationsEnabled ? "Activas · cada hora" : "Apagadas"}</div>
          </div>
          <button
            className={`switch ${notificationsEnabled ? "switch--on" : ""}`}
            onClick={() => setNotificationsEnabled((v) => !v)}
            title="Activar/desactivar notificaciones"
          >
            <span className="switch-knob" />
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="main" style={{ position: "relative" }}>
        <div className="topbar">
          <h1>
            {view === "calendario"
              ? "Calendario"
              : view === "prioridad"
                ? "Por prioridad"
                : selectedAreaId === "all"
                  ? "Todas las tareas"
                  : (selectedProjectId ? areaMap[selectedAreaId]?.projects?.find((p) => p.id === selectedProjectId)?.name : areaMap[selectedAreaId]?.name)}
          </h1>
          <button
            className={`counter counter--clickable ${desktopExpandedFilter === "pendientes" ? "counter--active" : ""}`}
            onClick={() => toggleDesktopExpandedFilter("pendientes")}
          >
            <span>Pendientes</span><b>{pendientes}</b>
          </button>
          <button
            className={`counter counter--clickable ${vencidas > 0 ? "counter--warn" : ""} ${desktopExpandedFilter === "vencidas" ? "counter--active" : ""}`}
            onClick={() => toggleDesktopExpandedFilter("vencidas")}
          >
            <span>Vencidas</span><b>{vencidas}</b>
          </button>
          <div className="search-wrap">
            <Search size={13} color="var(--text-faint)" />
            <input placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <button
            className={`iconbtn fav-filter-btn ${areaFilterMode !== "off" ? "fav-filter-btn--active" : ""}`}
            onClick={() => setAreaFilterMode((m) => (m === "off" ? "solo" : m === "solo" ? "mute" : "off"))}
            title={areaFilterMode === "solo" ? "Mostrando solo favoritas — clic para ocultarlas" : areaFilterMode === "mute" ? "Ocultando favoritas — clic para apagar el filtro" : "Filtro de favoritas (apagado)"}
          >
            {areaFilterMode === "mute" ? <EyeOff size={13} /> : <Star size={13} fill={areaFilterMode === "solo" ? "currentColor" : "none"} />}
            Favoritos
          </button>
          <div className="topbar-spacer" />
          <IconBtn icon={hideCompleted ? CheckCircle2 : Circle} label="Ocultar hechas" onClick={() => setHideCompleted((v) => !v)} active={hideCompleted} />
          <span className="bell-wrap">
            <button
              className="iconbtn icon-only"
              title="Notificaciones"
              onClick={() => setShowNotifPanel((v) => !v)}
            >
              <Bell size={14} />
              {urgentItems.length > 0 && <span className="bell-dot" />}
            </button>
            {showNotifPanel && (
              <>
                <div className="popover-scrim" onClick={() => setShowNotifPanel(false)} />
                <div className="notif-panel" onClick={(e) => e.stopPropagation()}>
                  <div className="notif-panel-head">
                    <span>Urgentes</span>
                    <span className="notif-panel-count mono">{urgentItems.length}</span>
                  </div>
                  <div className="notif-panel-list">
                    {urgentItems.length === 0 && (
                      <div className="notif-panel-empty">Sin tareas vencidas ni próximas.</div>
                    )}
                    {urgentItems.map((item, i) => {
                      const a = areaMap[item.task.areaId];
                      const p = item.task.projectId ? a?.projects?.find((pr) => pr.id === item.task.projectId) : null;
                      return (
                        <div className="notif-row" key={item.task.id + i}>
                          <span className={`urgent-chip urgent-chip--${item.kind}`}>{item.label}</span>
                          <span className="notif-row-title">{item.task.title}</span>
                          <span className="notif-row-meta">{a?.name}{p ? ` · ${p.name}` : ""}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </span>
          <input ref={restoreInputRef} type="file" accept="application/json" style={{ display: "none" }} onChange={restoreData} />
          <button
            className="iconbtn icon-only"
            onClick={() => setShowEncSettings(true)}
            title={isEncrypted ? "Datos cifrados — ver cifrado" : "Datos sin cifrar — ver cifrado"}
          >
            {isEncrypted ? <Lock size={14} /> : <Unlock size={14} />}
          </button>
          <button className="iconbtn icon-only" onClick={() => setShowSettingsPanel(true)} title="Configuración">
            <Settings size={14} />
          </button>
          <span
            className={`iconbtn icon-only sync-indicator ${syncError ? "sync-indicator--error" : ""}`}
            onClick={() => { if (syncError) saveDiff(); }}
            style={syncError ? { cursor: "pointer" } : undefined}
            title={syncError ? "No se pudo guardar — tocá para reintentar" : saving ? "Guardando..." : lastSyncAt ? `Sincronizado — ${new Date(lastSyncAt).toLocaleTimeString("es-AR")}` : "Conectado a Supabase"}
          >
            {syncError ? <CloudOff size={14} /> : saving ? <RefreshCw size={14} className="spin" /> : <Cloud size={14} />}
          </span>
          <select className="iconbtn lang-select" value={appLang} onChange={(e) => setAppLang(e.target.value)} title="Idioma">
            <option value="es">ES</option>
            <option value="en">EN</option>
          </select>
        </div>

        {view === "lista" ? (
          <>
            <div className="input-card">
              <div className="tabs">
                <button className={`tab-btn ${tab === "texto" ? "tab-btn--active" : ""}`} onClick={() => setTab("texto")}>Texto libre</button>
                <button className={`tab-btn ${tab === "form" ? "tab-btn--active" : ""}`} onClick={() => setTab("form")}>Formulario</button>
              </div>

              {tab === "texto" ? (
                <>
                  <div className="input-body">
                    <textarea
                      rows={1}
                      placeholder="Escribí todo lo que tenés en la cabeza... ej: reunión jueves urgente wanka moria, cortar pasto finde casa"
                      value={freeText}
                      onChange={(e) => setFreeText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleProcesar();
                        }
                      }}
                    />
                    <button className="procesar-btn" onClick={handleProcesar} disabled={!freeText.trim()}>
                      <ListChecks size={14} />
                      Procesar
                    </button>
                  </div>
                  <div className="hint-text">
                    Enter procesa · Shift+Enter agrega una línea. Se interpreta en el momento, sin IA: "hoy" / "mañana" / "el jueves" / "finde" → fecha. "urgente" o "rápido" → prioridad alta.
                    {selectedAreaId !== "all" && <> Las tareas se crean en <b style={{ color: "var(--text-dim)" }}>{areaMap[selectedAreaId]?.name}</b>{selectedProjectId ? ` / ${areaMap[selectedAreaId]?.projects?.find((p) => p.id === selectedProjectId)?.name}` : ""}.</>}
                  </div>
                </>
              ) : (
                <div className="manual-form">
                  <input
                    type="text"
                    placeholder="Título de la tarea"
                    value={manualTitle}
                    onChange={(e) => setManualTitle(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addManualTask()}
                  />
                  {selectedAreaId === "all" ? (
                    <select value={manualArea} onChange={(e) => setManualArea(e.target.value)}>
                      <option value="">General</option>
                      {visibleOrderedAreas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  ) : (
                    <span className="manual-area-fixed">
                      <span className="side-dot" style={{ background: areaMap[selectedAreaId]?.color }} />
                      {areaMap[selectedAreaId]?.name}
                    </span>
                  )}
                  {selectedAreaId !== "all" && areaMap[selectedAreaId]?.projects?.length > 0 && (
                    <select value={manualProjectId} onChange={(e) => setManualProjectId(e.target.value)}>
                      <option value="">Sin proyecto</option>
                      {areaMap[selectedAreaId].projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  )}
                  <button className="procesar-btn" onClick={addManualTask}><Plus size={14} />Agregar</button>
                </div>
              )}
            </div>

            <div className="groups">
              {desktopExpandedFilter ? (
                <>
                  {(() => {
                    const isolated = visibleTasks.filter((t) => (
                      desktopExpandedFilter === "vencidas" ? isOverdue(t.date, t.status) : t.status !== "Hecho"
                    ));
                    return isolated.length === 0 ? (
                      <div className="empty-state">Sin tareas {desktopExpandedFilter === "vencidas" ? "vencidas" : "pendientes"}.</div>
                    ) : renderTaskTable(isolated, { showArea: true, showHeader: true });
                  })()}
                </>
              ) : (
              <>
              {grouped.length === 0 && (
                <div className="empty-state">No hay tareas para mostrar. Escribí algo arriba y tocá "Procesar".</div>
              )}
              {grouped.map(({ area, allTasks, noProject, projectGroups }) => {
                const isCollapsed = collapsed[area.id];
                return (
                  <div className="group" key={area.id} style={{ "--chip": area.color }}>
                    <div
                      className={`group-head ${dragOverKey === `area-${area.id}` ? "group-head--dragover" : ""}`}
                      onClick={() => toggleCollapse(area.id)}
                      onDragOver={(e) => { e.preventDefault(); setDragOverKey(`area-${area.id}`); }}
                      onDragLeave={() => setDragOverKey((k) => (k === `area-${area.id}` ? null : k))}
                      onDrop={(e) => { e.preventDefault(); e.stopPropagation(); handleDropOnTarget(area.id, null); }}
                    >
                      <div className="group-bar" style={{ background: area.color }} />
                      <div className="group-name">{area.name}</div>
                      <div className="group-count mono">{allTasks.filter((t) => t.status !== "Hecho").length} pendientes</div>
                      <span className="chev">{isCollapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}</span>
                    </div>
                    {!isCollapsed && (
                      <>
                        <table className="area-columns-header">
                          {colGroupFor(false)}
                          <thead>
                            <tr>
                              <th>Tarea</th>
                              <th className="col-center">Detalle</th>
                              <th className="col-center">Estado</th>
                              <th className="col-center">Prioridad</th>
                              <th className="col-center">Fecha</th>
                              <th></th>
                            </tr>
                          </thead>
                        </table>
                        {projectGroups.map(({ project, tasks: projTasks }) => {
                          const isRenamingThis = renamingProjectId === project.id && renameProjectAreaId === area.id;
                          return (
                          <div
                            className={`subgroup ${dragOverKey === project.id ? "subgroup--dragover" : ""}`}
                            key={project.id}
                            onDragOver={(e) => { e.preventDefault(); setDragOverKey(project.id); }}
                            onDragLeave={() => setDragOverKey((k) => (k === project.id ? null : k))}
                            onDrop={(e) => { e.preventDefault(); e.stopPropagation(); handleDropOnTarget(area.id, project.id); }}
                          >
                            {isRenamingThis ? (
                              <div className="subgroup-head">
                                <span className="subgroup-dot" style={{ background: area.color }} />
                                <input
                                  ref={renameProjectInputRef}
                                  className="rename-project-input"
                                  value={renameProjectValue}
                                  onChange={(e) => setRenameProjectValue(e.target.value)}
                                  onBlur={discardRenameProject}
                                  onKeyDown={(e) => { if (e.key === "Enter") commitRenameProject(); if (e.key === "Escape") setRenamingProjectId(null); }}
                                />
                              </div>
                            ) : (
                            <div className="subgroup-head" onClick={() => toggleProjectCollapse(project.id)}>
                              <span className="subgroup-dot" style={{ background: area.color }} />
                              <span className="subgroup-name" style={{ color: area.color }}>{project.name.toUpperCase()}</span>
                              <span className="subgroup-count mono">{projTasks.filter((t) => t.status !== "Hecho").length}</span>
                              <span className="subgroup-actions">
                                <button className="subgroup-action-btn" onClick={(e) => { e.stopPropagation(); startRenameProject(area.id, project); }} title="Renombrar proyecto">
                                  <Pencil size={13} />
                                </button>
                                <button className="subgroup-action-btn" onClick={(e) => { e.stopPropagation(); setDeleteTarget({ type: "project", id: project.id, areaId: area.id }); }} title="Eliminar proyecto">
                                  <Trash2 size={13} />
                                </button>
                              </span>
                            </div>
                            )}
                            {!collapsedProjects[project.id] && (
                              <>
                                {projTasks.length > 0 && renderTaskTable(projTasks, {})}
                                <QuickAddRow
                                  placeholder=""
                                  onAdd={(title) => addQuickTask(area.id, project.id, title)}
                                />
                              </>
                            )}
                          </div>
                          );
                        })}
                        <div
                          className={`subgroup ${dragOverKey === `noproject-${area.id}` ? "subgroup--dragover" : ""}`}
                          onDragOver={(e) => { e.preventDefault(); setDragOverKey(`noproject-${area.id}`); }}
                          onDragLeave={() => setDragOverKey((k) => (k === `noproject-${area.id}` ? null : k))}
                          onDrop={(e) => { e.preventDefault(); e.stopPropagation(); handleDropOnTarget(area.id, null); }}
                        >
                          {noProject.length > 0 && renderTaskTable(noProject)}
                          <QuickAddRow
                            placeholder=""
                            onAdd={(title) => addQuickTask(area.id, null, title)}
                            general
                          />
                        </div>
                        {!isGeneralArea(area) && (
                          <div className="group-footer">
                            {panelAddingProjectAreaId === area.id ? (
                              <input
                                ref={panelNewProjectInputRef}
                                className="panel-new-project-input"
                                placeholder="Nombre del nuevo proyecto..."
                                value={panelNewProjectName}
                                onChange={(e) => setPanelNewProjectName(e.target.value)}
                                onBlur={() => createProjectFromPanel(area.id)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") createProjectFromPanel(area.id);
                                  if (e.key === "Escape") { setPanelNewProjectName(""); setPanelAddingProjectAreaId(null); }
                                }}
                              />
                            ) : (
                              <button className="panel-add-project-btn" onClick={() => setPanelAddingProjectAreaId(area.id)}>
                                <Plus size={13} /> Nuevo proyecto
                              </button>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}

              {(selectedAreaId === "all" || areas.length === 0) && (
                panelAddingArea ? (
                  <input
                    ref={panelNewAreaInputRef}
                    className="panel-new-area-input"
                    placeholder="Nombre del área..."
                    value={panelNewAreaName}
                    onChange={(e) => setPanelNewAreaName(e.target.value)}
                    onBlur={discardNewAreaFromPanel}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") createAreaFromPanel();
                      if (e.key === "Escape") { setPanelNewAreaName(""); setPanelAddingArea(false); }
                    }}
                  />
                ) : (
                  <button className="panel-add-area-btn" onClick={() => setPanelAddingArea(true)}>
                    <Plus size={14} /> Nueva área
                  </button>
                )
              )}
              </>
              )}
            </div>
          </>
        ) : view === "prioridad" ? (
          <div className="groups groups--first-view">
            {groupedByPriority.map(({ priority, tasks: priTasks }) => {
              const key = `prio-${priority}`;
              const isCollapsed = collapsed[key];
              const barColor = priority === "Alta" ? "var(--alta)" : priority === "Media" ? "var(--media)" : "var(--baja)";
              return (
                <div className="group" key={key} style={{ "--chip": barColor }}>
                  <div className="group-head" onClick={() => toggleCollapse(key)}>
                    <div className="group-bar" style={{ background: barColor }} />
                    <div className="group-name">{priority}</div>
                    <div className="group-count mono">{priTasks.filter((t) => t.status !== "Hecho").length} pendientes</div>
                    <span className="chev">{isCollapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}</span>
                  </div>
                  {!isCollapsed && priTasks.length > 0 && renderTaskTable(priTasks, { showArea: true, showHeader: true })}
                </div>
              );
            })}
          </div>
        ) : (
          renderCalendar()
        )}

        {toast && <div className="toast">{toast}</div>}
      </div>
      </div>

      {(() => {
        if (urgentItems.length === 0) {
          return (
            <div className="urgent-bar">
              <span className="urgent-label urgent-label--off"><span className="urgent-dot urgent-dot--off" />URGENTES</span>
              <span className="urgent-empty">Sin tareas vencidas ni próximas por ahora.</span>
            </div>
          );
        }
        const current = urgentItems[Math.min(urgentIndex, urgentItems.length - 1)];
        const project = current.task.projectId
          ? areaMap[current.task.areaId]?.projects?.find((p) => p.id === current.task.projectId)
          : null;
        return (
          <div className="urgent-bar">
            <span className="urgent-label"><span className="urgent-dot" />URGENTES</span>
            <span className={`urgent-chip urgent-chip--${current.kind}`}>{current.label}</span>
            <span className="urgent-title">{current.task.title}</span>
            <span className="urgent-meta">
              {areaMap[current.task.areaId]?.name}{project ? ` · ${project.name}` : ""}
            </span>
            <span className="urgent-spacer" />
            <span className="urgent-count mono">{urgentIndex + 1} / {urgentItems.length}</span>
          </div>
        );
      })()}
      </>
      )}

      {showEncSettings && (
        <div className="modal-overlay" onClick={closeEncSettings}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={closeEncSettings}><X size={16} /></button>
            <div className="modal-title">Cifrado de extremo a extremo</div>

            {encSettingsView === "status" && (
              <>
                <div className="modal-text">
                  {isEncrypted
                    ? "Tus datos están cifrados en tu navegador antes de llegar a Supabase (AES-256-GCM). Ni Supabase ni nadie con acceso a la base puede leerlos."
                    : "Tus datos se guardan en Supabase sin cifrar. Podés activar el cifrado de extremo a extremo cuando quieras."}
                </div>
                <div className="modal-actions">
                  <button className="modal-btn modal-btn--cancel" onClick={closeEncSettings}>Cerrar</button>
                  {isEncrypted ? (
                    <button className="modal-btn modal-btn--danger" onClick={() => setEncSettingsView("disable-confirm")}>
                      Desactivar cifrado
                    </button>
                  ) : (
                    <button className="modal-btn modal-btn--primary" onClick={() => setEncSettingsView("enable")}>
                      Activar cifrado
                    </button>
                  )}
                </div>
              </>
            )}

            {encSettingsView === "disable-confirm" && (
              <>
                <div className="modal-text">
                  Ingresá tu contraseña de cifrado actual para confirmar que querés desactivarlo.
                  Una vez desactivado, tus datos quedan en texto plano en Supabase.
                </div>
                <input
                  type="password"
                  className="settings-input"
                  placeholder="Contraseña de cifrado actual"
                  autoFocus
                  value={encPass}
                  onChange={(e) => setEncPass(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleDisableEncryption()}
                />
                {encError && <div className="settings-error">{encError}</div>}
                <div className="modal-actions">
                  <button className="modal-btn modal-btn--cancel" onClick={() => { setEncSettingsView("status"); setEncPass(""); setEncError(""); }}>
                    Cancelar
                  </button>
                  <button className="modal-btn modal-btn--danger" disabled={encBusy} onClick={handleDisableEncryption}>
                    {encBusy ? "Verificando..." : "Confirmar y desactivar"}
                  </button>
                </div>
              </>
            )}

            {encSettingsView === "enable" && (
              <>
                <div className="modal-text">
                  Creá una contraseña de cifrado. Es distinta de tu contraseña de acceso y nunca sale de
                  este navegador. Si la olvidás, no hay forma de recuperar los datos.
                </div>
                <input
                  type="password"
                  className="settings-input"
                  placeholder="Contraseña de cifrado"
                  autoFocus
                  value={encPass}
                  onChange={(e) => setEncPass(e.target.value)}
                />
                <input
                  type="password"
                  className="settings-input"
                  placeholder="Repetí la contraseña"
                  value={encPass2}
                  onChange={(e) => setEncPass2(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleEncSetup()}
                />
                {encError && <div className="settings-error">{encError}</div>}
                <div className="modal-actions">
                  <button className="modal-btn modal-btn--cancel" onClick={() => { setEncSettingsView("status"); setEncPass(""); setEncPass2(""); setEncError(""); }}>
                    Cancelar
                  </button>
                  <button className="modal-btn modal-btn--primary" disabled={encBusy} onClick={handleEncSetup}>
                    {encBusy ? "Activando..." : "Activar cifrado"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {showSettingsPanel && (
        <div className="modal-overlay" onClick={() => { setShowSettingsPanel(false); setConfirmingWipe(false); }}>
          <div className="modal-card settings-modal-card" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => { setShowSettingsPanel(false); setConfirmingWipe(false); }}><X size={16} /></button>
            <div className="modal-title">Configuración</div>

            {!confirmingWipe ? (
              <>
                <div className="settings-group-title">Seguridad</div>
                <div className="settings-row">
                  <div>
                    <div className="settings-row-title">Cifrado</div>
                    <div className="settings-row-desc">{isEncrypted ? "Tus datos están cifrados." : "Tus datos no están cifrados."}</div>
                  </div>
                  <button className="modal-btn modal-btn--cancel" onClick={() => { setShowSettingsPanel(false); setShowEncSettings(true); }}>
                    {isEncrypted ? <Lock size={14} /> : <Unlock size={14} />} Ver cifrado
                  </button>
                </div>

                <div className="settings-group-title">Calendario</div>
                <div className="settings-row">
                  <div>
                    <div className="settings-row-title">Inicio de semana</div>
                    <div className="settings-row-desc">Orden de los días en el calendario.</div>
                  </div>
                  <select className="settings-select" value={weekStartsSunday ? "sun" : "mon"} onChange={(e) => setWeekStartsSunday(e.target.value === "sun")}>
                    <option value="mon">Lunes (sáb/dom al final)</option>
                    <option value="sun">Domingo</option>
                  </select>
                </div>
                <div className="settings-row">
                  <div>
                    <div className="settings-row-title">Feriados en el calendario</div>
                    <div className="settings-row-desc">Marca los feriados nacionales. En Argentina incluye también los móviles (Carnaval, Semana Santa, trasladables).</div>
                  </div>
                  <select className="settings-select" value={holidayCountry} onChange={(e) => setHolidayCountry(e.target.value)}>
                    <option value="none">Ninguno</option>
                    <option value="AR">Argentina</option>
                    <option value="ES">España</option>
                    <option value="MX">México</option>
                    <option value="US">Estados Unidos</option>
                    <option value="BR">Brasil</option>
                    <option value="CL">Chile</option>
                  </select>
                </div>

                <div className="settings-group-title">Datos</div>
                <div className="settings-row">
                  <div>
                    <div className="settings-row-title">Exportar / Restaurar</div>
                    <div className="settings-row-desc">Backup manual, aparte de la nube.</div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                    <button className="modal-btn modal-btn--cancel" onClick={exportData}><Download size={13} /> Exportar</button>
                    <button className="modal-btn modal-btn--cancel" onClick={() => restoreInputRef.current?.click()}><Upload size={13} /> Restaurar</button>
                  </div>
                </div>

                <div className="settings-group-title">Zona de riesgo</div>
                <div className="settings-row">
                  <div>
                    <div className="settings-row-title">Borrar todos los datos</div>
                    <div className="settings-row-desc">Borra todo. No se puede deshacer.</div>
                  </div>
                  <button className="modal-btn modal-btn--danger" onClick={() => setConfirmingWipe(true)}>Borrar todos los datos</button>
                </div>

                <div className="modal-actions">
                  <button className="modal-btn modal-btn--cancel" onClick={() => setShowSettingsPanel(false)}>Cerrar</button>
                </div>
              </>
            ) : (
              <>
                <div className="modal-text">
                  ¿Borrar <b style={{ color: "var(--alta)" }}>todas</b> tus áreas, proyectos y tareas? Esta acción no se puede deshacer.
                </div>
                <div className="modal-actions">
                  <button className="modal-btn modal-btn--cancel" onClick={() => setConfirmingWipe(false)}>Cancelar</button>
                  <button className="modal-btn modal-btn--danger" onClick={wipeAllData}>Sí, borrar todo</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {deleteTarget && (() => {
        const isArea = deleteTarget.type === "area";
        const isTask = deleteTarget.type === "task";
        const area = isArea ? areaMap[deleteTarget.id] : areaMap[deleteTarget.areaId];
        const project = isArea || isTask ? null : area?.projects?.find((p) => p.id === deleteTarget.id);
        const task = isTask ? tasks.find((x) => x.id === deleteTarget.id) : null;
        const count = isArea
          ? tasks.filter((t) => t.areaId === deleteTarget.id).length
          : isTask ? 0 : tasks.filter((t) => t.projectId === deleteTarget.id).length;
        return (
          <div className="modal-overlay" onClick={() => setDeleteTarget(null)}>
            <div className="modal-card" onClick={(e) => e.stopPropagation()}>
              <div className="modal-title">
                {isArea ? `¿Eliminar el área "${area?.name}"?` : isTask ? `¿Eliminar "${task?.title}"?` : `¿Eliminar el proyecto "${project?.name}"?`}
              </div>
              <div className="modal-text">
                {isArea
                  ? (count > 0 ? `Esto también va a borrar sus ${count} tarea${count === 1 ? "" : "s"}. Esta acción no se puede deshacer.` : "Esta acción no se puede deshacer.")
                  : isTask ? "Esta acción no se puede deshacer."
                  : (count > 0 ? `Las ${count} tarea${count === 1 ? "" : "s"} de este proyecto van a quedar sin proyecto asignado, dentro de "${area?.name}".` : "Esta acción no se puede deshacer.")}
              </div>
              <div className="modal-actions">
                <button className="modal-btn modal-btn--cancel" onClick={() => setDeleteTarget(null)}>Cancelar</button>
                <button className="modal-btn modal-btn--danger" onClick={confirmDelete}>{isArea ? "Eliminar área" : isTask ? "Eliminar" : "Eliminar proyecto"}</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
