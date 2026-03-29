import { onMounted, onUnmounted, ref, type Ref } from 'vue'

/**
 * GSAP-powered section animations.
 * Lazy-loads GSAP + ScrollTrigger only when an animation is requested.
 * Returns a ref to bind to the section's root element.
 */

export type AnimationType =
  | 'none'
  | 'fade-up'
  | 'fade-in'
  | 'slide-left'
  | 'slide-right'
  | 'scale-in'
  | 'parallax'
  | 'stagger-children'
  | 'count-up'

let gsapLoaded = false
let gsap: any = null
let ScrollTrigger: any = null

async function ensureGsap() {
  if (gsapLoaded) return { gsap, ScrollTrigger }
  const mod = await import('gsap')
  const stMod = await import('gsap/ScrollTrigger')
  gsap = mod.gsap || mod.default
  ScrollTrigger = stMod.ScrollTrigger || stMod.default
  gsap.registerPlugin(ScrollTrigger)
  gsapLoaded = true
  return { gsap, ScrollTrigger }
}

const ANIMATION_PRESETS: Record<string, { from: Record<string, any>; to?: Record<string, any> }> = {
  'fade-up': { from: { opacity: 0, y: 40 } },
  'fade-in': { from: { opacity: 0 } },
  'slide-left': { from: { opacity: 0, x: -60 } },
  'slide-right': { from: { opacity: 0, x: 60 } },
  'scale-in': { from: { opacity: 0, scale: 0.9 } },
}

export function useSectionAnimation(
  animation: AnimationType | undefined,
  elementRef: Ref<HTMLElement | null>,
) {
  const triggers: any[] = []

  onMounted(async () => {
    if (!animation || animation === 'none' || !elementRef.value) return

    let gsapMod: Awaited<ReturnType<typeof ensureGsap>>
    try {
      gsapMod = await ensureGsap()
    } catch {
      // GSAP failed to load — skip animations silently
      return
    }
    const { gsap, ScrollTrigger } = gsapMod
    const el = elementRef.value

    if (animation === 'stagger-children') {
      // Animate direct children with staggered entrance
      const children = el.children
      if (children.length === 0) return
      gsap.set(children, { opacity: 0, y: 30 })
      const trigger = ScrollTrigger.create({
        trigger: el,
        start: 'top 85%',
        once: true,
        onEnter: () => {
          gsap.to(children, {
            opacity: 1,
            y: 0,
            duration: 0.6,
            stagger: 0.1,
            ease: 'power2.out',
          })
        },
      })
      triggers.push(trigger)
      return
    }

    if (animation === 'count-up') {
      // Find elements with numeric text and animate the count
      const nums = el.querySelectorAll('[data-count-target]') as NodeListOf<HTMLElement>
      if (nums.length === 0) return
      const trigger = ScrollTrigger.create({
        trigger: el,
        start: 'top 85%',
        once: true,
        onEnter: () => {
          nums.forEach((numEl: HTMLElement) => {
            const target = parseFloat(numEl.dataset.countTarget || numEl.textContent || '0')
            const obj = { val: 0 }
            gsap.to(obj, {
              val: target,
              duration: 1.5,
              ease: 'power2.out',
              onUpdate: () => {
                numEl.textContent = Math.round(obj.val).toLocaleString()
              },
            })
          })
        },
      })
      triggers.push(trigger)
      return
    }

    if (animation === 'parallax') {
      // Parallax: image moves slower than scroll
      const img = el.querySelector('img')
      if (img) {
        gsap.set(img, { scale: 1.15 })
        const trigger = gsap.to(img, {
          y: -40,
          ease: 'none',
          scrollTrigger: {
            trigger: el,
            start: 'top bottom',
            end: 'bottom top',
            scrub: true,
          },
        })
        triggers.push(trigger.scrollTrigger)
      }
      return
    }

    // Standard preset animations
    const preset = ANIMATION_PRESETS[animation]
    if (!preset) return

    gsap.set(el, preset.from)
    const trigger = ScrollTrigger.create({
      trigger: el,
      start: 'top 85%',
      once: true,
      onEnter: () => {
        gsap.to(el, {
          opacity: 1,
          x: 0,
          y: 0,
          scale: 1,
          duration: 0.7,
          ease: 'power2.out',
          ...preset.to,
        })
      },
    })
    triggers.push(trigger)
  })

  onUnmounted(() => {
    triggers.forEach(t => t?.kill?.())
  })
}

/** All available animation options for the editor UI */
export const ANIMATION_OPTIONS: { value: AnimationType; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'fade-up', label: 'Fade Up' },
  { value: 'fade-in', label: 'Fade In' },
  { value: 'slide-left', label: 'Slide from Left' },
  { value: 'slide-right', label: 'Slide from Right' },
  { value: 'scale-in', label: 'Scale In' },
  { value: 'parallax', label: 'Parallax (images)' },
  { value: 'stagger-children', label: 'Stagger Children' },
  { value: 'count-up', label: 'Count Up (numbers)' },
]
