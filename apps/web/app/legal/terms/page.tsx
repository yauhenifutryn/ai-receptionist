import Link from "next/link";
import type { Route } from "next";
import { LEGAL } from "@/lib/legal-config";
import { PolicyHeader, Section, P, UL, PolicyNav } from "../_components";

export default function TermsOfUsePage() {
  return (
    <div className="flex flex-col gap-8">
      <PolicyHeader title="Terms of Use" updated={LEGAL.lastUpdated} />
      <PolicyNav current="terms" />

      <Section title="Acceptance">
        <P>
          By using the {LEGAL.productName} website, demo, or service you agree to these terms. If
          you use the service on behalf of a clinic or business, you confirm you are authorized to
          do so.
        </P>
      </Section>

      <Section title="The service">
        <P>
          {LEGAL.productName} is an AI voice assistant that answers calls and arranges appointments
          for clinics and other businesses. The product is in active development and is currently
          offered for evaluation and pilots. It is provided on an &quot;as is&quot; and &quot;as
          available&quot; basis during this phase.
        </P>
      </Section>

      <Section title="Demo use">
        <UL
          items={[
            "The demo is for evaluation by clinic and business staff.",
            "Do not enter real patient personal data into the demo environment. Use test data.",
            "Live use with real patient traffic requires a separate written agreement (including data-processing terms) and the published call transparency notice.",
          ]}
        />
      </Section>

      <Section title="Not professional advice">
        <P>
          The assistant arranges appointments and shares general practical information only. It does
          not provide medical, legal, or financial advice, and anything operationally complex is
          escalated to a human. Nothing it says should be relied on as professional advice.
        </P>
      </Section>

      <Section title="Acceptable use">
        <UL
          items={[
            "Do not use the service unlawfully, to harass, or to attempt to disrupt or reverse engineer it.",
            "Do not upload content you do not have the right to use.",
            "Do not use the service to place outbound calls without a lawful basis and any required consent.",
          ]}
        />
      </Section>

      <Section title="Intellectual property">
        <P>
          We own the software, models configuration, and content we create. You and your clinic
          retain ownership of your own business data and the patient data you control; you grant us
          the limited rights needed to operate the service for you. Reporting infringement is
          covered on the{" "}
          <Link className="underline" href={"/legal/ip-policy" as Route}>
            IP Infringement
          </Link>{" "}
          page.
        </P>
      </Section>

      <Section title="Disclaimers and liability">
        <P>
          To the fullest extent permitted by law, the service is provided without warranties of any
          kind, and we are not liable for indirect or consequential losses. Nothing in these terms
          limits liability that cannot be limited under {LEGAL.governingLaw}.
        </P>
      </Section>

      <Section title="Governing law and changes">
        <P>
          These terms are governed by {LEGAL.governingLaw}, and disputes are subject to the
          competent Polish courts. We may update these terms; the &quot;last updated&quot; date
          reflects the current version. Contact details are on the{" "}
          <Link className="underline" href={"/legal" as Route}>
            legal index
          </Link>
          .
        </P>
      </Section>
    </div>
  );
}
