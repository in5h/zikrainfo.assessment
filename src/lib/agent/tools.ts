import "server-only";
import { tool } from "langchain";
import { z } from "zod";

import { getRepo } from "@/lib/data/repo";
import { TRADES, type RequestStatus, type WorkOrder } from "@/lib/data/types";
import { HAZARDS, classify, estimate, lintMessage, missingSafety, needsApproval, rankVendors } from "./triage";

const json = (v: unknown) => JSON.stringify(v, null, 2);

const issueSchema = z.object({
  summary: z.string().describe("Short category label, e.g. 'Kitchen sink leak'"),
  trade: z.enum(TRADES).describe("Trade best suited to the repair"),
  hazards: z.array(z.enum(HAZARDS)).describe("Every hazard the message describes; 'unclear' if too vague to tell"),
  evidence: z.array(z.string()).describe("Verbatim quotes from the tenant's message supporting the hazards"),
  indoor_temp_f: z.number().nullable().describe("Indoor temperature if the tenant stated one, else null"),
});

async function loadRequest(request_id: string) {
  const repo = getRepo();
  const req = await repo.getRequest(request_id);
  if (!req) return { error: `No request with id "${request_id}".` } as const;
  const unit = await repo.getUnit(req.unit_id);
  if (!unit) return { error: `Unit "${req.unit_id}" not found.` } as const;
  return { req, unit } as const;
}

export const getRequest = tool(
  async ({ request_id }) => {
    const r = await loadRequest(request_id);
    if ("error" in r) return r.error;
    const repo = getRepo();
    const [landlord, existing] = await Promise.all([repo.landlord(), repo.listWorkOrders({ request_id })]);
    return json({
      request: r.req,
      unit: r.unit,
      owner: { name: landlord.name, contact: landlord.contact_name, approval_limit: landlord.approval_limit },
      existing_work_orders: existing.map((w) => ({ id: w.id, category: w.category, urgency: w.urgency, status: w.status })),
    });
  },
  {
    name: "get_request",
    description:
      "Fetch a maintenance request: the tenant's message, the unit (tenant contact, appliances, shutoff locations, access notes), the owner's approval limit, and any work orders already created for it.",
    schema: z.object({ request_id: z.string() }),
  }
);

export const getUnitHistory = tool(
  async ({ unit_id }) => {
    const repo = getRepo();
    const unit = await repo.getUnit(unit_id);
    if (!unit) return `No unit with id "${unit_id}".`;
    const history = await repo.listWorkOrders({ unit_id });
    return json({
      unit: { id: unit.id, property: unit.property_name, unit: unit.unit_label, appliances: unit.appliances, access_notes: unit.access_notes },
      past_work_orders: history.map((w) => ({
        date: w.created_at.slice(0, 10),
        category: w.category,
        trade: w.trade,
        urgency: w.urgency,
        vendor_id: w.vendor_id,
        scope: w.scope,
        cost_range: `$${w.estimate_low}–$${w.estimate_high}`,
        status: w.status,
      })),
    });
  },
  {
    name: "get_unit_history",
    description: "Fetch a unit's appliances (with ages) and its past work orders, to spot repeat failures and end-of-life equipment.",
    schema: z.object({ unit_id: z.string() }),
  }
);

export const classifyUrgency = tool(
  async ({ request_id, issue }) => {
    const r = await loadRequest(request_id);
    if ("error" in r) return r.error;
    const c = classify(r.req.message, r.unit, issue);
    return json({
      ...c,
      next: c.ok
        ? "Classification verified. Use this urgency, response window and trade; put the safety steps first in the tenant message."
        : "Fix the problems and call classify_urgency again.",
    });
  },
  {
    name: "classify_urgency",
    description:
      "Deterministically classify ONE issue from a request. Verifies your evidence quotes against the tenant's message, applies the triage rule table (gas/CO/fire/active leak/sparking = emergency, etc.), runs a keyword safety net that can only escalate, and returns urgency, response window, trade and the safety steps the tenant must get. Call once per distinct issue.",
    schema: z.object({ request_id: z.string(), issue: issueSchema }),
  }
);

