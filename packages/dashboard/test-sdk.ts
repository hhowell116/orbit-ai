// SDK validation script
// 1. Start opencode serve on port 4096 first:
//    OPENCODE_SERVER_PASSWORD=testpass123 opencode serve --port 4096 --hostname 127.0.0.1
// 2. Then run this:
//    bun run test-sdk.ts

import { createOpencodeClient } from "@opencode-ai/sdk";

const client = createOpencodeClient({
  baseUrl: "http://localhost:4096",
  auth: { username: "opencode", password: "testpass123" },
});

async function main() {
  console.log("=== OpenCode SDK Validation ===\n");

  // 1. List sessions
  console.log("1. Listing sessions...");
  const { data: sessions } = await client.session.list();
  console.log(`   Found ${sessions?.length ?? 0} session(s)\n`);

  // 2. Create a session
  console.log("2. Creating a new session...");
  const { data: session } = await client.session.create();
  console.log(`   Session created: ${session?.id} (${session?.slug})\n`);

  // 3. List providers
  console.log("3. Listing providers...");
  const { data: providers } = await client.provider.list();
  console.log(`   Found ${providers?.length ?? 0} provider(s)\n`);

  // 4. Get file status
  console.log("4. Getting file status...");
  const { data: files } = await client.file.status();
  console.log(`   Files: ${JSON.stringify(files)?.slice(0, 200)}\n`);

  // 5. Subscribe to events briefly
  console.log("5. Subscribing to SSE events for 3s...");
  const events: string[] = [];
  const abort = new AbortController();

  const eventPromise = (async () => {
    try {
      const result = await client.event.subscribe({ signal: abort.signal });
      if (result && Symbol.asyncIterator in result) {
        for await (const event of result as any) {
          events.push(event?.type || "unknown");
          console.log(`   Event: ${JSON.stringify(event).slice(0, 120)}`);
        }
      }
    } catch (e: any) {
      if (e.name !== "AbortError") console.log(`   Event error: ${e.message}`);
    }
  })();

  setTimeout(() => abort.abort(), 3000);
  await eventPromise;
  console.log(`   Received ${events.length} event(s)\n`);

  // 6. Cleanup
  if (session?.id) {
    console.log("6. Deleting test session...");
    await client.session.delete({ path: { id: session.id } });
    console.log("   Deleted\n");
  }

  console.log("=== Validation complete! ===");
}

main().catch(console.error);
