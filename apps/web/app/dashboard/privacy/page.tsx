import Link from "next/link";
import type { Route } from "next";
import { requireOperator } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

/**
 * Operator-facing privacy reference page. Surfaces the honest stack picture
 * so Sebastian and Jenya can answer "where does my patient data go?"
 * consistently with prospects. Linked from the dashboard header.
 *
 * Not customer-facing — visitors land on /demo/[agentId] which has its own
 * privacy notice rendered inline near the Start call button.
 */
export default async function PrivacyReferencePage() {
  await requireOperator({ redirectPath: "/dashboard/privacy" });

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-6 py-10 sm:px-8 sm:py-12">
      <header className="flex flex-col gap-3">
        <span className="font-mono text-xs uppercase tracking-wider text-neutral-400">
          Operator reference · internal
        </span>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h1 className="text-3xl font-semibold tracking-tight">Privacy &amp; compliance</h1>
          <Link
            href={"/dashboard" as Route}
            className="text-sm text-neutral-500 transition hover:text-neutral-800"
          >
            Back to dashboard
          </Link>
        </div>
        <p className="text-sm leading-relaxed text-neutral-600">
          The honest stack picture, in plain language. Use this page when a clinic owner asks where
          their patient data goes, or when Sebastian needs a quick reference during a discovery
          meeting.
        </p>
      </header>

      <Section title="Data flow per call">
        <Bullet>
          <strong>Voice</strong> &middot; processed by ElevenLabs (US region, EU SCCs in place). The
          audio stream is transcribed in real time and discarded immediately. Voice is{" "}
          <strong>never stored</strong>, by us or by ElevenLabs.
        </Bullet>
        <Bullet>
          <strong>Transcripts</strong> &middot; retained briefly for service-quality purposes and
          operator debugging. Stored in Supabase (Ireland, EU). Retention target: 30 days for calls
          that did not result in a booking; longer for calls that did, because the booking record
          itself references the conversation. Cleared on operator request.
        </Bullet>
        <Bullet>
          <strong>Booking data</strong> &middot; patient name, requested service, slot, contact
          number (when supplied) &middot; stored in Supabase per tenant, isolated by row-level
          security.
        </Bullet>
        <Bullet>
          <strong>SMS confirmations</strong> &middot; sent via Zadarma when a phone number is
          available. Body of the SMS is logged for delivery troubleshooting; the patient number is
          stored only against the booking record, not in the SMS log.
        </Bullet>
      </Section>

      <Section title="Lawful basis (GDPR)">
        <Bullet>
          <strong>Handling the call, taking the booking, capturing the patient name</strong>{" "}
          &middot; Article 6(1)(b) (pre-contractual measures) + Article 9(2)(h) (provision of
          healthcare). No explicit consent needed.
        </Bullet>
        <Bullet>
          <strong>Transcript retention for service quality</strong> &middot; Article 6(1)(f)
          (legitimate interest). Backed by a one-page Legitimate Interest Assessment kept on file;
          shareable with a supervisory authority on request.
        </Bullet>
        <Bullet>
          <strong>EU AI Act, limited-risk transparency</strong> &middot; satisfied by (a) the
          clinic&apos;s website notice published next to the AI-routed phone number and (b) the
          agent&apos;s AI disclosure on the first turn of every call.
        </Bullet>
      </Section>

      <Section title="Subprocessor list">
        <Bullet>
          <strong>ElevenLabs</strong> &middot; voice synthesis + transcription. US region; EU SCCs.
        </Bullet>
        <Bullet>
          <strong>Telnyx EU</strong> &middot; SIP trunk for phone connectivity. EU media region.
        </Bullet>
        <Bullet>
          <strong>Supabase</strong> &middot; database + auth. Ireland (eu-west-1).
        </Bullet>
        <Bullet>
          <strong>Vercel</strong> &middot; compute + edge hosting. Frankfurt (fra1) for our
          functions.
        </Bullet>
        <Bullet>
          <strong>Firecrawl</strong> &middot; one-time scrape of the clinic&apos;s public website
          for the knowledge base. No patient data ever sent to Firecrawl.
        </Bullet>
        <Bullet>
          <strong>Resend</strong> &middot; transactional email to operators (sign-in links, invite
          notifications). Not used for patient communication.
        </Bullet>
        <Bullet>
          <strong>Zadarma</strong> &middot; SMS booking confirmations. Patient phone passes through
          when SMS is sent; not stored on Zadarma beyond delivery.
        </Bullet>
      </Section>

      <Section title="What the clinic MUST publish">
        <p className="text-sm leading-relaxed text-neutral-700">
          The clinic is required to publish a short transparency notice next to the AI-routed phone
          number on their website (contact page or footer). Without this notice, we do not flip the
          agent into production for that clinic.
        </p>
        <p className="text-sm leading-relaxed text-neutral-700">
          Drop-in Polish / English / Russian boilerplate lives in{" "}
          <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-xs">
            docs/clinic-website-notice-template.md
          </code>{" "}
          in the repo &mdash; Sebastian uses it during clinic onboarding.
        </p>
      </Section>

      <Section title="Agent in-call behavior">
        <Bullet>
          The agent opens with: &ldquo;Dzień dobry, jestem Michał, asystent sztucznej inteligencji w{" "}
          {"{clinic}"}. W czym mogę pomóc?&rdquo; &mdash; AI disclosure satisfied on turn one.
        </Bullet>
        <Bullet>
          The agent does <strong>not</strong> ask for an in-call consent question. The lawful basis
          stack above covers the call without it.
        </Bullet>
        <Bullet>
          The agent does <strong>not</strong> ask for the caller&apos;s phone number; it&apos;s
          taken from SIP caller_id when available. Browser/PIN demo calls skip the SMS step.
        </Bullet>
        <Bullet>
          The agent stays in scope: no medical, legal, or financial advice. Anything operationally
          complex is escalated to a human.
        </Bullet>
      </Section>

      <Section title="What to say to a clinic owner asking about compliance">
        <p className="text-sm leading-relaxed text-neutral-700">
          &ldquo;Voice is never stored. Transcripts are kept briefly for quality and debugging under
          legitimate-interest basis. You publish a one-paragraph notice on your contact page (we
          provide the wording). For the call itself, the agent identifies as AI on the first turn,
          which satisfies the EU AI Act transparency requirement. No explicit in-call consent is
          needed for the booking flow because Articles 6(1)(b) and 9(2)(h) cover pre-contractual
          healthcare processing.&rdquo;
        </p>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-8">
      <h2 className="text-base font-semibold text-neutral-900">{title}</h2>
      <div className="flex flex-col gap-2.5">{children}</div>
    </section>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5 text-sm leading-relaxed text-neutral-700">
      <span
        aria-hidden
        className="mt-2 inline-block h-1 w-1 shrink-0 rounded-full bg-neutral-400"
      />
      <span>{children}</span>
    </div>
  );
}
