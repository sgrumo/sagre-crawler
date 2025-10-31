import { Image } from "../models/festival.js";
import { COMMON_SELECTORS } from "../constants.js";

/**
 * Extract images from a page, filtering out logos and icons
 */
export function extractImages(
  $: any,
  excludePatterns: string[] = COMMON_SELECTORS.IMAGE_EXCLUDE_PATTERNS,
  baseUrl?: string
): Image[] {
  return $("img")
    .map((_: any, el: any) => {
      const src = $(el).attr("src");
      const alt = $(el).attr("alt");

      if (!src) {
        return null;
      }

      // Check if should be excluded
      if (excludePatterns.some((pattern) => src.toLowerCase().includes(pattern))) {
        return null;
      }

      // Convert to absolute URL if base URL provided
      let absoluteSrc = src;
      if (baseUrl && !src.startsWith("http")) {
        absoluteSrc = new URL(src, baseUrl).toString();
      }

      return { src: absoluteSrc, alt: alt || "" };
    })
    .get()
    .filter((img: any): img is Image => Boolean(img));
}

/**
 * Extract metadata from page head
 */
export function extractMetadata(
  $: any
): {
  metaDescription: string;
  ogImage: string;
  ogTitle: string;
} {
  return {
    metaDescription: $('meta[name="description"]').attr("content") || "",
    ogImage: $('meta[property="og:image"]').attr("content") || "",
    ogTitle: $('meta[property="og:title"]').attr("content") || "",
  };
}

/**
 * Extract date strings from common date selectors
 */
export function extractDates(
  $: any,
  dateSelectors: string[] = COMMON_SELECTORS.DATE_SELECTORS
): string[] {
  return $(dateSelectors.join(", "))
    .map((_: any, el: any) => $(el).text().trim())
    .get()
    .filter((text: any) => text.length > 0);
}

/**
 * Extract categories/tags
 */
export function extractCategories(
  $: any,
  categorySelectors: string[] = COMMON_SELECTORS.CATEGORY_SELECTORS
): string[] {
  return $(categorySelectors.join(", "))
    .map((_: any, el: any) => $(el).text().trim())
    .get()
    .filter((text: any) => text.length > 0);
}

/**
 * Extract schedule information
 */
export function extractSchedule(
  $: any,
  scheduleSelectors: string[] = COMMON_SELECTORS.SCHEDULE_SELECTORS
): string[] {
  return $(scheduleSelectors.join(", "))
    .map((_: any, el: any) => $(el).text().trim())
    .get()
    .filter((text: any) => text.length > 0);
}

/**
 * Extract pricing information
 */
export function extractPrices(
  $: any,
  priceSelectors: string[] = COMMON_SELECTORS.PRICE_SELECTORS
): string[] {
  return $(priceSelectors.join(", "))
    .map((_: any, el: any) => $(el).text().trim())
    .get()
    .filter((text: any) => text.length > 0);
}

/**
 * Extract paragraphs/content
 */
export function extractParagraphs(
  $: any,
  paragraphSelectors: string[] = COMMON_SELECTORS.PARAGRAPH_SELECTORS,
  minLength: number = 20
): string[] {
  return $(paragraphSelectors.join(", "))
    .map((_: any, el: any) => $(el).text().trim())
    .get()
    .filter((text: any) => text.length > minLength);
}

/**
 * Extract province information
 */
export function extractProvince(
  $: any,
  provinceSelectors: string[] = COMMON_SELECTORS.PROVINCE_SELECTORS
): string {
  return $(provinceSelectors.join(", "))
    .first()
    .text()
    .trim();
}

/**
 * Extract page title, trying multiple selectors
 */
export function extractTitle(
  $: any,
  customSelector?: string
): string {
  if (customSelector) {
    const customTitle = $(customSelector).text().trim();
    if (customTitle) {
      return customTitle;
    }
  }

  // Try h1, then page title, then fallback
  const h1Title = $("h1").first().text().trim();
  if (h1Title) {
    return h1Title;
  }

  const pageTitle = $("title").text().split("|")[0].trim();
  if (pageTitle) {
    return pageTitle;
  }

  return "";
}

/**
 * Extract full page text for indexing
 */
export function extractFullText($: any): string {
  return $("body").text().replace(/\s+/g, " ").trim();
}
