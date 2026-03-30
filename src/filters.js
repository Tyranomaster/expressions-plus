/**
 * Text Filter System for Expressions+
 *
 * Provides built-in and custom regex-based text filters that remove noise
 * from classifier input (OOC markers, extension injections, HTML, emoji, etc.).
 */

import { BUILTIN_FILTER } from './constants.js';
import { getSettings } from './settings.js';

// ============================================================================
// Built-in Filter Definitions
// ============================================================================

/**
 * Built-in filter definitions. Each has a unique ID, display name,
 * regex pattern, flags, and description.
 * @type {import('./constants.js').TextFilter[]}
 */
const BUILTIN_FILTERS = [
    {
        id: BUILTIN_FILTER.OOC,
        name: 'OOC Markers',
        description: 'Removes out-of-character text: ((text)), [OOC: ...], OOC: prefixes, etc.',
        pattern: String.raw`\(\([\s\S]*?\)\)|\[OOC[:\s][^\]]*\]|(?:^|\n)\s*OOC\s*:.*?(?:\n|$)`,
        flags: 'gi',
        replacement: ' ',
        enabled: true,
        isBuiltIn: true,
    },
    {
        id: BUILTIN_FILTER.EXTENSIONS,
        name: 'System/Extension Injections',
        description: 'Removes {{macros}}, XML-style <tags>...</tags>, and common extension patterns.',
        pattern: String.raw`\{\{[^}]*\}\}|<\/?[a-zA-Z][a-zA-Z0-9_-]*(?:\s[^>]*)?>`,
        flags: 'gi',
        replacement: ' ',
        enabled: true,
        isBuiltIn: true,
    },
    {
        id: BUILTIN_FILTER.HTML,
        name: 'HTML/Formatting Artifacts',
        description: 'Removes HTML entities, residual markdown formatting, and code blocks.',
        pattern: '&[a-zA-Z]+;|&#\\d+;|~~[^~]+~~|__([^_]+)__',
        flags: 'gi',
        replacement: ' ',
        enabled: true,
        isBuiltIn: true,
    },
    {
        id: BUILTIN_FILTER.RP_MARKUP,
        name: 'RP Markup (Asterisks & Quotes)',
        description: 'Removes asterisks (*) and double-quotes (") commonly used for RP action/narration formatting.',
        pattern: '[*"]',
        flags: 'g',
        replacement: '',
        enabled: false,
        isBuiltIn: true,
    },
    {
        id: BUILTIN_FILTER.EMOJI,
        name: 'Emoji/Unicode Symbols',
        description: 'Removes emoji and special unicode symbols.',
        pattern: '[\\u{1F600}-\\u{1F64F}\\u{1F300}-\\u{1F5FF}\\u{1F680}-\\u{1F6FF}\\u{1F1E0}-\\u{1F1FF}\\u{2600}-\\u{26FF}\\u{2700}-\\u{27BF}\\u{FE00}-\\u{FE0F}\\u{1F900}-\\u{1F9FF}\\u{1FA00}-\\u{1FA6F}\\u{1FA70}-\\u{1FAFF}\\u{200D}\\u{20E3}\\u{E0020}-\\u{E007F}]+',
        flags: 'gu',
        replacement: '',
        enabled: false,
        isBuiltIn: true,
    },
];

// ============================================================================
// Filter Operations
// ============================================================================

/**
 * Gets all built-in filter definitions (with current enabled state from settings)
 * @returns {import('./constants.js').TextFilter[]}
 */
export function getBuiltInFilters() {
    const settings = getSettings();
    return BUILTIN_FILTERS.map(filter => ({
        ...filter,
        enabled: settings.filtersBuiltIn?.[filter.id] ?? filter.enabled,
    }));
}

/**
 * Gets all active filters (built-in + custom) in apply order
 * @returns {import('./constants.js').TextFilter[]}
 */
export function getActiveFilters() {
    const settings = getSettings();
    const builtIn = getBuiltInFilters().filter(f => f.enabled);
    const custom = (settings.filtersCustom || []).filter(f => f.enabled);
    return [...builtIn, ...custom];
}

/**
 * Gets all filters (built-in + custom), including disabled ones
 * @returns {import('./constants.js').TextFilter[]}
 */
export function getAllFilters() {
    const settings = getSettings();
    const builtIn = getBuiltInFilters();
    const custom = settings.filtersCustom || [];
    return [...builtIn, ...custom];
}

/**
 * Applies a single filter to text
 * @param {string} text - Input text
 * @param {import('./constants.js').TextFilter} filter - Filter to apply
 * @returns {string} Filtered text
 */
export function applyFilter(text, filter) {
    if (!text || !filter.pattern) return text;

    try {
        const regex = new RegExp(filter.pattern, filter.flags || 'gi');
        return text.replace(regex, filter.replacement ?? '');
    } catch (error) {
        console.warn(`Expressions+ Filter: Invalid regex in filter "${filter.name}":`, error);
        return text;
    }
}

/**
 * Applies all active filters to text in sequence
 * @param {string} text - Input text
 * @returns {string} Filtered text
 */
