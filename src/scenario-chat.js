/**
 * Scenario Chat Detection for Expressions+
 *
 * Detects and splits "scenario" or "multi-character in a single card" messages
 * where one message contains dialogue from multiple characters, identified by
 * configurable name markers (e.g., **Char1**: text).
 *
 * Each detected character's text is classified independently and shown as a
 * separate row in the segment carousel.
 */

import { SCENARIO_PATTERN } from './constants.js';
import { getSettings } from './settings.js';

// ============================================================================
// Built-in Pattern Registry
// ============================================================================

/**
 * Returns the registry of built-in scenario detection patterns.
 * Each pattern's regex must contain exactly one capture group that matches the character name.
 * @returns {import('./constants.js').ScenarioPattern[]}
 */
export function getBuiltInPatterns() {
    return [
        {
            id: SCENARIO_PATTERN.BOLD_MARKDOWN,
            name: 'Bold Markdown',
            description: 'Matches **Character Name**: text',
            pattern: '\\*\\*(.+?)\\*\\*:\\s*',
            flags: 'gm',
        },
        {
            id: SCENARIO_PATTERN.PLAIN_COLON,
            name: 'Plain Colon',
            description: 'Matches CharacterName: text at the start of a line',
            pattern: "^([A-Z][a-zA-Z\\s'\\-]+?):\\s+",
            flags: 'gm',
        },
        {
            id: SCENARIO_PATTERN.ITALIC_MARKDOWN,
            name: 'Italic Markdown',
            description: 'Matches *Character Name*: text',
            pattern: '(?<!\\*)\\*([^*]+)\\*:\\s*',
            flags: 'gm',
        },
    ];
}

// ============================================================================
// Pattern Resolution
// ============================================================================

/**
 * Compiles all enabled scenario detection patterns from settings.
 * Returns an empty array if scenario detection is disabled or no patterns are valid.
 * @param {Object} settings - Extension settings
 * @returns {RegExp[]}
 */
export function getActiveScenarioPatterns(settings) {
    if (!settings.scenarioEnabled) return [];

    const compiled = [];
    const builtIns = getBuiltInPatterns();
    const enabledMap = settings.scenarioPatterns || {};

    for (const bp of builtIns) {
        if (enabledMap[bp.id]) {
            try {
                compiled.push(new RegExp(bp.pattern, bp.flags));
            } catch {
                // skip invalid
            }
        }
    }

    // Custom pattern rules
    if (Array.isArray(settings.scenarioCustomPatterns)) {
        for (const cp of settings.scenarioCustomPatterns) {
            if (!cp.enabled || !cp.pattern) continue;
            try {
                const hasCaptureGroup = new RegExp('|' + cp.pattern).exec('').length >= 2;
                let finalPattern = cp.pattern;
                if (!hasCaptureGroup) {
                    finalPattern = '(' + cp.pattern + ')';
                }
                const re = new RegExp(finalPattern, cp.flags || 'gm');
                compiled.push(re);
            } catch (err) {
                console.warn(`Expressions+ Scenario: Invalid custom pattern "${cp.name}":`, err.message);
            }
        }
    }

    return compiled;
}

// ============================================================================
// Message Splitting
// ============================================================================

/**
 * Collects character-name markers from text using multiple patterns.
 * Runs each regex independently, merges all markers sorted by position,
 * and removes overlapping duplicates (earlier marker wins at same position).
 *
 * @param {string} text - The raw message text
 * @param {RegExp[]} patterns - Array of compiled regexes, each with one capture group
 * @returns {{ characterName: string, markerStart: number, markerEnd: number }[]}
 */
function collectAllMarkers(text, patterns) {
    /** @type {{ characterName: string, markerStart: number, markerEnd: number }[]} */
    const allMarkers = [];

    for (const pattern of patterns) {
        pattern.lastIndex = 0;
        let match;
        while ((match = pattern.exec(text)) !== null) {
            allMarkers.push({
                characterName: (match[1] ?? match[0]).trim(),
                markerStart: match.index,
                markerEnd: match.index + match[0].length,
            });
            if (match[0].length === 0) pattern.lastIndex++;
        }
    }

    // Sort by position
    allMarkers.sort((a, b) => a.markerStart - b.markerStart);

    // Remove overlapping markers (keep the one that starts first; skip later ones that overlap)
    const deduped = [];
    let lastEnd = -1;
    for (const marker of allMarkers) {
        if (marker.markerStart >= lastEnd) {
            deduped.push(marker);
            lastEnd = marker.markerEnd;
        }
    }

    return deduped;
}

/**
 * Splits a message into per-character segments using the supplied patterns.
 * Text before the first character marker is attributed to `cardCharacterName`.
 *
 * @param {string} text - The raw message text
 * @param {RegExp[]} patterns - Array of compiled regexes, each with one capture group for the character name
 * @param {string} cardCharacterName - Name of the card's main character (for unattributed preamble)
 * @returns {import('./constants.js').ScenarioSegment[]}
 */
export function splitMessageByCharacters(text, patterns, cardCharacterName) {
    if (!text || !patterns || patterns.length === 0) return [];

    const markers = collectAllMarkers(text, patterns);

    if (markers.length === 0) return [];

    /** @type {import('./constants.js').ScenarioSegment[]} */
    const segments = [];

    // Preamble: text before the first marker → attributed to the card character
    if (markers[0].markerStart > 0) {
        const preamble = text.substring(0, markers[0].markerStart).trim();
        if (preamble) {
            segments.push({
                characterName: cardCharacterName,
                text: preamble,
                startIndex: 0,
                endIndex: markers[0].markerStart,
            });
        }
    }

    // Each marker's text runs from after its marker to the start of the next marker (or end of string)
    for (let i = 0; i < markers.length; i++) {
        const textStart = markers[i].markerEnd;
        const textEnd = (i + 1 < markers.length) ? markers[i + 1].markerStart : text.length;
        const charText = text.substring(textStart, textEnd).trim();

        if (charText) {
            segments.push({
                characterName: markers[i].characterName,
                text: charText,
                startIndex: textStart,
                endIndex: textEnd,
            });
        }
    }

    return segments;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Main entry point: detects and splits a message into per-character segments
 * using the currently configured scenario patterns.
 *
 * Returns an empty array if scenario mode is disabled, no pattern matches,
 * or fewer than 2 distinct segments are found (not a multi-character message).
 *
 * @param {string} text - The raw message text
 * @param {string} cardCharacterName - Name of the card's main character
 * @returns {import('./constants.js').ScenarioSegment[]}
 */
export function detectScenarioSegments(text, cardCharacterName) {
    const settings = getSettings();
    if (!settings.scenarioEnabled) return [];

    const patterns = getActiveScenarioPatterns(settings);
    if (patterns.length === 0) return [];

    const segments = splitMessageByCharacters(text, patterns, cardCharacterName);

    // Only treat as a scenario message if multiple meaningful segments are found
    // (either multiple characters, or preamble + one character)
    if (segments.length < 2) return [];

    return segments;
}
