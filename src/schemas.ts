import { z } from "zod";

const LocationSchema = z.object({
  "@type": z.string(),
  name: z.string(),
  address: z.object({
    "@type": z.string(),
    streetAddress: z.string(),
    addressLocality: z.string(),
    addressCountry: z.string(),
  }),
});

export const StructuredDataSchema = z.object({
  "@type": z.string().optional(),
  name: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  location: z.any().optional(),
  description: z.string().optional(),
});

// Schema for images
export const ImageSchema = z.object({
  src: z.string(),
  alt: z.string(),
});

// Schema for contact information
export const ContactsSchema = z.object({
  phones: z.array(z.string()),
  emails: z.array(z.string()),
  websites: z.array(z.string()),
});

// Schema for social media links
export const SocialMediaSchema = z.object({
  facebook: z.string().nullable(),
  instagram: z.string().nullable(),
  twitter: z.string().nullable(),
});

// Main festival data schema
export const FestivalDataSchema = z.object({
  // Core fields
  url: z.url(),
  title: z.string(),
  scrapedAt: z.iso.datetime(),
  source: z.enum(["sagreinromagna.it", "sagreinemilia.it", "assosagre.it"]),

  // Structured data (if available)
  structuredData: StructuredDataSchema.optional(),
  name: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  location: z.any().optional(),
  description: z.string().optional(),

  // Metadata
  metaDescription: z.string(),
  ogImage: z.string(),
  ogTitle: z.string(),

  // Event details
  dates: z.array(z.string()),
  province: z.string(),

  // Media
  images: z.array(ImageSchema),

  // Content
  paragraphs: z.array(z.string()),
  fullText: z.string(),

  // Contact information
  contacts: ContactsSchema.optional(),

  // Social media
  socialMedia: SocialMediaSchema.optional(),

  // Classification
  categories: z.array(z.string()),

  // Schedule and pricing
  schedule: z.array(z.string()),
  prices: z.array(z.string()),
});

// Export TypeScript types
export type StructuredData = z.infer<typeof StructuredDataSchema>;
export type Image = z.infer<typeof ImageSchema>;
export type Contacts = z.infer<typeof ContactsSchema>;
export type SocialMedia = z.infer<typeof SocialMediaSchema>;
export type FestivalData = z.infer<typeof FestivalDataSchema>;
