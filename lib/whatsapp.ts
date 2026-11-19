import { getSupabaseAdmin } from "@/lib/supabase";

export interface TenantWhatsAppConfig {
  channelId?: string;
  phoneNumberId: string;
  accessToken: string;
  displayName?: string;
  isCustom: boolean;
}

/**
 * Resolves the WhatsApp credentials for a given tenant.
 * Looks up `tenant_channels` first; falls back to environment variables.
 */
export async function getTenantWhatsAppConfig(tenantId?: string): Promise<TenantWhatsAppConfig | null> {
  const envPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID || "";
  const envToken = process.env.WHATSAPP_ACCESS_TOKEN || "";

  if (tenantId) {
    try {
      const supabase = getSupabaseAdmin();
      const { data: channel } = await supabase
        .from("tenant_channels")
        .select("id, external_id, access_token, credentials, display_name")
        .eq("tenant_id", tenantId)
        .eq("provider", "whatsapp")
        .eq("is_active", true)
        .maybeSingle();

      if (channel) {
        const token =
          channel.access_token ||
          (channel.credentials as any)?.access_token ||
          envToken;
        const phoneId = channel.external_id || envPhoneId;

        if (phoneId && token) {
          return {
            channelId: channel.id,
            phoneNumberId: phoneId,
            accessToken: token,
            displayName: channel.display_name || "WhatsApp",
            isCustom: !!channel.access_token,
          };
        }
      }
    } catch (err) {
      console.warn(`[whatsapp] Error consultando credenciales de tenant ${tenantId}:`, err);
    }
  }

  // Fallback a variables de entorno globales si no hay canal de tenant configurado
  if (envPhoneId && envToken) {
    return {
      phoneNumberId: envPhoneId,
      accessToken: envToken,
      displayName: "WhatsApp Global (Env)",
      isCustom: false,
    };
  }

  return null;
}

export interface WhatsAppSendOptions {
  tenantId?: string;
  phoneNumberId?: string;
  accessToken?: string;
}

async function resolveCredentials(options?: WhatsAppSendOptions): Promise<{ phoneNumberId: string; accessToken: string } | null> {
  if (options?.phoneNumberId && options?.accessToken) {
    return { phoneNumberId: options.phoneNumberId, accessToken: options.accessToken };
  }

  const tenantConfig = await getTenantWhatsAppConfig(options?.tenantId);
  if (tenantConfig) {
    return {
      phoneNumberId: tenantConfig.phoneNumberId,
      accessToken: tenantConfig.accessToken,
    };
  }

  return null;
}

export async function sendWhatsAppMessage(
  toPhone: string,
  text: string,
  options?: WhatsAppSendOptions
) {
  const creds = await resolveCredentials(options);
  if (!creds) {
    console.error("Credenciales de WhatsApp no configuradas para el tenant o entorno");
    return { success: false, error: "Credenciales de WhatsApp no configuradas" };
  }

  const { phoneNumberId, accessToken } = creds;
  const formattedPhone = toPhone.replace(/\D/g, "").trim();

  try {
    const response = await fetch(`https://graph.facebook.com/v22.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: formattedPhone,
        type: "text",
        text: {
          preview_url: false,
          body: text,
        },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      const isWindowError = data?.error?.code === 131047 || data?.error?.error_subcode === 131047;
      console.error("Error al enviar mensaje por WhatsApp API:", data);
      return {
        success: false,
        error: data,
        isWindowError,
        windowErrorMessage: isWindowError
          ? "Ventana de 24 horas de WhatsApp expirada (Error 131047). Para contactar a este cliente debes usar una plantilla preaprobada por Meta."
          : undefined,
      };
    }

    return {
      success: true,
      messageId: data.messages?.[0]?.id,
      data,
    };
  } catch (error) {
    console.error("Excepción al enviar mensaje a WhatsApp:", error);
    return { success: false, error };
  }
}

/**
 * Envía una imagen a través de WhatsApp Cloud API
 */
export async function sendWhatsAppImage(
  toPhone: string,
  imageUrl: string,
  caption?: string,
  options?: WhatsAppSendOptions
) {
  const creds = await resolveCredentials(options);
  if (!creds) {
    return { success: false, error: "Credenciales de WhatsApp no configuradas" };
  }

  const { phoneNumberId, accessToken } = creds;
  const formattedPhone = toPhone.replace(/\D/g, "").trim();

  try {
    const response = await fetch(`https://graph.facebook.com/v22.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: formattedPhone,
        type: "image",
        image: {
          link: imageUrl,
          caption: caption || undefined,
        },
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error("Error al enviar imagen por WhatsApp:", data);
      return { success: false, error: data };
    }

    return {
      success: true,
      messageId: data.messages?.[0]?.id,
      data,
    };
  } catch (error) {
    console.error("Excepción enviando imagen a WhatsApp:", error);
    return { success: false, error };
  }
}

