import { NextRequest, NextResponse } from "next/server";
import { getActiveBotConfig, saveBotConfig } from "@/lib/botConfig";

export async function GET() {
  try {
    const config = await getActiveBotConfig();
    return NextResponse.json({ success: true, config });
  } catch (error: any) {
    console.error("Error al obtener configuración del bot:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Error al obtener configuración" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const result = await saveBotConfig(body);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || "No se pudo guardar la configuración" },
        { status: 500 }
      );
    }

    const updated = await getActiveBotConfig();
    return NextResponse.json({ success: true, config: updated });
  } catch (error: any) {
    console.error("Error al guardar configuración del bot:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Error al procesar la solicitud" },
      { status: 500 }
    );
  }
}
