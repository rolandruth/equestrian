import { Link, useLocation } from "wouter";
import { useGetPublicSettings, useLogout, useGetCurrentUser } from "@workspace/api-client-react";
import { Search, Menu, X, LayoutDashboard } from "lucide-react";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ScriptInjector } from "./ScriptInjector";
import { ThemeColorInjector } from "@/components/template/ThemeColorInjector";
import { useAuth } from "@/hooks/use-auth";
import { useBusinessAuth } from "@workspace/replit-auth-web";
import { Building2 } from "lucide-react";

export function PublicLayout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const { data: settings } = useGetPublicSettings();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { token, logout: clearToken } = useAuth();
  const logoutMutation = useLogout();
  const isLoggedIn = Boolean(token);
  const { data: currentUser } = useGetCurrentUser({ query: { enabled: isLoggedIn } });
  const isAdmin = isLoggedIn && currentUser?.role === "admin";
  const bizAuth = useBusinessAuth();
  const navLinks = (settings as any)?.navLinks as Record<string, boolean> | null | undefined;
  const showNavLink = (key: string) => navLinks?.[key] !== false;

  useEffect(() => {
    const faviconUrl = (settings as any)?.faviconUrl;
    if (!faviconUrl) return;
    let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.href = faviconUrl;
  }, [(settings as any)?.faviconUrl]);

  const handleSignOut = async () => {
    setIsMenuOpen(false);
    try {
      await logoutMutation.mutateAsync(undefined);
    } catch {
      // Ignore
    } finally {
      clearToken();
    }
  };

  // Apply favicon whenever public settings load or change
  useEffect(() => {
    const faviconUrl = (settings as any)?.faviconUrl;
    if (!faviconUrl) return;
    let link = document.head.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.href = faviconUrl;
  }, [settings]);

  const navbarBg = (settings as any)?.navbarBgColor || undefined;
  const navbarText = (settings as any)?.navbarTextColor || undefined;

  const navbarStyle: React.CSSProperties = {
    backgroundColor: navbarBg,
    borderBottomColor: navbarBg ? "transparent" : undefined,
  };

  const textStyle: React.CSSProperties = {
    color: navbarText,
  };

  const linkClass = `font-medium text-sm transition-colors ${navbarText ? "" : "text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"}`;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      setLocation(`/browse?search=${encodeURIComponent(searchQuery)}`);
      setIsMenuOpen(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
      <ThemeColorInjector themeColor={(settings as any)?.themeColor} />
      <ScriptInjector
        headScripts={(settings as any)?.headScripts}
        bodyScripts={(settings as any)?.bodyScripts}
      />
      <header
        className="bg-white dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800 sticky top-0 z-50"
        style={navbarStyle}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <Link href="/" className="flex-shrink-0 flex items-center gap-2">
                {settings?.logoUrl ? (
                  <img src={settings.logoUrl} alt={settings.siteTitle} className="max-h-[60px] max-w-[170px] w-auto h-auto object-contain" />
                ) : (
                  <span className="font-bold text-xl text-gray-900 dark:text-white" style={textStyle}>
                    {settings?.siteTitle || "Directory"}
                  </span>
                )}
              </Link>
            </div>
            
            {/* Desktop Navigation */}
            <div className="hidden md:flex md:items-center md:space-x-8 flex-1 justify-end">
              {showNavLink("home") && (
                <Link
                  href="/"
                  className={linkClass}
                  style={textStyle}
                >
                  Home
                </Link>
              )}
              {showNavLink("browse") && (
                <Link
                  href="/browse"
                  className={linkClass}
                  style={textStyle}
                >
                  Browse All
                </Link>
              )}
              {showNavLink("listingPlans") && (
                <Link
                  href="/listing-plans"
                  className={linkClass}
                  style={textStyle}
                >
                  Listing Plans
                </Link>
              )}
              {showNavLink("advertise") && (
                <Link
                  href="/advertise"
                  className={linkClass}
                  style={textStyle}
                >
                  Advertise
                </Link>
              )}
              {isAdmin && (
                <Link
                  href="/admin"
                  className={`${linkClass} flex items-center gap-1.5`}
                  style={textStyle}
                >
                  <LayoutDashboard className="h-4 w-4" />
                  Dashboard
                </Link>
              )}
              {isLoggedIn ? (
                <button
                  onClick={handleSignOut}
                  className={linkClass}
                  style={textStyle}
                >
                  Sign Out
                </button>
              ) : (
                showNavLink("signIn") && (
                  <Link
                    href="/admin/login"
                    className={linkClass}
                    style={textStyle}
                  >
                    Admin Sign In
                  </Link>
                )
              )}
              {bizAuth.isAuthenticated ? (
                <Link
                  href="/business/dashboard"
                  className={`${linkClass} flex items-center gap-1.5`}
                  style={textStyle}
                >
                  <Building2 className="h-4 w-4" />
                  Ad Login
                </Link>
              ) : (
                showNavLink("businessLogin") && (
                  <button
                    onClick={() => bizAuth.login("/business/dashboard")}
                    className={`${linkClass} flex items-center gap-1.5`}
                    style={textStyle}
                  >
                    <Building2 className="h-4 w-4" />
                    Ad Login
                  </button>
                )
              )}
            </div>

            {/* Mobile menu button */}
            <div className="flex items-center md:hidden">
              <button
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className="inline-flex items-center justify-center p-2 rounded-md focus:outline-none"
                style={navbarText ? { color: navbarText } : undefined}
              >
                {isMenuOpen
                  ? <X className="block h-6 w-6" />
                  : <Menu className="block h-6 w-6" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile menu */}
        {isMenuOpen && (
          <div
            className="md:hidden border-b border-gray-200 dark:border-gray-800 pb-4 px-4"
            style={{ backgroundColor: navbarBg || undefined }}
          >
            <div className="flex flex-col space-y-2">
              {showNavLink("home") && (
                <Link
                  href="/"
                  onClick={() => setIsMenuOpen(false)}
                  className="block px-3 py-2 rounded-md text-base font-medium"
                  style={navbarText ? textStyle : undefined}
                >
                  Home
                </Link>
              )}
              {showNavLink("browse") && (
                <Link
                  href="/browse"
                  onClick={() => setIsMenuOpen(false)}
                  className="block px-3 py-2 rounded-md text-base font-medium"
                  style={navbarText ? textStyle : undefined}
                >
                  Browse All
                </Link>
              )}
              {showNavLink("listingPlans") && (
                <Link
                  href="/listing-plans"
                  onClick={() => setIsMenuOpen(false)}
                  className="block px-3 py-2 rounded-md text-base font-medium"
                  style={navbarText ? textStyle : undefined}
                >
                  Listing Plans
                </Link>
              )}
              {showNavLink("advertise") && (
                <Link
                  href="/advertise"
                  onClick={() => setIsMenuOpen(false)}
                  className="block px-3 py-2 rounded-md text-base font-medium"
                  style={navbarText ? textStyle : undefined}
                >
                  Advertise
                </Link>
              )}
              {isAdmin && (
                <Link
                  href="/admin"
                  onClick={() => setIsMenuOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 rounded-md text-base font-medium"
                  style={navbarText ? textStyle : undefined}
                >
                  <LayoutDashboard className="h-4 w-4" />
                  Dashboard
                </Link>
              )}
              {isLoggedIn ? (
                <button
                  onClick={handleSignOut}
                  className="block w-full text-left px-3 py-2 rounded-md text-base font-medium"
                  style={navbarText ? textStyle : undefined}
                >
                  Sign Out
                </button>
              ) : (
                showNavLink("signIn") && (
                  <Link
                    href="/admin/login"
                    onClick={() => setIsMenuOpen(false)}
                    className="block px-3 py-2 rounded-md text-base font-medium"
                    style={navbarText ? textStyle : undefined}
                  >
                    Admin Sign In
                  </Link>
                )
              )}
              {bizAuth.isAuthenticated ? (
                <Link
                  href="/business/dashboard"
                  onClick={() => setIsMenuOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 rounded-md text-base font-medium"
                  style={navbarText ? textStyle : undefined}
                >
                  <Building2 className="h-4 w-4" />
                  Ad Login
                </Link>
              ) : (
                showNavLink("businessLogin") && (
                  <button
                    onClick={() => {
                      setIsMenuOpen(false);
                      bizAuth.login("/business/dashboard");
                    }}
                    className="flex items-center gap-2 px-3 py-2 rounded-md text-base font-medium w-full text-left"
                    style={navbarText ? textStyle : undefined}
                  >
                    <Building2 className="h-4 w-4" />
                    Ad Login
                  </button>
                )
              )}
            </div>
          </div>
        )}
      </header>

      <main className="flex-1 flex flex-col">
        {children}
      </main>

      <footer className="bg-white dark:bg-gray-950 border-t border-gray-200 dark:border-gray-800 py-8 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-sm text-gray-500 dark:text-gray-400">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <p>
              {(settings as any)?.footerText ||
                `\u00a9 ${new Date().getFullYear()} ${settings?.siteTitle || "Directory Master"}. All rights reserved.`}
            </p>
            <nav className="flex items-center gap-5">
              <a href="/contact" className="hover:text-gray-900 dark:hover:text-white transition-colors">
                Contact Us
              </a>
              <a href="/privacy-policy" className="hover:text-gray-900 dark:hover:text-white transition-colors">
                Privacy Policy
              </a>
              <a href="/terms" className="hover:text-gray-900 dark:hover:text-white transition-colors">
                Terms &amp; Conditions
              </a>
            </nav>
          </div>
        </div>
      </footer>
    </div>
  );
}
