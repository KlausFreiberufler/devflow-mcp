/**
 * Error handling utilities for MCP tools
 */

/**
 * Wrap a tool handler with user-friendly error messages
 */
export function withErrorHandling(
  toolName: string,
  handler: (args: Record<string, unknown>) => Promise<string>
): (args: Record<string, unknown>) => Promise<string> {
  return async (args) => {
    try {
      return await handler(args);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      // Connection errors
      if (message.includes('ECONNREFUSED') || message.includes('fetch failed')) {
        const url = process.env.DEVFLOW_URL || 'http://localhost:6011';
        return `Fehler: Server nicht erreichbar (${url}). Läuft der Backend-Server? Versuche: docker-compose up`;
      }

      // Timeout errors
      if (message.includes('timeout') || message.includes('ETIMEDOUT')) {
        return `Fehler: Server-Timeout bei ${toolName}. Der Server antwortet nicht rechtzeitig.`;
      }

      // DNS errors
      if (message.includes('ENOTFOUND')) {
        return `Fehler: Server-Adresse nicht gefunden. Prüfe DEVFLOW_URL in der MCP-Konfiguration.`;
      }

      return `Fehler in ${toolName}: ${message}`;
    }
  };
}
