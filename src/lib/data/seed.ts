import type { Landlord, MaintenanceRequest, Unit, Vendor, WorkOrder } from "./types";

// Synthetic, fictional data used to seed an empty database (and the in-memory
// fallback). No real people, addresses or businesses.

const iso = (hoursAgo: number) => new Date(Date.now() - hoursAgo * 3600_000).toISOString();

export const LANDLORD: Landlord = {
  id: "maple-pine",
  name: "Maple & Pine Rentals",
  contact_name: "Sam Ortiz",
  approval_limit: 400,
};

export function seedUnits(): Unit[] {
  const ts = iso(24 * 400);
  return [
    {
      id: "maple-1a",
      property_name: "Maple Court",
      address: "118 Maple Ct, Springfield",
      unit_label: "1A",
      tenant_name: "Lena Brooks",
      tenant_phone: "555-0101",
      tenant_email: "lena.brooks@example.com",
      appliances: [
        { type: "range/stove", fuel: "gas", age_years: 9 },
        { type: "water heater", fuel: "gas", age_years: 6 },
      ],
      shutoffs: "Gas: meter on the east side of the building, valve handle turns 1/4. Water: under kitchen sink and at the basement main (unit-labelled).",
      access_notes: "Has a cat; keep the door closed. Prefers texts.",
      created_at: ts,
    },
    {
      id: "maple-1b",
      property_name: "Maple Court",
      address: "118 Maple Ct, Springfield",
      unit_label: "1B",
      tenant_name: "Omar Haddad",
      tenant_phone: "555-0102",
      tenant_email: "omar.h@example.com",
      appliances: [{ type: "range/stove", fuel: "electric", age_years: 4 }],
      shutoffs: "Water: under each sink; bathroom main behind the access panel in the hall closet.",
      access_notes: "Works nights — schedule visits after 1pm.",
      created_at: ts,
    },
    {
      id: "maple-2a",
      property_name: "Maple Court",
      address: "118 Maple Ct, Springfield",
      unit_label: "2A",
      tenant_name: "Grace Liu",
      tenant_phone: "555-0103",
      tenant_email: "grace.liu@example.com",
      appliances: [{ type: "electrical panel", age_years: 31, notes: "Original 1993 panel, 100A" }],
      shutoffs: "Breaker panel: kitchen pantry wall. Water: under sinks.",
      access_notes: "Lockbox code on file with Sam.",
      created_at: ts,
    },
    {
      id: "maple-2b",
      property_name: "Maple Court",
      address: "118 Maple Ct, Springfield",
      unit_label: "2B",
      tenant_name: "Diego Ramírez",
      tenant_phone: "555-0104",
      tenant_email: "diego.r@example.com",
      appliances: [{ type: "dishwasher", age_years: 3 }],
      shutoffs: "Water: valves under the kitchen sink (left = hot, right = cold); building main in basement room B-2.",
      access_notes: "Unit 1B is directly below — check for ceiling leaks there after any water issue.",
      created_at: ts,
    },
    {
      id: "pine-3c",
      property_name: "Pine Street Duplex",
      address: "42 Pine St, Springfield",
      unit_label: "3C",
      tenant_name: "Priya Nair",
      tenant_phone: "555-0201",
      tenant_email: "priya.nair@example.com",
      appliances: [{ type: "furnace", fuel: "gas", age_years: 17, notes: "Forced-air, thermostat in hallway" }],
      shutoffs: "Furnace power switch at the top of the basement stairs. Gas: meter behind the side gate.",
      access_notes: "Dog in the backyard — call before entering the side gate.",
      created_at: ts,
    },
    {
      id: "pine-4a",
      property_name: "Pine Street Duplex",
      address: "42 Pine St, Springfield",
      unit_label: "4A",
      tenant_name: "Marcus Bell",
      tenant_phone: "555-0202",
      tenant_email: "marcus.bell@example.com",
      appliances: [
        { type: "dishwasher", age_years: 8 },
        { type: "refrigerator", age_years: 12 },
      ],
      shutoffs: "Water: under kitchen sink; main in the crawlspace hatch by the back door.",
      access_notes: "Any time with 24h notice.",
      created_at: ts,
    },
  ];
}

