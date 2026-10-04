export const INTERESTS = ["history", "food", "art", "architecture", "nature", "views", "nightlife", "shopping", "family"] as const;
export type Interest = (typeof INTERESTS)[number];

export const CATEGORIES = ["sight", "museum", "food", "cafe", "viewpoint", "park", "nightlife", "market", "shopping"] as const;
export type Category = (typeof CATEGORIES)[number];

export const PACES = ["relaxed", "balanced", "packed"] as const;
export type Pace = (typeof PACES)[number];

export type City = {
  id: string;
  name: string;
  country: string;
  center: [number, number];
  tagline: string;
  /** Cost of one metro/bus/taxi-share hop, per person, USD. */
  transit_cost: number;
};

export type Hours = {
  /** "HH:MM"; "00:00"–"24:00" means always open. */
  open: string;
  close: string;
  /** Weekdays closed, 0 = Sunday. */
  closed: number[];
};

export type Place = {
  id: string;
  city_id: string;
  name: string;
  category: Category;
  interests: Interest[];
  lat: number;
  lng: number;
  neighborhood: string;
  hours: Hours;
  duration_min: number;
  /** Per person, USD (approximate). */
  cost: number;
  rating: number;
  meals?: ("breakfast" | "lunch" | "dinner")[];
  blurb: string;
};

export type Stop = {
  place_id: string;
  /** "HH:MM". Optional when drafting; check_itinerary fills it in. */
  start?: string;
  note?: string;
};

export type DayPlan = { date: string; theme: string; stops: Stop[] };

export type TripStatus = "draft" | "planned";

export type Trip = {
  id: string;
  city_id: string;
  title: string;
  start_date: string;
  days_count: number;
  budget: number;
  interests: Interest[];
  pace: Pace;
  notes: string;
  status: TripStatus;
  days: DayPlan[];
  summary: string;
  tips: string[];
  total_cost: number;
  created_at: string;
  updated_at: string;
};

export type StoredFile = { content: string; mimeType?: string; created_at: string; modified_at: string };

export type Todo = { content: string; status: "pending" | "in_progress" | "completed" };

export type Thread = {
  id: string;
  trip_id: string | null;
  /** LangChain StoredMessage[], serialized so the agent can resume with full history. */
  messages: unknown[];
  files: Record<string, StoredFile>;
  todos: Todo[];
  updated_at: string;
};
