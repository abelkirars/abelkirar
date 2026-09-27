import { notFound } from "next/navigation";

/**
 * The motion lab is for local review only. In a production build every lab
 * route answers 404 — exactly what those URLs returned before the lab
 * existed — so merging this code cannot change the live site.
 */
export function assertMotionLabEnabled() {
  if (process.env.NODE_ENV === "production") notFound();
}
