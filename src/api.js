/**
 * Classification API for Expressions+
 * 
 * This extension uses only the Local classification API, which leverages
 * the built-in transformers.js model for emotion classification.
 */

import { getRequestHeaders, substituteParams } from '../../../../../script.js';
import { trimToEndSentence, trimToStartSentence } from '../../../../utils.js';

import { insightPanelVisible, setLastClassificationScores } from './state.js';
import { getSettings } from './settings.js';
import { selectExpression } from './classification.js';

// Forward declaration - will be set by index.js
let updateInsightPanel = null;

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
 * Gets the full classification scores from the Local API
 * @param {string} text - The text to classify
 * @returns {Promise<import('./constants.js').EmotionScore[]>} Array of emotion scores sorted by score descending
 */
export async function getClassificationScores(text) {
    const settings = getSettings();
    
    if (!text) {
        return [];
    }

    if (settings.translate && typeof globalThis.translate === 'function') {
        text = await globalThis.translate(text, 'en');
    }

    text = sampleClassifyText(text);

    try {
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