export function applyAllFilters(text) {
    if (!text) return text;

    const activeFilters = getActiveFilters();
    let result = text;

    for (const filter of activeFilters) {
        result = applyFilter(result, filter);
    }

    result = result.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();

    return result;
}

/**
 * @typedef {Object} OffsetMapping
 * @property {number} filteredIndex - Position in filtered text
 * @property {number} originalIndex - Corresponding position in original text
 */

/**
 * Applies a single filter to text while building an offset map.
 * The offset map tracks drift between original positions and filtered positions.
 * @param {string} text - Current text (may already be partially filtered)
 * @param {import('./constants.js').TextFilter} filter - Filter to apply
 * @param {number[]} posMap - Position map: posMap[filteredIndex] = originalIndex
 * @returns {{ text: string, posMap: number[] }}
 */
function applyFilterTracked(text, filter, posMap) {
    if (!text || !filter.pattern) return { text, posMap };

    try {
        const regex = new RegExp(filter.pattern, filter.flags || 'gi');
        const replacement = filter.replacement ?? '';
        let newText = '';
        let newPosMap = [];
        let lastIndex = 0;

        for (const match of text.matchAll(new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : regex.flags + 'g'))) {
            const matchStart = match.index;
            const matchEnd = matchStart + match[0].length;

            for (let i = lastIndex; i < matchStart; i++) {
                newPosMap.push(posMap[i]);
                newText += text[i];
            }

            for (let i = 0; i < replacement.length; i++) {
                newPosMap.push(posMap[matchStart]);
                newText += replacement[i];
            }

            lastIndex = matchEnd;
        }

        for (let i = lastIndex; i < text.length; i++) {
            newPosMap.push(posMap[i]);
            newText += text[i];
        }

        return { text: newText, posMap: newPosMap };
    } catch (error) {
        console.warn(`Expressions+ Filter: Invalid regex in filter "${filter.name}":`, error);
        return { text, posMap };
    }
}

/**
 * Applies all active filters to text with full offset tracking.
 * Returns filtered text plus a position map that maps each character
 * in the filtered text back to its original position in the input text.
 * @param {string} text - Input text
 * @returns {{ filteredText: string, posMap: number[] }}
 */
export function applyAllFiltersWithOffsets(text) {
    if (!text) return { filteredText: text || '', posMap: [] };

    const activeFilters = getActiveFilters();

    let posMap = Array.from({ length: text.length }, (_, i) => i);
    let current = text;

    for (const filter of activeFilters) {
        const result = applyFilterTracked(current, filter, posMap);
        current = result.text;
        posMap = result.posMap;
    }

    const wsResult = applyFilterTracked(current, {
        id: '_ws_cleanup',
        name: 'Whitespace cleanup',
        pattern: '[ \\t]+',
        flags: 'g',
        replacement: ' ',
        enabled: true,
    }, posMap);
    current = wsResult.text;
    posMap = wsResult.posMap;

    const nlResult = applyFilterTracked(current, {
        id: '_nl_cleanup',
        name: 'Newline cleanup',
        pattern: '\\n{3,}',
        flags: 'g',
        replacement: '\\n\\n',
        enabled: true,
    }, posMap);
    current = nlResult.text;
    posMap = nlResult.posMap;

    let trimStart = 0;
    while (trimStart < current.length && /\s/.test(current[trimStart])) trimStart++;
    let trimEnd = current.length;
    while (trimEnd > trimStart && /\s/.test(current[trimEnd - 1])) trimEnd--;

    const trimmedText = current.slice(trimStart, trimEnd);
    const trimmedPosMap = posMap.slice(trimStart, trimEnd);

    return { filteredText: trimmedText, posMap: trimmedPosMap };
}

/**
 * Applies all active filters with per-step intermediate results for the inspector.
 * Returns the same final result as `applyAllFiltersWithOffsets` plus an array of
 * step snapshots showing the text after each individual filter was applied.
 * @param {string} text - Input text
 * @returns {{ filteredText: string, posMap: number[], steps: { filterName: string, filterId: string, filterPattern: string, filterFlags: string, filterReplacement: string, textBefore: string, textAfter: string, charsRemoved: number }[] }}
 */
