import { describe, it, expect } from "vitest";
import { handleListOwners } from "../../src/owners/list-handler.js";

interface MockData {
  rpcResult?: { data: unknown; error: unknown };
  invitationsResult?: { data: unknown; error: unknown };
}

function buildSupabase(mock: MockData) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase: any = {
    rpc: (_name: string, _args: unknown) =>
      Promise.resolve(mock.rpcResult ?? { data: [], error: null }),
    from: (_table: string) => {
      const chain = {
        select: (_cols: string) => chain,
        eq: (_c: string, _v: unknown) => chain,
        is: (_c: string, _v: unknown) =>
          Promise.resolve(mock.invitationsResult ?? { data: [], error: null }),
      };
      return chain;
    },
  };
  return supabase;
}

const TENANT = "11111111-1111-1111-1111-111111111111";

describe("handleListOwners", () => {
  it("returns active members sorted alphabetically by email", async () => {
    const supabase = buildSupabase({
      rpcResult: {
        data: [
          {
            user_id: "u-bob",
            email: "bob@clinic.pl",
            role: "owner",
            member_since: "2026-05-20T10:00:00.000Z",
            last_sign_in_at: "2026-05-21T11:00:00.000Z",
          },
          {
            user_id: "u-alice",
            email: "alice@clinic.pl",
            role: "owner",
            member_since: "2026-05-19T10:00:00.000Z",
            last_sign_in_at: null,
          },
        ],
        error: null,
      },
      invitationsResult: { data: [], error: null },
    });
    const r = await handleListOwners(TENANT, supabase);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.owners.map((o) => o.email)).toEqual(["alice@clinic.pl", "bob@clinic.pl"]);
      expect(r.owners.every((o) => o.status === "active")).toBe(true);
      expect(r.owners[0].user_id).toBe("u-alice");
      expect(r.owners[0].signed_in_at).toBeNull();
      expect(r.owners[1].signed_in_at).toBe("2026-05-21T11:00:00.000Z");
    }
  });

  it("merges pending invitations below active members, newest first", async () => {
    const supabase = buildSupabase({
      rpcResult: {
        data: [
          {
            user_id: "u-alice",
            email: "alice@clinic.pl",
            role: "owner",
            member_since: "2026-05-19T10:00:00.000Z",
            last_sign_in_at: "2026-05-21T11:00:00.000Z",
          },
        ],
        error: null,
      },
      invitationsResult: {
        data: [
          {
            id: "inv-older",
            email: "older@clinic.pl",
            created_at: "2026-05-18T10:00:00.000Z",
            signin_token_expires_at: null,
            signin_token_consumed_at: null,
          },
          {
            id: "inv-newer",
            email: "newer@clinic.pl",
            created_at: "2026-05-20T10:00:00.000Z",
            signin_token_expires_at: "2026-06-03T10:00:00.000Z",
            signin_token_consumed_at: null,
          },
        ],
        error: null,
      },
    });
    const r = await handleListOwners(TENANT, supabase);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.owners.map((o) => o.email)).toEqual([
        "alice@clinic.pl",
        "newer@clinic.pl",
        "older@clinic.pl",
      ]);
      expect(r.owners[0].status).toBe("active");
      expect(r.owners[1].status).toBe("pending");
      expect(r.owners[1].invitation_id).toBe("inv-newer");
      expect(r.owners[2].status).toBe("pending");
    }
  });

  it("filters out pending invitations whose email is already an active member (case-insensitive)", async () => {
    const supabase = buildSupabase({
      rpcResult: {
        data: [
          {
            user_id: "u-alice",
            email: "alice@clinic.pl",
            role: "owner",
            member_since: "2026-05-19T10:00:00.000Z",
            last_sign_in_at: null,
          },
        ],
        error: null,
      },
      invitationsResult: {
        data: [
          {
            id: "inv-dup",
            email: "Alice@clinic.pl",
            created_at: "2026-05-18T10:00:00.000Z",
            signin_token_expires_at: null,
            signin_token_consumed_at: null,
          },
          {
            id: "inv-real-pending",
            email: "pending@clinic.pl",
            created_at: "2026-05-19T10:00:00.000Z",
            signin_token_expires_at: null,
            signin_token_consumed_at: null,
          },
        ],
        error: null,
      },
    });
    const r = await handleListOwners(TENANT, supabase);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.owners).toHaveLength(2);
      expect(r.owners[0].email).toBe("alice@clinic.pl");
      expect(r.owners[0].status).toBe("active");
      expect(r.owners[1].email).toBe("pending@clinic.pl");
      expect(r.owners[1].status).toBe("pending");
    }
  });

  it("propagates RPC errors as 500", async () => {
    const supabase = buildSupabase({
      rpcResult: { data: null, error: { message: "rpc boom" } },
    });
    const r = await handleListOwners(TENANT, supabase);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(500);
      expect(r.error).toBe("rpc boom");
    }
  });

  it("returns empty list when no members and no invitations", async () => {
    const supabase = buildSupabase({
      rpcResult: { data: [], error: null },
      invitationsResult: { data: [], error: null },
    });
    const r = await handleListOwners(TENANT, supabase);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.owners).toEqual([]);
  });
});
