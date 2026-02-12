#!/bin/bash
# Execute Supabase migrations using Management API
# This requires SUPABASE_ACCESS_TOKEN to be set

set -e

PROJECT_REF="nnihmdmsglkxpmilmjjc"
SUPABASE_URL="https://nnihmdmsglkxpmilmjjc.supabase.co"

# Check if access token is available
if [ -z "$SUPABASE_ACCESS_TOKEN" ]; then
    echo "❌ SUPABASE_ACCESS_TOKEN not set"
    echo ""
    echo "To get an access token:"
    echo "  1. Go to https://supabase.com/dashboard/account/tokens"
    echo "  2. Generate a new token"
    echo "  3. Export it: export SUPABASE_ACCESS_TOKEN=your_token"
    exit 1
fi

echo "🚀 Executing Supabase migrations"
echo "   Project: $PROJECT_REF"
echo ""

MIGRATIONS_DIR="supabase/migrations"

for file in $(ls $MIGRATIONS_DIR/*.sql | sort); do
    filename=$(basename "$file")
    echo "📄 Executing: $filename"
    
    # Read SQL content
    sql=$(cat "$file")
    
    # Execute via Management API
    response=$(curl -s -X POST "https://api.supabase.com/v1/projects/$PROJECT_REF/database/query" \
        -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"query\": $(echo "$sql" | jq -R -s .)}" 2>&1)
    
    if echo "$response" | grep -q "error"; then
        echo "   ❌ Error: $response"
        exit 1
    else
        echo "   ✅ Success"
    fi
    echo ""
done

echo "✅ All migrations executed successfully!"
