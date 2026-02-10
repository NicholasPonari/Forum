/**
 * Creates the ParliamentBot user and profile for the debate pipeline.
 *
 * Run from forum directory:
 *   npx tsx scripts/create-parliament-bot.ts
 *
 * Loads .env.local from the forum directory if present.
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Outputs the bot's UUID — set this as SYSTEM_BOT_USER_ID in your pipeline env.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

// Load .env.local from forum root if present
const envPath = resolve(process.cwd(), ".env.local");
if (existsSync(envPath)) {
  const content = readFileSync(envPath, "utf8");
  for (const line of content.split("\n")) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (match) {
      const key = match[1];
      const value = match[2].replace(/^["']|["']$/g, "").trim();
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

const url = "https://bkhfmvsykdxazzwgprvd.supabase.co";
const serviceKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJraGZtdnN5a2R4YXp6d2dwcnZkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTQxNTAzOCwiZXhwIjoyMDY2OTkxMDM4fQ.Ok1_b-R5minVVzH9us-3qq7DKJOorTIzpeO_k4rQp28";

if (!url || !serviceKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
  );
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const BOT_EMAIL = "parliament-bot@voxvote.internal";
const BOT_PASSWORD =
  process.env.PARLIAMENT_BOT_PASSWORD ||
  `bot-${Math.random().toString(36).slice(2, 20)}-${Date.now()}`;

async function main() {
  // Check if user already exists (by email)
  const { data: listData } = await supabase.auth.admin.listUsers({
    perPage: 1000,
    page: 1,
  });
  const existing = listData?.users?.find((u) => u.email === BOT_EMAIL);

  let userId: string;

  if (existing) {
    userId = existing.id;
    console.log("Existing ParliamentBot auth user found:", userId);
  } else {
    const { data: createData, error: createError } =
      await supabase.auth.admin.createUser({
        email: BOT_EMAIL,
        password: BOT_PASSWORD,
        email_confirm: true,
        user_metadata: { display_name: "ParliamentBot" },
      });

    if (createError) {
      console.error("Failed to create auth user:", createError.message);
      process.exit(1);
    }
    userId = createData.user.id;
    console.log("Created ParliamentBot auth user:", userId);
  }

  // Upsert profile
  const { error: profileError } = await supabase.from("profiles").upsert(
    {
      id: userId,
      username: "ParliamentBot",
      first_name: "Parliament",
      last_name: "Bot",
      type: "Admin",
    },
    { onConflict: "id" },
  );

  if (profileError) {
    console.error("Failed to upsert profile:", profileError.message);
    process.exit(1);
  }

  console.log("\n--- Success ---");
  console.log("ParliamentBot user ID (use this as SYSTEM_BOT_USER_ID):");
  console.log(userId);
  console.log("\nSet in your pipeline .env:");
  console.log(`SYSTEM_BOT_USER_ID=${userId}`);
}

main();
