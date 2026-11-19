# Migración y Arquitectura Multitenant de SalesBot CRM

El CRM opera ahora bajo una arquitectura multitenant completa, con aislamiento de datos a nivel de base de datos (PostgreSQL RLS), autenticación estricta en producción, APIs internas aseguradas, selector de organización en tiempo real, gestión de equipo e invitaciones, y credenciales de WhatsApp Cloud API por tenant.

---

## 1. Migraciones de Base de Datos

Ejecutar en orden en el **SQL Editor de Supabase**:

1. `supabase/migrations/20261109_01_multitenancy_foundation.sql`:
   - Crea tablas `tenants`, `organization_members`, `tenant_channels`, `tenant_bot_settings`.
   - Asigna `tenant_id` obligatorio a `contacts`, `conversations`, `messages` y `audit_log`.
   - Activa Row Level Security (RLS) con funciones `is_tenant_member` e `is_tenant_admin`.
   - Crea el tenant inicial `legacy` y reubica datos preexistentes.

2. `supabase/migrations/20261109_02_tenant_credentials_and_team.sql`:
   - Agrega `access_token` y `credentials jsonb` a `tenant_channels` para soportar credenciales de WhatsApp Cloud API por tenant.
   - Crea tabla `tenant_invitations` con políticas RLS.
   - Permite que los miembros del tenant consulten a sus compañeros en `organization_members`.
   - Permite que administradores del tenant gestionen miembros e invitaciones.
   - Backfill automático del canal WhatsApp del tenant `legacy` con credenciales activas.

---

## 2. Lo que está aislado e implementado

### A. Pantallas CRM, mutaciones y Realtime por tenant activo (Paso 1)
- **Dashboard (`/`)**: Carga conversaciones y métricas filtradas por `tenant_id = activeTenant.id`. Canal Realtime con filtro `tenant_id=eq.${activeTenant.id}`.
- **Bandeja de Mensajes (`/chat`)**: Carga lista de chats y mensajes con filtro de tenant. Las mutaciones (`/api/chat/send`, cambio de estado humano/IA y resumen) inyectan `tenant_id`. Realtime suscrito con filtro del tenant.
- **Pipeline Kanban (`/pipeline`)**: Filtrado estricto por tenant. Etapas guardadas en `localStorage` con clave única por tenant (`crm_pipeline_stages_${tenantId}`).
- **Directorio de Contactos (`/contactos`)**: Contactos y conversaciones aislados por tenant con Realtime.
- **Gestión de Equipo (`/equipo`)**: Métricas de leads y carga filtradas por tenant.
- **Sidebar (`components/Sidebar.tsx`)**: Contadores de Handoff Queue y mensajes no leídos con filtros y canal Realtime del tenant.

### B. APIs internas aseguradas con tenant validado (Paso 2)
- `/api/chat/send`:
  - Valida token Bearer contra Supabase Auth mediante `getTenantContext(request)`.
  - Verifica que la conversación pertenezca al `tenant_id` validado.
  - Inserta el mensaje con `tenant_id`.
  - Envía el mensaje con las credenciales WhatsApp del tenant.
- `/api/chat/summary`:
  - Valida `getTenantContext(request)`.
  - Verifica pertenencia de la conversación al tenant.
  - Inserta la tarjeta de resumen ejecutivo con `tenant_id`.
- `/api/audit`:
  - `POST`: Valida contexto y guarda evento con `tenant_id` obligatorio.
  - `GET`: Valida contexto y lista exclusivamente los eventos del tenant activo.
- `/api/bot-settings`:
  - Valida tenant y restringe escritura a administradores/propietarios.

### C. Selector de organización e invitaciones/equipo (Paso 3)
- **Selector de Organización (`Sidebar.tsx`)**:
  - Desplegable interactivo que lista todas las organizaciones del usuario (`tenants`).
  - Cambio inmediato de tenant activo actualizando cookies (`crm_active_tenant_id`) y estado global.
  - Modal rápido para crear una nueva organización (`POST /api/tenants`), asignando al usuario como `owner`.
- **Portal Maestro SaaS de Tenants (`/admin/tenants`)**:
  - Exclusivo para Superadministradores (`role = superadmin`).
  - Directorio global de todas las organizaciones registradas con métricas en vivo (miembros, chats totales, canal Meta conectado).
  - Aprovisionamiento centralizado de nuevas empresas con asignación de dueño y credenciales de WhatsApp.
  - Botón de **"Acceso Soporte / Abrir CRM"**: cambia el contexto al tenant del cliente al instante para diagnosticar configuraciones o asistir en soporte técnico.
  - Activación y suspensión de servicios de clientes con un clic.
- **Gestión de Equipo e Invitaciones (`/equipo`)**:
  - Pestaña "Miembros del Tenant": lista los miembros reales (`/api/team/members`) con sus nombres, correos y roles.
  - Modal "Invitar al Equipo": permite registrar o invitar miembros (`POST /api/team/invite`) con rol (`agent`, `admin`, `owner`).
  - Permite a administradores cambiar roles o revocar accesos en caliente.

### D. Autenticación estricta en producción (Paso 4)
- **Middleware (`middleware.ts`)**: Eliminada la cookie automática de desarrollo `authenticated_superadmin`. Rutas protegidas (`/`, `/chat`, `/pipeline`, `/equipo`, `/contactos`, `/configuracion`, `/admin/*`) exigen sesión activa contra Supabase Auth. Redirección automática a `/login` si no está autenticado.
- **Login (`/login`)**: Autenticación estricta con `supabase.auth.signInWithPassword`. Eliminado el bypass de superadmin sin contraseña.
- **Contexto (`AuthContext.tsx`)**: Inicia en estado no autenticado (`user = null`, `loading = true`). Sincroniza membresías de organizaciones desde Supabase en tiempo real.

### E. Credenciales de WhatsApp a nivel de tenant (Paso 5)
- **`tenant_channels`**: Almacena `external_id` (Meta Phone Number ID) y `access_token` por organización.
- **`lib/whatsapp.ts`**: `getTenantWhatsAppConfig(tenantId)` resuelve las credenciales del tenant, con fallback a variables de entorno si aún no tiene un canal personalizado.
- **Webhook (`/api/whatsapp/webhook`)**: Resuelve el `tenant_id` a partir del Phone Number ID del evento entrante. Las respuestas automáticas y descargas de audio usan las credenciales de ese tenant.
- **Interfaz de Configuración (`/configuracion`)**: Panel dedicado para configurar el Phone Number ID, Access Token y Nombre de Línea para la organización activa (`/api/channels/whatsapp`).
