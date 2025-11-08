import { createCheerioRouter } from "crawlee";
import { processFestivalForStrapi } from "../../strapi.js";
import { FestivalDataSchema } from "../../schemas.js";
import {
  isDuplicate,
  isFestivalPast,
  parseItalianDate,
} from "../../utils/helpers.js";
import {
  extractMetadata,
  extractImages,
  extractParagraphs,
  extractCategories,
  extractSchedule,
  extractPrices,
  extractFullText,
} from "../../utils/mappers/festival-mapper.js";
import {
  extractSocialMedia,
  extractContacts,
} from "../../utils/mappers/contact-mapper.js";
import {
  WEBSITE_CONFIG,
  EXCLUDED_DOMAINS,
  REGEX_PATTERNS,
} from "../../utils/constants.js";

export const viviromagnaRouter = createCheerioRouter();

// Configuration from environment variables
const STRAPI_URL = process.env.STRAPI_URL || "";
const STRAPI_TOKEN = process.env.STRAPI_TOKEN;
const GEOAPIFY_API_KEY = process.env.GEOAPIFY_API_KEY || "";
const ENABLE_STRAPI_UPLOAD =
  process.env.ENABLE_STRAPI_UPLOAD === "true" ||
  process.env.ENABLE_STRAPI_UPLOAD === "1";

/**
 * Default handler - entry point to discover festival links
 */
viviromagnaRouter.addDefaultHandler(async ({ enqueueLinks, log, request }) => {
  log.info(`Crawling viviromagna homepage: ${request.loadedUrl}`);

  // Enqueue the main eventi-sagre page
  await enqueueLinks({
    urls: ["https://www.viviromagna.it/eventi-sagre"],
    label: "viviromagna-list",
  });
});

/**
 * List page handler - processes the event calendar page and extracts festival links
 */
viviromagnaRouter.addHandler(
  "viviromagna-list",
  async ({ request, $, log, enqueueLinks }) => {
    log.info(`Processing viviromagna list page: ${request.loadedUrl}`);

    // Extract festival detail links from the page
    // Events are in ul.eventi_tre_colonne_template > li.evento_tre_colonne_template
    const festivalLinks: string[] = [];

    // Find all festival items
    $("ul.eventi_tre_colonne_template li.evento_tre_colonne_template").each(
      (_, li) => {
        // Get the anchor tag directly under the li element
        const link = $(li).find("a").first();
        if (link.length > 0) {
          const href = link.attr("href");
          if (href) {
            const url = new URL(href, request.loadedUrl);
            festivalLinks.push(url.toString());
          }
        }
      },
    );

    // Remove duplicates
    const uniqueLinks = [...new Set(festivalLinks)];

    log.info(
      `Found ${uniqueLinks.length} festival links on viviromagna list page`,
    );

    // Enqueue each festival detail page
    for (const url of uniqueLinks) {
      await enqueueLinks({
        urls: [url],
        label: "viviromagna-detail",
      });
    }
  },
);

/**
 * Parse date range from viviromagna detail page (e.g., "Dal 8 novembre al 9 novembre")
 */
