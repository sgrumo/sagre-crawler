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

/**
 * Geocode a location using Geoapify API
 */
export async function geocodeLocation(
  locationString: string,
  apiKey: string
): Promise<StrapiPosition | null> {
  try {
    const encodedLocation = encodeURIComponent(locationString);
    const url = `https://api.geoapify.com/v1/geocode/search?text=${encodedLocation}&apiKey=${apiKey}&limit=1`;

    const response = await fetch(url);
    if (!response.ok) {
      console.error(`Geoapify API error: ${response.status}`);
      return null;
    }

    const data = await response.json();
    if (data.features && data.features.length > 0) {
      const [lng, lat] = data.features[0].geometry.coordinates;
      return { lat, lng };
    }

    return null;
  } catch (error) {
    console.error("Error geocoding location:", error);
    return null;
  }
}

/**
 * Extract coordinates from structured data or location object
 */
export function extractCoordinates(
  festivalData: FestivalData
): StrapiPosition | null {
  if (festivalData.location) {
    const locationString = getLocationString(festivalData);
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
  festivalData: FestivalData
): StrapiDescription {
  // Use description from structured data, or meta description, or first paragraph
  let textContent =
    festivalData.description ||
    festivalData.metaDescription ||
    festivalData.paragraphs[0] ||
    "Nessuna descrizione disponibile";

  // If we have multiple paragraphs, join them
  if (festivalData.paragraphs && festivalData.paragraphs.length > 0) {
    textContent = festivalData.paragraphs.join("\n\n");
  }

  // Split by double newlines to create separate paragraphs
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
  geoapifyApiKey: string
): Promise<StrapiPayload | null> {
  try {
    // Extract or geocode coordinates
    let position = extractCoordinates(festivalData);

    if (!position) {
      const locationString = getLocationString(festivalData);
      console.log(`Geocoding location: ${locationString}`);
      position = await geocodeLocation(locationString, geoapifyApiKey);

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
  strapiToken?: string
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
  }
): Promise<boolean> {
  const payload = await transformToStrapiFormat(
    festivalData,
    config.geoapifyApiKey
  );

  if (!payload) {
    console.error(`Failed to transform data for: ${festivalData.title}`);
    return false;
  }

  return await uploadToStrapi(payload, config.strapiUrl, config.strapiToken);
}
