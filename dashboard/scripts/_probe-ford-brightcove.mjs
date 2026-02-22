/**
 * Probe Ford Brightcove Playback API from Node.js to verify it works server-side.
 */
const ACCOUNT_ID = '4082198814001'
const POLICY_KEY = 'BCpkADawqM3OA4B-vfeXkwN3iXb7CyA4OXQG3HnV_7QiY4oVvJiq3qZaR9_QEfCSXPT0FcResTPflRZJ6ftutqNfXexdtRjzhA8bfzdRvRt8X6aCpQ2Yd_4rs8G0znPmWcl5gUHnI6zKN0bA'
const VIDEO_ID = '6389171468112'

const resp = await fetch(
  `https://edge.api.brightcove.com/playback/v1/accounts/${ACCOUNT_ID}/videos/${VIDEO_ID}`,
  { headers: { 'Accept': `application/json;pk=${POLICY_KEY}` } }
)

console.log('Status:', resp.status)
const data = await resp.json()
console.log('Name:', data.name)
console.log('Duration:', data.duration, 'ms')
console.log('Poster:', data.poster)

const sources = data.sources || []
const mp4s = sources.filter(s => s.container === 'MP4')
console.log('\nMP4 sources:', mp4s.length)
for (const s of mp4s) {
  console.log(`  ${s.width}x${s.height}: ${s.src?.substring(0, 120)}...`)
}

// Also check if HLS manifest is available (no token needed for some)
const hls = sources.filter(s => s.type === 'application/x-mpegURL' || s.type === 'application/vnd.apple.mpegurl')
console.log('\nHLS sources:', hls.length)
for (const s of hls) {
  console.log(`  ${s.src?.substring(0, 120)}...`)
}