/**
 * Envía un documento o PDF a través de WhatsApp Cloud API
 */
export async function sendWhatsAppDocument(
  toPhone: string,
  documentUrl: string,
  filename: string,
  caption?: string,
  options?: WhatsAppSendOptions
) {
  const creds = await resolveCredentials(options);
  if (!creds) {
    return { success: false, error: "Credenciales de WhatsApp no configuradas" };
  }

  const { phoneNumberId, accessToken } = creds;
  const formattedPhone = toPhone.replace(/\D/g, "").trim();

  try {
    const response = await fetch(`https://graph.facebook.com/v22.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: formattedPhone,
        type: "document",
        document: {
          link: documentUrl,
          caption: caption || undefined,
          filename: filename || "documento.pdf",
        },
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error("Error al enviar documento por WhatsApp:", data);
      return { success: false, error: data };
    }

    return {
      success: true,
      messageId: data.messages?.[0]?.id,
      data,
    };
  } catch (error) {
    console.error("Excepción enviando documento a WhatsApp:", error);
    return { success: false, error };
  }
}

/**
 * Descarga archivos binarios (notas de voz, audios, imágenes) desde WhatsApp Cloud API
 */
export async function downloadWhatsAppMedia(
  mediaId: string,
  options?: { tenantId?: string; accessToken?: string }
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  let token = options?.accessToken;
  if (!token) {
    const creds = await resolveCredentials({ tenantId: options?.tenantId });
    token = creds?.accessToken;
  }

  if (!token) {
    console.error("Falta token de WhatsApp para descargar media");
    return null;
  }

  try {
    // 1. Obtener la URL de descarga temporal desde Graph API
    const metaRes = await fetch(`https://graph.facebook.com/v22.0/${mediaId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!metaRes.ok) {
      console.error("Error al consultar media ID en WhatsApp:", await metaRes.text());
      return null;
    }

    const metaData = await metaRes.json();
    const downloadUrl = metaData.url;
    const mimeType = metaData.mime_type || "audio/ogg";

    if (!downloadUrl) {
      console.error("WhatsApp no retornó downloadUrl para media ID:", mediaId);
      return null;
    }

    // 2. Descargar el archivo binario usando el token Bearer
    const fileRes = await fetch(downloadUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": "SalesBot-CRM/1.0",
      },
    });

    if (!fileRes.ok) {
      console.error("Error descargando binario de media:", await fileRes.text());
      return null;
    }

    const arrayBuffer = await fileRes.arrayBuffer();
    return {
      buffer: Buffer.from(arrayBuffer),
      mimeType,
    };
  } catch (error) {
    console.error("Excepción descargando media de WhatsApp:", error);
    return null;
  }
}

export interface TemplateComponent {
  type: "header" | "body" | "button";
  sub_type?: string;
  index?: number;
  parameters: Array<{
    type: "text" | "currency" | "date_time" | "image" | "document" | "video";
    text?: string;
    image?: { link: string };
    [key: string]: any;
  }>;
}

/**
 * Envía una plantilla preaprobada de Meta WhatsApp Cloud API.
 * Obligatoria para iniciar conversación o contactar clientes fuera de la ventana de 24 horas.
 */
export async function sendWhatsAppTemplate(
  toPhone: string,
  templateName: string,
  languageCode: string = "es",
  components?: TemplateComponent[],
  options?: WhatsAppSendOptions
) {
  const creds = await resolveCredentials(options);
  if (!creds) {
    return { success: false, error: "Credenciales de WhatsApp no configuradas" };
  }

  const { phoneNumberId, accessToken } = creds;
  const formattedPhone = toPhone.replace(/\D/g, "").trim();

  try {
    const payload: any = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: formattedPhone,
      type: "template",
      template: {
        name: templateName,
        language: { code: languageCode },
      },
    };

    if (components && components.length > 0) {
      payload.template.components = components;
    }

    const response = await fetch(`https://graph.facebook.com/v22.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok) {
      const isWindowError = data?.error?.code === 131047 || data?.error?.error_subcode === 131047;
      console.error("[WhatsApp Template] Error enviando plantilla:", data);
      return {
        success: false,
        error: data,
        isWindowError,
      };
    }

    return {
      success: true,
      messageId: data.messages?.[0]?.id,
      data,
    };
  } catch (error) {
    console.error("[WhatsApp Template] Excepción enviando plantilla:", error);
    return { success: false, error };
  }
}

/**
 * Determina si el cliente se encuentra dentro de la ventana de 24 horas de WhatsApp
 * a partir de la fecha de su último mensaje.
 */
export function isWithin24Hours(lastCustomerMessageAt?: string | null): boolean {
  if (!lastCustomerMessageAt) return false;
  const lastTime = new Date(lastCustomerMessageAt).getTime();
  if (isNaN(lastTime)) return false;
  const diffMs = Date.now() - lastTime;
  return diffMs <= 24 * 60 * 60 * 1000;
}
