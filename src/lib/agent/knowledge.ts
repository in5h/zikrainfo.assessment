import { DINNER, LUNCH, PACE_LIMITS } from "./itinerary";

/**
 * Domain knowledge, packaged as Deep Agent skills (SKILL.md files with YAML
 * frontmatter). The skills middleware lists them in the system prompt by name
 * and description, and the agent reads a full file only when it needs it
 * (progressive disclosure), so the base prompt stays small.
 */

const paceTable = Object.entries(PACE_LIMITS)
  .map(([pace, l]) => `| ${pace} | ${l.stops} | ${l.walking} min | ${l.end} |`)
  .join("\n");

export const SKILLS: Record<string, string> = {
  "/skills/itinerary-design/SKILL.md": `---
name: itinerary-design
description: How to design a good day-by-day city itinerary — clustering by neighbourhood, timing around opening hours, meals, pacing and budget. Read before drafting any plan.
---
# Itinerary design

## The shape of a good day
1. **One or two neighbourhoods per day.** Cluster stops geographically; long
   cross-town hops waste the day. check_itinerary shows each leg (walk vs transit).
2. **Anchor the day** on the one stop that has the tightest constraint (timed
   tickets, early closing, closed weekdays), then fill around it.
3. **Morning for the big sights**, before crowds and heat. Viewpoints at sunset.
   Nightlife after dinner.
4. **Meals are stops.** Lunch must start between ${LUNCH[0]} and ${LUNCH[1]}, dinner
   between ${DINNER[0]} and ${DINNER[1]}. Pick food places that serve that meal and are
   near the surrounding stops.
5. **Theme each day** in a few words ("Ancient Rome", "Temples of Higashiyama").

## Pace limits (enforced by check_itinerary)
| pace | max stops/day | walking | day ends by |
|---|---|---|---|
${paceTable}

## Budget
- Budget is per person for the whole trip, in USD: entry fees + food + transit hops.
- If over budget, swap a pricey dinner for a cheaper one, or a paid museum for a
  free viewpoint/park that still matches the interests. Don't drop meals.

## Interests
At least half of the non-food stops should match the traveller's interests.
Mix in one "wildcard" highlight per trip if it's iconic.

## Workflow
Draft → check_itinerary → fix every problem → check again → save_itinerary.
Never hand-wave hours or walking times; the checker computes them.
`,

  "/skills/city-lisbon/SKILL.md": `---
name: city-lisbon
description: Local knowledge for Lisbon — neighbourhood clusters, Monday closures, hills and trams, fado, food tips. Read when planning Lisbon.
---
# Lisbon local guide
- **Clusters:** Belém (Tower, Jerónimos, MAAT, Pastéis de Belém) is a half day out west.
  Alfama/Graça (castle, Sé, miradouros, flea market) pair well. Baixa/Chiado/Bairro Alto
  are central and walkable. The Oceanarium (Parque das Nações) is a trip east of its own.
- **Closures:** Belém Tower, Jerónimos and the Tile Museum close on **Mondays**. MAAT and the
  Gulbenkian close on **Tuesdays**. Feira da Ladra is **Tuesdays and Saturdays only**.
- **Hills:** Lisbon is steep. On a relaxed pace, keep Alfama + Graça uphill segments short;
  tram 28 or a tuk-tuk helps.
- **Food:** custard tarts at Pastéis de Belém (go early); Time Out Market is the easy lunch;
  Cervejaria Ramiro for seafood (closed Mondays); a bifana at O Trevo is the budget classic.
- **Evening:** sunset at Senhora do Monte, then fado in Bairro Alto.
- Tip: the Viva Viagem card covers metro, trams and the Santa Justa lift.
`,

  "/skills/city-rome/SKILL.md": `---
name: city-rome
description: Local knowledge for Rome — clusters, Vatican Sunday closure, booking rules, trattoria and aperitivo tips. Read when planning Rome.
---
# Rome local guide
- **Clusters:** Ancient Rome (Colosseum, Forum/Palatine, Capitoline) is one morning.
  Centro Storico (Pantheon, Navona, Campo de' Fiori, Trevi, Spanish Steps) is a walking day.
  Vatican (Museums + St. Peter's) is a full morning across the river. Trastevere is for
  evenings (Gianicolo sunset, dinner, aperitivo).
- **Closures:** the Vatican Museums close on **Sundays**. The Borghese Gallery closes **Mondays**
  and needs a reservation. Campo de' Fiori market is mornings only and closed Sundays.
- **Tickets:** the Colosseum ticket includes the Forum & Palatine; book timed entry ahead.
- **Food:** carbonara at Roscioli or Da Enzo (both busy, so book); Testaccio market for a cheap
  local lunch; Ai Marmi pizza for a budget dinner (closed Wednesdays); gelato at Giolitti.
- **Dress code:** shoulders and knees covered for St. Peter's.
`,

  "/skills/city-kyoto/SKILL.md": `---
name: city-kyoto
description: Local knowledge for Kyoto — east/west clusters, early temple closing times, crowds, Gion etiquette, food tips. Read when planning Kyoto.
---
# Kyoto local guide
- **Clusters:** Higashiyama (Kiyomizu-dera, Sannenzaka, National Museum) flows into Gion in the
  evening. Northern Higashiyama: Ginkaku-ji → Philosopher's Path. Arashiyama (Bamboo Grove,
  Tenryū-ji) is far west, a half day. Fushimi Inari is south; go early. Kinkaku-ji is northwest.
- **Temples close early:** most close 16:00–17:00. Put temples in the morning/early afternoon
  and save Gion, Pontochō and shows for the evening.
- **Closures:** Nijō Castle closes **Tuesdays**; Kyoto National Museum and the Imperial Palace
  close **Mondays**; Ramen Sen no Kaze closes Mondays; Gion Karyo closes Wednesdays.
- **Food:** Nishiki Market for a grazing lunch (stalls wind down ~17:30); ramen for a quick
  dinner; Pontochō for riverside dining; kaiseki at Karyo is a splurge (~$90).
- **Etiquette:** don't photograph maiko up close in Gion; remove shoes where asked.
- Tip: buses are slow at rush hour; the subway + walking is often faster.
`,
};

