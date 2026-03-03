/**
 * UI Event Handlers for Expressions+
 */

/**
 * @typedef {Object} ToastrLib
 * @property {function(string, string=, Object=): void} error
 * @property {function(string, string=, Object=): void} success  
 * @property {function(string, string=, Object=): void} warning
 * @property {function(string, string=, Object=): void} info
 */

/** @type {ToastrLib} */
// @ts-ignore - toastr is a global library
const toast = window.toastr;

import { getRequestHeaders, saveSettingsDebounced } from '../../../../../script.js';

import { OPTION_NO_FALLBACK, OPTION_EMOJI_FALLBACK } from './constants.js';
import { spriteCache } from './state.js';
import { getSettings } from './settings.js';
import { getSpriteFolderName, getLastCharacterMessage } from './sprites.js';
import { sendExpressionCall } from './expression-display.js';

let validateImages = null;
let renderRulesList = null;
let getExpressionsList = null;

/**
 * Sets the validateImages function reference
 * @param {Function} fn 
 */
export function setValidateImagesFn(fn) {
    validateImages = fn;
}

/**
 * Sets the renderRulesList function reference
 * @param {Function} fn 
 */
export function setRenderRulesListFn(fn) {
    renderRulesList = fn;
}

/**
 * Sets the getExpressionsList function reference
 * @param {Function} fn 
 */
export function setGetExpressionsListFn(fn) {
    getExpressionsList = fn;
}

// ============================================================================
// UI Event Handlers
// ============================================================================

/**
 * Handles fallback expression change
 */
export function onFallbackChanged() {
    const settings = getSettings();
    const value = String($('#expressions_plus_fallback').val());

    if (value === OPTION_NO_FALLBACK) {
        settings.fallback_expression = '';
        settings.showDefault = false;
    } else if (value === OPTION_EMOJI_FALLBACK) {
        settings.fallback_expression = '';
        settings.showDefault = true;
    } else {
        settings.fallback_expression = value;
        settings.showDefault = false;
    }

    saveSettingsDebounced();
}

/**
 * Handles profile selection change
 */
export async function onProfileChanged() {
    const settings = getSettings();
    settings.activeProfileId = String($('#expressions_plus_profile_select').val());
    saveSettingsDebounced();
    
    if (renderRulesList) {
        renderRulesList();
    }
    
    const currentLastMessage = getLastCharacterMessage();
    const spriteFolderName = getSpriteFolderName(currentLastMessage, currentLastMessage?.name);
    if (spriteFolderName && validateImages) {
        delete spriteCache[spriteFolderName];
        await validateImages(spriteFolderName, true);
    }
}

/**
 * Handles clicking on expression image
 */
export function onClickExpressionImage() {
    const expression = $(this).data('expression');
    const currentLastMessage = getLastCharacterMessage();
    const spriteFolderName = getSpriteFolderName(currentLastMessage, currentLastMessage?.name);
    sendExpressionCall(spriteFolderName, expression, { force: true });
}

// ============================================================================
// Sprite Upload Helpers
// ============================================================================

/**
 * Generates a unique sprite name by incrementing a suffix until no collision.
 * e.g., joy → joy-1, joy-2, etc.
 * @param {string} expression - Base expression name
 * @param {import('./constants.js').ExpressionImage[]} existingFiles - Files already present for this expression
 * @returns {string}
 */
function generateUniqueSpriteName(expression, existingFiles) {
    let index = existingFiles.length;
    let candidate;
    do {
        candidate = `${expression}-${index++}`;
    } while (existingFiles.some(f => f.title === candidate));
    return candidate;
}

/**
 * Validates that a sprite name matches the expected pattern for an expression.
 * Valid: expression, expression-1, expression.alt, expression-foo
 * @param {string} expression - The base expression label
 * @param {string} spriteName - The proposed sprite name
 * @returns {boolean}
 */
function validateSpriteName(expression, spriteName) {
    const regex = new RegExp(`^${expression}(?:[-\\.].*)?$`);
    return regex.test(spriteName);
}

