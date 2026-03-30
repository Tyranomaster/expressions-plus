/**
 * Text Segmentation for Expressions+
 *
 * Splits long messages into classifiable segments using configurable strategies
 * (paragraph, sentence, hybrid). Each segment is independently classified.
 */

import { SPLIT_STRATEGY, DEFAULT_SAMPLE_SIZE } from './constants.js';
import { getSettings } from './settings.js';

// ============================================================================
// Sentence Detection
// ============================================================================

/**
 * Splits text into sentence-level units.
 * Handles common sentence endings (.!?) while preserving abbreviations,
 * dialogue quotes, and RP-style asterisk text.
 *
 * Uses a splitting approach (not matching) to guarantee no text is silently
 * dropped — even when sentence-ending punctuation is followed by closing
 * marks like quotes, asterisks, or brackets.
 * @param {string} text
 * @returns {string[]}
 */
function splitIntoSentences(text) {
    if (!text) return [];

    // Split on newlines first, then split each line at sentence boundaries.
    // Using split (not match) guarantees every character of the input text
    // ends up in exactly one output sentence — no silent drops.
    const lines = text.split(/\n/);
    const sentences = [];

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // Split at sentence boundaries: after .!?… and optional closing marks
        // ("'*)]]), where followed by whitespace. The lookbehind keeps the
        // punctuation attached to the preceding sentence.
        // Includes Unicode ellipsis (U+2026) alongside ASCII punctuation.
        const parts = trimmed.split(/(?<=[.!?\u2026]['")*\]]*)(\s+)/);

        // split with a capture group produces [text, separator, text, separator, ...]
        // We only want the text parts (even indices)
        for (let i = 0; i < parts.length; i += 2) {
            const t = parts[i].trim();
            if (t) sentences.push(t);
        }
    }

    if (sentences.length === 0) {
        return [text.trim()].filter(Boolean);
    }

    return sentences;
}

// ============================================================================
// Paragraph Detection
// ============================================================================

/**
 * Splits text into paragraphs on double newlines.
 * Single newlines are preserved within paragraphs.
 * @param {string} text
 * @returns {string[]}
 */
function splitIntoParagraphs(text) {
    if (!text) return [];
    return text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
}

// ============================================================================
// Grouping Logic
// ============================================================================

/**
 * Groups items (sentences or paragraphs) into roughly equal-sized chunks.
 *
 * Instead of greedily filling each segment to the maximum, the total text
 * length is divided by `sampleSize` to determine how many segments are needed,
 * then a target size per segment is derived so that content is distributed
 * evenly. A post-packing merge phase ensures that when item boundaries prevent
 * the target from being hit exactly, adjacent groups are merged (up to
 * `sampleSize`) to reach the desired segment count.
 *
 * Oversized single items (longer than sampleSize) are forcibly split at the limit
 * boundary to ensure continuous text coverage with no gaps.
 *
 * @param {string[]} items - Text items to group
 * @param {number} sampleSize - Maximum characters per group
 * @param {string} [separator='\n\n'] - Join separator (use ' ' for sentences within a paragraph)
 * @returns {string[]} Grouped text segments
 */
function groupItemsToFit(items, sampleSize, separator = '\n\n') {
    if (items.length === 0) return [];
    if (items.length === 1) {
        // If the single item exceeds the limit, forcibly chunk it
        if (items[0].length > sampleSize) {
            return forciblySplitText(items[0], sampleSize);
        }
        return items;
    }

    const sepLen = separator.length;

    // Compute total text length (including separators between items)
    const totalLength = items.reduce((sum, item) => sum + item.length, 0)
        + sepLen * (items.length - 1);

    // Determine how many segments are needed, then derive a target size per
    // segment so that content is distributed roughly equally.
    const numSegments = Math.ceil(totalLength / sampleSize);
    const targetSize = Math.ceil(totalLength / numSegments);

    // Phase 1: Greedy forward pack using targetSize as a soft threshold.
    const groupedItems = []; // array of item-arrays
    let currentGroup = [];
    let currentLen = 0;

    for (const item of items) {
        // Handle oversized individual items: split them and flush
        if (item.length > sampleSize) {
            // Flush current group first
            if (currentGroup.length > 0) {
                groupedItems.push(currentGroup);
                currentGroup = [];
                currentLen = 0;
            }
            // Split the oversized item into forced chunks
            const chunks = forciblySplitText(item, sampleSize);
            for (const chunk of chunks) {
                groupedItems.push([chunk]);
            }
            continue;
        }

        if (currentGroup.length === 0) {
            currentGroup = [item];
            currentLen = item.length;
        } else if (currentLen + sepLen + item.length <= targetSize) {
            currentGroup.push(item);
            currentLen += sepLen + item.length;
        } else {
            groupedItems.push(currentGroup);
            currentGroup = [item];
            currentLen = item.length;
        }
    }

    if (currentGroup.length > 0) {
        groupedItems.push(currentGroup);
    }

    // Phase 2: If packing produced more groups than needed (because item
    // boundaries prevented hitting targetSize exactly), merge the smallest
    // adjacent pair that still fits within sampleSize. Repeat until we reach
    // the desired segment count or no valid merge remains.
    while (groupedItems.length > numSegments) {
        let bestIdx = -1;
        let bestLen = Infinity;

        for (let i = 0; i < groupedItems.length - 1; i++) {
            const combinedItems = groupedItems[i].length + groupedItems[i + 1].length;
            const mergedLen = groupedItems[i].reduce((s, x) => s + x.length, 0)
                + groupedItems[i + 1].reduce((s, x) => s + x.length, 0)
                + sepLen * (combinedItems - 1);
            if (mergedLen <= sampleSize && mergedLen < bestLen) {
                bestIdx = i;
                bestLen = mergedLen;
            }
        }

        if (bestIdx < 0) break; // no valid merge without exceeding sampleSize

        groupedItems[bestIdx] = [...groupedItems[bestIdx], ...groupedItems[bestIdx + 1]];
        groupedItems.splice(bestIdx + 1, 1);
    }

    return groupedItems.map(group => group.join(separator));
}

/**
 * Forcibly splits text that exceeds the sample size into chunks.
 * Tries to break at the last sentence boundary before the limit;
 * falls back to a hard character split as a last resort for run-on text.
 *
 * @param {string} text - Text that exceeds sampleSize
 * @param {number} sampleSize - Maximum characters per chunk
 * @returns {string[]} Array of chunks, each ≤ sampleSize
 */
function forciblySplitText(text, sampleSize) {
    const chunks = [];
    let remaining = text;

    while (remaining.length > sampleSize) {
        // Try to find a sentence boundary within the limit window
        const window = remaining.substring(0, sampleSize);
        const sentenceEndIdx = findLastSentenceEnd(window);

        let splitAt;
        if (sentenceEndIdx > 0 && sentenceEndIdx >= sampleSize * 0.3) {
            // Found a reasonable sentence boundary — split there
            splitAt = sentenceEndIdx;
        } else {
            // No good sentence boundary — hard split at the limit
            // Try to at least break at a word boundary
            const lastSpace = window.lastIndexOf(' ');
            splitAt = (lastSpace > sampleSize * 0.3) ? lastSpace : sampleSize;
        }

        chunks.push(remaining.substring(0, splitAt).trim());
        remaining = remaining.substring(splitAt).trim();
    }

    if (remaining) {
        chunks.push(remaining);
    }

    return chunks.filter(Boolean);
}

/**
 * Finds the last sentence-ending position within a text string.
 * Looks for .!? followed by a space or end of string.
 * @param {string} text
 * @returns {number} Index just past the last sentence-ending punctuation, or -1 if none found
 */
function findLastSentenceEnd(text) {
    let lastEnd = -1;
    // Match sentence endings: .!?… optionally followed by closing quotes/parens/asterisks, then whitespace or EOL
    // Includes Unicode ellipsis (U+2026) alongside ASCII punctuation.
    const re = /[.!?\u2026]['")*\]]*(?:\s|$)/g;
    let match;
    while ((match = re.exec(text)) !== null) {
        // Position right after the punctuation + any closing marks, before the whitespace
        const endPos = match.index + match[0].trimEnd().length;
        lastEnd = endPos;
    }
    return lastEnd;
}

// ============================================================================
// Strategy Implementations
// ============================================================================

/**
 * Paragraph strategy — split on double newlines, group to fit.
 * @param {string} text
 * @param {number} sampleSize
 * @returns {string[]}
 */
function splitParagraph(text, sampleSize) {
    const paragraphs = splitIntoParagraphs(text);
    return groupItemsToFit(paragraphs, sampleSize);
}

/**
 * Sentence strategy — split into sentences, group to fit.
 * Sentences are joined with a single space (not paragraph breaks)
 * since they originate from continuous text.
 * @param {string} text
 * @param {number} sampleSize
 * @returns {string[]}
 */
function splitSentence(text, sampleSize) {
    const sentences = splitIntoSentences(text);
    return groupItemsToFit(sentences, sampleSize, ' ');
}

/**
 * Hybrid strategy (default) — paragraph split first, then sub-split
 * oversized paragraphs by sentence.
 * @param {string} text
 * @param {number} sampleSize
 * @returns {string[]}
 */
function splitHybrid(text, sampleSize) {
    const paragraphs = splitIntoParagraphs(text);
    const expandedItems = [];
    /** @type {string[]} Track which items are sentence-level (joined with space vs \n\n) */
    const itemOrigins = []; // 'paragraph' or 'sentence'

    for (const para of paragraphs) {
        if (para.length <= sampleSize) {
            expandedItems.push(para);
            itemOrigins.push('paragraph');
        } else {
            // This paragraph is oversized — sub-split by sentence
            const sentences = splitIntoSentences(para);
            for (const sent of sentences) {
                expandedItems.push(sent);
                itemOrigins.push('sentence');
            }
        }
    }

    // Group using space separator since oversized paragraphs were exploded into sentences.
    // The paragraph boundaries are preserved by the fact that paragraph-level items
    // are already ≤ sampleSize and will form their own groups.
    return groupItemsToFit(expandedItems, sampleSize, ' ');
}

// ============================================================================
// Whitespace-Normalized Position Tracking
// ============================================================================

/**
 * Collapses all whitespace (spaces, newlines, tabs) to single spaces and
 * returns a position map so that indices in the normalized string can be
 * mapped back to the original string.
 * @param {string} text
 * @returns {{ normalized: string, posMap: number[] }}
 */
function collapseWhitespaceWithMap(text) {
    let normalized = '';
    /** @type {number[]} */
    const posMap = [];
    let prevWasSpace = true; // start true to trim leading whitespace
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (/\s/.test(ch)) {
            if (!prevWasSpace) {
                posMap.push(i);
                normalized += ' ';
                prevWasSpace = true;
            }
        } else {
            prevWasSpace = false;
            posMap.push(i);
            normalized += ch;
        }
    }
    // Trim trailing space
    if (normalized.endsWith(' ')) {
        normalized = normalized.slice(0, -1);
        posMap.pop();
    }
    return { normalized, posMap };
}

/**
 * Collapses all whitespace to single spaces (without position tracking).
 * @param {string} text
 * @returns {string}
 */
function collapseWhitespace(text) {
    return text.replace(/\s+/g, ' ').trim();
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Segments text into classifiable chunks using the configured strategy.
 *
 * Returns an array of `TextSegment` objects with the text content and character
 * offsets into the *filtered* text (not the raw original).
 *
 * If the text fits within the sample limit, returns a single segment (no split).
 *
 * @param {string} text - Pre-filtered text to segment
 * @returns {import('./constants.js').TextSegment[]}
 */
export function segmentText(text) {
    if (!text) return [];

    const settings = getSettings();
    const sampleSize = settings.sampleSize || DEFAULT_SAMPLE_SIZE;
    const strategy = settings.splitStrategy || SPLIT_STRATEGY.HYBRID;

    // Short-circuit: text fits in one segment
    if (text.length <= sampleSize) {
        return [{
            text: text,
            startIndex: 0,
            endIndex: text.length,
        }];
    }

    let segments;
    switch (strategy) {
        case SPLIT_STRATEGY.PARAGRAPH:
            segments = splitParagraph(text, sampleSize);
            break;
        case SPLIT_STRATEGY.SENTENCE:
            segments = splitSentence(text, sampleSize);
            break;
        case SPLIT_STRATEGY.HYBRID:
        default:
            segments = splitHybrid(text, sampleSize);
            break;
    }

    // If splitting produced nothing meaningful, return the whole text as one segment
    if (segments.length === 0) {
        return [{
            text: text,
            startIndex: 0,
            endIndex: text.length,
        }];
    }

    // Build TextSegment objects with offset tracking.
    // Use whitespace-normalized matching to handle separator differences
    // between joined segment text and the source text. groupItemsToFit()
    // joins items with ' ' or '\n\n', which may differ from the actual
    // whitespace in the source (e.g., '\n' vs ' ' across paragraph breaks).
    // Normalizing both sides to single spaces makes the search robust.
    const { normalized: normSource, posMap: sourcePosMap } = collapseWhitespaceWithMap(text);
    const result = [];
    let normSearchFrom = 0;

    for (const segText of segments) {
        if (!segText) continue;

        const normSeg = collapseWhitespace(segText);
        if (!normSeg) continue;

        const normIdx = normSource.indexOf(normSeg, normSearchFrom);

        let startIndex, endIndex;

        if (normIdx >= 0) {
            startIndex = sourcePosMap[normIdx];
            const lastNormIdx = normIdx + normSeg.length - 1;
            endIndex = lastNormIdx < sourcePosMap.length
                ? sourcePosMap[lastNormIdx] + 1
                : text.length;
            normSearchFrom = normIdx + normSeg.length;
        } else {
            startIndex = result.length > 0 ? result[result.length - 1].endIndex : 0;
            endIndex = Math.min(startIndex + segText.length, text.length);
        }

        result.push({
            text: segText,
            startIndex,
            endIndex,
        });
    }

    return result;
}

/**
 * Samples a single segment if it exceeds the sample size.
 * When multi-segment is enabled, segmentText() already guarantees segments
 * are within the limit, so this is only needed as a legacy fallback for
 * single-segment mode where the full message is treated as one chunk.
 *
 * @param {string} text - Segment text
 * @param {number} sampleSize - Max characters
 * @param {Function} trimToEndSentence - SillyTavern utility
 * @param {Function} trimToStartSentence - SillyTavern utility
 * @returns {string}
 */
export function sampleSegment(text, sampleSize, trimToEndSentence, trimToStartSentence) {
    if (!text || text.length <= sampleSize) {
        return text;
    }
    const halfSize = Math.floor(sampleSize / 2);
    const head = trimToEndSentence ? trimToEndSentence(text.slice(0, halfSize)) : text.slice(0, halfSize);
    const tail = trimToStartSentence ? trimToStartSentence(text.slice(-halfSize)) : text.slice(-halfSize);

    return (head + ' ' + tail).trim();
}
