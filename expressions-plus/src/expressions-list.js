/**
 * Expressions List Management for Expressions+
 */

import { getRequestHeaders } from '../../../../../script.js';
import { doExtrasFetch, getApiUrl, modules } from '../../../../extensions.js';
import { onlyUnique } from '../../../../utils.js';
import { selected_group } from '../../../../group-chats.js';

import { DEFAULT_EXPRESSIONS, EXPRESSION_API } from './constants.js';
import { expressionsList, spriteCache, setExpressionsList } from './state.js';
import { getSettings } from './settings.js';
import { getSpriteFolderName, getLastCharacterMessage } from './sprites.js';

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
    return [...expressionsList, ...(settings.custom || [])].filter(onlyUnique);
}

/**
 * Gets the list of available expressions
 * @param {Object} options
 * @param {boolean} [options.filterAvailable=false] - Filter to only available sprites
 * @returns {Promise<string[]>}
 */
export async function getExpressionsList({ filterAvailable = false } = {}) {
    const settings = getSettings();
    
    if (!Array.isArray(expressionsList)) {
        setExpressionsList(await resolveExpressionsList());
    }

    const expressions = getCachedExpressions();

    if (!filterAvailable || ![EXPRESSION_API.llm, EXPRESSION_API.webllm].includes(settings.api)) {
        return expressions;
    }

    const currentLastMessage = selected_group ? getLastCharacterMessage() : null;
    const spriteFolderName = getSpriteFolderName(currentLastMessage, currentLastMessage?.name);

    return expressions.filter(label => {
        const expression = spriteCache[spriteFolderName]?.find(x => x.label === label);
        return (expression?.files.length ?? 0) > 0;
    });
}

/**
 * Resolves the expressions list from API or defaults
 * @returns {Promise<string[]>}
 */
async function resolveExpressionsList() {
    const settings = getSettings();
    
    try {
        if (settings.api == EXPRESSION_API.extras && modules.includes('classify')) {
            const url = new URL(getApiUrl());
            url.pathname = '/api/classify/labels';

            const apiResult = await doExtrasFetch(url, {
                method: 'GET',
                headers: { 'Bypass-Tunnel-Reminder': 'bypass' },
            });

            if (apiResult.ok) {
                const data = await apiResult.json();
                return data.labels;
            }
        }

        if (settings.api == EXPRESSION_API.local) {
            const apiResult = await fetch('/api/extra/classify/labels', {
                method: 'POST',
                headers: getRequestHeaders({ omitContentType: true }),
            });

            if (apiResult.ok) {
                const data = await apiResult.json();
                return data.labels;
            }
        }
    } catch (error) {
        console.error(error);
    }

    return DEFAULT_EXPRESSIONS.slice();
}
