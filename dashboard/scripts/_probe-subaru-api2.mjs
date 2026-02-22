#!/usr/bin/env node
// Probe Subaru Retailer API - check response formats

const API_BASE = 'https://gn6lyzqet4.execute-api.ap-southeast-2.amazonaws.com/Production/api/v1'
const API_KEY = 'w68ewXf97mnPODxXG6ZA4FKhP65wpUK576oLryW9'
const HEADERS = { 'x-api-key': API_KEY, 'Accept': 'application/json' }

// Get first model and variant
const models = await (await fetch(`${API_BASE}/models/`, { headers: HEADERS })).json()
const model = models[0]
console.log('First model:', JSON.stringify(model, null, 2).substring(0, 500))

const variants = await (await fetch(`${API_BASE}/models/${model.id}/variants`, { headers: HEADERS })).json()
console.log('\nFirst variant:', JSON.stringify(variants[0], null, 2).substring(0, 500))

// Try accessories with the first variant
const v = variants[0]
const variantId = v.id || v.variantId
console.log(`\nFetching accessories for variant: ${variantId}`)

const accRes = await fetch(`${API_BASE}/variants/${variantId}/accessories`, { headers: HEADERS })
console.log(`Status: ${accRes.status}`)
const accText = await accRes.text()
console.log(`Response type: ${typeof accText}, length: ${accText.length}`)
console.log(`First 2000 chars:`)
console.log(accText.substring(0, 2000))

// Also try with a different variant
if (variants.length > 1) {
  const v2 = variants[1]
  console.log(`\nFetching accessories for variant: ${v2.id}`)
  const accRes2 = await fetch(`${API_BASE}/variants/${v2.id}/accessories`, { headers: HEADERS })
  const accText2 = await accRes2.text()
  console.log(`Status: ${accRes2.status}, length: ${accText2.length}`)
  console.log(accText2.substring(0, 1000))
}

// Try different model - Forester
const forester = models.find(m => m.name === 'Forester')
if (forester) {
  const fVariants = await (await fetch(`${API_BASE}/models/${forester.id}/variants`, { headers: HEADERS })).json()
  console.log(`\nForester variants: ${fVariants.length}`)
  if (fVariants[0]) {
    console.log('Forester first variant:', JSON.stringify(fVariants[0], null, 2).substring(0, 300))
    const fAccRes = await fetch(`${API_BASE}/variants/${fVariants[0].id}/accessories`, { headers: HEADERS })
    const fAccText = await fAccRes.text()
    console.log(`Forester accessories: ${fAccRes.status}, ${fAccText.length} chars`)
    console.log(fAccText.substring(0, 1500))
  }
}
