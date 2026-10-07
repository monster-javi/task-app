import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@supabase/supabase-js";
import {
  Search, Bell, ChevronDown, ChevronRight, ChevronLeft,
  Trash2, Loader2, Plus, Circle, CircleDot, CheckCircle2, Pencil, ListChecks,
  List as ListIcon, Flag, Calendar as CalendarIcon, ChevronsDown, ChevronsUp, X,
  RefreshCw, Cloud, CloudOff, Download, Upload, Settings, Lock, Unlock, Info, GripVertical, EyeOff, Star, Inbox, CalendarX, ArrowRight, StickyNote, CalendarRange, Undo2,
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
const EVENT_COLORS = ["#A78BFA", "#4C8DFF", "#2DD4BF", "#34D399", "#F2AB43", "#FB923C", "#F25F55", "#F472B6"];
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

// ---------- idioma (ESP / ENG, igual que Gastos App) ----------
// Las frases en español son la clave; EN tiene su traducción. Lo que no está
// en EN se muestra en español (nunca queda un texto vacío).
const EN = {
  "Tarea sin título": "Untitled task",
  "Ir a esta alerta": "Go to this alert",
  "Verificando...": "Checking...",
  "Confirmar y desactivar": "Confirm and turn off",
  "Activando...": "Turning on...",
  "Hoy": "Today",
  "Limpiar": "Clear",
  "Agregar tarea general (sin proyecto)": "Add general task (no project)",
  "Agregar tarea": "Add task",
  "Nueva tarea general": "New general task",
  "Nueva tarea": "New task",
  "No se pudo conectar con Supabase": "Couldn't connect to Supabase",
  "Usá al menos 8 caracteres.": "Use at least 8 characters.",
  "Las contraseñas no coinciden.": "Passwords don't match.",
  "El cifrado necesita HTTPS (o localhost). Esta página no cumple ese requisito.": "Encryption requires HTTPS (or localhost). This page doesn't meet that requirement.",
  "Cifrado activado": "Encryption turned on",
  "No se pudo activar el cifrado: ": "Couldn't turn on encryption: ",
  "Ingresá tu contraseña de cifrado.": "Enter your encryption password.",
  "Contraseña incorrecta.": "Wrong password.",
  "No se pudo desbloquear: ": "Couldn't unlock: ",
  "Ingresá tu contraseña de cifrado actual.": "Enter your current encryption password.",
  "Cifrado desactivado": "Encryption turned off",
  "No se pudo desactivar: ": "Couldn't turn it off: ",
  "Se agotó el tiempo de espera — revisá tu conexión a internet.": "The request timed out — check your internet connection.",
  "Completá email y contraseña.": "Enter your email and password.",
  "La contraseña necesita al menos 6 caracteres.": "The password needs at least 6 characters.",
  "Te mandamos un mail para confirmar la cuenta — revisá tu bandeja de entrada.": "We sent you an email to confirm your account — check your inbox.",
  "No se pudo entrar como invitado — el proyecto necesita tener 'Anonymous sign-ins' activado en Supabase.": "Couldn't sign in as a guest — the project needs 'Anonymous sign-ins' enabled in Supabase.",
  "Vencida": "Overdue",
  "venció ayer": "was due yesterday",
  "venció hace {n} días": "was due {n} days ago",
  "Mañana": "Tomorrow",
  "En {n} días": "In {n} days",
  "Evento": "Event",
  "{a} al {b}": "{a} to {b}",
  "Día {n} de {total}": "Day {n} of {total}",
  "Evento hoy": "Event today",
  "hasta el {date}": "until {date}",
  "y {n} más": "and {n} more",
  "Task App — alertas": "Task App — alerts",
  "ALERTAS": "ALERTS",
  "Sin vencimientos ni alertas por ahora.": "No due dates or alerts for now.",
  "Anterior": "Previous",
  "Siguiente": "Next",
  "Backup descargado": "Backup downloaded",
  "Archivo inválido": "Invalid file",
  "El archivo no tiene el formato esperado": "The file doesn't have the expected format",
  "Datos restaurados": "Data restored",
  "Todo borrado": "Everything deleted",
  "1 tarea creada": "1 task created",
  "{n} tareas creadas": "{n} tasks created",
  "Tarea creada": "Task created",
  "Área eliminada": "Area deleted",
  "Proyecto eliminado": "Project deleted",
  "Tarea eliminada": "Task deleted",
  "Movida al {date}": "Moved to {date}",
  "Sin fecha": "No date",
  "Evento movido al {date}": "Event moved to {date}",
  "Evento guardado": "Event saved",
  "Evento creado": "Event created",
  "Evento eliminado": "Event deleted",
  "{a} al {b} · {n} días": "{a} to {b} · {n} days",
  "Nuevo evento": "New event",
  "1 día": "1 day",
  "{n} días": "{n} days",
  "Vacaciones, viaje, congreso…": "Vacation, trip, conference…",
  "Desde": "From",
  "Hasta": "To",
  "Color": "Color",
  "Nota (opcional)": "Note (optional)",
  "Eliminar": "Delete",
  "Cancelar": "Cancel",
  "Guardar": "Save",
  "Crear evento": "Create event",
  "Ver detalle": "View details",
  "Notas": "Notes",
  "Buscar": "Search",
  "Ocultar hechas": "Hide done",
  "Mostrando solo favoritas — tocá para ocultarlas": "Showing favorites only — tap to hide them",
  "Ocultando favoritas — tocá para apagar el filtro": "Hiding favorites — tap to turn the filter off",
  "Filtro de favoritas (apagado)": "Favorites filter (off)",
  "Nueva nota": "New note",
  "No se pudo guardar — tocá para reintentar": "Couldn't save — tap to retry",
  "Configuración": "Settings",
  "Pendientes": "Pending",
  "Vencidas": "Overdue",
  "Sin resultados para \"{q}\"": "No results for \"{q}\"",
  "No hay nada vencido.": "Nothing is overdue.",
  "No hay pendientes.": "Nothing pending.",
  "Eventos": "Events",
  "Nombre del área": "Area name",
  "Nueva área": "New area",
  "Invitado": "Guest",
  "Sesión de prueba": "Trial session",
  "Con cuenta": "Signed in",
  "Salir": "Sign out",
  "Nueva tarea...": "New task...",
  "Volver": "Back",
  "Buscar en esta área": "Search this area",
  "SIN PROYECTO": "NO PROJECT",
  "Nombre del proyecto": "Project name",
  "Nuevo proyecto": "New project",
  "Eliminar tarea": "Delete task",
  "Agregar una nota…": "Add a note…",
  "Estado": "Status",
  "Prioridad": "Priority",
  "Fecha": "Date",
  "Área": "Area",
  "Proyecto": "Project",
  "General": "General",
  "Pasar a Notas": "Move to Notes",
  "La saca de las tareas y la guarda como nota": "Removes it from your tasks and keeps it as a note",
  "Creá un área primero.": "Create an area first.",
  "Escribí una nota y tocá Enter...": "Type a note and press Enter...",
  "hoy": "today",
  "ayer": "yesterday",
  "hace {n} días": "{n} days ago",
  "Guardada en Notas": "Saved to Notes",
  "Ahora es una tarea en {dest}": "It's now a task in {dest}",
  "Nota eliminada": "Note deleted",
  "Convertir en tarea en…": "Turn into a task in…",
  "Donde estaba: {place}": "Where it was: {place}",
  "Enter para crear · arrastrá una tarea a Notas para guardarla acá": "Enter to create · drag a task to Notes to keep it here",
  "Ninguna nota coincide con \"{q}\".": "No notes match \"{q}\".",
  "Todavía no hay notas.": "No notes yet.",
  "Sin título": "Untitled",
  "Escribí algo…": "Write something…",
  "de {place}": "from {place}",
  "Convertir en tarea (volver a donde estaba o elegir un área)": "Turn into a task (back to where it was, or pick an area)",
  "A tareas": "To tasks",
  "Eliminar nota": "Delete note",
  "Terminó ayer": "Ended yesterday",
  "Hace {n} días": "{n} days ago",
  "Ver en el calendario": "View in calendar",
  "Ver": "View",
  "Vacaciones, viajes, rodajes o cualquier cosa que dure uno o varios días. También podés crearlos arrastrando sobre los días en el Calendario.": "Vacations, trips, shoots or anything that lasts one or more days. You can also create them by dragging across days in the Calendar.",
  "Todavía no hay eventos.": "No events yet.",
  "En curso": "Ongoing",
  "Próximos": "Upcoming",
  "Pasados": "Past",
  "NOTAS": "NOTES",
  "Buscar en notas": "Search notes",
  "Todavía no hay notas. Tocá + para crear una, o deslizá una tarea hacia la izquierda y tocá Notas.": "No notes yet. Tap + to create one, or swipe a task left and tap Notes.",
  "EVENTOS": "EVENTS",
  "Todavía no hay eventos. Tocá + para crear uno (vacaciones, un viaje, lo que dure uno o varios días).": "No events yet. Tap + to create one (a vacation, a trip, anything that lasts one or more days).",
  "Nota guardada": "Note saved",
  "Nota creada": "Note created",
  "Crear": "Create",
  "Título": "Title",
  "Convertir en tarea en": "Turn into a task in",
  "Elegí un área…": "Pick an area…",
  "Convertir": "Convert",
  "Listo": "Done",
  "Ayer": "Yesterday",
  "Prioridad alta": "High priority",
  "Nueva tarea…": "New task…",
  "Marcar como pendiente": "Mark as pending",
  "Marcar como hecha": "Mark as done",
  "Haciendo": "Doing",
  "Mes anterior": "Previous month",
  "Mes siguiente": "Next month",
  "hasta {date}": "until {date}",
  "Agregar a este día": "Add to this day",
  "Día libre. Escribí arriba o arrastrá una tarea acá.": "Free day. Type above or drag a task here.",
  "Todo tiene fecha. Arrastrá una tarea acá para sacársela.": "Everything has a date. Drag a task here to clear it.",
  "Arrastralas a un día para agendarlas.": "Drag them onto a day to schedule them.",
  "Pasar a hoy": "Move to today",
  "Quitar fecha": "Clear date",
  "Elegir mes": "Pick month",
  "Anterior (RePág)": "Previous (PgUp)",
  "Ir a hoy (T)": "Go to today (T)",
  "Siguiente (AvPág)": "Next (PgDn)",
  "Nuevo evento (también podés arrastrar sobre los días)": "New event (you can also drag across days)",
  "Mes": "Month",
  "Semana": "Week",
  "Día": "Day",
  "{n} más": "{n} more",
  "Agregar": "Add",
  "1 pendiente": "1 pending",
  "{n} pendientes": "{n} pending",
  "Todo el día": "All day",
  "Agregar tarea para {when}": "Add a task for {when}",
  "este día": "this day",
  "Nada agendado. Agregá una tarea arriba o arrastrá una desde \"Sin fecha\".": "Nothing scheduled. Add a task above or drag one from \"No date\".",
  "Hechas": "Done",
  "Atrasadas": "Overdue",
  "{n} pasadas a hoy": "{n} moved to today",
  "Pasar todas a hoy": "Move all to today",
  "Arrastrá sobre varios días para crear un evento · doble clic para una tarea · arrastrá tareas y eventos para moverlos · T para hoy": "Drag across days to create an event · double-click for a task · drag tasks and events to move them · T for today",
  "Tarea": "Task",
  "Detalle": "Details",
  "+ nota": "+ note",
  "Cargando...": "Loading...",
  "Email": "Email",
  "Contraseña": "Password",
  "Un momento...": "One moment...",
  "Ingresar": "Sign in",
  "Crear cuenta": "Create account",
  "¿No tenés cuenta? Creá una": "Don't have an account? Create one",
  "¿Ya tenés cuenta? Ingresá": "Already have an account? Sign in",
  "o": "or",
  "Probar sin cuenta": "Try without an account",
  "Entrás directo, sin registrarte. Tus datos quedan atados a este navegador.": "Jump right in, no sign-up. Your data stays tied to this browser.",
  "Tus datos están cifrados. Ingresá tu contraseña de cifrado para desbloquearlos.": "Your data is encrypted. Enter your encryption password to unlock it.",
  "Contraseña de cifrado": "Encryption password",
  "Desbloqueando...": "Unlocking...",
  "Desbloquear": "Unlock",
  "VISTAS": "VIEWS",
  "Lista": "List",
  "Por prioridad": "By priority",
  "Calendario": "Calendar",
  "Arrastrá una tarea acá para guardarla como nota": "Drag a task here to keep it as a note",
  "Soltá acá": "Drop here",
  "ÁREAS": "AREAS",
  "Todas": "All",
  "Cambiar color": "Change color",
  "Quitar de favoritos": "Remove from favorites",
  "Marcar como favorita": "Mark as favorite",
  "Renombrar área": "Rename area",
  "Eliminar área": "Delete area",
  "Nombre del área...": "Area name...",
  "Cerrar sesión": "Sign out",
  "Notificaciones": "Notifications",
  "Activas · cada hora": "On · every hour",
  "Apagadas": "Off",
  "Activar/desactivar notificaciones": "Turn notifications on/off",
  "Todas las tareas": "All tasks",
  "Buscar...": "Search...",
  "Mostrando solo favoritas — clic para ocultarlas": "Showing favorites only — click to hide them",
  "Ocultando favoritas — clic para apagar el filtro": "Hiding favorites — click to turn the filter off",
  "Alertas": "Alerts",
  "Datos cifrados — ver cifrado": "Data encrypted — view encryption",
  "Datos sin cifrar — ver cifrado": "Data not encrypted — view encryption",
  "Guardando...": "Saving...",
  "Sincronizado": "Synced",
  "Conectado a Supabase": "Connected to Supabase",
  "Idioma": "Language",
  "Idioma de la app.": "App language.",
  "Ver cifrado": "View encryption",
  "Favoritos": "Favorites",
  "Texto libre": "Free text",
  "Formulario": "Form",
  "Escribí todo lo que tenés en la cabeza... ej: reunión jueves urgente wanka moria, cortar pasto finde casa": "Write down everything on your mind... e.g.: call the plumber tomorrow urgent casa, render previz on friday wanka",
  "Procesar": "Process",
  "Enter procesa · Shift+Enter agrega una línea. Se interpreta en el momento, sin IA: \"hoy\" / \"mañana\" / \"el jueves\" / \"finde\" → fecha. \"urgente\" o \"rápido\" → prioridad alta.": "Enter processes · Shift+Enter adds a line. It's read on the spot, no AI: \"today\" / \"tomorrow\" / \"on thursday\" / \"weekend\" → date. \"urgent\" or \"asap\" → high priority.",
  "Las tareas se crean en": "Tasks are created in",
  "Título de la tarea": "Task title",
  "Sin proyecto": "No project",
  "Sin tareas vencidas.": "No overdue tasks.",
  "Sin tareas pendientes.": "No pending tasks.",
  "No hay tareas para mostrar. Escribí algo arriba y tocá \"Procesar\".": "No tasks to show. Type something above and click \"Process\".",
  "Renombrar proyecto": "Rename project",
  "Eliminar proyecto": "Delete project",
  "Nombre del nuevo proyecto...": "New project name...",
  "Cifrado de extremo a extremo": "End-to-end encryption",
  "Tus datos están cifrados en tu navegador antes de llegar a Supabase (AES-256-GCM). Ni Supabase ni nadie con acceso a la base puede leerlos.": "Your data is encrypted in your browser before it reaches Supabase (AES-256-GCM). Neither Supabase nor anyone with database access can read it.",
  "Tus datos se guardan en Supabase sin cifrar. Podés activar el cifrado de extremo a extremo cuando quieras.": "Your data is stored in Supabase unencrypted. You can turn on end-to-end encryption whenever you want.",
  "Cerrar": "Close",
  "Desactivar cifrado": "Turn off encryption",
  "Activar cifrado": "Turn on encryption",
  "Ingresá tu contraseña de cifrado actual para confirmar que querés desactivarlo. Una vez desactivado, tus datos quedan en texto plano en Supabase.": "Enter your current encryption password to confirm you want to turn it off. Once it's off, your data is stored as plain text in Supabase.",
  "Contraseña de cifrado actual": "Current encryption password",
  "Creá una contraseña de cifrado. Es distinta de tu contraseña de acceso y nunca sale de este navegador. Si la olvidás, no hay forma de recuperar los datos.": "Create an encryption password. It's different from your sign-in password and never leaves this browser. If you forget it, there's no way to recover your data.",
  "Repetí la contraseña": "Repeat the password",
  "Seguridad": "Security",
  "Cifrado": "Encryption",
  "Tus datos están cifrados.": "Your data is encrypted.",
  "Tus datos no están cifrados.": "Your data isn't encrypted.",
  "Inicio de semana": "Week starts on",
  "Orden de los días en el calendario.": "Order of the days in the calendar.",
  "Lunes (sáb/dom al final)": "Monday (Sat/Sun at the end)",
  "Domingo": "Sunday",
  "Feriados en el calendario": "Holidays in the calendar",
  "Marca los feriados nacionales. En Argentina incluye también los móviles (Carnaval, Semana Santa, trasladables).": "Marks national holidays. For Argentina it also includes the movable ones (Carnival, Holy Week, moved holidays).",
  "Ninguno": "None",
  "Argentina": "Argentina",
  "España": "Spain",
  "México": "Mexico",
  "Estados Unidos": "United States",
  "Brasil": "Brazil",
  "Chile": "Chile",
  "Datos": "Data",
  "Exportar / Restaurar": "Export / Restore",
  "Backup manual, aparte de la nube.": "Manual backup, separate from the cloud.",
  "Exportar": "Export",
  "Restaurar": "Restore",
  "Zona de riesgo": "Danger zone",
  "Borrar todos los datos": "Delete all data",
  "Borra todo. No se puede deshacer.": "Deletes everything. It can't be undone.",
  "¿Borrar": "Delete",
  "todas": "all",
  "tus áreas, proyectos, tareas, eventos y notas? Esta acción no se puede deshacer.": "your areas, projects, tasks, events and notes? This can't be undone.",
  "Sí, borrar todo": "Yes, delete everything",
  "¿Eliminar el área \"{name}\"?": "Delete the area \"{name}\"?",
  "¿Eliminar \"{name}\"?": "Delete \"{name}\"?",
  "¿Eliminar el proyecto \"{name}\"?": "Delete the project \"{name}\"?",
  "Esto también va a borrar su tarea. Esta acción no se puede deshacer.": "This will also delete its task. This can't be undone.",
  "Esto también va a borrar sus {n} tareas. Esta acción no se puede deshacer.": "This will also delete its {n} tasks. This can't be undone.",
  "Esta acción no se puede deshacer.": "This can't be undone.",
  "La tarea de este proyecto va a quedar sin proyecto asignado, dentro de \"{area}\".": "This project's task will stay in \"{area}\" with no project.",
  "Las {n} tareas de este proyecto van a quedar sin proyecto asignado, dentro de \"{area}\".": "This project's {n} tasks will stay in \"{area}\" with no project.",
  "Por hacer": "To do",
  "Hecho": "Done",
  "Alta": "High",
  "Media": "Medium",
  "Baja": "Low"
};
let CUR_LANG = "es";
function tr(s, vars) {
  let out = (CUR_LANG === "en" && EN[s]) || s;
  if (vars) for (const k of Object.keys(vars)) out = out.split(`{${k}}`).join(vars[k] == null ? "" : String(vars[k]));
  return out;
}
const MONTH_LABELS_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTH_ABBR_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAY_LABELS_EN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WEEKDAY_LABELS_SUN_FIRST_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAY_FULL_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const ML = () => (CUR_LANG === "en" ? MONTH_LABELS_EN : MONTH_LABELS);
const MA = () => (CUR_LANG === "en" ? MONTH_ABBR_EN : MONTH_ABBR);
const WL = () => (CUR_LANG === "en" ? WEEKDAY_LABELS_EN : WEEKDAY_LABELS);
const WLS = () => (CUR_LANG === "en" ? WEEKDAY_LABELS_SUN_FIRST_EN : WEEKDAY_LABELS_SUN_FIRST);
const WF = () => (CUR_LANG === "en" ? WEEKDAY_FULL_EN : WEEKDAY_FULL_BY_JSDAY);

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
  return WF()[new Date(y, m - 1, d).getDay()];
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
  Alta: ["urgente", "rápido", "rapido", "alta prioridad", "prioridad alta", "alta", "high priority", "urgent", "asap"],
  Baja: ["baja prioridad", "prioridad baja", "baja", "low priority"],
  Media: ["media prioridad", "prioridad media", "media", "medium priority"],
};

