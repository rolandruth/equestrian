import { useGetPublicSettings } from "@workspace/api-client-react";

export default function PrivacyPolicyPage() {
  const { data: settings } = useGetPublicSettings();
  const siteName = settings?.siteTitle || "SaddleUpGuide";

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold tracking-tight mb-2">Privacy Policy</h1>
      <p className="text-sm text-muted-foreground mb-8">Last updated: January 1, 2026</p>

      <div className="prose prose-gray dark:prose-invert max-w-none space-y-8 text-sm leading-relaxed text-gray-700 dark:text-gray-300">

        <section>
          <p>
            Welcome to {siteName}. We are committed to protecting your personal information and your right
            to privacy. This Privacy Policy explains how we collect, use, and safeguard information when
            you visit our website or use our directory services.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">1. Information We Collect</h2>
          <p className="mb-3">We may collect the following types of information:</p>
          <ul className="list-disc pl-6 space-y-2">
            <li><strong>Information you provide directly</strong> — such as your name and email address when you submit a review, contact form, or listing inquiry.</li>
            <li><strong>Usage data</strong> — including pages visited, time spent on pages, and browser type, collected automatically via server logs and analytics tools.</li>
            <li><strong>Location data</strong> — city or region level only, derived from your IP address for the purpose of showing relevant nearby listings.</li>
            <li><strong>Cookies</strong> — small files placed on your device to remember your preferences and improve your experience.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">2. How We Use Your Information</h2>
          <p className="mb-3">We use the information we collect to:</p>
          <ul className="list-disc pl-6 space-y-2">
            <li>Operate and maintain the {siteName} directory.</li>
            <li>Display and moderate user-submitted reviews on listing pages.</li>
            <li>Respond to inquiries and contact form submissions.</li>
            <li>Improve and personalize your experience on our site.</li>
            <li>Monitor usage patterns to identify and fix technical issues.</li>
            <li>Send occasional service-related communications (we do not send marketing emails without explicit consent).</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">3. How We Share Your Information</h2>
          <p className="mb-3">
            We do not sell, trade, or rent your personal information to third parties. We may share
            information only in the following limited circumstances:
          </p>
          <ul className="list-disc pl-6 space-y-2">
            <li><strong>Service providers</strong> — trusted vendors who assist in operating our website (e.g., hosting, analytics), bound by confidentiality obligations.</li>
            <li><strong>Legal requirements</strong> — if required by law or in response to a valid legal request from a governmental authority.</li>
            <li><strong>Business transfers</strong> — in connection with a merger, acquisition, or sale of all or part of our assets, with appropriate notice to you.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">4. Cookies and Tracking</h2>
          <p className="mb-3">
            We use cookies and similar tracking technologies to improve your experience. You can instruct
            your browser to refuse all cookies or to indicate when a cookie is being sent. However, some
            parts of our site may not function properly if you disable cookies.
          </p>
          <p>
            We may use third-party analytics services (such as Google Analytics) that collect, monitor,
            and analyze usage data. These services have their own privacy policies governing their use
            of such information.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">5. Reviews and User-Submitted Content</h2>
          <p>
            When you submit a review on a listing page, your name and review content will be displayed
            publicly on that listing. Your email address, if provided, is stored privately and used only
            for administrative purposes. You may request removal of your review at any time by contacting us.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">6. Data Retention</h2>
          <p>
            We retain personal information for as long as necessary to fulfill the purposes outlined in
            this policy, unless a longer retention period is required or permitted by law. Review data
            is kept until removed by an administrator or upon request.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">7. Your Rights</h2>
          <p className="mb-3">Depending on your location, you may have the right to:</p>
          <ul className="list-disc pl-6 space-y-2">
            <li>Access the personal information we hold about you.</li>
            <li>Request correction of inaccurate data.</li>
            <li>Request deletion of your personal information.</li>
            <li>Opt out of certain data processing activities.</li>
          </ul>
          <p className="mt-3">
            To exercise any of these rights, please contact us using the information in Section 10 below.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">8. Security</h2>
          <p>
            We implement reasonable administrative, technical, and physical security measures to protect
            your personal information from unauthorized access, alteration, disclosure, or destruction.
            However, no internet transmission or electronic storage method is 100% secure, and we cannot
            guarantee absolute security.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">9. Children's Privacy</h2>
          <p>
            Our website is not directed to children under the age of 13. We do not knowingly collect
            personal information from children under 13. If you believe we have inadvertently collected
            such information, please contact us and we will promptly delete it.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">10. Contact Us</h2>
          <p>
            If you have questions or concerns about this Privacy Policy or our data practices, please
            contact us at:
          </p>
          <address className="not-italic mt-3 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border">
            <strong>{siteName}</strong><br />
            Email: <a href="mailto:info@saddleupguide.com" className="text-primary hover:underline">info@saddleupguide.com</a>
          </address>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">11. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. We will notify you of any significant
            changes by posting the new policy on this page with an updated date. We encourage you to
            review this page periodically.
          </p>
        </section>

      </div>
    </div>
  );
}
