import type { Candidate, Job } from "./types";

// Synthetic, fictional data used to seed an empty database (and the in-memory
// fallback). No real people or companies.

const now = () => new Date().toISOString();

export const SEED_JOBS: Omit<Job, "created_at">[] = [
  {
    id: "job-backend-payments",
    title: "Senior Backend Engineer, Payments",
    company: "Ledgerly",
    team: "Money Movement",
    location: "Hybrid: Austin, TX (2 days/week in office)",
    comp_range: "$175k–$210k base + equity",
    summary:
      "Own the services that move money between customer wallets, card networks and bank rails. The team runs a double-entry ledger, ACH/RTP payouts and card-issuing webhooks processing ~4M transactions/day.",
    criteria: [
      {
        id: "backend-depth",
        label: "Production backend engineering (5+ yrs, typed language)",
        signals:
          "Has shipped and operated backend services in Go, Java, Kotlin or TypeScript for 5+ years. Owns services end to end, not only features.",
        weight: 3,
        must_have: true,
      },
      {
        id: "payments-domain",
        label: "Payments / money-movement domain",
        signals:
          "Ledgers, double-entry accounting, reconciliation, idempotency keys, card networks, ACH/RTP, PCI scope. Understands why money systems must be correct before fast.",
        weight: 3,
        must_have: true,
      },
      {
        id: "distributed-reliability",
        label: "Distributed-systems reliability",
        signals:
          "Queues/streams (Kafka, SQS), retries with backoff, exactly-once vs at-least-once, outbox pattern, on-call and incident ownership with postmortems.",
        weight: 2,
        must_have: true,
      },
      {
        id: "postgres",
        label: "Postgres data modeling & performance",
        signals:
          "Schema design for high-write workloads, indexing, locking/isolation levels, migrations without downtime, partitioning.",
        weight: 2,
        must_have: false,
      },
      {
        id: "infra",
        label: "Cloud / Kubernetes ownership",
        signals: "Runs their own services on AWS/GCP with Kubernetes or ECS, Terraform, observability.",
        weight: 1,
        must_have: false,
      },
      {
        id: "leadership",
        label: "Technical leadership & mentoring",
        signals: "Leads design reviews, writes RFCs, mentors engineers, drives cross-team projects.",
        weight: 1,
        must_have: false,
      },
    ],
  },
  {
    id: "job-csm-midmarket",
    title: "Customer Success Manager, Mid-Market",
    company: "Ledgerly",
    team: "Customer Success",
    location: "Remote (US time zones)",
    comp_range: "$95k–$115k OTE",
    summary:
      "Own a book of ~45 mid-market fintech customers ($30k–$150k ARR). Drive onboarding, adoption, renewals and expansion in partnership with Sales and Solutions Engineering.",
    criteria: [
      {
        id: "book-of-business",
        label: "B2B SaaS account management with a book of business",
        signals: "3+ years owning a named portfolio of B2B SaaS accounts with ARR responsibility.",
        weight: 3,
        must_have: true,
      },
      {
        id: "retention-expansion",
        label: "Renewals & expansion with measurable results",
        signals: "Quantified gross/net retention, renewal rates, upsell numbers. Has owned a renewal number.",
        weight: 3,
        must_have: true,
      },
      {
        id: "onboarding",
        label: "Onboarding & implementation",
        signals: "Has run customer onboarding plans, kickoffs, time-to-value metrics.",
        weight: 2,
        must_have: false,
      },
      {
        id: "exec-comms",
        label: "Executive stakeholder communication",
        signals: "Runs QBRs/EBRs, manages escalations with VP/C-level stakeholders.",
        weight: 2,
        must_have: true,
      },
      {
        id: "tooling",
        label: "CS tooling (Salesforce, Gainsight, HubSpot)",
        signals: "Uses CRM / CS platforms to run health scores, playbooks and forecasting.",
        weight: 1,
        must_have: false,
      },
    ],
  },
];

