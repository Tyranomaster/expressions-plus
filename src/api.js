/**
 * Classification API for Expressions+
 */

import { Fuse } from '../../../../../lib.js';
import { eventSource, event_types, generateQuietPrompt, generateRaw, getRequestHeaders, online_status, substituteParams, substituteParamsExtended } from '../../../../../script.js';
import { doExtrasFetch, getApiUrl, modules } from '../../../../extensions.js';
import { isJsonSchemaSupported } from '../../../../textgen-settings.js';
import { trimToEndSentence, trimToStartSentence, waitUntilCondition } from '../../../../utils.js';
import { generateWebLlmChatPrompt, isWebLlmSupported } from '../../../shared.js';
import { removeReasoningFromString } from '../../../../reasoning.js';

import { DEFAULT_EXPRESSIONS, EXPRESSION_API, PROMPT_TYPE } from './constants.js';
import { inApiCall, insightPanelVisible, setInApiCall, setLastClassificationScores } from './state.js';
import { getSettings } from './settings.js';
import { selectExpression } from './classification.js';

// Forward declaration - will be set by index.js
let getExpressionsList = null;
let updateInsightPanel = null;

/**
 * Sets the getExpressionsList function reference
 * @param {Function} fn 
 */
export function setGetExpressionsListFn(fn) {
    getExpressionsList = fn;
}

/**
 * Sets the updateInsightPanel function reference
 * @param {Function} fn 
 */
export function setUpdateInsightPanelFn(fn) {
    updateInsightPanel = fn;
}

// ============================================================================
// Classification API
// ============================================================================

/**
 * Processes the classification text to reduce the amount of text sent to the API.
 * @param {string} text The text to process.
 * @returns {string}
 */
