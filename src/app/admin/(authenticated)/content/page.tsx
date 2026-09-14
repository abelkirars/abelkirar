import { ContentEditor, type CopySection } from "@/components/admin/content-editor";
import { getCopyRecords, type CopyOverrideRecord } from "@/lib/site-copy";
import { COPY_KEYS, defaultCopy } from "@/lib/site-copy-defaults";
import { fieldLabel, sectionLabel } from "@/lib/site-copy-sections";
import { messagePlaceholders } from "@/lib/site-copy-keys";

// Always fresh: the point of this page is to show what is live right now,
// and an admin who saved a sentence a moment ago must not be handed a cached
// copy of what it said before.
export const dynamic = "force-dynamic";

export default async function AdminContentPage() {
  const [englishRows, amharicRows] = await Promise.all([
    getCopyRecords("en"),
    getCopyRecords("am"),
  ]);

  const englishEdits = new Map(englishRows.map((row) => [row.key, row]));
  const amharicEdits = new Map(amharicRows.map((row) => [row.key, row]));
  const englishDefaults = defaultCopy("en");
  const amharicDefaults = defaultCopy("am");

  // Grouped by top-level namespace, in the order the English file declares
  // them, so a section's fields arrive in roughly the order they are read on
  // the page rather than alphabetically.
  const sections: CopySection[] = [];
  const byNamespace = new Map<string, CopySection>();

  for (const key of COPY_KEYS) {
    const namespace = key.slice(0, key.indexOf(".")) || key;
    let section = byNamespace.get(namespace);
    if (!section) {
      section = { id: namespace, label: sectionLabel(namespace), fields: [] };
      byNamespace.set(namespace, section);
      sections.push(section);
    }

    const englishDefault = englishDefaults[key] ?? "";
    const englishEdit = englishEdits.get(key);
    const amharicEdit = amharicEdits.get(key);
    // The audit line reports the more recent of the two locales' edits; a key
    // edited in one locale only has just the one timestamp to report.
    let lastEdit: CopyOverrideRecord | undefined;
    for (const row of [englishEdit, amharicEdit]) {
      if (row && (!lastEdit || row.updatedAt > lastEdit.updatedAt)) lastEdit = row;
    }

    section.fields.push({
      key,
      label: fieldLabel(key.slice(namespace.length + 1) || key),
      placeholders: messagePlaceholders(englishDefault),
      en: { value: englishEdit?.value ?? englishDefault, original: englishDefault },
      am: {
        value: amharicEdit?.value ?? amharicDefaults[key] ?? "",
        original: amharicDefaults[key] ?? "",
      },
      editedAt: lastEdit ? lastEdit.updatedAt.toISOString() : null,
      editedBy: lastEdit?.updatedBy ?? null,
    });
  }

  return <ContentEditor sections={sections} />;
}
