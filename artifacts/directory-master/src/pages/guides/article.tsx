import { useRoute, useLocation, Link } from "wouter";
import {
  BEGINNER_LESSON_EXPECTATIONS_PATH,
  getLessonGuide,
  LESSON_GUIDE_SEARCH_PATH,
  LESSON_GUIDE_BASE_PATH,
} from "@workspace/lesson-guides";
import { ChevronRight, ArrowLeft, Clock, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useGuideMetadata } from "./use-guide-metadata";

export default function GuideArticlePage() {
  const [location] = useLocation();
  const [, params] = useRoute("/horse-riding-lessons/:slug");
  const standaloneBeginnerPath = BEGINNER_LESSON_EXPECTATIONS_PATH.replace(/\/+$/, "");
  const slug = location.replace(/\/+$/, "") === standaloneBeginnerPath
    ? "beginners-what-to-expect"
    : params?.slug;
  const guide = slug ? getLessonGuide(slug) : undefined;

  useGuideMetadata(guide ? { kind: "article", guide } : { kind: "notFound" });

  // Invalid Slug State
  if (!guide) {
    return (
      <div className="w-full min-h-[70vh] flex flex-col items-center justify-center bg-background px-6 text-center">
        <div className="max-w-md mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto">
            <BookOpen className="w-8 h-8 text-muted-foreground" />
          </div>
          <h1 className="text-3xl font-serif font-bold text-foreground">Guide not found</h1>
          <p className="text-muted-foreground text-lg">
            We couldn't find the article you're looking for. It might have been moved or removed.
          </p>
          <Button asChild size="lg" className="rounded-full">
            <Link href={LESSON_GUIDE_BASE_PATH}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to all guides
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <article className="lesson-guide-surface w-full bg-background min-h-screen pb-20">
      {/* Breadcrumbs */}
      <div className="bg-card border-b border-border py-4">
        <div className="max-w-3xl mx-auto px-6 flex items-center text-sm text-muted-foreground overflow-x-auto whitespace-nowrap hide-scrollbar">
          <Link href="/" className="hover:text-foreground transition-colors">Home</Link>
          <ChevronRight className="w-4 h-4 mx-2 flex-shrink-0" />
          <Link href={LESSON_GUIDE_BASE_PATH} className="hover:text-foreground transition-colors">Riding Lesson Guides</Link>
          <ChevronRight className="w-4 h-4 mx-2 flex-shrink-0" />
          <span className="text-foreground font-medium truncate">{guide.shortTitle}</span>
        </div>
      </div>

      {/* Hero Header */}
      <header className="max-w-3xl mx-auto px-6 pt-16 pb-12 md:pt-24 md:pb-16 text-center animate-in fade-in slide-in-from-bottom-8 duration-700">
        <span className="inline-block px-4 py-1.5 rounded-full bg-secondary text-secondary-foreground text-xs font-bold uppercase tracking-widest mb-6">
          {guide.eyebrow}
        </span>
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-serif font-semibold text-foreground leading-tight mb-8">
          {guide.title}
        </h1>
        <p className="text-lg md:text-xl text-muted-foreground leading-relaxed mb-8 max-w-2xl mx-auto">
          {guide.summary}
        </p>
        <div className="flex items-center justify-center text-sm font-medium text-muted-foreground gap-2">
          <Clock className="w-4 h-4 text-primary" />
          {guide.readingTime}
        </div>
      </header>

      {/* Key Takeaways */}
      {guide.keyTakeaways && guide.keyTakeaways.length > 0 && (
        <div className="max-w-3xl mx-auto px-6 mb-16 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-150 fill-mode-both">
          <div className="bg-accent/40 border border-accent rounded-3xl p-8 md:p-10">
            <h3 className="text-xl font-serif font-bold text-foreground mb-6">Key Takeaways</h3>
            <ul className="space-y-4">
              {guide.keyTakeaways.map((takeaway: string, i: number) => (
                <li key={i} className="flex items-start">
                  <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center flex-shrink-0 mt-0.5 mr-4 text-xs font-bold">
                    {i + 1}
                  </div>
                  <span className="text-foreground/90 leading-relaxed text-base">{takeaway}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Article Content */}
      <div className="max-w-3xl mx-auto px-6 prose prose-lg prose-headings:font-serif prose-h2:text-3xl prose-h2:font-semibold prose-h2:mt-16 prose-h2:mb-6 prose-p:text-foreground/80 prose-p:leading-relaxed prose-p:mb-6 prose-li:text-foreground/80 animate-in fade-in duration-1000 delay-300 fill-mode-both">
        {guide.sections.map((section) => (
          <section key={section.heading}>
            <h2>{section.heading}</h2>
            {section.paragraphs?.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
            
            {section.bullets && section.bullets.length > 0 && (
              <ul className="my-6 space-y-2">
                {section.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            )}

            {section.callout && (
              <div className="my-10 pl-6 border-l-4 border-primary bg-card py-6 pr-6 rounded-r-2xl italic text-foreground/90 font-serif text-xl shadow-sm">
                {section.callout}
              </div>
            )}
          </section>
        ))}
      </div>

      <Separator className="max-w-3xl mx-auto my-16 bg-border/60" />

      {/* Directory CTA */}
      <div className="max-w-3xl mx-auto px-6 pb-20">
        <div className="bg-card border border-border p-8 rounded-3xl text-center flex flex-col justify-center">
          <h3 className="text-2xl font-serif font-bold text-foreground mb-4">Find an Instructor</h3>
          <p className="text-muted-foreground mb-8 text-sm leading-relaxed">
            Ready to put what you've learned into practice? Search the directory for local riding lesson providers.
          </p>
          <Button asChild className="w-full rounded-full bg-primary hover:bg-primary/90">
            <Link href={LESSON_GUIDE_SEARCH_PATH}>
              Search Directory
            </Link>
          </Button>
        </div>
      </div>
    </article>
  );
}