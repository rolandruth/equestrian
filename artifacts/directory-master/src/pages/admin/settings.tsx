import { useEffect, useState, useRef, type Dispatch, type SetStateAction } from "react";
import { Link } from "wouter";
import { 
  useGetSettings, 
  useUpdateSettings,
  getGetSettingsQueryKey,
  getGetPublicSettingsQueryKey,
  useSendSmtpTestEmail,
  useGetCurrentUser,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, Layout, Home, Search, FileText, ArrowRight, Paintbrush, KeyRound, Pencil, Trash2, Check, X, Copy, Map, Upload, Mail, Send, Images, Plus, Eye, EyeOff, Image as ImageIcon, Menu } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { TemplateEditor } from "@/components/template/TemplateEditor";
import { mergeTemplateSettings, type TemplateSettings, type SectionConfig } from "@/lib/templateTypes";

const NAV_LINK_ITEMS: { key: string; label: string; description: string }[] = [
  { key: "home", label: "Home", description: "Link to the homepage." },
  { key: "browse", label: "Browse All", description: "Link to the category browse page." },
  { key: "listingPlans", label: "Listing Plans", description: "Link to the pricing/upgrade page." },
  { key: "advertise", label: "Advertise", description: "Link to the advertise-with-us page." },
  { key: "signIn", label: "Admin Sign In", description: "Admin/editor staff login link." },
  { key: "businessLogin", label: "Business Login", description: "Business-owner login/signup link." },
];

function getNavLinksWithDefaults(navLinks: Record<string, boolean> | null | undefined) {
  const result: Record<string, boolean> = {};
  for (const item of NAV_LINK_ITEMS) {
    result[item.key] = navLinks?.[item.key] !== false;
  }
  return result;
}

const settingsSchema = z.object({
  siteTitle: z.string().min(2, "Site title is required"),
  logoUrl: z.string().optional().or(z.literal("")).nullable(),
  homepageHeadline: z.string().optional().nullable(),
  homepageDescription: z.string().optional().nullable(),
  heroHeadlineColor: z.string().optional().nullable(),
  heroSubtitleColor: z.string().optional().nullable(),
  themeColor: z.string().optional().nullable(),
  navbarBgColor: z.string().optional().nullable(),
  navbarTextColor: z.string().optional().nullable(),
  heroSearchPlaceholder: z.string().optional().nullable(),
  heroSearchButtonText: z.string().optional().nullable(),
  heroSearchButtonColor: z.string().optional().nullable(),
  heroSearchButtonTextColor: z.string().optional().nullable(),
  faviconUrl: z.string().optional().or(z.literal("")).nullable(),
  footerText: z.string().optional().nullable(),
  privacyPolicyUrl: z.string().url("Must be a valid URL").optional().or(z.literal("")).nullable(),
  termsUrl: z.string().url("Must be a valid URL").optional().or(z.literal("")).nullable(),
  headScripts: z.string().optional().nullable(),
  bodyScripts: z.string().optional().nullable(),
  calloutSections: z.string().optional().nullable(),
});

type SettingsFormValues = z.infer<typeof settingsSchema>;

const BUILDER_PAGES = [
  {
    key: "homepage",
    label: "Homepage",
    description: "Hero, category grid, featured & recent sections",
    icon: Home,
    color: "bg-violet-50 dark:bg-violet-950/30 border-violet-200 dark:border-violet-800",
    iconColor: "text-violet-600 dark:text-violet-400",
    badgeColor: "bg-violet-100 dark:bg-violet-900 text-violet-700 dark:text-violet-300",
  },
  {
    key: "browse",
    label: "Browse / Categories",
    description: "Search filters, category sidebar & entry card grid",
    icon: Search,
    color: "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800",
    iconColor: "text-blue-600 dark:text-blue-400",
    badgeColor: "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300",
  },
  {
    key: "entry",
    label: "Entry Detail",
    description: "Title, description, details sidebar & related entries",
    icon: FileText,
    color: "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800",
    iconColor: "text-emerald-600 dark:text-emerald-400",
    badgeColor: "bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300",
  },
];

function GeminiApiKeyCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useGetSettings();
  const updateMutation = useUpdateSettings();

  const [editing, setEditing] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const keySet: boolean = (settings as any)?.geminiApiKeySet ?? false;
  const keyHint: string | null = (settings as any)?.geminiApiKeyHint ?? null;

  const handleSaveKey = async () => {
    if (!keyInput.trim()) return;
    setSaving(true);
    try {
      await updateMutation.mutateAsync({ data: { geminiApiKey: keyInput.trim() } as any });
      queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
      toast({ title: "Gemini API key saved" });
      setKeyInput("");
      setEditing(false);
    } catch (e: any) {
      toast({ title: "Failed to save key", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteKey = async () => {
    setDeleting(true);
    try {
      await updateMutation.mutateAsync({ data: { geminiApiKey: null } as any });
      queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
      toast({ title: "Gemini API key removed — using built-in key" });
    } catch (e: any) {
      toast({ title: "Failed to remove key", description: e.message, variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  if (isLoading) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-primary" />
          Gemini API Key
        </CardTitle>
        <CardDescription>
          Optionally supply your own Google Gemini API key. When set it will be used for CSV import and SEO generation instead of the built-in key. The key is stored securely and never exposed to visitors or editors.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!editing ? (
          <div className="flex items-center gap-3">
            <div className="flex-1">
              {keySet && keyHint ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm font-mono bg-muted px-3 py-1.5 rounded-md border">
                    {keyHint}
                  </span>
                  <span className="text-xs text-muted-foreground">Custom key active</span>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Not configured — using the built-in Replit integration key.
                </p>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setKeyInput(""); setEditing(true); }}
              className="gap-1.5"
            >
              <Pencil className="h-3.5 w-3.5" />
              {keySet ? "Replace" : "Add Key"}
            </Button>
            {keySet && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleDeleteKey}
                disabled={deleting}
                className="gap-1.5 text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/10"
              >
                {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                Remove
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input
                type="password"
                placeholder="Paste your Gemini API key here..."
                value={keyInput}
                onChange={e => setKeyInput(e.target.value)}
                className="font-mono text-sm flex-1"
                autoFocus
              />
              <Button
                onClick={handleSaveKey}
                disabled={saving || !keyInput.trim()}
                className="gap-1.5 shrink-0"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Save
              </Button>
              <Button
                variant="outline"
                onClick={() => { setEditing(false); setKeyInput(""); }}
                className="gap-1.5 shrink-0"
              >
                <X className="h-4 w-4" />
                Cancel
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              The key is stored encrypted on the server and never sent back to your browser in full.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SitemapUrlField() {
  const [copied, setCopied] = useState(false);
  const sitemapUrl = `${window.location.origin}/sitemap.xml`;

  const handleCopy = () => {
    navigator.clipboard.writeText(sitemapUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium mb-1.5">Your Sitemap URL</p>
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-md border bg-muted/40 text-sm font-mono text-muted-foreground select-all overflow-x-auto">
            {sitemapUrl}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCopy}
            className="shrink-0 gap-1.5"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-green-600" />
                <span className="text-green-600">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                Copy
              </>
            )}
          </Button>
        </div>
      </div>
      <div className="rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 px-4 py-3 text-sm text-blue-800 dark:text-blue-300 space-y-1">
        <p className="font-medium">How to submit to Google Search Console</p>
        <ol className="list-decimal list-inside space-y-0.5 text-blue-700 dark:text-blue-400">
          <li>Go to <a href="https://search.google.com/search-console" target="_blank" rel="noopener noreferrer" className="underline">search.google.com/search-console</a></li>
          <li>Select your property, then open <strong>Sitemaps</strong> in the left menu</li>
          <li>Paste the URL above into the "Add a new sitemap" field and click Submit</li>
        </ol>
      </div>
      <p className="text-xs text-muted-foreground">
        The sitemap automatically includes your homepage, browse page, and all published entries. It updates in real time as entries are published.
      </p>
    </div>
  );
}

function SmtpSettingsCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useGetSettings();
  const updateMutation = useUpdateSettings();
  const sendTestMutation = useSendSmtpTestEmail();
  const { data: currentUser } = useGetCurrentUser();

  const [editing, setEditing] = useState(false);
  const [host, setHost] = useState("");
  const [port, setPort] = useState("");
  const [user, setUser] = useState("");
  const [from, setFrom] = useState("");
  const [pass, setPass] = useState("");
  const [saving, setSaving] = useState(false);
  const [testingEmail, setTestingEmail] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [testDialogOpen, setTestDialogOpen] = useState(false);

  const s = settings as any;
  const configured: boolean = !!(s?.smtpHost && s?.smtpPort && s?.smtpUser && s?.smtpPassSet);

  const startEditing = () => {
    setHost(s?.smtpHost ?? "");
    setPort(s?.smtpPort ? String(s.smtpPort) : "");
    setUser(s?.smtpUser ?? "");
    setFrom(s?.smtpFrom ?? "");
    setPass("");
    setEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const data: Record<string, unknown> = {
        smtpHost: host.trim() || null,
        smtpPort: port.trim() || null,
        smtpUser: user.trim() || null,
        smtpFrom: from.trim() || null,
      };
      // Only overwrite the stored password if a new one was typed, so leaving
      // it blank keeps the existing credential instead of clearing it.
      if (pass.trim()) data.smtpPass = pass.trim();
      await updateMutation.mutateAsync({ data: data as any });
      queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
      toast({ title: "Email settings saved" });
      setEditing(false);
    } catch (e: any) {
      toast({ title: "Failed to save email settings", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const openTestDialog = () => {
    setTestTo((currentUser as any)?.email ?? "");
    setTestDialogOpen(true);
  };

  const handleSendTest = async () => {
    setTestingEmail(true);
    try {
      const result = await sendTestMutation.mutateAsync({
        data: { to: testTo.trim() || null },
      });
      if ((result as any)?.success) {
        toast({ title: "Test email sent", description: (result as any).message });
        setTestDialogOpen(false);
      } else {
        toast({
          title: "Test email failed",
          description: (result as any)?.message ?? "Could not send test email",
          variant: "destructive",
        });
      }
    } catch (e: any) {
      toast({
        title: "Test email failed",
        description: e?.message ?? "Could not send test email",
        variant: "destructive",
      });
    } finally {
      setTestingEmail(false);
    }
  };

  const handleClear = async () => {
    setSaving(true);
    try {
      await updateMutation.mutateAsync({
        data: { smtpHost: null, smtpPort: null, smtpUser: null, smtpFrom: null, smtpPass: null } as any,
      });
      queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
      toast({ title: "Email settings removed" });
      setEditing(false);
    } catch (e: any) {
      toast({ title: "Failed to remove email settings", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5 text-primary" />
          Email (SMTP)
        </CardTitle>
        <CardDescription>
          Used to send transactional emails, such as reminding a business owner when a Featured/Premium badge is about to lapse. Enter the SMTP credentials from your email provider (e.g. SendGrid, Mailgun, Gmail, or your own mail server).
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!editing ? (
          <div className="flex items-center gap-3">
            <div className="flex-1">
              {configured ? (
                <div className="text-sm">
                  <div><span className="text-muted-foreground">Host:</span> {s.smtpHost}:{s.smtpPort}</div>
                  <div><span className="text-muted-foreground">User:</span> {s.smtpUser}</div>
                  <div><span className="text-muted-foreground">Password:</span> <span className="font-mono">{s.smtpPassHint}</span></div>
                  {s.smtpFrom && <div><span className="text-muted-foreground">From:</span> {s.smtpFrom}</div>}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Not configured — reminder emails will be skipped until SMTP is set up.
                </p>
              )}
            </div>
            {configured && (
              <Button variant="outline" size="sm" onClick={openTestDialog} className="gap-1.5">
                <Send className="h-3.5 w-3.5" />
                Send Test Email
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={startEditing} className="gap-1.5">
              <Pencil className="h-3.5 w-3.5" />
              {configured ? "Edit" : "Set Up"}
            </Button>
            {configured && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleClear}
                disabled={saving}
                className="gap-1.5 text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/10"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                Remove
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">SMTP Host</label>
                <Input placeholder="smtp.example.com" value={host} onChange={e => setHost(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">SMTP Port</label>
                <Input placeholder="587" value={port} onChange={e => setPort(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Username</label>
                <Input placeholder="username" value={user} onChange={e => setUser(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Password</label>
                <Input
                  type="password"
                  placeholder={configured ? "Leave blank to keep current password" : "password"}
                  value={pass}
                  onChange={e => setPass(e.target.value)}
                />
              </div>
              <div className="space-y-1.5 col-span-2">
                <label className="text-sm font-medium">From Address (optional)</label>
                <Input placeholder="noreply@yourdomain.com" value={from} onChange={e => setFrom(e.target.value)} />
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSave} disabled={saving || !host.trim() || !port.trim() || !user.trim()} className="gap-1.5">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Save
              </Button>
              <Button variant="outline" onClick={() => setEditing(false)} className="gap-1.5">
                <X className="h-4 w-4" />
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CardContent>

      <Dialog open={testDialogOpen} onOpenChange={setTestDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Test Email</DialogTitle>
            <DialogDescription>
              Sends a short test message using your saved SMTP settings so you can confirm they work before relying on them for reminder emails.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Send to</label>
            <Input
              type="email"
              placeholder="you@example.com"
              value={testTo}
              onChange={e => setTestTo(e.target.value)}
            />
          </div>
          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={() => setTestDialogOpen(false)} disabled={testingEmail}>
              Cancel
            </Button>
            <Button onClick={handleSendTest} disabled={testingEmail || !testTo.trim()} className="gap-1.5">
              {testingEmail ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send Test Email
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function HomepageGalleryCard({
  templateSettings,
  setTemplateSettings,
}: {
  templateSettings: TemplateSettings;
  setTemplateSettings: Dispatch<SetStateAction<TemplateSettings>>;
}) {
  const section = templateSettings.homepage.sections.find(s => (s.type ?? s.id) === "custom-image-row");
  const urls: string[] = section?.props?.imageUrls?.length ? section.props.imageUrls : [""];
  const enabled = section?.enabled ?? false;

  const updateSection = (patch: Partial<SectionConfig> & { props?: Partial<SectionConfig["props"]> }) => {
    setTemplateSettings(prev => {
      const exists = prev.homepage.sections.some(s => (s.type ?? s.id) === "custom-image-row");
      const nextSections = exists
        ? prev.homepage.sections.map(s =>
            (s.type ?? s.id) === "custom-image-row"
              ? { ...s, ...patch, props: { ...s.props, ...patch.props } }
              : s
          )
        : [
            ...prev.homepage.sections,
            {
              id: "custom-image-row",
              type: "custom-image-row",
              label: "Image Row",
              enabled: true,
              props: { imageUrls: [], aspectRatio: "4/3" },
              ...patch,
            } as SectionConfig,
          ];
      return { ...prev, homepage: { ...prev.homepage, sections: nextSections } };
    });
  };

  const setUrls = (next: string[]) => updateSection({ props: { imageUrls: next } });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Images className="h-5 w-5 text-primary" />
              Homepage Photo Gallery
            </CardTitle>
            <CardDescription className="mt-1.5">
              Manage the row of photos shown near the bottom of your homepage.
            </CardDescription>
          </div>
          <button
            type="button"
            onClick={() => updateSection({ enabled: !enabled })}
            title={enabled ? "Hide this section on the homepage" : "Show this section on the homepage"}
            className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-full border transition-colors ${
              enabled
                ? "bg-green-50 text-green-700 border-green-200 hover:bg-green-100 dark:bg-green-950/40 dark:text-green-400 dark:border-green-900"
                : "bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700"
            }`}
          >
            {enabled ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            {enabled ? "Visible" : "Hidden"}
          </button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {urls.map((url, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <div className="h-10 w-10 rounded border overflow-hidden flex-shrink-0 bg-muted flex items-center justify-center">
              {url ? (
                <img src={url} alt="" className="h-full w-full object-cover" />
              ) : (
                <ImageIcon className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
            <Input
              value={url}
              onChange={(e) => {
                const next = [...urls];
                next[idx] = e.target.value;
                setUrls(next);
              }}
              placeholder="https://example.com/photo.jpg"
              className="flex-1"
            />
            <button
              type="button"
              onClick={() => setUrls(urls.filter((_, i) => i !== idx))}
              disabled={urls.length <= 1}
              title="Remove photo"
              className="p-2 rounded text-muted-foreground hover:text-red-600 hover:bg-red-50 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground transition-colors flex-shrink-0"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => setUrls([...urls, ""])} className="w-full">
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Add Photo
        </Button>
      </CardContent>
    </Card>
  );
}

export default function AdminSettingsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const { data: settings, isLoading } = useGetSettings();
  const updateMutation = useUpdateSettings();

  const [templateSettings, setTemplateSettings] = useState<TemplateSettings>(
    mergeTemplateSettings(null)
  );
  const [navLinks, setNavLinks] = useState<Record<string, boolean>>(getNavLinksWithDefaults(null));

  const [logoUploading, setLogoUploading] = useState(false);
  const logoFileRef = useRef<HTMLInputElement>(null);
  const [faviconUploading, setFaviconUploading] = useState(false);
  const faviconFileRef = useRef<HTMLInputElement>(null);

  const handleFaviconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFaviconUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(",")[1];
        const res = await fetch("/api/settings/upload-favicon", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ data: base64, contentType: file.type || "image/x-icon" }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Upload failed");
        form.setValue("faviconUrl", json.url, { shouldDirty: true });
        toast({ title: "Favicon uploaded", description: "Click Save to apply it." });
      };
      reader.onerror = () => { throw new Error("Failed to read file"); };
      reader.readAsDataURL(file);
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setFaviconUploading(false);
      if (faviconFileRef.current) faviconFileRef.current.value = "";
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(",")[1];
        const res = await fetch("/api/settings/upload-logo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ data: base64, contentType: file.type }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Upload failed");
        form.setValue("logoUrl", json.url, { shouldDirty: true });
        toast({ title: "Logo uploaded", description: "Click Save to apply it." });
      };
      reader.onerror = () => { throw new Error("Failed to read file"); };
      reader.readAsDataURL(file);
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setLogoUploading(false);
      if (logoFileRef.current) logoFileRef.current.value = "";
    }
  };

  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      siteTitle: "",
      logoUrl: "",
      homepageHeadline: "",
      homepageDescription: "",
      heroHeadlineColor: "",
      heroSubtitleColor: "",
      themeColor: "",
      navbarBgColor: "",
      navbarTextColor: "",
      heroSearchPlaceholder: "",
      heroSearchButtonText: "",
      heroSearchButtonColor: "",
      heroSearchButtonTextColor: "",
      faviconUrl: "",
      footerText: "",
      privacyPolicyUrl: "",
      termsUrl: "",
      headScripts: "",
      bodyScripts: "",
      calloutSections: "",
    }
  });

  useEffect(() => {
    if (settings) {
      form.reset({
        siteTitle: settings.siteTitle,
        logoUrl: settings.logoUrl || "",
        homepageHeadline: settings.homepageHeadline || "",
        homepageDescription: settings.homepageDescription || "",
        heroHeadlineColor: (settings as any).heroHeadlineColor || "",
        heroSubtitleColor: (settings as any).heroSubtitleColor || "",
        themeColor: settings.themeColor || "",
        navbarBgColor: (settings as any).navbarBgColor || "",
        navbarTextColor: (settings as any).navbarTextColor || "",
        heroSearchPlaceholder: (settings as any).heroSearchPlaceholder || "",
        heroSearchButtonText: (settings as any).heroSearchButtonText || "",
        heroSearchButtonColor: (settings as any).heroSearchButtonColor || "",
        heroSearchButtonTextColor: (settings as any).heroSearchButtonTextColor || "",
        faviconUrl: (settings as any).faviconUrl || "",
        footerText: (settings as any).footerText || "",
        privacyPolicyUrl: (settings as any).privacyPolicyUrl || "",
        termsUrl: (settings as any).termsUrl || "",
        headScripts: (settings as any).headScripts || "",
        bodyScripts: (settings as any).bodyScripts || "",
        calloutSections: settings.calloutSections || "",
      });
      setTemplateSettings(mergeTemplateSettings((settings as any).templateSettings));
      setNavLinks(getNavLinksWithDefaults((settings as any).navLinks));
    }
  }, [settings, form]);

  const onSubmit = async (data: SettingsFormValues) => {
    const cleanData = Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, v === "" ? null : v])
    ) as any;

    try {
      await updateMutation.mutateAsync({ data: { ...cleanData, templateSettings, navLinks } });
      toast({ title: "Settings saved successfully" });
      queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetPublicSettingsQueryKey() });
    } catch (e: any) {
      toast({ title: "Error saving settings", description: e.message, variant: "destructive" });
    }
  };

  if (isLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6 max-w-4xl pb-20">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Site Settings</h1>
        <p className="text-gray-500 mt-1">Manage your directory's identity and appearance.</p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          
          {/* Brand Identity */}
          <Card>
            <CardHeader>
              <CardTitle>Brand Identity</CardTitle>
              <CardDescription>Global settings applied across your directory.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <FormField
                control={form.control}
                name="siteTitle"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Site Title *</FormLabel>
                    <FormControl>
                      <Input placeholder="Directory Master" {...field} value={field.value || ''} />
                    </FormControl>
                    <FormDescription>Displayed in the browser tab and header.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="logoUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Logo</FormLabel>
                    <div className="flex flex-col gap-2">
                      {field.value && (
                        <div className="flex items-center gap-3 p-2 border rounded-md bg-gray-50 dark:bg-gray-900">
                          <img src={field.value} alt="Logo preview" className="max-h-12 max-w-[160px] w-auto h-auto object-contain" />
                          <span className="text-xs text-muted-foreground truncate flex-1">{field.value}</span>
                          <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => field.onChange("")}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                      <div className="flex gap-2">
                        <FormControl>
                          <Input placeholder="https://example.com/logo.png or /logo.png" {...field} value={field.value || ''} />
                        </FormControl>
                        <input ref={logoFileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml" className="hidden" onChange={handleLogoUpload} />
                        <Button type="button" variant="outline" size="sm" className="shrink-0" disabled={logoUploading} onClick={() => logoFileRef.current?.click()}>
                          {logoUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Upload className="h-4 w-4 mr-1.5" />Upload</>}
                        </Button>
                      </div>
                    </div>
                    <FormDescription>Upload a logo file or paste a URL. Max 5 MB.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="themeColor"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Primary Theme Color</FormLabel>
                    <div className="flex items-center gap-3">
                      <Input
                        type="color"
                        className="w-12 h-10 p-1 cursor-pointer border-0 shadow-none"
                        {...field}
                        value={field.value || '#3b82f6'}
                      />
                      <FormControl>
                        <Input className="w-32 font-mono" placeholder="#3b82f6" {...field} value={field.value || ''} />
                      </FormControl>
                    </div>
                    <FormDescription>Hex color code used for buttons and highlights.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="pt-2 border-t">
                <p className="text-sm font-medium mb-4">Navigation Bar Colors</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="navbarBgColor"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Background Color</FormLabel>
                        <div className="flex items-center gap-3">
                          <Input
                            type="color"
                            className="w-12 h-10 p-1 cursor-pointer border-0 shadow-none"
                            value={field.value || '#ffffff'}
                            onChange={field.onChange}
                          />
                          <FormControl>
                            <Input
                              className="w-36 font-mono"
                              placeholder="#ffffff"
                              {...field}
                              value={field.value || ''}
                            />
                          </FormControl>
                          {field.value && (
                            <button
                              type="button"
                              onClick={() => field.onChange("")}
                              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                            >
                              Clear
                            </button>
                          )}
                        </div>
                        <FormDescription>Top bar background. Leave blank for the default white.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="navbarTextColor"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Text &amp; Icon Color</FormLabel>
                        <div className="flex items-center gap-3">
                          <Input
                            type="color"
                            className="w-12 h-10 p-1 cursor-pointer border-0 shadow-none"
                            value={field.value || '#111827'}
                            onChange={field.onChange}
                          />
                          <FormControl>
                            <Input
                              className="w-36 font-mono"
                              placeholder="#111827"
                              {...field}
                              value={field.value || ''}
                            />
                          </FormControl>
                          {field.value && (
                            <button
                              type="button"
                              onClick={() => field.onChange("")}
                              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                            >
                              Clear
                            </button>
                          )}
                        </div>
                        <FormDescription>Site title, nav links, and search icon color. Useful for white logos on dark headers.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                {/* Live preview strip */}
                {(form.watch("navbarBgColor") || form.watch("navbarTextColor")) && (
                  <div
                    className="mt-4 rounded-lg border px-4 py-3 flex items-center gap-3 text-sm font-medium transition-colors"
                    style={{
                      backgroundColor: form.watch("navbarBgColor") || undefined,
                      color: form.watch("navbarTextColor") || undefined,
                      borderColor: form.watch("navbarBgColor") ? "transparent" : undefined,
                    }}
                  >
                    <span className="font-bold text-base">{form.watch("siteTitle") || "Your Site"}</span>
                    <span className="mx-auto" />
                    <span className="opacity-70">Browse All</span>
                    <span className="opacity-70">Admin Sign In</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Header Navigation Links */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Menu className="h-5 w-5 text-primary" />
                Header Navigation
              </CardTitle>
              <CardDescription>Choose which links appear in the public site header (desktop and mobile menu).</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="divide-y">
                {NAV_LINK_ITEMS.map((item) => (
                  <div key={item.key} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                    <div>
                      <p className="text-sm font-medium">{item.label}</p>
                      <p className="text-sm text-muted-foreground">{item.description}</p>
                    </div>
                    <Switch
                      checked={navLinks[item.key] !== false}
                      onCheckedChange={(checked) =>
                        setNavLinks((prev) => ({ ...prev, [item.key]: checked }))
                      }
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Homepage Content */}
          <Card>
            <CardHeader>
              <CardTitle>Homepage Content</CardTitle>
              <CardDescription>Customize the hero section text of your directory.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <FormField
                control={form.control}
                name="homepageHeadline"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Hero Headline</FormLabel>
                    <FormControl>
                      <Input placeholder="Discover the best resources in tech" {...field} value={field.value || ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="heroHeadlineColor"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Headline Color</FormLabel>
                    <div className="flex items-center gap-3">
                      <Input
                        type="color"
                        className="w-12 h-10 p-1 cursor-pointer border-0 shadow-none"
                        value={field.value || '#ffffff'}
                        onChange={field.onChange}
                      />
                      <FormControl>
                        <Input className="w-36 font-mono" placeholder="#ffffff" {...field} value={field.value || ''} />
                      </FormControl>
                      {field.value && (
                        <button type="button" className="text-xs text-muted-foreground hover:text-foreground underline" onClick={() => field.onChange("")}>
                          Reset
                        </button>
                      )}
                    </div>
                    <FormDescription>Leave blank to use the default (white on images, dark on solid).</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="homepageDescription"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Hero Subtitle</FormLabel>
                    <FormControl>
                      <Textarea placeholder="A curated collection of tools..." rows={3} {...field} value={field.value || ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="heroSubtitleColor"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Subtitle Color</FormLabel>
                    <div className="flex items-center gap-3">
                      <Input
                        type="color"
                        className="w-12 h-10 p-1 cursor-pointer border-0 shadow-none"
                        value={field.value || '#e2e8f0'}
                        onChange={field.onChange}
                      />
                      <FormControl>
                        <Input className="w-36 font-mono" placeholder="#e2e8f0" {...field} value={field.value || ''} />
                      </FormControl>
                      {field.value && (
                        <button type="button" className="text-xs text-muted-foreground hover:text-foreground underline" onClick={() => field.onChange("")}>
                          Reset
                        </button>
                      )}
                    </div>
                    <FormDescription>Leave blank to use the default (light on images, dark on solid).</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="pt-2 border-t">
                <p className="text-sm font-medium mb-1">Hero Search Bar</p>
                <p className="text-sm text-muted-foreground mb-4">A prominent search field displayed in the centre of the hero banner.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="heroSearchPlaceholder"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Search Placeholder Text</FormLabel>
                        <FormControl>
                          <Input placeholder="Search directory..." {...field} value={field.value || ''} />
                        </FormControl>
                        <FormDescription>Hint text shown inside the search box.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="heroSearchButtonText"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Search Button Label</FormLabel>
                        <FormControl>
                          <Input placeholder="Search" {...field} value={field.value || ''} />
                        </FormControl>
                        <FormDescription>Label on the button next to the search field.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-6">
                  <FormField
                    control={form.control}
                    name="heroSearchButtonColor"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Search Button Color</FormLabel>
                        <FormControl>
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              className="w-10 h-9 rounded border cursor-pointer p-0.5"
                              value={field.value || "#3b82f6"}
                              onChange={e => field.onChange(e.target.value)}
                            />
                            <Input
                              className="font-mono text-sm"
                              placeholder="#3b82f6"
                              {...field}
                              value={field.value || ""}
                            />
                            {field.value && (
                              <button type="button" className="text-xs text-muted-foreground hover:text-foreground whitespace-nowrap" onClick={() => field.onChange("")}>
                                Reset
                              </button>
                            )}
                          </div>
                        </FormControl>
                        <FormDescription>Leave blank to use the theme color.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="heroSearchButtonTextColor"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Search Button Text Color</FormLabel>
                        <FormControl>
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              className="w-10 h-9 rounded border cursor-pointer p-0.5"
                              value={field.value || "#ffffff"}
                              onChange={e => field.onChange(e.target.value)}
                            />
                            <Input
                              className="font-mono text-sm"
                              placeholder="#ffffff"
                              {...field}
                              value={field.value || ""}
                            />
                            {field.value && (
                              <button type="button" className="text-xs text-muted-foreground hover:text-foreground whitespace-nowrap" onClick={() => field.onChange("")}>
                                Reset
                              </button>
                            )}
                          </div>
                        </FormControl>
                        <FormDescription>Leave blank to use white.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <HomepageGalleryCard templateSettings={templateSettings} setTemplateSettings={setTemplateSettings} />

          {/* Visual Page Builder */}
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Paintbrush className="h-5 w-5 text-primary" />
                    Visual Page Builder
                  </CardTitle>
                  <CardDescription className="mt-1.5">
                    Open the drag-and-drop builder to visually design each page — rearrange sections, 
                    add custom text and image blocks, and configure per-section styles.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {BUILDER_PAGES.map(page => {
                  const Icon = page.icon;
                  return (
                    <Link key={page.key} href={`/admin/builder/${page.key}`}>
                      <div className={`group border rounded-xl p-4 cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5 ${page.color}`}>
                        <div className="flex items-start justify-between mb-3">
                          <div className={`p-2 rounded-lg bg-white dark:bg-gray-900 shadow-sm border border-white/50 dark:border-gray-700`}>
                            <Icon className={`h-5 w-5 ${page.iconColor}`} />
                          </div>
                          <ArrowRight className={`h-4 w-4 ${page.iconColor} opacity-0 group-hover:opacity-100 transition-opacity mt-1`} />
                        </div>
                        <h4 className="font-semibold text-sm text-gray-800 dark:text-white mb-1">{page.label}</h4>
                        <p className="text-xs text-gray-500 dark:text-gray-400 leading-snug">{page.description}</p>
                        <div className={`mt-3 inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${page.badgeColor}`}>
                          <Paintbrush className="h-3 w-3" />
                          Open Builder
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Page Templates (fine-grained controls) */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Layout className="h-5 w-5" />
                Page Templates
              </CardTitle>
              <CardDescription>
                Fine-grained controls: fonts, banner images, section visibility and order, and field display for each page. 
                Changes here are saved along with all other settings when you click Save below.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TemplateEditor value={templateSettings} onChange={setTemplateSettings} />
            </CardContent>
          </Card>

          {/* Favicon */}
          <Card>
            <CardHeader>
              <CardTitle>Favicon</CardTitle>
              <CardDescription>The small icon shown in browser tabs and bookmarks for every page on your site.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="faviconUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Favicon</FormLabel>
                    <div className="flex flex-col gap-2">
                      {field.value && (
                        <div className="flex items-center gap-3 p-2 border rounded-md bg-gray-50 dark:bg-gray-900">
                          <img src={field.value} alt="Favicon preview" className="h-8 w-8 object-contain" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                          <span className="text-xs text-muted-foreground truncate flex-1">{field.value}</span>
                          <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => field.onChange("")}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                      <div className="flex gap-2">
                        <FormControl>
                          <Input placeholder="https://yoursite.com/favicon.ico or /favicon.ico" {...field} value={field.value || ""} />
                        </FormControl>
                        <input ref={faviconFileRef} type="file" accept=".ico,image/x-icon,image/png,image/svg+xml,image/webp" className="hidden" onChange={handleFaviconUpload} />
                        <Button type="button" variant="outline" size="sm" className="shrink-0" disabled={faviconUploading} onClick={() => faviconFileRef.current?.click()}>
                          {faviconUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Upload className="h-4 w-4 mr-1.5" />Upload</>}
                        </Button>
                      </div>
                    </div>
                    <FormDescription>
                      Upload an <code className="text-xs bg-muted px-1 rounded">.ico</code>, <code className="text-xs bg-muted px-1 rounded">.png</code>, or <code className="text-xs bg-muted px-1 rounded">.svg</code> file. Recommended: 32×32 px. Max 2 MB.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Sitemap */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Map className="h-5 w-5 text-muted-foreground" />
                XML Sitemap
              </CardTitle>
              <CardDescription>
                Submit your sitemap URL to Google Search Console to help search engines discover all your pages.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <SitemapUrlField />
            </CardContent>
          </Card>

          {/* Footer */}
          <Card>
            <CardHeader>
              <CardTitle>Footer</CardTitle>
              <CardDescription>Customize the bottom bar shown on every public page.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <FormField
                control={form.control}
                name="footerText"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Footer Text</FormLabel>
                    <FormControl>
                      <Input placeholder="© 2024 Your Company. All rights reserved." {...field} value={field.value || ''} />
                    </FormControl>
                    <FormDescription>Overrides the default copyright line. Leave blank to use the site title automatically.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="privacyPolicyUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Privacy Policy URL</FormLabel>
                      <FormControl>
                        <Input placeholder="https://example.com/privacy" {...field} value={field.value || ''} />
                      </FormControl>
                      <FormDescription>Shown as a link in the footer.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="termsUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Terms &amp; Conditions URL</FormLabel>
                      <FormControl>
                        <Input placeholder="https://example.com/terms" {...field} value={field.value || ''} />
                      </FormControl>
                      <FormDescription>Shown as a link in the footer.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          {/* Custom Code & Tracking */}
          <Card>
            <CardHeader>
              <CardTitle>Custom Code &amp; Tracking</CardTitle>
              <CardDescription>
                Inject scripts and styles into every public page — ideal for Google Tag Manager, Meta Pixel, Google Analytics, or any other tracking snippet.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <FormField
                control={form.control}
                name="headScripts"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Head Scripts / CSS</FormLabel>
                    <FormControl>
                      <Textarea
                        rows={6}
                        className="font-mono text-xs"
                        placeholder={`<!-- Google Tag Manager -->\n<script>(function(w,d,s,l,i){...})(window,document,'script','dataLayer','GTM-XXXXXX');</script>\n\n<!-- or any <style> block -->`}
                        {...field}
                        value={field.value || ''}
                      />
                    </FormControl>
                    <FormDescription>
                      Injected inside <code className="text-xs bg-muted px-1 rounded">&lt;head&gt;</code> on every public page. Paste full <code className="text-xs bg-muted px-1 rounded">&lt;script&gt;</code> or <code className="text-xs bg-muted px-1 rounded">&lt;style&gt;</code> tags.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="bodyScripts"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Body / Footer Scripts</FormLabel>
                    <FormControl>
                      <Textarea
                        rows={6}
                        className="font-mono text-xs"
                        placeholder={`<!-- Google Tag Manager (noscript) -->\n<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-XXXXXX"\nheight="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>`}
                        {...field}
                        value={field.value || ''}
                      />
                    </FormControl>
                    <FormDescription>
                      Injected at the end of <code className="text-xs bg-muted px-1 rounded">&lt;body&gt;</code> on every public page. Use for GTM noscript fallbacks, chat widgets, or other footer scripts.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Advanced */}
          <Card>
            <CardHeader>
              <CardTitle>Advanced</CardTitle>
              <CardDescription>Additional configuration for your directory.</CardDescription>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="calloutSections"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Custom Callout Sections (JSON)</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder='[{"title": "Submit a listing", "url": "/submit"}]' 
                        rows={5} 
                        className="font-mono text-sm"
                        {...field} 
                        value={field.value || ''} 
                      />
                    </FormControl>
                    <FormDescription>Valid JSON array to render custom blocks on the homepage.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button type="submit" disabled={updateMutation.isPending} size="lg">
              {updateMutation.isPending ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Save className="mr-2 h-5 w-5" />}
              Save Settings
            </Button>
          </div>
        </form>
      </Form>

      <GeminiApiKeyCard />
      <SmtpSettingsCard />
    </div>
  );
}
