import { LEGAL } from "@/lib/legal-config";
import { PolicyHeader, Section, P, SubprocessorTable, PolicyNav } from "../_components";

export default function SubprocessorsPage() {
  return (
    <div className="flex flex-col gap-8">
      <PolicyHeader title="Subprocessors" updated={LEGAL.lastUpdated} />
      <PolicyNav current="subprocessors" />

      <Section title="Service providers we use">
        <P>
          {LEGAL.productName} uses the third-party processors below to operate the service. Each
          processes personal data only as needed for its function and under contractual
          data-protection terms. Providers outside the EEA rely on the European Commission&apos;s
          Standard Contractual Clauses. All patient data at rest is stored in the EU.
        </P>
        <SubprocessorTable />
        <P>{LEGAL.optionalProcessorsNote}</P>
      </Section>

      <Section title="Changes to this list">
        <P>
          We update this page when we add or remove a processor. Clinics with a signed
          data-processing agreement are notified of material changes so they can object where they
          have the right to.
        </P>
      </Section>
    </div>
  );
}
