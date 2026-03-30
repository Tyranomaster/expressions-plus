/**
 * Segment Carousel Panel for Expressions+
 *
 * Provides a standalone, draggable floating panel that shows carousel controls
 * for multi-segment classification results. For group chats, displays one row
 * per character with name labels linking to their last chat message.
 *
 * v0.4.1: Refactored from in-holder strip to standalone panel.
 */

import { annotateSegments, updateAnnotationActiveState, clearAnnotations, getLastMessageForCharacter } from './segment-annotations.js';

// ============================================================================
// State
// ============================================================================

/** @type {Map<string, { results: import('./constants.js').SegmentResult[], activeIndex: number, displayName: string, spriteFolderName: string|null }>} */
const carouselState = new Map();

/**
 * Per-character coalescing sprite transition queue.
 * When rapid clicks arrive, only the latest expression is kept; intermediate
 * states are skipped. This prevents mismatches when animations overlap.
 * @type {Map<string, { pending: { spriteFolderName: string, expression: string } | null, processing: boolean }>}
 */
const spriteQueue = new Map();

let sendExpressionCallFn = null;
let getSpriteFolderNameFn = null;
let updateInsightPanelFn = null;
let setLastClassificationScoresFn = null;

/**
 * Sets the sendExpressionCall function reference
 * @param {Function} fn
 */
export function setSendExpressionCallFn(fn) {
    sendExpressionCallFn = fn;
}

/**
 * Sets the getSpriteFolderName function reference
 * @param {Function} fn
 */
export function setGetSpriteFolderNameFn(fn) {
    getSpriteFolderNameFn = fn;
}

/**
 * Sets the updateInsightPanel function reference
 * @param {Function} fn
 */
export function setCarouselUpdateInsightPanelFn(fn) {
    updateInsightPanelFn = fn;
}

/**
 * Sets the setLastClassificationScores function reference
 * @param {Function} fn
 */
export function setCarouselSetLastClassificationScoresFn(fn) {
    setLastClassificationScoresFn = fn;
}

// ============================================================================
// Panel Visibility
// ============================================================================

/**
 * Shows the carousel panel if there are multi-segment results.
 */
function showPanel() {
    const panel = document.getElementById('expressions_plus_carousel_panel');
    if (panel) panel.style.display = '';
}

/**
 * Hides the carousel panel.
 */
function hidePanel() {
    const panel = document.getElementById('expressions_plus_carousel_panel');
    if (panel) panel.style.display = 'none';
}

/**
 * Returns true if any character has multi-segment results.
 * @returns {boolean}
 */
function hasMultiSegmentResults() {
    for (const [, state] of carouselState) {
        if (state.results.length > 1) return true;
    }
    return false;
}

// ============================================================================
// Panel Rendering
// ============================================================================

/**
 * Fully re-renders the carousel panel body based on current state.
 */
function renderPanel() {
    const body = document.getElementById('expressions_plus_carousel_body');
    if (!body) return;

    body.innerHTML = '';

    if (!hasMultiSegmentResults()) {
        body.innerHTML = '<div class="carousel_panel_empty"><small>No multi-segment results.</small></div>';
        hidePanel();
        return;
    }

    showPanel();

    for (const [characterKey, state] of carouselState) {
        if (state.results.length <= 1) continue;
        const row = createCharacterRow(characterKey, state);
        body.appendChild(row);
    }
}

/**
 * Creates a character row element for the carousel panel.
 * @param {string} characterKey
 * @param {{ results: import('./constants.js').SegmentResult[], activeIndex: number, displayName: string }} state
 * @returns {HTMLElement}
 */
