/**
 * TipTap JSON utilities — extract embedded images from rich text content
 */

interface TipTapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TipTapNode[];
}

/**
 * Extract all image URLs from a TipTap JSON document.
 * Converts relative URLs to absolute using the provided base URL.
 */
export function extractImagesFromTipTap(json: string, baseUrl: string): string[] {
  try {
    const doc = JSON.parse(json) as TipTapNode;
    const urls: string[] = [];
    collectImageUrls(doc, urls);

    return urls.map(url => {
      if (url.startsWith('http://') || url.startsWith('https://')) {
        return url;
      }
      // Convert relative URL to absolute
      return baseUrl.replace(/\/$/, '') + url;
    });
  } catch {
    return [];
  }
}

function collectImageUrls(node: TipTapNode, urls: string[]): void {
  if (node.type === 'image' && node.attrs?.src) {
    urls.push(node.attrs.src as string);
  }
  if (node.content) {
    for (const child of node.content) {
      collectImageUrls(child, urls);
    }
  }
}
