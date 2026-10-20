import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function POST() {
  try {
    const adminClient = getSupabaseAdmin();
    const email = "admin@salesbot.crm";
    const password = "admin123";

    // Verificar si ya existe en Supabase Auth
    const { data: listData, error: listError } = await adminClient.auth.admin.listUsers();
    if (listError) {
      return NextResponse.json({ error: listError.message }, { status: 500 });
    }

    const existingUser = listData.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());

    if (!existingUser) {
      // Crear en Supabase Auth
      const { data, error } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          name: "Jesús",
          role: "superadmin",
          roleLabel: "Super Administrador (Acceso Total)",
          permissions: ["*"],
        },
      });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      return NextResponse.json({
        message: "Superadmin creado exitosamente en Supabase Auth",
        user: data.user,
      });
    }

    // Si ya existe, aseguramos que tenga la metadata y la contraseña correcta
    await adminClient.auth.admin.updateUserById(existingUser.id, {
      password,
      email_confirm: true,
      user_metadata: {
        name: existingUser.user_metadata?.name || "Jesús",
        role: "superadmin",
        roleLabel: "Super Administrador (Acceso Total)",
        permissions: ["*"],
      },
    });

    return NextResponse.json({
      message: "Superadmin sincronizado en Supabase Auth",
      userId: existingUser.id,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Error al sincronizar auth" }, { status: 500 });
  }
}
