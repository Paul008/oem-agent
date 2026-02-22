import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

// Skip Navigator LockManager to avoid lock timeout errors that cause blank screens.
// Safe for single-tab internal dashboards — the lock only prevents multi-tab token
// refresh races, which don't apply here.
// See: https://github.com/supabase/supabase-js/issues/1594
const noOpLock = async (_name: string, _acquireTimeout: number, fn: () => Promise<any>) => {
  return await fn()
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    lock: noOpLock,
  },
})