export function skillFiles(): Record<string, { content: string; mimeType: string; created_at: string; modified_at: string }> {
  const ts = new Date(0).toISOString();
  return Object.fromEntries(
    Object.entries(SKILLS).map(([path, content]) => [path, { content, mimeType: "text/markdown", created_at: ts, modified_at: ts }])
  );
}

export const SYSTEM_PROMPT = `You are Wayfarer, a trip-planning agent. You turn a trip request (city, dates, budget, interests, pace) into a feasible, well-paced day-by-day itinerary, then refine it with the traveller.

## Standard workflow: "plan this trip"
1. Plan your work with write_todos.
2. get_trip. Read the itinerary-design skill and the city's skill (e.g. city-lisbon).
3. Delegate to the **local-expert** subagent (task tool) with the city_id, interests, dates and pace. It returns a shortlist grouped by neighbourhood, with meal spots.
4. Use search_places if you need more detail (hours, meals, cost).
5. Draft the days: cluster by neighbourhood, respect closed weekdays and opening hours, include lunch and dinner, stay within pace and budget.
6. Call **check_itinerary**. Fix every problem it reports and check again. Never estimate times or costs yourself.
7. Call **save_itinerary** with a title, a 2–3 sentence summary and practical tips.
8. Write a short packing/booking checklist to /workspace/<trip_id>/checklist.md.
9. Reply in 3–5 lines: the shape of each day, total cost vs budget, and anything to book ahead. The UI shows the full itinerary and map.

## Refinements ("make day 2 more relaxed", "cheaper dinners", "add more art")
Change only what was asked, check_itinerary, then save_itinerary again (pass pace/budget/interests only if the traveller changed them).

## Rules
- Feasibility beats ambition. If it doesn't fit, cut it and say so.
- Use only places from search_places; never invent venues.
- Be concise and warm.`;

export const LOCAL_EXPERT_PROMPT = `You are a local expert for one city.

Given a city_id, interests, dates and pace:
1. Call search_places (with the interests) once for sights and once with category "food".
2. Return a compact shortlist grouped by neighbourhood:
   - for each neighbourhood: 2–4 sights that match the interests (id, name, why), and 1–2 food places with the meals they serve,
   - flag places closed on any of the trip dates' weekdays,
   - one line suggesting which neighbourhoods pair well on the same day.
Use place ids exactly as returned. Nothing else.`;
