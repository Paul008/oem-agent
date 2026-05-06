import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import type { Ref } from 'vue'

import { onUnmounted, ref } from 'vue'

import { supabase } from '@/lib/supabase'

type RealtimeEvent = 'INSERT' | 'UPDATE' | 'DELETE' | '*'

interface UseRealtimeOptions<T> {
  channelName: string
  table: string
  event: RealtimeEvent
  dataRef: Ref<T[]>
  primaryKey?: string
  filter?: string
  onEvent?: (payload: RealtimePostgresChangesPayload<T>, eventType: RealtimeEvent) => void
  maxItems?: number
  insertPosition?: 'prepend' | 'append'
}

export function useRealtimeSubscription<T extends Record<string, any>>(options: UseRealtimeOptions<T>) {
  const {
    channelName,
    table,
    event,
    dataRef,
    primaryKey = 'id',
    filter,
    onEvent,
    maxItems = 500,
    insertPosition = 'prepend',
  } = options

  const channel = ref<RealtimeChannel | null>(null)
  const isSubscribed = ref(false)
  const subscriptionError = ref<string | null>(null)

  const channelConfig: Record<string, string> = {
    event: event === '*' ? '*' : event,
    schema: 'public',
    table,
  }
  if (filter) {
    channelConfig.filter = filter
  }

  const ch = supabase
    .channel(channelName)
    .on(
      'postgres_changes' as any,
      channelConfig,
      (payload: RealtimePostgresChangesPayload<T>) => {
        const eventType = payload.eventType as RealtimeEvent

        if (eventType === 'INSERT') {
          const newRow = payload.new as T
          if (insertPosition === 'prepend') {
            dataRef.value = [newRow, ...dataRef.value].slice(0, maxItems)
          }
          else {
            dataRef.value = [...dataRef.value, newRow].slice(-maxItems)
          }
        }
        else if (eventType === 'UPDATE') {
          const updated = payload.new as T
          const idx = dataRef.value.findIndex(
            item => item[primaryKey] === updated[primaryKey],
          )
          if (idx !== -1) {
            dataRef.value = [
              ...dataRef.value.slice(0, idx),
              updated,
              ...dataRef.value.slice(idx + 1),
            ]
          }
        }
        else if (eventType === 'DELETE') {
          const deleted = payload.old as T
          dataRef.value = dataRef.value.filter(
            item => item[primaryKey] !== deleted[primaryKey],
          )
        }

        onEvent?.(payload, eventType)
      },
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        isSubscribed.value = true
        subscriptionError.value = null
      }
      else if (status === 'CHANNEL_ERROR') {
        isSubscribed.value = false
        subscriptionError.value = `Realtime channel "${channelName}" error`
        console.error(`[Realtime] Channel "${channelName}" error`)
      }
      else if (status === 'TIMED_OUT') {
        isSubscribed.value = false
        subscriptionError.value = `Realtime channel "${channelName}" timed out`
        console.error(`[Realtime] Channel "${channelName}" timed out`)
      }
    })

  channel.value = ch

  function unsubscribe() {
    if (channel.value) {
      supabase.removeChannel(channel.value)
      channel.value = null
      isSubscribed.value = false
    }
  }

  onUnmounted(unsubscribe)

  return {
    channel,
    isSubscribed,
    subscriptionError,
    unsubscribe,
  }
}
