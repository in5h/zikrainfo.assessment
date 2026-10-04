import type { Landlord, Trade, Unit, Urgency, Vendor } from "@/lib/data/types";

/**
 * Deterministic triage rules. The model reads the tenant's message and proposes
 * hazards with verbatim evidence; this code decides urgency, response window,
 * safety instructions, cost range and whether the owner must approve. It also
 * runs a keyword safety net that can only escalate, never downgrade, so a model
 * that misses "rotten eggs" can't under-triage a gas leak.
 */

export const HAZARDS = [
  "gas_odor",
  "carbon_monoxide_alarm",
  "fire_or_smoke",
  "active_water_leak",
  "sewage_backup",
  "electrical_sparking_or_burning",
  "no_heat",
  "no_water",
  "no_hot_water",
  "lockout",
  "security_breach",
  "appliance_failure",
  "minor_leak_or_drip",
  "minor_repair",
  "pest",
  "unclear",
] as const;
export type Hazard = (typeof HAZARDS)[number];

type Rule = {
  urgency: Urgency;
  hours: number;
  trade?: Trade;
  /** Shown to the tenant first, before anything else. */
  safety: (u: Unit) => string[];
  /** A tenant message for this hazard must match this, so the safety step can't be dropped. */
  mustSay?: RegExp;
  call911?: boolean;
};