const WEEKDAY_WORDS = [
  { dow: 0, words: ["domingo", "sunday"] },
  { dow: 1, words: ["lunes", "monday"] },
  { dow: 2, words: ["martes", "tuesday"] },
  { dow: 3, words: ["miércoles", "miercoles", "wednesday"] },
  { dow: 4, words: ["jueves", "thursday"] },
  { dow: 5, words: ["viernes", "friday"] },
  { dow: 6, words: ["sábado", "sabado", "saturday"] },
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
  if (!base) return tr("Tarea sin título");
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
    // English too, so "Texto libre" works when the app is in ENG
    { phrase: "day after tomorrow", get: () => dateToISOLocal(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 2)) },
    { phrase: "today", get: () => dateToISOLocal(today) },
    { phrase: "tomorrow", get: () => dateToISOLocal(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)) },
    { phrase: "this weekend", get: () => dateToISOLocal(nextDow(today, 6)) },
    { phrase: "weekend", get: () => dateToISOLocal(nextDow(today, 6)) },
  ];
  for (const p of phrases) {
    const stripped = stripPhrase(remaining, p.phrase);
    if (stripped !== null) return { date: p.get(), text: stripped };
  }

  for (const wd of WEEKDAY_WORDS) {
    for (const w of wd.words) {
      for (const prefix of ["el ", "on ", "next "]) {
        const stripped = stripPhrase(remaining, `${prefix}${w}`);
        if (stripped !== null) return { date: dateToISOLocal(nextDow(today, wd.dow)), text: stripped };
      }
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
  .brand-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--amber); box-shadow: 0 0 0 3px rgba(242,171,67,0.15); }

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
      {tr(value)}
    </button>
  );
}

