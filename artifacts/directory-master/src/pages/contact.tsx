import { useGetPublicSettings } from "@workspace/api-client-react";
import { Mail } from "lucide-react";

export default function ContactPage() {
  const { data: settings } = useGetPublicSettings();
  const siteName = settings?.siteTitle || "SaddleUpGuide";

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <h1 className="text-3xl font-bold tracking-tight mb-3">Contact Us</h1>
      <p className="text-muted-foreground mb-10">
        Have a question, want to add or update a listing, or just want to say hello? We'd love to hear from you.
      </p>

      <div className="bg-gray-50 dark:bg-gray-900 border rounded-xl p-8 flex items-start gap-4">
        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Mail className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p className="font-semibold text-gray-900 dark:text-white mb-1">Email</p>
          <a
            href="mailto:info@saddleupguide.com"
            className="text-primary hover:underline text-lg"
          >
            info@saddleupguide.com
          </a>
          <p className="text-sm text-muted-foreground mt-2">
            We typically respond within 1–2 business days.
          </p>
        </div>
      </div>
    </div>
  );
}
