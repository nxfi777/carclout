// lib/openrouter.ts

import axios from 'axios';

// Use OpenRouter API Key
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

if (!OPENROUTER_API_KEY) {
  throw new Error('OpenRouter API key not found. Please set the OPENROUTER_API_KEY environment variable.');
}

// OpenRouter API Endpoint
const OPENROUTER_CHAT_COMPLETIONS_URL = 'https://openrouter.ai/api/v1/chat/completions';


// Types for Multimodal Content Parts
type TextContentPart = { type: "text"; text: string };
type ImageUrl = { url: string; detail?: "low" | "high" | "auto" };
type ImageContentPart = { type: "image_url"; image_url: ImageUrl };
// Export the ChatCompletionContentPart type
export type ChatCompletionContentPart = TextContentPart | ImageContentPart;

// Type for a single message in the chat completion request
// Refined based on OpenRouter docs (ContentPart[] only for user, specific roles for name)
// Linter Fix: Update assistant role to allow tool_calls and null content
export type ChatCompletionMessageParam =
  | {
      role: "system";
      content: string;
      name?: string;
    }
  | {
      role: "user";
      content: string | Array<ChatCompletionContentPart>;
      name?: string;
    }
  | {
      role: "assistant";
      content: string | null; // Allow null content if using tool_calls
      name?: string;
      tool_calls?: Array<{ // Add optional tool_calls here
         id: string;
         type: "function";
         function: {
           name: string;
           arguments: string; // Arguments are a string before parsing
         };
      }>; 
    }
  | {
      role: "tool";
      content: string;
      tool_call_id: string;
      name?: string; // Optional name for tool role message
    };

// Types for Tools
interface FunctionDescription {
    name: string;
    description?: string;
    parameters?: object; // JSON Schema object
}
export interface ChatCompletionTool {
    type: "function";
    function: FunctionDescription;
}

// Type for Tool Choice
type ChatCompletionToolChoiceOption =
    | "none"
    | "auto"
    | { type: "function"; function: { name: string } };

// Type for Response Format - Added json_schema support
export type ChatCompletionResponseFormat =
  | { type?: "text" | "json_object" }
  | {
      type: "json_schema";
      json_schema: {
        name: string;
        strict?: boolean; // Optional strict mode
        schema: object; // JSON Schema object
      };
    };

// Type for Provider Routing Preferences
// Based on OpenRouter docs: https://openrouter.ai/docs/features/provider-routing
export interface ProviderPreferences {
    order?: string[];
    allow_fallbacks?: boolean;
    require_parameters?: boolean;
    data_collection?: "allow" | "deny";
    ignore?: string[];
    quantizations?: string[];
    sort?: "price" | "throughput" | "latency";
}

// Type for Reasoning configuration
export interface ReasoningConfig {
  effort?: "low" | "medium" | "high";
  max_tokens?: number;
  exclude?: boolean;
  enabled?: boolean;
}

export interface ChatCompletionParams {
  model: string; // Primary model
  models?: string[]; // Fallback models (optional)
  messages: Array<ChatCompletionMessageParam>;
  tools?: ChatCompletionTool[];
  tool_choice?: ChatCompletionToolChoiceOption;
  temperature?: number;
  max_tokens?: number;
  response_format?: ChatCompletionResponseFormat;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stream?: boolean; // Add stream capability
  stop?: string | string[]; // Added stop sequences
  seed?: number; // Added seed
  top_k?: number; // Added top_k
  repetition_penalty?: number; // Added repetition_penalty
  logit_bias?: { [key: number]: number }; // Added logit_bias
  provider?: ProviderPreferences; // Add provider routing preferences (optional)
  transforms?: ("middle-out")[]; // Add message transforms
  reasoning?: ReasoningConfig; // Add reasoning tokens support
  effort?: "low" | "medium" | "high"; // Legacy support
  exclude?: boolean; // Legacy support
}

// Define a type for the payload sent to OpenRouter
interface OpenRouterPayload {
  model: string;
  models?: string[]; // Add optional fallback models
  messages: Array<ChatCompletionMessageParam>;
  temperature: number;
  top_p: number;
  frequency_penalty: number;
  presence_penalty: number;
  stream: boolean;
  max_tokens?: number;
  response_format?: ChatCompletionResponseFormat;
  tools?: ChatCompletionTool[];
  tool_choice?: ChatCompletionToolChoiceOption;
  stop?: string | string[]; 
  seed?: number; 
  top_k?: number; 
  repetition_penalty?: number; 
  logit_bias?: { [key: number]: number }; 
  provider?: ProviderPreferences; // Add provider preferences
  transforms?: ("middle-out")[]; // Add message transforms
  reasoning?: ReasoningConfig; // Add reasoning tokens support
  effort?: "low" | "medium" | "high"; // Legacy support
  exclude?: boolean; // Legacy support
}

