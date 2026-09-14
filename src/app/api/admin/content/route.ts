import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { siteCopyCacheTag } from "@/lib/site-copy-cache";
import { prisma } from "@/lib/db";
import { requireAdminApi } from "@/lib/admin/dal";
import { copyUpdateSchema } from "@/lib/validations/site-copy";
import { defaultCopy } from "@/lib/site-copy-defaults";
import { placeholderDrift } from "@/lib/site-copy-keys";

/**
 * Writes the admin's copy edits.
 *
 * Two checks stand between this route and a broken page, and both are done
 * here rather than in the browser, because the browser is not where trust
 * lives:
 *
 *  1. The key must already exist in messages/{locale}.json. The merge layer
 *     ignores unknown keys anyway, so an unchecked write would be a silently
 *     inert row — the kind of thing someone rediscovers months later while
 *     wondering why an edit "didn't save".
 *  2. The new wording must use exactly the ICU arguments the default used.
 *     Dropping {orderNumber} from an order email does not render an odd
 *     sentence; next-intl throws and the render fails. This is the only edit
 *     a non-technical author can make that takes a page down, so it is
 *     refused with a message naming the placeholder rather than accepted.
 */
export async function PUT(request: Request) {
  const auth = await requireAdminApi();
  if ("response" in auth) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
  }

  const parsed = copyUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const { changes } = parsed.data;

  // Validate the whole batch before writing any of it: a section saved
  // half-way, with no indication of which half, is worse than a refusal.
  for (const change of changes) {
    const original = defaultCopy(change.locale)[change.key];
    if (original === undefined) {
      return NextResponse.json(
        { error: `"${change.key}" is not a text field on this site.`, key: change.key },
        { status: 400 }
      );
    }

    const drift = placeholderDrift(original, change.value);
    if (drift) {
      const parts: string[] = [];
      if (drift.missing.length) {
        parts.push(`must still include ${drift.missing.map((n) => `{${n}}`).join(", ")}`);
      }
      if (drift.unexpected.length) {
        parts.push(`does not recognise ${drift.unexpected.map((n) => `{${n}}`).join(", ")}`);
      }
      return NextResponse.json(
        {
          error: `"${change.key}" ${parts.join(" and ")}. Those are filled in automatically when the page is shown, so the wording around them can change but the words in braces cannot.`,
          key: change.key,
        },
        { status: 400 }
      );
    }
  }

  const updatedBy = auth.session.displayName;
  const edited = changes.filter((c) => c.value !== defaultCopy(c.locale)[c.key]);
  const restored = changes.filter((c) => c.value === defaultCopy(c.locale)[c.key]);

  await prisma.$transaction([
    ...edited.map((change) =>
      prisma.siteCopy.upsert({
        where: { locale_key: { locale: change.locale, key: change.key } },
        create: { locale: change.locale, key: change.key, value: change.value, updatedBy },
        update: { value: change.value, updatedBy },
      })
    ),
    // Back to the shipped wording — the row goes, rather than storing a
    // duplicate of the default. See the note on copyChangeSchema.
    ...restored.map((change) =>
      prisma.siteCopy.deleteMany({
        where: { locale: change.locale, key: change.key },
      })
    ),
  ]);

  // Expire immediately, rather than serving stale text on the next request.
  // Invalidate only after the transaction succeeds; resets count as edits.
  for (const locale of new Set(changes.map((change) => change.locale))) {
    revalidateTag(siteCopyCacheTag(locale), { expire: 0 });
  }
  return NextResponse.json({ ok: true, saved: edited.length, restored: restored.length });
}
