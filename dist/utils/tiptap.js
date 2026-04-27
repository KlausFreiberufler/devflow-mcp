/**
 * TipTap JSON utilities — extract embedded images from rich text content
 */
/**
 * Extract all image URLs from a TipTap JSON document.
 * Converts relative URLs to absolute using the provided base URL.
 */
export function extractImagesFromTipTap(json, baseUrl) {
    try {
        const doc = JSON.parse(json);
        const urls = [];
        collectImageUrls(doc, urls);
        return urls.map(url => {
            if (url.startsWith('http://') || url.startsWith('https://')) {
                return url;
            }
            // Convert relative URL to absolute
            return baseUrl.replace(/\/$/, '') + url;
        });
    }
    catch {
        return [];
    }
}
function collectImageUrls(node, urls) {
    if (node.type === 'image' && node.attrs?.src) {
        urls.push(node.attrs.src);
    }
    if (node.content) {
        for (const child of node.content) {
            collectImageUrls(child, urls);
        }
    }
}
