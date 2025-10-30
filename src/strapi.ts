// strapi.ts
import { FestivalData } from "./schemas.js";

interface StrapiPosition {
  lat: number;
  lng: number;
}

interface StrapiDescription {
  type: "doc";
  content: Array<{
    type: "paragraph";
    content: Array<{
      type: "text";
      text: string;
    }>;
  }>;
}

interface StrapiPayload {
  data: {
    title: string;
    startDate?: string;
    endDate?: string;
    description: StrapiDescription;
    slug: string;
    position: StrapiPosition;
  };
}

interface GeoapifyResponse<T> {
  results: T[];
}
interface GeocodeResponse {
  country_code: string;
  country: string;
  datasource: {
    sourcename: string;
    attribution: string;
    license: string;
    url: string;
  };
  street: string;
  state: string;
  state_code: string;
  lon: number;
  lat: number;
  result_type: string;
  postcode: string;
  city: string;
  formatted: string;
  address_line1: string;
  address_line2: string;
  timezone: {
    name: string;
    name_alt: string;
    offset_STD: string;
    offset_STD_seconds: number;
    offset_DST: string;
    offset_DST_seconds: number;
    abbreviation_STD: string;
    abbreviation_DST: string;
  };
  plus_code: string;
  iso3166_2: string;
  rank: {
    popularity: number;
    confidence: number;
    confidence_street_level: number;
    match_type: string;
  };
  place_id: string;
  bbox: {
    lon1: number;
    lat1: number;
    lon2: number;
    lat2: number;
  };
}

export async function geocodeLocation(
  locationString: string,
  apiKey: string,
): Promise<StrapiPosition | null> {
  if (!locationString?.trim()) return null;

  try {
    const encodedLocation = encodeURIComponent(locationString);
    const url = `https://api.geoapify.com/v1/geocode/search?text=${encodedLocation}&apiKey=${apiKey}&limit=1&lang=it&format=json`;

    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(`Status ${response.status}`);

    const data = (await response.json()) as GeoapifyResponse<GeocodeResponse>;
    if (data.results[0]) {
      const lat = data.results[0].lat;
      const lng = data.results[0].lon;
      return { lat, lng };
    }
    return null;
  } catch (error) {
    console.error(`Geocoding failed for "${locationString}":`, error);
    return null;
  }
}

/**
 * Extract coordinates from structured data or location object
 */
export function extractCoordinates(
  festivalData: FestivalData,
): StrapiPosition | null {
  if (festivalData.location && typeof festivalData.location === "object") {
    const loc = festivalData.location as any;
    if (loc.geo?.latitude && loc.geo?.longitude) {
      return { lat: loc.geo.latitude, lng: loc.geo.longitude };
    }
  }
  return null;
}

/**
 * Generate a URL-friendly slug from a title
 */
function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFD") // Normalize accented characters
    .replace(/[\u0300-\u036f]/g, "") // Remove diacritics
    .replace(/[^a-z0-9]+/g, "-") // Replace non-alphanumeric with hyphens
    .replace(/^-+|-+$/g, ""); // Remove leading/trailing hyphens
}

/**
 * Convert plain text to Strapi rich text format
 */
function createRichTextDescription(
  festivalData: FestivalData,
): StrapiDescription {
  let textContent =
    festivalData.description ||
    festivalData.metaDescription ||
    festivalData.paragraphs[0] ||
    "Nessuna descrizione disponibile";

  if (festivalData.paragraphs && festivalData.paragraphs.length > 0) {
    textContent = festivalData.paragraphs.join("\n\n");
  }

  const paragraphs = textContent
    .split(/\n\n+/)
    .filter((p) => p.trim().length > 0);

  return {
    type: "doc",
    content: paragraphs.map((paragraph) => ({
      type: "paragraph",
      content: [
        {
          type: "text",
          text: paragraph.trim(),
        },
      ],
    })),
  };
}

/**
 * Parse date from various formats
 */
function parseDate(dateString: string | undefined): string | undefined {
  if (!dateString) return undefined;

  try {
    // Try to parse ISO format first
    const date = new Date(dateString);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split("T")[0]; // Return YYYY-MM-DD
    }
  } catch (e) {
    // Ignore parsing errors
  }

  return undefined;
}

/**
 * Get location string for geocoding
 */
export function getLocationString(festivalData: FestivalData): string {
  if (festivalData.location) {
    const loc = festivalData.location;

    if (loc.address) {
      const parts: string[] = [];

      if (loc.address.streetAddress) parts.push(loc.address.streetAddress);
      if (loc.address.addressLocality) parts.push(loc.address.addressLocality);
      if (loc.address.addressCountry) parts.push(loc.address.addressCountry);

      if (parts.length > 0) {
        return parts.join(", ");
      }
    }

    // Fallback to location name
    if (loc.name) {
      return `${loc.name}, Italia`;
    }
  }

  // Fallback to province
  return festivalData.province ? `${festivalData.province}, Italia` : "Italia";
}

/**
 * Transform scraped festival data to Strapi format
 */
export async function transformToStrapiFormat(
  festivalData: FestivalData,
  geoapifyApiKey: string,
): Promise<StrapiPayload | null> {
  try {
    // Extract or geocode coordinates
    let position = extractCoordinates(festivalData);

    if (!position) {
      console.log(`Geocoding location for: ${festivalData.location}`);
      position = await geocodeLocation(festivalData.location, geoapifyApiKey);

      if (!position) {
        console.error(`Failed to geocode location for: ${festivalData.title}`);
        return null;
      }
    }

    // Build the Strapi payload
    const payload: StrapiPayload = {
      data: {
        title: festivalData.title,
        startDate: parseDate(festivalData.startDate),
        endDate: parseDate(festivalData.endDate),
        description: createRichTextDescription(festivalData),
        slug: generateSlug(festivalData.title),
        position,
      },
    };

    return payload;
  } catch (error) {
    console.error("Error transforming festival data:", error);
    return null;
  }
}

/**
 * Upload festival data to Strapi
 */
export async function uploadToStrapi(
  payload: StrapiPayload,
  strapiUrl: string,
  strapiToken?: string,
): Promise<boolean> {
  try {
    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };

    if (strapiToken) {
      headers["Authorization"] = `Bearer ${strapiToken}`;
    }

    const response = await fetch(strapiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Strapi upload failed (${response.status}): ${errorText}`);
      return false;
    }

    console.log(`✓ Successfully uploaded to Strapi: ${payload.data.title}`);
    return true;
  } catch (error) {
    console.error("Error uploading to Strapi:", error);
    return false;
  }
}

/**
 * Main function to process and upload festival data
 */
export async function processFestivalForStrapi(
  festivalData: FestivalData,
  config: {
    strapiUrl: string;
    strapiToken?: string;
    geoapifyApiKey: string;
  },
): Promise<boolean> {
  const payload = await transformToStrapiFormat(
    festivalData,
    config.geoapifyApiKey,
  );

  if (!payload) {
    console.error(`Failed to transform data for: ${festivalData.title}`);
    return false;
  }

  return await uploadToStrapi(payload, config.strapiUrl, config.strapiToken);
}
