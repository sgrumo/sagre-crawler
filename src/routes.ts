import { createCheerioRouter } from "crawlee";
import {
  FestivalData,
  FestivalDataSchema,
  StructuredDataSchema,
} from "./schemas.js";
import { processFestivalForStrapi } from "./strapi.js";
import { isDuplicate, isFestivalPast, parseItalianDate } from "./utils.js";

export const router = createCheerioRouter();

// Configuration from environment variables
const STRAPI_URL = process.env.STRAPI_URL || "";
const STRAPI_TOKEN = process.env.STRAPI_TOKEN;
const GEOAPIFY_API_KEY = process.env.GEOAPIFY_API_KEY || "";
const ENABLE_STRAPI_UPLOAD =
  process.env.ENABLE_STRAPI_UPLOAD === "true" ||
  process.env.ENABLE_STRAPI_UPLOAD === "1";

router.addDefaultHandler(async ({ enqueueLinks, log, request }) => {
  log.info(`Crawling homepage: ${request.loadedUrl}`);

  // Enqueue all festival detail pages
  await enqueueLinks({
    globs: [
      "https://www.sagreinromagna.it/sagre/**",
      "https://www.sagreinemilia.it/sagre/**",
    ],
    label: "festival-detail",
  });

  // Also enqueue pagination or category pages
  await enqueueLinks({
    globs: [
      "https://www.sagreinromagna.it/provincia/**",
      "https://www.sagreinemilia.it/provincia/**",
      "https://www.sagreinromagna.it/mese/**",
      "https://www.sagreinemilia.it/mese/**",
    ],
    label: "list-page",
  });
});

router.addHandler("list-page", async ({ enqueueLinks, log, request }) => {
  log.info(`Processing list page: ${request.loadedUrl}`);

  await enqueueLinks({
    globs: [
      "https://www.sagreinromagna.it/sagre/**",
      "https://www.sagreinemilia.it/sagre/**",
    ],
    label: "festival-detail",
  });
});

router.addHandler(
  "assosagre-list",
  async ({ enqueueLinks, log, request, $ }) => {
    log.info(`Processing assosagre list page: ${request.loadedUrl}`);

    // Extract festival detail links
    // Based on the pattern: calendario_sagre.php?id_sagra=[ID]&id_provincia=[PROVINCE_ID]
    const festivalLinks: string[] = [];

    $('a[href*="calendario_sagre.php?id_sagra="]').each((_, el) => {
      const href = $(el).attr("href");
      if (href) {
        // Construct full URL
        const url = new URL(href, request.loadedUrl);
        festivalLinks.push(url.toString());
      }
    });

    log.info(
      `Found ${festivalLinks.length} festival links on assosagre list page`,
    );

    // Enqueue each festival detail page
    for (const url of festivalLinks) {
      await enqueueLinks({
        urls: [url],
        label: "assosagre-detail",
      });
    }
  },
);