function parseViviromagnaPeriod(periodText: string): {
  startDate?: string;
  endDate?: string;
} {
  const result: { startDate?: string; endDate?: string } = {};

  if (!periodText) {
    return result;
  }

  // Remove "Dal" and "al" keywords
  let cleanText = periodText
    .replace(/^Dal\s+/i, "")
    .replace(/\s+al\s+/i, " - ")
    .trim();

  // Try to extract dates with format like "8 novembre - 9 novembre" or "8 novembre al 9 novembre 2025"
  // Pattern: "day month [year] - day month [year]" or "day month - day month year"

  const datePattern =
    /(\d{1,2})\s+([a-zà-ù]+)(?:\s+(\d{4}))?(?:\s*[-al]+\s*)?(\d{1,2})?\s*([a-zà-ù]+)?\s*(\d{4})?/gi;
  const matches = [...cleanText.matchAll(datePattern)];

  if (matches.length === 0) {
    return result;
  }

  const currentYear = new Date().getFullYear();

  if (matches.length === 1) {
    // Single date
    const match = matches[0];
    const day = match[1];
    const month = match[2];
    const year = match[3] || currentYear.toString();

    const date = parseItalianDate(`${day} ${month} ${year}`);
    if (date) {
      result.startDate = date.toISOString().split("T")[0];
      result.endDate = date.toISOString().split("T")[0];
    }
  } else if (matches.length >= 2) {
    // Date range
    const firstMatch = matches[0];
    const lastMatch = matches[matches.length - 1];

    const startDay = firstMatch[1];
    const startMonth = firstMatch[2];
    const startYear = firstMatch[3] || currentYear.toString();

    // For end date, try to get from the last match
    let endDay = lastMatch[4] || lastMatch[1]; // Try to get the second day from range, fallback to first match day
    let endMonth = lastMatch[5] || lastMatch[2]; // Try to get the second month from range
    let endYear = lastMatch[6] || lastMatch[3] || currentYear.toString();

    // If we only have one month/day in the text, parse it differently
    // Look for pattern like "8 novembre - 9" where the month is shared
    if (!endMonth || endMonth === startMonth) {
      const rangePattern =
        /(\d{1,2})\s+([a-zà-ù]+)(?:\s+(\d{4}))?\s*-\s*(\d{1,2})(?:\s+([a-zà-ù]+))?\s*(?:(\d{4}))?/i;
      const rangeMatch = periodText.match(rangePattern);
      if (rangeMatch) {
        endDay = rangeMatch[4];
        endMonth = rangeMatch[5] || rangeMatch[2];
        endYear = rangeMatch[6] || rangeMatch[3] || currentYear.toString();
      }
    }

    const startDate = parseItalianDate(
      `${startDay} ${startMonth} ${startYear}`,
    );
    const endDate = parseItalianDate(`${endDay} ${endMonth} ${endYear}`);

    if (startDate) {
      result.startDate = startDate.toISOString().split("T")[0];
    }
    if (endDate) {
      result.endDate = endDate.toISOString().split("T")[0];
    }
  }

  return result;
}

/**
 * Festival detail handler - extracts comprehensive festival data
 */
