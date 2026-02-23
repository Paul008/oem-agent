/**
 * vehicle360.js — Standalone Alpine.js 360° Color Picker Component
 *
 * Usage: <div x-data="vehicle360({ colors: [...], primaryColor: '#C3002F', startAngle: 0 })">
 *
 * Color data shape:
 *   { name, code, swatch, hero, gallery: [], type, priceDelta, isStandard }
 *
 * Features:
 *   - 360° frame generation from gallery arrays, Kia _00000 pattern, Nissan Helios pov=E01 pattern
 *   - Drag-to-rotate with pointer capture
 *   - ArrowLeft/ArrowRight keyboard navigation
 *   - Frame preloading with progress counter
 *   - 6-thumbnail strip for quick angle selection
 *   - Color swatch picker that rebuilds frames on change
 *   - Static fallback for non-360 colors
 */
document.addEventListener('alpine:init', () => {
  Alpine.data('vehicle360', ({ colors = [], primaryColor = '#333', startAngle = 0 }) => ({
    // State
    colors,
    primaryColor,
    selected: 0,
    frame: 0,
    frames: [],
    thumbs: [],
    loading: true,
    dragging: false,
    _loaded: 0,
    _total: 0,
    _dragStartX: 0,
    _dragStartFrame: 0,

    // Getters
    get color() { return this.colors[this.selected] || {} },
    get is360() { return this.frames.length > 1 },
    get progress() { return this._total > 0 ? Math.round((this._loaded / this._total) * 100) : 0 },
    get angle() { return this._total > 0 ? Math.round((this.frame / this._total) * 360) : 0 },

    // Init
    init() {
      if (this.colors.length > 0) this._buildFrames()

      // Keyboard listener
      this._onKey = (e) => {
        if (e.key === 'ArrowLeft') { e.preventDefault(); this._step(-1) }
        if (e.key === 'ArrowRight') { e.preventDefault(); this._step(1) }
      }
      this.$el.setAttribute('tabindex', '0')
      this.$el.addEventListener('keydown', this._onKey)
    },

    destroy() {
      if (this._onKey) this.$el.removeEventListener('keydown', this._onKey)
    },

    // Public methods
    pick(i) {
      if (i === this.selected) return
      this.selected = i
      this._buildFrames()
    },

    goTo(idx) {
      if (idx >= 0 && idx < this.frames.length) this.frame = idx
    },

    onDown(e) {
      if (!this.is360) return
      this.dragging = true
      this._dragStartX = e.clientX || e.touches?.[0]?.clientX || 0
      this._dragStartFrame = this.frame
      e.target?.setPointerCapture?.(e.pointerId)
      e.preventDefault()
    },

    onMove(e) {
      if (!this.dragging) return
      e.preventDefault()
      const x = e.clientX || e.touches?.[0]?.clientX || 0
      const dx = x - this._dragStartX
      const w = this.$el.querySelector('[data-viewer]')?.offsetWidth || 600
      const delta = Math.round((dx / w) * this._total)
      let f = (this._dragStartFrame - delta) % this._total
      if (f < 0) f += this._total
      this.frame = f
    },

    onUp() { this.dragging = false },

    thumbUrl(idx) { return this.frames[this.thumbs[idx]] || '' },

    // Internal
    _step(dir) {
      if (!this.is360) return
      let f = (this.frame + dir) % this._total
      if (f < 0) f += this._total
      this.frame = f
    },

    _buildFrames() {
      const c = this.color
      const hero = c.hero || ''
      const gallery = c.gallery || []
      let urls = []

      if (gallery.length > 1) {
        // Gallery array (Ford, Subaru, etc.)
        urls = gallery.slice()
      } else if (/_\d{5}\./.test(hero)) {
        // Kia pattern: _00000 through _00035
        for (let i = 0; i < 36; i++) {
          urls.push(hero.replace(/_\d{5}\./, '_' + String(i).padStart(5, '0') + '.'))
        }
      } else if (/pov=E\d{2}/.test(hero)) {
        // Nissan Helios: pov=E01 through pov=E36
        for (let i = 0; i < 36; i++) {
          const pov = 'E' + String(i + 1).padStart(2, '0')
          urls.push(
            hero
              .replace(/pov=E\d{2}/, 'pov=' + pov)
              .replace(/width=\d+/, 'width=1200')
              .replace(/quality=\d+/, 'quality=85')
          )
        }
      } else {
        // Static fallback — single image
        urls = hero ? [hero] : []
      }

      this.frames = urls
      this._total = urls.length
      this.frame = 0

      // Build 6 evenly-spaced thumbnail indices
      if (this._total <= 6) {
        this.thumbs = Array.from({ length: this._total }, (_, i) => i)
      } else {
        const step = this._total / 6
        this.thumbs = Array.from({ length: 6 }, (_, i) => Math.round(i * step))
      }

      // Convert startAngle to initial frame
      if (startAngle > 0 && this._total > 1) {
        this.frame = Math.round((startAngle / 360) * this._total) % this._total
      }

      // Preload
      this._preload()
    },

    _preload() {
      this._loaded = 0
      this.loading = this.frames.length > 1

      if (this.frames.length <= 1) {
        this.loading = false
        return
      }

      for (const url of this.frames) {
        const img = new Image()
        img.onload = img.onerror = () => {
          this._loaded++
          if (this._loaded >= this._total) this.loading = false
        }
        img.src = url
      }
    },
  }))
})
