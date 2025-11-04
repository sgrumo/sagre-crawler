import { COMMON_SELECTORS, EXCLUDED_DOMAINS } from "../constants.js";
import { Contacts } from "../models/festival.js";

/**
 * Extract contact information from a page
 */
export function extractContacts(
  $: any,
  excludeDomains: string[] = EXCLUDED_DOMAINS.ROMAGNA_EMILIA
): Contacts {
  return {
    phones: $(COMMON_SELECTORS.CONTACT_SELECTORS.PHONES)
      .map((_: any, el: any) => $(el).attr("href")?.replace("tel:", "").trim())
      .get()
      .filter((phone: any): phone is string => Boolean(phone)),

    emails: $(COMMON_SELECTORS.CONTACT_SELECTORS.EMAILS)
      .map((_: any, el: any) =>
        $(el).attr("href")?.replace("mailto:", "").trim()
      )
      .get()
      .filter((email: any): email is string => Boolean(email)),

    websites: $(COMMON_SELECTORS.CONTACT_SELECTORS.WEBSITES)
      .map((_: any, el: any) => $(el).attr("href"))
      .get()
      .filter(
        (href: any): href is string =>
          Boolean(href) &&
          !excludeDomains.some((domain) => href.includes(domain))
      ),
  };
}

/**
 * Extract social media links from a page
 */
export function extractSocialMedia($: any): {
  facebook: string | null;
  instagram: string | null;
  twitter: string | null;
} {
  return {
    facebook:
      $(COMMON_SELECTORS.SOCIAL_SELECTORS.FACEBOOK).attr("href") || null,
    instagram:
      $(COMMON_SELECTORS.SOCIAL_SELECTORS.INSTAGRAM).attr("href") || null,
    twitter: $(COMMON_SELECTORS.SOCIAL_SELECTORS.TWITTER).attr("href") || null,
  };
}
