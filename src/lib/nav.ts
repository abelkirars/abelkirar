export const NAV_LINKS = [
  { href: "/about", key: "about" },
  { href: "/courses", key: "courses" },
  // Always points at /student/login, never a session-aware destination —
  // that page already redirects an already-active student straight to
  // /student/dashboard (src/app/student/login/page.tsx), so a logged-in
  // student clicking this ends up in the right place with zero session
  // read here. Keeping it a dumb link avoids opting the whole site into
  // dynamic rendering to make the nav "smart" (SiteHeader/MobileNav are
  // client components today; reading a session for this would mean
  // lifting it into a server layout wrapping every page, which is a
  // site-wide cost, not a local one). Invite-only: no signup path exists
  // or is added by this link.
  { href: "/student/login", key: "studentPortal" },
  { href: "/store", key: "store" },
  { href: "/community", key: "community" },
  { href: "/blog", key: "blog" },
  { href: "/contact", key: "contact" },
] as const;
