/**
 * TipTap JSON utilities — extract embedded images from rich text content
 */
/**
 * Extract all image URLs from a TipTap JSON document.
 * Converts relative URLs to absolute using the provided base URL.
 */
export declare function extractImagesFromTipTap(json: string, baseUrl: string): string[];
