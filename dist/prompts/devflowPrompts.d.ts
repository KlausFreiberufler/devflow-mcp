/**
 * MCP Prompts (DF-240) — guided knowledge workflows.
 *
 * Each prompt packages project context + a task instruction into a ready-to-run
 * conversation. Claude receives the prepared messages and can answer without
 * further tool calls for the common cases.
 */
export interface PromptDescriptor {
    name: string;
    description: string;
    arguments: Array<{
        name: string;
        description: string;
        required: boolean;
    }>;
}
export declare const prompts: PromptDescriptor[];
export interface PromptMessage {
    role: 'user' | 'assistant';
    content: {
        type: 'text';
        text: string;
    };
}
export interface PromptResult {
    description: string;
    messages: PromptMessage[];
}
export declare function getPrompt(name: string, args?: Record<string, string>): Promise<PromptResult>;
