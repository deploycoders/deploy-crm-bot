import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getTenantContext, isTenantAdmin } from "@/lib/tenant";

export async function GET(request: NextRequest) {
  try {
    const tenant = await getTenantContext(request);
    if (!tenant) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const supabase = getSupabaseAdmin();
    const { data: channel, error } = await supabase
      .from("tenant_channels")
      .select("id, provider, external_id, display_name, is_active, access_token, created_at")
      .eq("tenant_id", tenant.tenantId)
      .eq("provider", "whatsapp")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    const envPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID || "";
    const envToken = process.env.WHATSAPP_ACCESS_TOKEN || "";

    // Mask the token for safety: show first 6 and last 4 characters
    const token = channel?.access_token || (channel ? "" : envToken);
    const maskedToken = token && token.length > 10
      ? `${token.slice(0, 6)}...${token.slice(-4)}`
      : token ? "******" : "";

    return NextResponse.json({
      success: true,
      channel: {
        id: channel?.id || null,
        phoneNumberId: channel?.external_id || envPhoneId,
        displayName: channel?.display_name || "WhatsApp Principal",
        isActive: channel?.is_active ?? true,
        isCustom: !!channel?.access_token,
        maskedToken,
        hasToken: !!token,
      },
    });
  } catch (error: any) {
    console.error("[channels:whatsapp:GET] Error:", error);
    return NextResponse.json({ success: false, error: error.message || "Error interno" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const tenant = await getTenantContext(request);
    if (!tenant) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }
    if (!isTenantAdmin(tenant)) {
      return NextResponse.json({ success: false, error: "Permisos insuficientes" }, { status: 403 });
    }

    const body = await request.json();
    const { phoneNumberId, accessToken, displayName = "WhatsApp" } = body;

    if (!phoneNumberId || typeof phoneNumberId !== "string") {
      return NextResponse.json(
        { success: false, error: "Phone Number ID es requerido" },
        { status: 400 }
      );
    }

    const cleanPhoneId = phoneNumberId.trim();
    const supabase = getSupabaseAdmin();

    // Check if another tenant has claimed this phone number id
    const { data: existingChannel } = await supabase
      .from("tenant_channels")
      .select("id, tenant_id")
      .eq("provider", "whatsapp")
      .eq("external_id", cleanPhoneId)
      .maybeSingle();

    if (existingChannel && existingChannel.tenant_id !== tenant.tenantId) {
      return NextResponse.json(
        { success: false, error: "Este Phone Number ID ya está registrado en otra organización." },
        { status: 409 }
      );
    }

    // Find if the current tenant already has a whatsapp channel
    const { data: currentChannel } = await supabase
      .from("tenant_channels")
      .select("id, access_token")
      .eq("tenant_id", tenant.tenantId)
      .eq("provider", "whatsapp")
      .maybeSingle();

    const tokenToSave = accessToken && accessToken.trim() !== ""
      ? accessToken.trim()
      : currentChannel?.access_token || process.env.WHATSAPP_ACCESS_TOKEN || "";

    let saveResult;
    if (currentChannel) {
      saveResult = await supabase
        .from("tenant_channels")
        .update({
          external_id: cleanPhoneId,
          display_name: displayName.trim(),
          access_token: tokenToSave,
          is_active: true,
        })
        .eq("id", currentChannel.id)
        .select()
        .single();
    } else {
      saveResult = await supabase
        .from("tenant_channels")
        .insert({
          tenant_id: tenant.tenantId,
          provider: "whatsapp",
          external_id: cleanPhoneId,
          display_name: displayName.trim(),
          access_token: tokenToSave,
          is_active: true,
        })
        .select()
        .single();
    }

    if (saveResult.error) {
      return NextResponse.json({ success: false, error: saveResult.error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: "Canal de WhatsApp configurado para la organización.",
      channel: {
        id: saveResult.data.id,
        phoneNumberId: saveResult.data.external_id,
        displayName: saveResult.data.display_name,
        isCustom: !!saveResult.data.access_token,
      },
    });
  } catch (error: any) {
    console.error("[channels:whatsapp:POST] Error:", error);
    return NextResponse.json({ success: false, error: error.message || "Error interno" }, { status: 500 });
  }
}

