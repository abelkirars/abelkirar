import type { Metadata } from "next";
import Link from "next/link";
import { getAllPosts } from "@/lib/blog";
import { Container } from "@/components/marketing/container";
import { CrossPattern } from "@/components/marketing/cross-pattern";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Blog",
  description:
    "Kirar history, technique, and Ethiopian Orthodox spiritual music education.",
};

export default function BlogIndexPage() {
  const posts = getAllPosts();

  return (
    <>
      <section className="relative overflow-hidden bg-gradient-to-b from-[#241b12] to-[#1b140d] py-24 text-[#f3e9d2] sm:py-32">
        <CrossPattern className="text-[#d4a84b] opacity-[0.08]" />
        <Container className="relative">
          <p className="text-sm font-medium tracking-[0.25em] text-[#d4a84b] uppercase">
            Blog
          </p>
          <h1 className="mt-4 max-w-2xl font-heading text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            Kirar history, technique, and spiritual music
          </h1>
        </Container>
      </section>

      <section className="py-20 sm:py-28">
        <Container className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((post) => (
            <Link key={post.slug} href={`/blog/${post.slug}`} className="group">
              <Card className="h-full transition-shadow group-hover:shadow-lg">
                <CardHeader>
                  <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    {new Date(post.date).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </p>
                  <h2 className="mt-2 font-heading text-xl font-semibold">
                    {post.title}
                  </h2>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">{post.excerpt}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </Container>
      </section>
    </>
  );
}
