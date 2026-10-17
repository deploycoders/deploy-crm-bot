/**
 * lib/debounce.ts
 * Utilidad de control para cancelación de debounce cuando un asesor interviene.
 */

export function cancelPendingDebounce(conversationId: string) {
  // En la arquitectura serverless sincronizada con Supabase,
  // cuando un asesor humano responde se actualiza conversations.status = 'human_takeover',
  // lo cual detiene automáticamente cualquier respuesta del bot en el webhook.
  if (conversationId) {
    console.log(`⏹️ Intervención humana en conversación ${conversationId}`);
  }
}