function sampleClassifyText(text) {
    if (!text) return text;

    let result = substituteParams(text).replace(/[*"]/g, '');

    if (getSettings().api === EXPRESSION_API.llm) {
        return result.trim();
    }

    const SAMPLE_THRESHOLD = 500;
    const HALF_SAMPLE_THRESHOLD = SAMPLE_THRESHOLD / 2;

    if (text.length < SAMPLE_THRESHOLD) {
        result = trimToEndSentence(result);
    } else {
        result = trimToEndSentence(result.slice(0, HALF_SAMPLE_THRESHOLD)) + ' ' + trimToStartSentence(result.slice(-HALF_SAMPLE_THRESHOLD));
    }

    return result.trim();
}

/**
 * Gets the classification prompt for the LLM API.
 * @param {string[]} labels A list of labels to search for.
 * @returns {Promise<string>} Prompt for the LLM API.
 */
async function getLlmPrompt(labels) {
    const labelsString = labels.map(x => `"${x}"`).join(', ');
    const prompt = substituteParamsExtended(String(getSettings().llmPrompt), { labels: labelsString });
    return prompt;
}

/**
 * Parses the emotion response from the LLM API.
 * @param {string} emotionResponse The response from the LLM API.
 * @param {string[]} labels A list of labels to search for.
 * @returns {string} The parsed emotion or the fallback expression.
 */
function parseLlmResponse(emotionResponse, labels) {
    try {
        const parsedEmotion = JSON.parse(emotionResponse);
        const response = parsedEmotion?.emotion?.trim()?.toLowerCase();

        if (!response || !labels.includes(response)) {
            throw new Error('Emotion not in labels');
        }

        return response;
    } catch {
        emotionResponse = removeReasoningFromString(emotionResponse);

        const fuse = new Fuse(labels, { includeScore: true });
        const result = fuse.search(emotionResponse);
        if (result.length > 0) {
            return result[0].item;
        }
        const lowerCaseResponse = String(emotionResponse || '').toLowerCase();
        for (const label of labels) {
            if (lowerCaseResponse.includes(label.toLowerCase())) {
                return label;
            }
        }
    }

    throw new Error('Could not parse emotion response ' + emotionResponse);
}

/**
 * Gets the JSON schema for the LLM API.
 * @param {string[]} emotions A list of emotions to search for.
 * @returns {object} The JSON schema for the LLM API.
 */
function getJsonSchema(emotions) {
    return {
        $schema: 'http://json-schema.org/draft-04/schema#',
        type: 'object',
        properties: {
            emotion: {
                type: 'string',
                enum: emotions,
            },
        },
        required: ['emotion'],
        additionalProperties: false,
    };
}

/**
 * Handler for text generation settings ready event
 * @param {Object} args 
 */
export function onTextGenSettingsReady(args) {
    if (inApiCall && getSettings().api === EXPRESSION_API.llm && isJsonSchemaSupported()) {
        const emotions = DEFAULT_EXPRESSIONS;
        Object.assign(args, {
            top_k: 1,
            stop: [],
            stopping_strings: [],
            custom_token_bans: [],
            json_schema: getJsonSchema(emotions),
        });
    }
}

/**
 * Gets the full classification scores from the API
 * @param {string} text - The text to classify
 * @returns {Promise<import('./constants.js').EmotionScore[]>} Array of emotion scores sorted by score descending
 */
export async function getClassificationScores(text) {
    const settings = getSettings();
    
    if ((!modules.includes('classify') && settings.api == EXPRESSION_API.extras) || !text) {
        return [];
    }

    if (settings.translate && typeof globalThis.translate === 'function') {
        text = await globalThis.translate(text, 'en');
    }

    text = sampleClassifyText(text);

    try {
        switch (settings.api) {
            case EXPRESSION_API.local: {
                const localResult = await fetch('/api/extra/classify', {
                    method: 'POST',
                    headers: getRequestHeaders(),
                    body: JSON.stringify({ text: text }),
                });

                if (localResult.ok) {
                    const data = await localResult.json();
                    // The API returns top 5, but we need all scores
                    // The classification array is already sorted by score
                    return data.classification.map(item => ({
                        label: item.label,
                        score: item.score,
                    }));
                }
            } break;

            case EXPRESSION_API.llm: {
                try {
                    await waitUntilCondition(() => online_status !== 'no_connection', 3000, 250);
                } catch (error) {
                    console.warn('No LLM connection', error);
                    return [];
                }

                // LLM only returns one label, so we create a mock score array
                const expressionsList = await getExpressionsList();
                const prompt = await getLlmPrompt(expressionsList);
                eventSource.once(event_types.TEXT_COMPLETION_SETTINGS_READY, onTextGenSettingsReady);

                let emotionResponse;
                try {
                    setInApiCall(true);
                    switch (settings.promptType) {
                        case PROMPT_TYPE.raw:
                            emotionResponse = await generateRaw({ prompt: text, systemPrompt: prompt });
                            break;
                        case PROMPT_TYPE.full:
                            emotionResponse = await generateQuietPrompt({ quietPrompt: prompt });
                            break;
                    }
                } finally {
                    setInApiCall(false);
                }
                
                const label = parseLlmResponse(emotionResponse, expressionsList);
                // Return as single high-confidence score since LLM gives one answer
                return [{ label, score: 1.0 }];
            }

            case EXPRESSION_API.webllm: {
                if (!isWebLlmSupported()) {
                    return [];
                }

                const expressionsList = await getExpressionsList();
                const prompt = await getLlmPrompt(expressionsList);
                const messages = [{ role: 'user', content: text + '\n\n' + prompt }];

                const emotionResponse = await generateWebLlmChatPrompt(messages);
                const label = parseLlmResponse(emotionResponse, expressionsList);
                return [{ label, score: 1.0 }];
            }

            case EXPRESSION_API.extras: {
                const url = new URL(getApiUrl());
                url.pathname = '/api/classify';

                const extrasResult = await doExtrasFetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Bypass-Tunnel-Reminder': 'bypass',
                    },
                    body: JSON.stringify({ text: text }),
                });

                if (extrasResult.ok) {
                    const data = await extrasResult.json();
                    return data.classification.map(item => ({
                        label: item.label,
                        score: item.score,
                    }));
                }
            } break;

            case EXPRESSION_API.none:
                return [];

            default:
                return [];
        }
    } catch (error) {
        console.error('Classification error:', error);
    }

    return [];
}

/**
 * Retrieves the expression label based on classification - compatibility wrapper
 * @param {string} text - The text to classify
 * @returns {Promise<string|null>} - The expression label
 */
export async function getExpressionLabel(text) {
    const scores = await getClassificationScores(text);
    setLastClassificationScores(scores);
    
    // Update insight panel
    if (insightPanelVisible && updateInsightPanel) {
        updateInsightPanel(scores);
    }
    
    const result = selectExpression(scores);
    return result.expression;
}
