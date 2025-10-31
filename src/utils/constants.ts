/**
 * Common CSS selectors used across website scrapers
 */
export const COMMON_SELECTORS = {
  // Date selectors
  DATE_SELECTORS: [
    ".date",
    ".data",
    ".quando",
    '[class*="date"]',
    '[class*="quando"]',
  ],

  // Location/Province selectors
  PROVINCE_SELECTORS: [
    ".province",
    ".provincia",
    '[class*="province"]',
  ],

  // Image selectors (to exclude)
  IMAGE_EXCLUDE_PATTERNS: ["logo", "icon", "favicon"],

  // Content selectors
  PARAGRAPH_SELECTORS: [
    "article p",
    ".content p",
    ".description p",
    "main p",
  ],

  // Contact selectors
  CONTACT_SELECTORS: {
    PHONES: 'a[href^="tel:"]',
    EMAILS: 'a[href^="mailto:"]',
    WEBSITES: 'a[href^="http"]',
  },

  // Social media selectors
  SOCIAL_SELECTORS: {
    FACEBOOK: 'a[href*="facebook.com"]',
    INSTAGRAM: 'a[href*="instagram.com"]',
    TWITTER: 'a[href*="twitter.com"], a[href*="x.com"]',
  },

  // Category/Tag selectors
  CATEGORY_SELECTORS: [
    ".category",
    ".tipo",
    ".tag",
    '[class*="category"]',
    '[class*="tag"]',
  ],

  // Schedule selectors
  SCHEDULE_SELECTORS: [
    ".orari",
    ".schedule",
    '[class*="orari"]',
    '[class*="schedule"]',
  ],

  // Price selectors
  PRICE_SELECTORS: [
    ".prezzo",
    ".price",
    '[class*="prezzo"]',
    '[class*="price"]',
  ],
};

/**
 * URL patterns for specific websites
 */
export const WEBSITE_CONFIG = {
  ROMAGNA_EMILIA: {
    URLS: {
      FESTIVAL_DETAIL: [
        "https://www.sagreinromagna.it/sagre/**",
        "https://www.sagreinemilia.it/sagre/**",
      ],
      LIST_PAGE: [
        "https://www.sagreinromagna.it/provincia/**",
        "https://www.sagreinemilia.it/provincia/**",
        "https://www.sagreinromagna.it/mese/**",
        "https://www.sagreinemilia.it/mese/**",
      ],
    },
    SOURCE_MAPPING: {
      "sagreinromagna.it": "sagreinromagna.it",
      "sagreinemilia.it": "sagreinemilia.it",
    },
  },
  ASSOSAGRE: {
    URLS: {
      FESTIVAL_DETAIL: "calendario_sagre.php?id_sagra=",
      LIST_PAGE: "calendario_sagre.php?id_regioni=5",
    },
    SOURCE: "assosagre.it",
    SELECTORS: {
      DATE_CONTAINER: ".sagradate",
      INFO_CONTAINER: ".sagrainfo",
      LOCATION_ICON: "i.icon-location",
      FESTIVAL_NAME: ".nomesagra",
      MAPS_IFRAME: 'iframe[src*="maps.google.com"]',
    },
  },
};

/**
 * Regex patterns for data extraction
 */
export const REGEX_PATTERNS = {
  // Italian month pattern
  ITALIAN_MONTH: /(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)/gi,

  // Day numbers pattern (e.g., "7-8-14-15" or "31" or "1-2")
  DAY_NUMBERS: /\b(\d{1,2})(?:\s*-\s*(\d{1,2}))*\b/g,

  // Full date pattern (day month year)
  FULL_DATE: /(\d{1,2})\s+([a-zà-ù]+)\s+(\d{4})/gi,

  // Year pattern
  YEAR: /\b(20\d{2})\b/,

  // Province code pattern (e.g., "(FE)" or "(RA)")
  PROVINCE_CODE: /\(([A-Z]{2})\)/,

  // Google Maps coordinates pattern
  MAPS_COORDINATES: /q=([-\d.]+),([-\d.]+)/,

  // URL domain extractor
  DOMAIN: /https?:\/\/([^/]+)/,
};

/**
 * Common source URL filters (to exclude from contacts)
 */
export const EXCLUDED_DOMAINS = {
  ROMAGNA_EMILIA: ["sagreinromagna.it", "sagreinemilia.it"],
  ASSOSAGRE: ["assosagre.it", "facebook.com", "instagram.com"],
};
