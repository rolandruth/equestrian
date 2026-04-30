import { useEffect } from "react";
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
import { Loader2, Save, Palette } from "lucide-react";

const settingsSchema = z.object({
  siteTitle: z.string().min(2, "Site title is required"),
  logoUrl: z.string().url("Must be a valid URL").optional().or(z.literal("")).nullable(),
  homepageHeadline: z.string().optional().nullable(),
  homepageDescription: z.string().optional().nullable(),
  themeColor: z.string().optional().nullable(),
  calloutSections: z.string().optional().nullable(),
});

type SettingsFormValues = z.infer<typeof settingsSchema>;

export default function AdminSettingsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const { data: settings, isLoading } = useGetSettings();
  const updateMutation = useUpdateSettings();

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
    }
  }, [settings, form]);

  const onSubmit = async (data: SettingsFormValues) => {
    // Clean up empty strings to null for API
    const cleanData = Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, v === "" ? null : v])
    ) as any;

    try {
      await updateMutation.mutateAsync({ data: cleanData });
      toast({ title: "Settings updated successfully" });
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
                      <div className="relative">
                        <Input type="color" className="w-12 h-10 p-1 cursor-pointer border-0 shadow-none" {...field} value={field.value || '#3b82f6'} />
                      </div>
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

          <Card>
            <CardHeader>
              <CardTitle>Homepage Content</CardTitle>
              <CardDescription>Customize the hero section of your directory.</CardDescription>
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
