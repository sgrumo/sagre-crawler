import { createCheerioRouter } from "crawlee";
import { processFestivalForStrapi } from "../../strapi.js";
import { REGEX_PATTERNS, WEBSITE_CONFIG } from "../../utils/constants.js";
import {
  isDuplicate,
  isFestivalPast,
  parseItalianDate,
} from "../../utils/helpers.js";
import {
  extractCategories,
  extractFullText,
  extractImages,
  extractMetadata,
  extractParagraphs,
  extractPrices,
  extractSchedule,
  extractTitle,
} from "../../utils/mappers/festival-mapper.js";
import { FestivalDataSchema } from "../../utils/models/festival.js";

export const assosasgreRouter = createCheerioRouter();

// Configuration from environment variables
const STRAPI_URL = process.env.STRAPI_URL || "";
const STRAPI_TOKEN = process.env.STRAPI_TOKEN;
const GEOAPIFY_API_KEY = process.env.GEOAPIFY_API_KEY || "";
const ENABLE_STRAPI_UPLOAD =
  process.env.ENABLE_STRAPI_UPLOAD === "true" ||
  process.env.ENABLE_STRAPI_UPLOAD === "1";

/**
 * Parse AssosAgre date format from .sagradate element
 * Examples: "31 Ottobre  1-2 Novembre 2025", "7-8-14-15 Novembre 2025"
 */
function parseSagradateText(sagradateText: string): {
  startDate?: string;
  endDate?: string;
} {
  const result: { startDate?: string; endDate?: string } = {};

  if (!sagradateText) {
    return result;
  }

  // Extract year
  const yearMatch = sagradateText.match(REGEX_PATTERNS.YEAR);
  const year = yearMatch ? yearMatch[1] : new Date().getFullYear().toString();

  // Find all Italian month names
  const months = [...sagradateText.matchAll(REGEX_PATTERNS.ITALIAN_MONTH)].map(
    (m) => m[0]
  );

  // Extract all day numbers
  const dayMatches = [...sagradateText.matchAll(REGEX_PATTERNS.DAY_NUMBERS)];

  if (months.length > 0 && dayMatches.length > 0) {
    const allDays: number[] = [];
    dayMatches.forEach((match) => {
      const dayString = match[0];
      const days = dayString
        .split(/\s*-\s*/)
        .map((d) => parseInt(d.trim(), 10));
      allDays.push(...days);
    });

    const firstDay = Math.min(...allDays);
    const lastDay = Math.max(...allDays);

    if (months.length === 1) {
      // All dates in same month
      const month = months[0];
      const startDate = parseItalianDate(`${firstDay} ${month} ${year}`);
      const endDate = parseItalianDate(`${lastDay} ${month} ${year}`);

      if (startDate) {
        result.startDate = startDate.toISOString().split("T")[0];
      }
      if (endDate) {
        result.endDate = endDate.toISOString().split("T")[0];
      }
    } else if (months.length >= 2) {
      // Dates span multiple months
      const firstMonth = months[0];
      const lastMonth = months[months.length - 1];

      const firstMonthIndex = sagradateText.indexOf(firstMonth);
      const secondMonthIndex = sagradateText.indexOf(lastMonth);

      const beforeSecondMonth = sagradateText.substring(0, secondMonthIndex);
      const daysBeforeSecondMonth = [
        ...beforeSecondMonth.matchAll(/\b(\d{1,2})\b/g),
      ].map((m) => parseInt(m[0], 10));

      const afterFirstMonth = sagradateText.substring(
        firstMonthIndex + firstMonth.length
      );
      const daysAfterFirstMonth = [
        ...afterFirstMonth.matchAll(/\b(\d{1,2})\b/g),
      ].map((m) => parseInt(m[0], 10));

      const startDay =
        daysBeforeSecondMonth.length > 0 ? daysBeforeSecondMonth[0] : firstDay;
      const startDate = parseItalianDate(`${startDay} ${firstMonth} ${year}`);

      const endDay =
        daysAfterFirstMonth.length > 0
          ? Math.max(...daysAfterFirstMonth)
          : lastDay;
      const endDate = parseItalianDate(`${endDay} ${lastMonth} ${year}`);

      if (startDate) {
        result.startDate = startDate.toISOString().split("T")[0];
      }
      if (endDate) {
        result.endDate = endDate.toISOString().split("T")[0];
      }
    }
  }

  return result;
}

assosasgreRouter.addHandler(
  "assosagre-list",
  async ({ enqueueLinks, log, request, $ }) => {
    log.info(`Processing assosagre list page: ${request.loadedUrl}`);

    // Extract festival detail links
    const festivalLinks: string[] = [];

    $('a[href*="' + WEBSITE_CONFIG.ASSOSAGRE.URLS.FESTIVAL_DETAIL + '"]').each(
      (_, el) => {
        const href = $(el).attr("href");
        if (href) {
          const url = new URL(href, request.loadedUrl);
          festivalLinks.push(url.toString());
        }
      }
    );

    log.info(
      `Found ${festivalLinks.length} festival links on assosagre list page`
    );

    // Enqueue each festival detail page
    for (const url of festivalLinks) {
      await enqueueLinks({
        urls: [url],
        label: "assosagre-detail",
      });
    }
  }
);

