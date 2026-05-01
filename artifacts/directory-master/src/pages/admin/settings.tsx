import { useEffect, useState } from "react";
import { Link } from "wouter";
import { 
  useGetSettings, 
  useUpdateSettings,
  getGetSettingsQueryKey,
  getGetPublicSettingsQueryKey
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
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, Layout, Home, Search, FileText, ArrowRight, Paintbrush } from "lucide-react";
import { TemplateEditor } from "@/components/template/TemplateEditor";
import { mergeTemplateSettings, type TemplateSettings } from "@/lib/templateTypes";

const settingsSchema = z.object({
  siteTitle: z.string().min(2, "Site title is required"),
  logoUrl: z.string().url("Must be a valid URL").optional().or(z.literal("")).nullable(),
  homepageHeadline: z.string().optional().nullable(),
  homepageDescription: z.string().optional().nullable(),
  themeColor: z.string().optional().nullable(),
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

export default function AdminSettingsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const { data: settings, isLoading } = useGetSettings();
  const updateMutation = useUpdateSettings();

  const [templateSettings, setTemplateSettings] = useState<TemplateSettings>(
    mergeTemplateSettings(null)
  );

  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      siteTitle: "",
      logoUrl: "",
      homepageHeadline: "",
      homepageDescription: "",
      themeColor: "",
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
        themeColor: settings.themeColor || "",
        calloutSections: settings.calloutSections || "",
      });
      setTemplateSettings(mergeTemplateSettings((settings as any).templateSettings));
    }
  }, [settings, form]);

  const onSubmit = async (data: SettingsFormValues) => {
    const cleanData = Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, v === "" ? null : v])
    ) as any;

    try {
      await updateMutation.mutateAsync({ data: { ...cleanData, templateSettings } });
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
                    <FormLabel>Logo URL</FormLabel>
                    <FormControl>
                      <Input placeholder="https://example.com/logo.png" {...field} value={field.value || ''} />
                    </FormControl>
                    <FormDescription>Absolute URL to your site's logo image.</FormDescription>
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
            </CardContent>
          </Card>

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
    </div>
  );
}
