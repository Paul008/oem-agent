import { ref, shallowRef } from 'vue'

export interface GoogleFont {
  family: string
  variants: string[]
  category: string
}

const fonts = shallowRef<GoogleFont[]>([])
const loaded = ref(false)
const loading = ref(false)
const loadedFamilies = new Set<string>()

const GOOGLE_FONTS_CSS = 'https://fonts.googleapis.com/css2'

/**
 * Fetch the Google Fonts list (cached after first call).
 * Uses the CSS API to avoid needing an API key.
 * We load a curated popular list for performance.
 */
const POPULAR_FONTS: GoogleFont[] = [
  { family: 'Inter', variants: ['400', '500', '600', '700'], category: 'sans-serif' },
  { family: 'Roboto', variants: ['300', '400', '500', '700'], category: 'sans-serif' },
  { family: 'Open Sans', variants: ['300', '400', '600', '700'], category: 'sans-serif' },
  { family: 'Lato', variants: ['300', '400', '700'], category: 'sans-serif' },
  { family: 'Montserrat', variants: ['300', '400', '500', '600', '700'], category: 'sans-serif' },
  { family: 'Poppins', variants: ['300', '400', '500', '600', '700'], category: 'sans-serif' },
  { family: 'Oswald', variants: ['300', '400', '500', '600', '700'], category: 'sans-serif' },
  { family: 'Raleway', variants: ['300', '400', '500', '600', '700'], category: 'sans-serif' },
  { family: 'Nunito', variants: ['300', '400', '600', '700'], category: 'sans-serif' },
  { family: 'Nunito Sans', variants: ['300', '400', '600', '700'], category: 'sans-serif' },
  { family: 'Ubuntu', variants: ['300', '400', '500', '700'], category: 'sans-serif' },
  { family: 'Rubik', variants: ['300', '400', '500', '600', '700'], category: 'sans-serif' },
  { family: 'Work Sans', variants: ['300', '400', '500', '600', '700'], category: 'sans-serif' },
  { family: 'DM Sans', variants: ['400', '500', '700'], category: 'sans-serif' },
  { family: 'Manrope', variants: ['300', '400', '500', '600', '700'], category: 'sans-serif' },
  { family: 'Plus Jakarta Sans', variants: ['300', '400', '500', '600', '700'], category: 'sans-serif' },
  { family: 'Space Grotesk', variants: ['300', '400', '500', '600', '700'], category: 'sans-serif' },
  { family: 'Outfit', variants: ['300', '400', '500', '600', '700'], category: 'sans-serif' },
  { family: 'Playfair Display', variants: ['400', '500', '600', '700'], category: 'serif' },
  { family: 'Merriweather', variants: ['300', '400', '700'], category: 'serif' },
  { family: 'Lora', variants: ['400', '500', '600', '700'], category: 'serif' },
  { family: 'PT Serif', variants: ['400', '700'], category: 'serif' },
  { family: 'Libre Baskerville', variants: ['400', '700'], category: 'serif' },
  { family: 'Source Serif 4', variants: ['300', '400', '600', '700'], category: 'serif' },
  { family: 'DM Serif Display', variants: ['400'], category: 'serif' },
  { family: 'Fira Code', variants: ['300', '400', '500', '600', '700'], category: 'monospace' },
  { family: 'JetBrains Mono', variants: ['400', '500', '700'], category: 'monospace' },
  { family: 'Source Code Pro', variants: ['300', '400', '500', '600', '700'], category: 'monospace' },
]

export function useGoogleFonts() {
  if (!loaded.value && !loading.value) {
    fonts.value = POPULAR_FONTS
    loaded.value = true
  }

  /**
   * Load a font family into the document using the CSS Font Loading API.
   * Injects a Google Fonts stylesheet link for the family.
   */
  async function loadFont(family: string): Promise<void> {
    if (loadedFamilies.has(family)) return
    loadedFamilies.add(family)

    // Inject a <link> for this font
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = `${GOOGLE_FONTS_CSS}?family=${encodeURIComponent(family)}:wght@300;400;500;600;700&display=swap`
    document.head.appendChild(link)

    // Wait for the font to be available
    try {
      await document.fonts.load(`400 16px "${family}"`)
    } catch {
      // Font may still work via the link tag
    }
  }

  return { fonts, loaded, loadFont }
}
