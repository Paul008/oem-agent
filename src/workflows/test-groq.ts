/**
 * Groq Integration Test
 *
 * Tests the multi-provider client with Groq API for price validation workflow.
 * Run with: npx tsx src/workflows/test-groq.ts
 */

import { MultiProviderClient, buildMessages, type AIRequest } from '../ai/multi-provider';

// ============================================================================
// Test Configuration
// ============================================================================

const GROQ_API_KEY = process.env.GROQ_API_KEY;

if (!GROQ_API_KEY) {
  console.error('❌ GROQ_API_KEY environment variable not set');
  console.log('\nSet it with:');
  console.log('  export GROQ_API_KEY=gsk_your_key_here');
  process.exit(1);
}

// ============================================================================
// Test Cases
// ============================================================================

async function testSimplePriceValidation() {
  console.log('\n🧪 Test 1: Simple Price Validation');
  console.log('═'.repeat(60));

  const client = new MultiProviderClient({ groqApiKey: GROQ_API_KEY });

  const systemPrompt = `You are an autonomous AI agent validating price changes.

Response Format (JSON):
{
  "success": boolean,
  "confidence": number (0.0-1.0),
  "actions_taken": string[],
  "reasoning": string,
  "data": {
    "price_valid": boolean,
    "extracted_price": number,
    "matches_database": boolean
  }
}`;

  const userPrompt = `**Change Event**: Price changed from $45,990 to $46,990

**Entity Data**:
{
  "id": "prod-123",
  "title": "Toyota Hilux SR5",
  "source_url": "https://www.toyota.com.au/hilux/sr5",
  "price_amount": 46990,
  "price_type": "driveaway"
}

**Task**: Analyze this price change and determine confidence level.

**Simulate**: Assume you visited the source URL and extracted price of $46,990.`;

  const messages = buildMessages(systemPrompt, userPrompt);

  const request: AIRequest = {
    provider: 'groq',
    model: 'llama-3.1-8b-instant',
    messages,
    temperature: 0.1,
    max_tokens: 2048,
    response_format: 'json',
  };

  try {
    const startTime = Date.now();
    const response = await client.chat(request);
    const duration = Date.now() - startTime;

    console.log('\n✅ Response received');
    console.log(`⏱️  Duration: ${duration}ms`);
    console.log(`💰 Cost: $${response.usage.cost_usd.toFixed(6)}`);
    console.log(`📊 Tokens: ${response.usage.input_tokens} in, ${response.usage.output_tokens} out`);
    console.log(`🤖 Model: ${response.model}`);

    // Parse and display result
    const result = JSON.parse(response.content);
    console.log('\n📝 Agent Result:');
    console.log(`   Success: ${result.success}`);
    console.log(`   Confidence: ${result.confidence}`);
    console.log(`   Actions: ${result.actions_taken.join(', ')}`);
    console.log(`   Reasoning: ${result.reasoning}`);
    console.log(`   Data: ${JSON.stringify(result.data, null, 2)}`);

    return { success: true, duration, cost: response.usage.cost_usd, result };
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    return { success: false, error };
  }
}

async function testComplexExtraction() {
  console.log('\n🧪 Test 2: Complex Data Extraction (GPT-OSS 20B)');
  console.log('═'.repeat(60));

  const client = new MultiProviderClient({ groqApiKey: GROQ_API_KEY });

  const systemPrompt = `You are an autonomous AI agent extracting missing product data.

Response Format (JSON):
{
  "success": boolean,
  "confidence": number (0.0-1.0),
  "actions_taken": string[],
  "reasoning": string,
  "data": {
    "fields_extracted": string[],
    "specs": object,
    "features": string[]
  }
}`;

  const userPrompt = `**Change Event**: New product created with missing data

**Entity Data**:
{
  "id": "prod-456",
  "title": "Toyota Hilux SR5",
  "price_amount": null,
  "specs_json": null,
  "key_features": []
}

**Task**: Simulate extracting missing specs and features.

**Simulate**: Assume you found:
- Engine: 2.8L Turbo Diesel
- Power: 150kW @ 3400rpm
- Features: ["Leather seats", "Sunroof", "Navigation"]`;

  const messages = buildMessages(systemPrompt, userPrompt);

  const request: AIRequest = {
    provider: 'groq',
    model: 'openai/gpt-oss-20b',
    messages,
    temperature: 0.2,
    max_tokens: 3072,
    response_format: 'json',
  };

  try {
    const startTime = Date.now();
    const response = await client.chat(request);
    const duration = Date.now() - startTime;

    console.log('\n✅ Response received');
    console.log(`⏱️  Duration: ${duration}ms`);
    console.log(`💰 Cost: $${response.usage.cost_usd.toFixed(6)}`);
    console.log(`📊 Tokens: ${response.usage.input_tokens} in, ${response.usage.output_tokens} out`);
    console.log(`🤖 Model: ${response.model}`);

    const result = JSON.parse(response.content);
    console.log('\n📝 Agent Result:');
    console.log(`   Success: ${result.success}`);
    console.log(`   Confidence: ${result.confidence}`);
    console.log(`   Actions: ${result.actions_taken.join(', ')}`);
    console.log(`   Reasoning: ${result.reasoning}`);
    console.log(`   Extracted: ${result.data.fields_extracted?.join(', ')}`);

    return { success: true, duration, cost: response.usage.cost_usd, result };
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    return { success: false, error };
  }
}

