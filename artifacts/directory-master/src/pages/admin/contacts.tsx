import { useListContacts, useDeleteContact, useListBizUsers, useDeleteBizUser } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Users, Mail, Phone, Calendar, Trash2, Building2, CreditCard } from "lucide-react";
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
  const { data: contactsData, isLoading: contactsLoading } = useListContacts();
  const { data: bizUsersData, isLoading: bizUsersLoading } = useListBizUsers();
  const queryClient = useQueryClient();
  const deleteContact = useDeleteContact();
  const deleteBizUser = useDeleteBizUser();

  const [pendingDeleteContactId, setPendingDeleteContactId] = useState<number | null>(null);
  const [deletingContactId, setDeletingContactId] = useState<number | null>(null);
  const [pendingDeleteBizUserId, setPendingDeleteBizUserId] = useState<string | null>(null);
  const [deletingBizUserId, setDeletingBizUserId] = useState<string | null>(null);

  const contacts = contactsData?.contacts ?? [];
  const bizUsers = bizUsersData?.bizUsers ?? [];

  const handleConfirmDeleteContact = async () => {
    if (pendingDeleteContactId === null) return;
    setDeletingContactId(pendingDeleteContactId);
    setPendingDeleteContactId(null);
    try {
      await deleteContact.mutateAsync({ id: pendingDeleteContactId });
      await queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
    } finally {
      setDeletingContactId(null);
    }
  };

  const handleConfirmDeleteBizUser = async () => {
    if (pendingDeleteBizUserId === null) return;
    setDeletingBizUserId(pendingDeleteBizUserId);
    setPendingDeleteBizUserId(null);
    try {
      await deleteBizUser.mutateAsync({ id: pendingDeleteBizUserId });
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/biz-users"] });
    } finally {
      setDeletingBizUserId(null);
    }
  };

  return (
    <>
      <AlertDialog
        open={pendingDeleteContactId !== null}
        onOpenChange={(open) => { if (!open) setPendingDeleteContactId(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete contact?</AlertDialogTitle>
            <AlertDialogDescription>
              This contact submission will be permanently removed. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDeleteContact}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600 text-white"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={pendingDeleteBizUserId !== null}
        onOpenChange={(open) => { if (!open) setPendingDeleteBizUserId(null); }}
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
              onClick={handleConfirmDeleteBizUser}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600 text-white"
            >
              Delete Account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="space-y-10">
        {/* Claim submissions */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Contacts</h1>
              <p className="text-muted-foreground text-sm mt-0.5">
                Claim Your Listing form submissions
              </p>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900">
              <Users className="h-4 w-4 text-blue-500" />
              <span className="text-sm font-semibold text-blue-700 dark:text-blue-300">
                {contacts.length} {contacts.length === 1 ? "submission" : "submissions"}
              </span>
            </div>
          </div>

          {contactsLoading ? (
            <div className="text-center py-12 text-muted-foreground">Loading...</div>
          ) : contacts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center gap-4">
              <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center">
                <Users className="h-7 w-7 text-muted-foreground" />
              </div>
              <div>
                <p className="font-semibold text-lg">No submissions yet</p>
                <p className="text-muted-foreground text-sm mt-1">
                  When visitors fill out the Claim Your Listing form, they'll appear here.
                </p>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border bg-card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 border-b">
                    <th className="text-left px-5 py-3 font-semibold text-muted-foreground">#</th>
                    <th className="text-left px-5 py-3 font-semibold text-muted-foreground">Full Name</th>
                    <th className="text-left px-5 py-3 font-semibold text-muted-foreground">
                      <span className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" /> Phone</span>
                    </th>
                    <th className="text-left px-5 py-3 font-semibold text-muted-foreground">
                      <span className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" /> Email</span>
                    </th>
                    <th className="text-left px-5 py-3 font-semibold text-muted-foreground">
                      <span className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" /> Submitted</span>
                    </th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {contacts.map((c, i) => (
                    <tr key={c.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-5 py-3.5 text-muted-foreground font-mono text-xs">{i + 1}</td>
                      <td className="px-5 py-3.5 font-medium">{c.fullName}</td>
                      <td className="px-5 py-3.5">
                        <a href={`tel:${c.phone}`} className="text-primary hover:underline">{c.phone}</a>
                      </td>
                      <td className="px-5 py-3.5">
                        <a href={`mailto:${c.email}`} className="text-primary hover:underline">{c.email}</a>
                      </td>
                      <td className="px-5 py-3.5 text-muted-foreground text-xs whitespace-nowrap">
                        {formatDate(c.createdAt)}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <button
                          type="button"
                          onClick={() => setPendingDeleteContactId(c.id)}
                          disabled={deletingContactId === c.id}
                          className="inline-flex items-center justify-center w-8 h-8 rounded-md text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                          title="Delete contact"
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

        {/* Business accounts */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold tracking-tight">Business Accounts</h2>
              <p className="text-muted-foreground text-sm mt-0.5">
                Registered business logins
              </p>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900">
              <Building2 className="h-4 w-4 text-emerald-500" />
              <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                {bizUsers.length} {bizUsers.length === 1 ? "account" : "accounts"}
              </span>
            </div>
          </div>

          {bizUsersLoading ? (
            <div className="text-center py-12 text-muted-foreground">Loading...</div>
          ) : bizUsers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center gap-4">
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
                          onClick={() => setPendingDeleteBizUserId(u.id)}
                          disabled={deletingBizUserId === u.id}
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
      </div>
    </>
  );
}
