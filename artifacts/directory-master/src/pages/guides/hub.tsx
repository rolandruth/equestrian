import { Link } from "wouter";
import { ArrowRight, BookOpen, ChevronRight } from "lucide-react";
import {
  getLessonGuidePath,
  lessonGuideHub,
  lessonGuides,
  LESSON_GUIDE_SEARCH_PATH,
} from "@workspace/lesson-guides";
import { Button } from "@/components/ui/button";
import { useGuideMetadata } from "./use-guide-metadata";

export default function GuideHubPage() {
  useGuideMetadata({ kind: "hub" });

  return (
    <div className="lesson-guide-surface w-full bg-background min-h-[100dvh] flex flex-col">
      {/* Hero Section */}
      <section className="relative px-6 py-16 md:py-24 lg:py-28 bg-card overflow-hidden">
        {/* Subtle background noise/texture effect */}
        <div className="absolute inset-0 pointer-events-none opacity-[0.015] mix-blend-multiply bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjgiPgo8cmVjdCB3aWR0aD0iOCIgaGVpZ2h0PSI4IiBmaWxsPSIjZmZmIiAvPgo8cGF0aCBkPSJNMCAwbDh2OEgwem04IDBMMCA4VjB6IiBmaWxsPSIjMDAwIiBmaWxsLW9wYWNpdHk9IjAuMDUiIC8+Cjwvc3ZnPg==')]" />
        
        <div className="relative max-w-5xl mx-auto z-10 text-center animate-in fade-in slide-in-from-bottom-8 duration-700">
          <nav aria-label="Breadcrumb" className="mb-10 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Link href="/" className="transition-colors hover:text-foreground">Home</Link>
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
            <span aria-current="page" className="text-foreground">Riding Lesson Guides</span>
          </nav>
          <span className="text-primary font-bold tracking-wider uppercase text-sm mb-4 block">{lessonGuideHub.eyebrow}</span>
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-serif text-foreground font-semibold leading-tight tracking-tight mb-6">
            Horse Riding <br className="hidden md:block" />
            <span className="text-primary italic">Lesson Guides</span>
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed mb-10">
            {lessonGuideHub.summary}
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button asChild size="lg" className="bg-primary text-primary-foreground hover:bg-primary/90 text-base px-8 h-14 rounded-full shadow-sm hover:shadow-md transition-all">
              <a href="#guides-list">Start Reading</a>
            </Button>
            <Button asChild variant="outline" size="lg" className="text-base px-8 h-14 rounded-full border-border hover:bg-secondary/50 transition-all">
              <Link href={LESSON_GUIDE_SEARCH_PATH}>
                Find Local Lessons
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Main Guides List */}
      <section id="guides-list" className="py-20 px-6 max-w-7xl mx-auto w-full">
        {lessonGuides.length === 0 ? (
          <div className="text-center py-20 bg-muted/50 rounded-2xl border border-border">
            <BookOpen className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-2xl font-serif font-medium mb-2">Guides are coming soon</h2>
            <p className="text-muted-foreground">We're currently writing our expert guides. Check back later!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10 lg:gap-14">
            {lessonGuides.map((guide, index) => (
              <Link 
                key={guide.slug}
                href={getLessonGuidePath(guide.slug)}
                className="group flex flex-col animate-in fade-in slide-in-from-bottom-8 duration-700 fill-mode-both"
                style={{ animationDelay: `${index * 150}ms` }}
              >
                <article className="h-full flex flex-col p-8 rounded-3xl bg-card border border-border shadow-sm hover:shadow-xl hover:border-primary/20 transition-all duration-500 ease-out transform group-hover:-translate-y-1">
                  <div className="flex items-center gap-3 mb-6">
                    <span className="px-3 py-1 rounded-full bg-secondary text-secondary-foreground text-xs font-semibold uppercase tracking-wider">
                      {guide.eyebrow}
                    </span>
                    <span className="text-muted-foreground text-sm flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5" />
                      {guide.readingTime}
                    </span>
                  </div>
                  
                  <h2 className="text-2xl md:text-3xl font-serif font-semibold text-foreground mb-4 leading-snug group-hover:text-primary transition-colors">
                    {guide.title}
                  </h2>
                  
                  <p className="text-muted-foreground leading-relaxed mb-8 flex-1 text-base md:text-lg">
                    {guide.description}
                  </p>
                  
                  <div className="flex items-center text-primary font-medium text-sm md:text-base mt-auto">
                    Read Full Guide 
                    <ArrowRight className="ml-2 w-4 h-4 transform group-hover:translate-x-1 transition-transform" />
                  </div>
                </article>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Directory CTA */}
      <section className="mt-auto border-t border-border bg-card py-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-serif font-semibold mb-6">Ready to get in the saddle?</h2>
          <p className="text-lg text-muted-foreground mb-10 max-w-2xl mx-auto">
            Browse local riding schools and instructors, then contact a provider to ask about availability, lesson formats, and beginner programs.
          </p>
          <Button asChild size="lg" className="bg-foreground text-background hover:bg-foreground/90 rounded-full h-14 px-10 text-base shadow-lg hover:shadow-xl transition-all">
            <Link href={LESSON_GUIDE_SEARCH_PATH}>
              Browse Lesson Providers
            </Link>
          </Button>
        </div>
      </section>
    </div>
  );
}