/**
 * Trigger Toyota Browser Sync via Cloudflare API
 *
 * Uses the Cloudflare Workers API to invoke a scheduled event manually.
 */

const ACCOUNT_ID = 'a5b299b3ad15c1b5b895dc66f9357b17';
const SCRIPT_NAME = 'oem-agent';

async function main() {
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  if (!apiToken) {
    console.error('Set CLOUDFLARE_API_TOKEN env var');
    process.exit(1);
  }

  // Get schedules
  const listRes = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/workers/scripts/${SCRIPT_NAME}/schedules`,
    {
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
    }
  );
  const listData = await listRes.json();
  console.log('Schedules:', JSON.stringify(listData, null, 2));

  if (!listData.success || !listData.result?.length) {
    console.error('No schedules found');
    process.exit(1);
  }

  // Find the Toyota schedule (0 3 * * *)
  const toyotaSchedule = listData.result.find((s: any) => s.cron === '0 3 * * *');
  if (!toyotaSchedule) {
    console.error('Toyota schedule not found');
    process.exit(1);
  }

  console.log(`Triggering schedule ${toyotaSchedule.id} (${toyotaSchedule.cron})...`);

  // Trigger it
  const triggerRes = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/workers/scripts/${SCRIPT_NAME}/schedules/${toyotaSchedule.id}/trigger`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
    }
  );
  const triggerData = await triggerRes.json();
  console.log('Trigger result:', JSON.stringify(triggerData, null, 2));
}

main().catch(console.error);
