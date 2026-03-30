/**
 * Classification API for Expressions+
 * 
 * This extension uses only the Local classification API, which leverages
 * the built-in transformers.js model for emotion classification.
 *
 * v0.4.0: New multi-stage pipeline — filter → segment → sample → classify → select
 */

import { getRequestHeaders, substituteParams } from '../../../../../script.js';
import { trimToEndSentence, trimToStartSentence } from '../../../../utils.js';
import { getContext } from '../../../../extensions.js';

import { insightPanelVisible, setLastClassificationScores, setLastSegmentResults, setCharacterSegmentResults, clearCharacterSegmentResults, setLastScenarioDetected } from './state.js';
import { getSettings } from './settings.js';
import { DEFAULT_SAMPLE_SIZE } from './constants.js';
import { selectExpression } from './classification.js';
import { analyzeAndStore } from './analytics.js';
import { applyAllFilters, applyAllFiltersWithOffsets, applyAllFiltersWithSteps } from './filters.js';
import { segmentText, sampleSegment } from './segmentation.js';
import { detectScenarioSegments } from './scenario-chat.js';
import { isMobile } from '../../../../RossAscends-mods.js';
import { power_user } from '../../../../power-user.js';

let updateInsightPanel = null;

/**
 * Sets the updateInsightPanel function reference
 * @param {Function} fn 
 */
export function setUpdateInsightPanelFn(fn) {
    updateInsightPanel = fn;
}

// ============================================================================
// Text Preprocessing Pipeline
// ============================================================================

/**
 * Preprocesses text through the full filter + sample pipeline for a single text chunk.
 * @param {string} text - Raw segment text
 * @returns {string} Processed text ready for the classifier
 */
function preprocessSegment(text, multiSegmentEnabled) {
    if (!text) return text;

    const settings = getSettings();
    const sampleSize = settings.sampleSize || DEFAULT_SAMPLE_SIZE;

    // When multi-segment is enabled, segmentText() already guarantees all
    // segments fit within sampleSize — no further truncation needed.
    // Only apply sampleSegment in single-segment (legacy) mode where the
    // entire message is one oversized chunk.
    let result = multiSegmentEnabled
        ? text
        : sampleSegment(text, sampleSize, trimToEndSentence, trimToStartSentence);

    return result.trim();
}

/**
 * Full preprocessing pipeline: substituteParams → filters → segmentation → per-segment sampling
 * Now uses offset-tracked filtering to support chat message annotations (Bug 3 fix).
 * @param {string} text - Raw message text
 * @returns {{ segments: import('./constants.js').TextSegment[], originalText: string }} Array of preprocessed segments + original text
 */
function preprocessText(text) {
    if (!text) return { segments: [{ text: '', startIndex: 0, endIndex: 0 }], originalText: '' };

    // Step 1: Macro expansion
    let processed = substituteParams(text);
    const originalText = processed; // Save original (post-macro) text for annotation

    // Step 2: Apply regex filters with offset tracking
    const { filteredText, posMap } = applyAllFiltersWithOffsets(processed);

    // Step 3: Segment the filtered text
    const settings = getSettings();
    let segments;

    if (settings.multiSegmentEnabled) {
        segments = segmentText(filteredText);
    } else {
        // Multi-segment disabled — treat as single segment, apply legacy sample
        segments = [{ text: filteredText, startIndex: 0, endIndex: filteredText.length }];
    }

    // Step 4: Map segment offsets back to original text positions using posMap
    const mappedSegments = segments.map(seg => {
        let originalStartIndex = seg.startIndex;
        let originalEndIndex = seg.endIndex;

        if (posMap && posMap.length > 0) {
            // Map filtered text start position → original text position
            if (seg.startIndex < posMap.length) {
                originalStartIndex = posMap[seg.startIndex];
            }
            // Map filtered text end position → original text position
            // Use endIndex - 1 (last included char) then +1 for exclusive end
            if (seg.endIndex > 0 && seg.endIndex - 1 < posMap.length) {
                originalEndIndex = posMap[seg.endIndex - 1] + 1;
            } else if (posMap.length > 0) {
                originalEndIndex = posMap[posMap.length - 1] + 1;
            }
        }

        return {
            ...seg,
            text: preprocessSegment(seg.text, settings.multiSegmentEnabled),
            originalStartIndex,
            originalEndIndex,
        };
    });

    return { segments: mappedSegments, originalText };
}

