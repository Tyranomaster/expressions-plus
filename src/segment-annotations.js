/**
 * Segment Annotations for Expressions+
 *
 * Highlights text segments in chat message bubbles to visually indicate
 * which portion of the message corresponds to each carousel segment.
 * Uses original text offsets (mapped back through the filter pipeline)
 * to inject colored highlight spans into the last chat message DOM.
 *
 * v0.4.0: Per-character scoping for VN mode group chats.
 *         Settings-driven highlight colors and opacity.
 */

import { getSettings } from './settings.js';

// ============================================================================
// Constants
// ============================================================================

/** Default hex colors for highlight palette (6 slots, cycled) */
const DEFAULT_HIGHLIGHT_COLORS = [
    '#3B82F6',   // blue
    '#A855F7',   // purple
    '#22C55E',   // green
    '#F97316',   // orange
    '#EC4899',   // pink
    '#EAB308',   // yellow
];

const DEFAULT_OPACITY_INACTIVE = 0.20;
const DEFAULT_OPACITY_ACTIVE = 0.40;

const ANNOTATION_CLASS = 'segment-annotation-highlight';
const ANNOTATION_ATTR = 'data-segment-index';
const CHARACTER_ATTR = 'data-ep-character';

// ============================================================================
// Color Helpers
// ============================================================================

/**
 * Converts a hex color string to an rgba() string at the given opacity.
 * @param {string} hex - e.g. '#3B82F6'
 * @param {number} opacity - 0-1
 * @returns {string}
 */
