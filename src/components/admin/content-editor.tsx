"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export interface CopyFieldValue {
  /** What the site is showing today: the admin's edit, or the default. */
  value: string;
  /** The wording shipped in messages/{locale}.json. */
  original: string;
}

export interface CopyField {
  key: string;
  label: string;
  placeholders: string[];
  en: CopyFieldValue;
  am: CopyFieldValue;
  editedAt: string | null;
  editedBy: string | null;
}

export interface CopySection {
  id: string;
  label: string;
  fields: CopyField[];
}

type Locale = "en" | "am";

/** Server changes are addressed by locale + key; the form needs one flat id. */
function fieldId(locale: Locale, key: string) {
  return `${locale}:${key}`;
}

/**
 * Saving is chunked rather than sent as one request because the write API
 * caps a batch at 200 changes — a deliberate bound there, not an accident to
 * work around, so the client respects it instead of asking for a bigger one.
 */
const CHANGES_PER_REQUEST = 100;

const SEARCH_RESULT_LIMIT = 60;

export function ContentEditor({ sections }: { sections: CopySection[] }) {
  const router = useRouter();

  const allFields = useMemo(
    () => sections.flatMap((section) => section.fields.map((field) => ({ section, field }))),
    [sections]
  );

  // `saved` is what the server last confirmed; `values` is what is in the
  // boxes. Everything the save bar says is derived from the difference, so
  // there is no separate "dirty" bookkeeping to fall out of step.
  const initial = useMemo(() => {
    const map: Record<string, string> = {};
    for (const { field } of allFields) {
      map[fieldId("en", field.key)] = field.en.value;
      map[fieldId("am", field.key)] = field.am.value;
    }
    return map;
  }, [allFields]);

  const [saved, setSaved] = useState(initial);
  const [values, setValues] = useState(initial);
  const [activeSection, setActiveSection] = useState(sections[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const dirtyIds = useMemo(
    () => Object.keys(values).filter((id) => values[id] !== saved[id]),
    [values, saved]
  );

  const trimmedQuery = query.trim().toLowerCase();
  const visible = useMemo(() => {
    if (!trimmedQuery) {
      const section = sections.find((s) => s.id === activeSection);
      return section ? section.fields.map((field) => ({ section, field })) : [];
    }
    return allFields.filter(({ section, field }) =>
      [
        field.key,
        field.label,
        section.label,
        values[fieldId("en", field.key)] ?? "",
        values[fieldId("am", field.key)] ?? "",
      ]
        .join("\n")
        .toLowerCase()
        .includes(trimmedQuery)
    );
  }, [trimmedQuery, sections, activeSection, allFields, values]);

  function setValue(locale: Locale, key: string, value: string) {
    setValues((current) => ({ ...current, [fieldId(locale, key)]: value }));
    setNotice(null);
  }

  function restore(field: CopyField) {
    setValues((current) => ({
      ...current,
      [fieldId("en", field.key)]: field.en.original,
      [fieldId("am", field.key)]: field.am.original,
    }));
    setNotice(null);
  }

  function discard() {
    setValues(saved);
    setError(null);
    setNotice(null);
  }

  async function save() {
    if (dirtyIds.length === 0) return;
    setSaving(true);
    setError(null);
    setNotice(null);

    const changes = dirtyIds.map((id) => {
      const separator = id.indexOf(":");
      return {
        locale: id.slice(0, separator) as Locale,
        key: id.slice(separator + 1),
        value: values[id],
      };
    });

    try {
      for (let index = 0; index < changes.length; index += CHANGES_PER_REQUEST) {
        const batch = changes.slice(index, index + CHANGES_PER_REQUEST);
        const response = await fetch("/api/admin/content", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ changes: batch }),
        });
        const data = await response.json();
        if (!response.ok) {
          // Whatever went in before this batch really did save, so the
          // confirmed state is advanced for those rather than left looking
          // unsaved — the message says where it stopped.
          setSaved((current) => {
            const next = { ...current };
            for (const change of changes.slice(0, index)) {
              next[fieldId(change.locale, change.key)] = change.value;
            }
            return next;
          });
          setError(data.error ?? "Something went wrong");
          return;
        }
      }

      setSaved(values);
      setNotice(
        `Saved ${changes.length} ${changes.length === 1 ? "change" : "changes"}. The site is showing the new wording now.`
      );
      router.refresh();
    } catch (err) {
      console.error("[ContentEditor] save failed:", err);
      setError("Could not reach the server. Your edits are still in the boxes — try again.");
    } finally {
      setSaving(false);
    }
  }

  const shown = trimmedQuery ? visible.slice(0, SEARCH_RESULT_LIMIT) : visible;

  return (
    <div className="mt-8">
      <Input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search all text on the site…"
        aria-label="Search all text on the site"
        className="max-w-md"
      />

      <div className="mt-6 grid gap-8 lg:grid-cols-[14rem_1fr]">
        <nav aria-label="Sections" className="lg:sticky lg:top-6 lg:self-start">
          <ul className="flex flex-wrap gap-1 lg:flex-col">
            {sections.map((section) => {
              const count = section.fields.filter(
                ({ key }) =>
                  values[fieldId("en", key)] !== saved[fieldId("en", key)] ||
                  values[fieldId("am", key)] !== saved[fieldId("am", key)]
              ).length;
              return (
                <li key={section.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveSection(section.id);
                      setQuery("");
                    }}
                    aria-current={!trimmedQuery && section.id === activeSection}
                    className={`flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-3 text-left text-sm ${
                      !trimmedQuery && section.id === activeSection
                        ? "bg-muted font-medium"
                        : "hover:bg-muted/50"
                    }`}
                  >
                    <span>{section.label}</span>
                    {count > 0 && (
                      <span className="rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground">
                        {count}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <div>
          {trimmedQuery && (
            <p className="mb-4 text-sm text-muted-foreground">
              {visible.length === 0
                ? "Nothing matches that."
                : `${visible.length} ${visible.length === 1 ? "field" : "fields"} match${
                    visible.length > SEARCH_RESULT_LIMIT
                      ? ` — showing the first ${SEARCH_RESULT_LIMIT}`
                      : ""
                  }.`}
            </p>
          )}

          <div className="space-y-6">
            {shown.map(({ section, field }) => (
              <FieldRow
                key={field.key}
                field={field}
                sectionLabel={trimmedQuery ? section.label : null}
                english={values[fieldId("en", field.key)] ?? ""}
                amharic={values[fieldId("am", field.key)] ?? ""}
                onChange={setValue}
                onRestore={restore}
              />
            ))}
          </div>
        </div>
      </div>

      {(dirtyIds.length > 0 || error || notice) && (
        <div className="sticky bottom-0 z-10 mt-8 flex flex-wrap items-center gap-3 border-t border-border bg-background/95 py-4 backdrop-blur">
          {dirtyIds.length > 0 && (
            <>
              <Button type="button" onClick={save} disabled={saving}>
                {saving
                  ? "Saving…"
                  : `Save ${dirtyIds.length} ${dirtyIds.length === 1 ? "change" : "changes"}`}
              </Button>
              <Button type="button" variant="outline" onClick={discard} disabled={saving}>
                Discard
              </Button>
            </>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {notice && !error && (
            <p role="status" className="text-sm text-muted-foreground">
              {notice}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function FieldRow({
  field,
  sectionLabel,
  english,
  amharic,
  onChange,
  onRestore,
}: {
  field: CopyField;
  sectionLabel: string | null;
  english: string;
  amharic: string;
  onChange: (locale: Locale, key: string, value: string) => void;
  onRestore: (field: CopyField) => void;
}) {
  const isDefault = english === field.en.original && amharic === field.am.original;

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="font-medium">
            {sectionLabel && (
              <span className="text-muted-foreground">{sectionLabel} · </span>
            )}
            {field.label}
          </h3>
          <p className="mt-0.5 font-mono text-xs text-muted-foreground">{field.key}</p>
        </div>
        {!isDefault && (
          <Button type="button" variant="ghost" size="sm" onClick={() => onRestore(field)}>
            Restore original
          </Button>
        )}
      </div>

      {field.placeholders.length > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          Keep{" "}
          {field.placeholders.map((name, index) => (
            <span key={name}>
              {index > 0 && ", "}
              <code className="font-mono">{`{${name}}`}</code>
            </span>
          ))}{" "}
          in the text — {field.placeholders.length === 1 ? "it is" : "they are"} filled in
          automatically when the page is shown.
        </p>
      )}

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">English</span>
          <Textarea
            value={english}
            onChange={(event) => onChange("en", field.key, event.target.value)}
            rows={Math.min(8, Math.max(2, Math.ceil(english.length / 60)))}
            className="mt-1"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">አማርኛ (Amharic)</span>
          <Textarea
            value={amharic}
            onChange={(event) => onChange("am", field.key, event.target.value)}
            rows={Math.min(8, Math.max(2, Math.ceil(amharic.length / 60)))}
            className="mt-1"
            lang="am"
          />
        </label>
      </div>

      {field.editedAt && (
        <p className="mt-2 text-xs text-muted-foreground">
          Last edited {new Date(field.editedAt).toLocaleDateString()}
          {field.editedBy ? ` by ${field.editedBy}` : ""}
        </p>
      )}
    </div>
  );
}