export function applyAllFiltersWithSteps(text) {
    if (!text) return { filteredText: text || '', posMap: [], steps: [] };

    const activeFilters = getActiveFilters();

    let posMap = Array.from({ length: text.length }, (_, i) => i);
    let current = text;
    /** @type {{ filterName: string, filterId: string, filterPattern: string, filterFlags: string, filterReplacement: string, textBefore: string, textAfter: string, charsRemoved: number }[]} */
    const steps = [];

    for (const filter of activeFilters) {
        const before = current;
        const result = applyFilterTracked(current, filter, posMap);
        current = result.text;
        posMap = result.posMap;
        steps.push({
            filterName: filter.name,
            filterId: filter.id,
            filterPattern: filter.pattern,
            filterFlags: filter.flags || 'gi',
            filterReplacement: filter.replacement ?? '',
            textBefore: before,
            textAfter: current,
            charsRemoved: before.length - current.length,
        });
    }

    const wsResult = applyFilterTracked(current, {
        id: '_ws_cleanup',
        name: 'Whitespace cleanup',
        pattern: '[ \\t]+',
        flags: 'g',
        replacement: ' ',
        enabled: true,
    }, posMap);
    current = wsResult.text;
    posMap = wsResult.posMap;

    const nlResult = applyFilterTracked(current, {
        id: '_nl_cleanup',
        name: 'Newline cleanup',
        pattern: '\\n{3,}',
        flags: 'g',
        replacement: '\\n\\n',
        enabled: true,
    }, posMap);
    current = nlResult.text;
    posMap = nlResult.posMap;

    let trimStart = 0;
    while (trimStart < current.length && /\s/.test(current[trimStart])) trimStart++;
    let trimEnd = current.length;
    while (trimEnd > trimStart && /\s/.test(current[trimEnd - 1])) trimEnd--;

    const trimmedText = current.slice(trimStart, trimEnd);
    const trimmedPosMap = posMap.slice(trimStart, trimEnd);

    return { filteredText: trimmedText, posMap: trimmedPosMap, steps };
}

/**
 * Tests a filter against sample text and returns match info
 * @param {string} pattern - Regex pattern
 * @param {string} flags - Regex flags
 * @param {string} sampleText - Text to test against
 * @returns {{ matches: RegExpMatchArray[], resultText: string, error: string|null }}
 */
export function testFilter(pattern, flags, sampleText) {
    try {
        const regex = new RegExp(pattern, flags || 'gi');
        const matches = [...sampleText.matchAll(new RegExp(pattern, flags.includes('g') ? flags : flags + 'g'))];
        const resultText = sampleText.replace(regex, '');
        return { matches, resultText, error: null };
    } catch (error) {
        return { matches: [], resultText: sampleText, error: error.message };
    }
}

// ============================================================================
// Custom Filter CRUD
// ============================================================================

/**
 * Creates a new custom filter
 * @param {Object} options
 * @param {string} options.name - Display name
 * @param {string} [options.description=''] - Human-readable description
 * @param {string} options.pattern - Regex pattern
 * @param {string} [options.flags='gi'] - Regex flags
 * @param {string} [options.replacement=''] - Replacement string
 * @param {boolean} [options.enabled=true] - Whether active
 * @returns {import('./constants.js').TextFilter}
 */
export function createCustomFilter({ name, description = '', pattern, flags = 'gi', replacement = '', enabled = true }) {
    const id = `custom_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    return { id, name, description, pattern, flags, replacement, enabled, isBuiltIn: false };
}

/**
 * Adds a custom filter to settings
 * @param {import('./constants.js').TextFilter} filter
 */
export function addCustomFilter(filter) {
    const settings = getSettings();
    if (!Array.isArray(settings.filtersCustom)) {
        settings.filtersCustom = [];
    }
    settings.filtersCustom.push(filter);
}

/**
 * Updates an existing custom filter in settings
 * @param {string} filterId
 * @param {Partial<import('./constants.js').TextFilter>} updates
 * @returns {boolean} Whether the filter was found and updated
 */
export function updateCustomFilter(filterId, updates) {
    const settings = getSettings();
    const filter = (settings.filtersCustom || []).find(f => f.id === filterId);
    if (!filter) return false;
    Object.assign(filter, updates);
    return true;
}

/**
 * Removes a custom filter from settings
 * @param {string} filterId
 * @returns {boolean} Whether the filter was found and removed
 */
export function removeCustomFilter(filterId) {
    const settings = getSettings();
    if (!Array.isArray(settings.filtersCustom)) return false;
    const index = settings.filtersCustom.findIndex(f => f.id === filterId);
    if (index < 0) return false;
    settings.filtersCustom.splice(index, 1);
    return true;
}

// ============================================================================
// Filter Preset Export/Import
// ============================================================================

/**
 * Exports current filter configuration as a JSON preset object
 * @returns {import('./constants.js').FilterPreset}
 */
export function exportFilterPreset() {
    const settings = getSettings();
    return {
        type: 'expressions-plus-filters',
        version: 1,
        builtInStates: { ...(settings.filtersBuiltIn || {}) },
        customFilters: structuredClone(settings.filtersCustom || []),
    };
}

/**
 * Imports a filter preset, replacing current filter configuration
 * @param {any} data - Parsed JSON data
 * @returns {boolean} Whether import was successful
 */
export function importFilterPreset(data) {
    if (!data || data.type !== 'expressions-plus-filters') {
        return false;
    }

    const settings = getSettings();

    if (data.builtInStates && typeof data.builtInStates === 'object') {
        settings.filtersBuiltIn = { ...settings.filtersBuiltIn, ...data.builtInStates };
    }

    if (Array.isArray(data.customFilters)) {
        settings.filtersCustom = data.customFilters.map(f => ({
            ...f,
            id: `custom_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            isBuiltIn: false,
        }));
    }

    return true;
}