function createCharacterRow(characterKey, state) {
    const row = document.createElement('div');
    row.className = 'carousel_character_row';
    row.dataset.character = characterKey;

    const nameLink = document.createElement('a');
    nameLink.className = 'carousel_character_name';
    nameLink.textContent = state.displayName || characterKey;
    nameLink.href = '#';
    nameLink.title = `Scroll to ${state.displayName || characterKey}'s last message`;
    nameLink.addEventListener('click', (e) => {
        e.preventDefault();
        scrollToCharacterMessage(characterKey, state.displayName);
    });
    row.appendChild(nameLink);

    const controls = document.createElement('div');
    controls.className = 'carousel_controls';

    const leftArrow = document.createElement('button');
    leftArrow.className = 'segment-carousel-arrow segment-carousel-prev';
    leftArrow.innerHTML = '<i class="fa-solid fa-chevron-left"></i>';
    leftArrow.title = 'Previous segment';
    leftArrow.disabled = state.activeIndex <= 0;
    leftArrow.addEventListener('click', (e) => {
        e.stopPropagation();
        if (state.activeIndex > 0) {
            setActiveSegment(characterKey, state.activeIndex - 1);
        }
    });
    controls.appendChild(leftArrow);

    const dotsContainer = document.createElement('div');
    dotsContainer.className = 'segment-carousel-dots';

    const MAX_VISIBLE_DOTS = 6;
    const total = state.results.length;
    let windowStart = 0;
    let windowEnd = total;
    if (total > MAX_VISIBLE_DOTS) {
        windowStart = Math.max(0, Math.min(state.activeIndex - Math.floor(MAX_VISIBLE_DOTS / 2), total - MAX_VISIBLE_DOTS));
        windowEnd = windowStart + MAX_VISIBLE_DOTS;
    }

    for (let index = windowStart; index < windowEnd; index++) {
        const result = state.results[index];
        const dot = document.createElement('button');
        dot.className = 'segment-carousel-dot';
        if (index === state.activeIndex) dot.classList.add('active');
        dot.title = `Segment ${index + 1}: ${result.expression}`;
        dot.dataset.index = String(index % MAX_VISIBLE_DOTS);
        dot.addEventListener('click', (e) => {
            e.stopPropagation();
            setActiveSegment(characterKey, index);
        });
        dotsContainer.appendChild(dot);
    }
    controls.appendChild(dotsContainer);

    const rightArrow = document.createElement('button');
    rightArrow.className = 'segment-carousel-arrow segment-carousel-next';
    rightArrow.innerHTML = '<i class="fa-solid fa-chevron-right"></i>';
    rightArrow.title = 'Next segment';
    rightArrow.disabled = state.activeIndex >= state.results.length - 1;
    rightArrow.addEventListener('click', (e) => {
        e.stopPropagation();
        if (state.activeIndex < state.results.length - 1) {
            setActiveSegment(characterKey, state.activeIndex + 1);
        }
    });
    controls.appendChild(rightArrow);

    const label = document.createElement('span');
    label.className = 'segment-carousel-label';
    label.textContent = `${state.activeIndex + 1}/${state.results.length}`;
    controls.appendChild(label);

    row.appendChild(controls);

    const exprLabel = document.createElement('span');
    exprLabel.className = 'carousel_expression_label';
    const exprName = state.results[state.activeIndex]?.expression || '—';
    exprLabel.textContent = exprName;
    exprLabel.title = exprName;
    row.appendChild(exprLabel);

    return row;
}

/**
 * Scrolls the chat to the last message from a character.
 * @param {string} characterKey
 * @param {string} [displayName]
 */
function scrollToCharacterMessage(characterKey, displayName) {
    const messages = document.querySelectorAll('.mes[is_user="false"]');
    let targetMessage = null;

    for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        const nameEl = msg.querySelector('.ch_name .name_text');
        if (nameEl) {
            const name = nameEl.textContent?.trim();
            if (name === displayName || name === characterKey) {
                targetMessage = msg;
                break;
            }
        }
    }

    if (targetMessage) {
        targetMessage.scrollIntoView({ behavior: 'smooth', block: 'center' });
        targetMessage.classList.add('flash');
        setTimeout(() => targetMessage.classList.remove('flash'), 1500);
    }
}

// ============================================================================
// Sprite Transition Queue
// ============================================================================

/**
 * Waits until no sprite images have the animating class.
 * Polls at short intervals to detect when jQuery animations finish.
 * @returns {Promise<void>}
 */
function waitForSpriteAnimationComplete() {
    return new Promise(resolve => {
        const check = () => {
            const animating = document.querySelector('.expression-plus-animating');
            if (animating) {
                setTimeout(check, 50);
            } else {
                resolve();
            }
        };
        check();
    });
}

/**
 * Enqueues a sprite change for a character. If the queue is already being
 * processed, the pending request is overwritten (coalesced) so only the
 * latest expression is applied.
 * @param {string} characterKey
 * @param {string} spriteFolderName
 * @param {string} expression
 */
