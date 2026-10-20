/**
 * lib/debounce.ts
 * Debounce real para el webhook serverless de WhatsApp.
 *
 * En un entorno serverless cada invocación es independiente, por lo que
 * la forma correcta de "debounce" es:
 *
 *   1. Esperar N ms dentro del mismo handler.
 *   2. Re-consultar Supabase para ver si llegó un mensaje más reciente.
 *   3. Si llegó un mensaje más nuevo → delegar al handler de ese mensaje.
 *
 * Este módulo también expone un Map en memoria para rastrear timers activos
 * DENTRO de la misma instancia de proceso (útil en dev con Node persistente).
 * En producción serverless la lógica del webhook ya implementa el patrón
 * correcto consultando Supabase.
 */

// ──────────────────────────────────────────────
// Singleton en memoria (válido en dev)
// ──────────────────────────────────────────────
interface PendingDebounce {
  timerId: ReturnType<typeof setTimeout>;
  abortController: AbortController;
  enqueued: number; // timestamp ms
}

const pending = new Map<string, PendingDebounce>();

/**
 * Registra una operación debounceada para un conversationId.
 * Si ya existe una pendiente, la cancela y crea una nueva.
 *
 * @param conversationId  ID de la conversación
 * @param fn              Función a ejecutar tras el delay
 * @param delayMs         Milisegundos de espera (default 3500)
 * @returns AbortController para cancelar externamente
 */
export function debouncedBotReply(
  conversationId: string,
  fn: (signal: AbortSignal) => Promise<void>,
  delayMs = 3500
): AbortController {
  // Cancelar cualquier timer previo para esta conversación
  const existing = pending.get(conversationId);
  if (existing) {
    clearTimeout(existing.timerId);
    existing.abortController.abort();
    pending.delete(conversationId);
  }

  const abortController = new AbortController();

  const timerId = setTimeout(async () => {
    pending.delete(conversationId);
    if (!abortController.signal.aborted) {
      try {
        await fn(abortController.signal);
      } catch (err: unknown) {
        if ((err as Error)?.name !== "AbortError") {
          console.error(`[debounce] Error en reply para ${conversationId}:`, err);
        }
      }
    }
  }, delayMs);

  pending.set(conversationId, {
    timerId,
    abortController,
    enqueued: Date.now(),
  });

  return abortController;
}

/**
 * Cancela la respuesta pendiente del bot para una conversación
 * (se llama cuando un asesor humano interviene).
 */
export function cancelPendingDebounce(conversationId: string): boolean {
  const existing = pending.get(conversationId);
  if (!existing) return false;

  clearTimeout(existing.timerId);
  existing.abortController.abort();
  pending.delete(conversationId);

  console.log(`⏹️  [debounce] Intervención humana — respuesta del bot cancelada para ${conversationId}`);
  return true;
}

/**
 * ¿Hay una respuesta del bot en cola para esta conversación?
 */
export function hasPendingDebounce(conversationId: string): boolean {
  return pending.has(conversationId);
}

/**
 * Retorna el número de ms transcurridos desde que se encoló la respuesta.
 */
export function getPendingDebounceAge(conversationId: string): number | null {
  const entry = pending.get(conversationId);
  if (!entry) return null;
  return Date.now() - entry.enqueued;
}

/** Limpia todos los timers pendientes (útil en tests). */
export function clearAllPendingDebounces(): void {
  for (const [, entry] of pending) {
    clearTimeout(entry.timerId);
    entry.abortController.abort();
  }
  pending.clear();
}