function StatusPill({ value, onClick }) {
  const Icon = STATUS_ICON[value];
  return (
    <button className={`pill pill--${value.replace(" ", "")}`} onClick={onClick}>
      <Icon size={13} strokeWidth={2.2} />
      {tr(value)}
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
  const weekdayLabels = weekStartsSunday ? WLS() : WL();

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
              <span className="datefield-pop-label">{ML()[cursor.month]} {cursor.year}</span>
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
              <button type="button" className="datefield-action" onClick={() => pick(todayISO())}>{tr("Hoy")}</button>
              <button type="button" className="datefield-action" onClick={() => pick(null)}>{tr("Limpiar")}</button>
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
        title={general ? tr("Agregar tarea general (sin proyecto)") : tr("Agregar tarea")}
      />
    );
  }
  return (
    <div className={`quick-add-row ${indent ? "quick-add-row--indent" : ""}`}>
      <input
        autoFocus
        type="text"
        className="quick-add-input"
        placeholder={placeholder || (general ? tr("Nueva tarea general") : tr("Nueva tarea"))}
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
  CUR_LANG = appLang === "en" ? "en" : "es";
  useEffect(() => { document.documentElement.lang = appLang === "en" ? "en" : "es"; }, [appLang]);
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
  const [urgentPaused, setUrgentPaused] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => loadLocalPrefs().notificationsEnabled !== false);
  // Eventos (multi-día, como Google Calendar) y Notas: cada uno es su propia
  // fila en task_kv ("event:<id>" / "note:<id>"), igual que las tareas.
  const [events, setEvents] = useState([]);
  const [notes, setNotes] = useState([]);
  const eventsRef = useRef([]);
  const notesRef = useRef([]);
  const extraSnapshotsRef = useRef(new Map()); // rowKey -> JSON of the last saved event/note
  const [showNotifPanel, setShowNotifPanel] = useState(false);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [confirmingWipe, setConfirmingWipe] = useState(false);
  const restoreInputRef = useRef(null);

  const [deleteTarget, setDeleteTarget] = useState(null); // { type: 'area'|'project', id, areaId? }

  const [view, setView] = useState(() => {
    const saved = loadLocalPrefs().view;
    return ["calendario", "prioridad", "eventos", "notas"].includes(saved) ? saved : "lista";
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
  // eventos: arrastrar sobre los días para crear, mover la barra, estirarla
  const [calDragEventId, setCalDragEventId] = useState(null);
  const calDragEventOffsetRef = useRef(0);
  const [eventDraft, setEventDraft] = useState(null); // { anchor, current } while drag-selecting days
  const [eventEditor, setEventEditor] = useState(null); // { id|null, title, start, end, color, note, x, y }
  const [eventResize, setEventResize] = useState(null); // { id, edge, start, end } live preview
  const [mobileEventEdit, setMobileEventEdit] = useState(null);
  const [mobileNoteEdit, setMobileNoteEdit] = useState(null);
  const [draggingToNotes, setDraggingToNotes] = useState(false);
  const [notePick, setNotePick] = useState(null); // { id, x, y } — "convertir en tarea" menu

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
        extraSnapshotsRef.current = new Map();
        setEncPass(""); setEncPass2(""); setEncError("");
        setAreas([]);
        setTasks([]);
        setEvents([]);
        setNotes([]);
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

  function applyExtraCollections({ events: ev = [], notes: nt = [] }) {
    setEvents(ev);
    setNotes(nt);
    eventsRef.current = ev;
    notesRef.current = nt;
    const snap = new Map();
    ev.forEach((x) => snap.set(`event:${x.id}`, JSON.stringify(x)));
    nt.forEach((x) => snap.set(`note:${x.id}`, JSON.stringify(x)));
    extraSnapshotsRef.current = snap;
  }

  // All event/note rows as [rowKey, object] pairs (for encryption on/off).
  function extraRowEntries() {
    return [
      ...eventsRef.current.map((x) => [`event:${x.id}`, x]),
      ...notesRef.current.map((x) => [`note:${x.id}`, x]),
    ];
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
        const extra = { events: [], notes: [] };
        for (const row of rows) {
          if (row.key === "__enc_meta__") continue;
          const value = await getRowValue(row, key);
          if (value === undefined) continue;
          if (row.key === "areas") newAreas = value || [];
          else if (row.key.startsWith("task:")) tasksArr.push(value);
          else if (row.key.startsWith("event:")) extra.events.push(value);
          else if (row.key.startsWith("note:")) extra.notes.push(value);
        }
        tasksArr.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        setAreas(newAreas);
        setTasks(tasksArr);
        applyExtraCollections(extra);
        areasSnapshotRef.current = JSON.stringify(newAreas);
        taskSnapshotsRef.current = new Map(tasksArr.map((t) => [t.id, JSON.stringify(t)]));
      })();
    }

    async function load() {
      const { data: rows, error } = await supabase.from("task_kv").select("key,value,updated_at");
      if (cancelled) return;
      if (error) {
        console.error(error);
        showToast(tr("No se pudo conectar con Supabase"));
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
        applyExtraCollections({ events: [], notes: [] });
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
          } else if (row.key.startsWith("event:") || row.key.startsWith("note:")) {
            const isEvent = row.key.startsWith("event:");
            const id = row.key.slice(isEvent ? 6 : 5);
            const setter = isEvent ? setEvents : setNotes;
            setter((prev) => {
              const idx = prev.findIndex((x) => x.id === id);
              if (idx === -1) return [...prev, value];
              const copy = [...prev];
              copy[idx] = value;
              return copy;
            });
            extraSnapshotsRef.current.set(row.key, JSON.stringify(value));
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
    if (encPass.length < 8) { setEncError(tr("Usá al menos 8 caracteres.")); return; }
    if (encPass !== encPass2) { setEncError(tr("Las contraseñas no coinciden.")); return; }
    if (!window.isSecureContext || !window.crypto?.subtle) {
      setEncError(tr("El cifrado necesita HTTPS (o localhost). Esta página no cumple ese requisito."));
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
        ...(await Promise.all(extraRowEntries().map(async ([rowKey, obj]) => ({
          user_id: session.user.id, key: rowKey, value: await encryptRowValue(key, obj), updated_at: updatedAt,
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
      showToast(tr("Cifrado activado"));
    } catch (err) {
      console.error("handleEncSetup", err);
      setEncError(tr("No se pudo activar el cifrado: ") + String(err.message || err));
    } finally {
      setEncBusy(false);
    }
  }

  async function handleEncUnlock() {
    setEncError("");
    if (!encPass) { setEncError(tr("Ingresá tu contraseña de cifrado.")); return; }
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
      const extra = { events: [], notes: [] };
      let verifiedOne = false;
      for (const row of rows) {
        if (row.key === "__enc_meta__") continue;
        const value = looksEncryptedValue(row.value)
          ? await decryptPayload(key, JSON.parse(row.value)) // throws on wrong password
          : JSON.parse(row.value);
        verifiedOne = true;
        if (row.key === "areas") newAreas = value || [];
        else if (row.key.startsWith("task:")) tasksArr.push(value);
        else if (row.key.startsWith("event:")) extra.events.push(value);
        else if (row.key.startsWith("note:")) extra.notes.push(value);
      }
      tasksArr.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      encryptionKeyRef.current = key;
      encSaltRef.current = pendingSaltRef.current;
      setAreas(newAreas);
      setTasks(tasksArr);
      applyExtraCollections(extra);
      areasSnapshotRef.current = JSON.stringify(newAreas);
      taskSnapshotsRef.current = new Map(tasksArr.map((t) => [t.id, JSON.stringify(t)]));
      setEncPass("");
      setIsEncrypted(true);
      hasLoadedRef.current = true;
      setBootStatus("ready");
    } catch (err) {
      console.error("handleEncUnlock", err);
      setEncError(err?.name === "OperationError" ? tr("Contraseña incorrecta.") : tr("No se pudo desbloquear: ") + String(err.message || err));
    } finally {
      setEncBusy(false);
    }
  }

  async function handleDisableEncryption() {
    setEncError("");
    if (!encPass) { setEncError(tr("Ingresá tu contraseña de cifrado actual.")); return; }
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
        ...extraRowEntries().map(([rowKey, obj]) => ({ user_id: session.user.id, key: rowKey, value: JSON.stringify(obj), updated_at: updatedAt })),
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
      showToast(tr("Cifrado desactivado"));
    } catch (err) {
      console.error("handleDisableEncryption", err);
      setEncError(err?.name === "OperationError" ? tr("Contraseña incorrecta.") : tr("No se pudo desactivar: ") + String(err.message || err));
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
  }, [areas, tasks, events, notes, bootStatus, session]);

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

      const extraPrev = extraSnapshotsRef.current;
      const extraNow = new Map(extraRowEntries().map(([rowKey, obj]) => [rowKey, obj]));
      const extraWritten = [];
      for (const [rowKey, obj] of extraNow) {
        const json = JSON.stringify(obj);
        if (extraPrev.get(rowKey) !== json) {
          writes.push({ rowKey, value: key ? await encryptRowValue(key, obj) : json });
          extraWritten.push([rowKey, json]);
        }
      }
      const extraDeleted = [];
      for (const rowKey of extraPrev.keys()) {
        if (!extraNow.has(rowKey)) { deleteKeys.push(rowKey); extraDeleted.push(rowKey); }
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
      for (const dk of deleteKeys) if (dk.startsWith("task:")) taskSnapshotsRef.current.delete(dk.slice(5));
      for (const [rowKey, json] of extraWritten) extraSnapshotsRef.current.set(rowKey, json);
      for (const rowKey of extraDeleted) extraSnapshotsRef.current.delete(rowKey);

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


  function withTimeout(promise, ms = 12000, message = tr("Se agotó el tiempo de espera — revisá tu conexión a internet.")) {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
    ]);
  }

  async function handleEmailSignIn() {
    setAuthError(""); setAuthNotice("");
    if (!authEmail.trim() || !authPassword) { setAuthError(tr("Completá email y contraseña.")); return; }
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
    if (!authEmail.trim() || !authPassword) { setAuthError(tr("Completá email y contraseña.")); return; }
    if (authPassword.length < 6) { setAuthError(tr("La contraseña necesita al menos 6 caracteres.")); return; }
    setAuthBusy(true);
    try {
      const { data, error } = await withTimeout(supabase.auth.signUp({ email: authEmail.trim(), password: authPassword }));
      if (error) { setAuthError(error.message); return; }
      if (data.session) return; // confirmación de email desactivada: ya quedó logueado
      setAuthNotice(tr("Te mandamos un mail para confirmar la cuenta — revisá tu bandeja de entrada."));
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
      if (error) setAuthError(tr("No se pudo entrar como invitado — el proyecto necesita tener 'Anonymous sign-ins' activado en Supabase."));
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
  useEffect(() => { eventsRef.current = events; }, [events]);
  useEffect(() => { notesRef.current = notes; }, [notes]);
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
    saveLocalPrefs({ notificationsEnabled });
  }, [notificationsEnabled]);

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

  // ---- alertas (mismo sistema que Gastos App v150+): una lista ordenada por
  // importancia que rota en la barra de abajo cada 4 s, y un aviso del sistema
  // con las urgentes. urgent=true → punto rojo; solo avisos → punto azul.
  const [alertsDay, setAlertsDay] = useState(() => todayISO());
  useEffect(() => {
    const id = setInterval(() => setAlertsDay(todayISO()), 10 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const urgentItems = useMemo(() => {
    const today = alertsDay;
    const items = [];
    const placeOf = (t) => {
      const a = areaMap[t.areaId];
      const p = t.projectId ? a?.projects?.find((x) => x.id === t.projectId) : null;
      return [a?.name, p?.name].filter(Boolean).join(" / ");
    };
    const daysBetween = (from, to) => {
      const [y1, m1, d1] = from.split("-").map(Number);
      const [y2, m2, d2] = to.split("-").map(Number);
      return Math.round((new Date(y2, m2 - 1, d2) - new Date(y1, m1 - 1, d1)) / 86400000);
    };
    tasks.forEach((t) => {
      if (t.status === "Hecho" || !t.date) return;
      const n = daysBetween(today, t.date);
      const base = { key: `t:${t.id}`, task: t, title: t.title, color: areaMap[t.areaId]?.color, go: { taskId: t.id, date: t.date } };
      if (n < 0) items.push({ ...base, kind: "vencida", rank: 0, urgent: true, chip: tr("Vencida"), meta: `${placeOf(t)} · ${n === -1 ? tr("venció ayer") : tr("venció hace {n} días", { n: -n })}`, sortDate: t.date });
      else if (n === 0) items.push({ ...base, kind: "hoy", rank: 1, urgent: true, chip: tr("Hoy"), meta: placeOf(t), sortDate: t.date });
      else if (n === 1) items.push({ ...base, kind: "manana", rank: 2, urgent: true, chip: tr("Mañana"), meta: placeOf(t), sortDate: t.date });
      else if (n <= 3) items.push({ ...base, kind: "pronto", rank: 4, chip: tr("En {n} días", { n }), meta: `${placeOf(t)} · ${fmtDate(t.date)}`, sortDate: t.date });
    });
    events.forEach((ev) => {
      if (!ev.start) return;
      const end = ev.end || ev.start;
      const base = { key: `e:${ev.id}`, event: ev, title: ev.title || tr("Evento"), color: ev.color, go: { eventId: ev.id, date: ev.start } };
      const span = ev.start === end ? fmtDate(ev.start) : tr("{a} al {b}", { a: fmtDate(ev.start), b: fmtDate(end) });
      if (ev.start <= today && end >= today) {
        const total = daysBetween(ev.start, end) + 1;
        const nth = daysBetween(ev.start, today) + 1;
        items.push({ ...base, kind: "evento", rank: 3, chip: total > 1 ? tr("Día {n} de {total}", { n: nth, total }) : tr("Evento hoy"), meta: total > 1 ? tr("hasta el {date}", { date: fmtDate(end) }) : "", sortDate: ev.start });
      } else {
        const n = daysBetween(today, ev.start);
        if (n >= 1 && n <= 3) items.push({ ...base, kind: "eventoPronto", rank: 5, chip: n === 1 ? tr("Mañana") : tr("En {n} días", { n }), meta: span, sortDate: ev.start });
      }
    });
    return items.sort((a, b) => a.rank - b.rank || (a.sortDate < b.sortDate ? -1 : a.sortDate > b.sortDate ? 1 : 0));
  }, [tasks, events, areaMap, alertsDay, appLang]);

  useEffect(() => {
    if (urgentItems.length < 2 || urgentPaused) return;
    const id = setInterval(() => setUrgentIndex((i) => (i + 1) % urgentItems.length), 4000);
    return () => clearInterval(id);
  }, [urgentItems.length, urgentPaused]);
  useEffect(() => {
    if (urgentIndex >= urgentItems.length) setUrgentIndex(0);
  }, [urgentItems.length, urgentIndex]);

  function alertsNotificationBody(list) {
    const urgent = list.filter((i) => i.urgent);
    if (!urgent.length) return null;
    return urgent.slice(0, 4).map((i) => `${i.chip}: ${i.title}${i.meta ? ` (${i.meta})` : ""}`).join("\n")
      + (urgent.length > 4 ? "\n" + tr("y {n} más", { n: urgent.length - 4 }) : "");
  }

  const urgentItemsRef = useRef(urgentItems);
  urgentItemsRef.current = urgentItems;
  useEffect(() => {
    if (!notificationsEnabled || bootStatus !== "ready" || typeof Notification === "undefined") return;
    let stopped = false;
    const fire = () => {
      if (stopped || Notification.permission !== "granted") return;
      const body = alertsNotificationBody(urgentItemsRef.current);
      if (!body) return;
      try { new Notification(tr("Task App — alertas"), { body, tag: "task-alerts" }); } catch { /* not available here */ }
    };
    const first = () => { setTimeout(fire, 4000); };
    if (Notification.permission === "default") Notification.requestPermission().then(first).catch(() => {});
    else first();
    const id = setInterval(fire, 60 * 60 * 1000); // cada hora
    return () => { stopped = true; clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notificationsEnabled, bootStatus]);

  function goToAlert(item) {
    if (!item) return;
    setShowNotifPanel(false);
    if (isMobile) {
      if (item.task) openMobileTask(item.task.id, item.task.areaId);
      else if (item.event) { setMobileEventEdit({ ...item.event }); }
      return;
    }
    const today = todayISO();
    setView("calendario");
    if (item.task) {
      setCalView("dia");
      focusDay(item.task.date < today ? today : item.task.date);
    } else if (item.event) {
      setCalView("mes");
      focusDay(item.event.start <= today && (item.event.end || item.event.start) >= today ? today : item.event.start);
    }
  }

  function renderAlertsBar() {
    const n = urgentItems.length;
    const current = n ? urgentItems[urgentIndex % n] : null;
    const anyUrgent = urgentItems.some((i) => i.urgent);
    return (
      <div
        className={`urgent-bar ${current ? "urgent-bar--tappable" : ""}`}
        onMouseEnter={() => setUrgentPaused(true)}
        onMouseLeave={() => setUrgentPaused(false)}
        onClick={() => current && goToAlert(current)}
        title={current ? tr("Ir a esta alerta") : undefined}
      >
        <span className={`urgent-label ${anyUrgent ? "" : "urgent-label--off"} ${current && !anyUrgent ? "urgent-label--info" : ""}`}>
          <span className={`urgent-dot ${anyUrgent ? "" : "urgent-dot--off"}`} />{tr("ALERTAS")}
        </span>
        {current ? (
          <span className="urgent-item" key={current.key + ":" + urgentIndex}>
            <span className={`urgent-chip urgent-chip--${current.kind}`}>{current.chip}</span>
            {current.color && <span className="urgent-swatch" style={{ background: current.color }} />}
            <span className="urgent-title">{current.title}</span>
            {current.meta && <span className="urgent-meta">{current.meta}</span>}
          </span>
        ) : (
          <span className="urgent-empty">{tr("Sin vencimientos ni alertas por ahora.")}</span>
        )}
        {n > 1 && (
          <span className="urgent-nav" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setUrgentIndex((i) => (i - 1 + n) % n)} title={tr("Anterior")}><ChevronLeft size={15} /></button>
            <span className="urgent-count">{(urgentIndex % n) + 1}/{n}</span>
            <button onClick={() => setUrgentIndex((i) => (i + 1) % n)} title={tr("Siguiente")}><ChevronRight size={15} /></button>
          </span>
        )}
      </div>
    );
  }

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
    const blob = new Blob([JSON.stringify({ areas, tasks, events, notes }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "taskapp_backup_" + new Date().toISOString().slice(0, 10) + ".json";
    a.click();
    URL.revokeObjectURL(a.href);
    showToast(tr("Backup descargado"));
  }

  function restoreData(evt) {
    const file = evt.target.files[0];
    evt.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      let data;
      try { data = JSON.parse(e.target.result); } catch (err) { showToast(tr("Archivo inválido")); return; }
      if (!Array.isArray(data.areas) || !Array.isArray(data.tasks)) { showToast(tr("El archivo no tiene el formato esperado")); return; }
      setAreas(data.areas);
      setTasks(data.tasks);
      setEvents(Array.isArray(data.events) ? data.events : []);
      setNotes(Array.isArray(data.notes) ? data.notes : []);
      showToast(tr("Datos restaurados"));
    };
    reader.readAsText(file);
  }

  function wipeAllData() {
    setAreas([]);
    setTasks([]);
    setEvents([]);
    setNotes([]);
    setConfirmingWipe(false);
    showToast(tr("Todo borrado"));
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
      showToast(newTasks.length === 1 ? tr("1 tarea creada") : tr("{n} tareas creadas", { n: newTasks.length }));
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
    showToast(tr("Tarea creada"));
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
    showToast(tr("Tarea creada"));
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
    showToast(tr("Tarea creada"));
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
      showToast(tr("Área eliminada"));
    } else if (deleteTarget.type === "project") {
      setAreas((prev) => prev.map((a) => (
        a.id === deleteTarget.areaId
          ? { ...a, projects: (a.projects || []).filter((p) => p.id !== deleteTarget.id) }
          : a
      )));
      setTasks((prev) => prev.filter((t) => t.projectId !== deleteTarget.id));
      if (selectedProjectId === deleteTarget.id) setSelectedProjectId(null);
      showToast(tr("Proyecto eliminado"));
    } else if (deleteTarget.type === "task") {
      removeTask(deleteTarget.id);
      if (mobileScreen === "task" && mobileTaskId === deleteTarget.id) {
        setMobileScreen("area");
        setMobileTaskId(null);
      }
      showToast(tr("Tarea eliminada"));
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
    showToast(iso ? tr("Movida al {date}", { date: fmtDate(iso) }) : tr("Sin fecha"));
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
        if (!calDragTaskId && !(calDragEventId && target !== "undated")) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (calDropTarget !== target) setCalDropTarget(target);
      },
      onDragLeave: (e) => {
        if (!e.currentTarget.contains(e.relatedTarget) && calDropTarget === target) setCalDropTarget(null);
      },
      onDrop: (e) => {
        e.preventDefault();
        const raw = e.dataTransfer.getData("text/plain");
        setCalDropTarget(null);
        if (calDragEventId || raw.startsWith("event:")) {
          const evId = calDragEventId || raw.slice(6);
          setCalDragEventId(null);
          if (target !== "undated") moveEventTo(evId, addDaysISO(target, -calDragEventOffsetRef.current));
          return;
        }
        const id = raw || calDragTaskId;
        setCalDragTaskId(null);
        if (id) calSetTaskDate(id, target === "undated" ? null : target);
      },
    };
  }

  // ================= EVENTOS =================
  function isoDiff(a, b) {
    const [y1, m1, d1] = a.split("-").map(Number);
    const [y2, m2, d2] = b.split("-").map(Number);
    return Math.round((new Date(y2, m2 - 1, d2) - new Date(y1, m1 - 1, d1)) / 86400000);
  }

  function eventRange(ev) {
    if (eventResize && eventResize.id === ev.id) return { start: eventResize.start, end: eventResize.end };
    return { start: ev.start, end: ev.end || ev.start };
  }

  const visibleEvents = useMemo(() => events.filter((ev) => ev.start), [events]);

  function eventsOn(iso) {
    return visibleEvents
      .filter((ev) => { const r = eventRange(ev); return r.start <= iso && r.end >= iso; })
      .sort((a, b) => (eventRange(a).start < eventRange(b).start ? -1 : 1));
  }

  // Lays the events that touch these consecutive days out into lanes, the
  // way Google Calendar stacks all-day bars: longest first, first free lane.
  function layoutEvents(isos) {
    const first = isos[0], last = isos[isos.length - 1];
    const list = visibleEvents
      .map((ev) => ({ ev, ...eventRange(ev) }))
      .filter((x) => x.start <= last && x.end >= first)
      .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : isoDiff(b.start, b.end) - isoDiff(a.start, a.end)));
    const laneEnds = [];
    const segs = list.map((x) => {
      const segStart = x.start < first ? first : x.start;
      const segEnd = x.end > last ? last : x.end;
      const col = isos.indexOf(segStart);
      const span = isoDiff(segStart, segEnd) + 1;
      let lane = laneEnds.findIndex((endCol) => endCol < col);
      if (lane === -1) { lane = laneEnds.length; laneEnds.push(col + span - 1); } else laneEnds[lane] = col + span - 1;
      return { ev: x.ev, col, span, lane, segStart, segEnd, contLeft: x.start < first, contRight: x.end > last, start: x.start, end: x.end };
    });
    return { segs, lanes: laneEnds.length };
  }

  function moveEventTo(id, newStart) {
    setEvents((prev) => prev.map((ev) => {
      if (ev.id !== id) return ev;
      const len = isoDiff(ev.start, ev.end || ev.start);
      return { ...ev, start: newStart, end: addDaysISO(newStart, len), updatedAt: Date.now() };
    }));
    showToast(tr("Evento movido al {date}", { date: fmtDate(newStart) }));
  }

  function openEventEditor(data, x, y) {
    setCalPopover(null);
    setEventEditor({ id: null, title: "", note: "", color: EVENT_COLORS[events.length % EVENT_COLORS.length], ...data, x, y });
  }

  function saveEventEditor() {
    if (!eventEditor) return;
    let { start, end } = eventEditor;
    if (!start) return;
    if (!end) end = start;
    if (end < start) [start, end] = [end, start];
    const title = eventEditor.title.trim() || tr("Evento");
    if (eventEditor.id) {
      setEvents((prev) => prev.map((ev) => (ev.id === eventEditor.id ? { ...ev, title, start, end, color: eventEditor.color, note: eventEditor.note || "", updatedAt: Date.now() } : ev)));
      showToast(tr("Evento guardado"));
    } else {
      setEvents((prev) => [...prev, { id: uid(), title, start, end, color: eventEditor.color, note: eventEditor.note || "", createdAt: Date.now() }]);
      showToast(tr("Evento creado"));
    }
    setEventEditor(null);
  }

  function deleteEvent(id) {
    setEvents((prev) => prev.filter((ev) => ev.id !== id));
    setEventEditor(null);
    setMobileEventEdit(null);
    showToast(tr("Evento eliminado"));
  }

  function eventSpanLabel(ev) {
    const end = ev.end || ev.start;
    if (end === ev.start) return fmtDate(ev.start);
    const days = isoDiff(ev.start, end) + 1;
    return tr("{a} al {b} · {n} días", { a: fmtDate(ev.start), b: fmtDate(end), n: days });
  }

  // drag-select days to create an event (mouse only)
  function eventSelectStart(e, iso) {
    if (e.button !== 0) return;
    if (e.target.closest(".cal-chip, .cal-ev, button, input, textarea, .cal-more")) return;
    e.preventDefault();
    setEventDraft({ anchor: iso, current: iso });
  }
  function eventSelectEnter(iso) {
    setEventDraft((d) => (d && d.current !== iso ? { ...d, current: iso } : d));
  }
  useEffect(() => {
    if (!eventDraft) return;
    function onUp(e) {
      setEventDraft((d) => {
        if (d && d.anchor !== d.current) {
          const start = d.anchor < d.current ? d.anchor : d.current;
          const end = d.anchor < d.current ? d.current : d.anchor;
          setTimeout(() => openEventEditor({ start, end }, e.clientX, e.clientY), 0);
        }
        return null;
      });
    }
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!eventDraft]);
  function inDraft(iso) {
    if (!eventDraft) {
      // keep the picked days highlighted while the "Nuevo evento" popover is open
      if (eventEditor && !eventEditor.id && eventEditor.start) {
        const a = eventEditor.end && eventEditor.end < eventEditor.start ? eventEditor.end : eventEditor.start;
        const b = eventEditor.end && eventEditor.end > eventEditor.start ? eventEditor.end : eventEditor.start;
        return iso >= a && iso <= b;
      }
      return false;
    }
    const a = eventDraft.anchor < eventDraft.current ? eventDraft.anchor : eventDraft.current;
    const b = eventDraft.anchor < eventDraft.current ? eventDraft.current : eventDraft.anchor;
    return iso >= a && iso <= b;
  }

  // stretch an event from either end
  function startEventResize(e, ev, edge) {
    e.preventDefault();
    e.stopPropagation();
    setEventResize({ id: ev.id, edge, start: ev.start, end: ev.end || ev.start });
  }
  useEffect(() => {
    if (!eventResize) return;
    function onMove(e) {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const iso = el && el.closest && el.closest("[data-cal-iso]")?.getAttribute("data-cal-iso");
      if (!iso) return;
      setEventResize((r) => {
        if (!r) return r;
        if (r.edge === "end") return { ...r, end: iso < r.start ? r.start : iso };
        return { ...r, start: iso > r.end ? r.end : iso };
      });
    }
    function onUp() {
      setEventResize((r) => {
        if (r) setEvents((prev) => prev.map((ev) => (ev.id === r.id ? { ...ev, start: r.start, end: r.end, updatedAt: Date.now() } : ev)));
        return null;
      });
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    document.body.style.cursor = "ew-resize";
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); document.body.style.cursor = ""; };
  }, [!!eventResize]);

  function renderEventBar(seg, { rowHeight = 22, topOffset = 0 } = {}) {
    const { ev } = seg;
    const color = ev.color || EVENT_COLORS[0];
    const isEditing = eventEditor?.id === ev.id;
    return (
      <div
        key={ev.id + ":" + seg.segStart}
        className={`cal-ev ${seg.contLeft ? "cal-ev--cont-left" : ""} ${seg.contRight ? "cal-ev--cont-right" : ""} ${calDragEventId === ev.id ? "cal-ev--dragging" : ""} ${isEditing ? "cal-ev--open" : ""}`}
        style={{
          "--ev": color,
          left: `calc(${(seg.col * 100) / 7}% + 4px)`,
          width: `calc(${(seg.span * 100) / 7}% - 8px)`,
          top: topOffset + seg.lane * rowHeight,
        }}
        draggable
        title={`${ev.title} · ${eventSpanLabel({ ...ev, start: seg.start, end: seg.end })}`}
        onDragStart={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const colIdx = Math.min(seg.span - 1, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * seg.span)));
          calDragEventOffsetRef.current = isoDiff(seg.start, seg.segStart) + colIdx;
          e.dataTransfer.setData("text/plain", "event:" + ev.id);
          e.dataTransfer.effectAllowed = "move";
          setCalDragEventId(ev.id);
          setEventEditor(null);
        }}
        onDragEnd={() => { setCalDragEventId(null); setCalDropTarget(null); }}
        onClick={(e) => {
          e.stopPropagation();
          const r = e.currentTarget.getBoundingClientRect();
          openEventEditor({ ...ev, end: ev.end || ev.start }, r.left, r.bottom);
        }}
      >
        {!seg.contLeft && <span className="cal-ev-handle cal-ev-handle--start" draggable={false} onMouseDown={(e) => startEventResize(e, ev, "start")} />}
        <span className="cal-ev-title">{seg.contLeft ? "← " : ""}{ev.title}</span>
        {!seg.contRight && <span className="cal-ev-handle cal-ev-handle--end" draggable={false} onMouseDown={(e) => startEventResize(e, ev, "end")} />}
      </div>
    );
  }

  function renderEventEditor() {
    if (!eventEditor) return null;
    const vw = window.innerWidth, vh = window.innerHeight;
    const w = 320;
    const left = Math.min(Math.max(8, eventEditor.x - 20), vw - w - 8);
    const fitsBelow = eventEditor.y + 330 < vh;
    const style = fitsBelow ? { left, top: eventEditor.y + 8, width: w } : { left, bottom: Math.max(8, vh - eventEditor.y + 8), width: w };
    const set = (patch) => setEventEditor((ed) => ({ ...ed, ...patch }));
    const days = eventEditor.start && eventEditor.end ? Math.abs(isoDiff(eventEditor.start, eventEditor.end)) + 1 : 1;
    return createPortal(
      <>
        <div className="cal-pop-scrim" onClick={() => setEventEditor(null)} />
        <div className="cal-pop cal-pop--event" style={{ ...style, "--chip": eventEditor.color }} onClick={(e) => e.stopPropagation()}>
          <div className="cal-pop-area">
            <span className="cal-pop-area-dot" />
            {eventEditor.id ? tr("Evento") : tr("Nuevo evento")} · {days === 1 ? tr("1 día") : tr("{n} días", { n: days })}
            <button className="cal-pop-close" onClick={() => setEventEditor(null)}><X size={14} /></button>
          </div>
          <input
            className="cal-pop-title cal-pop-title--input"
            autoFocus
            placeholder={tr("Vacaciones, viaje, congreso…")}
            value={eventEditor.title}
            onChange={(e) => set({ title: e.target.value })}
            onKeyDown={(e) => { if (e.key === "Enter") saveEventEditor(); if (e.key === "Escape") setEventEditor(null); }}
          />
          <div className="cal-pop-fields">
            <span className="cal-pop-label">{tr("Desde")}</span>
            <DateField value={eventEditor.start} onChange={(v) => v && set({ start: v, end: eventEditor.end && eventEditor.end < v ? v : eventEditor.end })} weekStartsSunday={weekStartsSunday} />
            <span className="cal-pop-label">{tr("Hasta")}</span>
            <DateField value={eventEditor.end} onChange={(v) => v && set({ end: v < eventEditor.start ? eventEditor.start : v })} weekStartsSunday={weekStartsSunday} />
            <span className="cal-pop-label">{tr("Color")}</span>
            <span className="ev-swatches">
              {EVENT_COLORS.map((c) => (
                <button key={c} className={`ev-swatch ${eventEditor.color === c ? "ev-swatch--on" : ""}`} style={{ background: c }} onClick={() => set({ color: c })} title={tr("Color")} />
              ))}
            </span>
          </div>
          <textarea className="ev-note" rows={2} placeholder={tr("Nota (opcional)")} value={eventEditor.note || ""} onChange={(e) => set({ note: e.target.value })} />
          <div className="cal-pop-actions">
            {eventEditor.id && (
              <button className="cal-pop-btn cal-pop-btn--danger" onClick={() => deleteEvent(eventEditor.id)}><Trash2 size={13} />{" "}{tr("Eliminar")}</button>
            )}
            <span style={{ flex: 1 }} />
            <button className="cal-pop-btn" onClick={() => setEventEditor(null)}>{tr("Cancelar")}</button>
            <button className="cal-pop-btn cal-pop-btn--primary" onClick={saveEventEditor}>{eventEditor.id ? tr("Guardar") : tr("Crear evento")}</button>
          </div>
        </div>
      </>,
      document.body
    );
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
    showToast(tr("Tarea creada"));
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
    else if (mobileScreen === "notes" || mobileScreen === "events") { setMobileScreen("areas"); setMobileSearch(""); }
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
    return renderAlertsBar();
  }

  function renderMobileTaskIcons(t) {
    return (
      <button className="m-task-icons" onClick={() => openMobileTask(t.id, t.areaId)} title={tr("Ver detalle")}>
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
          <span className="m-row-actions">
            <button className="m-row-tonote" onClick={() => convertTaskToNote(t.id)}>
              <StickyNote size={16} />{" "}{tr("Notas")}
            </button>
            <button className="m-row-delete" onClick={() => setDeleteTarget({ type: "task", id: t.id })}>
              <Trash2 size={16} />{" "}{tr("Eliminar")}
            </button>
          </span>
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
              <input placeholder={tr("Buscar")} value={mobileSearch} onChange={(e) => { setMobileSearch(e.target.value); setMobileExpandedFilter(null); }} />
            </div>
            <button className={`m-pill ${hideCompleted ? "m-pill--on" : ""}`} onClick={() => setHideCompleted((v) => !v)} title={tr("Ocultar hechas")}>
              {hideCompleted ? <CheckCircle2 size={18} /> : <Circle size={18} />}
            </button>
            <button
              className={`m-pill ${areaFilterMode !== "off" ? "m-pill--on" : ""}`}
              onClick={() => setAreaFilterMode((m) => (m === "off" ? "solo" : m === "solo" ? "mute" : "off"))}
              title={areaFilterMode === "solo" ? tr("Mostrando solo favoritas — tocá para ocultarlas") : areaFilterMode === "mute" ? tr("Ocultando favoritas — tocá para apagar el filtro") : tr("Filtro de favoritas (apagado)")}
            >
              {areaFilterMode === "mute" ? <EyeOff size={18} /> : <Star size={18} fill={areaFilterMode === "solo" ? "currentColor" : "none"} />}
            </button>
            <button className="m-add-btn" onClick={openMobileQuickAdd} title={tr("Nueva nota")}><Plus size={20} strokeWidth={2.6} /></button>
            {syncError ? (
              <button className="m-pill m-pill--bad" onClick={saveDiff} title={tr("No se pudo guardar — tocá para reintentar")}><CloudOff size={18} /></button>
            ) : (
              <button className="m-pill" onClick={() => setShowSettingsPanel(true)} title={tr("Configuración")}><Settings size={18} /></button>
            )}
          </div>
        </div>
        <div className="m-filters">
          <button className={`m-filter ${mobileExpandedFilter === "pendientes" ? "m-filter--active" : ""}`} onClick={() => toggleMobileFilter("pendientes")}>
            {tr("Pendientes")}{" "}<b>{pendientes}</b>
          </button>
          <button className={`m-filter ${mobileExpandedFilter === "vencidas" ? "m-filter--active" : ""}`} onClick={() => toggleMobileFilter("vencidas")}>
            {tr("Vencidas")}{" "}<b className={vencidas > 0 ? "m-filter-bad" : ""}>{vencidas}</b>
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
              {matchedAreas.length === 0 && matchedTasks.length === 0 && <div className="m-empty-hint">{tr("Sin resultados para \"{q}\"", { q: mobileSearch })}</div>}
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
                ? <div className="m-empty-hint">{mobileExpandedFilter === "vencidas" ? tr("No hay nada vencido.") : tr("No hay pendientes.")}</div>
                : (
                  <div className="m-card">
                    <div className="m-card-title">{mobileExpandedFilter === "vencidas" ? tr("Vencidas") : tr("Pendientes")} <span>{filteredTasks.length}</span></div>
                    {filteredTasks.map((t) => renderMobileTaskRow(t, { showArea: true }))}
                  </div>
                )}
            </>
          ) : (
            <>
              <div className="m-special-row">
                <button className="m-special-card" style={{ "--chip": "#A78BFA" }} onClick={() => { setMobileScreen("events"); setMobileSearch(""); }}>
                  <CalendarRange size={18} />
                  <span className="m-special-name">{tr("Eventos")}</span>
                  <span className="m-area-count">{eventGroups().now.length + eventGroups().next.length}</span>
                </button>
                <button className="m-special-card" style={{ "--chip": "#F2AB43" }} onClick={() => { setMobileScreen("notes"); setMobileSearch(""); }}>
                  <StickyNote size={18} />
                  <span className="m-special-name">{tr("Notas")}</span>
                  <span className="m-area-count">{notes.length}</span>
                </button>
              </div>
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
                      <Trash2 size={16} />{" "}{tr("Eliminar")}
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
                    placeholder={tr("Nombre del área")}
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
                <button className="m-add-area-btn" onClick={() => setMobileAddingArea(true)}><Plus size={14} />{" "}{tr("Nueva área")}</button>
              )}
            </>
          )}
        </div>

        <div className="m-session-bar">
          <div>
            <div className="m-account-name">{session?.user?.is_anonymous ? tr("Invitado") : (maskEmail(session?.user?.email))}</div>
            <div className="m-account-sub">{session?.user?.is_anonymous ? tr("Sesión de prueba") : tr("Con cuenta")}</div>
          </div>
          <button className="m-account-logout" onClick={handleLogout}>{tr("Salir")}</button>
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
          placeholder={tr("Nueva tarea...")}
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
            <button className="m-pill" onClick={mobileGoBack} title={tr("Volver")}><ChevronLeft size={20} /></button>
            <div className="m-header-title"><span className="m-header-dot" style={{ background: area.color }} />{area.name.toUpperCase()}</div>
            <button className={`m-pill ${hideCompleted ? "m-pill--on" : ""}`} onClick={() => setHideCompleted((v) => !v)} title={tr("Ocultar hechas")}>
              {hideCompleted ? <CheckCircle2 size={18} /> : <Circle size={18} />}
            </button>
          </div>
          <div className="m-toolbar">
            <div className="m-search">
              <Search size={15} className="m-search-icon" />
              <input placeholder={tr("Buscar en esta área")} value={mobileSearch} onChange={(e) => setMobileSearch(e.target.value)} />
            </div>
            <button className="m-add-btn" onClick={openMobileQuickAdd} title={tr("Nueva nota")}><Plus size={20} strokeWidth={2.6} /></button>
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
                <div className="m-empty-hint">{tr("Sin resultados para \"{q}\"", { q: mobileSearch })}</div>
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
                <span className="m-project-name m-project-name--general">{tr("SIN PROYECTO")}</span>
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
                  placeholder={tr("Nombre del proyecto")}
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
              <button className="m-add-area-btn" onClick={() => setMobileAddingProjectAreaId(area.id)}><Plus size={14} />{" "}{tr("Nuevo proyecto")}</button>
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
            <button className="m-pill" onClick={mobileGoBack} title={tr("Volver")}><ChevronLeft size={20} /></button>
            <div className="m-header-title"><span className="m-header-dot" style={{ background: area?.color }} />{area?.name?.toUpperCase()}{project ? ` · ${project.name}` : ""}</div>
            <button className="m-pill m-pill--danger" onClick={() => { setDeleteTarget({ type: "task", id: t.id }); }} title={tr("Eliminar tarea")}><Trash2 size={17} /></button>
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
            placeholder={tr("Agregar una nota…")}
            defaultValue={t.note}
            onBlur={(e) => setNote(t.id, e.target.value)}
          />

          <div className="m-task-detail-options">
            <div className="m-option-row">
              <span className="m-option-label">{tr("Estado")}</span>
              <StatusPill value={t.status} onClick={() => cycleStatus(t.id)} />
            </div>
            <div className="m-option-row">
              <span className="m-option-label">{tr("Prioridad")}</span>
              <PriorityBadge value={t.priority} onClick={() => cyclePriority(t.id)} />
            </div>
            <div className="m-option-row">
              <span className="m-option-label">{tr("Fecha")}</span>
              <DateField value={t.date} onChange={(v) => setDate(t.id, v)} overdue={isOverdue(t.date, t.status)} weekStartsSunday={weekStartsSunday} />
            </div>
            <div className="m-option-row">
              <span className="m-option-label">{tr("Área")}</span>
              <select className="m-option-select" value={t.areaId} onChange={(e) => moveToArea(e.target.value)}>
                {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            {area?.projects?.length > 0 && (
              <div className="m-option-row">
                <span className="m-option-label">{tr("Proyecto")}</span>
                <select className="m-option-select" value={t.projectId || ""} onChange={(e) => moveToProject(e.target.value)}>
                  <option value="">{tr("General")}</option>
                  {area.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            )}
          </div>
          <button className="m-detail-action" onClick={() => { const id = t.id; setMobileScreen("area"); setMobileTaskId(null); convertTaskToNote(id); }}>
            <StickyNote size={17} />{" "}{tr("Pasar a Notas")}
            <span>{tr("La saca de las tareas y la guarda como nota")}</span>
          </button>
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
            <span className="m-header-title">{tr("Nueva nota")}</span>
          </div>
          <div className="m-empty-hint">{tr("Creá un área primero.")}</div>
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
          <button className="m-pill" onClick={mobileGoBack} title={tr("Volver")}><ChevronLeft size={20} /></button>
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
              <option value="">{tr("General")}</option>
              {area.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
        </div>
        </div>
        <div className="m-quickadd-input-row">
          <input
            autoFocus
            placeholder={tr("Escribí una nota y tocá Enter...")}
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

  // ================= NOTAS =================
  function relTimeLabel(ms) {
    if (!ms) return "";
    const d = new Date(ms);
    const iso = dateToISOLocal(d);
    const today = todayISO();
    if (iso === today) return tr("hoy");
    if (iso === addDaysISO(today, -1)) return tr("ayer");
    const n = isoDiff(iso, today);
    if (n > 0 && n < 7) return tr("hace {n} días", { n });
    return fmtDate(iso);
  }

  function notePlace(n) {
    const a = n.areaId ? areaMap[n.areaId] : null;
    const p = a && n.projectId ? a.projects?.find((x) => x.id === n.projectId) : null;
    return { area: a, label: [a?.name, p?.name].filter(Boolean).join(" / ") };
  }

  function convertTaskToNote(taskId) {
    const t = tasks.find((x) => x.id === taskId);
    if (!t) return;
    const note = {
      id: uid(), title: t.title, body: t.note || "", areaId: t.areaId || null, projectId: t.projectId || null,
      fromTask: { status: t.status, priority: t.priority, date: t.date || null }, createdAt: Date.now(),
    };
    setNotes((prev) => [note, ...prev]);
    setTasks((prev) => prev.filter((x) => x.id !== taskId));
    setDraggedTaskId(null); setDragOverKey(null); setCalDragTaskId(null); setCalDropTarget(null);
    setCalPopover(null);
    setMobileRevealedTaskId(null);
    forceImmediateSaveRef.current = true;
    showToast(tr("Guardada en Notas"));
  }

  // Notes are general (not tied to an area). A note that came from a task
  // remembers where it lived, so it can go back there — or to any other area.
  function noteOrigin(n) {
    const a = n.areaId ? areaMap[n.areaId] : null;
    if (!a) return null;
    const p = n.projectId ? a.projects?.find((x) => x.id === n.projectId) : null;
    return { areaId: a.id, projectId: p ? p.id : null, label: [a.name, p?.name].filter(Boolean).join(" / ") };
  }

  function noteToTask(noteId, destAreaId, destProjectId, override) {
    const found = notes.find((x) => x.id === noteId);
    if (!found) return;
    const n = override ? { ...found, ...override } : found;
    const origin = noteOrigin(n);
    const areaId = destAreaId && areaMap[destAreaId] ? destAreaId : origin ? origin.areaId : ensureArea("General");
    const projectId = destAreaId ? (destProjectId || null) : origin ? origin.projectId : null;
    const task = {
      id: uid(), areaId, projectId, title: (n.title || "").trim() || (n.body || "").split("\n")[0].slice(0, 120) || "Nota",
      note: (n.body || "").replace(/\s*\n\s*/g, " · ").trim(), status: "Por hacer",
      priority: n.fromTask?.priority || "Media", date: n.fromTask?.date || null,
    };
    setTasks((prev) => reassignGroupOrder([...prev, task], areaId, projectId));
    setNotes((prev) => prev.filter((x) => x.id !== noteId));
    setMobileNoteEdit(null);
    setNotePick(null);
    const dest = [areaMap[areaId]?.name, projectId ? areaMap[areaId]?.projects?.find((p) => p.id === projectId)?.name : null].filter(Boolean).join(" / ");
    showToast(tr("Ahora es una tarea en {dest}", { dest: dest || "General" }));
  }

  function createNote({ title = "", body = "" } = {}) {
    const note = { id: uid(), title, body, createdAt: Date.now() };
    setNotes((prev) => [note, ...prev]);
    return note;
  }

  function updateNote(id, patch) {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch, updatedAt: Date.now() } : n)));
  }

  function deleteNote(id) {
    setNotes((prev) => prev.filter((n) => n.id !== id));
    setMobileNoteEdit(null);
    showToast(tr("Nota eliminada"));
  }

  const visibleNotes = useMemo(() => {
    const q = search.trim().toLowerCase();
    return notes
      .filter((n) => !q || (n.title || "").toLowerCase().includes(q) || (n.body || "").toLowerCase().includes(q))
      .sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
  }, [notes, search]);

  const taskDragActive = !!(draggedTaskId || calDragTaskId);
  function notesDropProps() {
    return {
      onDragOver: (e) => {
        if (!draggedTaskId && !calDragTaskId) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (!draggingToNotes) setDraggingToNotes(true);
      },
      onDragLeave: (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDraggingToNotes(false); },
      onDrop: (e) => {
        e.preventDefault();
        e.stopPropagation();
        setDraggingToNotes(false);
        const raw = e.dataTransfer.getData("text/plain");
        const id = draggedTaskId || calDragTaskId || (raw && !raw.startsWith("event:") ? raw : null);
        if (id) convertTaskToNote(id);
      },
    };
  }

  function autoGrow(el) {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }

  function renderNotePickMenu() {
    if (!notePick) return null;
    const n = notes.find((x) => x.id === notePick.id);
    if (!n) return null;
    const origin = noteOrigin(n);
    const vw = window.innerWidth, vh = window.innerHeight;
    const w = 240;
    const left = Math.min(Math.max(8, notePick.x - w + 40), vw - w - 8);
    const style = notePick.y + 320 < vh ? { left, top: notePick.y + 6, width: w } : { left, bottom: vh - notePick.top + 6, width: w };
    return createPortal(
      <>
        <div className="cal-pop-scrim" onClick={() => setNotePick(null)} />
        <div className="cal-pop note-pick" style={style} onClick={(e) => e.stopPropagation()}>
          <div className="note-pick-title">{tr("Convertir en tarea en…")}</div>
          {origin && (
            <button className="note-pick-item note-pick-item--origin" onClick={() => noteToTask(n.id, origin.areaId, origin.projectId)}>
              <Undo2 size={13} /> {tr("Donde estaba: {place}", { place: origin.label })}
            </button>
          )}
          <div className="note-pick-list">
            {orderedAreas.map((a) => (
              <React.Fragment key={a.id}>
                <button className="note-pick-item" onClick={() => noteToTask(n.id, a.id, null)}>
                  <span className="note-pick-dot" style={{ background: a.color }} />{a.name}
                </button>
                {(a.projects || []).map((p) => (
                  <button key={p.id} className="note-pick-item note-pick-item--project" onClick={() => noteToTask(n.id, a.id, p.id)}>{p.name}</button>
                ))}
              </React.Fragment>
            ))}
          </div>
        </div>
      </>,
      document.body
    );
  }

  function renderNotesView() {
    return (
      <div className={`notes-wrap ${draggingToNotes ? "notes-wrap--drop" : ""}`} {...notesDropProps()}>
        <div className="notes-new">
          <Plus size={15} />
          <input
            placeholder={tr("Nueva nota")}
            onKeyDown={(e) => {
              if (e.key === "Enter" && e.currentTarget.value.trim()) {
                createNote({ title: e.currentTarget.value.trim() });
                e.currentTarget.value = "";
              }
            }}
          />
          <span className="notes-new-hint">{tr("Enter para crear · arrastrá una tarea a Notas para guardarla acá")}</span>
        </div>
        {visibleNotes.length === 0 ? (
          <div className="notes-empty">
            {search.trim() ? tr("Ninguna nota coincide con \"{q}\".", { q: search.trim() }) : tr("Todavía no hay notas.")}
          </div>
        ) : (
          <div className="notes-grid">
            {visibleNotes.map((n) => {
              const origin = noteOrigin(n);
              return (
                <div key={n.id} className="note-card">
                  <input
                    className="note-title"
                    defaultValue={n.title}
                    key={n.id + ":t:" + (n.updatedAt || 0)}
                    placeholder={tr("Sin título")}
                    onBlur={(e) => { if (e.target.value !== n.title) updateNote(n.id, { title: e.target.value }); }}
                    onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                  />
                  <textarea
                    className="note-body"
                    defaultValue={n.body}
                    key={n.id + ":b:" + (n.updatedAt || 0)}
                    placeholder={tr("Escribí algo…")}
                    rows={1}
                    ref={autoGrow}
                    onInput={(e) => autoGrow(e.target)}
                    onBlur={(e) => { if (e.target.value !== (n.body || "")) updateNote(n.id, { body: e.target.value }); }}
                  />
                  <div className="note-foot">
                    <span className="note-date">
                      {relTimeLabel(n.updatedAt || n.createdAt)}
                      {origin ? " · " + tr("de {place}", { place: origin.label }) : ""}
                    </span>
                    <span className="note-actions">
                      <button
                        className="note-act"
                        onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setNotePick({ id: n.id, x: r.right, y: r.bottom, top: r.top }); }}
                        title={tr("Convertir en tarea (volver a donde estaba o elegir un área)")}
                      ><Undo2 size={13} />{" "}{tr("A tareas")}</button>
                      <button className="note-act note-act--danger" onClick={() => deleteNote(n.id)} title={tr("Eliminar nota")}><Trash2 size={13} /></button>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {renderNotePickMenu()}
      </div>
    );
  }

  function eventGroups() {
    const today = todayISO();
    const list = [...events].filter((e) => e.start).sort((a, b) => (a.start < b.start ? -1 : 1));
    return {
      now: list.filter((e) => e.start <= today && (e.end || e.start) >= today),
      next: list.filter((e) => e.start > today),
      past: list.filter((e) => (e.end || e.start) < today).reverse(),
    };
  }

  function eventWhenLabel(ev) {
    const today = todayISO();
    const end = ev.end || ev.start;
    if (ev.start <= today && end >= today) {
      const total = isoDiff(ev.start, end) + 1;
      return total > 1 ? tr("Día {n} de {total}", { n: isoDiff(ev.start, today) + 1, total }) : tr("Hoy");
    }
    if (ev.start > today) {
      const n = isoDiff(today, ev.start);
      return n === 1 ? tr("Mañana") : tr("En {n} días", { n });
    }
    const n = isoDiff(end, today);
    return n === 1 ? tr("Terminó ayer") : tr("Hace {n} días", { n });
  }

  function renderEventsView() {
    const g = eventGroups();
    const section = (label, list, cls) => list.length > 0 && (
      <div className="events-section">
        <div className="events-section-title">{label} <span>{list.length}</span></div>
        {list.map((ev) => (
          <div key={ev.id} className={`event-card ${cls || ""}`} style={{ "--ev": ev.color || EVENT_COLORS[0] }}>
            <button
              className="event-card-main"
              onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); openEventEditor({ ...ev, end: ev.end || ev.start }, r.left + 40, r.bottom); }}
            >
              <span className="event-card-bar" />
              <span className="event-card-text">
                <span className="event-card-title">{ev.title}</span>
                <span className="event-card-span">{eventSpanLabel(ev)}{ev.note ? ` · ${ev.note}` : ""}</span>
              </span>
              <span className="event-card-when">{eventWhenLabel(ev)}</span>
            </button>
            <button className="note-act" onClick={() => { setView("calendario"); setCalView("mes"); focusDay(ev.start); }} title={tr("Ver en el calendario")}><CalendarIcon size={13} />{" "}{tr("Ver")}</button>
          </div>
        ))}
      </div>
    );
    return (
      <div className="events-wrap">
        <div className="events-head">
          <div className="events-head-text">{tr("Vacaciones, viajes, rodajes o cualquier cosa que dure uno o varios días. También podés crearlos arrastrando sobre los días en el Calendario.")}</div>
          <button
            className="procesar-btn"
            onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); openEventEditor({ start: todayISO(), end: todayISO() }, r.left - 200, r.bottom); }}
          ><Plus size={14} />{" "}{tr("Nuevo evento")}</button>
        </div>
        {events.length === 0 && <div className="notes-empty">{tr("Todavía no hay eventos.")}</div>}
        {section(tr("En curso"), g.now)}
        {section(tr("Próximos"), g.next)}
        {section(tr("Pasados"), g.past.slice(0, 20), "event-card--past")}
        {renderEventEditor()}
      </div>
    );
  }

  // ================= MOBILE: NOTAS / EVENTOS =================
  function renderMobileNotesScreen() {
    const q = mobileSearch.trim().toLowerCase();
    const list = [...notes]
      .filter((n) => !q || (n.title || "").toLowerCase().includes(q) || (n.body || "").toLowerCase().includes(q))
      .sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
    return (
      <div className="m-screen" style={{ "--chip": "#F2AB43" }} {...mobileSwipeHandlers(true)}>
        {renderMobileBrandBar()}
        <div className="m-topbar">
          <div className="m-toolbar">
            <button className="m-pill" onClick={mobileGoBack} title={tr("Volver")}><ChevronLeft size={20} /></button>
            <div className="m-header-title"><StickyNote size={15} />{tr("NOTAS")}</div>
            <button className="m-add-btn" onClick={() => setMobileNoteEdit({ id: null, title: "", body: "" })} title={tr("Nueva nota")}><Plus size={20} strokeWidth={2.6} /></button>
          </div>
          <div className="m-toolbar">
            <div className="m-search">
              <Search size={15} className="m-search-icon" />
              <input placeholder={tr("Buscar en notas")} value={mobileSearch} onChange={(e) => setMobileSearch(e.target.value)} />
            </div>
          </div>
        </div>
        <div className="m-list">
          {list.length === 0 && (
            <div className="m-empty-hint">{q ? tr("Sin resultados para \"{q}\"", { q: mobileSearch }) : tr("Todavía no hay notas. Tocá + para crear una, o deslizá una tarea hacia la izquierda y tocá Notas.")}</div>
          )}
          {list.length > 0 && (
            <div className="m-card m-notes-card">
              {list.map((n) => {
                const origin = noteOrigin(n);
                return (
                  <button key={n.id} className="m-note-row" onClick={() => setMobileNoteEdit({ ...n, dest: origin ? "origin" : "" })}>
                    <span className="m-note-title">{n.title || tr("Sin título")}</span>
                    {n.body && <span className="m-note-body">{n.body}</span>}
                    <span className="m-note-meta">{relTimeLabel(n.updatedAt || n.createdAt)}{origin ? " · " + tr("de {place}", { place: origin.label }) : ""}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        {renderMobileUrgentBar()}
      </div>
    );
  }

  function renderMobileEventsScreen() {
    const g = eventGroups();
    const section = (label, list) => list.length > 0 && (
      <div className="m-card" style={{ "--chip": "#A78BFA" }}>
        <div className="m-card-title">{label} <span>{list.length}</span></div>
        {list.map((ev) => (
          <button key={ev.id} className="m-event-row" style={{ "--ev": ev.color || EVENT_COLORS[0] }} onClick={() => setMobileEventEdit({ ...ev, end: ev.end || ev.start })}>
            <span className="m-event-bar" />
            <span className="m-event-text">
              <span className="m-event-title">{ev.title}</span>
              <span className="m-event-span">{eventSpanLabel(ev)}</span>
            </span>
            <span className="m-event-when">{eventWhenLabel(ev)}</span>
          </button>
        ))}
      </div>
    );
    return (
      <div className="m-screen" style={{ "--chip": "#A78BFA" }} {...mobileSwipeHandlers(true)}>
        {renderMobileBrandBar()}
        <div className="m-topbar">
          <div className="m-toolbar">
            <button className="m-pill" onClick={mobileGoBack} title={tr("Volver")}><ChevronLeft size={20} /></button>
            <div className="m-header-title"><CalendarRange size={15} />{tr("EVENTOS")}</div>
            <button className="m-add-btn" onClick={() => setMobileEventEdit({ id: null, title: "", start: todayISO(), end: todayISO(), color: EVENT_COLORS[events.length % EVENT_COLORS.length], note: "" })} title={tr("Nuevo evento")}><Plus size={20} strokeWidth={2.6} /></button>
          </div>
        </div>
        <div className="m-list">
          {events.length === 0 && <div className="m-empty-hint">{tr("Todavía no hay eventos. Tocá + para crear uno (vacaciones, un viaje, lo que dure uno o varios días).")}</div>}
          {section(tr("En curso"), g.now)}
          {section(tr("Próximos"), g.next)}
          {section(tr("Pasados"), g.past.slice(0, 20))}
        </div>
        {renderMobileUrgentBar()}
      </div>
    );
  }

  function saveMobileEvent() {
    const ed = mobileEventEdit;
    if (!ed || !ed.start) return;
    let start = ed.start, end = ed.end || ed.start;
    if (end < start) [start, end] = [end, start];
    const title = (ed.title || "").trim() || tr("Evento");
    if (ed.id) setEvents((prev) => prev.map((ev) => (ev.id === ed.id ? { ...ev, title, start, end, color: ed.color, note: ed.note || "", updatedAt: Date.now() } : ev)));
    else setEvents((prev) => [...prev, { id: uid(), title, start, end, color: ed.color || EVENT_COLORS[0], note: ed.note || "", createdAt: Date.now() }]);
    setMobileEventEdit(null);
    showToast(ed.id ? tr("Evento guardado") : tr("Evento creado"));
  }

  function saveMobileNote() {
    const ed = mobileNoteEdit;
    if (!ed) return;
    const title = (ed.title || "").trim();
    const body = ed.body || "";
    if (!title && !body.trim()) { setMobileNoteEdit(null); return; }
    if (ed.id) updateNote(ed.id, { title, body });
    else setNotes((prev) => [{ id: uid(), title, body, areaId: null, projectId: null, createdAt: Date.now() }, ...prev]);
    setMobileNoteEdit(null);
    showToast(ed.id ? tr("Nota guardada") : tr("Nota creada"));
  }

  function renderMobileSheets() {
    if (mobileEventEdit) {
      const ed = mobileEventEdit;
      const set = (patch) => setMobileEventEdit((x) => ({ ...x, ...patch }));
      const days = ed.start && ed.end ? Math.abs(isoDiff(ed.start, ed.end)) + 1 : 1;
      return (
        <div className="modal-overlay" onClick={() => setMobileEventEdit(null)}>
          <div className="modal-card m-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">{ed.id ? tr("Evento") : tr("Nuevo evento")} <span className="m-sheet-sub">{days === 1 ? tr("1 día") : tr("{n} días", { n: days })}</span></div>
            <input className="settings-input m-sheet-input" placeholder={tr("Vacaciones, viaje, congreso…")} value={ed.title} onChange={(e) => set({ title: e.target.value })} autoFocus={!ed.id} />
            <div className="m-sheet-dates">
              <label>{tr("Desde")}<input type="date" className="settings-input m-sheet-input" value={ed.start || ""} onChange={(e) => e.target.value && set({ start: e.target.value, end: ed.end && ed.end < e.target.value ? e.target.value : ed.end })} /></label>
              <label>{tr("Hasta")}<input type="date" className="settings-input m-sheet-input" value={ed.end || ""} min={ed.start} onChange={(e) => e.target.value && set({ end: e.target.value < ed.start ? ed.start : e.target.value })} /></label>
            </div>
            <div className="ev-swatches m-sheet-swatches">
              {EVENT_COLORS.map((c) => (
                <button key={c} className={`ev-swatch ${ed.color === c ? "ev-swatch--on" : ""}`} style={{ background: c }} onClick={() => set({ color: c })} />
              ))}
            </div>
            <textarea className="settings-input m-sheet-input" rows={2} placeholder={tr("Nota (opcional)")} value={ed.note || ""} onChange={(e) => set({ note: e.target.value })} />
            <div className="modal-actions">
              {ed.id && <button className="modal-btn modal-btn--cancel m-sheet-danger" onClick={() => deleteEvent(ed.id)}><Trash2 size={14} /></button>}
              <span style={{ flex: 1 }} />
              <button className="modal-btn modal-btn--cancel" onClick={() => setMobileEventEdit(null)}>{tr("Cancelar")}</button>
              <button className="modal-btn modal-btn--primary" onClick={saveMobileEvent}>{ed.id ? tr("Guardar") : tr("Crear")}</button>
            </div>
          </div>
        </div>
      );
    }
    if (mobileNoteEdit) {
      const ed = mobileNoteEdit;
      const set = (patch) => setMobileNoteEdit((x) => ({ ...x, ...patch }));
      return (
        <div className="modal-overlay" onClick={saveMobileNote}>
          <div className="modal-card m-sheet" onClick={(e) => e.stopPropagation()}>
            <input className="m-sheet-note-title" placeholder={tr("Título")} value={ed.title} onChange={(e) => set({ title: e.target.value })} autoFocus={!ed.id} />
            <textarea className="settings-input m-sheet-input m-sheet-note-body" rows={6} placeholder={tr("Escribí algo…")} value={ed.body} onChange={(e) => set({ body: e.target.value })} />
            {ed.id && (() => {
              const n = notes.find((x) => x.id === ed.id);
              const origin = n ? noteOrigin(n) : null;
              return (
                <div className="m-note-convert">
                  <span className="m-note-convert-label">{tr("Convertir en tarea en")}</span>
                  <div className="m-note-convert-row">
                    <select className="m-option-select m-note-convert-select" value={ed.dest || ""} onChange={(e) => set({ dest: e.target.value })}>
                      <option value="" disabled>{tr("Elegí un área…")}</option>
                      {origin && <option value="origin">{tr("Donde estaba: {place}", { place: origin.label })}</option>}
                      {orderedAreas.map((a) => (
                        <React.Fragment key={a.id}>
                          <option value={a.id + "|"}>{a.name}</option>
                          {(a.projects || []).map((p) => <option key={p.id} value={a.id + "|" + p.id}>&nbsp;&nbsp;{a.name} / {p.name}</option>)}
                        </React.Fragment>
                      ))}
                    </select>
                    <button
                      className="modal-btn modal-btn--cancel"
                      disabled={!ed.dest}
                      onClick={() => {
                        const override = { title: (ed.title || "").trim(), body: ed.body || "" };
                        if (ed.dest === "origin") noteToTask(ed.id, origin.areaId, origin.projectId, override);
                        else { const [aId, pId] = ed.dest.split("|"); noteToTask(ed.id, aId, pId || null, override); }
                      }}
                    ><Undo2 size={14} />{" "}{tr("Convertir")}</button>
                  </div>
                </div>
              );
            })()}
            <div className="modal-actions">
              {ed.id && <button className="modal-btn modal-btn--cancel m-sheet-danger" onClick={() => deleteNote(ed.id)}><Trash2 size={14} /></button>}
              <span style={{ flex: 1 }} />
              <button className="modal-btn modal-btn--primary" onClick={saveMobileNote}>{tr("Listo")}</button>
            </div>
          </div>
        </div>
      );
    }
    return null;
  }

  // ================= CALENDAR =================
  function areaColorOf(t) {
    return areaMap[t.areaId]?.color || "#8d94a0";
  }

  function longDateLabel(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    const thisYear = y === new Date().getFullYear();
    if (CUR_LANG === "en") return `${weekdayFullOf(iso)}, ${ML()[m - 1]} ${d}${thisYear ? "" : `, ${y}`}`;
    return `${weekdayFullOf(iso)} ${d} de ${ML()[m - 1].toLowerCase()}${thisYear ? "" : ` de ${y}`}`;
  }

  function relativeDayLabel(iso) {
    const t = todayISO();
    if (iso === t) return tr("Hoy");
    if (iso === addDaysISO(t, 1)) return tr("Mañana");
    if (iso === addDaysISO(t, -1)) return tr("Ayer");
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
        {t.priority === "Alta" && !done && <span className="cal-chip-prio" aria-label={tr("Prioridad alta")} />}
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
        placeholder={tr("Nueva tarea…")}
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
        <button className="agenda-check" onClick={() => toggleTaskDone(t.id)} title={done ? tr("Marcar como pendiente") : tr("Marcar como hecha")}>
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
        {t.status === "Haciendo" && <CircleDot size={14} className="agenda-doing" title={tr("Haciendo")} />}
      </div>
    );
  }

  function renderMiniMonth() {
    const today = todayISO();
    const labels = weekStartsSunday ? WLS() : WL();
    return (
      <div className="mini-month">
        <div className="mini-month-head">
          <span className="mini-month-label">{ML()[calCursor.month]} {calCursor.year}</span>
          <span className="mini-month-nav">
            <button className="mini-nav-btn" onClick={() => { setCalCursor((c) => (c.month === 0 ? { year: c.year - 1, month: 11 } : { ...c, month: c.month - 1 })); }} title={tr("Mes anterior")}><ChevronLeft size={14} /></button>
            <button className="mini-nav-btn" onClick={() => { setCalCursor((c) => (c.month === 11 ? { year: c.year + 1, month: 0 } : { ...c, month: c.month + 1 })); }} title={tr("Mes siguiente")}><ChevronRight size={14} /></button>
          </span>
        </div>
        <div className="mini-month-grid">
          {labels.map((w) => <span key={w} className="mini-wd">{w.slice(0, 1)}</span>)}
          {monthGrid.map((cell) => {
            const has = (tasksByDate[cell.iso] || []).some((t) => t.status !== "Hecho");
            const evOn = eventsOn(cell.iso);
            return (
              <button
                key={cell.iso}
                className={`mini-day ${!cell.inMonth ? "mini-day--out" : ""} ${cell.iso === today ? "mini-day--today" : ""} ${cell.iso === selectedDay ? "mini-day--selected" : ""}`}
                onClick={() => focusDay(cell.iso)}
              >
                {cell.day}
                {has && <span className="mini-dot" />}
                {evOn.length > 0 && <span className="mini-ev" style={{ background: evOn[0].color || EVENT_COLORS[0] }} />}
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
                <div className="cal-side-day-title">{rel ? `${rel}, ` : ""}{longDateLabel(selectedDay).replace(/^./, (c) => (rel && CUR_LANG !== "en" ? c.toLowerCase() : c))}</div>
                {holidayName && <div className="cal-side-holiday">{holidayName}</div>}
              </div>
              <span className="cal-side-count">{dayTasks.filter((t) => t.status !== "Hecho").length}</span>
            </div>
            {eventsOn(selectedDay).length > 0 && (
              <div className="cal-side-events">
                {eventsOn(selectedDay).map((ev) => (
                  <button
                    key={ev.id}
                    className="ev-row ev-row--small"
                    style={{ "--ev": ev.color || EVENT_COLORS[0] }}
                    onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); openEventEditor({ ...ev, end: ev.end || ev.start }, r.left - 330, r.top); }}
                  >
                    <span className="ev-row-bar" />
                    <span className="ev-row-title">{ev.title}</span>
                    {(ev.end || ev.start) !== ev.start && <span className="ev-row-meta">{tr("hasta {date}", { date: fmtDate(ev.end) })}</span>}
                  </button>
                ))}
              </div>
            )}
            <div className="cal-side-add">
              <Plus size={14} />
              <input
                type="text"
                placeholder={tr("Agregar a este día")}
                value={dayQuickTitle}
                onChange={(e) => setDayQuickTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addTaskForFocusedDay()}
              />
            </div>
            <div className="cal-side-list">
              {dayTasks.length === 0 && <div className="cal-side-empty">{tr("Día libre. Escribí arriba o arrastrá una tarea acá.")}</div>}
              {dayTasks.map((t) => renderAgendaRow(t))}
            </div>
          </section>
        )}

        <section className={`cal-side-section cal-side-section--undated ${calDropTarget === "undated" ? "cal-side-section--drop" : ""}`} {...calDropProps("undated")}>
          <button className="cal-side-toggle" onClick={() => setCalUndatedOpen((v) => !v)}>
            <Inbox size={14} />
            <span>{tr("Sin fecha")}</span>
            <span className="cal-side-count">{undatedTasks.length}</span>
            <span className="cal-side-toggle-chev">{calUndatedOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
          </button>
          {calUndatedOpen && (
            <div className="cal-side-list">
              {undatedTasks.length === 0
                ? <div className="cal-side-empty">{tr("Todo tiene fecha. Arrastrá una tarea acá para sacársela.")}</div>
                : <>
                    <div className="cal-side-hint">{tr("Arrastralas a un día para agendarlas.")}</div>
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
            <div className="cal-pop-day-list">
              {eventsOn(calPopover.id).map((ev) => (
                <button key={ev.id} className="ev-row ev-row--small" style={{ "--ev": ev.color || EVENT_COLORS[0] }}
                  onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); openEventEditor({ ...ev, end: ev.end || ev.start }, r.left, r.bottom); }}>
                  <span className="ev-row-bar" /><span className="ev-row-title">{ev.title}</span>
                </button>
              ))}
              {list.map((t) => renderCalChip(t, { wrap: true }))}
            </div>
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
            <span className="cal-pop-label">{tr("Estado")}</span>
            <StatusPill value={t.status} onClick={() => cycleStatus(t.id)} />
            <span className="cal-pop-label">{tr("Prioridad")}</span>
            <span><PriorityBadge value={t.priority} onClick={() => cyclePriority(t.id)} /></span>
            <span className="cal-pop-label">{tr("Fecha")}</span>
            <DateField value={t.date} onChange={(v) => setDate(t.id, v)} overdue={isOverdue(t.date, t.status)} weekStartsSunday={weekStartsSunday} />
          </div>
          <div className="cal-pop-actions">
            {t.date && t.date !== todayISO() && (
              <button className="cal-pop-btn" onClick={() => calSetTaskDate(t.id, todayISO())}><ArrowRight size={13} />{" "}{tr("Pasar a hoy")}</button>
            )}
            {t.date && (
              <button className="cal-pop-btn" onClick={() => { calSetTaskDate(t.id, null); setCalPopover(null); }}><CalendarX size={13} />{" "}{tr("Quitar fecha")}</button>
            )}
            <span style={{ flex: 1 }} />
            <button className="cal-pop-btn cal-pop-btn--danger" onClick={() => { setCalPopover(null); setDeleteTarget({ type: "task", id: t.id }); }} title={tr("Eliminar")}><Trash2 size={13} /></button>
          </div>
        </div>
      </>,
      document.body
    );
  }

  function renderCalendar() {
    const today = todayISO();
    const labels = weekStartsSunday ? WLS() : WL();
    const weeks = monthGrid.length / 7;
    const maxChips = weeks >= 6 ? 3 : 4;
    const isWeekendIdx = (i) => (weekStartsSunday ? i === 0 || i === 6 : i >= 5);

    let title;
    if (calView === "mes") title = `${ML()[calCursor.month]} ${calCursor.year}`;
    else if (calView === "semana") {
      const a = weekDays[0].iso.split("-").map(Number), b = weekDays[6].iso.split("-").map(Number);
      title = a[1] === b[1]
        ? (CUR_LANG === "en" ? `${ML()[a[1] - 1]} ${a[2]} – ${b[2]}, ${a[0]}` : `${a[2]} – ${b[2]} de ${ML()[a[1] - 1].toLowerCase()} ${a[0]}`)
        : (CUR_LANG === "en" ? `${MA()[a[1] - 1]} ${a[2]} – ${MA()[b[1] - 1]} ${b[2]}, ${b[0]}` : `${a[2]} ${MA()[a[1] - 1].toLowerCase()} – ${b[2]} ${MA()[b[1] - 1].toLowerCase()} ${b[0]}`);
    } else title = longDateLabel(selectedDay);

    const dayCellHandlers = (iso) => ({
      "data-cal-iso": iso,
      onClick: () => { focusDay(iso); setCalPopover(null); },
      onDoubleClick: (e) => { if (e.target.closest(".cal-chip, .cal-ev")) return; focusDay(iso); setCalAddDay(iso); setCalAddText(""); },
      onMouseDown: (e) => eventSelectStart(e, iso),
      onMouseEnter: () => { if (eventDraft) eventSelectEnter(iso); },
      ...calDropProps(iso),
    });
    const MAX_LANES = 3;

    return (
      <div className="calendar-wrap">
        <div className="cal-main">
          <div className="cal-toolbar">
            <div className="cal-title-wrap month-picker-wrap" ref={monthPickerRef}>
              <button
                className="cal-title"
                onClick={() => (showMonthPicker ? setShowMonthPicker(false) : openMonthPicker())}
                title={tr("Elegir mes")}
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
                    {MA().map((m, i) => (
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
              <button className="cal-nav-btn" onClick={() => goPrevNext(-1)} title={tr("Anterior (RePág)")}><ChevronLeft size={16} /></button>
              <button className="cal-today-btn" onClick={goToday} title={tr("Ir a hoy (T)")}>{tr("Hoy")}</button>
              <button className="cal-nav-btn" onClick={() => goPrevNext(1)} title={tr("Siguiente (AvPág)")}><ChevronRight size={16} /></button>
            </div>
            <div className="cal-toolbar-spacer" />
            <button
              className="cal-new-event"
              onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); openEventEditor({ start: selectedDay, end: selectedDay }, r.left - 120, r.bottom); }}
              title={tr("Nuevo evento (también podés arrastrar sobre los días)")}
            >
              <Plus size={14} />{" "}{tr("Evento")}
            </button>
            <div className="cal-view-switch" role="tablist">
              {[["mes", tr("Mes"), "M"], ["semana", tr("Semana"), "S"], ["dia", tr("Día"), "D"]].map(([k, label, key]) => (
                <button key={k} role="tab" aria-selected={calView === k} className={`seg-btn ${calView === k ? "seg-btn--active" : ""}`} onClick={() => switchCalView(k)} title={`${label} (${key})`}>{label}</button>
              ))}
            </div>
          </div>

          {calView === "mes" && (
            <div className="cal-month" style={{ "--weeks": weeks }}>
              <div className="cal-month-head">
                {labels.map((w, i) => <div key={w} className={`cal-weekday ${isWeekendIdx(i) ? "cal-weekday--weekend" : ""}`}>{w}</div>)}
              </div>
              <div className={`cal-month-body ${eventDraft ? "cal-month-body--selecting" : ""}`}>
                {Array.from({ length: weeks }, (_, wi) => monthGrid.slice(wi * 7, wi * 7 + 7)).map((week, wi) => {
                  const { segs, lanes } = layoutEvents(week.map((c) => c.iso));
                  const shownLanes = Math.min(lanes, MAX_LANES);
                  return (
                    <div className="cal-mweek" key={week[0].iso} style={{ "--lanes": shownLanes }}>
                      {week.map((cell, ci) => {
                        const dayTasks = tasksByDate[cell.iso] || [];
                        const isToday = cell.iso === today;
                        const isSelected = cell.iso === selectedDay;
                        const holidayName = isHoliday(cell.iso, holidayCountry);
                        const hiddenEvents = segs.filter((sg) => sg.lane >= MAX_LANES && sg.col <= ci && sg.col + sg.span - 1 >= ci).length;
                        const cap = Math.max(1, maxChips - shownLanes - (holidayName ? 1 : 0));
                        const shown = dayTasks.length > cap ? dayTasks.slice(0, Math.max(0, cap - 1)) : dayTasks;
                        const hidden = dayTasks.length - shown.length + hiddenEvents;
                        return (
                          <div
                            key={cell.iso}
                            className={`cal-cell ${!cell.inMonth ? "cal-cell--out" : ""} ${isWeekendIdx(ci) ? "cal-cell--weekend" : ""} ${isToday ? "cal-cell--today" : ""} ${isSelected ? "cal-cell--selected" : ""} ${holidayName ? "cal-cell--holiday" : ""} ${calDropTarget === cell.iso ? "cal-cell--drop" : ""} ${cell.iso < today && cell.inMonth ? "cal-cell--past" : ""} ${inDraft(cell.iso) ? "cal-cell--range" : ""}`}
                            {...dayCellHandlers(cell.iso)}
                          >
                            <div className="cal-cell-head">
                              <span className="cal-cell-num">{cell.day === 1 && !cell.inMonth ? (CUR_LANG === "en" ? `${MA()[Number(cell.iso.slice(5, 7)) - 1]} 1` : `${cell.day} ${MA()[Number(cell.iso.slice(5, 7)) - 1].toLowerCase()}`) : cell.day}</span>
                              <button
                                className="cal-cell-add"
                                title={tr("Agregar tarea")}
                                onClick={(e) => { e.stopPropagation(); focusDay(cell.iso); setCalAddDay(cell.iso); setCalAddText(""); }}
                              ><Plus size={13} /></button>
                            </div>
                            {holidayName && <div className="cal-cell-holiday" title={holidayName}>{holidayName}</div>}
                            <div className="cal-cell-tasks">
                              {shown.map((t) => renderCalChip(t))}
                              {hidden > 0 && (
                                <button className="cal-more" onClick={(e) => openCalDayPopover(e, cell.iso)}>{tr("{n} más", { n: hidden })}</button>
                              )}
                              {renderCalInlineAdd(cell.iso)}
                            </div>
                          </div>
                        );
                      })}
                      <div className="cal-ev-layer">
                        {segs.filter((sg) => sg.lane < MAX_LANES).map((sg) => renderEventBar(sg, { rowHeight: 22 }))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {calView === "semana" && (() => {
            const { segs, lanes } = layoutEvents(weekDays.map((d) => d.iso));
            const bandH = lanes ? lanes * 26 + 6 : 0;
            return (
            <div className={`cal-week ${eventDraft ? "cal-week--selecting" : ""}`} style={{ "--evband": `${bandH}px` }}>
              {weekDays.map((d, i) => {
                const dayTasks = tasksByDate[d.iso] || [];
                const isToday = d.iso === today;
                const holidayName = isHoliday(d.iso, holidayCountry);
                return (
                  <div
                    key={d.iso}
                    className={`cal-week-col ${isWeekendIdx(i) ? "cal-cell--weekend" : ""} ${isToday ? "cal-cell--today" : ""} ${d.iso === selectedDay ? "cal-cell--selected" : ""} ${calDropTarget === d.iso ? "cal-cell--drop" : ""} ${d.iso < today ? "cal-cell--past" : ""} ${inDraft(d.iso) ? "cal-cell--range" : ""}`}
                    {...dayCellHandlers(d.iso)}
                  >
                    <div className="cal-week-head">
                      <span className="cal-week-wd">{labels[i]}</span>
                      <span className="cal-week-num">{d.day}</span>
                      {holidayName && <span className="cal-week-holiday" title={holidayName}>{holidayName}</span>}
                    </div>
                    <div className="cal-week-evspace" />
                    <div className="cal-week-tasks">
                      {dayTasks.map((t) => renderCalChip(t, { wrap: true }))}
                      {renderCalInlineAdd(d.iso)}
                      {calAddDay !== d.iso && (
                        <button className="cal-week-add" onClick={(e) => { e.stopPropagation(); focusDay(d.iso); setCalAddDay(d.iso); setCalAddText(""); }}>
                          <Plus size={13} />{" "}{tr("Agregar")}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              <div className="cal-ev-layer cal-ev-layer--week">
                {segs.map((sg) => renderEventBar(sg, { rowHeight: 26 }))}
              </div>
            </div>
            );
          })()}

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
                      {CUR_LANG === "en"
                        ? `${ML()[Number(selectedDay.slice(5, 7)) - 1]} ${Number(selectedDay.slice(8))}, ${selectedDay.slice(0, 4)}`
                        : `${Number(selectedDay.slice(8))} de ${ML()[Number(selectedDay.slice(5, 7)) - 1].toLowerCase()} de ${selectedDay.slice(0, 4)}`}
                      {holidayName && <span className="cal-day-hero-holiday">{holidayName}</span>}
                    </div>
                  </div>
                  <span style={{ flex: 1 }} />
                  <span className="cal-day-hero-count">{pending.length === 1 ? tr("1 pendiente") : tr("{n} pendientes", { n: pending.length })}</span>
                </div>
                {eventsOn(selectedDay).length > 0 && (
                  <div className="cal-day-events">
                    {eventsOn(selectedDay).map((ev) => {
                      const total = isoDiff(ev.start, ev.end || ev.start) + 1;
                      const nth = isoDiff(ev.start, selectedDay) + 1;
                      return (
                        <button
                          key={ev.id}
                          className="ev-row"
                          style={{ "--ev": ev.color || EVENT_COLORS[0] }}
                          onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); openEventEditor({ ...ev, end: ev.end || ev.start }, r.left, r.bottom); }}
                        >
                          <span className="ev-row-bar" />
                          <span className="ev-row-title">{ev.title}</span>
                          <span className="ev-row-meta">{total > 1 ? `${tr("Día {n} de {total}", { n: nth, total })} · ${eventSpanLabel(ev)}` : tr("Todo el día")}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
                <div className="cal-day-add">
                  <Plus size={16} />
                  <input
                    type="text"
                    placeholder={tr("Agregar tarea para {when}", { when: rel ? rel.toLowerCase() : tr("este día") })}
                    value={dayQuickTitle}
                    onChange={(e) => setDayQuickTitle(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addTaskForFocusedDay()}
                  />
                </div>
                <div className="cal-day-list">
                  {pending.length === 0 && done.length === 0 && (
                    <div className="cal-day-empty">{tr("Nada agendado. Agregá una tarea arriba o arrastrá una desde \"Sin fecha\".")}</div>
                  )}
                  {pending.map((t) => renderAgendaRow(t, { big: true }))}
                  {done.length > 0 && <div className="cal-day-subhead">{tr("Hechas")}</div>}
                  {done.map((t) => renderAgendaRow(t, { big: true }))}
                </div>
                {showOverdue && (
                  <div className="cal-day-overdue">
                    <div className="cal-day-subhead cal-day-subhead--bad">
                      {tr("Atrasadas")}{" "}<span>{overdueBeforeToday.length}</span>
                      <span style={{ flex: 1 }} />
                      <button
                        className="cal-pop-btn"
                        onClick={() => { overdueBeforeToday.forEach((t) => setDate(t.id, today)); showToast(tr("{n} pasadas a hoy", { n: overdueBeforeToday.length })); }}
                      >
                        <ArrowRight size={13} />{" "}{tr("Pasar todas a hoy")}
                      </button>
                    </div>
                    {overdueBeforeToday.map((t) => renderAgendaRow(t, { big: true, showDate: true }))}
                  </div>
                )}
              </div>
            );
          })()}

          <div className="cal-footer-hint">
            {tr("Arrastrá sobre varios días para crear un evento · doble clic para una tarea · arrastrá tareas y eventos para moverlos · T para hoy")}
          </div>
        </div>
        {renderCalSidePanel()}
        {renderCalPopover()}
        {renderEventEditor()}
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
              <th>{tr("Tarea")}</th>
              {showArea && <th>{tr("Área")}</th>}
              <th className="col-center">{tr("Detalle")}</th>
              <th className="col-center">{tr("Estado")}</th>
              <th className="col-center">{tr("Prioridad")}</th>
              <th className="col-center">{tr("Fecha")}</th>
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
                onDragStart={(e) => { setDraggedTaskId(t.id); e.dataTransfer.setData("text/plain", t.id); e.dataTransfer.effectAllowed = "move"; }}
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
                    <button className="note-btn" onClick={() => setEditingNoteId(t.id)}>{tr("+ nota")}</button>
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
        <div className="boot-msg mono">{tr("Cargando...")}</div>
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
            placeholder={tr("Email")}
            value={authEmail}
            onChange={(e) => setAuthEmail(e.target.value)}
            autoFocus
          />
          <input
            type="password"
            className="auth-input"
            placeholder={tr("Contraseña")}
            value={authPassword}
            onChange={(e) => setAuthPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (authView === "login" ? handleEmailSignIn() : handleEmailSignUp())}
          />

          {authError && <div className="auth-error">{authError}</div>}
          {authNotice && <div className="auth-notice">{authNotice}</div>}

          <button className="auth-btn" disabled={authBusy} onClick={authView === "login" ? handleEmailSignIn : handleEmailSignUp}>
            {authBusy ? tr("Un momento...") : authView === "login" ? tr("Ingresar") : tr("Crear cuenta")}
          </button>

          <button
            className="auth-switch"
            onClick={() => { setAuthView(authView === "login" ? "signup" : "login"); setAuthError(""); setAuthNotice(""); }}
          >
            {authView === "login" ? tr("¿No tenés cuenta? Creá una") : tr("¿Ya tenés cuenta? Ingresá")}
          </button>

          <div className="auth-divider"><span>{tr("o")}</span></div>

          <button className="auth-guest-btn" disabled={authBusy} onClick={handleGuestLogin}>
            {tr("Probar sin cuenta")}
          </button>
          <p className="auth-guest-hint">{tr("Entrás directo, sin registrarte. Tus datos quedan atados a este navegador.")}</p>
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
            {tr("Tus datos están cifrados. Ingresá tu contraseña de cifrado para desbloquearlos.")}
          </div>
          <input
            type="password"
            className="auth-input"
            placeholder={tr("Contraseña de cifrado")}
            value={encPass}
            onChange={(e) => setEncPass(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleEncUnlock()}
            autoFocus
          />
          {encError && <div className="auth-error">{encError}</div>}
          <button className="auth-btn" disabled={encBusy} onClick={handleEncUnlock}>
            {encBusy ? tr("Desbloqueando...") : tr("Desbloquear")}
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
          border: 1px solid var(--border);
          border-radius: 12px;
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
        /* marca y menú: mismas medidas que Gastos App v152 */
        .brand { display: flex; align-items: center; gap: 8px; padding: 4px 8px 18px; font-weight: 600; font-size: 17px; letter-spacing: -0.01em; line-height: 22px; }
        .brand-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--amber); box-shadow: 0 0 0 3px rgba(242,171,67,0.15); flex-shrink: 0; }
        .side-label { font-size: 11px; color: #4f5661; font-weight: 600; letter-spacing: 0.06em; padding: 0 10px; margin: 10px 0 6px; line-height: 14px; }
        .side-label-row { display: flex; align-items: center; justify-content: space-between; margin: 10px 0 6px; padding: 0 2px 0 10px; }
        .side-divider { height: 1px; background: var(--border); margin: 10px; flex-shrink: 0; }
        .side-label-row .side-label { margin: 0; padding: 0; }
        .side-label-action { background: none; border: none; color: var(--text-faint); cursor: pointer; padding: 3px; border-radius: 5px; display: flex; }
        .side-label-action:hover { color: var(--text-dim); background: var(--surface-2); }
        .fav-star-btn { background: none; border: none; padding: 2px; color: var(--text-faint); display: flex; flex-shrink: 0; }
        .fav-star-btn--active { color: var(--amber); }
        .side-item {
          position: relative; display: flex; align-items: center; justify-content: space-between;
          height: 34px; flex-shrink: 0; padding: 0 10px; border-radius: 8px; font-size: 14px; color: var(--text-dim);
          cursor: pointer; margin-bottom: 2px; transition: background .12s, color .12s;
          user-select: none;
        }
        .side-item-left > svg { opacity: 0.7; flex-shrink: 0; transition: color .12s, opacity .12s; }
        .side-item--active::before { content: ""; position: absolute; left: -12px; top: 8px; bottom: 8px; width: 3px; border-radius: 0 3px 3px 0; background: var(--amber); box-shadow: 0 0 10px rgba(242,171,67,0.6); }
        .side-item:hover { background: rgba(255,255,255,0.04); color: var(--text); }
        .side-item--active { background: var(--surface-2); color: var(--text); font-weight: 550; }
        .side-item--active .side-item-left > svg { color: var(--amber); opacity: 1; }
        .side-item--disabled { cursor: default; opacity: 0.45; }
        .side-item--disabled:hover { background: none; color: var(--text-dim); }
        .side-item-left { display: flex; align-items: center; gap: 10px; min-width: 0; flex: 1; }
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
        .lang-select { width: 66px; flex-shrink: 0; padding: 0 8px; cursor: pointer; font-size: 12.5px; font-weight: 400; }

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
        .notif-row { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; padding: 8px 8px; border-radius: 7px; background: none; border: none; text-align: left; color: inherit; font: inherit; cursor: pointer; width: 100%; }
        .notif-row:hover { background: var(--surface); }
        .notif-row-title { font-size: 13.5px; color: var(--text); display: flex; align-items: center; gap: 6px; }
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
          display: flex; align-items: center; gap: 10px; padding: 0 20px; overflow: hidden; position: relative; z-index: 20;
        }
        .urgent-bar--tappable { cursor: pointer; }
        .urgent-bar--tappable:hover { background: color-mix(in srgb, var(--side) 85%, var(--amber) 4%); }
        .urgent-label { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 800; letter-spacing: 0.06em; color: var(--alta); flex-shrink: 0; }
        .urgent-label--off { color: var(--text-faint); }
        .urgent-label--info { color: var(--blue); }
        .urgent-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--alta); box-shadow: 0 0 8px -1px var(--alta); animation: tt-alert-pulse 2s ease-in-out infinite; }
        .urgent-dot--off { background: var(--text-faint); animation: none; box-shadow: none; }
        .urgent-label--info .urgent-dot--off { background: var(--blue); box-shadow: 0 0 8px -1px var(--blue); }
        @keyframes tt-alert-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }
        .urgent-item { display: flex; align-items: center; gap: 10px; min-width: 0; flex: 1; animation: tt-alert-in .35s ease-out; }
        @keyframes tt-alert-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        .urgent-empty { font-size: 13px; color: var(--text-faint); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .urgent-chip { font-size: 11.5px; font-weight: 650; padding: 3px 9px; border-radius: 999px; flex-shrink: 0; white-space: nowrap; }
        .urgent-chip--vencida { background: rgba(242,95,85,0.16); color: var(--alta); }
        .urgent-chip--hoy { background: rgba(242,171,67,0.16); color: var(--amber); }
        .urgent-chip--manana, .urgent-chip--pronto { background: rgba(91,151,255,0.16); color: var(--blue); }
        .urgent-chip--evento, .urgent-chip--eventoPronto { background: rgba(167,139,250,0.16); color: #b9a4fb; }
        .urgent-swatch { display: inline-block; width: 8px; height: 8px; border-radius: 3px; flex-shrink: 0; }
        .urgent-title { font-size: 13.5px; font-weight: 600; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex-shrink: 1; min-width: 0; }
        .urgent-meta { font-size: 12.5px; color: var(--text-faint); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; flex-shrink: 2; }
        .urgent-nav { display: flex; align-items: center; gap: 2px; flex-shrink: 0; margin-left: auto; }
        .urgent-nav button { border: 0; background: transparent; color: var(--text-faint); width: 24px; height: 24px; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; }
        .urgent-nav button:hover { color: var(--text); background: var(--surface-2); }
        .urgent-count { font-size: 11.5px; color: var(--text-faint); min-width: 30px; text-align: center; font-variant-numeric: tabular-nums; }
        @media (prefers-reduced-motion: reduce) { .urgent-item, .urgent-dot { animation: none; } }

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
        .cal-month-body { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; }
        .cal-month-body--selecting, .cal-week--selecting { cursor: copy; -webkit-user-select: none; user-select: none; }
        .cal-mweek {
          position: relative; flex: 1 0 auto; min-height: calc(96px + var(--lanes, 0) * 22px);
          display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); border-bottom: 1px solid var(--border);
        }
        .cal-mweek:last-child { border-bottom: none; }
        .cal-cell {
          position: relative; min-width: 0; min-height: 0; overflow: hidden; padding: 6px 6px 6px;
          display: flex; flex-direction: column; gap: 5px; border-right: 1px solid var(--border);
          transition: background .12s, box-shadow .12s;
        }
        .cal-mweek > .cal-cell:nth-child(7) { border-right: none; }
        .cal-mweek .cal-cell-head { margin-bottom: calc(var(--lanes, 0) * 22px + 1px); }
        .cal-cell--range, .cal-week-col.cal-cell--range { background: color-mix(in srgb, #A78BFA 14%, transparent); box-shadow: inset 0 0 0 1px rgba(167,139,250,0.35); }
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
        .cal-week { position: relative; }
        .cal-week-head { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; padding: 12px 12px 0; height: 88px; flex-shrink: 0; border-bottom: 1px solid var(--border); overflow: hidden; }
        .cal-week-evspace { height: var(--evband, 0px); flex-shrink: 0; }
        .cal-week-wd { font-size: 12px; font-weight: 600; color: var(--text-dim); }
        .cal-week-num {
          height: 38px; min-width: 38px; margin-left: -6px; padding: 0 6px; border-radius: 999px;
          display: inline-flex; align-items: center; justify-content: center;
          font-size: 24px; font-weight: 600; letter-spacing: -0.03em; font-variant-numeric: tabular-nums;
        }
        .cal-cell--past .cal-week-num { color: var(--text-faint); }
        .cal-cell--today .cal-week-num { background: var(--amber); color: #1b1304; }
        .cal-week-holiday { font-size: 11px; color: var(--alta); max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
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

        /* events (multi-día) */
        .cal-new-event {
          display: flex; align-items: center; gap: 5px; height: 32px; padding: 0 12px; border-radius: 10px; cursor: pointer;
          background: rgba(167,139,250,0.12); border: 1px solid rgba(167,139,250,0.35); color: #c9b8ff; font: inherit; font-size: 12.5px; font-weight: 600;
        }
        .cal-new-event:hover { background: rgba(167,139,250,0.2); color: #e2d8ff; }
        .cal-ev-layer { position: absolute; left: 0; right: 0; top: 36px; height: 0; pointer-events: none; z-index: 3; }
        .cal-ev-layer--week { top: 92px; }
        .cal-ev {
          position: absolute; height: 20px; display: flex; align-items: center; pointer-events: auto; cursor: pointer;
          background: color-mix(in srgb, var(--ev) 30%, var(--surface)); border-radius: 6px;
          box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ev) 45%, transparent);
          color: #f4f1ff; font-size: 11.5px; font-weight: 600; transition: filter .12s, opacity .12s;
        }
        .cal-ev-layer--week .cal-ev { height: 22px; font-size: 12px; }
        .cal-ev::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; border-radius: 6px 0 0 6px; background: var(--ev); }
        .cal-ev--cont-left { border-top-left-radius: 0; border-bottom-left-radius: 0; }
        .cal-ev--cont-left::before { display: none; }
        .cal-ev--cont-right { border-top-right-radius: 0; border-bottom-right-radius: 0; }
        .cal-ev:hover { filter: brightness(1.15); }
        .cal-ev--dragging { opacity: 0.4; }
        .cal-ev--open { box-shadow: inset 0 0 0 1.5px var(--ev), 0 0 0 1px var(--ev); }
        .cal-ev-title { flex: 1; min-width: 0; padding: 0 8px 0 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .cal-ev-handle { position: absolute; top: 0; bottom: 0; width: 8px; cursor: ew-resize; z-index: 1; }
        .cal-ev-handle--start { left: -2px; }
        .cal-ev-handle--end { right: -2px; }
        .cal-ev-handle::after { content: ""; position: absolute; top: 5px; bottom: 5px; left: 3px; width: 2px; border-radius: 2px; background: rgba(255,255,255,0.55); opacity: 0; transition: opacity .12s; }
        .cal-ev:hover .cal-ev-handle::after { opacity: 1; }
        .cal-pop-title--input { margin-bottom: 2px; }
        .ev-swatches { display: flex; gap: 6px; flex-wrap: wrap; }
        .ev-swatch { width: 18px; height: 18px; border-radius: 6px; border: none; cursor: pointer; padding: 0; opacity: 0.8; }
        .ev-swatch:hover { opacity: 1; }
        .ev-swatch--on { opacity: 1; box-shadow: 0 0 0 2px var(--surface-2), 0 0 0 3.5px currentColor; color: #fff; }
        .ev-note {
          width: 100%; margin-top: 10px; resize: vertical; min-height: 40px; background: var(--bg); border: 1px solid var(--border);
          border-radius: 8px; color: var(--text); font: inherit; font-size: 13px; padding: 7px 9px; outline: none;
        }
        .ev-note:focus { border-color: var(--amber-line); }
        .cal-pop .cal-pop-btn--primary { background: var(--amber); color: #1b1304; font-weight: 650; }
        .cal-pop .cal-pop-btn--primary:hover { background: var(--amber); color: #1b1304; filter: brightness(1.08); }
        .ev-row {
          display: flex; align-items: center; gap: 10px; width: 100%; text-align: left; cursor: pointer; font: inherit; color: var(--text);
          padding: 10px 12px 10px 0; border: none; border-radius: 10px; overflow: hidden;
          background: color-mix(in srgb, var(--ev) 13%, var(--surface-2));
        }
        .ev-row:hover { background: color-mix(in srgb, var(--ev) 20%, var(--surface-2)); }
        .ev-row-bar { width: 4px; align-self: stretch; background: var(--ev); flex-shrink: 0; }
        .ev-row-title { font-size: 14px; font-weight: 600; flex-shrink: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .ev-row-meta { font-size: 12px; color: var(--text-dim); margin-left: auto; white-space: nowrap; flex-shrink: 0; }
        .ev-row--small { padding: 7px 10px 7px 0; gap: 8px; border-radius: 8px; }
        .ev-row--small .ev-row-title { font-size: 12.5px; }
        .ev-row--small .ev-row-meta { font-size: 11px; }
        .cal-day-events { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
        .cal-side-events { display: flex; flex-direction: column; gap: 5px; margin-bottom: 10px; }
        .mini-ev { position: absolute; left: 9px; right: 9px; bottom: 1px; height: 2px; border-radius: 2px; opacity: 0.65; }

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

        /* ---- notas ---- */
        .side-item--droppable { outline: 1.5px dashed var(--amber-line); outline-offset: -2px; color: var(--text); }
        .side-item--dropping { background: var(--amber-soft); outline: 1.5px solid var(--amber); }
        .side-drop-hint { font-size: 11.5px; font-weight: 600; color: var(--amber); }
        .notes-wrap, .events-wrap { flex: 1; overflow-y: auto; width: calc(100% - 40px); max-width: 1320px; margin: 0 auto; padding: 18px 0 30px; border-radius: var(--radius-lg); transition: box-shadow .12s, background .12s; }
        .notes-wrap--drop { box-shadow: inset 0 0 0 2px var(--amber); background: rgba(242,171,67,0.04); }
        .notes-new {
          display: flex; align-items: center; gap: 10px; padding: 0 14px; height: 42px; margin-bottom: 16px;
          background: var(--surface); border: 1px solid var(--border); border-radius: 10px; color: var(--text-faint);
        }
        .notes-new:focus-within { border-color: var(--amber-line); }
        .notes-new input { flex: 1; min-width: 0; background: none; border: none; outline: none; color: var(--text); font: inherit; font-size: 14px; }
        .notes-new input::placeholder { color: var(--text-faint); }
        .notes-new-hint { font-size: 12px; color: var(--text-faint); white-space: nowrap; }
        .notes-empty { padding: 50px 20px; text-align: center; color: var(--text-faint); font-size: 14px; }
        .notes-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 10px; align-items: start; }
        .note-card {
          display: flex; flex-direction: column; gap: 2px; min-width: 0;
          background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px 6px;
          transition: border-color .12s;
        }
        .note-card:hover, .note-card:focus-within { border-color: var(--border-strong); }
        .note-title { background: none; border: none; outline: none; color: var(--text); font: inherit; font-size: 14px; font-weight: 600; padding: 0; width: 100%; }
        .note-title::placeholder { color: var(--text-faint); }
        .note-body {
          background: none; border: none; outline: none; resize: none; overflow: hidden; color: var(--text-dim);
          font: inherit; font-size: 13px; line-height: 1.45; padding: 0; width: 100%; min-height: 19px; max-height: 8.7em;
        }
        .note-body:focus { color: var(--text); max-height: none; }
        .note-body::placeholder { color: var(--text-faint); opacity: 0.6; }
        .note-foot { display: flex; align-items: center; gap: 6px; min-width: 0; min-height: 26px; }
        .note-date { flex: 1; min-width: 0; font-size: 11.5px; color: var(--text-faint); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .note-actions { display: flex; align-items: center; gap: 2px; opacity: 0; transition: opacity .12s; flex-shrink: 0; }
        .note-card:hover .note-actions, .note-card:focus-within .note-actions { opacity: 1; }
        @media (hover: none) { .note-actions { opacity: 1; } }
        .note-act {
          display: inline-flex; align-items: center; gap: 5px; border: none; background: none; color: var(--text-faint);
          font: inherit; font-size: 12px; padding: 4px 6px; border-radius: 6px; cursor: pointer; flex-shrink: 0;
        }
        .note-act:hover { background: var(--surface-2); color: var(--text); }
        .note-act--danger:hover { color: var(--alta); background: rgba(242,95,85,0.12); }
        .note-pick { padding: 8px; }
        .note-pick-title { font-size: 11.5px; font-weight: 600; color: var(--text-faint); padding: 4px 8px 6px; }
        .note-pick-list { max-height: 260px; overflow-y: auto; }
        .note-pick-item {
          display: flex; align-items: center; gap: 8px; width: 100%; text-align: left; border: none; background: none; cursor: pointer;
          color: var(--text); font: inherit; font-size: 13px; padding: 7px 8px; border-radius: 7px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .note-pick-item:hover { background: var(--surface-3); }
        .note-pick-item--origin { color: var(--amber); margin-bottom: 4px; border-bottom: 1px solid var(--border); border-radius: 7px 7px 0 0; padding-bottom: 9px; }
        .note-pick-item--project { padding-left: 24px; color: var(--text-dim); font-size: 12.5px; }
        .note-pick-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }

        /* ---- eventos (vista) ---- */
        .events-head { display: flex; align-items: center; gap: 16px; margin-bottom: 18px; }
        .events-head-text { flex: 1; font-size: 13px; color: var(--text-faint); }
        .events-section { margin-bottom: 22px; }
        .events-section-title { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 650; color: var(--text-dim); margin: 0 4px 8px; }
        .events-section-title span { font-size: 11.5px; color: var(--text-faint); background: var(--surface-2); padding: 1px 8px; border-radius: 999px; }
        .event-card {
          display: flex; align-items: center; gap: 8px; padding-right: 10px; margin-bottom: 8px; overflow: hidden;
          background: var(--surface);
          border: 1px solid var(--border); border-radius: var(--radius-lg);
        }
        .event-card--past { opacity: 0.6; }
        .event-card-main { flex: 1; min-width: 0; display: flex; align-items: center; gap: 14px; background: none; border: none; color: inherit; font: inherit; text-align: left; cursor: pointer; padding: 0; }
        .event-card-bar { width: 3px; align-self: stretch; background: var(--ev); flex-shrink: 0; }
        .event-card-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; padding: 13px 0; }
        .event-card-title { font-size: 15px; font-weight: 650; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .event-card-span { font-size: 12.5px; color: var(--text-faint); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .event-card-when { font-size: 12px; font-weight: 600; color: var(--text-dim); background: var(--surface-2); padding: 4px 10px; border-radius: 999px; flex-shrink: 0; }

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
          .tt-root { min-height: 100vh; min-height: 100dvh; height: 100dvh; font-size: 13px; }
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
            height: 46px; min-height: 46px; max-height: 46px; padding: 0 12px env(safe-area-inset-bottom); gap: 8px; box-sizing: content-box;
          }
          .urgent-label { font-size: 0; gap: 0; }
          .urgent-meta, .urgent-nav button { display: none; }
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

          /* ---- notas / eventos (mobile) ---- */
          .m-row-actions { display: flex; gap: 6px; flex-shrink: 0; }
          .m-row-tonote {
            display: flex; align-items: center; gap: 6px; background: var(--amber); color: #1a1200;
            border: none; border-radius: 8px; padding: 9px 12px; font-size: 13.5px; font-weight: 650;
          }
          .m-detail-action {
            width: 100%; margin-top: 12px; display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; text-align: left;
            padding: 14px; background: var(--surface); border: 1px solid var(--border); border-radius: 12px;
            color: var(--amber); font-size: 15px; font-weight: 650;
          }
          .m-detail-action span { flex-basis: 100%; padding-left: 27px; font-size: 12.5px; font-weight: 400; color: var(--text-faint); }
          .m-special-row { display: flex; gap: 10px; margin-bottom: 12px; flex-shrink: 0; }
          .m-special-card {
            flex: 1; min-width: 0; display: flex; align-items: center; gap: 9px; padding: 12px 12px 12px 14px; color: var(--text-dim);
            background: var(--surface); border: 1px solid var(--border); border-radius: 12px;
          }
          .m-special-name { flex: 1; text-align: left; font-size: 15px; font-weight: 700; color: var(--text); }
          .m-notes-card { padding: 0; }
          .m-note-row {
            width: 100%; display: flex; flex-direction: column; gap: 3px; text-align: left; padding: 12px 14px;
            background: none; border: none; border-bottom: 1px solid var(--border); color: var(--text);
          }
          .m-notes-card > .m-note-row:last-child { border-bottom: none; }
          .m-note-title { font-size: 15px; font-weight: 600; }
          .m-note-body { font-size: 13.5px; color: var(--text-dim); line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; white-space: pre-line; }
          .m-note-meta { font-size: 11.5px; color: var(--text-faint); }
          .m-note-convert { display: flex; flex-direction: column; gap: 6px; margin: 2px 0 14px; padding-top: 12px; border-top: 1px solid var(--border); }
          .m-note-convert-label { font-size: 12.5px; color: var(--text-faint); }
          .m-note-convert-row { display: flex; gap: 8px; }
          .m-note-convert-select { flex: 1; max-width: none; min-width: 0; }
          .m-note-convert-row .modal-btn:disabled { opacity: 0.45; }
          .m-event-row {
            width: 100%; display: flex; align-items: center; gap: 12px; padding: 12px 12px 12px 0; text-align: left;
            background: none; border: none; border-bottom: 1px solid var(--border); color: var(--text);
          }
          .m-card > .m-event-row:last-child { border-bottom: none; }
          .m-event-bar { width: 4px; align-self: stretch; background: var(--ev); border-radius: 0 3px 3px 0; flex-shrink: 0; }
          .m-event-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
          .m-event-title { font-size: 15.5px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
          .m-event-span { font-size: 12.5px; color: var(--text-faint); }
          .m-event-when { flex-shrink: 0; font-size: 12px; font-weight: 600; color: var(--text-dim); background: var(--surface-2); border: 1px solid var(--border); border-radius: 20px; padding: 3px 9px; }
          .m-sheet .modal-title { display: flex; align-items: baseline; gap: 8px; }
          .m-sheet-sub { font-size: 13px; font-weight: 500; color: var(--text-faint); }
          .m-sheet-input { font-size: 15px; padding: 11px 12px; font-family: inherit; }
          .m-sheet-dates { display: flex; gap: 10px; }
          .m-sheet-dates label { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; font-size: 12.5px; color: var(--text-faint); }
          .m-sheet-dates input { margin-bottom: 8px; color-scheme: dark; }
          .m-sheet-swatches { margin: 4px 0 12px; gap: 10px; }
          .m-sheet-swatches .ev-swatch { width: 28px; height: 28px; border-radius: 8px; }
          .m-sheet-note-title { width: 100%; background: none; border: none; outline: none; color: var(--text); font: inherit; font-size: 19px; font-weight: 700; padding: 2px 2px 10px; }
          .m-sheet-note-body { resize: vertical; min-height: 130px; line-height: 1.5; }
          .m-sheet-danger { color: var(--alta) !important; }

          .toast { bottom: calc(120px + env(safe-area-inset-bottom)); }
        }
      `}</style>

      {isMobile ? (
        <>
        {mobileScreen === "task" ? renderMobileTaskScreen()
        : mobileScreen === "quickadd" ? renderMobileQuickAddScreen()
        : mobileScreen === "area" ? renderMobileAreaScreen()
        : mobileScreen === "notes" ? renderMobileNotesScreen()
        : mobileScreen === "events" ? renderMobileEventsScreen()
        : renderMobileAreasScreen()}
        {renderMobileSheets()}
        </>
      ) : (
      <>
      {/* Sidebar */}
      <div className="tt-body">
      <aside className="sidebar">
        <div className="brand"><span className="brand-dot" />Task App</div>

        <div className="side-label">{tr("VISTAS")}</div>
        <div className={`side-item ${view === "lista" ? "side-item--active" : ""}`} onClick={() => setView("lista")}>
          <span className="side-item-left"><ListIcon size={14} />{" "}{tr("Lista")}</span>
        </div>
        <div className={`side-item ${view === "prioridad" ? "side-item--active" : ""}`} onClick={() => setView("prioridad")}>
          <span className="side-item-left"><Flag size={14} />{" "}{tr("Por prioridad")}</span>
        </div>
        <div className={`side-item ${view === "calendario" ? "side-item--active" : ""}`} onClick={() => setView("calendario")}>
          <span className="side-item-left"><CalendarIcon size={14} />{" "}{tr("Calendario")}</span>
        </div>
        <div className="side-divider" />
        <div className={`side-item ${view === "eventos" ? "side-item--active" : ""}`} onClick={() => setView("eventos")}>
          <span className="side-item-left"><CalendarRange size={14} />{" "}{tr("Eventos")}</span>
          {eventGroups().now.length + eventGroups().next.length > 0 && <span className="side-count mono">{eventGroups().now.length + eventGroups().next.length}</span>}
        </div>
        <div
          className={`side-item side-item--notes ${view === "notas" ? "side-item--active" : ""} ${taskDragActive ? "side-item--droppable" : ""} ${draggingToNotes ? "side-item--dropping" : ""}`}
          onClick={() => setView("notas")}
          title={tr("Arrastrá una tarea acá para guardarla como nota")}
          {...notesDropProps()}
        >
          <span className="side-item-left"><StickyNote size={14} />{" "}{tr("Notas")}</span>
          {taskDragActive ? <span className="side-drop-hint">{tr("Soltá acá")}</span> : notes.length > 0 && <span className="side-count mono">{notes.length}</span>}
        </div>

        <div className="side-divider" />
        <div className="side-label-row">
          <span className="side-label">{tr("ÁREAS")}</span>
        </div>
        <div className={`side-item ${selectedAreaId === "all" ? "side-item--active" : ""}`} onClick={() => selectArea("all")}>
          <span className="side-item-left">
            <span className="side-dot" style={{ background: "var(--text-faint)" }} />
            <span className="side-item-name">{tr("Todas")}</span>
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
                      title={tr("Cambiar color")}
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
                    title={a.favorite ? tr("Quitar de favoritos") : tr("Marcar como favorita")}
                  >
                    <Star size={13} fill={a.favorite ? "currentColor" : "none"} />
                  </button>
                  <span className="side-item-name">{a.name}</span>
                </span>
                <span className="side-item-right">
                  <span className="side-count mono">{areaCounts[a.id] || 0}</span>
                  {!isGeneralArea(a) && (
                    <>
                      <button className="area-edit-btn" title={tr("Renombrar área")} onClick={(e) => { e.stopPropagation(); startRename(a); }}>
                        <Pencil size={12} />
                      </button>
                      <button className="area-edit-btn area-edit-btn--danger" title={tr("Eliminar área")} onClick={(e) => { e.stopPropagation(); setDeleteTarget({ type: "area", id: a.id }); }}>
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
            placeholder={tr("Nombre del área...")}
            value={newAreaName}
            onChange={(e) => setNewAreaName(e.target.value)}
            onBlur={discardNewArea}
            onKeyDown={(e) => { if (e.key === "Enter") createArea(); if (e.key === "Escape") { setNewAreaName(""); setAddingArea(false); } }}
          />
        ) : (
          <button className="add-area-btn" onClick={() => setAddingArea(true)}><Plus size={13} />{" "}{tr("Nueva área")}</button>
        )}

        <div className="sidebar-spacer" />

        <div className="account-row">
          <div className="account-info">
            <div className="account-name">{session?.user?.is_anonymous ? tr("Invitado") : (maskEmail(session?.user?.email))}</div>
            <div className="account-sub">{session?.user?.is_anonymous ? tr("Sesión de prueba") : tr("Con cuenta")}</div>
          </div>
          <button className="account-logout" onClick={handleLogout} title={tr("Cerrar sesión")}>{tr("Salir")}</button>
        </div>

        <div className="notif-toggle-row">
          <div>
            <div className="notif-toggle-title">{tr("Notificaciones")}</div>
            <div className="notif-toggle-sub">{notificationsEnabled ? tr("Activas · cada hora") : tr("Apagadas")}</div>
          </div>
          <button
            className={`switch ${notificationsEnabled ? "switch--on" : ""}`}
            onClick={() => setNotificationsEnabled((v) => !v)}
            title={tr("Activar/desactivar notificaciones")}
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
              ? tr("Calendario")
              : view === "notas"
              ? tr("Notas")
              : view === "eventos"
              ? tr("Eventos")
              : view === "prioridad"
                ? tr("Por prioridad")
                : selectedAreaId === "all"
                  ? tr("Todas las tareas")
                  : (selectedProjectId ? areaMap[selectedAreaId]?.projects?.find((p) => p.id === selectedProjectId)?.name : areaMap[selectedAreaId]?.name)}
          </h1>
          <button
            className={`counter counter--clickable ${desktopExpandedFilter === "pendientes" ? "counter--active" : ""}`}
            onClick={() => toggleDesktopExpandedFilter("pendientes")}
          >
            <span>{tr("Pendientes")}</span><b>{pendientes}</b>
          </button>
          <button
            className={`counter counter--clickable ${vencidas > 0 ? "counter--warn" : ""} ${desktopExpandedFilter === "vencidas" ? "counter--active" : ""}`}
            onClick={() => toggleDesktopExpandedFilter("vencidas")}
          >
            <span>{tr("Vencidas")}</span><b>{vencidas}</b>
          </button>
          <div className="search-wrap">
            <Search size={13} color="var(--text-faint)" />
            <input placeholder={tr("Buscar...")} value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <button
            className={`iconbtn fav-filter-btn ${areaFilterMode !== "off" ? "fav-filter-btn--active" : ""}`}
            onClick={() => setAreaFilterMode((m) => (m === "off" ? "solo" : m === "solo" ? "mute" : "off"))}
            title={areaFilterMode === "solo" ? tr("Mostrando solo favoritas — clic para ocultarlas") : areaFilterMode === "mute" ? tr("Ocultando favoritas — clic para apagar el filtro") : tr("Filtro de favoritas (apagado)")}
          >
            {areaFilterMode === "mute" ? <EyeOff size={13} /> : <Star size={13} fill={areaFilterMode === "solo" ? "currentColor" : "none"} />}
            {tr("Favoritos")}
          </button>
          <div className="topbar-spacer" />
          <IconBtn icon={hideCompleted ? CheckCircle2 : Circle} label={tr("Ocultar hechas")} onClick={() => setHideCompleted((v) => !v)} active={hideCompleted} />
          <span className="bell-wrap">
            <button
              className="iconbtn icon-only"
              title={tr("Notificaciones")}
              onClick={() => setShowNotifPanel((v) => !v)}
            >
              <Bell size={14} />
              {urgentItems.some((i) => i.urgent) && <span className="bell-dot" />}
            </button>
            {showNotifPanel && (
              <>
                <div className="popover-scrim" onClick={() => setShowNotifPanel(false)} />
                <div className="notif-panel" onClick={(e) => e.stopPropagation()}>
                  <div className="notif-panel-head">
                    <span>{tr("Alertas")}</span>
                    <span className="notif-panel-count mono">{urgentItems.length}</span>
                  </div>
                  <div className="notif-panel-list">
                    {urgentItems.length === 0 && (
                      <div className="notif-panel-empty">{tr("Sin vencimientos ni alertas por ahora.")}</div>
                    )}
                    {urgentItems.map((item) => (
                      <button className="notif-row" key={item.key} onClick={() => goToAlert(item)}>
                        <span className={`urgent-chip urgent-chip--${item.kind}`}>{item.chip}</span>
                        <span className="notif-row-title">
                          {item.color && <span className="urgent-swatch" style={{ background: item.color }} />}
                          {item.title}
                        </span>
                        {item.meta && <span className="notif-row-meta">{item.meta}</span>}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </span>
          <input ref={restoreInputRef} type="file" accept="application/json" style={{ display: "none" }} onChange={restoreData} />
          <button
            className="iconbtn icon-only"
            onClick={() => setShowEncSettings(true)}
            title={isEncrypted ? tr("Datos cifrados — ver cifrado") : tr("Datos sin cifrar — ver cifrado")}
          >
            {isEncrypted ? <Lock size={14} /> : <Unlock size={14} />}
          </button>
          <button className="iconbtn icon-only" onClick={() => setShowSettingsPanel(true)} title={tr("Configuración")}>
            <Settings size={14} />
          </button>
          <span
            className={`iconbtn icon-only sync-indicator ${syncError ? "sync-indicator--error" : ""}`}
            onClick={() => { if (syncError) saveDiff(); }}
            style={syncError ? { cursor: "pointer" } : undefined}
            title={syncError ? tr("No se pudo guardar — tocá para reintentar") : saving ? tr("Guardando...") : lastSyncAt ? `${tr("Sincronizado")} — ${new Date(lastSyncAt).toLocaleTimeString(appLang === "en" ? "en-US" : "es-AR")}` : tr("Conectado a Supabase")}
          >
            {syncError ? <CloudOff size={14} /> : saving ? <RefreshCw size={14} className="spin" /> : <Cloud size={14} />}
          </span>
          <select className="iconbtn lang-select" value={appLang} onChange={(e) => setAppLang(e.target.value)} title={tr("Idioma")}>
            <option value="es">ESP</option>
            <option value="en">ENG</option>
          </select>
        </div>

        {view === "lista" ? (
          <>
            <div className="input-card">
              <div className="tabs">
                <button className={`tab-btn ${tab === "texto" ? "tab-btn--active" : ""}`} onClick={() => setTab("texto")}>{tr("Texto libre")}</button>
                <button className={`tab-btn ${tab === "form" ? "tab-btn--active" : ""}`} onClick={() => setTab("form")}>{tr("Formulario")}</button>
              </div>

              {tab === "texto" ? (
                <>
                  <div className="input-body">
                    <textarea
                      rows={1}
                      placeholder={tr("Escribí todo lo que tenés en la cabeza... ej: reunión jueves urgente wanka moria, cortar pasto finde casa")}
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
                      {tr("Procesar")}
                    </button>
                  </div>
                  <div className="hint-text">
                    {tr("Enter procesa · Shift+Enter agrega una línea. Se interpreta en el momento, sin IA: \"hoy\" / \"mañana\" / \"el jueves\" / \"finde\" → fecha. \"urgente\" o \"rápido\" → prioridad alta.")}
                    {selectedAreaId !== "all" && <> {tr("Las tareas se crean en")} <b style={{ color: "var(--text-dim)" }}>{areaMap[selectedAreaId]?.name}</b>{selectedProjectId ? ` / ${areaMap[selectedAreaId]?.projects?.find((p) => p.id === selectedProjectId)?.name}` : ""}.</>}
                  </div>
                </>
              ) : (
                <div className="manual-form">
                  <input
                    type="text"
                    placeholder={tr("Título de la tarea")}
                    value={manualTitle}
                    onChange={(e) => setManualTitle(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addManualTask()}
                  />
                  {selectedAreaId === "all" ? (
                    <select value={manualArea} onChange={(e) => setManualArea(e.target.value)}>
                      <option value="">{tr("General")}</option>
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
                      <option value="">{tr("Sin proyecto")}</option>
                      {areaMap[selectedAreaId].projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  )}
                  <button className="procesar-btn" onClick={addManualTask}><Plus size={14} />{tr("Agregar")}</button>
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
                      <div className="empty-state">{desktopExpandedFilter === "vencidas" ? tr("Sin tareas vencidas.") : tr("Sin tareas pendientes.")}</div>
                    ) : renderTaskTable(isolated, { showArea: true, showHeader: true });
                  })()}
                </>
              ) : (
              <>
              {grouped.length === 0 && (
                <div className="empty-state">{tr("No hay tareas para mostrar. Escribí algo arriba y tocá \"Procesar\".")}</div>
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
                      <div className="group-count mono">{tr("{n} pendientes", { n: allTasks.filter((t) => t.status !== "Hecho").length })}</div>
                      <span className="chev">{isCollapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}</span>
                    </div>
                    {!isCollapsed && (
                      <>
                        <table className="area-columns-header">
                          {colGroupFor(false)}
                          <thead>
                            <tr>
                              <th>{tr("Tarea")}</th>
                              <th className="col-center">{tr("Detalle")}</th>
                              <th className="col-center">{tr("Estado")}</th>
                              <th className="col-center">{tr("Prioridad")}</th>
                              <th className="col-center">{tr("Fecha")}</th>
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
                                <button className="subgroup-action-btn" onClick={(e) => { e.stopPropagation(); startRenameProject(area.id, project); }} title={tr("Renombrar proyecto")}>
                                  <Pencil size={13} />
                                </button>
                                <button className="subgroup-action-btn" onClick={(e) => { e.stopPropagation(); setDeleteTarget({ type: "project", id: project.id, areaId: area.id }); }} title={tr("Eliminar proyecto")}>
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
                                placeholder={tr("Nombre del nuevo proyecto...")}
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
                                <Plus size={13} />{" "}{tr("Nuevo proyecto")}
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
                    placeholder={tr("Nombre del área...")}
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
                    <Plus size={14} />{" "}{tr("Nueva área")}
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
                    <div className="group-name">{tr(priority)}</div>
                    <div className="group-count mono">{tr("{n} pendientes", { n: priTasks.filter((t) => t.status !== "Hecho").length })}</div>
                    <span className="chev">{isCollapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}</span>
                  </div>
                  {!isCollapsed && priTasks.length > 0 && renderTaskTable(priTasks, { showArea: true, showHeader: true })}
                </div>
              );
            })}
          </div>
        ) : view === "notas" ? (
          renderNotesView()
        ) : view === "eventos" ? (
          renderEventsView()
        ) : (
          renderCalendar()
        )}

        {toast && <div className="toast">{toast}</div>}
      </div>
      </div>

      {renderAlertsBar()}
      </>
      )}

      {showEncSettings && (
        <div className="modal-overlay" onClick={closeEncSettings}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={closeEncSettings}><X size={16} /></button>
            <div className="modal-title">{tr("Cifrado de extremo a extremo")}</div>

            {encSettingsView === "status" && (
              <>
                <div className="modal-text">
                  {isEncrypted
                    ? tr("Tus datos están cifrados en tu navegador antes de llegar a Supabase (AES-256-GCM). Ni Supabase ni nadie con acceso a la base puede leerlos.")
                    : tr("Tus datos se guardan en Supabase sin cifrar. Podés activar el cifrado de extremo a extremo cuando quieras.")}
                </div>
                <div className="modal-actions">
                  <button className="modal-btn modal-btn--cancel" onClick={closeEncSettings}>{tr("Cerrar")}</button>
                  {isEncrypted ? (
                    <button className="modal-btn modal-btn--danger" onClick={() => setEncSettingsView("disable-confirm")}>
                      {tr("Desactivar cifrado")}
                    </button>
                  ) : (
                    <button className="modal-btn modal-btn--primary" onClick={() => setEncSettingsView("enable")}>
                      {tr("Activar cifrado")}
                    </button>
                  )}
                </div>
              </>
            )}

            {encSettingsView === "disable-confirm" && (
              <>
                <div className="modal-text">
                  {tr("Ingresá tu contraseña de cifrado actual para confirmar que querés desactivarlo. Una vez desactivado, tus datos quedan en texto plano en Supabase.")}
                </div>
                <input
                  type="password"
                  className="settings-input"
                  placeholder={tr("Contraseña de cifrado actual")}
                  autoFocus
                  value={encPass}
                  onChange={(e) => setEncPass(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleDisableEncryption()}
                />
                {encError && <div className="settings-error">{encError}</div>}
                <div className="modal-actions">
                  <button className="modal-btn modal-btn--cancel" onClick={() => { setEncSettingsView("status"); setEncPass(""); setEncError(""); }}>
                    {tr("Cancelar")}
                  </button>
                  <button className="modal-btn modal-btn--danger" disabled={encBusy} onClick={handleDisableEncryption}>
                    {encBusy ? tr("Verificando...") : tr("Confirmar y desactivar")}
                  </button>
                </div>
              </>
            )}

            {encSettingsView === "enable" && (
              <>
                <div className="modal-text">
                  {tr("Creá una contraseña de cifrado. Es distinta de tu contraseña de acceso y nunca sale de este navegador. Si la olvidás, no hay forma de recuperar los datos.")}
                </div>
                <input
                  type="password"
                  className="settings-input"
                  placeholder={tr("Contraseña de cifrado")}
                  autoFocus
                  value={encPass}
                  onChange={(e) => setEncPass(e.target.value)}
                />
                <input
                  type="password"
                  className="settings-input"
                  placeholder={tr("Repetí la contraseña")}
                  value={encPass2}
                  onChange={(e) => setEncPass2(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleEncSetup()}
                />
                {encError && <div className="settings-error">{encError}</div>}
                <div className="modal-actions">
                  <button className="modal-btn modal-btn--cancel" onClick={() => { setEncSettingsView("status"); setEncPass(""); setEncPass2(""); setEncError(""); }}>
                    {tr("Cancelar")}
                  </button>
                  <button className="modal-btn modal-btn--primary" disabled={encBusy} onClick={handleEncSetup}>
                    {encBusy ? tr("Activando...") : tr("Activar cifrado")}
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
            <div className="modal-title">{tr("Configuración")}</div>

            {!confirmingWipe ? (
              <>
                <div className="settings-group-title">{tr("General")}</div>
                <div className="settings-row">
                  <div>
                    <div className="settings-row-title">{tr("Idioma")}</div>
                    <div className="settings-row-desc">{tr("Idioma de la app.")}</div>
                  </div>
                  <select className="settings-select" value={appLang} onChange={(e) => setAppLang(e.target.value)}>
                    <option value="es">ESP</option>
                    <option value="en">ENG</option>
                  </select>
                </div>

                <div className="settings-group-title">{tr("Seguridad")}</div>
                <div className="settings-row">
                  <div>
                    <div className="settings-row-title">{tr("Cifrado")}</div>
                    <div className="settings-row-desc">{isEncrypted ? tr("Tus datos están cifrados.") : tr("Tus datos no están cifrados.")}</div>
                  </div>
                  <button className="modal-btn modal-btn--cancel" onClick={() => { setShowSettingsPanel(false); setShowEncSettings(true); }}>
                    {isEncrypted ? <Lock size={14} /> : <Unlock size={14} />} {tr("Ver cifrado")}
                  </button>
                </div>

                <div className="settings-group-title">{tr("Calendario")}</div>
                <div className="settings-row">
                  <div>
                    <div className="settings-row-title">{tr("Inicio de semana")}</div>
                    <div className="settings-row-desc">{tr("Orden de los días en el calendario.")}</div>
                  </div>
                  <select className="settings-select" value={weekStartsSunday ? "sun" : "mon"} onChange={(e) => setWeekStartsSunday(e.target.value === "sun")}>
                    <option value="mon">{tr("Lunes (sáb/dom al final)")}</option>
                    <option value="sun">{tr("Domingo")}</option>
                  </select>
                </div>
                <div className="settings-row">
                  <div>
                    <div className="settings-row-title">{tr("Feriados en el calendario")}</div>
                    <div className="settings-row-desc">{tr("Marca los feriados nacionales. En Argentina incluye también los móviles (Carnaval, Semana Santa, trasladables).")}</div>
                  </div>
                  <select className="settings-select" value={holidayCountry} onChange={(e) => setHolidayCountry(e.target.value)}>
                    <option value="none">{tr("Ninguno")}</option>
                    <option value="AR">{tr("Argentina")}</option>
                    <option value="ES">{tr("España")}</option>
                    <option value="MX">{tr("México")}</option>
                    <option value="US">{tr("Estados Unidos")}</option>
                    <option value="BR">{tr("Brasil")}</option>
                    <option value="CL">{tr("Chile")}</option>
                  </select>
                </div>

                <div className="settings-group-title">{tr("Datos")}</div>
                <div className="settings-row">
                  <div>
                    <div className="settings-row-title">{tr("Exportar / Restaurar")}</div>
                    <div className="settings-row-desc">{tr("Backup manual, aparte de la nube.")}</div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                    <button className="modal-btn modal-btn--cancel" onClick={exportData}><Download size={13} />{" "}{tr("Exportar")}</button>
                    <button className="modal-btn modal-btn--cancel" onClick={() => restoreInputRef.current?.click()}><Upload size={13} />{" "}{tr("Restaurar")}</button>
                  </div>
                </div>

                <div className="settings-group-title">{tr("Zona de riesgo")}</div>
                <div className="settings-row">
                  <div>
                    <div className="settings-row-title">{tr("Borrar todos los datos")}</div>
                    <div className="settings-row-desc">{tr("Borra todo. No se puede deshacer.")}</div>
                  </div>
                  <button className="modal-btn modal-btn--danger" onClick={() => setConfirmingWipe(true)}>{tr("Borrar todos los datos")}</button>
                </div>

                <div className="modal-actions">
                  <button className="modal-btn modal-btn--cancel" onClick={() => setShowSettingsPanel(false)}>{tr("Cerrar")}</button>
                </div>
              </>
            ) : (
              <>
                <div className="modal-text">
                  {tr("¿Borrar")}{" "}<b style={{ color: "var(--alta)" }}>{tr("todas")}</b>{" "}{tr("tus áreas, proyectos, tareas, eventos y notas? Esta acción no se puede deshacer.")}
                </div>
                <div className="modal-actions">
                  <button className="modal-btn modal-btn--cancel" onClick={() => setConfirmingWipe(false)}>{tr("Cancelar")}</button>
                  <button className="modal-btn modal-btn--danger" onClick={wipeAllData}>{tr("Sí, borrar todo")}</button>
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
                {isArea ? tr("¿Eliminar el área \"{name}\"?", { name: area?.name }) : isTask ? tr("¿Eliminar \"{name}\"?", { name: task?.title }) : tr("¿Eliminar el proyecto \"{name}\"?", { name: project?.name })}
              </div>
              <div className="modal-text">
                {isArea
                  ? (count > 0 ? (count === 1 ? tr("Esto también va a borrar su tarea. Esta acción no se puede deshacer.") : tr("Esto también va a borrar sus {n} tareas. Esta acción no se puede deshacer.", { n: count })) : tr("Esta acción no se puede deshacer."))
                  : isTask ? tr("Esta acción no se puede deshacer.")
                  : (count > 0 ? tr(count === 1 ? "La tarea de este proyecto va a quedar sin proyecto asignado, dentro de \"{area}\"." : "Las {n} tareas de este proyecto van a quedar sin proyecto asignado, dentro de \"{area}\".", { n: count, area: area?.name }) : tr("Esta acción no se puede deshacer."))}
              </div>
              <div className="modal-actions">
                <button className="modal-btn modal-btn--cancel" onClick={() => setDeleteTarget(null)}>{tr("Cancelar")}</button>
                <button className="modal-btn modal-btn--danger" onClick={confirmDelete}>{isArea ? tr("Eliminar área") : isTask ? tr("Eliminar") : tr("Eliminar proyecto")}</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
