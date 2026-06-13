import { LEGAL } from "@/lib/legal-config";
import { PolicyHeader, Section, P, UL, Fill, PolicyNav } from "../_components";

export default function IpPolicyPage() {
  return (
    <div className="flex flex-col gap-8">
      <PolicyHeader title="Intellectual Property Infringement" updated={LEGAL.lastUpdated} />
      <PolicyNav current="ip-policy" />

      <Section title="Reporting infringement">
        <P>
          We respect intellectual-property rights and expect our users to do the same. If you
          believe content made available through {LEGAL.productName} infringes your copyright,
          trademark, or other rights, send a notice to{" "}
          <Fill value={LEGAL.contactEmail} hint="contact email" /> with the information below.
        </P>
        <UL
          items={[
            "Your name and contact details.",
            "Identification of the protected work or right you claim is infringed.",
            "The specific material you believe is infringing and where it appears.",
            "A statement that you have a good-faith belief the use is not authorized by the rights holder or the law.",
            "A statement that the information is accurate and that you are the rights holder or authorized to act for them.",
          ]}
        />
      </Section>

      <Section title="What we do with a notice">
        <P>
          On receiving a complete notice, we review it and, where appropriate, remove or disable
          access to the material and notify the party that supplied it. That party may submit a
          counter-notice if they believe the material was removed in error.
        </P>
      </Section>

      <Section title="Scraped website content">
        <P>
          To build a clinic&apos;s knowledge base we read the clinic&apos;s own public website with
          the clinic&apos;s authorization. If you are a rights holder and believe content was used
          without authorization, contact us at the address above and we will remove it promptly.
        </P>
      </Section>

      <Section title="Repeat infringers">
        <P>
          We may suspend or terminate access for users who repeatedly infringe the rights of others.
        </P>
      </Section>
    </div>
  );
}
