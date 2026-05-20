import Link from "next/link";
import type { Route } from "next";
import { headers } from "next/headers";
import { requireOperator } from "@/lib/supabase-server";
import AgentDemoActions from "./agent-demo-actions";

export const dynamic = "force-dynamic";

interface TenantRow {
  id: string;
  name: string;
  display_name: string;
  source_url: string | null;
  owner_email: string | null;
  provisioned_by_user_id: string | null;
  created_at: string;
}

interface AgentRow {
  id: string;
  provider_agent_id: string;
  phone_number: string | null;
  pin_code: string | null;
  default_language: string;
  status: string;
  created_at: string;
  tenant: TenantRow | null;
}

export default async function DashboardPage() {
  const { supabase, user } = await requireOperator({
    redirectPath: "/dashboard",
  });

  // Operator bypass on agents_select policy lets us read EVERY agent across
  // tenants. The join to tenants(...) brings display data along.
  const { data: agents, error } = await supabase
    .from("agents")
    .select(
      "id, provider_agent_id, phone_number, pin_code, default_language, status, created_at, tenant:tenants(id, name, display_name, source_url, owner_email, provisioned_by_user_id, created_at)",
    )
    .order("created_at", { ascending: false });

  const rows = (agents ?? []) as unknown as AgentRow[];

  // Build origin for demo URLs (used by the client-side AgentDemoActions
  // to render the full https://<host>/demo/... clipboard target).
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const origin = `${proto}://${host}`;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-10 py-12">
      <header className="flex flex-col gap-3">
        <span className="font-mono text-xs uppercase tracking-wider text-neutral-400">
          Operator console · signed in as {user.email}
        </span>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h1 className="text-3xl font-semibold tracking-tight">Agents</h1>
          <div className="flex items-center gap-3">
            <Link
              href={"/provision" as Route}
              className="inline-flex items-center gap-2 rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-neutral-800"
            >
              Provision new agent
              <span aria-hidden>→</span>
            </Link>
            <form action="/auth/sign-out" method="POST">
              <button
                type="submit"
                className="text-xs text-neutral-500 transition hover:text-neutral-800"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
        <p className="max-w-2xl text-sm text-neutral-600">
          Every agent provisioned by you, Sebastian, or Rem. Click an agent to test it in the
          browser or assign a Polish phone number. Clients never see this page.
        </p>
      </header>

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          Failed to load agents: {error.message}
        </div>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          {/* Desktop / tablet: full table. Each row is clickable; the
              entire row is wrapped in a Link so on mobile users can tap
              anywhere without needing to reach a far-right "Open" button. */}
          <section className="hidden overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm sm:block">
            <table className="w-full text-left text-sm">
              <thead className="bg-neutral-50 text-xs uppercase tracking-wider text-neutral-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Clinic</th>
                  <th className="px-4 py-3 font-medium">Phone</th>
                  <th className="px-4 py-3 font-medium">Demo access</th>
                  <th className="px-4 py-3 font-medium">Lang</th>
                  <th className="px-4 py-3 font-medium">Provisioned</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {rows.map((a) => (
                  <tr key={a.id} className="transition hover:bg-neutral-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-neutral-900">
                        {a.tenant?.display_name ?? a.tenant?.name ?? "—"}
                      </div>
                      {a.tenant?.source_url ? (
                        <div className="truncate font-mono text-xs text-neutral-400">
                          {a.tenant.source_url}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {a.phone_number ?? <span className="text-neutral-300">— unset</span>}
                    </td>
                    <td className="px-4 py-3">
                      <AgentDemoActions
                        providerAgentId={a.provider_agent_id}
                        initialPin={a.pin_code}
                        origin={origin}
                      />
                    </td>
                    <td className="px-4 py-3 text-xs uppercase tracking-wider text-neutral-500">
                      {a.default_language}
                    </td>
                    <td className="px-4 py-3 text-xs text-neutral-500">
                      {formatDate(a.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={a.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/test/${a.provider_agent_id}` as Route}
                        className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-50"
                      >
                        Edit
                        <span aria-hidden>→</span>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* Mobile: each agent is a card with multiple action targets
              (Edit, demo PIN actions). No row-level Link wrapper because
              the demo buttons need their own click handling. */}
          <section className="flex flex-col gap-3 sm:hidden">
            {rows.map((a) => (
              <div
                key={a.id}
                className="flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-neutral-900">
                      {a.tenant?.display_name ?? a.tenant?.name ?? "—"}
                    </div>
                    {a.tenant?.source_url ? (
                      <div className="truncate font-mono text-xs text-neutral-400">
                        {a.tenant.source_url}
                      </div>
                    ) : null}
                  </div>
                  <StatusBadge status={a.status} />
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
                  <span className="font-mono">
                    {a.phone_number ?? <span className="text-neutral-300">no phone</span>}
                  </span>
                  <span className="uppercase tracking-wider">{a.default_language}</span>
                  <span>{formatDate(a.created_at)}</span>
                </div>
                <div className="border-t border-neutral-100 pt-3">
                  <AgentDemoActions
                    providerAgentId={a.provider_agent_id}
                    initialPin={a.pin_code}
                    origin={origin}
                  />
                </div>
                <Link
                  href={`/test/${a.provider_agent_id}` as Route}
                  className="self-start rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 transition active:bg-neutral-50"
                >
                  Edit agent →
                </Link>
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <section className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-neutral-300 bg-white px-6 py-16 text-center">
      <div className="text-base font-medium text-neutral-800">No agents yet.</div>
      <p className="max-w-md text-sm text-neutral-500">
        Provision your first agent: paste a clinic URL, Firecrawl + Gemini build the knowledge base,
        ElevenLabs spins up the Polish voice agent. About 5 minutes.
      </p>
      <Link
        href={"/provision" as Route}
        className="mt-2 inline-flex items-center gap-2 rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-neutral-800"
      >
        Provision the first one
        <span aria-hidden>→</span>
      </Link>
    </section>
  );
}

function StatusBadge({ status }: { status: string }) {
  const palette: Record<string, string> = {
    live: "bg-emerald-100 text-emerald-800",
    provisioning: "bg-amber-100 text-amber-800",
    paused: "bg-neutral-200 text-neutral-700",
    archived: "bg-neutral-100 text-neutral-500 line-through",
  };
  const cls = palette[status] ?? "bg-neutral-100 text-neutral-700";
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${cls}`}
    >
      {status}
    </span>
  );
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}
