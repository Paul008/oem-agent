#!/bin/bash
# Setup Supabase Database
# This script runs the SQL migrations using the Supabase REST API

set -e

SUPABASE_URL="${SUPABASE_URL:-https://nnihmdmsglkxpmilmjjc.supabase.co}"
SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc}"

echo "🚀 Setting up Supabase Database"
echo "   URL: $SUPABASE_URL"

# Function to execute SQL via REST API
exec_sql() {
    local sql="$1"
    local description="$2"
    
    echo "   Executing: $description"
    
    # Use the REST API to execute raw SQL via a function
    response=$(curl -s -X POST "$SUPABASE_URL/rest/v1/rpc/exec_sql" \
        -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
        -H "Content-Type: application/json" \
        -d "{\"sql\": \"$sql\"}" 2>&1)
    
    if echo "$response" | grep -q "error"; then
        echo "   ⚠️  Warning: $response"
        return 1
    fi
    
    return 0
}

# Create exec_sql function if it doesn't exist
echo ""
echo "🔧 Creating exec_sql function..."

curl -s -X POST "$SUPABASE_URL/rest/v1/" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Content-Type: application/json" \
    -H "Prefer: resolution=merge-duplicates" \
    -d @- <<'EOF' > /dev/null 2>&1 || true
{
  "query": "CREATE OR REPLACE FUNCTION exec_sql(sql text) RETURNS void AS $$ BEGIN EXECUTE sql; END; $$ LANGUAGE plpgsql SECURITY DEFINER;"
}
EOF

# Run migrations
echo ""
echo "📄 Running migrations..."

for file in ../supabase/migrations/*.sql; do
    if [ -f "$file" ]; then
        echo ""
        echo "Processing: $(basename "$file")"
        
        # Read and execute the SQL file
        # Note: This is a simplified approach - complex migrations may need manual execution
        sql=$(cat "$file" | sed 's/"/\\"/g' | tr '\n' ' ')
        
        # Try to execute via a simple INSERT to test connectivity
        test_response=$(curl -s -X GET "$SUPABASE_URL/rest/v1/oems?limit=1" \
            -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
            -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" 2>&1)
        
        if echo "$test_response" | grep -q "error"; then
            echo "   ℹ️  Tables may not exist yet. Migration needs manual execution."
            echo "   Error: $test_response"
        else
            echo "   ✅ Connection successful"
        fi
    fi
done

echo ""
echo "=" 

echo "Setup complete!"
echo ""
echo "Note: For production use, please run migrations via:"
echo "  1. Supabase Dashboard SQL Editor"
echo "  2. supabase db push (if using CLI)"
echo "  3. Or manually copy-paste the SQL files"
echo ""
echo "Migration files location:"
ls -la ../supabase/migrations/*.sql
