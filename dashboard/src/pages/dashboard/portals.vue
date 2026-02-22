<script lang="ts" setup>
import { onMounted, ref, computed } from 'vue'
import { Loader2, ExternalLink, Eye, EyeOff, Search, Copy, Check, Plus, Pencil, Trash2, Download } from 'lucide-vue-next'

import { BasicPage } from '@/components/global-layout'
import { useOemData } from '@/composables/use-oem-data'
import type { OemPortal } from '@/composables/use-oem-data'
import { supabase } from '@/lib/supabase'

const { fetchPortals, fetchOems } = useOemData()

const portals = ref<OemPortal[]>([])
const oems = ref<{ id: string; name: string }[]>([])
const loading = ref(true)
const filterOem = ref('all')
const searchQuery = ref('')
const visiblePasswords = ref<Set<string>>(new Set())
const copiedField = ref<string | null>(null)

// CRUD state
const showForm = ref(false)
const editingPortal = ref<OemPortal | null>(null)
const saving = ref(false)
const deleteTarget = ref<OemPortal | null>(null)
const deleting = ref(false)

// Form fields
const form = ref({
  oem_id: '',
  portal_name: '',
  portal_url: '',
  portal_platform: '',
  username: '',
  password: '',
  marketing_contact: '',
  notes: '',
})

onMounted(async () => {
  try {
    const [p, o] = await Promise.all([fetchPortals(), fetchOems()])
    portals.value = p
    oems.value = o
  }
  finally {
    loading.value = false
  }
})

const filtered = computed(() => {
  let list = portals.value
  if (filterOem.value !== 'all') {
    list = list.filter(p => p.oem_id === filterOem.value)
  }
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase()
    list = list.filter(p =>
      p.portal_name.toLowerCase().includes(q)
      || p.portal_url?.toLowerCase().includes(q)
      || p.portal_platform?.toLowerCase().includes(q)
      || p.marketing_contact?.toLowerCase().includes(q),
    )
  }
  return list
})

function oemName(id: string) {
  return oems.value.find(o => o.id === id)?.name?.replace(' Australia', '') ?? id
}

function togglePassword(portalId: string) {
  if (visiblePasswords.value.has(portalId))
    visiblePasswords.value.delete(portalId)
  else
    visiblePasswords.value.add(portalId)
}

async function copyToClipboard(text: string, fieldKey: string) {
  await navigator.clipboard.writeText(text)
  copiedField.value = fieldKey
  setTimeout(() => { copiedField.value = null }, 1500)
}

// Parse guidelines_pdf_url — can be JSON array or comma-separated URLs
function parseGuidelines(raw: string | null): { name: string; url: string; size_mb?: number }[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      return parsed.map(f => ({
        name: f.name || 'PDF',
        url: f.public_url || f.url || '',
        size_mb: f.size_mb,
      }))
    }
  }
  catch { /* not JSON, fall through */ }
  // Legacy: comma-separated URLs
  return raw.split(', ').filter(Boolean).map(url => {
    const name = decodeURIComponent(url.split('/').pop() || 'PDF')
    return { name, url }
  })
}

// Form helpers
function openAddForm() {
  editingPortal.value = null
  form.value = { oem_id: filterOem.value !== 'all' ? filterOem.value : '', portal_name: '', portal_url: '', portal_platform: '', username: '', password: '', marketing_contact: '', notes: '' }
  showForm.value = true
}

function openEditForm(portal: OemPortal) {
  editingPortal.value = portal
  form.value = {
    oem_id: portal.oem_id,
    portal_name: portal.portal_name,
    portal_url: portal.portal_url || '',
    portal_platform: portal.portal_platform || '',
    username: portal.username || '',
    password: portal.password || '',
    marketing_contact: portal.marketing_contact || '',
    notes: portal.notes || '',
  }
  showForm.value = true
}

async function savePortal() {
  if (!form.value.oem_id || !form.value.portal_name) return
  saving.value = true
  try {
    const payload = {
      oem_id: form.value.oem_id,
      portal_name: form.value.portal_name,
      portal_url: form.value.portal_url || null,
      portal_platform: form.value.portal_platform || null,
      username: form.value.username || null,
      password: form.value.password || null,
      marketing_contact: form.value.marketing_contact || null,
      notes: form.value.notes || null,
      updated_at: new Date().toISOString(),
    }

    if (editingPortal.value) {
      // Update
      const { data, error } = await supabase
        .from('oem_portals')
        .update(payload)
        .eq('id', editingPortal.value.id)
        .select()
      if (error) throw error
      if (data?.[0]) {
        const idx = portals.value.findIndex(p => p.id === editingPortal.value!.id)
        if (idx >= 0) portals.value[idx] = data[0] as OemPortal
      }
    }
    else {
      // Insert
      const { data, error } = await supabase
        .from('oem_portals')
        .insert(payload)
        .select()
      if (error) throw error
      if (data?.[0]) portals.value.push(data[0] as OemPortal)
    }
    showForm.value = false
  }
  catch (err) {
    console.error('Save failed:', err)
  }
  finally {
    saving.value = false
  }
}