export const SEED_CANDIDATES: Omit<Candidate, "created_at">[] = [
  {
    id: "cand-priya",
    job_id: "job-backend-payments",
    name: "Priya Raman",
    email: "priya.raman@example.com",
    headline: "Staff Engineer @ PayFlux",
    source: "Referral",
    stage: "new",
    resume_text: `PRIYA RAMAN
Austin, TX · priya.raman@example.com

SUMMARY
Backend engineer with 8 years building payment infrastructure in Go and Java.

EXPERIENCE
Staff Software Engineer, PayFlux (card issuing platform) — 2021–present
- Designed and built a double-entry ledger service in Go handling 6M postings/day; led migration off a single-entry balances table with zero customer-facing discrepancies.
- Introduced idempotency keys and an outbox pattern on top of Kafka for card-authorization webhooks, cutting duplicate charges from ~40/week to 0.
- Owned nightly reconciliation against Visa and Marqeta settlement files; built automated break detection that reduced manual ops work by 70%.
- Primary on-call for money movement; authored 9 blameless postmortems and the team's incident runbook.
- Wrote the RFC process for the payments org and mentor 3 engineers.

Senior Software Engineer, Bankstream — 2017–2021
- Built ACH origination and returns processing in Java/Spring; NACHA file generation for $2B/yr in payouts.
- Tuned Postgres for high-write workloads: partitioned the transactions table by month, added covering indexes, and moved hot paths to SERIALIZABLE isolation where double-spend was possible.
- Ran services on AWS EKS with Terraform; built Grafana/Prometheus dashboards.

EDUCATION
B.S. Computer Science, University of Texas at Austin`,
  },
  {
    id: "cand-marcus",
    job_id: "job-backend-payments",
    name: "Marcus Oyelaran",
    email: "marcus.o@example.com",
    headline: "Senior Engineer @ ShopNest (e-commerce)",
    source: "LinkedIn",
    stage: "new",
    resume_text: `MARCUS OYELARAN
marcus.o@example.com · Remote

Senior Software Engineer, ShopNest — 2020–present
- Backend lead for checkout in TypeScript/Node.js serving 1.2M orders/month.
- Integrated Stripe and Adyen for payment capture and refunds; implemented retry logic with exponential backoff for webhook processing via SQS.
- Reduced checkout p95 latency from 900ms to 280ms by reworking Postgres queries and adding Redis caching.
- Participates in on-call rotation; led response to a Black Friday outage.

Software Engineer, Brightlane Media — 2017–2020
- Built content APIs in Python/Django and later Go microservices.
- Deployed services to GCP with Kubernetes and Helm.

SKILLS
TypeScript, Node.js, Go, Python, Postgres, Redis, SQS, Kubernetes, GCP`,
  },
  {
    id: "cand-dana",
    job_id: "job-backend-payments",
    name: "Dana Whitfield",
    email: "dana.whitfield@example.com",
    headline: "Engineering Manager, returning to IC",
    source: "Inbound",
    stage: "new",
    resume_text: `DANA WHITFIELD
dana.whitfield@example.com

Mother of two, returning to work after a career break (2021–2024).

Engineering Manager, Corvid Insurance — 2014–2021
- Managed a team of 7 engineers building claims-processing services in Java.
- Ran quarterly planning and hiring; grew team from 3 to 7.
- Owned the claims database (Oracle) and led a migration to Postgres.

Software Engineer, Corvid Insurance — 2006–2014
- Built premium billing batch jobs in Java; integrated with bank lockbox files for check payments.

Career break 2021–2024: completed AWS Solutions Architect certification (2024); built a personal budgeting app in Kotlin + Postgres.

EDUCATION
B.S. Mathematics, 1998`,
  },
  {
    id: "cand-sofia",
    job_id: "job-csm-midmarket",
    name: "Sofia Mendes",
    email: "sofia.mendes@example.com",
    headline: "Senior CSM @ Brightwave HR",
    source: "Referral",
    stage: "new",
    resume_text: `SOFIA MENDES
sofia.mendes@example.com

Senior Customer Success Manager, Brightwave HR (B2B SaaS) — 2020–present
- Own a book of 52 mid-market accounts ($3.4M ARR) with 96% gross retention and 112% net retention in FY23.
- Run QBRs with VP People and CFO stakeholders; turned around 6 at-risk accounts flagged in Gainsight health scores.
- Built the onboarding playbook adopted by the CS org, cutting time-to-first-value from 45 to 21 days.
- Partner with Sales on expansion; sourced $410k in upsell pipeline last year.

Customer Success Associate, Brightwave HR — 2018–2020
- Supported onboarding for SMB customers; managed Salesforce hygiene for the team.`,
  },
  {
    id: "cand-jordan",
    job_id: "job-csm-midmarket",
    name: "Jordan Kim",
    email: "jordan.kim@example.com",
    headline: "Account Executive @ Tallyspring",
    source: "LinkedIn",
    stage: "new",
    resume_text: `JORDAN KIM
jordan.kim@example.com

Account Executive, Tallyspring (accounting SaaS) — 2022–present
- Closed $1.1M in new business ARR in 2023 (118% of quota).
- Ran discovery and demos for finance leaders at 200–1,000 employee companies.

Sales Development Representative, Tallyspring — 2020–2022
- Booked 30+ meetings/month via outbound; President's Club 2021.

Barista / Shift Lead, Bean There Cafe — 2017–2020`,
  },
];

export function seedJobs(): Job[] {
  return SEED_JOBS.map((j) => ({ ...j, created_at: now() }));
}

export function seedCandidates(): Candidate[] {
  return SEED_CANDIDATES.map((c) => ({ ...c, created_at: now() }));
}