export function seedVendors(): Vendor[] {
  const both = ["Maple Court", "Pine Street Duplex"];
  return [
    { id: "v-rapid-rooter", name: "Rapid Rooter Plumbing", trades: ["plumbing"], phone: "555-1001", emergency_available: true, callout_fee: 150, hourly_rate: 125, rating: 4.7, preferred: true, service_area: both, notes: "24/7 line. Carries common valves and supply lines." },
    { id: "v-budget-plumb", name: "Budget Pipe & Drain", trades: ["plumbing"], phone: "555-1002", emergency_available: false, callout_fee: 60, hourly_rate: 85, rating: 4.2, preferred: false, service_area: both, notes: "Weekdays only. Good for drips and clogs." },
    { id: "v-bright-electric", name: "BrightLine Electric", trades: ["electrical"], phone: "555-1003", emergency_available: true, callout_fee: 175, hourly_rate: 140, rating: 4.8, preferred: true, service_area: both, notes: "Licensed master electrician; 2h emergency response." },
    { id: "v-cozy-hvac", name: "CozyAir Heating & Cooling", trades: ["hvac", "gas"], phone: "555-1004", emergency_available: true, callout_fee: 160, hourly_rate: 130, rating: 4.5, preferred: true, service_area: both, notes: "Services the Pine St furnace; has the service history." },
    { id: "v-northside-gas", name: "Northside Gas Fitters", trades: ["gas", "plumbing"], phone: "555-1005", emergency_available: true, callout_fee: 200, hourly_rate: 150, rating: 4.6, preferred: false, service_area: ["Maple Court"], notes: "Certified gas fitter. Will not enter until the utility has cleared the site." },
    { id: "v-appliance-pros", name: "Appliance Pros", trades: ["appliance"], phone: "555-1006", emergency_available: false, callout_fee: 89, hourly_rate: 110, rating: 4.4, preferred: true, service_area: both, notes: "Next-day slots usually available." },
    { id: "v-handy-hank", name: "Handy Hank Services", trades: ["general"], phone: "555-1007", emergency_available: false, callout_fee: 0, hourly_rate: 65, rating: 4.6, preferred: true, service_area: both, notes: "Doors, drywall, fixtures, small carpentry." },
    { id: "v-quick-lock", name: "QuickKey Locksmith", trades: ["locksmith"], phone: "555-1008", emergency_available: true, callout_fee: 95, hourly_rate: 90, rating: 4.3, preferred: true, service_area: both, notes: "" },
    { id: "v-green-pest", name: "GreenGuard Pest", trades: ["pest"], phone: "555-1009", emergency_available: false, callout_fee: 120, hourly_rate: 0, rating: 4.5, preferred: true, service_area: both, notes: "Flat-rate treatments." },
  ];
}

export function seedRequests(): MaintenanceRequest[] {
  return [
    {
      id: "req-leak-2b",
      unit_id: "maple-2b",
      channel: "sms",
      message:
        "Hi, there's water coming out from under the kitchen sink and it's spreading across the floor. I put towels down but it keeps coming. What do I do??",
      received_at: iso(0.2),
      status: "new",
    },
    {
      id: "req-gas-1a",
      unit_id: "maple-1a",
      channel: "sms",
      message: "I've been smelling something like rotten eggs near the stove since this morning. Is that normal?",
      received_at: iso(0.5),
      status: "new",
    },
    {
      id: "req-heat-3c",
      unit_id: "pine-3c",
      channel: "email",
      message:
        "Hello, the heat hasn't come on since last night. The thermostat says 58 degrees inside. I tried turning it off and on again. This is the third time this winter.",
      received_at: iso(3),
      status: "new",
    },
    {
      id: "req-spark-2a",
      unit_id: "maple-2a",
      channel: "portal",
      message:
        "The outlet next to my bed sparked when I plugged in my phone charger and now there's a burning smell. I unplugged everything in that room.",
      received_at: iso(1),
      status: "new",
    },
    {
      id: "req-multi-4a",
      unit_id: "pine-4a",
      channel: "email",
      message:
        "The dishwasher isn't draining - there's standing water at the bottom after every cycle. Also, whenever someone has time, the bedroom closet door came off its track.",
      received_at: iso(20),
      status: "new",
    },
    {
      id: "req-drip-1b",
      unit_id: "maple-1b",
      channel: "portal",
      message: "Bathroom sink faucet drips constantly, even when it's turned all the way off. Not urgent.",
      received_at: iso(30),
      status: "new",
    },
    {
      id: "req-fridge-4a",
      unit_id: "pine-4a",
      channel: "sms",
      message: "something is wrong with the fridge",
      received_at: iso(2),
      status: "new",
    },
  ];
}

/** Past, resolved work orders, so the agent can spot repeat issues. */
export function seedHistory(): WorkOrder[] {
  const base = {
    vendor_message: null,
    hazards: [],
    safety_steps: [],
    followup_questions: [],
    needs_approval: false,
    status: "resolved" as const,
  };
  return [
    {
      ...base,
      id: "wo-hist-1",
      request_id: "hist-1",
      unit_id: "pine-3c",
      vendor_id: "v-cozy-hvac",
      category: "No heat",
      trade: "hvac",
      urgency: "urgent",
      respond_within_hours: 24,
      respond_by: iso(24 * 61),
      rationale: "Furnace not igniting.",
      scope: "Replaced flame sensor.",
      estimate_low: 160,
      estimate_high: 290,
      tenant_message: "",
      created_at: iso(24 * 62),
    },
    {
      ...base,
      id: "wo-hist-2",
      request_id: "hist-2",
      unit_id: "pine-3c",
      vendor_id: "v-cozy-hvac",
      category: "No heat",
      trade: "hvac",
      urgency: "urgent",
      respond_within_hours: 24,
      respond_by: iso(24 * 20),
      rationale: "Furnace short-cycling and shutting off.",
      scope: "Cleaned burners, replaced igniter. Tech noted heat exchanger wear; recommended replacement quote (unit is 17 yrs old).",
      estimate_low: 290,
      estimate_high: 420,
      tenant_message: "",
      created_at: iso(24 * 21),
    },
    {
      ...base,
      id: "wo-hist-3",
      request_id: "hist-3",
      unit_id: "pine-4a",
      vendor_id: "v-appliance-pros",
      category: "Dishwasher leak",
      trade: "appliance",
      urgency: "routine",
      respond_within_hours: 168,
      respond_by: iso(24 * 140),
      rationale: "Door gasket leak.",
      scope: "Replaced door gasket.",
      estimate_low: 89,
      estimate_high: 200,
      tenant_message: "",
      created_at: iso(24 * 145),
    },
  ];
}
