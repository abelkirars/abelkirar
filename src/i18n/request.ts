import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";
import { defaultLocale, isLocale, localeCookieName } from "@/i18n/locale";

/**
 * `locale` here is next-intl's own override channel: when an awaitable
 * server function is called with an explicit locale (e.g.
 * getTranslations({ locale: student.locale, ... }), used for emails sent in
 * a student's own stored language regardless of who triggered the send), it
 * is passed through as `params.locale` rather than the ambient request.
 * Ignoring it (as this callback previously did, by taking no parameters at
 * all) silently discarded every such override and always fell back to
 * whoever's NEXT_LOCALE cookie happened to be on the request — e.g. an
 * Amharic student's invite email rendering in English because the admin
 * sending it had an English cookie. Normal page rendering never passes an
 * explicit locale, so it's untouched by this and keeps resolving from the
 * cookie exactly as before.
 */
export default getRequestConfig(async ({ locale: explicitLocale }) => {
  let locale = defaultLocale;

  if (isLocale(explicitLocale)) {
    locale = explicitLocale;
  } else {
    const cookieStore = await cookies();
    const cookieLocale = cookieStore.get(localeCookieName)?.value;
    if (isLocale(cookieLocale)) locale = cookieLocale;
  }

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
