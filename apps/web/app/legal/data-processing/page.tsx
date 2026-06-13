import Link from "next/link";
import type { Route } from "next";
import { LEGAL } from "@/lib/legal-config";
import { PolicyHeader, Section, P, UL, RetentionTable, PolicyNav } from "../_components";

export default function DataProcessingPage() {
  return (
    <div className="flex flex-col gap-8">
      <PolicyHeader title="Data & Compliance" updated={LEGAL.lastUpdated} />
      <PolicyNav current="data-processing" />

      <Section title="Controller and processor roles">
        <P>
          When our assistant handles a call for a clinic, the{" "}
          <strong>clinic is the controller</strong> of the patient data and {LEGAL.productName} is
          the <strong>processor</strong>, acting only on the clinic&apos;s documented instructions
          under Article 28 GDPR. For our own website, demo, and account data, {LEGAL.productName} is
          the controller.
        </P>
        <P>
          Before any live use with real patient traffic, we and the clinic sign a data-processing
          agreement (DPA) that sets out the subject matter, duration, nature and purpose of
          processing, the types of data, and the obligations of both parties, including our use of
          the subprocessors listed on the{" "}
          <Link className="underline" href={"/legal/subprocessors" as Route}>
            Subprocessors
          </Link>{" "}
          page.
        </P>
      </Section>

      <Section title="Special-category (health) data">
        <P>
          Calls to a clinic can reveal health information, which is special-category data under
          Article 9 GDPR. It is processed for the provision of healthcare under Article 9(2)(h), on
          the clinic&apos;s instructions, and only to the extent needed to arrange the appointment.
          The assistant stays in scope and escalates anything clinical to a human.
        </P>
      </Section>

      <Section title="AI transparency (EU AI Act)">
        <UL
          items={[
            "The assistant discloses that it is AI at the start of every call, satisfying the limited-risk transparency duty.",
            "The clinic also publishes a short notice next to the AI-routed phone number on its website; we provide the wording.",
            "No audio is stored, and the caller is told the call may be transcribed for service quality.",
          ]}
        />
      </Section>

      <Section title="Data minimization and retention">
        <P>
          Voice audio is never stored. Transcripts are kept only briefly for service quality and
          then deleted. Booking data is kept to support the clinic&apos;s appointment records.
        </P>
        <RetentionTable />
      </Section>

      <Section title="International transfers">
        <P>
          All patient data at rest is stored in the EU (database in Ireland, compute in Frankfurt).
          Some service providers operate outside the EEA; those transfers rely on the European
          Commission&apos;s Standard Contractual Clauses. See the{" "}
          <Link className="underline" href={"/legal/subprocessors" as Route}>
            Subprocessors
          </Link>{" "}
          page for each provider and its safeguard.
        </P>
      </Section>

      <Section title="Outbound calls">
        <P>
          Any proactive outbound calling (for example appointment recall) is done only with prior
          consent collected during an earlier call and recorded against the relevant record, in line
          with Polish electronic-communications law (the Electronic Communications Law, PKE, in
          force since 10 November 2024). We do not call cold or purchased lists.
        </P>
      </Section>

      <Section title="Supervisory authority">
        <P>
          The competent supervisory authority is {LEGAL.supervisoryAuthority}. Data subjects may
          lodge a complaint there at any time.
        </P>
      </Section>
    </div>
  );
}
