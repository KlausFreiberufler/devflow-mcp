/**
 * Error handling utilities for MCP tools
 */
/**
 * Wrap a tool handler with user-friendly error messages
 */
export function withErrorHandling(toolName, handler) {
    return async (args) => {
        try {
            return await handler(args);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            // Connection errors
            if (message.includes('ECONNREFUSED') || message.includes('fetch failed')) {
                const url = process.env.DEVFLOW_URL || 'https://api.app.dev-flow.tech';
                return `Error: Server unreachable (${url}). Check your DEVFLOW_URL configuration.`;
            }
            // Timeout errors
            if (message.includes('timeout') || message.includes('ETIMEDOUT')) {
                return `Error: Server timeout for ${toolName}. The server is not responding.`;
            }
            // DNS errors
            if (message.includes('ENOTFOUND')) {
                return `Error: Server address not found. Check your DEVFLOW_URL configuration.`;
            }
            return `Error in ${toolName}: ${message}`;
        }
    };
}
