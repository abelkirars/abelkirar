import type { Metadata } from "next";
import { assertMotionLabEnabled } from "./_lab/gate";
import { loadLabCopy } from "./_lab/load-copy";
import { MotionLab } from "./_lab/motion-lab";

export const metadata: Metadata = {
  title: "Motion Lab",
  robots: { index: false, follow: false },
};

export default async function MotionLabPage() {
  assertMotionLabEnabled();
  const { copy, instruments } = await loadLabCopy();
  return <MotionLab copy={copy} instruments={instruments} />;
}
