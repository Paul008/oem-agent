/**
 * Performance & Stress Tests
 *
 * Tests concurrent requests, error handling, large payloads, and edge cases
 */

import { MultiProviderClient, buildMessages } from '../ai/multi-provider';

const GROQ_API_KEY = process.env.GROQ_API_KEY;

if (!GROQ_API_KEY) {
  console.error('❌ GROQ_API_KEY environment variable not set');
  process.exit(1);
}

async function runPerformanceTests() {
  console.log('⚡ Performance & Stress Tests\n');

  const client = new MultiProviderClient({ groqApiKey: GROQ_API_KEY });

  // Test 1: Concurrent requests
  console.log('🧪 Test 1: Concurrent Request Handling');
  const requests = Array.from({ length: 5 }, (_, i) => {
    const messages = buildMessages('You are a test agent. Respond with {"status": "ok"}', `Request ${i + 1}`);
    return client.chat({
      provider: 'groq',
      model: 'llama-3.1-8b-instant',
      messages,
      temperature: 0.1,
      max_tokens: 100,
      response_format: 'json',
    });
  });

  const start = Date.now();
  try {
    const results = await Promise.all(requests);
    const duration = Date.now() - start;
    const totalCost = results.reduce((sum, r) => sum + r.usage.cost_usd, 0);
    console.log(`  ✅ Concurrent requests: 5 completed in ${duration}ms`);
    console.log(`  💰 Total cost: $${totalCost.toFixed(6)}`);
    console.log(`  ⏱️  Avg latency: ${Math.round(duration / 5)}ms per request`);
  } catch (error) {
    console.log('  ❌ Concurrent request test failed:', error instanceof Error ? error.message : error);
  }

  // Test 2: Error handling (invalid model)
  console.log('\n🧪 Test 2: Error Handling (Invalid Model)');
  try {
    await client.chat({
      provider: 'groq',
      model: 'invalid-model',
      messages: buildMessages('test', 'test'),
      temperature: 0.1,
      max_tokens: 100,
    });
    console.log('  ❌ Should have thrown error for invalid model');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log('  ✅ Correctly caught error:', message.substring(0, 80) + '...');
  }

  // Test 3: Large token handling
  console.log('\n🧪 Test 3: Large Token Handling');
  const largePrompt = 'Analyze this data: ' + Array(500).fill('test data point ').join('');
  try {
    const response = await client.chat({
      provider: 'groq',
      model: 'llama-3.1-8b-instant',
      messages: buildMessages('You are a data analyzer. Respond with {"analysis": "complete"}', largePrompt),
      temperature: 0.1,
      max_tokens: 500,
      response_format: 'json',
    });
    console.log(`  ✅ Large prompt handled: ${response.usage.input_tokens} tokens in`);
    console.log(`  💰 Cost: $${response.usage.cost_usd.toFixed(6)}`);
  } catch (error) {
    console.log('  ❌ Large prompt test failed:', error instanceof Error ? error.message : error);
  }

  // Test 4: JSON response validation
  console.log('\n🧪 Test 4: JSON Response Format Validation');
  try {
    const response = await client.chat({
      provider: 'groq',
      model: 'llama-3.1-8b-instant',
      messages: buildMessages(
        'You are a test agent. Respond with valid JSON only.',
        'Return: {"status": "ok", "value": 123}'
      ),
      temperature: 0.1,
      max_tokens: 100,
      response_format: 'json',
    });

    const parsed = JSON.parse(response.content);
    console.log('  ✅ Valid JSON response:', JSON.stringify(parsed));
  } catch (error) {
    console.log('  ⚠️  JSON parsing issue:', error instanceof Error ? error.message : error);
  }

  // Test 5: Different model comparison
  console.log('\n🧪 Test 5: Model Performance Comparison');
  const models = [
    { name: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B' },
    { name: 'openai/gpt-oss-20b', label: 'GPT-OSS 20B' },
  ];

  for (const model of models) {
    try {
      const start = Date.now();
      const response = await client.chat({
        provider: 'groq',
        model: model.name,
        messages: buildMessages('You are a test agent.', 'Respond with {"test": "complete"}'),
        temperature: 0.1,
        max_tokens: 100,
        response_format: 'json',
      });
      const duration = Date.now() - start;
      console.log(`  ✅ ${model.label}: ${duration}ms, $${response.usage.cost_usd.toFixed(6)}`);
    } catch (error) {
      console.log(`  ❌ ${model.label} failed:`, error instanceof Error ? error.message : error);
    }
  }

  console.log('\n✅ Performance tests completed');
}

runPerformanceTests().catch(console.error);
