import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

const BLOG_DIR = path.join(process.cwd(), "content", "blog");

export interface PostFrontmatter {
  title: string;
  date: string;
  excerpt: string;
  tags?: string[];
}

export interface PostSummary extends PostFrontmatter {
  slug: string;
}

export function getAllPosts(): PostSummary[] {
  const files = fs.readdirSync(BLOG_DIR).filter((f) => f.endsWith(".mdx"));

  return files
    .map((filename) => {
      const raw = fs.readFileSync(path.join(BLOG_DIR, filename), "utf8");
      const { data } = matter(raw);
      return {
        slug: filename.replace(/\.mdx$/, ""),
        ...(data as PostFrontmatter),
      };
    })
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function getPostSource(slug: string): string {
  return fs.readFileSync(path.join(BLOG_DIR, `${slug}.mdx`), "utf8");
}

export function getPostSlugs(): string[] {
  return fs
    .readdirSync(BLOG_DIR)
    .filter((f) => f.endsWith(".mdx"))
    .map((f) => f.replace(/\.mdx$/, ""));
}