async function deletePortal() {
  if (!deleteTarget.value) return
  deleting.value = true
  try {
    const { error } = await supabase
      .from('oem_portals')
      .delete()
      .eq('id', deleteTarget.value.id)
    if (error) throw error
    portals.value = portals.value.filter(p => p.id !== deleteTarget.value!.id)
    deleteTarget.value = null
  }
  catch (err) {
    console.error('Delete failed:', err)
  }
  finally {
    deleting.value = false
  }
}

const stats = computed(() => {
  const t = { total: portals.value.length, withUrl: 0, withCreds: 0, withGuidelines: 0, oemCount: 0 }
  const oemSet = new Set<string>()
  for (const p of portals.value) {
    if (p.portal_url) t.withUrl++
    if (p.username || p.password) t.withCreds++
    if (p.guidelines_pdf_url) t.withGuidelines++
    oemSet.add(p.oem_id)
  }
  t.oemCount = oemSet.size
  return t
})
</script>

<template>
  <BasicPage title="OEM Portals" description="Marketing portal credentials and brand assets" sticky>
    <!-- Filters -->
    <div class="flex items-center gap-3 mb-4 flex-wrap">
      <UiSelect v-model="filterOem">
        <UiSelectTrigger class="w-[200px]">
          <UiSelectValue placeholder="Filter by OEM" />
        </UiSelectTrigger>
        <UiSelectContent>
          <UiSelectItem value="all">All OEMs</UiSelectItem>
          <UiSelectItem v-for="oem in oems" :key="oem.id" :value="oem.id">
            {{ oem.name?.replace(' Australia', '') }}
          </UiSelectItem>
        </UiSelectContent>
      </UiSelect>
      <div class="relative">
        <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
        <UiInput
          v-model="searchQuery"
          placeholder="Search portals..."
          class="pl-8 w-[250px] h-9"
        />
      </div>
      <span class="text-sm text-muted-foreground">
        {{ filtered.length }} portals
      </span>
      <UiButton size="sm" class="ml-auto" @click="openAddForm">
        <Plus class="size-4 mr-1" />
        Add Portal
      </UiButton>
    </div>

    <div v-if="loading" class="flex items-center justify-center h-64">
      <Loader2 class="size-6 animate-spin" />
    </div>

    <template v-else>
      <!-- Summary Stats -->
      <div class="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-6">
        <UiCard>
          <UiCardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
            <UiCardTitle class="text-sm font-medium">Total Portals</UiCardTitle>
          </UiCardHeader>
          <UiCardContent>
            <div class="text-2xl font-bold">{{ stats.total }}</div>
            <p class="text-xs text-muted-foreground">Across {{ stats.oemCount }} OEMs</p>
          </UiCardContent>
        </UiCard>
        <UiCard>
          <UiCardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
            <UiCardTitle class="text-sm font-medium">With URL</UiCardTitle>
          </UiCardHeader>
          <UiCardContent>
            <div class="text-2xl font-bold text-green-500">{{ stats.withUrl }}</div>
            <p class="text-xs text-muted-foreground">Have portal link</p>
          </UiCardContent>
        </UiCard>
        <UiCard>
          <UiCardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
            <UiCardTitle class="text-sm font-medium">With Credentials</UiCardTitle>
          </UiCardHeader>
          <UiCardContent>
            <div class="text-2xl font-bold">{{ stats.withCreds }}</div>
            <p class="text-xs text-muted-foreground">Have username/password</p>
          </UiCardContent>
        </UiCard>
        <UiCard>
          <UiCardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
            <UiCardTitle class="text-sm font-medium">Brand Guidelines</UiCardTitle>
          </UiCardHeader>
          <UiCardContent>
            <div class="text-2xl font-bold">{{ stats.withGuidelines }}</div>
            <p class="text-xs text-muted-foreground">Have PDF documents</p>
          </UiCardContent>
        </UiCard>
      </div>

      <!-- Table -->
      <UiCard>
        <UiTable>
          <UiTableHeader>
            <UiTableRow>
              <UiTableHead>OEM</UiTableHead>
              <UiTableHead>Portal Name</UiTableHead>
              <UiTableHead>URL</UiTableHead>
              <UiTableHead>Platform</UiTableHead>
              <UiTableHead>Username</UiTableHead>
              <UiTableHead>Password</UiTableHead>
              <UiTableHead>Contact</UiTableHead>
              <UiTableHead>Brand Guidelines</UiTableHead>
              <UiTableHead class="w-[80px]" />
            </UiTableRow>
          </UiTableHeader>
          <UiTableBody>
            <UiTableRow v-for="portal in filtered" :key="portal.id">
              <UiTableCell class="font-medium whitespace-nowrap">
                {{ oemName(portal.oem_id) }}
              </UiTableCell>
              <UiTableCell class="max-w-[200px]">
                <span class="text-sm">{{ portal.portal_name }}</span>
              </UiTableCell>
              <UiTableCell>
                <a
                  v-if="portal.portal_url"
                  :href="portal.portal_url"
                  target="_blank"
                  rel="noopener"
                  class="inline-flex items-center gap-1 text-sm text-blue-500 hover:text-blue-700 hover:underline"
                >
                  <ExternalLink class="size-3" />
                  Open
                </a>
                <span v-else class="text-muted-foreground">-</span>
              </UiTableCell>
              <UiTableCell>
                <UiBadge v-if="portal.portal_platform" variant="secondary" class="text-xs">
                  {{ portal.portal_platform }}
                </UiBadge>
                <span v-else class="text-muted-foreground">-</span>
              </UiTableCell>
              <UiTableCell>
                <div v-if="portal.username" class="flex items-center gap-1">
                  <span class="text-sm font-mono">{{ portal.username }}</span>
                  <button
                    class="text-muted-foreground hover:text-foreground"
                    @click="copyToClipboard(portal.username!, `user-${portal.id}`)"
                  >
                    <Check v-if="copiedField === `user-${portal.id}`" class="size-3 text-green-500" />
                    <Copy v-else class="size-3" />
                  </button>
                </div>
                <span v-else class="text-muted-foreground">-</span>
              </UiTableCell>
              <UiTableCell>
                <div v-if="portal.password" class="flex items-center gap-1">
                  <span class="text-sm font-mono">
                    {{ visiblePasswords.has(portal.id) ? portal.password : '********' }}
                  </span>
                  <button
                    class="text-muted-foreground hover:text-foreground"
                    @click="togglePassword(portal.id)"
                  >
                    <EyeOff v-if="visiblePasswords.has(portal.id)" class="size-3" />
                    <Eye v-else class="size-3" />
                  </button>
                  <button
                    class="text-muted-foreground hover:text-foreground"
                    @click="copyToClipboard(portal.password!, `pass-${portal.id}`)"
                  >
                    <Check v-if="copiedField === `pass-${portal.id}`" class="size-3 text-green-500" />
                    <Copy v-else class="size-3" />
                  </button>
                </div>
                <span v-else class="text-muted-foreground">-</span>
              </UiTableCell>
              <UiTableCell class="text-sm">
                {{ portal.marketing_contact || '-' }}
              </UiTableCell>
              <UiTableCell>
                <div v-if="parseGuidelines(portal.guidelines_pdf_url).length" class="space-y-1">
                  <a
                    v-for="(doc, i) in parseGuidelines(portal.guidelines_pdf_url)"
                    :key="i"
                    :href="doc.url"
                    target="_blank"
                    rel="noopener"
                    class="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 hover:underline"
                    :title="doc.name"
                  >
                    <Download class="size-3 shrink-0" />
                    <span class="truncate max-w-[180px]">{{ doc.name }}</span>
                    <span v-if="doc.size_mb" class="text-muted-foreground shrink-0">({{ doc.size_mb }}MB)</span>
                  </a>
                </div>
                <span v-else class="text-muted-foreground">-</span>
              </UiTableCell>
              <UiTableCell>
                <div class="flex items-center gap-1">
                  <button
                    class="text-muted-foreground hover:text-foreground p-1"
                    title="Edit"
                    @click="openEditForm(portal)"
                  >
                    <Pencil class="size-3.5" />
                  </button>
                  <button
                    class="text-muted-foreground hover:text-destructive p-1"
                    title="Delete"
                    @click="deleteTarget = portal"
                  >
                    <Trash2 class="size-3.5" />
                  </button>
                </div>
              </UiTableCell>
            </UiTableRow>
          </UiTableBody>
        </UiTable>
      </UiCard>

      <!-- Empty state -->
      <div v-if="filtered.length === 0 && !loading" class="text-center py-16">
        <ExternalLink class="size-10 text-muted-foreground/30 mx-auto mb-3" />
        <p class="text-sm text-muted-foreground">No portals found matching your filters</p>
      </div>
    </template>

    <!-- Add/Edit Dialog -->
    <UiDialog v-model:open="showForm">
      <UiDialogContent class="sm:max-w-[500px]">
        <UiDialogHeader>
          <UiDialogTitle>{{ editingPortal ? 'Edit Portal' : 'Add Portal' }}</UiDialogTitle>
          <UiDialogDescription>
            {{ editingPortal ? 'Update portal credentials and details.' : 'Add a new OEM portal entry.' }}
          </UiDialogDescription>
        </UiDialogHeader>
        <div class="grid gap-4 py-4">
          <div class="grid gap-2">
            <UiLabel for="oem">OEM</UiLabel>
            <UiSelect v-model="form.oem_id">
              <UiSelectTrigger>
                <UiSelectValue placeholder="Select OEM" />
              </UiSelectTrigger>
              <UiSelectContent>
                <UiSelectItem v-for="oem in oems" :key="oem.id" :value="oem.id">
                  {{ oem.name?.replace(' Australia', '') }}
                </UiSelectItem>
              </UiSelectContent>
            </UiSelect>
          </div>
          <div class="grid gap-2">
            <UiLabel for="name">Portal Name</UiLabel>
            <UiInput id="name" v-model="form.portal_name" placeholder="e.g. Ford Image Library" />
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div class="grid gap-2">
              <UiLabel for="url">Portal URL</UiLabel>
              <UiInput id="url" v-model="form.portal_url" placeholder="https://..." />
            </div>
            <div class="grid gap-2">
              <UiLabel for="platform">Platform</UiLabel>
              <UiInput id="platform" v-model="form.portal_platform" placeholder="sesimi, okta, etc." />
            </div>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div class="grid gap-2">
              <UiLabel for="user">Username</UiLabel>
              <UiInput id="user" v-model="form.username" />
            </div>
            <div class="grid gap-2">
              <UiLabel for="pass">Password</UiLabel>
              <UiInput id="pass" v-model="form.password" type="text" />
            </div>
          </div>
          <div class="grid gap-2">
            <UiLabel for="contact">Marketing Contact</UiLabel>
            <UiInput id="contact" v-model="form.marketing_contact" />
          </div>
          <div class="grid gap-2">
            <UiLabel for="notes">Notes</UiLabel>
            <UiTextarea id="notes" v-model="form.notes" rows="2" />
          </div>
        </div>
        <UiDialogFooter>
          <UiButton variant="outline" @click="showForm = false">Cancel</UiButton>
          <UiButton :disabled="saving || !form.oem_id || !form.portal_name" @click="savePortal">
            <Loader2 v-if="saving" class="size-4 mr-1 animate-spin" />
            {{ editingPortal ? 'Save Changes' : 'Add Portal' }}
          </UiButton>
        </UiDialogFooter>
      </UiDialogContent>
    </UiDialog>

    <!-- Delete Confirmation -->
    <UiAlertDialog :open="!!deleteTarget" @update:open="v => { if (!v) deleteTarget = null }">
      <UiAlertDialogContent>
        <UiAlertDialogHeader>
          <UiAlertDialogTitle>Delete Portal</UiAlertDialogTitle>
          <UiAlertDialogDescription>
            Are you sure you want to delete <strong>{{ deleteTarget?.portal_name }}</strong> ({{ deleteTarget ? oemName(deleteTarget.oem_id) : '' }})? This action cannot be undone.
          </UiAlertDialogDescription>
        </UiAlertDialogHeader>
        <UiAlertDialogFooter>
          <UiAlertDialogCancel @click="deleteTarget = null">Cancel</UiAlertDialogCancel>
          <UiAlertDialogAction
            class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            :disabled="deleting"
            @click="deletePortal"
          >
            <Loader2 v-if="deleting" class="size-4 mr-1 animate-spin" />
            Delete
          </UiAlertDialogAction>
        </UiAlertDialogFooter>
      </UiAlertDialogContent>
    </UiAlertDialog>
  </BasicPage>
</template>
