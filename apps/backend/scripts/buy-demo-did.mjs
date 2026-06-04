// apps/backend/scripts/buy-demo-did.mjs
// Phase 1 (no args): list available Gdańsk (58) voice DIDs + any approved
// requirement groups. SPENDS NOTHING.
// Phase 2 (BUY=+48... node ...): order that exact number. SPENDS MONEY —
// requires explicit operator go.
// Run: set -a; . ./.env.local; set +a; node apps/backend/scripts/buy-demo-did.mjs
import process from "node:process";

const KEY = process.env.TELNYX_API_KEY;
if (!KEY) throw new Error("Missing TELNYX_API_KEY");
const base = "https://api.telnyx.com/v2";
const h = { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const api = async (method, path, body) => {
  const r = await fetch(`${base}${path}`, {
    method,
    headers: h,
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${method} ${path} -> ${r.status} ${JSON.stringify(j)}`);
  return j;
};

const buy = process.env.BUY;
if (!buy) {
  const avail = await api(
    "GET",
    "/available_phone_numbers?filter[country_code]=PL&filter[national_destination_code]=58&filter[features][]=voice&filter[limit]=10",
  );
  console.log("Available 58-region DIDs:");
  for (const n of avail.data ?? []) {
    const cost = n.cost_information ?? {};
    console.log(
      ` ${n.phone_number}  monthly=${cost.monthly_cost} ${cost.currency} upfront=${cost.upfront_cost}`,
    );
  }
  const groups = await api("GET", "/requirement_groups").catch((e) => {
    console.log(`(requirement_groups lookup failed: ${e.message})`);
    return { data: [] };
  });
  console.log("\nRequirement groups on the account:");
  for (const g of groups.data ?? []) {
    console.log(
      ` ${g.id}  country=${g.country_code} type=${g.phone_number_type} status=${g.status}`,
    );
  }
  console.log(
    "\nTo order: BUY=+4858XXXXXXX [REQ_GROUP=<id>] node apps/backend/scripts/buy-demo-did.mjs",
  );
  process.exit(0);
}

const phone = { phone_number: buy };
if (process.env.REQ_GROUP) phone.requirement_group_id = process.env.REQ_GROUP;
const order = await api("POST", "/number_orders", {
  phone_numbers: [phone],
  customer_reference: "demo-line",
});
console.log("Order:", order.data?.id, "status:", order.data?.status);
console.log("Sub-orders:", JSON.stringify(order.data?.sub_number_orders ?? order.data, null, 2));
console.log("\nADD TO .env.local: TELNYX_DEMO_LINE_NUMBER=" + buy);
