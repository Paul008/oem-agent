<script lang="ts" setup>
import { ref, computed } from 'vue'
import { useInlineEdit } from '@/composables/use-inline-edit'

const props = defineProps<{
  section: {
    type: 'finance-calculator'
    title?: string
    subtitle?: string
    default_price: number
    default_deposit: number
    default_term_months: number
    default_rate: number
    min_deposit: number
    max_term: number
    cta_text?: string
    cta_url?: string
    disclaimer?: string
  }
}>()

const emit = defineEmits<{ 'inline-edit': [field: string, value: string, el: HTMLElement]; 'update-text': [field: string, value: string] }>()
const titleEdit = useInlineEdit((v) => emit('update-text', 'title', v))
const subEdit = useInlineEdit((v) => emit('update-text', 'subtitle', v))
function startEditing(field: string, edit: ReturnType<typeof useInlineEdit>, e: MouseEvent) { const el = e.target as HTMLElement; edit.startEdit(el); emit('inline-edit', field, el.textContent || '', el) }

const price = ref(props.section.default_price)
const deposit = ref(props.section.default_deposit)
const term = ref(props.section.default_term_months)
const rate = ref(props.section.default_rate)

const monthlyRepayment = computed(() => {
  const principal = price.value - deposit.value
  if (principal <= 0 || term.value <= 0) return 0
  const monthlyRate = (rate.value / 100) / 12
  if (monthlyRate === 0) return principal / term.value
  const payment = principal * (monthlyRate * Math.pow(1 + monthlyRate, term.value)) / (Math.pow(1 + monthlyRate, term.value) - 1)
  return Math.round(payment)
})

const totalCost = computed(() => monthlyRepayment.value * term.value)
const totalInterest = computed(() => totalCost.value - (price.value - deposit.value))

function fmt(n: number) {
  return n.toLocaleString('en-AU', { maximumFractionDigits: 0 })
}
</script>

<template>
  <div class="px-8 py-10 bg-slate-50 dark:bg-slate-900/30">
    <div class="max-w-2xl mx-auto">
      <div class="text-center mb-6">
        <h2 class="text-xl font-bold cursor-text outline-none" :style="{ opacity: section.title ? 1 : 0.4 }" @dblclick="startEditing('title', titleEdit, $event)" @blur="titleEdit.stopEdit()" @keydown="titleEdit.onKeydown" @paste="titleEdit.onPaste">{{ section.title || 'Double-click to add title' }}</h2>
        <p class="text-sm text-muted-foreground mt-1 cursor-text outline-none" :style="{ opacity: section.subtitle ? 1 : 0.4 }" @dblclick="startEditing('subtitle', subEdit, $event)" @blur="subEdit.stopEdit()" @keydown="subEdit.onKeydown" @paste="subEdit.onPaste">{{ section.subtitle || 'Double-click to add subtitle' }}</p>
      </div>

      <div class="grid sm:grid-cols-2 gap-6">
        <!-- Inputs -->
        <div class="space-y-4">
          <div>
            <label class="text-xs text-muted-foreground mb-1 block">Vehicle Price</label>
            <div class="flex items-center gap-2">
              <span class="text-sm text-muted-foreground">$</span>
              <input
                v-model.number="price"
                type="range"
                :min="10000"
                :max="150000"
                :step="1000"
                class="flex-1"
              />
              <span class="text-sm font-medium w-20 text-right">${{ fmt(price) }}</span>
            </div>
          </div>
          <div>
            <label class="text-xs text-muted-foreground mb-1 block">Deposit</label>
            <div class="flex items-center gap-2">
              <span class="text-sm text-muted-foreground">$</span>
              <input
                v-model.number="deposit"
                type="range"
                :min="section.min_deposit"
                :max="price"
                :step="500"
                class="flex-1"
              />
              <span class="text-sm font-medium w-20 text-right">${{ fmt(deposit) }}</span>
            </div>
          </div>
          <div>
            <label class="text-xs text-muted-foreground mb-1 block">Term (months)</label>
            <div class="flex items-center gap-2">
              <input
                v-model.number="term"
                type="range"
                :min="12"
                :max="section.max_term"
                :step="12"
                class="flex-1"
              />
              <span class="text-sm font-medium w-20 text-right">{{ term }} mo</span>
            </div>
          </div>
          <div>
            <label class="text-xs text-muted-foreground mb-1 block">Interest Rate (%)</label>
            <div class="flex items-center gap-2">
              <input
                v-model.number="rate"
                type="range"
                :min="0"
                :max="15"
                :step="0.1"
                class="flex-1"
              />
              <span class="text-sm font-medium w-20 text-right">{{ rate.toFixed(1) }}%</span>
            </div>
          </div>
        </div>

        <!-- Result -->
        <div class="bg-white dark:bg-slate-800 rounded-xl border p-6 flex flex-col items-center justify-center text-center">
          <p class="text-sm text-muted-foreground mb-1">Estimated Monthly Repayment</p>
          <p class="text-4xl font-bold text-primary">${{ fmt(monthlyRepayment) }}</p>
          <p class="text-xs text-muted-foreground mt-1">per month</p>

          <div class="grid grid-cols-2 gap-4 mt-4 w-full text-xs">
            <div>
              <p class="text-muted-foreground">Total Cost</p>
              <p class="font-semibold">${{ fmt(totalCost) }}</p>
            </div>
            <div>
              <p class="text-muted-foreground">Total Interest</p>
              <p class="font-semibold">${{ fmt(totalInterest) }}</p>
            </div>
          </div>

          <a
            v-if="section.cta_text"
            :href="section.cta_url || '#'"
            class="mt-4 inline-block px-5 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            {{ section.cta_text }}
          </a>
        </div>
      </div>

      <p v-if="section.disclaimer" class="text-[10px] text-muted-foreground text-center mt-4">
        {{ section.disclaimer }}
      </p>
    </div>
  </div>
</template>