export const findVendors = tool(
  async ({ request_id, trade, urgency }) => {
    const r = await loadRequest(request_id);
    if ("error" in r) return r.error;
    const repo = getRepo();
    const [vendors, landlord] = await Promise.all([repo.listVendors(), repo.landlord()]);
    const ranked = rankVendors(vendors, r.unit, trade, urgency, landlord.approval_limit);
    return json({
      approval_limit: landlord.approval_limit,
      vendors: ranked.map((v) => ({ ...v, needs_owner_approval: needsApproval(landlord, urgency, v.estimate_high) })),
      note: ranked.length
        ? "Ranked best first. Estimates use the vendor's callout fee + typical hours for this trade (emergencies at the 1.5× after-hours rate)."
        : "No eligible vendor for this trade/area/urgency. Create the work order without a vendor and tell the owner.",
    });
  },
  {
    name: "find_vendors",
    description:
      "Rank vendors who cover the unit's property for a trade. Emergencies only return 24/7 vendors. Each result has a cost estimate and whether it needs the owner's approval.",
    schema: z.object({
      request_id: z.string(),
      trade: z.enum(TRADES),
      urgency: z.enum(["emergency", "urgent", "routine"]),
    }),
  }
);

export const checkMessage = tool(
  async ({ request_id, audience, text }) => {
    const r = await loadRequest(request_id);
    if ("error" in r) return r.error;
    const flags = lintMessage(text, audience, r.unit);
    return json(flags.length ? { clean: false, flags, next: "Rewrite the flagged parts and check again." } : { clean: true, flags: [] });
  },
  {
    name: "check_message",
    description:
      "Lint a draft message to the tenant or vendor: no liability admissions, rent-credit promises, guarantees, tenant blame, Fair Housing issues, or (for vendors) tenant email addresses.",
    schema: z.object({ request_id: z.string(), audience: z.enum(["tenant", "vendor"]), text: z.string() }),
  }
);