function hexToRgba(hex, opacity) {
    const cleaned = hex.replace('#', '');
    const r = parseInt(cleaned.substring(0, 2), 16);
    const g = parseInt(cleaned.substring(2, 4), 16);
    const b = parseInt(cleaned.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

/**
 * Gets the highlight color for a segment index.
 * Reads from user settings with defaults as fallback.
 * @param {number} segmentIndex
 * @param {boolean} isActive
 * @returns {string} rgba() color string
 */
export function getHighlightColor(segmentIndex, isActive) {
    const settings = getSettings();
    const colors = settings.highlightColors ?? DEFAULT_HIGHLIGHT_COLORS;
    const opacityInactive = settings.highlightOpacityInactive ?? DEFAULT_OPACITY_INACTIVE;
    const opacityActive = settings.highlightOpacityActive ?? DEFAULT_OPACITY_ACTIVE;
    const colorIdx = segmentIndex % colors.length;
    const hex = colors[colorIdx] || DEFAULT_HIGHLIGHT_COLORS[colorIdx % DEFAULT_HIGHLIGHT_COLORS.length];
    return hexToRgba(hex, isActive ? opacityActive : opacityInactive);
}

// ============================================================================
// DOM Helpers
// ============================================================================

/**
 * Finds the last character message element in the chat.
 * @returns {HTMLElement|null}
 */
function getLastCharacterMessageElement() {
    const messages = document.querySelectorAll('.mes[is_user="false"]');
    if (messages.length === 0) return null;
    return /** @type {HTMLElement} */ (messages[messages.length - 1]);
}

/**
 * Finds the last message element for a specific character in the chat.
 * Used in VN mode group chats to target per-character annotations.
 * @param {string} characterName - The character's display name (matches ch_name attribute)
 * @returns {HTMLElement|null}
 */
export function getLastMessageForCharacter(characterName) {
    if (!characterName) return getLastCharacterMessageElement();
    const messages = document.querySelectorAll('.mes[is_user="false"]');
    for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        const nameEl = msg.querySelector('.ch_name .name_text');
        if (nameEl && nameEl.textContent?.trim() === characterName) {
            return /** @type {HTMLElement} */ (msg);
        }
    }
    return null;
}

/**
 * Gets the text content container within a message element.
 * @param {HTMLElement} messageEl
 * @returns {HTMLElement|null}
 */
function getMessageTextElement(messageEl) {
    return /** @type {HTMLElement|null} */ (messageEl.querySelector('.mes_text'));
}

// ============================================================================
// Text Node Walker
// ============================================================================

/**
 * Collects all text nodes under an element in document order,
 * building a flat string and tracking each node's offset range.
 * @param {HTMLElement} container
 * @returns {{ text: string, nodes: { node: Text, start: number, end: number }[] }}
 */
function collectTextNodes(container) {
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
    const nodes = [];
    let text = '';
    let node;

    while ((node = walker.nextNode())) {
        const textNode = /** @type {Text} */ (node);
        const nodeText = textNode.textContent || '';
        nodes.push({
            node: textNode,
            start: text.length,
            end: text.length + nodeText.length,
        });
        text += nodeText;
    }

    return { text, nodes };
}

// ============================================================================
// Annotation Logic
// ============================================================================

/**
 * Wraps a range of characters across potentially multiple text nodes
 * with highlight span elements.
 * @param {{ node: Text, start: number, end: number }[]} textNodes
 * @param {number} rangeStart - Start index in the concatenated text
 * @param {number} rangeEnd - End index (exclusive) in the concatenated text
 * @param {number} segmentIndex - The segment index for coloring
 * @param {boolean} isActive - Whether this segment is currently selected
 * @param {string} [characterKey] - Character key for per-character scoping
 */
function wrapRange(textNodes, rangeStart, rangeEnd, segmentIndex, isActive, characterKey) {
    for (const { node, start, end } of textNodes) {
        if (end <= rangeStart || start >= rangeEnd) continue;

        const overlapStart = Math.max(rangeStart - start, 0);
        const overlapEnd = Math.min(rangeEnd - start, node.textContent.length);

        if (overlapStart >= overlapEnd) continue;

        const beforeText = node.textContent.substring(0, overlapStart);
        const highlightText = node.textContent.substring(overlapStart, overlapEnd);
        const afterText = node.textContent.substring(overlapEnd);

        const parent = node.parentNode;
        if (!parent) continue;

        const span = document.createElement('span');
        span.className = ANNOTATION_CLASS;
        span.setAttribute(ANNOTATION_ATTR, String(segmentIndex));
        if (characterKey) {
            span.setAttribute(CHARACTER_ATTR, characterKey);
        }
        span.textContent = highlightText;

        span.style.backgroundColor = getHighlightColor(segmentIndex, isActive);
        span.style.borderRadius = '2px';
        span.style.transition = 'background-color 0.2s ease';

        if (beforeText) {
            parent.insertBefore(document.createTextNode(beforeText), node);
        }
        parent.insertBefore(span, node);
        if (afterText) {
            parent.insertBefore(document.createTextNode(afterText), node);
        }
        parent.removeChild(node);
    }
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Clears segment highlight annotations.
 * When characterKey is provided, only clears annotations belonging to that character.
 * When messageEl is provided, scopes to that element. Otherwise clears globally.
 * @param {HTMLElement} [messageEl]
 * @param {string} [characterKey] - If provided, only clear this character's annotations
 */
export function clearAnnotations(messageEl, characterKey) {
    const container = messageEl || document;
    const selector = characterKey
        ? `.${ANNOTATION_CLASS}[${CHARACTER_ATTR}="${CSS.escape(characterKey)}"]`
        : `.${ANNOTATION_CLASS}`;
    const spans = container.querySelectorAll(selector);

    spans.forEach(span => {
        const parent = span.parentNode;
        if (!parent) return;

        const textNode = document.createTextNode(span.textContent || '');
        parent.replaceChild(textNode, span);

        parent.normalize();
    });
}

/**
 * Regex matching markdown formatting markers that the renderer consumes.
 * These characters appear in the raw source but NOT in the rendered DOM text.
 * Note: quotation marks `"` are NOT consumed by markdown and must stay.
 */
const MARKDOWN_CONSUMED_RE = /\*+|_+|~~/g;

/**
 * Normalizes text for fuzzy DOM matching and returns a position map so that
 * match indices in the normalized string can be mapped back to the original.
 * Strips markdown formatting markers, normalizes typographic characters
 * (smart quotes → straight, Unicode ellipsis → three ASCII dots), and
 * collapses whitespace/newlines.
 * @param {string} text
 * @returns {{ normalized: string, posMap: number[] }}
 */
function normalizeWithMap(text) {
    let stripped = '';
    /** @type {number[]} maps each char in `stripped` → original index in `text` */
    let map1 = [];
    {
        let last = 0;
        MARKDOWN_CONSUMED_RE.lastIndex = 0;
        let m;
        while ((m = MARKDOWN_CONSUMED_RE.exec(text)) !== null) {
            for (let i = last; i < m.index; i++) {
                map1.push(i);
                stripped += text[i];
            }
            last = m.index + m[0].length;
        }
        for (let i = last; i < text.length; i++) {
            map1.push(i);
            stripped += text[i];
        }
    }

    {
        let typoNorm = '';
        const typoMap = [];
        for (let i = 0; i < stripped.length; i++) {
            const ch = stripped[i];
            if (ch === '\u201C' || ch === '\u201D') {
                typoMap.push(map1[i]);
                typoNorm += '"';
            } else if (ch === '\u2018' || ch === '\u2019') {
                typoMap.push(map1[i]);
                typoNorm += "'";
            } else if (ch === '\u2026') {
                typoMap.push(map1[i]);
                typoNorm += '.';
                typoMap.push(map1[i]);
                typoNorm += '.';
                typoMap.push(map1[i]);
                typoNorm += '.';
            } else {
                typoMap.push(map1[i]);
                typoNorm += ch;
            }
        }
        stripped = typoNorm;
        map1 = typoMap;
    }

    let normalized = '';
    /** @type {number[]} maps each char in `normalized` → original index in `text` */
    const posMap = [];
    let prevWasSpace = true; 
    for (let i = 0; i < stripped.length; i++) {
        const ch = stripped[i];
        if (/\s/.test(ch)) {
            if (!prevWasSpace) {
                posMap.push(map1[i]);
                normalized += ' ';
                prevWasSpace = true;
            }
            continue;
        }
        prevWasSpace = false;
        posMap.push(map1[i]);
        normalized += ch;
    }
    if (normalized.endsWith(' ')) {
        normalized = normalized.slice(0, -1);
        posMap.pop();
    }

    return { normalized, posMap };
}

/**
 * Shorthand normalization (without position map) for needle text.
 * @param {string} text
 * @returns {string}
 */
function normalizeForMatch(text) {
    return normalizeWithMap(text).normalized;
}

/**
 * Aggressively normalizes text to only alphanumeric characters and spaces,
 * with a position map back to the original indices.
 * @param {string} text
 * @returns {{ normalized: string, posMap: number[] }}
 */
function aggressiveNormalizeWithMap(text) {
    let normalized = '';
    /** @type {number[]} */
    const posMap = [];
    let prevWasSpace = true;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (/[a-zA-Z0-9]/.test(ch)) {
            prevWasSpace = false;
            posMap.push(i);
            normalized += ch.toLowerCase();
        } else if (!prevWasSpace) {
            prevWasSpace = true;
            posMap.push(i);
            normalized += ' ';
        }
    }
    if (normalized.endsWith(' ')) {
        normalized = normalized.slice(0, -1);
        posMap.pop();
    }
    return { normalized, posMap };
}

/**
 * Helper: resolves a normalized-space match range back to original haystack coords.
 * @param {number[]} hsPosMap
 * @param {number} idx - start in normalized space
 * @param {number} matchLen - length in normalized space
 * @param {number} haystackLen - total length of original haystack
 * @returns {{ start: number, end: number }}
 */
function resolveMatchRange(hsPosMap, idx, matchLen, haystackLen) {
    const realStart = hsPosMap[idx];
    const lastIdx = idx + matchLen - 1;
    const realEnd = lastIdx < hsPosMap.length ? hsPosMap[lastIdx] + 1 : haystackLen;
    return { start: realStart, end: realEnd };
}

/**
 * Finds a needle in a haystack using fuzzy normalized matching.
 * Both needle and haystack are normalized identically (strip markdown markers,
 * collapse whitespace) and the match is mapped back to real haystack positions.
 * Falls back to aggressive alphanumeric-only matching when needed.
 * @param {string} haystack - Concatenated DOM text
 * @param {string} needle - The original text to find (pre-normalization)
 * @param {number} fromIndex - Minimum start position in **original** haystack
 * @returns {{ start: number, end: number }|null} Positions in original haystack
 */
function findInDomText(haystack, needle, fromIndex) {
    const normNeedle = normalizeForMatch(needle);
    if (!normNeedle) return null;

    const { normalized: normHaystack, posMap: hsPosMap } = normalizeWithMap(haystack);

    let normFrom = 0;
    for (let i = 0; i < hsPosMap.length; i++) {
        if (hsPosMap[i] >= fromIndex) { normFrom = i; break; }
        normFrom = i + 1;
    }

    const idx = normHaystack.indexOf(normNeedle, normFrom);
    if (idx >= 0) {
        return resolveMatchRange(hsPosMap, idx, normNeedle.length, haystack.length);
    }

    if (normNeedle.length > 50) {
        const leadAnchor = normNeedle.substring(0, 50);
        const leadIdx = normHaystack.indexOf(leadAnchor, normFrom);
        if (leadIdx >= 0) {
            const tailAnchor = normNeedle.substring(normNeedle.length - 30);
            const tailIdx = normHaystack.indexOf(tailAnchor, leadIdx + leadAnchor.length - 5);
            if (tailIdx >= 0) {
                return resolveMatchRange(hsPosMap, leadIdx, tailIdx + tailAnchor.length - leadIdx, haystack.length);
            }
            return resolveMatchRange(hsPosMap, leadIdx, normNeedle.length, haystack.length);
        }
    }

    const { normalized: aggNeedle } = aggressiveNormalizeWithMap(needle);
    const { normalized: aggHaystack, posMap: aggHsPosMap } = aggressiveNormalizeWithMap(haystack);
    if (!aggNeedle) return null;

    let aggFrom = 0;
    for (let i = 0; i < aggHsPosMap.length; i++) {
        if (aggHsPosMap[i] >= fromIndex) { aggFrom = i; break; }
        aggFrom = i + 1;
    }

    const aggIdx = aggHaystack.indexOf(aggNeedle, aggFrom);
    if (aggIdx >= 0) {
        return resolveMatchRange(aggHsPosMap, aggIdx, aggNeedle.length, haystack.length);
    }

    if (aggNeedle.length > 40) {
        const aggLead = aggNeedle.substring(0, 40);
        const aggLeadIdx = aggHaystack.indexOf(aggLead, aggFrom);
        if (aggLeadIdx >= 0) {
            const aggTail = aggNeedle.substring(aggNeedle.length - 25);
            const aggTailIdx = aggHaystack.indexOf(aggTail, aggLeadIdx + aggLead.length - 5);
            if (aggTailIdx >= 0) {
                return resolveMatchRange(aggHsPosMap, aggLeadIdx, aggTailIdx + aggTail.length - aggLeadIdx, haystack.length);
            }
            return resolveMatchRange(aggHsPosMap, aggLeadIdx, aggNeedle.length, haystack.length);
        }
    }

    return null;
}

/**
 * Annotates the last chat message with segment highlights.
 * Each segment's text range is highlighted with a color, and the active
 * segment gets a brighter highlight.
 *
 * Processes segments in FORWARD order with a running cursor to prevent
 * overlap and ensure correct sequential matching.
 *
 * @param {import('./constants.js').SegmentResult[]} segmentResults - The segment classification results
 * @param {number} activeIndex - The currently active segment index
 * @param {HTMLElement} [targetMessageEl] - Optional specific message element to annotate
 * @param {string} [characterKey] - Character key for per-character scoping in VN group chats
 */
export function annotateSegments(segmentResults, activeIndex, targetMessageEl, characterKey) {
    if (!segmentResults || segmentResults.length <= 1) return;

    const messageEl = targetMessageEl || getLastCharacterMessageElement();
    if (!messageEl) return;

    const textContainer = getMessageTextElement(messageEl);
    if (!textContainer) return;

    clearAnnotations(textContainer, characterKey);

    const originalText = segmentResults[0]?.originalText;
    if (!originalText) return;

    const { text: domText } = collectTextNodes(textContainer);

    /** @type {{ domStart: number, domEnd: number, segIndex: number }[]} */
    const ranges = [];
    let searchFrom = 0;

    for (let i = 0; i < segmentResults.length; i++) {
        const result = segmentResults[i];
        const seg = result.segment;

        if (seg.originalStartIndex == null || seg.originalEndIndex == null) continue;

        const segOriginalText = originalText.substring(seg.originalStartIndex, seg.originalEndIndex);
        if (!segOriginalText.trim()) continue;

        const match = findInDomText(domText, segOriginalText, searchFrom);
        if (!match) continue;

        const domStart = Math.max(match.start, searchFrom);
        const domEnd = match.end;

        if (domStart >= domEnd) continue;

        ranges.push({ domStart, domEnd, segIndex: i });

        searchFrom = domEnd;
    }

    for (let r = ranges.length - 1; r >= 0; r--) {
        const { domStart, domEnd, segIndex } = ranges[r];
        const freshNodes = collectTextNodes(textContainer);
        wrapRange(freshNodes.nodes, domStart, domEnd, segIndex, segIndex === activeIndex, characterKey);
    }
}

/**
 * Updates only the active/inactive visual state of existing annotations
 * without rebuilding them. More efficient for carousel navigation.
 * When characterKey is provided, only updates that character's annotations.
 * @param {number} activeIndex - The newly active segment index
 * @param {string} [characterKey] - Character key to scope updates to
 */
export function updateAnnotationActiveState(activeIndex, characterKey) {
    const selector = characterKey
        ? `.${ANNOTATION_CLASS}[${CHARACTER_ATTR}="${CSS.escape(characterKey)}"]`
        : `.${ANNOTATION_CLASS}`;
    const spans = document.querySelectorAll(selector);
    spans.forEach(span => {
        const idx = parseInt(span.getAttribute(ANNOTATION_ATTR) || '-1', 10);
        const isActive = idx === activeIndex;
        /** @type {HTMLElement} */ (span).style.backgroundColor =
            getHighlightColor(idx, isActive);
    });
}