export const createChatCompletion = async (params: ChatCompletionParams) => {
  const {
    model,
    models, // Destructure fallback models
    messages,
    tools,
    tool_choice = 'auto',
    temperature = 1,
    max_tokens,
    response_format,
    top_p = 1,
    frequency_penalty = 0,
    presence_penalty = 0,
    stream = false,
    stop,
    seed,
    top_k,
    repetition_penalty,
    logit_bias,
    provider, // Destructure provider preferences
    transforms, // Destructure transforms
    reasoning, // Destructure reasoning config
    effort, // Legacy support
    exclude, // Legacy support
  } = params;

  const payload: OpenRouterPayload = { // Use the defined payload type
    model, // Primary model
    messages,
    temperature,
    top_p,
    frequency_penalty,
    presence_penalty,
    stream,
  };

  // Conditionally add optional parameters if provided
  if (models && models.length > 0) payload.models = models; // Add fallback models
  if (max_tokens !== undefined) payload.max_tokens = max_tokens;
  if (response_format !== undefined) payload.response_format = response_format;
  if (tools) {
    payload.tools = tools;
    payload.tool_choice = tool_choice;
  }
  if (stop !== undefined) payload.stop = stop;
  if (seed !== undefined) payload.seed = seed;
  if (top_k !== undefined) payload.top_k = top_k;
  if (repetition_penalty !== undefined) payload.repetition_penalty = repetition_penalty;
  if (logit_bias !== undefined) payload.logit_bias = logit_bias;
  if (provider !== undefined) payload.provider = provider; // Add provider preferences
  if (transforms !== undefined) payload.transforms = transforms; // Add transforms
  
  // Handle reasoning tokens (new unified approach)
  if (reasoning !== undefined) payload.reasoning = reasoning;
  
  // Handle legacy reasoning parameters for backward compatibility
  if (effort !== undefined && reasoning === undefined) payload.effort = effort;
  if (exclude !== undefined && reasoning === undefined) payload.exclude = exclude;


  try {
    const response = await axios.post(OPENROUTER_CHAT_COMPLETIONS_URL, payload, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        //'HTTP-Referer': SITE_URL,
        //'X-Title': SITE_NAME,
      },
      timeout: 120000, // Increased timeout to 120 seconds
      responseType: stream ? 'stream' : 'json', // Handle stream response
    });
    console.log("isStream:", stream);

    // If streaming, return the stream directly
    if (stream) {
      return response.data; // Return the stream object (Node.js stream from axios)
    }

    return response.data;
  } catch (error: unknown) { // Use unknown for better type safety
    // Type guard to check if error is an AxiosError or standard Error
    let errorMessage = 'An unknown error occurred';
    if (axios.isAxiosError(error)) {
        console.error('OpenRouter API request failed (AxiosError): C:', error.message);
        if (error.response) {
            console.error('Error Response Status:', error.response.status);
            // Attempt to stringify safely, handling potential circular references
            try {
                 console.error('Error Response Data:', JSON.stringify(error.response.data, null, 2));
            } catch (stringifyError) {
                 console.error('Error Response Data (raw): C:', error.response.data);
                 console.error('Could not stringify error response data:', stringifyError);
            }
            // Use optional chaining for safer access to nested error properties
            errorMessage = error.response?.data?.error?.message ?? error.message;
        } else {
            errorMessage = error.message; // No response received
        }
    } else if (error instanceof Error) {
        console.error('OpenRouter API request failed (Error): C:', error.message);
        errorMessage = error.message;
    } else {
         console.error('OpenRouter API request failed with non-error type: C:', error);
    }

    // Return an error object structure consistent with non-error responses if possible
    // This helps standardize error handling downstream
    return { 
        error: { 
            message: `Failed to communicate with OpenRouter API: ${errorMessage}`,
            // Optionally include status code if available
            status: (axios.isAxiosError(error) && error.response) ? error.response.status : undefined
        } 
    };
  }
};


