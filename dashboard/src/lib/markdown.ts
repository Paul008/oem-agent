/**
 * Minimal markdown-to-HTML renderer for API documentation.
 * Supports: headers, bold, italic, code blocks, inline code, tables, lists, links, paragraphs.
 */
export function renderMarkdown(md: string): string {
  const lines = md.split('\n')
  const html: string[] = []
  let inCodeBlock = false
  let inTable = false
  let inList = false
  let listType: 'ul' | 'ol' = 'ul'

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Code blocks
    if (line.trimStart().startsWith('```')) {
      if (inCodeBlock) {
        html.push('</code></pre>')
        inCodeBlock = false
      }
      else {
        inCodeBlock = true
        html.push('<pre class="bg-muted rounded-lg p-4 overflow-x-auto text-sm my-3"><code>')
      }
      continue
    }
    if (inCodeBlock) {
      html.push(escapeHtml(line))
      html.push('\n')
      continue
    }

    // Close list if line doesn't continue it
    if (inList && !line.match(/^[-*]\s/) && !line.match(/^\d+\.\s/) && line.trim() !== '') {
      html.push(listType === 'ul' ? '</ul>' : '</ol>')
      inList = false
    }

    // Empty line
    if (line.trim() === '') {
      if (inTable) {
        html.push('</tbody></table></div>')
        inTable = false
      }
      if (inList) {
        html.push(listType === 'ul' ? '</ul>' : '</ol>')
        inList = false
      }
      continue
    }

    // Headers
    const headerMatch = line.match(/^(#{1,4})\s+(.*)/)
    if (headerMatch) {
      const level = headerMatch[1].length
      const text = inline(headerMatch[2])
      const sizes: Record<number, string> = {
        1: 'text-2xl font-bold mt-6 mb-3',
        2: 'text-xl font-semibold mt-5 mb-2',
        3: 'text-lg font-medium mt-4 mb-2',
        4: 'text-base font-medium mt-3 mb-1',
      }
      html.push(`<h${level} class="${sizes[level]}">${text}</h${level}>`)
      continue
    }

    // Table rows
    if (line.includes('|') && line.trim().startsWith('|')) {
      const cells = line.split('|').slice(1, -1).map(c => c.trim())

      // Separator row
      if (cells.every(c => /^[-:]+$/.test(c))) continue

      if (!inTable) {
        inTable = true
        html.push('<div class="overflow-x-auto my-3"><table class="w-full text-sm border-collapse">')
        html.push('<thead><tr>')
        cells.forEach(c => html.push(`<th class="border border-border bg-muted px-3 py-2 text-left font-medium">${inline(c)}</th>`))
        html.push('</tr></thead><tbody>')
        continue
      }

      html.push('<tr>')
      cells.forEach(c => html.push(`<td class="border border-border px-3 py-2">${inline(c)}</td>`))
      html.push('</tr>')
      continue
    }

    // Unordered list
    const ulMatch = line.match(/^[-*]\s+(.*)/)
    if (ulMatch) {
      if (!inList) {
        inList = true
        listType = 'ul'
        html.push('<ul class="list-disc list-inside space-y-1 my-2 text-sm">')
      }
      html.push(`<li>${inline(ulMatch[1])}</li>`)
      continue
    }

    // Ordered list
    const olMatch = line.match(/^\d+\.\s+(.*)/)
    if (olMatch) {
      if (!inList) {
        inList = true
        listType = 'ol'
        html.push('<ol class="list-decimal list-inside space-y-1 my-2 text-sm">')
      }
      html.push(`<li>${inline(olMatch[1])}</li>`)
      continue
    }

    // Regular paragraph
    html.push(`<p class="text-sm leading-relaxed my-1.5">${inline(line)}</p>`)
  }

  // Close any open blocks
  if (inCodeBlock) html.push('</code></pre>')
  if (inTable) html.push('</tbody></table></div>')
  if (inList) html.push(listType === 'ul' ? '</ul>' : '</ol>')

  return html.join('\n')
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Process inline markdown: bold, italic, code, links */
function inline(text: string): string {
  return text
    // Inline code
    .replace(/`([^`]+)`/g, '<code class="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">$1</code>')
    // Bold
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-primary underline" target="_blank">$1</a>')
}
