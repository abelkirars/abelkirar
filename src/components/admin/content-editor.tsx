"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Eye, PencilLine, Search, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { placeholderDrift } from "@/lib/site-copy-keys";
import { MAX_COPY_LENGTH } from "@/lib/validations/site-copy";
import { copyFieldId, copyPages, copyPageIncludesField, isCourseCopyPage, saveCopyChanges, type CopyField, type CopyLocale, type CopySection } from "./copy-desk-model";
import styles from "./content-editor.module.css";

export type { CopyFieldValue, CopyField, CopySection } from "./copy-desk-model";

export function ContentEditor({ sections }: { sections: CopySection[] }) {
  const router = useRouter();
  const fields = useMemo(() => sections.flatMap((section) => section.fields), [sections]);
  const byKey = useMemo(() => new Map(fields.map((field) => [field.key, field])), [fields]);
  const pages = useMemo(() => copyPages(sections), [sections]);
  const initial = useMemo(() => Object.fromEntries(fields.flatMap((field) =>
    (["en", "am"] as const).map((locale) => [copyFieldId(locale, field.key), field[locale].value])
  )), [fields]);
  const [saved, setSaved] = useState(initial);
  const [values, setValues] = useState(initial);
  const [pageId, setPageId] = useState(pages[0]?.id ?? "");
  const [locale, setLocale] = useState<CopyLocale>("en");
  const [query, setQuery] = useState("");
  const [marks, setMarks] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [review, setReview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const savingRef = useRef(false);
  const dirtyIds = Object.keys(values).filter((id) => values[id] !== saved[id]);
  const page = pages.find((item) => item.id === pageId);
  const selectedField = selected ? byKey.get(selected) : undefined;
  const search = query.trim().toLowerCase();
  const matches = search ? fields.filter((field) =>
    [field.key, field.label, values[copyFieldId("en", field.key)], values[copyFieldId("am", field.key)]]
      .join(" ").toLowerCase().includes(search)) : [];

  useEffect(() => {
    if (!dirtyIds.length) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    const guardLink = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (link && !window.confirm("Leave this page and lose your unsaved text changes?")) event.preventDefault();
    };
    document.addEventListener("click", guardLink, true);
    return () => { window.removeEventListener("beforeunload", warn); document.removeEventListener("click", guardLink, true); };
  }, [dirtyIds.length]);

  function change(key: string, value: string) {
    setValues((current) => ({ ...current, [copyFieldId(locale, key)]: value }));
    setNotice(null); setError(null);
  }

  function problem(field: CopyField, language: CopyLocale) {
    const value = values[copyFieldId(language, field.key)];
    if (value.length > MAX_COPY_LENGTH) return `Keep this text under ${MAX_COPY_LENGTH.toLocaleString()} characters.`;
    const drift = placeholderDrift(field[language].original, value);
    if (!drift) return null;
    return [drift.missing.length ? `Keep ${drift.missing.map((name) => `{${name}}`).join(", ")}.` : "",
      drift.unexpected.length ? `Remove unknown placeholders ${drift.unexpected.map((name) => `{${name}}`).join(", ")}.` : ""].filter(Boolean).join(" ");
  }

  const changes = dirtyIds.map((id) => {
    const language = id.slice(0, 2) as CopyLocale;
    const field = byKey.get(id.slice(3))!;
    return { id, field, language, issue: problem(field, language) };
  });
  const invalid = changes.some((item) => item.issue);

  async function save() {
    if (savingRef.current || !changes.length || invalid) return;
    savingRef.current = true;
    setSaving(true); setError(null); setNotice(null);
    try {
      await saveCopyChanges(changes.map(({ id, field, language }) => ({ locale: language, key: field.key, value: values[id] })),
        (batch) => setSaved((current) => ({ ...current, ...Object.fromEntries(batch.map((item) => [copyFieldId(item.locale, item.key), item.value])) })));
      setNotice(`Saved ${changes.length} ${changes.length === 1 ? "change" : "changes"} to the website.`);
      setReview(false); router.refresh();
    } catch (err) {
      setError(`${err instanceof Error ? err.message : "Could not reach the server."} Any unconfirmed changes are still here. You can retry saving them.`);
    } finally { savingRef.current = false; setSaving(false); }
  }

  function edit(key: string, tone = "body") {
    const field = byKey.get(key);
    if (!field) return null;
    const id = copyFieldId(locale, key);
    return <InlineText key={id} field={field} locale={locale} value={values[id]}
      tone={tone} dirty={values[id] !== saved[id]} disabled={saving} invalid={!!problem(field, locale)}
      onChange={(value) => change(key, value)} onFocus={() => setSelected(key)} />;
  }

  function fieldGroup(group: CopySection) {
    return <section className={styles.block} key={group.id}>
      <h3 className={styles.sectionLabel}>{group.label}</h3>
      {group.fields.map((field) => <div className={styles.field} key={field.key}>
        {edit(field.key, /(?:title|heading|subject)$/i.test(field.key) ? "heading" : /(?:eyebrow|level)$/i.test(field.key) ? "eyebrow" : "body")}
      </div>)}
    </section>;
  }

  const previewHeader = <div className={styles.siteHeader}>
    <div className={styles.brand}>{edit("header.brand", "brand")}</div>
    <div className={styles.siteLinks}>{["about", "courses", "store", "community", "blog", "contact"].map((key) => edit(`nav.${key}`, "small"))}</div>
  </div>;

  return <div className={`dark ${styles.desk}`} data-marks={marks}>
    <aside className={styles.sidebar}>
      <div className={styles.deskBrand}><PencilLine size={20} /><h1>Copy Desk</h1></div>
      <p className={styles.intro}>Every word, in its place. Click any text and make it yours. Press <kbd>Esc</kbd> while typing to undo that edit.</p>
      <label className={styles.search}><Search size={15} /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find text anywhere…" aria-label="Search all website text" /></label>
      <nav className={styles.navigation} aria-label="Website text pages">
        {Array.from(new Set(pages.map((item) => item.category))).map((category) => <div key={category}>
          <p className={styles.navLabel}>{category}</p>
          {pages.filter((item) => item.category === category).map((item) => {
            const count = changes.filter(({ field }) => copyPageIncludesField(item, field.key)).length;
            return <button type="button" key={item.id} aria-current={!search && item.id === pageId ? "page" : undefined}
              onClick={() => { setPageId(item.id); setQuery(""); setSelected(null); }}>
              <span>{item.label}</span>{count > 0 && <span className={styles.count} aria-label={`${count} unsaved changes`}>{count}</span>}
            </button>;
          })}
        </div>)}
      </nav>
      <label className={styles.mobileNav}>Page<select value={pageId} onChange={(event) => { setPageId(event.target.value); setQuery(""); setSelected(null); }}>
        {pages.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
      </select></label>
      <div className={styles.sidebarFoot}><span className={styles.dot} /> Website text editor</div>
    </aside>

    <div className={styles.workspace}>
      <header className={styles.toolbar}>
        <h2>{search ? "Search results" : page?.label}</h2>
        <div className={styles.toolbarActions}>
          <div className={styles.languages} role="group" aria-label="Editing language">
            {(["en", "am"] as const).map((language) => <button type="button" key={language} aria-pressed={locale === language} onClick={() => setLocale(language)}>{language === "en" ? "English" : "አማርኛ"}</button>)}
          </div>
          <button type="button" className={styles.marksButton} aria-pressed={marks} onClick={() => setMarks(!marks)}><Eye size={15} />{marks ? "Hide marks" : "Show marks"}</button>
          <Button type="button" className={styles.reviewButton} disabled={!dirtyIds.length || saving} onClick={() => setReview(true)}>
            {saving ? "Saving…" : dirtyIds.length ? `Review ${dirtyIds.length} ${dirtyIds.length === 1 ? "change" : "changes"}` : "Review changes"}<ArrowRight size={15} />
          </Button>
        </div>
      </header>
      <div className={styles.status} role="status">{dirtyIds.length ? <><span className={styles.unsavedDot} />{dirtyIds.length} unsaved {dirtyIds.length === 1 ? "change" : "changes"} · Review before publishing</> : <><Check size={14} />{notice ?? "No unsaved changes"}</>}</div>
      <div className={styles.canvasArea}>
        <p className={styles.canvasHint}><PencilLine size={13} />{search ? `${matches.length} matching fields · ${locale === "en" ? "English" : "Amharic"}` : "Text preview · Click to edit · Layout may differ on the live site"}</p>
        <div className={styles.canvas} lang={locale}>
          {search ? <section className={styles.block}>
            {matches.length === 0 && <p className={styles.empty}>No text matches “{query}”. Try a shorter phrase.</p>}
            {matches.map((field) => <div className={styles.searchResult} key={field.key}><h3 className={styles.sectionLabel}>{field.key.split(".")[0]} · {field.label}</h3>{edit(field.key)}</div>)}
          </section> : pageId === "home" ? <>
            {previewHeader}
            <section className={styles.hero}>
              {edit("hero.eyebrow", "eyebrow")}{edit("hero.title", "heroTitle")}{edit("hero.description", "description")}
              <div className={styles.ctas}>{edit("hero.startLearning", "primaryCta")}{edit("hero.contactAbel", "cta")}{edit("hero.joinCommunity", "cta")}</div>
            </section>
            <section className={styles.block}>
              {edit("mission.eyebrow", "eyebrow")}{edit("mission.title", "heading")}{edit("mission.paragraph1")}{edit("mission.paragraph2")}
              {edit("mission.readOurStory", "textLink")}<div className={styles.quote}>{edit("mission.quote")}</div>
            </section>
            <section className={styles.block}>
              {edit("home.coursesEyebrow", "eyebrow")}{edit("home.coursesTitle", "heading")}{edit("home.coursesDescription")}
              <div className={styles.cards}>{["beginner", "intermediate", "advanced"].map((level) => <article key={level} className={styles.card}>
                {edit(`courseLevels.${level}.level`, "eyebrow")}{edit(`courseLevels.${level}.title`, "heading")}{edit(`courseLevels.${level}.tagline`, "textLink")}{edit(`courseLevels.${level}.description`)}
              </article>)}</div>{edit("courseLevels.exploreCurriculum", "textLink")}
            </section>
            <section className={styles.block}>{edit("home.instrumentsEyebrow", "eyebrow")}{edit("home.instrumentsTitle", "heading")}{edit("home.instrumentsDescription")}</section>
          </> : isCourseCopyPage(pageId) ? <>
            {previewHeader}
            <section className={styles.hero}>
              {edit(`courseLevels.${pageId}.level`, "eyebrow")}
              {edit(`courseLevels.${pageId}.title`, "heroTitle")}
              {edit(`courseLevels.${pageId}.tagline`, "heading")}
              {edit(`courseLevels.${pageId}.description`, "description")}
            </section>
            <CourseTopicEditor key={`${pageId}:${locale}`} fields={fields.filter((field) => field.key.startsWith(`courseDetails.${pageId}.topic`))}
              values={values} locale={locale} disabled={saving} renderField={edit} onChange={change} />
          </> : <>
            {page?.category === "Pages on the site" && previewHeader}
            {page?.sections.map((id) => sections.find((section) => section.id === id)).filter((section): section is CopySection => !!section).map(fieldGroup)}
          </>}
        </div>
      </div>
      {selectedField && <aside className={styles.inspector} aria-label="Selected text details">
        <div><strong>{selectedField.label}</strong><span> · {locale === "en" ? "English" : "አማርኛ"}</span>
          {selectedField.placeholders.length > 0 && <p>Keep {selectedField.placeholders.map((name) => `{${name}}`).join(", ")} — filled in automatically.</p>}
          {problem(selectedField, locale) && <p className={styles.error} role="alert">{problem(selectedField, locale)}</p>}
          <details><summary>Text details</summary><p>{selectedField.key}</p><p>Original: {selectedField[locale].original || "(empty)"}</p>{selectedField.editedAt && <p>Last edited {new Date(selectedField.editedAt).toLocaleDateString()}{selectedField.editedBy ? ` by ${selectedField.editedBy}` : ""}</p>}</details>
        </div>
        <Button variant="ghost" type="button" size="sm" disabled={saving || values[copyFieldId(locale, selectedField.key)] === selectedField[locale].original} onClick={() => change(selectedField.key, selectedField[locale].original)}><Undo2 size={14} />Restore original</Button>
      </aside>}
    </div>

    <Sheet open={review} onOpenChange={(open) => { if (!saving) setReview(open); }}>
      <SheetContent className={`dark ${styles.review}`} showCloseButton={!saving}>
        <SheetHeader><SheetTitle className="text-2xl">Review your changes</SheetTitle><SheetDescription>Check both languages before saving. These changes will update the website.</SheetDescription></SheetHeader>
        <div className={styles.reviewList}>
          {changes.length === 0 && <p>No changes left to save.</p>}
          {changes.map(({ id, field, language, issue }) => <article className={styles.changeCard} key={id}>
            <div className={styles.changeTitle}><h3>{field.label}</h3><span>{language === "en" ? "English" : "አማርኛ"}</span></div>
            <p className={styles.sectionLabel}>{field.key.split(".")[0]}</p>
            <div lang={language}><p className={styles.diffLabel}>BEFORE</p><p className={styles.before}>{saved[id] || "(empty)"}</p><p className={styles.diffLabel}>AFTER</p><p className={styles.after}>{values[id] || "(empty)"}</p></div>
            {issue && <p role="alert" className={styles.error}>{issue}</p>}
            <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={() => setValues((current) => ({ ...current, [id]: saved[id] }))}><Undo2 size={14} />Undo change</Button>
          </article>)}
        </div>
        <div className={styles.reviewFooter}>
          {error && <p role="alert" className={styles.error}>{error}</p>}
          {invalid && <p role="alert" className={styles.error}>Fix the highlighted text before saving. Close this panel to edit it.</p>}
          <Button type="button" onClick={save} disabled={saving || invalid || !changes.length}>{saving ? "Saving…" : `Save ${changes.length} ${changes.length === 1 ? "change" : "changes"} to website`}</Button>
          <Button type="button" variant="ghost" disabled={saving || !changes.length} onClick={() => { setValues(saved); setError(null); setNotice(null); setReview(false); }}>Discard all changes</Button>
        </div>
      </SheetContent>
    </Sheet>
  </div>;
}

function CourseTopicEditor({ fields, values, locale, disabled, renderField, onChange }: {
  fields: CopyField[]; values: Record<string, string>; locale: CopyLocale; disabled: boolean;
  renderField: (key: string) => React.ReactNode; onChange: (key: string, value: string) => void;
}) {
  const [added, setAdded] = useState<string[]>(() => fields.filter((field) => values[copyFieldId(locale, field.key)] !== "").map((field) => field.key));
  const ordered = [...fields].sort((a, b) => Number(a.key.split("topic").pop()) - Number(b.key.split("topic").pop()));
  const shown = ordered.filter((field) => values[copyFieldId(locale, field.key)] !== "" || added.includes(field.key));
  const next = ordered.find((field) => !shown.includes(field));
  return <section className={styles.block}>
    <h3 className="font-heading text-2xl">Course overview</h3>
    <p className="mt-2 mb-6 text-sm text-muted-foreground">Add the points visitors should know about this course. Each language has its own list. Empty items are not shown on the website.</p>
    <ol className="space-y-5">
      {shown.map((field, index) => <li key={field.key} className="flex items-start gap-4 border-b border-white/10 pb-3">
        <span className="pt-2 text-xs text-primary" aria-hidden="true">{index + 1}.</span>
        <div className="min-w-0 flex-1">{renderField(field.key)}</div>
        <Button type="button" variant="ghost" size="sm" aria-label={`Remove item ${index + 1}`} disabled={disabled} onClick={() => {
          onChange(field.key, ""); setAdded((current) => current.filter((key) => key !== field.key));
        }}>Remove</Button>
      </li>)}
    </ol>
    {!shown.length && <p className="my-5 text-sm text-muted-foreground">No overview items yet. Add your first item below.</p>}
    <Button className="mt-5" type="button" variant="outline" disabled={disabled || !next} onClick={() => {
      if (next) setAdded((current) => [...current, next.key]);
    }}>+ Add item</Button>
    <p className="mt-3 text-xs text-muted-foreground">{shown.length} of {fields.length} items · Review changes to save your edits.</p>
  </section>;
}

/** React never reconciles the editable children, preserving the caret during typing. */
function InlineText({ field, locale, value, tone, dirty, disabled, invalid, onChange, onFocus }: {
  field: CopyField; locale: CopyLocale; value: string; tone: string; dirty: boolean;
  disabled: boolean; invalid: boolean; onChange: (value: string) => void; onFocus: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const before = useRef(value);
  useEffect(() => {
    if (ref.current && ref.current.innerText !== value) ref.current.textContent = value;
  }, [value]);
  return <div ref={ref} role="textbox" aria-multiline="true" aria-label={`${field.key} — ${locale === "en" ? "English" : "Amharic"}`}
    contentEditable={disabled ? false : "plaintext-only"} suppressContentEditableWarning tabIndex={0}
    aria-readonly={disabled} aria-invalid={invalid} data-dirty={dirty} data-tone={tone} data-empty={value.length === 0}
    data-placeholder={`Add ${field.label.toLowerCase()}…`} className={styles.editable}
    onFocus={() => { before.current = value; onFocus(); }}
    onInput={(event) => onChange(event.currentTarget.innerText.replace(/\r\n/g, "\n"))}
    onKeyDown={(event) => {
      if (event.key === "Escape" && !event.nativeEvent.isComposing) {
        event.preventDefault(); event.stopPropagation(); onChange(before.current); event.currentTarget.textContent = before.current; event.currentTarget.blur();
      }
    }} />;
}