viviromagnaRouter.addHandler(
  "viviromagna-detail",
  async ({ request, $, log, pushData }) => {
    log.info(`Scraping viviromagna festival detail: ${request.loadedUrl}`);

    // Extract title from h1.titoloevento.titolopagina
    const titleElement = $("h1.titoloevento.titolopagina").first();
    const title = titleElement.length > 0 ? titleElement.text().trim() : "";

    if (!title) {
      log.warning(`Could not extract title from ${request.loadedUrl}`);
      return;
    }

    // Initialize festival data
    const festivalData: Record<string, any> = {
      url: request.loadedUrl,
      title,
      scrapedAt: new Date().toISOString(),
      source: WEBSITE_CONFIG.VIVIROMAGNA.SOURCE,
    };

    // Extract dates from div.titolo1 containing "Periodo"
    const titolo1Elements = $("div.titolo1");
    let dateText = "";

    titolo1Elements.each((_, el) => {
      const text = $(el).text().trim();
      if (text.toLowerCase().includes("periodo")) {
        // Extract the period text after "Periodo"
        const periodMatch = text.match(/Periodo\s+(.+?)(?:Orario|$)/i);
        if (periodMatch) {
          dateText = periodMatch[1].trim();
        } else {
          // Fallback: get all text from this element
          dateText = text.replace(/Periodo\s*/i, "").trim();
        }
        return false; // break
      }
      return true; // continue
    });

    // Parse dates if found
    if (dateText) {
      log.info(`Found period text: ${dateText}`);
      const parsedDates = parseViviromagnaPeriod(dateText);
      Object.assign(festivalData, parsedDates);
      festivalData.dates = [dateText];
    }

    // Check if festival is in the past early
    if (isFestivalPast(festivalData)) {
      log.info(`Skipping past festival: ${title}`);
      return;
    }

    // Extract location and coordinates from div.mappa_info_dett
    let location = "";
    let latitude: number | undefined;
    let longitude: number | undefined;

    const mappaInfoDiv = $("div.mappa_info_dett").first();
    if (mappaInfoDiv.length > 0) {
      // Try to get text content as location
      const mappaText = mappaInfoDiv.text().trim();
      if (mappaText) {
        location = mappaText;
      }

      // Extract coordinates from data attributes
      const latStr = mappaInfoDiv.attr("data-info-mappa-lat");
      const lonStr = mappaInfoDiv.attr("data-info-mappa-lon");

      log.debug(`${latStr} ${lonStr}`);

      if (latStr && lonStr) {
        latitude = parseFloat(latStr);
        longitude = parseFloat(lonStr);
        log.info(`Extracted coordinates: ${latitude}, ${longitude}`);
      }
    }

    festivalData.location = location;

    // Store coordinates as structured data if found
    if (latitude !== undefined && longitude !== undefined) {
      festivalData.structuredData = {
        "@type": "Event",
        name: title,
        startDate: festivalData.startDate,
        endDate: festivalData.endDate,
        location: {
          "@type": "Place",
          name: location,
          geo: {
            "@type": "GeoCoordinates",
            latitude,
            longitude,
          },
        },
      };
    }

    // Try to extract province from location or page
    let province = "";
    const provinceMatch = location.match(REGEX_PATTERNS.PROVINCE_CODE);
    if (provinceMatch) {
      province = provinceMatch[1];
    }
    festivalData.province = province;

    // Extract description from div.descrizione
    const descrizioneDiv = $("div.descrizione").first();
    if (descrizioneDiv.length > 0) {
      const description = descrizioneDiv.text().trim();
      festivalData.description = description;
      festivalData.paragraphs = [description];
    } else {
      // Fallback: extract paragraphs from common selectors
      festivalData.paragraphs = extractParagraphs(
        $,
        ["article p", ".content p", ".description p", "main p", "p"],
        100,
      );
      festivalData.description = festivalData.paragraphs.join("\n\n");
    }

    // Extract metadata (meta description, OG tags)
    Object.assign(festivalData, extractMetadata($));

    // Extract images (filter out logos and icons)
    festivalData.images = extractImages(
      $,
      ["logo", "icon", "favicon"],
      request.loadedUrl,
    );

    // Extract categories
    festivalData.categories = extractCategories($, [
      ".category",
      ".tipo",
      ".tag",
      '[class*="category"]',
      '[class*="tag"]',
    ]);

    // Extract schedule
    festivalData.schedule = extractSchedule($, [
      ".orari",
      ".schedule",
      '[class*="orari"]',
      '[class*="schedule"]',
    ]);

    // Extract prices
    festivalData.prices = extractPrices($, [".prezzo", ".price"]);

    // Extract contact information
    Object.assign(
      festivalData,
      extractContacts($, EXCLUDED_DOMAINS.VIVIROMAGNA || []),
    );

    // Extract social media
    Object.assign(festivalData, extractSocialMedia($));

    // Extract full page text for context
    festivalData.fullText = extractFullText($);

    // Check for duplicates
    if (isDuplicate(festivalData)) {
      log.info(`Skipping duplicate festival: ${title}`);
      return;
    }

    // Validate data against schema
    const validatedData = FestivalDataSchema.safeParse(festivalData);
    if (!validatedData.success) {
      log.error(
        `Festival data does not conform to schema: ${JSON.stringify(
          validatedData.error.issues,
        )}`,
      );
      throw validatedData.error;
    }

    log.info(`✓ Successfully scraped: ${title}`);
    await pushData(validatedData);

    // Upload to Strapi if enabled
    if (ENABLE_STRAPI_UPLOAD) {
      if (!STRAPI_URL || !GEOAPIFY_API_KEY) {
        log.warning(
          "Strapi upload enabled but missing STRAPI_URL or GEOAPIFY_API_KEY",
        );
      } else {
        log.info(`Uploading to Strapi: ${title}`);

        const uploadSuccess = await processFestivalForStrapi(
          validatedData.data,
          {
            strapiUrl: STRAPI_URL,
            strapiToken: STRAPI_TOKEN,
            geoapifyApiKey: GEOAPIFY_API_KEY,
          },
        );

        if (uploadSuccess) {
          log.info(`✓ Successfully uploaded to Strapi: ${title}`);
        } else {
          log.error(`✗ Failed to upload to Strapi: ${title}`);
        }
      }
    }
  },
);