assosasgreRouter.addHandler(
  "assosagre-detail",
  async ({ request, $, log, pushData }) => {
    log.info(`Scraping assosagre festival detail: ${request.loadedUrl}`);

    // Extract title
    const customTitleSelector =
      WEBSITE_CONFIG.ASSOSAGRE.SELECTORS.FESTIVAL_NAME;
    const title = extractTitle($, customTitleSelector);

    // Extract dates from .sagradate
    const sagradateText = $(WEBSITE_CONFIG.ASSOSAGRE.SELECTORS.DATE_CONTAINER)
      .text()
      .trim();
    const dates = sagradateText ? [sagradateText] : [];

    // Initialize festival data
    const festivalData: Record<string, any> = {
      url: request.loadedUrl,
      title,
      scrapedAt: new Date().toISOString(),
      source: WEBSITE_CONFIG.ASSOSAGRE.SOURCE,
      dates,
    };

    // Parse structured dates if available
    if (sagradateText) {
      log.info(`Parsing date from .sagradate: ${sagradateText}`);
      const parsedDates = parseSagradateText(sagradateText);
      Object.assign(festivalData, parsedDates);
    }

    // Check if festival is in the past early
    if (isFestivalPast(festivalData)) {
      log.info(`Skipping past festival: ${title}`);
      return;
    }

    // Extract location from .sagrainfo
    let location = "";
    let locationCoordinates: { lat: number; lng: number } | null = null;
    const sagraInfo = $(WEBSITE_CONFIG.ASSOSAGRE.SELECTORS.INFO_CONTAINER);
    if (sagraInfo.length > 0) {
      const locationLink = sagraInfo
        .find(WEBSITE_CONFIG.ASSOSAGRE.SELECTORS.LOCATION_ICON)
        .parent("a");
      if (locationLink.length > 0) {
        location = locationLink.first().text().trim();

        // Extract coordinates from Google Maps href
        const mapsHref = locationLink.first().attr("href");
        if (mapsHref) {
          const coordMatch = mapsHref.match(REGEX_PATTERNS.MAPS_COORDINATES);
          if (coordMatch) {
            locationCoordinates = {
              lat: parseFloat(coordMatch[1]),
              lng: parseFloat(coordMatch[2]),
            };
            log.info(
              `Extracted coordinates from Google Maps link: ${coordMatch[1]}, ${coordMatch[2]}`
            );
          }
        }
      }
    }
    festivalData.location = location;

    // Store coordinates if extracted from location link
    if (locationCoordinates) {
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
            latitude: locationCoordinates.lat,
            longitude: locationCoordinates.lng,
          },
        },
      };
    }

    // Extract province
    const provinceMatch = $("body").text().match(REGEX_PATTERNS.PROVINCE_CODE);
    festivalData.province = provinceMatch ? provinceMatch[1] : "";

    // Extract contact information
    // Object.assign(festivalData, extractContacts($, EXCLUDED_DOMAINS.ASSOSAGRE));

    // Extract social media
    // Object.assign(festivalData, extractSocialMedia($));

    // Fallback: Extract coordinates from Google Maps iframe if not already extracted from location link
    if (!locationCoordinates) {
      const mapsIframe = $(WEBSITE_CONFIG.ASSOSAGRE.SELECTORS.MAPS_IFRAME).attr(
        "src"
      );
      if (mapsIframe) {
        const coordMatch = mapsIframe.match(REGEX_PATTERNS.MAPS_COORDINATES);
        if (coordMatch) {
          festivalData.structuredData = {
            "@type": "Event",
            name: title,
            startDate: festivalData.startDate,
            endDate: festivalData.endDate,
            location: {
              "@type": "Place",
              name: festivalData.location,
              geo: {
                "@type": "GeoCoordinates",
                latitude: parseFloat(coordMatch[1]),
                longitude: parseFloat(coordMatch[2]),
              },
            },
          };
        }
      }
    }

    // Extract metadata
    Object.assign(festivalData, extractMetadata($));

    // Extract images
    festivalData.images = extractImages(
      $,
      ["icon", "favicon"],
      request.loadedUrl
    );

    // Extract paragraphs
    festivalData.paragraphs = extractParagraphs($, ["p"], 20).filter(
      (text) => !text.includes("Dove:") && !text.includes("Quando:")
    );

    festivalData.description = festivalData.paragraphs.join("\n\n");

    // Extract other fields
    festivalData.categories = extractCategories($, [
      ".category",
      ".tag",
      ".tipo",
    ]);
    festivalData.schedule = extractSchedule($, []);
    const scheduleText = $("p:contains('Orari:'), p:contains('dalle')")
      .text()
      .trim();
    if (scheduleText) {
      festivalData.schedule.push(scheduleText);
    }
    festivalData.prices = extractPrices($, [".price", ".prezzo"]);
    festivalData.fullText = extractFullText($);

    // Check for duplicates
    if (isDuplicate(festivalData)) {
      log.info(`Skipping duplicate festival: ${title}`);
      return;
    }

    // Validate and save
    const validatedData = FestivalDataSchema.safeParse(festivalData);
    if (!validatedData.success) {
      log.error(
        `Festival data does not conform to schema: ${JSON.stringify(
          validatedData.error.issues
        )}`
      );
      throw validatedData.error;
    }

    log.info(`✓ Successfully scraped: ${title}`);
    await pushData(validatedData);

    // Upload to Strapi if enabled
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