/**
 * Handles the core sprite upload logic with duplicate detection.
 * Shows overwrite / add duplicate / rename prompt if a sprite already exists.
 * @param {File} file - The image file to upload
 * @param {string} expression - The target expression label
 * @param {string} name - The character sprite folder name
 */
async function uploadSpriteWithDuplicateCheck(file, expression, name) {
    const existingFiles = spriteCache[name]?.find(x => x.label === expression)?.files || [];
    const hasExisting = existingFiles.some(f => f.type === 'success' || f.type === 'additional');

    let spriteName = expression;

    if (hasExisting) {
        const { Popup, POPUP_RESULT } = await import('../../../../popup.js');

        const suggestedDupeName = generateUniqueSpriteName(expression, existingFiles);

        // Use an action callback for Overwrite, because Popup.show.input
        // returns the input field text (string) for any result >= AFFIRMATIVE.
        spriteName = null;

        /** @type {import('../../../../popup.js').CustomPopupButton[]} */
        const customButtons = [
            {
                text: 'Overwrite',
                result: POPUP_RESULT.NEGATIVE,
                action: () => { spriteName = expression; },
                classes: ['menu_button'],
            },
        ];

        const input = await Popup.show.input(
            'Upload Expression Sprite',
            `<p>A sprite already exists for <b>${expression}</b> (${existingFiles.length} file(s)).</p>` +
            '<p><b>Overwrite</b> replaces the primary sprite. ' +
            '<b>Save as Duplicate</b> uses the name below (editable).</p>',
            suggestedDupeName,
            { okButton: 'Save as Duplicate', customButtons },
        );

        if (input) {
            // "Save as Duplicate" returns the input field text
            const trimmed = String(input).trim();
            if (!trimmed) return;
            if (!validateSpriteName(expression, trimmed)) {
                toast.warning(`Invalid sprite name. It must start with "${expression}" (e.g., ${expression}-alt, ${expression}.v2)`);
                return;
            }
            spriteName = trimmed;
        }

        // If spriteName is still null, the user cancelled
        if (!spriteName) {
            return;
        }
    }

    const formData = new FormData();
    formData.append('name', name);
    formData.append('label', expression);
    formData.append('avatar', file);
    formData.append('spriteName', spriteName);

    try {
        const result = await fetch('/api/sprites/upload', {
            method: 'POST',
            headers: getRequestHeaders({ omitContentType: true }),
            body: formData,
        });

        if (!result.ok) {
            const text = await result.text();
            throw new Error(text || `Server returned ${result.status}`);
        }

        delete spriteCache[name];
        if (validateImages) {
            await validateImages(name, true);
        }
        toast.success(`Uploaded sprite for ${expression} as "${spriteName}"`);
    } catch (error) {
        console.error('Upload error:', error);
        toast.error(`Failed to upload sprite: ${error.message}`);
    }
}

// ============================================================================
// Click Upload
// ============================================================================

/**
 * Handles expression upload
 * @param {Event} event 
 */
export async function onClickExpressionUpload(event) {
    event.stopPropagation();
    
    const expressionListItem = $(this).closest('.expression_plus_list_item');
    const expression = expressionListItem.data('expression');
    const name = $('#expresssions_plus_image_list').data('name');

    const handleUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        await uploadSpriteWithDuplicateCheck(file, expression, name);

        e.target.form.reset();
    };

    $('#expressions_plus_upload')
        .off('change')
        .on('change', handleUpload)
        .trigger('click');
}

/**
 * Handles expression deletion
 * @param {Event} event 
 */