export const createWorkOrder = tool(
  async (input) => {
    const r = await loadRequest(input.request_id);
    if ("error" in r) return r.error;
    const repo = getRepo();
    const { req, unit } = r;

    // Re-derive everything on the server: the model can't save a downgraded
    // urgency, an ineligible vendor, or a message without the safety steps.
    const c = classify(req.message, unit, input.issue);
    if (!c.ok) return json({ saved: false, problems: c.problems });

    const problems: string[] = [];
    const [vendors, landlord] = await Promise.all([repo.listVendors(), repo.landlord()]);
    const eligible = rankVendors(vendors, unit, c.trade, c.urgency, landlord.approval_limit);
    const vendor = input.vendor_id ? vendors.find((v) => v.id === input.vendor_id) : null;
    if (input.vendor_id && !eligible.some((v) => v.vendor_id === input.vendor_id)) {
      problems.push(
        `Vendor "${input.vendor_id}" isn't eligible for ${c.trade} / ${c.urgency} at ${unit.property_name}. Eligible: ${
          eligible.map((v) => v.vendor_id).join(", ") || "none"
        }.`
      );
    }
    if (!c.needs_followup && !input.vendor_id && eligible.length) problems.push("Pick a vendor (see find_vendors).");
    if (c.needs_followup && input.followup_questions.length === 0)
      problems.push("The issue is unclear: add 1–3 follow-up questions for the tenant.");
    if (vendor && !input.vendor_message) problems.push("Write the vendor dispatch message.");

    const missing = missingSafety(input.tenant_message, c.hazards);
    if (missing.length) {
      problems.push(
        `Tenant message is missing required safety instructions for: ${missing.join(", ")}. Lead with: ${c.safety_steps.join(" ")}`
      );
    }
    const flags = [
      ...lintMessage(input.tenant_message, "tenant", unit).map((f) => ({ ...f, audience: "tenant" })),
      ...(input.vendor_message ? lintMessage(input.vendor_message, "vendor", unit).map((f) => ({ ...f, audience: "vendor" })) : []),
    ];
    if (problems.length || flags.length) return json({ saved: false, problems, message_flags: flags });

    const est = vendor ? estimate(vendor, c.trade, c.urgency) : { low: 0, high: 0 };
    const approval = needsApproval(landlord, c.urgency, est.high);
    const status: WorkOrder["status"] = c.needs_followup ? "awaiting_tenant" : approval ? "needs_approval" : "ready";
    const respond_by = new Date(new Date(req.received_at).getTime() + c.respond_within_hours * 3600_000).toISOString();

    if (input.work_order_id) {
      const own = await repo.listWorkOrders({ request_id: req.id });
      if (!own.some((w) => w.id === input.work_order_id))
        return json({ saved: false, problems: [`Work order "${input.work_order_id}" doesn't belong to this request.`] });
    }

    const saved = await repo.saveWorkOrder({
      id: input.work_order_id ?? undefined,
      request_id: req.id,
      unit_id: unit.id,
      vendor_id: vendor?.id ?? null,
      category: input.issue.summary,
      trade: c.trade,
      urgency: c.urgency,
      respond_within_hours: c.respond_within_hours,
      respond_by,
      hazards: c.hazards,
      rationale: c.rationale,
      safety_steps: c.safety_steps,
      scope: input.scope,
      followup_questions: input.followup_questions,
      estimate_low: est.low,
      estimate_high: est.high,
      needs_approval: approval,
      tenant_message: input.tenant_message,
      vendor_message: input.vendor_message,
      status,
    });

    // The request's status reflects its least-finished work order.
    const all = await repo.listWorkOrders({ request_id: req.id });
    const reqStatus: RequestStatus = all.some((w) => w.status === "awaiting_tenant")
      ? "awaiting_tenant"
      : all.some((w) => w.status === "needs_approval")
        ? "needs_approval"
        : "triaged";
    await repo.setRequestStatus(req.id, reqStatus);

    return json({
      saved: true,
      work_order_id: saved.id,
      urgency: saved.urgency,
      respond_by: saved.respond_by,
      status: saved.status,
      estimate: `$${saved.estimate_low}–$${saved.estimate_high}`,
      needs_owner_approval: saved.needs_approval,
      note:
        saved.urgency === "emergency"
          ? "Emergency: the owner can send immediately; approval limits don't block emergencies."
          : "Saved as a draft. Nothing is sent until the owner clicks Send.",
    });
  },
  {
    name: "create_work_order",
    description:
      "Save a work order for ONE issue (call again for each additional issue, or pass work_order_id to revise). The server re-classifies the issue, checks the vendor is eligible, computes the estimate and owner-approval flag, requires the safety steps in the tenant message, and lints both messages. Refuses to save if anything fails. Nothing is sent to anyone.",
    schema: z.object({
      request_id: z.string(),
      work_order_id: z.string().nullable().describe("Existing work order id when revising, else null"),
      issue: issueSchema,
      vendor_id: z.string().nullable().describe("From find_vendors; null only if waiting on tenant answers or no vendor exists"),
      scope: z.string().describe("What the vendor should do, plus what to check (e.g. ceiling of the unit below)"),
      followup_questions: z.array(z.string()).max(3).describe("Questions for the tenant; empty if none needed"),
      tenant_message: z.string().describe("SMS-length reply to the tenant. Safety steps first for emergencies."),
      vendor_message: z.string().nullable().describe("Dispatch message to the vendor; null if no vendor yet"),
    }),
  }
);

export const listOpenWorkOrders = tool(
  async () => {
    const repo = getRepo();
    const [orders, units, vendors, requests] = await Promise.all([
      repo.listWorkOrders(),
      repo.listUnits(),
      repo.listVendors(),
      repo.listRequests(),
    ]);
    const open = orders.filter((w) => w.status !== "resolved");
    return json({
      untriaged_requests: requests
        .filter((r) => r.status === "new")
        .map((r) => ({ request_id: r.id, unit_id: r.unit_id, received_at: r.received_at, message: r.message })),
      open_work_orders: open.map((w) => {
        const u = units.find((x) => x.id === w.unit_id);
        return {
          id: w.id,
          request_id: w.request_id,
          unit: u ? `${u.property_name} ${u.unit_label}` : w.unit_id,
          category: w.category,
          urgency: w.urgency,
          respond_by: w.respond_by,
          status: w.status,
          vendor: vendors.find((v) => v.id === w.vendor_id)?.name ?? null,
          estimate: `$${w.estimate_low}–$${w.estimate_high}`,
          needs_approval: w.needs_approval,
        };
      }),
    });
  },
  {
    name: "list_open_work_orders",
    description: "Portfolio view: untriaged requests and all open work orders with urgency, respond-by deadline, status, vendor and estimate.",
    schema: z.object({}),
  }
);

export const historyTools = [getUnitHistory];
export const allTools = [getRequest, getUnitHistory, classifyUrgency, findVendors, checkMessage, createWorkOrder, listOpenWorkOrders];
