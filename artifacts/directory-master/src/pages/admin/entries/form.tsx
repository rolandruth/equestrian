import { useEffect, useState } from "react";
import { useLocation, useParams } from "wouter";
import { 
  useGetEntry, 
  useCreateEntry, 
  useUpdateEntry,
  useListCategories,
  getGetEntryQueryKey,
  getListEntriesQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ArrowLeft, Save } from "lucide-react";

const entrySchema = z.object({
  title: z.string().min(1, "Title is required"),
  category: z.string().optional().nullable(),
  summary: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  contactEmail: z.string().email("Invalid email").optional().or(z.literal("")).nullable(),
  contactPhone: z.string().optional().nullable(),
  website: z.string().url("Invalid URL").optional().or(z.literal("")).nullable(),
  location: z.string().optional().nullable(),
  tags: z.string().optional().nullable(),
  moreDetails: z.string().optional().nullable(),
  published: z.boolean().default(false)
});

type EntryFormValues = z.infer<typeof entrySchema>;

export default function AdminEntryFormPage() {
  const [, setLocation] = useLocation();
  const { id } = useParams();
  const isEditing = !!id && id !== "new";
  const entryId = isEditing ? parseInt(id, 10) : 0;
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: categories } = useListCategories();
  
  const { data: entry, isLoading: isLoadingEntry } = useGetEntry(entryId, {
    query: { enabled: isEditing }
  });

  const createMutation = useCreateEntry();
  const updateMutation = useUpdateEntry();

  const form = useForm<EntryFormValues>({
    resolver: zodResolver(entrySchema),
    defaultValues: {
      title: "",
      category: "",
      summary: "",
      description: "",
      contactEmail: "",
      contactPhone: "",
      website: "",
      location: "",
      tags: "",
      moreDetails: "",
      published: false
    }
  });

  useEffect(() => {
    if (entry && isEditing) {
      form.reset({
        title: entry.title,
        category: entry.category || "",
        summary: entry.summary || "",
        description: entry.description || "",
        contactEmail: entry.contactEmail || "",
        contactPhone: entry.contactPhone || "",
        website: entry.website || "",
        location: entry.location || "",
        tags: entry.tags || "",
        moreDetails: entry.moreDetails || "",
        published: entry.published
      });
    }
  }, [entry, isEditing, form]);

  const onSubmit = async (data: EntryFormValues) => {
    // Clean up empty strings to null for API
    const cleanData = Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, v === "" ? null : v])
    ) as any;

    try {
      if (isEditing) {
        await updateMutation.mutateAsync({ id: entryId, data: cleanData });
        toast({ title: "Entry updated successfully" });
        queryClient.invalidateQueries({ queryKey: getGetEntryQueryKey(entryId) });
      } else {
        await createMutation.mutateAsync({ data: cleanData });
        toast({ title: "Entry created successfully" });
      }
      queryClient.invalidateQueries({ queryKey: getListEntriesQueryKey() });
      setLocation("/admin/entries");
    } catch (e: any) {
      toast({ title: "Error saving entry", description: e.message, variant: "destructive" });
    }
  };

  if (isEditing && isLoadingEntry) {
    return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6 max-w-4xl pb-20">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" onClick={() => window.history.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {isEditing ? "Edit Entry" : "New Entry"}
          </h1>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          <Card>
            <CardContent className="pt-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem className="col-span-1 md:col-span-2">
                      <FormLabel>Title</FormLabel>
                      <FormControl>
                        <Input placeholder="Business Name or Entry Title" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Category</FormLabel>
                      <Select key={field.value ?? "__empty__"} value={field.value || undefined} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a category" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {categories?.map(cat => (
                            <SelectItem key={cat.id} value={cat.name}>{cat.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="location"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Location</FormLabel>
                      <FormControl>
                        <Input placeholder="City, State or Address" {...field} value={field.value || ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="summary"
                  render={({ field }) => (
                    <FormItem className="col-span-1 md:col-span-2">
                      <FormLabel>Summary (Short description)</FormLabel>
                      <FormControl>
                        <Textarea placeholder="A brief 1-2 sentence description" rows={2} {...field} value={field.value || ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem className="col-span-1 md:col-span-2">
                      <FormLabel>Full Description</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Detailed description of the entry..." rows={6} {...field} value={field.value || ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6 space-y-6">
              <h3 className="text-lg font-semibold">Contact & Links</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="website"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Website</FormLabel>
                      <FormControl>
                        <Input type="url" placeholder="https://..." {...field} value={field.value || ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="contactEmail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="contact@example.com" {...field} value={field.value || ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="contactPhone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone</FormLabel>
                      <FormControl>
                        <Input placeholder="+1..." {...field} value={field.value || ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="tags"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tags</FormLabel>
                      <FormControl>
                        <Input placeholder="Comma separated (e.g. tech, design, b2b)" {...field} value={field.value || ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="moreDetails"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Additional JSON / Key-Value Details</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Any structured data extracted during import..." rows={4} className="font-mono text-sm" {...field} value={field.value || ''} />
                    </FormControl>
                    <FormDescription>Free text or JSON to display in the additional details section.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <FormField
                control={form.control}
                name="published"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Publish Status</FormLabel>
                      <FormDescription>
                        Make this entry visible on the public directory.
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <div className="flex justify-end gap-4">
            <Button type="button" variant="outline" onClick={() => setLocation("/admin/entries")}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save Entry
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
