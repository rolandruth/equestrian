import { useGetPublicSettings } from "@workspace/api-client-react";

export default function TermsPage() {
  const { data: settings } = useGetPublicSettings();
  const siteName = settings?.siteTitle || "SaddleUpGuide";

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold tracking-tight mb-2">Terms &amp; Conditions</h1>
      <p className="text-sm text-muted-foreground mb-8">Last updated: January 1, 2026</p>

      <div className="prose prose-gray dark:prose-invert max-w-none space-y-8 text-sm leading-relaxed text-gray-700 dark:text-gray-300">

        <section>
          <p>
            Please read these Terms &amp; Conditions carefully before using the {siteName} website.
            By accessing or using our site, you agree to be bound by these terms. If you do not agree,
            please do not use our services.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">1. About the Directory</h2>
          <p>
            {siteName} is an online directory of equestrian businesses, riding schools, stables, trainers,
            and related services. Listings are provided for informational purposes only. We do not endorse,
            warrant, or guarantee any listed business, product, or service.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">2. Use of the Site</h2>
          <p className="mb-3">By using {siteName}, you agree to:</p>
          <ul className="list-disc pl-6 space-y-2">
            <li>Use the site for lawful purposes only.</li>
            <li>Not attempt to gain unauthorized access to any part of the site or its backend systems.</li>
            <li>Not use any automated tools (bots, scrapers, crawlers) to access or harvest content without our written permission.</li>
            <li>Not post false, misleading, defamatory, or harmful content in reviews or contact forms.</li>
            <li>Not impersonate any person or entity or misrepresent your affiliation with any business.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">3. Listings and Accuracy</h2>
          <p>
            We strive to keep directory listings accurate and up to date, but we make no representations
            or warranties — express or implied — about the completeness, accuracy, reliability, or
            availability of any listing. Business hours, contact details, pricing, and services may
            change without notice. Always verify information directly with the business before visiting
            or making a booking.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">4. User Reviews</h2>
          <p className="mb-3">
            Users may submit reviews for listed businesses. By submitting a review, you represent that:
          </p>
          <ul className="list-disc pl-6 space-y-2">
            <li>The review reflects your genuine, first-hand experience.</li>
            <li>The content is truthful and not defamatory, harassing, or fraudulent.</li>
            <li>You grant {siteName} a non-exclusive, royalty-free license to display and moderate the review.</li>
          </ul>
          <p className="mt-3">
            We reserve the right to remove any review that violates these terms or that we determine,
            in our sole discretion, to be harmful, misleading, or inappropriate.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">5. Intellectual Property</h2>
          <p>
            All content on this site — including text, design, graphics, logos, and software — is owned
            by or licensed to {siteName} and is protected by applicable intellectual property laws. You
            may not reproduce, distribute, or create derivative works from our content without express
            written permission.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">6. Third-Party Links</h2>
          <p>
            Our site may contain links to external websites. These links are provided for convenience only.
            We have no control over the content or practices of third-party sites and accept no
            responsibility for them. Visiting a linked site is at your own risk.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">7. Disclaimer of Warranties</h2>
          <p>
            The site and its content are provided on an "as is" and "as available" basis without any
            warranties of any kind, either express or implied. We do not warrant that the site will be
            uninterrupted, error-free, or free of viruses or other harmful components.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">8. Limitation of Liability</h2>
          <p>
            To the fullest extent permitted by law, {siteName} shall not be liable for any indirect,
            incidental, special, consequential, or punitive damages arising from your use of (or inability
            to use) this site or its content, even if we have been advised of the possibility of such damages.
            Our total liability for any claim related to the site shall not exceed $100.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">9. Indemnification</h2>
          <p>
            You agree to indemnify, defend, and hold harmless {siteName} and its operators from any claims,
            damages, liabilities, costs, or expenses (including legal fees) arising from your use of the
            site, your violation of these terms, or your submission of inaccurate content.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">10. Governing Law</h2>
          <p>
            These Terms &amp; Conditions are governed by and construed in accordance with the laws of the
            United States, without regard to its conflict of law provisions. Any disputes shall be resolved
            exclusively in the courts of competent jurisdiction in the United States.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">11. Changes to These Terms</h2>
          <p>
            We reserve the right to update or modify these Terms &amp; Conditions at any time. Changes
            take effect when posted on this page with an updated date. Your continued use of the site
            after any changes constitutes your acceptance of the new terms.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">12. Contact Us</h2>
          <p>
            If you have questions about these Terms &amp; Conditions, please reach out to:
          </p>
          <address className="not-italic mt-3 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border">
            <strong>{siteName}</strong><br />
            Email: <a href="mailto:info@saddleupguide.com" className="text-primary hover:underline">info@saddleupguide.com</a>
          </address>
        </section>

      </div>
    </div>
  );
}
