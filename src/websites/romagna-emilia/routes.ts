import { createCheerioRouter } from "crawlee";
import {
  FestivalData,
  FestivalDataSchema,
  StructuredDataSchema,
} from "../../utils/models/festival.js";
import { processFestivalForStrapi } from "../../strapi.js";
import { isDuplicate, isFestivalPast } from "../../utils/helpers.js";
import {
  extractContacts,
  extractSocialMedia,
} from "../../utils/mappers/contact-mapper.js";
import {
  extractTitle,
  extractMetadata,
  extractImages,
  extractDates,
  extractProvince,
  extractParagraphs,
  extractCategories,
  extractSchedule,
  extractPrices,
  extractFullText,
} from "../../utils/mappers/festival-mapper.js";
import { WEBSITE_CONFIG } from "../../utils/constants.js";

export const romagnaEmiliaRouter = createCheerioRouter();

// Configuration from environment variables
const STRAPI_URL = process.env.STRAPI_URL || "";
const STRAPI_TOKEN = process.env.STRAPI_TOKEN;
const GEOAPIFY_API_KEY = process.env.GEOAPIFY_API_KEY || "";
const ENABLE_STRAPI_UPLOAD =
  process.env.ENABLE_STRAPI_UPLOAD === "true" ||
  process.env.ENABLE_STRAPI_UPLOAD === "1";

/**
 * Determine source website from URL
 */
function getSourceFromUrl(url: string): "sagreinromagna.it" | "sagreinemilia.it" {
  return url.includes("romagna") ? "sagreinromagna.it" : "sagreinemilia.it";
}

romagnaEmiliaRouter.addDefaultHandler(async ({ enqueueLinks, log, request }) => {
  log.info(`Crawling homepage: ${request.loadedUrl}`);

  // Enqueue all festival detail pages
  await enqueueLinks({
    globs: WEBSITE_CONFIG.ROMAGNA_EMILIA.URLS.FESTIVAL_DETAIL,
    label: "romagna-emilia-festival-detail",
  });

  // Also enqueue pagination or category pages
  await enqueueLinks({
    globs: WEBSITE_CONFIG.ROMAGNA_EMILIA.URLS.LIST_PAGE,
    label: "romagna-emilia-list-page",
  });
});

romagnaEmiliaRouter.addHandler(
  "romagna-emilia-list-page",
  async ({ enqueueLinks, log, request }) => {
    log.info(`Processing list page: ${request.loadedUrl}`);

    await enqueueLinks({
      globs: WEBSITE_CONFIG.ROMAGNA_EMILIA.URLS.FESTIVAL_DETAIL,
      label: "romagna-emilia-festival-detail",
    });
  }
);

romagnaEmiliaRouter.addHandler(
  "romagna-emilia-festival-detail",
  async ({ request, $, log, pushData }) => {
    log.info(`Scraping festival detail: ${request.loadedUrl}`);

    const title = extractTitle($);

    // Try to find JSON-LD structured data (common on event sites)
    const jsonLdScripts = $('script[type="application/ld+json"]');
    let structuredData: any = null;

    jsonLdScripts.each((_: any, script: any) => {
      const jsonContent = $(script).html();

      if (jsonContent) {
        const result = StructuredDataSchema.safeParse(JSON.parse(jsonContent));
        if (!result.success) {
          log.warning(
            `Invalid structured data schema on ${
              request.loadedUrl
            }: ${JSON.stringify(result.error.message)}`
          );
          return;
        }

        const data = result.data;

        if (data["@type"] === "Event" || data["@type"] === "FoodEvent") {
          structuredData = data;
        }
      }
    });

    // Extract all relevant information
    const festivalData: Record<string, any> = {
      url: request.loadedUrl,
      title,
      scrapedAt: new Date().toISOString(),
      source: getSourceFromUrl(request.loadedUrl),
    };

    // If structured data exists, use it
    if (structuredData !== null) {
      festivalData.structuredData = structuredData;
      festivalData.name = structuredData.name;
      festivalData.startDate = structuredData.startDate;
      festivalData.endDate = structuredData.endDate;
      festivalData.location = structuredData.location;
      festivalData.description = structuredData.description;
    }

    // Extract from HTML (fallback or additional data)
    Object.assign(festivalData, extractMetadata($));
    festivalData.dates = extractDates($);
    festivalData.location =
      $("#recapiti").find("span:has(.fa-map-marker)").text().trim() ||
      festivalData.location;
    festivalData.province = extractProvince($);
    festivalData.images = extractImages($, undefined, request.loadedUrl);
    festivalData.paragraphs = extractParagraphs($);
    Object.assign(festivalData, {
      contacts: extractContacts($),
      socialMedia: extractSocialMedia($),
    });
    festivalData.categories = extractCategories($);
    festivalData.schedule = extractSchedule($);
    festivalData.prices = extractPrices($);
    festivalData.fullText = extractFullText($);

    // Check if festival is in the past
    if (isFestivalPast(festivalData)) {
      log.info(`Skipping past festival: ${title}`);
      return;
    }

    // Check for duplicates
    if (isDuplicate(festivalData)) {
      log.info(`Skipping duplicate festival: ${title}`);
      return;
    }

    const validatedData = FestivalDataSchema.safeParse(festivalData);
    if (!validatedData.success) {
      log.error(
        `Festival data does not conform to schema: ${JSON.stringify(
          validatedData.error.message
        )}`
      );
      throw validatedData.error;
    }

    log.info(`✓ Successfully scraped: ${title}`);
    await pushData(validatedData);

    if (ENABLE_STRAPI_UPLOAD) {
      if (!STRAPI_URL || !GEOAPIFY_API_KEY) {
        log.warning(
          "Strapi upload enabled but missing STRAPI_URL or GEOAPIFY_API_KEY"
        );
      } else {
        log.info(`Uploading to Strapi: ${title}`);
        const uploadSuccess = await processFestivalForStrapi(
          validatedData.data,
          {
            strapiUrl: STRAPI_URL,
            strapiToken: STRAPI_TOKEN,
            geoapifyApiKey: GEOAPIFY_API_KEY,
          }
        );

        if (uploadSuccess) {
          log.info(`✓ Successfully uploaded to Strapi: ${title}`);
        } else {
          log.error(`✗ Failed to upload to Strapi: ${title}`);
        }
      }
    }
  }
);
