import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { compileMDX } from "next-mdx-remote/rsc";
import { getPostSlugs, getPostSource, type PostFrontmatter } from "@/lib/blog";
import { Container } from "@/components/marketing/container";
import { CrossPattern } from "@/components/marketing/cross-pattern";

export function generateStaticParams() {
  return getPostSlugs().map((slug) => ({ slug }));
}

async function loadPost(slug: string) {
  let source: string;
  try {
    source = getPostSource(slug);
  } catch {
    return null;
  }

  return compileMDX<PostFrontmatter>({
    source,
    options: { parseFrontmatter: true },
  });
}

export async function generateMetadata({
  params,
}: PageProps<"/blog/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const post = await loadPost(slug);
  if (!post) return {};
  return {
    title: post.frontmatter.title,
    description: post.frontmatter.excerpt,
  };
}

export default async function BlogPostPage({
  params,
}: PageProps<"/blog/[slug]">) {
  const { slug } = await params;
  const post = await loadPost(slug);
  if (!post) notFound();

  return (
    <>
      <section className="relative overflow-hidden bg-gradient-to-b from-[#241b12] to-[#1b140d] py-20 text-[#f3e9d2] sm:py-28">
        <CrossPattern className="text-[#d4a84b] opacity-[0.08]" />
        <Container className="relative max-w-3xl">
          <p className="text-sm font-medium tracking-[0.2em] text-[#d4a84b] uppercase">
            {new Date(post.frontmatter.date).toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>
          <h1 className="mt-4 font-heading text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            {post.frontmatter.title}
          </h1>
        </Container>
      </section>

      <section className="py-16 sm:py-20">
        <Container className="max-w-3xl">
          <article className="prose prose-neutral max-w-none prose-headings:font-heading prose-a:text-accent">
            {post.content}
          </article>
        </Container>
      </section>
    </>
  );
}
