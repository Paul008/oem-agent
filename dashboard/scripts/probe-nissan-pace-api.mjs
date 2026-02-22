#!/usr/bin/env node

/**
 * Probe Nissan PACE API Gateway for color data
 * Using the discovered public access token endpoint
 */

async function getAccessToken() {
  const url = 'https://apigateway-apn-prod.nissanpace.com/apn1nisprod/public-access-token?brand=NISSAN&dataSourceType=live&market=AU&client=pacepublisher'

  const res = await fetch(url)
  const data = await res.json()

  return data.idToken
}

async function probePaceAPI() {
  console.log('🔑 Obtaining PACE API access token...\n')

  try {
    const token = await getAccessToken()
    console.log(`✅ Token obtained: ${token.slice(0, 50)}...`)

    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    }

    // Try common API endpoints
    const endpoints = [
      'https://ap.nissan-api.net/api/v1/vehicles',
      'https://ap.nissan-api.net/api/v1/models',
      'https://ap.nissan-api.net/api/v1/variants',
      'https://ap.nissan-api.net/api/v1/colors',
      'https://ap.nissan-api.net/api/v1/colours',
      'https://apigateway-apn-prod.nissanpace.com/apn1nisprod/vehicles',
      'https://apigateway-apn-prod.nissanpace.com/apn1nisprod/models',
      'https://apigateway-apn-prod.nissanpace.com/apn1nisprod/configurator/models'
    ]

    console.log(`\n🔍 Probing API endpoints with token...\n`)

    for (const endpoint of endpoints) {
      try {
        const res = await fetch(endpoint, { headers })
        console.log(`${res.ok ? '✅' : '❌'} ${res.status} ${endpoint.split('/').slice(-2).join('/')}`)

        if (res.ok) {
          const data = await res.json()
          console.log(`   Response keys: ${Object.keys(data).join(', ')}`)
          console.log(`   Sample: ${JSON.stringify(data).slice(0, 300)}`)
        }
      } catch (err) {
        console.log(`❌ ERR ${endpoint.split('/').slice(-2).join('/')}: ${err.message}`)
      }
    }

  } catch (err) {
    console.log(`❌ Error: ${err.message}`)
  }
}

probePaceAPI().catch(console.error)
