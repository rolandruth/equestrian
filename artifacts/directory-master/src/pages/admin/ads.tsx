import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { Plus, Pencil, Trash2, ImagePlus, BarChart2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

type Ad = {
  id: number;
  title: string;
  advertiser: string | null;
  imageUrl: string;
  linkUrl: string;
  placement: string;
  active: boolean;
  startsAt: string | null;
  endsAt: string | null;
  impressions: number;
  clicks: number;
  createdAt: string;
};

const PLACEMENTS = [
  { value: "sidebar", label: "Browse Sidebar" },
  { value: "browse_inline", label: "Browse — Between Cards" },
  { value: "homepage", label: "Homepage" },
  { value: "entry_page", label: "Entry Detail Page" },
];

const EMPTY_FORM = {
  title: "",
  advertiser: "",
  imageUrl: "",
  linkUrl: "",
  placement: "sidebar",
  active: false,
  startsAt: "",
  endsAt: "",
};

function placementLabel(val: string) {
  return PLACEMENTS.find((p) => p.value === val)?.label ?? val;
}

export default function AdminAdsPage() {
  const { token } = useAuth();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAd, setEditingAd] = useState<Ad | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const imageInputRef = useRef<HTMLInputElement>(null);

  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  const { data: adsList = [], isLoading } = useQuery<Ad[]>({
    queryKey: ["ads"],
    queryFn: () =>
      fetch("/api/ads", { headers }).then((r) => r.json()),
    enabled: !!token,
  });

  // Placements already used by other ads (not the one being edited)
  const takenPlacements = adsList
    .filter((a) => !editingAd || a.id !== editingAd.id)
    .map((a) => a.placement);

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      fetch(`/api/ads/${id}`, { method: "DELETE", headers }).then((r) => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ads"] }); setDeleteId(null); },
  });

  const openCreate = () => {
    setEditingAd(null);
    setForm(EMPTY_FORM);
    setSaveError(null);
    setDialogOpen(true);
  };

  const openEdit = (ad: Ad) => {
    setEditingAd(ad);
    setSaveError(null);
    setForm({
      title: ad.title,
      advertiser: ad.advertiser ?? "",
      imageUrl: ad.imageUrl,
      linkUrl: ad.linkUrl,
      placement: ad.placement,
      active: ad.active,
      startsAt: ad.startsAt ? ad.startsAt.slice(0, 10) : "",
      endsAt: ad.endsAt ? ad.endsAt.slice(0, 10) : "",
    });
    setDialogOpen(true);
  };

  const handleImageUpload = async (file: File) => {
    setUploading(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const res = await fetch("/api/ads/upload-image", {
        method: "POST",
        headers,
        body: JSON.stringify({ data: base64, contentType: file.type }),
      });
      const data = await res.json();
      if (data.url) setForm((f) => ({ ...f, imageUrl: data.url }));
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!form.title || !form.imageUrl || !form.linkUrl || !form.placement) return;
    setSaving(true);
    setSaveError(null);
    try {
      const body = {
        title: form.title,
        advertiser: form.advertiser || null,
        imageUrl: form.imageUrl,
        linkUrl: form.linkUrl,
        placement: form.placement,
        active: form.active,
        startsAt: form.startsAt || null,
        endsAt: form.endsAt || null,
      };
      const url = editingAd ? `/api/ads/${editingAd.id}` : "/api/ads";
      const method = editingAd ? "PATCH" : "POST";
      const res = await fetch(url, { method, headers, body: JSON.stringify(body) });
      if (!res.ok) {
        const data = await res.json();
        setSaveError(data.error ?? "Failed to save ad.");
        return;
      }
      qc.invalidateQueries({ queryKey: ["ads"] });
      setDialogOpen(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Ads</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage self-serve banner ads shown across the directory.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" />
          New Ad
        </Button>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : adsList.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <BarChart2 className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-muted-foreground">No ads yet. Create your first one.</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Image</TableHead>
              <TableHead>Title / Advertiser</TableHead>
              <TableHead>Placement</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Impressions</TableHead>
              <TableHead className="text-right">Clicks</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {adsList.map((ad) => (
              <TableRow key={ad.id}>
                <TableCell>
                  <img
                    src={ad.imageUrl}
                    alt={ad.title}
                    className="h-12 w-24 object-cover rounded border"
                  />
                </TableCell>
                <TableCell>
                  <p className="font-medium text-sm">{ad.title}</p>
                  {ad.advertiser && (
                    <p className="text-xs text-muted-foreground">{ad.advertiser}</p>
                  )}
                </TableCell>
                <TableCell>
                  <span className="text-sm">{placementLabel(ad.placement)}</span>
                </TableCell>
                <TableCell>
                  {ad.active ? (
                    <Badge variant="default" className="bg-green-600 hover:bg-green-600">Active</Badge>
                  ) : (
                    <Badge variant="secondary">Inactive</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right text-sm">{ad.impressions.toLocaleString()}</TableCell>
                <TableCell className="text-right text-sm">
                  {ad.clicks.toLocaleString()}
                  {ad.impressions > 0 && (
                    <span className="text-xs text-muted-foreground ml-1">
                      ({((ad.clicks / ad.impressions) * 100).toFixed(1)}%)
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2 justify-end">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(ad)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setDeleteId(ad.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingAd ? "Edit Ad" : "New Ad"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Title (internal)</Label>
                <Input
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. TackShack — Fall Sale"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Advertiser (optional)</Label>
                <Input
                  value={form.advertiser}
                  onChange={(e) => setForm((f) => ({ ...f, advertiser: e.target.value }))}
                  placeholder="Advertiser name"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Destination URL</Label>
              <Input
                value={form.linkUrl}
                onChange={(e) => setForm((f) => ({ ...f, linkUrl: e.target.value }))}
                placeholder="https://example.com"
                type="url"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Placement</Label>
              <Select
                value={form.placement}
                onValueChange={(v) => setForm((f) => ({ ...f, placement: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PLACEMENTS.map((p) => {
                    const taken = takenPlacements.includes(p.value);
                    return (
                      <SelectItem key={p.value} value={p.value} disabled={taken}>
                        {p.label}{taken ? " — sold" : ""}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            {saveError && (
              <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">{saveError}</p>
            )}

            <div className="space-y-1.5">
              <Label>Ad Image</Label>
              <div className="flex gap-3 items-start">
                {form.imageUrl && (
                  <img
                    src={form.imageUrl}
                    alt="Preview"
                    className="h-16 rounded border object-cover"
                  />
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => imageInputRef.current?.click()}
                  disabled={uploading}
                >
                  <ImagePlus className="h-4 w-4 mr-2" />
                  {uploading ? "Uploading…" : "Upload Image"}
                </Button>
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/gif,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleImageUpload(file);
                  }}
                />
              </div>
              <p className="text-xs text-muted-foreground">PNG, JPG, GIF, or WebP — max 5 MB</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Start Date (optional)</Label>
                <Input
                  type="date"
                  value={form.startsAt}
                  onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>End Date (optional)</Label>
                <Input
                  type="date"
                  value={form.endsAt}
                  onChange={(e) => setForm((f) => ({ ...f, endsAt: e.target.value }))}
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Switch
                id="active"
                checked={form.active}
                onCheckedChange={(v) => setForm((f) => ({ ...f, active: v }))}
              />
              <Label htmlFor="active">Active (show this ad now)</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleSave}
              disabled={saving || !form.title || !form.imageUrl || !form.linkUrl}
            >
              {saving ? "Saving…" : editingAd ? "Save Changes" : "Create Ad"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Ad?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">This will permanently remove the ad and all its stats.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deleteId !== null && deleteMutation.mutate(deleteId)}
              disabled={deleteMutation.isPending}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
