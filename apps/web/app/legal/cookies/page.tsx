import Link from "next/link";
import type { Route } from "next";
import { LEGAL } from "@/lib/legal-config";
import { PolicyHeader, Section, P, UL, PolicyNav } from "../_components";

export default function CookiesPage() {
  return (
    <div className="flex flex-col gap-8">
      <PolicyHeader title="Cookie Notice" updated={LEGAL.lastUpdated} />
      <PolicyNav current="cookies" />

      <Section title="What we set">
        <P>
          {LEGAL.productName} keeps cookies to a minimum. We use only strictly necessary cookies
          that are required for the operator and clinic-owner consoles to work. We do not use
          advertising or cross-site tracking cookies.
        </P>
        <UL
          items={[
            "Authentication and session cookies, so signed-in operators and clinic owners stay logged in securely.",
            "Hosting and security cookies set by our platform to route requests and protect the service.",
          ]}
        />
      </Section>

      <Section title="Why no consent banner">
        <P>
          Strictly necessary cookies do not require consent under the ePrivacy rules and Polish law.
          If we ever add analytics or other non-essential cookies, we will ask for consent first and
          update this notice.
        </P>
      </Section>

      <Section title="Managing cookies">
        <P>
          You can clear or block cookies in your browser settings, but the consoles may not function
          correctly without the necessary ones. How we handle the personal data behind these is in
          the{" "}
          <Link className="underline" href={"/legal/privacy" as Route}>
            Privacy Policy
          </Link>
          .
        </P>
      </Section>
    </div>
  );
}
