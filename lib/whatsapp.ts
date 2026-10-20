export async function sendWhatsAppMessage(toPhone: string, text: string) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneNumberId) {
    console.error("Faltan variables de entorno: WHATSAPP_ACCESS_TOKEN o WHATSAPP_PHONE_NUMBER_ID");
    return { success: false, error: "Credenciales de WhatsApp no configuradas" };
  }

  // Quitar el '+' si viene incluido
  const formattedPhone = toPhone.replace("+", "").trim();

  try {
    const response = await fetch(`https://graph.facebook.com/v22.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
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
      console.error("Error al enviar mensaje por WhatsApp API:", data);
      return { success: false, error: data };
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
  caption?: string
) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneNumberId) {
    return { success: false, error: "Credenciales de WhatsApp no configuradas" };
  }

  const formattedPhone = toPhone.replace("+", "").trim();

  try {
    const response = await fetch(`https://graph.facebook.com/v22.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
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
  caption?: string
) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneNumberId) {
    return { success: false, error: "Credenciales de WhatsApp no configuradas" };
  }

  const formattedPhone = toPhone.replace("+", "").trim();

  try {
    const response = await fetch(`https://graph.facebook.com/v22.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
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
  mediaId: string
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!token) {
    console.error("Falta variable de entorno: WHATSAPP_ACCESS_TOKEN para descargar media");
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

