---
name: oem-sales-rep
description: Conversational AI for OEM product and offer queries. Handles natural language questions about automotive OEM products, offers, and pricing via Slack. Queries Supabase for current data and formats responses with relevant information.
---

# OEM Sales Rep

Conversational AI assistant for querying OEM product and offer information.

## Use Cases

- "What's changed on Ford's site this week?"
- "Show me Kia's current offers"
- "Compare SUV prices across all OEMs"
- "Has Toyota updated their Corolla page?"
- "What are the cheapest electric vehicles available?"

## Prerequisites

- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` for data access
- `ANTHROPIC_API_KEY` for Claude Sonnet responses
- `SLACK_BOT_TOKEN` for posting replies

## How It Works

1. Receives natural language query from Slack
2. Classifies query intent (OEMs, products, offers, timeframes)
3. Queries Supabase for relevant data
4. Generates conversational response using Claude Sonnet
5. Posts formatted response to Slack (threaded if applicable)

## Queryable Data

### Product Fields
- **Basic**: title, subtitle, body_type, fuel_type, availability
- **Pricing**: price_amount, price_currency, price_type, price_qualifier
- **Vehicle Specs**: engine_size, cylinders, transmission, gears, drive, doors, seats
- **Features**: key_features (OEM marketing features like "Apple CarPlay", "Blind Spot Monitor")
- **Metadata**: VIN, registration, odometer, build year, exterior colour, location

### Example Queries
- "What 4-cylinder SUVs are available under $35,000?"
- "Show me vehicles with Apple CarPlay"
- "Compare automatic vs manual transmission options"
- "What electric vehicles have 5+ seats?"

## Input

```json
{
  "query": "What are Toyota's current SUV offers?",
  "user_id": "U123456",
  "channel_id": "C789012",
  "thread_ts": "1234567890.123456"
}
```

## Output

- Slack message with formatted product/offer information
- Threaded response if original message was in a thread
