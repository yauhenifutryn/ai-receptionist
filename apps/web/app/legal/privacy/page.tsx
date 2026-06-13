import Link from "next/link";
import type { Route } from "next";
import { LEGAL } from "@/lib/legal-config";
import {
  PolicyHeader,
  Section,
  P,
  UL,
  ControllerLine,
  RetentionTable,
  PolicyNav,
} from "../_components";

export default function PrivacyPolicyPage() {
  return (
    <div className="flex flex-col gap-8">
      <PolicyHeader title="Privacy Policy" updated={LEGAL.lastUpdated} />
      <PolicyNav current="privacy" />

      <Section title="Who is responsible for your data">
        <ControllerLine />
        <P>
          {LEGAL.productName} provides an AI voice assistant that answers phone calls and arranges
          appointments for clinics and other businesses. Our role depends on whose data it is, which
          we explain next.
        </P>
      </Section>

      <Section title="Two roles: controller and processor">
        <UL
          items={[
            <>
              <strong>Patient and caller data</strong> handled when our assistant takes a call on
              behalf of a clinic: the clinic is the data controller and we act as its{" "}
              <strong>processor</strong> under Article 28 GDPR, acting on the clinic&apos;s
              documented instructions. See{" "}
              <Link className="underline" href={"/legal/data-processing" as Route}>
                Data &amp; Compliance
              </Link>
              .
            </>,
            <>
              <strong>Our own data</strong>: website visitors, demo requests, and operator or
              clinic-owner accounts. For this we are the <strong>controller</strong>, and this
              policy governs it.
            </>,
          ]}
        />
      </Section>

      <Section title="What we process">
        <UL
          items={[
            "Account data for operators and clinic owners: name, email, sign-in metadata.",
            "Demo and contact requests: the details you submit when you ask for a demo or get in touch.",
            "Caller data during a call (as processor for the clinic): the caller's name and the content of the conversation, the phone number when supplied by the network, and the requested service and appointment slot.",
            "Technical data needed to run the service securely (see the Cookie Notice).",
          ]}
        />
      </Section>

      <Section title="Voice and transcripts">
        <UL
          items={[
            <>
              <strong>Voice audio is never stored.</strong> It is transcribed in real time and
              discarded; neither we nor our voice provider retain the recording.
            </>,
            "Transcripts are kept briefly for service quality and debugging, then deleted on the schedule below.",
            "The assistant identifies itself as AI at the start of every call.",
          ]}
        />
      </Section>

      <Section title="Lawful bases (GDPR / RODO)">
        <UL
          items={[
            <>
              Handling a call and arranging the appointment: Article 6(1)(b) (steps before a
              contract) and, where health information is mentioned, Article 9(2)(h) (provision of
              healthcare).
            </>,
            "Keeping transcripts for service quality: Article 6(1)(f) legitimate interest, backed by a documented assessment.",
            "Operator accounts and responding to your enquiries: Article 6(1)(b) and 6(1)(f).",
            "Any future outbound recall calls: only with prior consent captured during an earlier call (Article 6(1)(a) and applicable electronic-communications law).",
          ]}
        />
      </Section>

      <Section title="How long we keep it">
        <RetentionTable />
      </Section>

      <Section title="Who else processes your data">
        <P>
          We use a small set of vetted service providers (hosting, telephony, voice, database,
          email) to run the product. The full list, with locations and transfer safeguards, is on
          the{" "}
          <Link className="underline" href={"/legal/subprocessors" as Route}>
            Subprocessors
          </Link>{" "}
          page. Some operate outside the EEA; those transfers rely on the European Commission&apos;s
          Standard Contractual Clauses. All patient data at rest is stored in the EU.
        </P>
      </Section>

      <Section title="Your rights">
        <P>
          You have the right to access, rectify, erase, restrict, and object to the processing of
          your personal data, and to data portability. To exercise any of these, contact us at{" "}
          {LEGAL.contactEmail || "the address below"}. Where the clinic is the controller (patient
          data), we will pass your request to the clinic and assist it as its processor.
        </P>
        <P>You also have the right to lodge a complaint with {LEGAL.supervisoryAuthority}.</P>
      </Section>

      <Section title="Changes and contact">
        <P>
          We may update this policy; the &quot;last updated&quot; date above reflects the current
          version. Questions or requests: write to us at the contact address on the{" "}
          <Link className="underline" href={"/legal" as Route}>
            legal index
          </Link>
          .
        </P>
      </Section>
    </div>
  );
}