router.addHandler("festival-detail", async ({ request, $, log, pushData }) => {
  log.info(`Scraping festival detail: ${request.loadedUrl}`);

  const title =
    $("h1").first().text().trim() || $("title").text().split("|")[0].trim();

  // Try to find JSON-LD structured data (common on event sites)
  const jsonLdScripts = $('script[type="application/ld+json"]');
  let structuredData: Partial<FestivalData> | null = null;

  jsonLdScripts.each((_, script) => {
    const jsonContent = $(script).html();

    if (jsonContent) {
      const result = StructuredDataSchema.safeParse(JSON.parse(jsonContent));
      if (!result.success) {
        log.warning(
          `Invalid structured data schema on ${
            request.loadedUrl
          }: ${JSON.stringify(result.error.message)}`,
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
    source: request.loadedUrl.includes("romagna")
      ? "sagreinromagna.it"
      : "sagreinemilia.it",
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
  festivalData.metaDescription =
    $('meta[name="description"]').attr("content") || "";
  festivalData.ogImage = $('meta[property="og:image"]').attr("content") || "";
  festivalData.ogTitle = $('meta[property="og:title"]').attr("content") || "";

  // Dates
  festivalData.dates = $(
    '.date, .data, .quando, [class*="date"], [class*="quando"]',
  )
    .map((_, el) => $(el).text().trim())
    .get()
    .filter((text) => text.length > 0);

  const recapiti = $("#recapiti");

  festivalData.location = recapiti
    .find("span:has(.fa-map-marker)")
    .text()
    .trim();

  festivalData.province = $('.province, .provincia, [class*="province"]')
    .first()
    .text()
    .trim();

  // Images
  festivalData.images = $("img")
    .map((_, el) => {
      const src = $(el).attr("src");
      const alt = $(el).attr("alt");
      if (src && !src.includes("logo") && !src.includes("icon")) {
        return { src, alt: alt || "" };
      }
      return null;
    })
    .get()
    .filter((img) => img !== null);

  // Description/Content
  festivalData.paragraphs = $("article p, .content p, .description p, main p")
    .map((_, el) => $(el).text().trim())
    .get()
    .filter((text) => text.length > 20);

  // Contact information
  festivalData.contacts = {
    phones: $('a[href^="tel:"]')
      .map((_, el) => $(el).attr("href")?.replace("tel:", "").trim())
      .get(),
    emails: $('a[href^="mailto:"]')
      .map((_, el) => $(el).attr("href")?.replace("mailto:", "").trim())
      .get(),
    websites: $('a[href^="http"]')
      .map((_, el) => $(el).attr("href"))
      .get()
      .filter(
        (href) =>
          href &&
          !href.includes("sagreinromagna.it") &&
          !href.includes("sagreinemilia.it"),
      ),
  };

  // Social media links
  festivalData.socialMedia = {
    facebook: $('a[href*="facebook.com"]').attr("href") || null,
    instagram: $('a[href*="instagram.com"]').attr("href") || null,
    twitter: $('a[href*="twitter.com"], a[href*="x.com"]').attr("href") || null,
  };

  // Category/Tags
  festivalData.categories = $(
    '.category, .tipo, .tag, [class*="category"], [class*="tag"]',
  )
    .map((_, el) => $(el).text().trim())
    .get()
    .filter((text) => text.length > 0);

  // Opening hours / Schedule
  festivalData.schedule = $(
    '.orari, .schedule, [class*="orari"], [class*="schedule"]',
  )
    .map((_, el) => $(el).text().trim())
    .get()
    .filter((text) => text.length > 0);

  // Price information
  festivalData.prices = $(
    '.prezzo, .price, [class*="prezzo"], [class*="price"]',
  )
    .map((_, el) => $(el).text().trim())
    .get()
    .filter((text) => text.length > 0);

  festivalData.fullText = $("body").text().replace(/\s+/g, " ").trim();

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
        validatedData.error.message,
      )}`,
    );
    throw validatedData.error;
  }

  log.info(`✓ Successfully scraped: ${title}`);
  await pushData(validatedData);

  if (ENABLE_STRAPI_UPLOAD) {
    if (!STRAPI_URL || !GEOAPIFY_API_KEY) {
      log.warning(
        "Strapi upload enabled but missing STRAPI_URL or GEOAPIFY_API_KEY",
      );
    } else {
      log.info(`Uploading to Strapi: ${title}`);
      const uploadSuccess = await processFestivalForStrapi(validatedData.data, {
        strapiUrl: STRAPI_URL,
        strapiToken: STRAPI_TOKEN,
        geoapifyApiKey: GEOAPIFY_API_KEY,
      });

      if (uploadSuccess) {
        log.info(`✓ Successfully uploaded to Strapi: ${title}`);
      } else {
        log.error(`✗ Failed to upload to Strapi: ${title}`);
      }
    }
  }
});

router.addHandler("assosagre-detail", async ({ request, $, log, pushData }) => {
  log.info(`Scraping assosagre festival detail: ${request.loadedUrl}`);

  // Extract title from h1 or breadcrumb
  const title =
    $(".nomesagra").text() ||
    $("h1").first().text().trim() ||
    $(".breadcrumb li").last().text().trim() ||
    $("title").text().split("|")[0].trim();

  // Initialize festival data
  const festivalData: Record<string, any> = {
    url: request.loadedUrl,
    title,
    scrapedAt: new Date().toISOString(),
    source: "assosagre.it",
  };

  // Extract dates from div.sagradate only
  const sagradateText = $(".sagradate").text().trim();
  festivalData.dates = sagradateText ? [sagradateText] : [];

  if (sagradateText) {
    log.info(`Parsing date from .sagradate: ${sagradateText}`);

    // Extract year (e.g., 2025)
    const yearMatch = sagradateText.match(/\b(20\d{2})\b/);
    const year = yearMatch ? yearMatch[1] : new Date().getFullYear().toString();

    // Find all Italian month names in the text
    const monthRegex =
      /(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)/gi;
    const months = [...sagradateText.matchAll(monthRegex)].map((m) => m[0]);

    // Extract all day numbers (e.g., "7-8-14-15" or "31" or "1-2")
    const dayNumbersRegex = /\b(\d{1,2})(?:\s*-\s*(\d{1,2}))*\b/g;
    const dayMatches = [...sagradateText.matchAll(dayNumbersRegex)];

    if (months.length > 0 && dayMatches.length > 0) {
      // Scenario 1: "31 Ottobre  1-2 Novembre 2025" (dates span multiple months)
      // Scenario 2: "7-8-14-15 Novembre 2025" (multiple dates in same month)

      const allDays: number[] = [];
      dayMatches.forEach((match) => {
        // match[0] could be "7-8-14-15" or "31" or "1-2"
        const dayString = match[0];
        const days = dayString
          .split(/\s*-\s*/)
          .map((d) => parseInt(d.trim(), 10));
        allDays.push(...days);
      });

      // Get first and last day numbers
      const firstDay = Math.min(...allDays);
      const lastDay = Math.max(...allDays);

      // Determine start and end dates
      if (months.length === 1) {
        // All dates in same month: "7-8-14-15 Novembre 2025"
        const month = months[0];
        const startDate = parseItalianDate(`${firstDay} ${month} ${year}`);
        const endDate = parseItalianDate(`${lastDay} ${month} ${year}`);

        if (startDate) {
          festivalData.startDate = startDate.toISOString().split("T")[0];
        }
        if (endDate) {
          festivalData.endDate = endDate.toISOString().split("T")[0];
        }
      } else if (months.length >= 2) {
        // Dates span multiple months: "31 Ottobre  1-2 Novembre 2025"
        const firstMonth = months[0];
        const lastMonth = months[months.length - 1];

        // Find days associated with first month (before the second month appears)
        const firstMonthIndex = sagradateText.indexOf(firstMonth);
        const secondMonthIndex = sagradateText.indexOf(lastMonth);

        const beforeSecondMonth = sagradateText.substring(0, secondMonthIndex);
        const daysBeforeSecondMonth = [
          ...beforeSecondMonth.matchAll(/\b(\d{1,2})\b/g),
        ].map((m) => parseInt(m[0], 10));

        const afterFirstMonth = sagradateText.substring(
          firstMonthIndex + firstMonth.length,
        );
        const daysAfterFirstMonth = [
          ...afterFirstMonth.matchAll(/\b(\d{1,2})\b/g),
        ].map((m) => parseInt(m[0], 10));

        // First day with first month
        const startDay =
          daysBeforeSecondMonth.length > 0
            ? daysBeforeSecondMonth[0]
            : firstDay;
        const startDate = parseItalianDate(`${startDay} ${firstMonth} ${year}`);

        // Last day with last month
        const endDay =
          daysAfterFirstMonth.length > 0
            ? Math.max(...daysAfterFirstMonth)
            : lastDay;
        const endDate = parseItalianDate(`${endDay} ${lastMonth} ${year}`);

        if (startDate) {
          festivalData.startDate = startDate.toISOString().split("T")[0];
        }
        if (endDate) {
          festivalData.endDate = endDate.toISOString().split("T")[0];
        }
      }
    }
  }

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

  // Extract location/venue from div.sagrainfo
  let location = "";
  const sagraInfo = $(".sagrainfo");
  if (sagraInfo.length > 0) {
    // Find the i element with class icon-location and get nearby anchor text
    const locationElements = sagraInfo.find("i.icon-location").parent("a");
    if (locationElements.length > 0) {
      location = locationElements.first().text().trim();
    }
  }
  festivalData.location = location;

  // Extract province (look for province codes in parentheses like (FE))
  const provinceMatch = $("body")
    .text()
    .match(/\(([A-Z]{2})\)/);
  festivalData.province = provinceMatch ? provinceMatch[1] : "";

  // Extract contact information
  festivalData.contacts = {
    phones: $('a[href^="tel:"]')
      .map((_, el) => $(el).attr("href")?.replace("tel:", "").trim())
      .get(),
    emails: $('a[href^="mailto:"]')
      .map((_, el) => $(el).attr("href")?.replace("mailto:", "").trim())
      .get(),
    websites: $('a[href^="http"]')
      .map((_, el) => $(el).attr("href"))
      .get()
      .filter(
        (href) =>
          href &&
          !href.includes("assosagre.it") &&
          !href.includes("facebook.com") &&
          !href.includes("instagram.com"),
      ),
  };

  // Extract social media links
  festivalData.socialMedia = {
    facebook: $('a[href*="facebook.com"]').attr("href") || null,
    instagram: $('a[href*="instagram.com"]').attr("href") || null,
    twitter: $('a[href*="twitter.com"], a[href*="x.com"]').attr("href") || null,
  };

  // Extract coordinates from Google Maps if available
  const mapsIframe = $('iframe[src*="maps.google.com"]').attr("src");
  if (mapsIframe) {
    const coordMatch = mapsIframe.match(/q=([-\d.]+),([-\d.]+)/);
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

  // Extract metadata
  festivalData.metaDescription =
    $('meta[name="description"]').attr("content") || "";
  festivalData.ogImage = $('meta[property="og:image"]').attr("content") || "";
  festivalData.ogTitle = $('meta[property="og:title"]').attr("content") || "";

  // Extract images (including festival logos, but excluding site icons)
  festivalData.images = $("img")
    .map((_, el) => {
      const src = $(el).attr("src");
      const alt = $(el).attr("alt");
      if (src && !src.includes("icon") && !src.includes("favicon")) {
        // Convert relative URLs to absolute
        const absoluteSrc = new URL(src, request.loadedUrl).toString();
        return { src: absoluteSrc, alt: alt || "" };
      }
      return null;
    })
    .get()
    .filter((img) => img !== null);

  // Extract description/content paragraphs
  festivalData.paragraphs = $("p")
    .map((_, el) => $(el).text().trim())
    .get()
    .filter(
      (text) =>
        text.length > 20 &&
        !text.includes("Dove:") &&
        !text.includes("Quando:"),
    );

  festivalData.description = festivalData.paragraphs.join("\n\n");

  // Extract categories/tags
  festivalData.categories = $(".category, .tag, .tipo")
    .map((_, el) => $(el).text().trim())
    .get()
    .filter((text) => text.length > 0);

  // Extract schedule/hours
  festivalData.schedule = [];
  const scheduleText = $("p:contains('Orari:'), p:contains('dalle')")
    .text()
    .trim();
  if (scheduleText) {
    festivalData.schedule.push(scheduleText);
  }

  // Extract prices
  festivalData.prices = $(".price, .prezzo")
    .map((_, el) => $(el).text().trim())
    .get()
    .filter((text) => text.length > 0);

  // Extract full text
  festivalData.fullText = $("body").text().replace(/\s+/g, " ").trim();

  // Validate and save
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

      const uploadSuccess = await processFestivalForStrapi(validatedData.data, {
        strapiUrl: STRAPI_URL,
        strapiToken: STRAPI_TOKEN,
        geoapifyApiKey: GEOAPIFY_API_KEY,
      });

      if (uploadSuccess) {
        log.info(`✓ Successfully uploaded to Strapi: ${title}`);
      } else {
        log.error(`✗ Failed to upload to Strapi: ${title}`);
      }
    }
  }
});