function enqueueSpriteChange(characterKey, spriteFolderName, expression) {
    let entry = spriteQueue.get(characterKey);
    if (!entry) {
        entry = { pending: null, processing: false };
        spriteQueue.set(characterKey, entry);
    }

    entry.pending = { spriteFolderName, expression };

    if (!entry.processing) {
        processSpriteQueue(characterKey);
    }
}

/**
 * Processes queued sprite changes for a character one at a time.
 * Always picks the latest pending request, skipping any that were
 * superseded by newer clicks.
 * @param {string} characterKey
 */
async function processSpriteQueue(characterKey) {
    const entry = spriteQueue.get(characterKey);
    if (!entry || entry.processing) return;

    entry.processing = true;

    while (entry.pending) {
        const { spriteFolderName, expression } = entry.pending;
        entry.pending = null;

        await waitForSpriteAnimationComplete();

        if (entry.pending) continue;

        if (sendExpressionCallFn) {
            await sendExpressionCallFn(spriteFolderName, expression, { force: true, isCarouselNavigation: true, scenarioCharacterKey: characterKey });
        }

        await new Promise(resolve => setTimeout(resolve, 20));
    }

    entry.processing = false;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Updates the carousel for a character with new segment results.
 * @param {string} characterKey - Character key (sprite folder name or avatar)
 * @param {import('./constants.js').SegmentResult[]} results - Array of segment classification results
 * @param {string} [displayName] - Human-readable character name for the label
 * @param {string} [spriteFolderName] - Pre-resolved sprite folder name (includes expression set path)
 */
export function updateCarousel(characterKey, results, displayName, spriteFolderName) {
    const existingState = carouselState.get(characterKey);
    let activeIndex;
    if (existingState && existingState.results.length === results.length) {
        activeIndex = Math.min(existingState.activeIndex, results.length - 1);
    } else {
        activeIndex = results.length > 0 ? results.length - 1 : 0;
    }

    carouselState.set(characterKey, {
        results,
        activeIndex,
        displayName: displayName || existingState?.displayName || characterKey,
        spriteFolderName: spriteFolderName || existingState?.spriteFolderName || null,
    });

    renderPanel();

    if (results.length > 1) {
        const msgEl = getLastMessageForCharacter(displayName || characterKey);
        annotateSegments(results, activeIndex, msgEl || undefined, characterKey);
    }
}

/**
 * Sets the active segment for a character and triggers sprite update.
 * @param {string} characterKey
 * @param {number} index
 */
export function setActiveSegment(characterKey, index) {
    const state = carouselState.get(characterKey);
    if (!state || index < 0 || index >= state.results.length) return;

    state.activeIndex = index;
    const result = state.results[index];

    renderPanel();

    updateAnnotationActiveState(index, characterKey);

    if (result.scores) {
        if (setLastClassificationScoresFn) {
            setLastClassificationScoresFn(result.scores);
        }
        if (updateInsightPanelFn) {
            updateInsightPanelFn(result.scores);
        }
    }

    if (result) {
        let spriteFolderName = state.spriteFolderName || characterKey;
        if (!state.spriteFolderName && getSpriteFolderNameFn) {
            try {
                spriteFolderName = getSpriteFolderNameFn(null, characterKey) || characterKey;
            } catch {
            }
        }
        enqueueSpriteChange(characterKey, spriteFolderName, result.expression);
    }
}

/**
 * Gets the current carousel state for a character
 * @param {string} characterKey
 * @returns {{ results: import('./constants.js').SegmentResult[], activeIndex: number, displayName: string, spriteFolderName: string|null }|null}
 */
export function getCarouselState(characterKey) {
    return carouselState.get(characterKey) || null;
}

/**
 * Removes the carousel for a character
 * @param {string} characterKey
 */
export function removeCarousel(characterKey) {
    carouselState.delete(characterKey);
    spriteQueue.delete(characterKey);
    renderPanel();
}

/**
 * Clears all carousels (e.g., on chat change)
 */
export function clearAllCarousels() {
    carouselState.clear();
    spriteQueue.clear();
    renderPanel();
    clearAnnotations();
}

/**
 * Gets the active segment's expression for a character.
 * @param {string} characterKey
 * @returns {string|null}
 */
export function getActiveExpression(characterKey) {
    const state = carouselState.get(characterKey);
    if (!state || state.results.length === 0) return null;
    return state.results[state.activeIndex]?.expression || null;
}