// ============================================================================
// Classification API
// ============================================================================

/**
 * Classifies a single text string via the Local API
 * @param {string} text - Preprocessed text to classify
 * @returns {Promise<import('./constants.js').EmotionScore[]>} Array of emotion scores sorted by score descending
 */
async function classifySingleText(text) {
    if (!text) return [];

    try {
        const localResult = await fetch('/api/extra/classify', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ text }),
        });

        if (localResult.ok) {
            const data = await localResult.json();
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
 * Gets the full classification scores from the Local API.
 * For backward compatibility, this classifies the text as a single input
 * (using the full preprocessing pipeline on the entire text as one segment).
 * @param {string} text - The text to classify
 * @returns {Promise<import('./constants.js').EmotionScore[]>} Array of emotion scores sorted by score descending
 */
export async function getClassificationScores(text) {
    const settings = getSettings();
    
    if (!text) return [];

    if (settings.translate && typeof globalThis.translate === 'function') {
        text = await globalThis.translate(text, 'en');
    }

    // Use the new pipeline but only take the first segment's scores
    const { segments } = preprocessText(text);
    if (segments.length === 0) return [];

    return classifySingleText(segments[0].text);
}

/**
 * Classifies all segments of a message and returns full results.
 * This is the new multi-segment classification entry point.
 * @param {string} text - Raw message text
 * @returns {Promise<import('./constants.js').SegmentResult[]>}
 */
export async function classifyMessageSegments(text) {
    const settings = getSettings();

    if (!text) return [];

    if (settings.translate && typeof globalThis.translate === 'function') {
        text = await globalThis.translate(text, 'en');
    }

    const { segments, originalText } = preprocessText(text);
    if (segments.length === 0) return [];

    /** @type {import('./constants.js').SegmentResult[]} */
    const results = [];

    for (const segment of segments) {
        // Skip segments that are empty after filtering/sampling (e.g. pure OOC content)
        if (!segment.text || !segment.text.trim()) {
            continue;
        }

        const scores = await classifySingleText(segment.text);
        const expressionResult = selectExpression(scores);

        results.push({
            segment,
            scores,
            expression: expressionResult.expression,
            score: expressionResult.score,
            isCustom: expressionResult.isCustom,
            ruleId: expressionResult.ruleId,
            originalText,
        });
    }

    return results;
}

/**
 * Retrieves the expression label based on classification.
 * Updated for v0.4.0: performs multi-segment classification and returns
 * the last segment's expression (most recent emotional state).
 * Stores all segment results in state for carousel use.
 * @param {string} text - The text to classify
 * @param {string} [cardCharacterName] - Name of the card's main character (for scenario mode)
 * @returns {Promise<string|null>} - The expression label
 */
export async function getExpressionLabel(text, cardCharacterName) {
    const settings = getSettings();
    const context = getContext();

    // Scenario mode: try to detect multi-character message first
    // Skip in group chats — each character sends their own messages there
    // Skip on mobile or when waifuMode is off — sprites need the VN wrapper to display
    if (settings.scenarioEnabled && cardCharacterName && !context.groupId && !isMobile() && power_user.waifuMode) {
        const scenarioResult = await classifyScenarioMessage(text, cardCharacterName);
        if (scenarioResult) {
            return scenarioResult.expression;
        }
    }

    // Clear scenario state when not detected
    setLastScenarioDetected(false);
    clearCharacterSegmentResults();

    const segmentResults = await classifyMessageSegments(text);

    // Store segment results for carousel
    setLastSegmentResults(segmentResults);

    // Use the last segment's scores for the insight panel and analytics
    const lastResult = segmentResults[segmentResults.length - 1];
    const scores = lastResult?.scores || [];
    const expression = lastResult?.expression || null;

    setLastClassificationScores(scores);
    
    if (insightPanelVisible && updateInsightPanel) {
        updateInsightPanel(scores);
    }
    
    // Analytics: use the last segment's data
    if (lastResult) {
        analyzeAndStore(text, scores, lastResult.expression, lastResult.score).catch(err => {
            console.debug('Expressions+ Analytics: Background collection error', err);
        });
    }
    
    return expression;
}

// ============================================================================
// Scenario Classification
// ============================================================================

/**
 * Classifies a multi-character scenario message.
 * Detects character segments, classifies each independently, and stores
 * per-character results in state for carousel display.
 *
 * @param {string} text - Raw message text
 * @param {string} cardCharacterName - Name of the card's main character
 * @returns {Promise<{ expression: string }|null>} Result with the last character's expression, or null if not a scenario message
 */
async function classifyScenarioMessage(text, cardCharacterName) {
    const segments = detectScenarioSegments(text, cardCharacterName);
    if (segments.length === 0) return null;

    setLastScenarioDetected(true);
    clearCharacterSegmentResults();

    let lastExpression = null;
    let lastScores = [];
    let lastCharResults = null;

    for (const segment of segments) {
        const segmentResults = await classifyMessageSegments(segment.text);

        if (segmentResults.length > 0) {
            setCharacterSegmentResults(segment.characterName, segmentResults);

            const lastResult = segmentResults[segmentResults.length - 1];
            lastExpression = lastResult.expression;
            lastScores = lastResult.scores;
            lastCharResults = segmentResults;
        }
    }

    // Store the last character's segment results as the primary results
    setLastSegmentResults(lastCharResults || []);
    setLastClassificationScores(lastScores);

    if (insightPanelVisible && updateInsightPanel) {
        updateInsightPanel(lastScores);
    }

    if (!lastExpression) return null;

    return { expression: lastExpression };
}

// ============================================================================
// Preprocessing Inspector
// ============================================================================

/**
 * Runs the full preprocessing pipeline on a text and returns each stage's output.
 * Used by the "Inspect Classifier Input" feature in settings.
 * Does NOT call the classifier — purely shows how text is transformed.
 *
 * @param {string} rawText - The raw message text
 * @returns {{ rawText: string, postMacro: string, postFilters: string, filterSteps: { filterName: string, filterId: string, filterPattern: string, filterFlags: string, filterReplacement: string, textBefore: string, textAfter: string, charsRemoved: number }[], segments: { index: number, rawText: string, preprocessed: string, originalStart: number, originalEnd: number }[] }}
 */
export function inspectPreprocessing(rawText) {
    if (!rawText) {
        return {
            rawText: '',
            postMacro: '',
            postFilters: '',
            filterSteps: [],
            segments: [],
        };
    }

    // Step 1: Macro expansion
    const postMacro = substituteParams(rawText);

    // Step 2: Filters with offset tracking AND per-filter steps
    const { filteredText, posMap, steps: filterSteps } = applyAllFiltersWithSteps(postMacro);

    // Step 3: Segmentation
    const settings = getSettings();
    let rawSegments;
    if (settings.multiSegmentEnabled) {
        rawSegments = segmentText(filteredText);
    } else {
        rawSegments = [{ text: filteredText, startIndex: 0, endIndex: filteredText.length }];
    }

    // Step 4: Per-segment preprocessing + offset mapping
    const segments = rawSegments.map((seg, idx) => {
        let originalStart = seg.startIndex;
        let originalEnd = seg.endIndex;

        if (posMap && posMap.length > 0) {
            if (seg.startIndex < posMap.length) {
                originalStart = posMap[seg.startIndex];
            }
            if (seg.endIndex > 0 && seg.endIndex - 1 < posMap.length) {
                originalEnd = posMap[seg.endIndex - 1] + 1;
            } else if (posMap.length > 0) {
                originalEnd = posMap[posMap.length - 1] + 1;
            }
        }

        return {
            index: idx,
            rawText: seg.text,
            preprocessed: preprocessSegment(seg.text, settings.multiSegmentEnabled),
            originalStart,
            originalEnd,
        };
    });

    return {
        rawText,
        postMacro,
        postFilters: filteredText,
        filterSteps,
        segments,
    };
}
