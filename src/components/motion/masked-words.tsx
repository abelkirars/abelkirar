import type { CSSProperties } from "react";
import styles from "./motion.module.css";

/**
 * Headline words that rise from behind their own baseline mask when an
 * ancestor <RevealOnView> enters the viewport. No hooks, so it renders on
 * the server; the text stays ordinary, selectable, crawlable text.
 */
export function MaskedWords({ text, delay = 0, step = 55 }: { text: string; delay?: number; step?: number }) {
  const words = text.split(/\s+/).filter(Boolean);
  return (
    <>
      {words.map((word, i) => (
        <span key={`${word}-${i}`}>
          <span className={styles.word}>
            <span className={styles.groupWordInner} style={{ "--d": `${delay + i * step}ms` } as CSSProperties}>
              {word}
            </span>
          </span>
          {i < words.length - 1 ? " " : null}
        </span>
      ))}
    </>
  );
}
