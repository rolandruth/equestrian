import { useListBizUsers, useDeleteBizUser } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Mail, Calendar, Trash2, Building2, CreditCard } from "lucide-react";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminContactsPage() {
  const { data: bizUsersData, isLoading } = useListBizUsers();
  const queryClient = useQueryClient();
  const deleteBizUser = useDeleteBizUser();

  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const bizUsers = bizUsersData?.bizUsers ?? [];

  const handleConfirmDelete = async () => {
    if (pendingDeleteId === null) return;
    setDeletingId(pendingDeleteId);
    setPendingDeleteId(null);
    try {
      await deleteBizUser.mutateAsync({ id: pendingDeleteId });
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/biz-users"] });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <>
      <AlertDialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => { if (!open) setPendingDeleteId(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete business account?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the business account and remove their access. Their claimed listings will become unclaimed. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600 text-white"
            >
              Delete Account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Business Accounts</h1>
            <p className="text-muted-foreground text-sm mt-0.5">Registered business logins</p>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900">
            <Building2 className="h-4 w-4 text-emerald-500" />
            <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
              {bizUsers.length} {bizUsers.length === 1 ? "account" : "accounts"}
            </span>
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-20 text-muted-foreground">Loading...</div>
        ) : bizUsers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
            <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center">
              <Building2 className="h-7 w-7 text-muted-foreground" />
            </div>
            <div>
              <p className="font-semibold text-lg">No business accounts yet</p>
              <p className="text-muted-foreground text-sm mt-1">
                Business owners who sign up will appear here.
              </p>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 border-b">
                  <th className="text-left px-5 py-3 font-semibold text-muted-foreground">#</th>
                  <th className="text-left px-5 py-3 font-semibold text-muted-foreground">Name</th>
                  <th className="text-left px-5 py-3 font-semibold text-muted-foreground">
                    <span className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" /> Email</span>
                  </th>
                  <th className="text-left px-5 py-3 font-semibold text-muted-foreground">
                    <span className="flex items-center gap-1.5"><CreditCard className="h-3.5 w-3.5" /> Stripe Customer</span>
                  </th>
                  <th className="text-left px-5 py-3 font-semibold text-muted-foreground">
                    <span className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" /> Joined</span>
                  </th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {bizUsers.map((u, i) => (
                  <tr key={u.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-5 py-3.5 text-muted-foreground font-mono text-xs">{i + 1}</td>
                    <td className="px-5 py-3.5 font-medium">
                      {u.firstName || u.lastName
                        ? [u.firstName, u.lastName].filter(Boolean).join(" ")
                        : <span className="text-muted-foreground italic">—</span>}
                    </td>
                    <td className="px-5 py-3.5">
                      <a href={`mailto:${u.email}`} className="text-primary hover:underline">{u.email}</a>
                    </td>
                    <td className="px-5 py-3.5 text-muted-foreground font-mono text-xs">
                      {u.stripeCustomerId ?? <span className="italic">none</span>}
                    </td>
                    <td className="px-5 py-3.5 text-muted-foreground text-xs whitespace-nowrap">
                      {formatDate(u.createdAt)}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <button
                        type="button"
                        onClick={() => setPendingDeleteId(u.id)}
                        disabled={deletingId === u.id}
                        className="inline-flex items-center justify-center w-8 h-8 rounded-md text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        title="Delete account"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
