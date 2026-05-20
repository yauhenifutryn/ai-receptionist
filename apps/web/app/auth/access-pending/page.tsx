export default function AccessPendingPage() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-8 py-16">
      <header className="flex flex-col gap-2">
        <span className="font-mono text-xs uppercase tracking-wider text-neutral-400">
          Access pending
        </span>
        <h1 className="text-3xl font-semibold tracking-tight">
          You&apos;re signed in, but not on the operator list yet.
        </h1>
        <p className="text-sm text-neutral-600">
          This system is for sales reps and staff who provision agents on behalf of clinics. Clients
          do not self-onboard — your dedicated rep will provision your agent and send you a phone
          number to try it on.
        </p>
        <p className="text-sm text-neutral-600">
          If you should be an operator, ask Jenya to add your email to the allowlist.
        </p>
      </header>
      <form action="/auth/sign-out" method="POST">
        <button
          type="submit"
          className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-neutral-200 bg-white px-5 py-2.5 text-sm font-medium text-neutral-700 shadow-sm transition hover:border-neutral-300 hover:bg-neutral-50"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
