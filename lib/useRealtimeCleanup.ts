/**
 * lib/useRealtimeCleanup.ts
 * Hook React para gestionar suscripciones a Supabase Realtime
 * con limpieza automática garantizada (sin memory leaks ni canales huérfanos).
 *
 * Uso:
 *   const { isConnected } = useRealtimeCleanup({
 *     channelName: 'my-channel',
 *     onMessage: (payload) => { ... },
 *   });
 */

"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";

export type RealtimeEvent = "INSERT" | "UPDATE" | "DELETE" | "*";

export interface RealtimeSubscription {
  /** Tabla de Supabase a escuchar */
  table: string;
  /** Evento a escuchar (default: '*') */
  event?: RealtimeEvent;
  /** Schema de Supabase (default: 'public') */
  schema?: string;
  /** Filtro de fila, e.g. 'conversation_id=eq.abc123' */
  filter?: string;
  /** Callback cuando llega un cambio */
  onPayload: (payload: any) => void;
}

interface UseRealtimeCleanupOptions {
  /** Nombre único del canal (evita colisiones) */
  channelName: string;
  /** Array de subscripciones a registrar en este canal */
  subscriptions: RealtimeSubscription[];
  /** Si false, no crea el canal (útil para pausar mientras carga datos) */
  enabled?: boolean;
}

interface UseRealtimeCleanupResult {
  /** true si el canal está SUBSCRIBED */
  isConnected: boolean;
  /** Fuerza la reconexión del canal */
  reconnect: () => void;
}

export function useRealtimeCleanup({
  channelName,
  subscriptions,
  enabled = true,
}: UseRealtimeCleanupOptions): UseRealtimeCleanupResult {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const cleanup = useCallback(() => {
    if (channelRef.current) {
      supabase
        .removeChannel(channelRef.current)
        .then(() => {
          channelRef.current = null;
          setIsConnected(false);
        })
        .catch(() => {
          channelRef.current = null;
          setIsConnected(false);
        });
    }
  }, []);

  const connect = useCallback(() => {
    if (!enabled || subscriptions.length === 0) return;

    // Limpiar canal previo si existe
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current).catch(() => {});
      channelRef.current = null;
    }

    let channel = supabase.channel(channelName);

    for (const sub of subscriptions) {
      channel = channel.on(
        "postgres_changes" as any,
        {
          event: sub.event ?? "*",
          schema: sub.schema ?? "public",
          table: sub.table,
          ...(sub.filter ? { filter: sub.filter } : {}),
        },
        sub.onPayload
      );
    }

    channel = channel.subscribe((status) => {
      setIsConnected(status === "SUBSCRIBED");
      if (status === "CHANNEL_ERROR") {
        console.warn(`[realtime] Error en canal "${channelName}", reconectando...`);
        // Auto-reconectar después de 5s
        setTimeout(() => connect(), 5000);
      }
    });

    channelRef.current = channel;
  }, [channelName, subscriptions, enabled]);

  useEffect(() => {
    connect();
    return () => {
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelName, enabled]);

  return {
    isConnected,
    reconnect: connect,
  };
}
