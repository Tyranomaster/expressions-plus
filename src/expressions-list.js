/**
 * Expressions List Management for Expressions+
 */

import { getRequestHeaders } from '../../../../../script.js';

import { DEFAULT_EXPRESSIONS } from './constants.js';
import { expressionsList, setExpressionsList } from './state.js';
import { getSettings } from './settings.js';

// ============================================================================
// Expressions List
// ============================================================================

/**
 * Gets cached expressions with custom expressions
 * @returns {string[]}
 */
export function getCachedExpressions() {
    if (!Array.isArray(expressionsList)) return [];
    const settings = getSettings();
    const customExpressions = settings.custom || [];
    // Use Set for unique values
    return [...new Set([...expressionsList, ...customExpressions])];
}

/**
 * Gets the list of available expressions
 * @param {Object} options
 * @param {boolean} [options.filterAvailable=false] - Filter to only available sprites (unused for local API)
 * @returns {Promise<string[]>}
 */
export async function getExpressionsList({ filterAvailable = false } = {}) {
    if (!Array.isArray(expressionsList)) {
        setExpressionsList(await resolveExpressionsList());
    }

    return getCachedExpressions();
}

/**
 * Resolves the expressions list from the local classification API
 * @returns {Promise<string[]>}
 */
async function resolveExpressionsList() {
    try {
        const apiResult = await fetch('/api/extra/classify/labels', {
            method: 'POST',
            headers: getRequestHeaders({ omitContentType: true }),
        });

        if (apiResult.ok) {
            const data = await apiResult.json();
            return data.labels;
        }
    } catch (error) {
        console.error(error);
    }

    return DEFAULT_EXPRESSIONS.slice();
}
