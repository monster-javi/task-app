# ✅ Task App

Organizador de tareas por áreas y proyectos, con calendario, prioridades y sincronización en la nube. Simple, oscuro y rápido.

**👉 Usala acá: [monster-javi.github.io/task-app](https://monster-javi.github.io/task-app/)**

---

## Qué hace

- **Áreas y proyectos**: separá trabajo, casa, estudio… y adentro, cada proyecto con sus tareas.
- **Tres vistas**:
  - **Lista**: todo agrupado por área y proyecto.
  - **Por prioridad**: alta, media y baja.
  - **Calendario**: con los feriados de tu país.
- **Estados**: por hacer, haciendo y hecho. Fechas de vencimiento, avisos de lo vencido y de lo que vence mañana, y favoritas.
- **Carga rápida**: escribí varias tareas de una en texto libre y se reparten solas.
- **Arrastrar y soltar** para reordenar.
- **Notas** por tarea.
- **Notificaciones** de vencimientos.
- **Sincronización en tiempo real** entre pestañas y dispositivos de la misma cuenta.
- Funciona en el celular.

## Privacidad

- Login con email, o **"Probar sin cuenta"** (modo invitado, atado a ese navegador).
- Cada usuario ve solo sus datos: Supabase los protege con Row Level Security.
- **Cifrado de extremo a extremo opcional** (AES-256-GCM, clave derivada con PBKDF2) desde el candado de la barra superior:
  - Supabase solo guarda bytes cifrados.
  - La contraseña de cifrado es distinta de la del login y nunca sale de tu navegador.
  - Si la perdés, no hay forma de recuperar los datos.
- La `anon key` de Supabase que aparece en el código es pública por diseño: lo que protege los datos es RLS.

## Desarrollo

```bash
npm install
npm run dev      # servidor local
npm run build    # compila a dist/
```

Cada push a `main` compila y publica sola en GitHub Pages con el workflow `.github/workflows/deploy.yml` (Settings → Pages → Source: **GitHub Actions**).

### Supabase

- **Modo invitado:** necesita **Anonymous Sign-Ins** activado en *Authentication → Sign In / Providers*.
- **Tabla:** una fila por usuario.

```sql
create table if not exists app_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table app_data enable row level security;

create policy "users manage their own row"
on app_data for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
```

## Cómo está hecha

- **React + Vite**
- **Supabase**: auth, base de datos y realtime
- **Web Crypto API**: cifrado
- **lucide-react**: íconos

Hermana de [Gastos App](https://github.com/monster-javi/gastos-app): comparten el diseño y la idea.

---

Si te sirve y querés bancar el proyecto, ¡invitame un cafecito! ☕

[![Invitame un café en cafecito.app](https://cdn.cafecito.app/imgs/buttons/button_2.svg)](https://cafecito.app/monsterjavi)  [![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/R6R51FQ52H)
