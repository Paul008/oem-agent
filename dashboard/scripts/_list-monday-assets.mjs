const res = await fetch("https://api.monday.com/v2", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": "eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjExMTU2MTI1NSwiYWFpIjoxMSwidWlkIjo1NzQxNzUsImlhZCI6IjIwMjEtMDUtMjdUMTI6MjI6MDAuMDAwWiIsInBlciI6Im1lOndyaXRlIiwiYWN0aWQiOjIyOTIyNCwicmduIjoidXNlMSJ9.ezQH-YElr0wqgirNHIRcRYApXZb0FOg_mqt0l_cO8lc",
    "API-Version": "2024-10",
  },
  body: JSON.stringify({ query: "query { boards(ids: [15373501]) { items_page(limit: 100) { items { id name assets { id name file_extension file_size } } } } }" }),
});
const d = await res.json();
if (d.errors) { console.error("ERRORS:", JSON.stringify(d.errors)); process.exit(1); }
const items = d.data.boards[0].items_page.items;
console.log(`Total items: ${items.length}`);
let withAssets = 0;
for (const item of items) {
  if (item.assets && item.assets.length > 0) {
    withAssets++;
    console.log(`${item.id} | ${item.name} | ${item.assets.length} assets`);
    for (const a of item.assets) {
      console.log(`  - ${a.name} (.${a.file_extension}, ${Math.round(a.file_size/1024/1024*10)/10}MB)`);
    }
  }
}
console.log(`Items with assets: ${withAssets}`);