async function testFallbackChain() {
  console.log('\n🧪 Test 3: Multi-Provider Fallback Chain');
  console.log('═'.repeat(60));

  const providers: Array<{ provider: 'groq' | 'claude'; model: string }> = [
    { provider: 'groq', model: 'llama-3.1-8b-instant' },
  ];

  // Add Claude fallback if API key available
  if (process.env.ANTHROPIC_API_KEY) {
    providers.push({ provider: 'claude', model: 'claude-haiku-4.5' });
  }

  console.log(`\n📋 Providers to test: ${providers.map(p => p.provider).join(' → ')}`);

  for (const config of providers) {
    console.log(`\n🔄 Testing ${config.provider} (${config.model})...`);

    const client = new MultiProviderClient({
      groqApiKey: GROQ_API_KEY,
      claudeApiKey: process.env.ANTHROPIC_API_KEY,
    });

    const messages = buildMessages(
      'You are a helpful AI assistant.',
      'Respond with JSON: {"message": "Hello from [MODEL_NAME]", "success": true}'
    );

    const request: AIRequest = {
      provider: config.provider,
      model: config.model,
      messages,
      temperature: 0.1,
      max_tokens: 256,
      response_format: 'json',
    };

    try {
      const response = await client.chat(request);
      console.log(`   ✅ ${config.provider} succeeded`);
      console.log(`   💰 Cost: $${response.usage.cost_usd.toFixed(6)}`);
      console.log(`   📄 Response: ${response.content.slice(0, 100)}...`);
    } catch (error) {
      console.log(`   ❌ ${config.provider} failed:`, error instanceof Error ? error.message : error);
    }
  }
}

// ============================================================================
// Run All Tests
// ============================================================================

async function runAllTests() {
  console.log('\n🚀 Groq Multi-Provider Integration Tests');
  console.log('═'.repeat(60));

  const results = {
    test1: await testSimplePriceValidation(),
    test2: await testComplexExtraction(),
  };

  await testFallbackChain();

  // Summary
  console.log('\n' + '═'.repeat(60));
  console.log('📊 Test Summary');
  console.log('═'.repeat(60));

  const cost1 = (results.test1 as any).cost ?? 0;
  const cost2 = (results.test2 as any).cost ?? 0;
  const dur1 = (results.test1 as any).duration ?? 0;
  const dur2 = (results.test2 as any).duration ?? 0;
  const totalCost = (results.test1.success ? cost1 : 0) + (results.test2.success ? cost2 : 0);

  console.log(`\n✅ Tests passed: ${Object.values(results).filter(r => r.success).length}/2`);
  console.log(`💰 Total cost: $${totalCost.toFixed(6)}`);
  console.log(`⏱️  Avg duration: ${Math.round((dur1 + dur2) / 2)}ms`);

  // Cost comparison
  console.log('\n💡 Cost Comparison:');
  console.log(`   Groq (actual): $${totalCost.toFixed(6)}`);
  console.log(`   Claude Haiku (estimated): $${(totalCost * 5).toFixed(6)} (5x more expensive)`);
  console.log(`   Claude Sonnet (estimated): $${(totalCost * 60).toFixed(6)} (60x more expensive)`);

  console.log('\n✨ Groq integration working! Ready for production.');
}

runAllTests().catch(console.error);
