/**
 * Per-Character Sprite Layout Management — Expressions+
 *
 * Saves and restores sprite container position/size on a per-character basis
 * (keyed by avatar filename) so that switching characters does not inherit
 * the previous character's manually resized sprite window.
 */

import { saveSettingsDebounced } from '../../../../../script.js';
import { power_user } from '../../../../power-user.js';

import { getSettings } from './settings.js';
import { currentCharacterAvatar } from './state.js';

/** Layout property keys we track per character */
const LAYOUT_PROPS = ['top', 'left', 'width', 'height', 'margin'];

/**
 * The set of element IDs used by the single-sprite holder.
 * VN holders use dynamic IDs (expression-plus-{avatar}) and are handled separately.
 */
const SINGLE_HOLDER_ID = 'expression-plus-holder';

// ============================================================================
// Save / Restore
// ============================================================================

/**
 * Saves the current sprite holder layout for the active character.
 * Reads dimensions from the DOM element and persists to extension_settings.
 */
export function saveCurrentCharacterLayout() {
    if (!currentCharacterAvatar) return;

    const settings = getSettings();
    if (!settings.characterLayouts) settings.characterLayouts = {};

    const holder = document.getElementById(SINGLE_HOLDER_ID);
    if (!holder || holder.style.display === 'none') return;

    const style = getComputedStyle(holder);
    const layout = {};

    for (const prop of LAYOUT_PROPS) {
        const val = style[prop];
        if (val && val !== 'auto' && val !== '' && val !== 'unset') {
            layout[prop] = val;
        }
    }

    // Only save if we have meaningful data
    if (Object.keys(layout).length > 0) {
        settings.characterLayouts[currentCharacterAvatar] = layout;
        saveSettingsDebounced();
    }
}

/**
 * Restores saved layout for a character, or clears inline styles to defaults.
 * @param {string|null} avatarFilename - The avatar to restore layout for
 */
export function restoreCharacterLayout(avatarFilename) {
    const holder = document.getElementById(SINGLE_HOLDER_ID);
    if (!holder) return;

    const settings = getSettings();
    const saved = avatarFilename && settings.characterLayouts?.[avatarFilename];

    // Clear all layout inline styles so the previous character's position doesn't carry over
    for (const prop of LAYOUT_PROPS) {
        holder.style[prop] = '';
    }
    holder.style.bottom = '';
    holder.style.right = '';
    holder.style.minWidth = '';
    holder.style.minHeight = '';

    // Reset the browser's internal resize tracking by toggling the resize property.
    // CSS `resize: both` causes the browser to remember user-resized dimensions
    // even after inline styles are cleared; cycling to 'none' and back forces a reset.
    holder.style.resize = 'none';
    // Force a style recalc before restoring
    void holder.offsetHeight;
    holder.style.resize = '';

    // Apply saved layout for this character (if any)
    if (saved && Object.keys(saved).length > 0) {
        for (const prop of LAYOUT_PROPS) {
            if (saved[prop] !== undefined) {
                holder.style[prop] = saved[prop];
            }
        }
    }
}

/**
 * Clears expression holder entries from power_user.movingUIState
 * so stale sizing data from a previous character doesn't get applied.
 */
export function clearHolderMovingUIState() {
    if (!power_user.movingUIState) return;

    // Only clear the single-sprite holder — VN/scenario holders use their own
    // movingUIState entries (keyed by dynamic element IDs) and should be preserved.
    delete power_user.movingUIState[SINGLE_HOLDER_ID];
}

/**
 * Captures the current layout from a resize/drag event and saves it
 * for the active character. Called when SillyTavern's dragElement emits resizeUI.
 * @param {string} elementId - The ID of the element that was resized
 */
export function onHolderResized(elementId) {
    if (!currentCharacterAvatar) return;
    if (elementId !== SINGLE_HOLDER_ID) return;

    const settings = getSettings();
    if (!settings.characterLayouts) settings.characterLayouts = {};

    const holder = document.getElementById(elementId);
    if (!holder) return;

    const style = getComputedStyle(holder);
    const layout = settings.characterLayouts[currentCharacterAvatar] || {};

    for (const prop of LAYOUT_PROPS) {
        const val = style[prop];
        if (val && val !== 'auto' && val !== '' && val !== 'unset') {
            layout[prop] = val;
        }
    }

    settings.characterLayouts[currentCharacterAvatar] = layout;
    saveSettingsDebounced();
}

/**
 * Clears all saved character layouts and resets the single-sprite holder inline styles.
 * Called when the user clicks "Reset Panel Positions" in SillyTavern.
 */
export function resetAllCharacterLayouts() {
    const settings = getSettings();
    settings.characterLayouts = {};
    saveSettingsDebounced();

    const holder = document.getElementById(SINGLE_HOLDER_ID);
    if (holder) {
        for (const prop of LAYOUT_PROPS) {
            holder.style[prop] = '';
        }
        holder.style.bottom = '';
        holder.style.right = '';
        holder.style.minWidth = '';
        holder.style.minHeight = '';

        // Reset browser's internal resize tracking
        holder.style.resize = 'none';
        void holder.offsetHeight;
        holder.style.resize = '';
    }
}

// ============================================================================
// VN / Scenario Mode Helpers
// ============================================================================

/**
 * Gets saved layout for a VN-mode character holder.
 * @param {string} avatarFilename - The character's avatar filename
 * @returns {Record<string, string>|null} Saved layout or null
 */
export function getCharacterLayout(avatarFilename) {
    const settings = getSettings();
    const saved = settings.characterLayouts?.[avatarFilename];
    if (saved && Object.keys(saved).length > 0) {
        return saved;
    }
    return null;
}

/**
 * Saves layout for a specific VN/scenario holder by avatar.
 * @param {string} avatarFilename - The character's avatar filename
 * @param {HTMLElement} holderElement - The holder DOM element
 */
export function saveCharacterLayoutFromElement(avatarFilename, holderElement) {
    if (!avatarFilename || !holderElement) return;

    const settings = getSettings();
    if (!settings.characterLayouts) settings.characterLayouts = {};

    const style = getComputedStyle(holderElement);
    const layout = {};

    for (const prop of LAYOUT_PROPS) {
        const val = style[prop];
        if (val && val !== 'auto' && val !== '' && val !== 'unset') {
            layout[prop] = val;
        }
    }

    if (Object.keys(layout).length > 0) {
        settings.characterLayouts[avatarFilename] = layout;
        saveSettingsDebounced();
    }
}
