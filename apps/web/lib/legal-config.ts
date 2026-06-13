// Single source of truth for the public legal pages under /legal.
//
// PRE-INCORPORATION REALITY: until the Polish limited company (sp. z o.o.) is
// registered, the data controller for our OWN processing is a natural person
// (the founder), not a company. Do not invent a company name on these pages.
//
// HOW TO COMPLETE: fill the four TODO fields below once. They propagate to
// every legal page. Anything left blank renders as a visible "to complete"
// token plus a "draft" banner, so a demo viewer understands the pages are
// pre-launch drafts rather than seeing a broken or dishonest page.
//
// See docs/internal/legal-pre-incorporation-memo.md for the full legal
// reasoning, the demo-safety rules, and the reconciliation TODOs.

export type Subprocessor = {
  name: string;
  purpose: string;
  location: string;
  transfer: string;
};

export type RetentionRow = {
  data: string;
  retention: string;
  where: string;
};

export type LegalPageRef = {
  slug: string;
  label: string;
  blurb: string;
};

export const LEGAL = {
  productName: "AI Receptionist",
  // Working brand, not finalized at incorporation. Shown once for clarity.
  workingBrand: "Odbiera",

  // --- Controller identity (FILL before publishing) -----------------------
  // The controller of OUR own processing (website, demo requests, operator
  // accounts). Pre-incorporation this is YOU as a natural person.
  controllerLegalName: "", // TODO e.g. "Yauheni Futryn"
  controllerStatus:
    "a natural person acting as sole trader, pending incorporation of a Polish limited liability company (spółka z ograniczoną odpowiedzialnością)",
  controllerAddress: "", // TODO correspondence address
  contactEmail: "", // TODO e.g. "privacy@odbiera.pl" (a personal address is acceptable pre-incorporation)

  // --- Dates --------------------------------------------------------------
  effectiveDate: "13 June 2026",
  lastUpdated: "13 June 2026",

  // --- Jurisdiction -------------------------------------------------------
  governingLaw: "the laws of the Republic of Poland",
  supervisoryAuthority:
    "the President of the Personal Data Protection Office (Prezes Urzędu Ochrony Danych Osobowych, UODO), ul. Stawki 2, 00-193 Warsaw, Poland",

  // --- Retention ----------------------------------------------------------
  retention: [
    {
      data: "Call voice audio",
      retention: "Never stored. Transcribed in real time and discarded.",
      where: "In transit only (ElevenLabs)",
    },
    {
      data: "Call transcripts",
      retention:
        "Up to 30 days when no booking resulted; retained with the booking record when a booking was made. Cleared earlier on request.",
      where: "Supabase, Ireland (EU)",
    },
    {
      data: "Booking data (name, requested service, slot, phone number when supplied)",
      retention:
        "For the duration of the engagement and as needed to support the clinic's appointment records.",
      where: "Supabase, Ireland (EU)",
    },
    {
      data: "SMS confirmation logs",
      retention: "Delivery metadata only; the patient phone number is not retained in the SMS log.",
      where: "Supabase, Ireland (EU)",
    },
    {
      data: "Operator / clinic-owner accounts",
      retention: "For the life of the account; deleted on request.",
      where: "Supabase, Ireland (EU)",
    },
  ] as RetentionRow[],

  // --- Subprocessors (verify before publishing) ---------------------------
  // Pre-filled from the curated honest-stack reference and the committed env.
  // TODO reconcile the SMS provider (Zadarma vs SMSAPI) and confirm Telnyx vs
  // Twilio for live telephony before this page goes public.
  subprocessors: [
    {
      name: "ElevenLabs",
      purpose:
        "Real-time voice synthesis and transcription, and the in-call conversational AI runtime.",
      location: "United States",
      transfer: "EU Standard Contractual Clauses",
    },
    {
      name: "Google (Gemini API)",
      purpose:
        "Knowledge-base consolidation from the clinic's public website, and language and consent classification. No voice; no caller audio.",
      location: "United States / EU",
      transfer: "EU Standard Contractual Clauses",
    },
    {
      name: "Telnyx",
      purpose: "SIP telephony trunk providing inbound call connectivity.",
      location: "EU media region",
      transfer: "Processing within the EU",
    },
    {
      name: "Supabase",
      purpose: "Database, authentication, and storage of transcripts and booking records.",
      location: "Ireland (EU)",
      transfer: "Processing within the EU",
    },
    {
      name: "Vercel",
      purpose: "Application hosting and serverless compute.",
      location: "Frankfurt (fra1); United States parent company",
      transfer: "EU Standard Contractual Clauses",
    },
    {
      name: "Firecrawl",
      purpose:
        "One-time scrape of the clinic's public website to build its knowledge base. No patient data is ever sent to Firecrawl.",
      location: "United States",
      transfer: "EU Standard Contractual Clauses",
    },
    {
      name: "Resend",
      purpose:
        "Transactional email to operators and clinic owners (sign-in links, invitations). Not used for patient communication.",
      location: "United States",
      transfer: "EU Standard Contractual Clauses",
    },
    {
      name: "Zadarma",
      purpose:
        "SMS booking confirmations. The patient phone number passes through when an SMS is sent; it is not stored by Zadarma beyond delivery.",
      location: "EU",
      transfer: "Processing within the EU",
    },
  ] as Subprocessor[],

  // Processors used only for benchmarking / optional features, never with
  // patient data, shown for full transparency.
  optionalProcessorsNote:
    "Anthropic and OpenAI may be used occasionally for model benchmarking and optional features. No patient personal data is sent to them.",

  // --- Page registry (drives the index and the in-section nav) ------------
  pages: [
    {
      slug: "privacy",
      label: "Privacy Policy",
      blurb: "What personal data we handle, why, for how long, and your rights.",
    },
    {
      slug: "terms",
      label: "Terms of Use",
      blurb: "The terms governing use of the website and the demo service.",
    },
    {
      slug: "data-processing",
      label: "Data & Compliance",
      blurb:
        "Controller vs processor roles, the AI Act transparency duty, and how patient data is handled.",
    },
    {
      slug: "subprocessors",
      label: "Subprocessors",
      blurb: "The third-party services that help us run the product, and where they are.",
    },
    {
      slug: "ip-policy",
      label: "IP Infringement",
      blurb: "How to report intellectual-property infringement (notice and takedown).",
    },
    {
      slug: "cookies",
      label: "Cookie Notice",
      blurb: "The small number of strictly necessary cookies we set.",
    },
  ] as LegalPageRef[],
};

/** True while any controller-identity field is still a placeholder. */
export const LEGAL_IS_DRAFT =
  !LEGAL.controllerLegalName || !LEGAL.controllerAddress || !LEGAL.contactEmail;