export const RULES: Record<Hazard, Rule> = {
  gas_odor: {
    urgency: "emergency",
    hours: 1,
    trade: "gas",
    call911: true,
    mustSay: /\bleave\b/i,
    safety: () => [
      "Leave the unit now and keep the door open behind you.",
      "Don't switch lights or appliances on or off, light anything, or use your phone inside.",
      "Once outside, call the gas utility's emergency line (or 911).",
      "Don't go back in until the utility says it's safe.",
    ],
  },
  carbon_monoxide_alarm: {
    urgency: "emergency",
    hours: 1,
    trade: "hvac",
    call911: true,
    mustSay: /\b(leave|911)\b/i,
    safety: () => ["Get everyone (and pets) outside right away.", "Call 911 from outside.", "Don't go back in until responders clear the unit."],
  },
  fire_or_smoke: {
    urgency: "emergency",
    hours: 1,
    trade: "electrical",
    call911: true,
    mustSay: /\b911\b/i,
    safety: () => ["If there is fire or smoke, get out and call 911 now."],
  },
  active_water_leak: {
    urgency: "emergency",
    hours: 2,
    trade: "plumbing",
    mustSay: /\bshut\b|\bturn off\b/i,
    safety: (u) => [
      `Shut off the water at the nearest valve. Shutoff locations: ${u.shutoffs}`,
      "Keep electronics and cords away from the water. Don't touch outlets near wet areas.",
      "Move valuables off the floor and take a few photos of the damage.",
    ],
  },
  sewage_backup: {
    urgency: "emergency",
    hours: 4,
    trade: "plumbing",
    mustSay: /\b(stop|don'?t) (using|use|flush)/i,
    safety: () => ["Stop using all sinks, toilets and showers until the plumber arrives.", "Keep everyone, including pets, away from the affected area."],
  },
  electrical_sparking_or_burning: {
    urgency: "emergency",
    hours: 2,
    trade: "electrical",
    mustSay: /\bbreaker\b|\bdon'?t use\b|\bdo not use\b/i,
    safety: (u) => [
      "Don't use that outlet or anything plugged into it.",
      `If it's safe to reach, switch off the breaker for that room. Shutoff locations: ${u.shutoffs}`,
      "If you see smoke or flames, leave and call 911.",
    ],
  },
  no_heat: { urgency: "urgent", hours: 24, trade: "hvac", safety: () => [] },
  no_water: { urgency: "urgent", hours: 12, trade: "plumbing", safety: () => [] },
  no_hot_water: { urgency: "urgent", hours: 24, trade: "plumbing", safety: () => [] },
  lockout: { urgency: "urgent", hours: 4, trade: "locksmith", safety: () => [] },
  security_breach: { urgency: "urgent", hours: 24, trade: "locksmith", safety: () => [] },
  appliance_failure: { urgency: "urgent", hours: 48, trade: "appliance", safety: () => [] },
  minor_leak_or_drip: { urgency: "routine", hours: 168, trade: "plumbing", safety: () => [] },
  minor_repair: { urgency: "routine", hours: 168, trade: "general", safety: () => [] },
  pest: { urgency: "routine", hours: 168, trade: "pest", safety: () => [] },
  unclear: { urgency: "urgent", hours: 48, safety: () => [] },
};

/** Keyword safety net: patterns that force a hazard even if the model missed it. */
const SAFETY_NET: { hazard: Hazard; pattern: RegExp }[] = [
  { hazard: "gas_odor", pattern: /rotten eggs?|smell(s|ing)? (of |like )?gas|gas smell|sulfur|sulphur/i },
  { hazard: "carbon_monoxide_alarm", pattern: /carbon monoxide|\bco (alarm|detector)|co2? alarm/i },
  { hazard: "fire_or_smoke", pattern: /\b(fire|flames?|smoke (coming|is coming|everywhere))\b/i },
  { hazard: "electrical_sparking_or_burning", pattern: /spark(ed|ing|s)?|burning smell|smells? (like )?burning|scorch/i },
  { hazard: "active_water_leak", pattern: /flood(ing|ed)?|water (is )?(everywhere|pouring|gushing|spreading)|spreading across|keeps? coming|burst pipe/i },
  { hazard: "sewage_backup", pattern: /sewage|sewer (backup|smell)|toilet (is )?overflowing/i },
];

const RANK: Record<Urgency, number> = { emergency: 0, urgent: 1, routine: 2 };

const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

/** A quote is verified if, after normalisation, it appears in the tenant's message. */
export function verifyQuote(source: string, quote: string): boolean {
  const q = normalize(quote).replace(/^["'\s]+|["'.\s]+$/g, "");
  return q.length >= 4 && normalize(source).includes(q);
}

export type ProposedIssue = {
  summary: string;
  trade: Trade;
  hazards: Hazard[];
  evidence: string[];
  indoor_temp_f?: number | null;
};

export type Classification = {
  ok: boolean;
  problems: string[];
  urgency: Urgency;
  respond_within_hours: number;
  trade: Trade;
  hazards: Hazard[];
  escalated_by_safety_net: Hazard[];
  call_911_or_utility: boolean;
  safety_steps: string[];
  needs_followup: boolean;
  rationale: string;
};

export function classify(message: string, unit: Unit, issue: ProposedIssue): Classification {
  const problems: string[] = [];
  const unverified = issue.evidence.filter((q) => !verifyQuote(message, q));
  if (unverified.length) {
    problems.push(
      `Evidence not found verbatim in the tenant's message: ${unverified.map((q) => JSON.stringify(q)).join(", ")}. Quote the message exactly.`
    );
  }
  if (!issue.evidence.length && !issue.hazards.includes("unclear")) {
    problems.push("Give at least one verbatim quote from the tenant's message, or use hazard 'unclear'.");
  }
  if (!issue.hazards.length) problems.push("Pick at least one hazard (use 'unclear' if the message is too vague).");

  // The safety net only matters for hazards the model didn't already name.
  const hazards = new Set<Hazard>(issue.hazards);
  const escalated: Hazard[] = [];
  for (const { hazard, pattern } of SAFETY_NET) {
    if (pattern.test(message) && !hazards.has(hazard)) {
      hazards.add(hazard);
      escalated.push(hazard);
    }
  }

  const reasons: string[] = [];
  let urgency: Urgency = "routine";
  let hours = 168;
  if (hazards.has("no_heat") && issue.indoor_temp_f != null && issue.indoor_temp_f < 55) {
    urgency = "emergency";
    hours = 4;
    reasons.push(`no heat with indoor temperature ${issue.indoor_temp_f}°F (below 55°F) → emergency, 4h`);
  }
  for (const h of hazards) {
    const r = RULES[h];
    if (RANK[r.urgency] < RANK[urgency] || (r.urgency === urgency && r.hours < hours)) {
      urgency = r.urgency;
      hours = r.hours;
    }
    reasons.push(`${h} → ${r.urgency}, respond within ${r.hours}h`);
  }

  // Life-safety hazards decide the trade; otherwise trust the model's trade.
  const lead = [...hazards].sort((a, b) => RANK[RULES[a].urgency] - RANK[RULES[b].urgency] || RULES[a].hours - RULES[b].hours)[0];
  const trade = (lead && RULES[lead].urgency === "emergency" && RULES[lead].trade) || issue.trade;

  const safety_steps = [...new Set([...hazards].flatMap((h) => RULES[h].safety(unit)))];
  const call_911_or_utility = [...hazards].some((h) => RULES[h].call911);
  if (escalated.length) reasons.push(`safety net escalated: ${escalated.join(", ")} (keyword match in tenant message)`);

  return {
    ok: problems.length === 0,
    problems,
    urgency,
    respond_within_hours: hours,
    trade,
    hazards: [...hazards],
    escalated_by_safety_net: escalated,
    call_911_or_utility,
    safety_steps,
    needs_followup: hazards.has("unclear"),
    rationale: reasons.join("; "),
  };
}

// --------------------------------------------------------------- vendors ----

/** Typical labour hours per trade: [low, high]. */
const TYPICAL_HOURS: Record<Trade, [number, number]> = {
  plumbing: [1, 3],
  electrical: [1, 3],
  hvac: [1, 3],
  gas: [1, 3],
  appliance: [1, 2],
  locksmith: [0.5, 1],
  general: [1, 2],
  pest: [1, 1],
};

export type RankedVendor = {
  vendor_id: string;
  name: string;
  phone: string;
  rating: number;
  preferred: boolean;
  emergency_available: boolean;
  estimate_low: number;
  estimate_high: number;
  reasons: string[];
};

export function estimate(v: Vendor, trade: Trade, urgency: Urgency) {
  const [lo, hi] = TYPICAL_HOURS[trade];
  const rate = urgency === "emergency" ? v.hourly_rate * 1.5 : v.hourly_rate; // after-hours premium
  return { low: Math.round(v.callout_fee + rate * lo), high: Math.round(v.callout_fee + rate * hi) };
}

/**
 * Rank eligible vendors. Preferred + rating matter most; for non-emergencies a
 * vendor whose estimate would exceed the owner's approval limit sinks below
 * ones that don't, so routine jobs don't need approval when a cheaper option exists.
 */
export function rankVendors(vendors: Vendor[], unit: Unit, trade: Trade, urgency: Urgency, approvalLimit = Infinity): RankedVendor[] {
  return vendors
    .filter((v) => v.trades.includes(trade) && v.service_area.includes(unit.property_name))
    .filter((v) => urgency !== "emergency" || v.emergency_available)
    .map((v) => {
      const e = estimate(v, trade, urgency);
      const reasons = [
        v.preferred ? "preferred vendor" : null,
        `${v.rating}★`,
        urgency === "emergency" ? "24/7 emergency" : null,
        `est. $${e.low}–$${e.high}${urgency === "emergency" ? " (after-hours rate)" : ""}`,
        v.notes || null,
      ].filter(Boolean) as string[];
      const overLimit = urgency !== "emergency" && e.high > approvalLimit;
      if (overLimit) reasons.push(`over $${approvalLimit} approval limit`);
      return { v, e, reasons, score: (v.preferred ? 2 : 0) + v.rating - e.high / 2000 - (overLimit ? 5 : 0) };
    })
    .sort((a, b) => b.score - a.score)
    .map(({ v, e, reasons }) => ({
      vendor_id: v.id,
      name: v.name,
      phone: v.phone,
      rating: v.rating,
      preferred: v.preferred,
      emergency_available: v.emergency_available,
      estimate_low: e.low,
      estimate_high: e.high,
      reasons,
    }));
}

/**
 * Emergencies are dispatched right away (life safety and protecting the
 * property come first) and the owner is notified. Anything else above the
 * owner's limit waits for approval.
 */
export function needsApproval(landlord: Landlord, urgency: Urgency, estimateHigh: number) {
  return urgency !== "emergency" && estimateHigh > landlord.approval_limit;
}

// --------------------------------------------------------------- messages ----

type LintRule = { category: string; pattern: RegExp; guidance: string; audience?: "tenant" | "vendor" };

const MESSAGE_RULES: LintRule[] = [
  {
    category: "liability",
    pattern: /\b(we('| wi)ll (pay|reimburse|cover|replace) (for )?(your|any)|our fault|we('re| are) (liable|responsible for (the |your )?damage)|compensat\w*)/i,
    guidance: "Don't admit fault or promise reimbursement; say the owner will review any damage.",
  },
  {
    category: "rent promise",
    pattern: /\b(rent (credit|reduction|discount|abatement)|(waive|reduce|lower)\w* (your )?rent|refund)\b/i,
    guidance: "Rent credits are the owner's decision. Leave them out of triage messages.",
  },
  {
    category: "guarantee",
    pattern: /\b(guarantee\w*|promise\w*|definitely (be )?(there|fixed)|will (be )?fixed (today|tonight))\b/i,
    guidance: "Give the target response window instead of a guarantee.",
  },
  {
    category: "blame",
    pattern: /\b(your fault|you (caused|broke|damaged)|negligen\w*|misuse)\b/i,
    guidance: "Don't speculate about cause or blame the tenant. Describe next steps only.",
  },
  {
    category: "fair housing",
    pattern: /\b(kids|children|pregnan\w*|religio\w*|disab\w*|race|ethnic\w*|national origin|immigra\w*|accent)\b/i,
    guidance: "Keep messages about the repair. Don't reference protected characteristics (Fair Housing Act).",
  },
];

export type MessageFlag = { category: string; match: string; excerpt: string; guidance: string };

export function lintMessage(text: string, audience: "tenant" | "vendor", unit?: Unit): MessageFlag[] {
  const flags: MessageFlag[] = [];
  for (const rule of MESSAGE_RULES) {
    if (rule.audience && rule.audience !== audience) continue;
    for (const m of text.matchAll(new RegExp(rule.pattern.source, "gi"))) {
      const i = m.index ?? 0;
      flags.push({
        category: rule.category,
        match: m[0],
        excerpt: text.slice(Math.max(0, i - 40), i + m[0].length + 40).replace(/\s+/g, " "),
        guidance: rule.guidance,
      });
    }
  }
  if (audience === "vendor" && unit && text.toLowerCase().includes(unit.tenant_email.toLowerCase())) {
    flags.push({
      category: "privacy",
      match: unit.tenant_email,
      excerpt: unit.tenant_email,
      guidance: "Vendors get the tenant's first name and phone for scheduling only. Remove the email.",
    });
  }
  return flags;
}

/** Hazards whose required safety instruction is missing from the tenant message. */
export function missingSafety(tenantMessage: string, hazards: Hazard[]): Hazard[] {
  return hazards.filter((h) => RULES[h].mustSay && !RULES[h].mustSay!.test(tenantMessage));
}
