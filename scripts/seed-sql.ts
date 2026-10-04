/** Prints SQL that seeds the city catalog (same data the app seeds on first request). */
import { CITIES, seedPlaces } from "../src/lib/data/seed";

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const arr = (xs: string[]) => `array[${xs.map(q).join(",")}]::text[]`;
const out: string[] = [];
out.push(
  `insert into public.cities (id,name,country,center,tagline,transit_cost) values\n` +
    CITIES.map((c) => `(${q(c.id)},${q(c.name)},${q(c.country)},array[${c.center[0]},${c.center[1]}]::double precision[],${q(c.tagline)},${c.transit_cost})`).join(",\n") +
    `\non conflict (id) do nothing;`
);
out.push(
  `insert into public.places (id,city_id,name,category,interests,lat,lng,neighborhood,hours,duration_min,cost,rating,meals,blurb) values\n` +
    seedPlaces()
      .map(
        (p) =>
          `(${q(p.id)},${q(p.city_id)},${q(p.name)},${q(p.category)},${arr(p.interests)},${p.lat},${p.lng},${q(p.neighborhood)},${q(JSON.stringify(p.hours))}::jsonb,${p.duration_min},${p.cost},${p.rating},${p.meals ? arr(p.meals) : "null"},${q(p.blurb)})`
      )
      .join(",\n") +
    `\non conflict (id) do nothing;`
);
console.log(out.join("\n\n"));
