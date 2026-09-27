import type { Metadata } from "next";
import { assertMotionLabEnabled } from "../_lab/gate";
import { SocialFullscreen } from "../_lab/social-fullscreen";

export const metadata: Metadata = {
  title: "Motion Lab · Social",
  robots: { index: false, follow: false },
};

export default async function MotionLabSocialPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  assertMotionLabEnabled();
  const { clean } = await searchParams;
  return <SocialFullscreen clean={clean !== undefined} />;
}
