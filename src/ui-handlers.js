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

        const formData = new FormData();
        formData.append('name', name);
        formData.append('label', expression);
        formData.append('avatar', file);
        formData.append('spriteName', expression);

        try {
            await fetch('/api/sprites/upload', {
                method: 'POST',
                body: formData,
            });
            
            delete spriteCache[name];
            if (validateImages) {
                await validateImages(name, true);
            }
            toast.success(`Uploaded sprite for ${expression}`);
        } catch (error) {
            console.error('Upload error:', error);
            toast.error('Failed to upload sprite');
        }

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
