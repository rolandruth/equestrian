import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, ShieldCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type AdminClaim = {
  id: number;
  entryId: number;
  bizUserId: string;
  status: string;
  approvedVia: string | null;
  createdAt: string;
  decidedAt: string | null;
  entry: {
    id: number;
    title: string;
    category?: string | null;
    location?: string | null;
    contactEmail?: string | null;
    ownerId?: string | null;
  } | null;
  bizUser: {
    id: string;
    email: string;
    firstName?: string | null;
    lastName?: string | null;
  } | null;
};

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function claimantName(c: AdminClaim) {
  if (!c.bizUser) return c.bizUserId;
  const name = [c.bizUser.firstName, c.bizUser.lastName].filter(Boolean).join(" ");
  return name || c.bizUser.email;
}

export default function AdminClaimsPage() {
  const { toast } = useToast();
  const [claims, setClaims] = useState<AdminClaim[] | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/claims", { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed to load claims");
      const data = await res.json();
      setClaims(data.claims ?? []);
    } catch (e: any) {
      toast({ title: "Failed to load claims", description: e.message, variant: "destructive" });
      setClaims([]);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  async function act(id: number, action: "approve" | "reject" | "revoke") {
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/claims/${id}/${action}`, {
        method: "POST",
        headers: authHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed to ${action} claim`);
      toast({ title: `Claim ${action === "approve" ? "approved" : action + "d"}` });
      await load();
    } catch (e: any) {
      toast({ title: `Failed to ${action} claim`, description: e.message, variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  }

  const pending = (claims ?? []).filter((c) => c.status === "pending");
  const decided = (claims ?? []).filter((c) => c.status !== "pending");

  const ClaimRow = ({ claim }: { claim: AdminClaim }) => (
    <div className="flex items-start justify-between gap-4 rounded-lg border px-4 py-3 flex-wrap">
      <div className="min-w-0">
        <p className="font-medium text-sm">
          {claim.entry?.title ?? `Listing #${claim.entryId}`}
          {(claim.entry?.category || claim.entry?.location) && (
            <span className="text-muted-foreground font-normal">
              {" "}
              · {[claim.entry?.category, claim.entry?.location].filter(Boolean).join(" · ")}
            </span>
          )}
        </p>
        <p className="text-sm text-muted-foreground">
          Claimed by <span className="font-medium">{claimantName(claim)}</span>
          {claim.bizUser?.email && <> ({claim.bizUser.email})</>}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Listing contact email: {claim.entry?.contactEmail || "none on file"} · Submitted{" "}
          {formatDate(claim.createdAt)}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {claim.status === "pending" ? (
          <>
            <Button
              size="sm"
              onClick={() => act(claim.id, "approve")}
              disabled={busyId === claim.id}
            >
              {busyId === claim.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Approve"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => act(claim.id, "reject")}
              disabled={busyId === claim.id}
            >
              Reject
            </Button>
          </>
        ) : (
          <>
            <Badge
              variant={claim.status === "approved" ? "default" : "outline"}
              className={claim.status === "approved" ? "" : "text-muted-foreground"}
            >
              {claim.status}
            </Badge>
            {claim.status === "approved" && claim.entry?.ownerId === claim.bizUserId && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => act(claim.id, "revoke")}
                disabled={busyId === claim.id}
              >
                {busyId === claim.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Revoke"}
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <ShieldCheck className="h-6 w-6" />
          Listing Claims
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Every listing claim requires manual verification — compare the claimant's account email
          against the listing's contact details before approving.
        </p>
      </div>

      {claims === null ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Pending review {pending.length > 0 && <Badge className="ml-2">{pending.length}</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {pending.length === 0 ? (
                <p className="text-sm text-muted-foreground">No claims waiting for review.</p>
              ) : (
                <div className="space-y-2">
                  {pending.map((c) => (
                    <ClaimRow key={c.id} claim={c} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">History</CardTitle>
            </CardHeader>
            <CardContent>
              {decided.length === 0 ? (
                <p className="text-sm text-muted-foreground">No decided claims yet.</p>
              ) : (
                <div className="space-y-2">
                  {decided.map((c) => (
                    <ClaimRow key={c.id} claim={c} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