export async function onClickExpressionDelete(event) {
    event.stopPropagation();

    const { Popup } = await import('../../../../popup.js');
    
    const expressionListItem = $(this).closest('.expression_plus_list_item');
    const expression = expressionListItem.data('expression');

    if (expressionListItem.attr('data-expression-type') === 'failure') return;

    const confirmation = await Popup.show.confirm(
        'Delete Expression', 
        `Are you sure you want to delete this expression sprite?<br><br>Expression: <tt>${expressionListItem.attr('data-filename')}</tt>`
    );
    
    if (!confirmation) return;

    const fileName = expressionListItem.attr('data-filename').replace(/\.[^/.]+$/, '');
    const name = $('#expresssions_plus_image_list').data('name');

    try {
        await fetch('/api/sprites/delete', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ name, label: expression, spriteName: fileName }),
        });
        
        delete spriteCache[name];
        if (validateImages) {
            await validateImages(name, true);
        }
    } catch (error) {
        toast.error('Failed to delete image');
    }
}

// ============================================================================
// Drag-and-Drop Upload
// ============================================================================

/**
 * Handles dragover on an expression list item to show visual feedback
 * @param {DragEvent} event 
 */
export function onExpressionDragOver(event) {
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'copy';
    }
    $(this).closest('.expression_plus_list_item').addClass('expression_plus_drop_target');
}

/**
 * Handles dragleave on an expression list item to remove visual feedback
 * @param {DragEvent} event 
 */
export function onExpressionDragLeave(event) {
    event.preventDefault();
    event.stopPropagation();
    // Only remove if we're actually leaving the item (not entering a child)
    const item = $(this).closest('.expression_plus_list_item')[0];
    if (item && !item.contains(/** @type {Node} */ (event.relatedTarget))) {
        $(item).removeClass('expression_plus_drop_target');
    }
}

/**
 * Handles dropping an image file on an expression list item
 * @param {DragEvent} event 
 */
export async function onExpressionDrop(event) {
    event.preventDefault();
    event.stopPropagation();

    const expressionListItem = $(this).closest('.expression_plus_list_item');
    expressionListItem.removeClass('expression_plus_drop_target');

    const files = event.dataTransfer?.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    if (!file.type.startsWith('image/')) {
        toast.warning('Only image files can be uploaded as sprites');
        return;
    }

    const expression = expressionListItem.data('expression');
    const name = $('#expresssions_plus_image_list').data('name');
    if (!expression || !name) return;

    await uploadSpriteWithDuplicateCheck(file, expression, name);
}

// ============================================================================
// Low Confidence Settings
// ============================================================================

/**
 * Renders the low confidence expression picker dropdown
 */
async function renderLowConfidenceExpressionPicker() {
    const settings = getSettings();
    const expressions = getExpressionsList ? await getExpressionsList() : [];
    const picker = $('#expressions_plus_low_confidence_expression');
    
    picker.empty();
    
    expressions.forEach(expression => {
        const selected = expression === settings.lowConfidenceExpression ? 'selected' : '';
        picker.append(`<option value="${expression}" ${selected}>${expression}</option>`);
    });
    
    if (settings.lowConfidenceExpression) {
        picker.val(settings.lowConfidenceExpression);
    } else {
        picker.val('neutral');
    }
}

/**
 * Initializes the low confidence settings UI
 */
export async function initLowConfidenceSettings() {
    const settings = getSettings();
    
    $('#expressions_plus_low_confidence_enabled').prop('checked', settings.lowConfidenceEnabled ?? true)
        .on('change', function() {
            settings.lowConfidenceEnabled = $(this).prop('checked');
            saveSettingsDebounced();
        });
    
    const thresholdPercent = Math.round((settings.lowConfidenceThreshold ?? 0.10) * 100);
    $('#expressions_plus_low_confidence_threshold').val(thresholdPercent)
        .on('change', function() {
            const value = parseInt(String($(this).val()), 10) || 10;
            settings.lowConfidenceThreshold = value / 100;
            saveSettingsDebounced();
        });
    
    await renderLowConfidenceExpressionPicker();
    
    $('#expressions_plus_low_confidence_expression').on('change', function() {
        settings.lowConfidenceExpression = String($(this).val());
        saveSettingsDebounced();
    });
}
