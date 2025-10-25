// routes.ts
import { createCheerioRouter } from "crawlee";
import {
  FestivalData,
  FestivalDataSchema,
  StructuredDataSchema,
} from "./schemas.js";
import { processFestivalForStrapi } from "./strapi.js";

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
    '.date, .data, .quando, [class*="date"], [class*="quando"]'
  )
    .map((_, el) => $(el).text().trim())
    .get()
    .filter((text) => text.length > 0);

  festivalData.location = $(
    // '.location, .dove, .locality, [class*="location"], [class*="dove"]'
    ".map-marker, .fa-map-marker"
  )
    .parent()
    .map((_, el) => $(el).text().trim())
    .get()
    .filter((text) => text.length > 0);

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
          !href.includes("sagreinemilia.it")
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
    '.category, .tipo, .tag, [class*="category"], [class*="tag"]'
  )
    .map((_, el) => $(el).text().trim())
    .get()
    .filter((text) => text.length > 0);

  // Opening hours / Schedule
  festivalData.schedule = $(
    '.orari, .schedule, [class*="orari"], [class*="schedule"]'
  )
    .map((_, el) => $(el).text().trim())
    .get()
    .filter((text) => text.length > 0);

  // Price information
  festivalData.prices = $(
    '.prezzo, .price, [class*="prezzo"], [class*="price"]'
  )
    .map((_, el) => $(el).text().trim())
    .get()
    .filter((text) => text.length > 0);

  festivalData.fullText = $("body").text().replace(/\s+/g, " ").trim();

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

  // Upload to Strapi if enabled
  if (ENABLE_STRAPI_UPLOAD) {
    if (!STRAPI_URL || !GEOAPIFY_API_KEY) {
      log.warning(
        "Strapi upload enabled but missing STRAPI_URL or GEOAPIFY_API_KEY"
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
