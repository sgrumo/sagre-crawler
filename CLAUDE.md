# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a web crawler built with Crawlee (CheerioCrawler) to scrape Italian festival ("sagre") information from two regional websites:
- sagreinromagna.it (Romagna region)
- sagreinemilia.it (Emilia region)

The crawler extracts comprehensive festival data including dates, locations, descriptions, contact information, images, and structured data (JSON-LD).

## Commands

### Development
- `npm run start` or `npm run start:dev` - Run the crawler in development mode with tsx (TypeScript execution)
- `npm run build` - Compile TypeScript to JavaScript in the `dist/` directory
- `npm run start:prod` - Run the compiled production build from `dist/main.js`
- `npm test` - Tests are not yet implemented

### Docker
- Build: `docker build -t sagre-crawler .`
- Run: `docker run sagre-crawler`

## Configuration

### Environment Variables

The crawler supports optional Strapi integration for uploading scraped data. Create a `.env` file based on `.env.example`:

```bash
cp .env.example .env
```

Required environment variables for Strapi integration:
- `ENABLE_STRAPI_UPLOAD` - Set to `true` or `1` to enable automatic uploads to Strapi
- `STRAPI_URL` - Full URL to your Strapi API endpoint (e.g., `http://localhost:1337/api/festivals`)
- `STRAPI_TOKEN` - (Optional) Bearer token for authenticated Strapi requests
- `GEOAPIFY_API_KEY` - API key for geocoding festival locations (get free key at https://www.geoapify.com/)

## Architecture

### Core Structure

The crawler follows a router-based architecture with three main route handlers:

1. **Default Handler** (Homepage): Entry point that discovers and enqueues:
   - Festival detail pages (`/sagre/**`)
   - List/category pages (`/provincia/**`, `/mese/**`)

2. **List Page Handler** (`list-page`): Processes category/pagination pages to discover more festival detail pages

3. **Festival Detail Handler** (`festival-detail`): The main scraping logic that extracts:
   - Structured data from JSON-LD (if available)
   - HTML metadata (Open Graph tags, meta descriptions)
   - Dates, locations, provinces
   - Images (filtering out logos/icons)
   - Text content (paragraphs, descriptions)
   - Contact info (phones, emails, external websites)
   - Social media links (Facebook, Instagram, Twitter/X)
   - Categories, schedules, prices
   - Full page text for context

### Data Flow

```
main.ts (entry point)
  ↓
CheerioCrawler configuration
  ↓
router (from routes.ts)
  ↓
Default Handler → enqueues festival details + list pages
  ↓
List Page Handler → enqueues more festival details
  ↓
Festival Detail Handler → extracts data → pushData() → storage/datasets/
```

### Configuration

The crawler is configured with:
- `maxRequestsPerCrawl: 100` - Adjust based on crawling needs
- `maxConcurrency: 2` - Rate limiting to be respectful to servers
- `maxRequestRetries: 3` - Retry failed requests

### Storage

Crawlee automatically manages storage in the `storage/` directory:
- `datasets/` - Scraped festival data (JSON files)
- `key_value_stores/` - Internal crawler state
- `request_queues/` - Queue of URLs to crawl

### TypeScript Configuration

- Module system: NodeNext (ESM)
- Target: ES2022
- Includes DOM lib for web scraping types
- Extends `@apify/tsconfig` base configuration

## Key Implementation Details

### Route Labeling
The crawler uses Crawlee's label system to route URLs to different handlers:
- `festival-detail` - Individual festival pages
- `list-page` - Category/pagination pages
- (no label) - Homepage/default handler

### Data Extraction Strategy
The crawler uses a multi-layered extraction approach:
1. **Structured data first**: Looks for JSON-LD with `@type` of "Event" or "FoodEvent"
2. **Fallback to HTML**: Uses CSS selectors with multiple class name variations (e.g., `.date, .data, .quando, [class*="date"]`)
3. **Metadata extraction**: Open Graph tags and meta descriptions

### Source Attribution
Each scraped record includes a `source` field that identifies whether data came from "sagreinromagna.it" or "sagreinemilia.it" based on the URL.

## Development Notes

### File Structure
- `src/main.ts` - Crawler initialization and configuration
- `src/routes.ts` - Route handlers and scraping logic
- `src/schemas.ts` - Zod schemas for data validation
- `src/strapi.ts` - Strapi integration utilities (geocoding, data transformation, uploads)
- `storage/` - Runtime data storage (gitignored)
- `dist/` - Compiled JavaScript output

### Strapi Integration

The crawler can optionally upload scraped festival data to a Strapi CMS. The integration includes:

1. **Data Transformation**: Converts scraped data to Strapi's required format
   - Maps festival fields to Strapi schema
   - Converts descriptions to Strapi's rich text format (ProseMirror JSON)
   - Generates URL-friendly slugs from titles
   - Parses dates to ISO format (YYYY-MM-DD)

2. **Geocoding**: Automatically adds latitude/longitude coordinates
   - First checks for coordinates in scraped structured data (JSON-LD)
   - Falls back to Geoapify API for geocoding if coordinates are missing
   - Uses festival location, province, or city for geocoding

3. **Upload Flow**:
   - After successfully scraping a festival, data is transformed and uploaded to Strapi
   - Supports optional Bearer token authentication
   - Logs success/failure for each upload
   - Non-blocking: scraping continues even if uploads fail

Implementation is in `src/strapi.ts` with the following key functions:
- `extractCoordinates()` - Extracts lat/lng from structured data
- `geocodeLocation()` - Uses Geoapify API for geocoding
- `transformToStrapiFormat()` - Transforms scraped data to Strapi payload
- `uploadToStrapi()` - Posts data to Strapi API
- `processFestivalForStrapi()` - Main orchestration function

### URL Patterns
The crawler targets specific URL patterns:
- Festival details: `https://www.sagre{inromagna,inemilia}.it/sagre/**`
- Province filters: `https://www.sagre{inromagna,inemilia}.it/provincia/**`
- Month filters: `https://www.sagre{inromagna,inemilia}.it/mese/**`

### ESM Imports
Note the `.js` extensions in imports (e.g., `from "./routes.js"`). This is required for ESM/NodeNext module resolution even when writing TypeScript.
