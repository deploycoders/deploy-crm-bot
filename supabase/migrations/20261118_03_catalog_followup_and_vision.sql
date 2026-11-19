-- ==============================================================================
-- MIGRACIÓN 20261118_03: Catálogo, Plantillas WhatsApp, Seguimiento 24h, Tags y CRM Enriquecido
-- ==============================================================================

-- 1. PIEZA 2: Catálogo de Productos y Servicios por Tenant
CREATE TABLE IF NOT EXISTS public.tenant_catalog (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  sku           text,
  name          text NOT NULL,
  description   text,
  category      text DEFAULT 'General',
  price         numeric(12,2) NOT NULL DEFAULT 0.00,
  compare_price numeric(12,2),
  currency      text NOT NULL DEFAULT 'USD',
  stock_qty     integer NOT NULL DEFAULT 0,
  stock_status  text NOT NULL DEFAULT 'in_stock' CHECK (stock_status IN ('in_stock', 'low_stock', 'out_of_stock')),
  image_url     text,
  specs         jsonb DEFAULT '{}'::jsonb,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_catalog_tenant_sku_key UNIQUE (tenant_id, sku)
);

CREATE INDEX IF NOT EXISTS idx_tenant_catalog_tenant_active ON public.tenant_catalog(tenant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_tenant_catalog_search ON public.tenant_catalog USING gin(to_tsvector('spanish', coalesce(name, '') || ' ' || coalesce(description, '') || ' ' || coalesce(category, '') || ' ' || coalesce(sku, '')));

-- 2. PIEZA 4: Plantillas de WhatsApp Oficiales (Meta Templates)
CREATE TABLE IF NOT EXISTS public.whatsapp_templates (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  template_name    text NOT NULL,
  language         text NOT NULL DEFAULT 'es',
  category         text NOT NULL DEFAULT 'UTILITY' CHECK (category IN ('MARKETING', 'UTILITY', 'AUTHENTICATION')),
  header_text      text,
  body_text        text NOT NULL,
  footer_text      text,
  buttons          jsonb DEFAULT '[]'::jsonb,
  meta_template_id text,
  status           text NOT NULL DEFAULT 'approved' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_templates_tenant_name_lang_key UNIQUE (tenant_id, template_name, language)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_templates_tenant ON public.whatsapp_templates(tenant_id);

-- 3. PIEZA 4: Seguimientos Programados (Ventana 24h & Re-engagement)
CREATE TABLE IF NOT EXISTS public.scheduled_followups (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  contact_id      uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  template_name   text NOT NULL,
  scheduled_at    timestamptz NOT NULL,
  executed_at     timestamptz,
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
  retry_count     integer NOT NULL DEFAULT 0,
  last_error      text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_followups_execution ON public.scheduled_followups(status, scheduled_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_scheduled_followups_conv ON public.scheduled_followups(conversation_id);

-- 4. PIEZA 6: Tags persistentes en base de datos (reemplaza localStorage)
CREATE TABLE IF NOT EXISTS public.contact_tags (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  tag        text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contact_tags_tenant_contact_tag_key UNIQUE (tenant_id, contact_id, tag)
);

CREATE INDEX IF NOT EXISTS idx_contact_tags_contact ON public.contact_tags(contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_tags_tenant ON public.contact_tags(tenant_id);

-- 5. PIEZA 4 & 6: Enriquecer tablas existentes
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS company text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS source text DEFAULT 'whatsapp';
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS custom_fields jsonb DEFAULT '{}'::jsonb;

ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS last_customer_message_at timestamptz;
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS assigned_agent_id uuid;
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS conversation_summary text;
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS pipeline_stage text DEFAULT 'nuevo';

-- Inicializar last_customer_message_at con last_message_at para conversaciones existentes
UPDATE public.conversations 
SET last_customer_message_at = last_message_at 
WHERE last_customer_message_at IS NULL AND last_message_at IS NOT NULL;

-- 6. HABILITAR ROW LEVEL SECURITY (RLS)
ALTER TABLE public.tenant_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_followups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_tags ENABLE ROW LEVEL SECURITY;

-- Políticas RLS: miembros activos del tenant pueden leer/escribir sus propios datos
DROP POLICY IF EXISTS "Miembros ven catalogo de su tenant" ON public.tenant_catalog;
CREATE POLICY "Miembros ven catalogo de su tenant" ON public.tenant_catalog
  FOR ALL USING (
    tenant_id IN (
      SELECT tenant_id FROM public.organization_members
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

DROP POLICY IF EXISTS "Miembros ven templates de su tenant" ON public.whatsapp_templates;
CREATE POLICY "Miembros ven templates de su tenant" ON public.whatsapp_templates
  FOR ALL USING (
    tenant_id IN (
      SELECT tenant_id FROM public.organization_members
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

DROP POLICY IF EXISTS "Miembros ven seguimientos de su tenant" ON public.scheduled_followups;
CREATE POLICY "Miembros ven seguimientos de su tenant" ON public.scheduled_followups
  FOR ALL USING (
    tenant_id IN (
      SELECT tenant_id FROM public.organization_members
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

DROP POLICY IF EXISTS "Miembros ven tags de su tenant" ON public.contact_tags;
CREATE POLICY "Miembros ven tags de su tenant" ON public.contact_tags
  FOR ALL USING (
    tenant_id IN (
      SELECT tenant_id FROM public.organization_members
      WHERE user_id = auth.uid() AND is_active = true
    )
  );
