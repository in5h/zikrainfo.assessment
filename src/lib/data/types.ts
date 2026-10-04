export const TRADES = ["plumbing", "electrical", "hvac", "gas", "appliance", "locksmith", "general", "pest"] as const;
export type Trade = (typeof TRADES)[number];

export const URGENCIES = ["emergency", "urgent", "routine"] as const;
export type Urgency = (typeof URGENCIES)[number];

export type Landlord = {
  id: string;
  name: string;
  contact_name: string;
  /** Work orders estimated above this need the owner's approval before dispatch. */
  approval_limit: number;
};

export type Appliance = { type: string; fuel?: string; age_years?: number; notes?: string };

export type Unit = {
  id: string;
  property_name: string;
  address: string;
  unit_label: string;
  tenant_name: string;
  tenant_phone: string;
  tenant_email: string;
  appliances: Appliance[];
  /** Where to shut off water / gas / power — given to tenants in emergencies. */
  shutoffs: string;
  access_notes: string;
  created_at: string;
};

export type Vendor = {
  id: string;
  name: string;
  trades: Trade[];
  phone: string;
  emergency_available: boolean;
  callout_fee: number;
  hourly_rate: number;
  rating: number;
  preferred: boolean;
  /** Property names this vendor covers. */
  service_area: string[];
  notes: string;
};

export const REQUEST_STATUSES = ["new", "triaged", "awaiting_tenant", "needs_approval", "dispatched", "resolved"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export type MaintenanceRequest = {
  id: string;
  unit_id: string;
  channel: "sms" | "email" | "portal";
  message: string;
  received_at: string;
  status: RequestStatus;
};

export const WORK_ORDER_STATUSES = ["ready", "awaiting_tenant", "needs_approval", "dispatched", "resolved"] as const;
export type WorkOrderStatus = (typeof WORK_ORDER_STATUSES)[number];

export type WorkOrder = {
  id: string;
  request_id: string;
  unit_id: string;
  vendor_id: string | null;
  category: string;
  trade: Trade;
  urgency: Urgency;
  respond_within_hours: number;
  respond_by: string;
  hazards: string[];
  rationale: string;
  safety_steps: string[];
  scope: string;
  followup_questions: string[];
  estimate_low: number;
  estimate_high: number;
  needs_approval: boolean;
  tenant_message: string;
  vendor_message: string | null;
  status: WorkOrderStatus;
  created_at: string;
};

export type StoredFile = { content: string; mimeType?: string; created_at: string; modified_at: string };

export type Todo = { content: string; status: "pending" | "in_progress" | "completed" };

export type Thread = {
  id: string;
  request_id: string | null;
  /** LangChain StoredMessage[], serialized so the agent can resume with full history. */
  messages: unknown[];
  files: Record<string, StoredFile>;
  todos: Todo[];
  updated_at: string;
};
