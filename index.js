/**
 * Expressions+ Extension
 * Advanced expression system with customizable emotion rules, profiles, and complex emotion detection.
 */

import { eventSource, event_types, saveSettingsDebounced } from '../../../../script.js';
import { dragElement } from '../../../RossAscends-mods.js';
import { ModuleWorkerWrapper, renderExtensionTemplateAsync } from '../../../extensions.js';
import { loadMovingUIState } from '../../../power-user.js';

// Import from local modules
import {
    MODULE_NAME,
    UPDATE_INTERVAL,
    OPTION_NO_FALLBACK,
    OPTION_EMOJI_FALLBACK,
} from './src/constants.js';

import {
    lastExpression,
    insightPanelVisible,
    clearSpriteCache,
    setInsightPanelVisible,
    clearExpressionSetsCache,
} from './src/state.js';

import {
    getSettings,
    migrateSettings,
} from './src/settings.js';

import {
    getClassificationScores,
    getExpressionLabel,
    setUpdateInsightPanelFn,
} from './src/api.js';

import {
    getExpressionSets,
    setCharacterExpressionSet,
    getCharacterExpressionSet,
    dispatchExpressionSetChanged,
} from './src/expression-sets.js';

import {
    isVisualNovelMode,
    updateVisualNovelModeDebounced,
    chooseSpriteForExpression,
    validateImages as validateImagesBase,
    drawSpritesList as drawSpritesListBase,
    createListItemHtml,
    setGetExpressionsListFn as setSpritesGetExpressionsListFn,
    setUpdateVisualNovelModeFn as setSpritesUpdateVisualNovelModeFn,
    getFolderNameByMessage,
    getLastCharacterMessage,
} from './src/sprites.js';

import {
    removeExpression,
    sendExpressionCall,
    setValidateImagesFn,
    setUpdateVisualNovelModeFn as setDisplayUpdateVisualNovelModeFn,
    setIsVisualNovelModeFn,
    setChooseSpriteForExpressionFn,
} from './src/expression-display.js';

import {
    updateVisualNovelMode,
    setValidateImagesFn as setVnValidateImagesFn,
    setGetExpressionLabelFn as setVnGetExpressionLabelFn,
} from './src/visual-novel.js';

import {
    moduleWorker,
    setValidateImagesFn as setWorkerValidateImagesFn,
    setGetExpressionLabelFn as setWorkerGetExpressionLabelFn,
    setGetExpressionsListFn as setWorkerGetExpressionsListFn,
} from './src/module-worker.js';

import {
    getCachedExpressions,
    getExpressionsList,
} from './src/expressions-list.js';

import {
    updateInsightPanel,
    toggleInsightPanel,
    initInsightPanel,
} from './src/debug-panel.js';

import {
    onFallbackChanged,
    onProfileChanged,
    onClickExpressionImage,
    onClickExpressionUpload,
    onClickExpressionDelete,
    setValidateImagesFn as setHandlersValidateImagesFn,
    setRenderRulesListFn as setHandlersRenderRulesListFn,
} from './src/ui-handlers.js';

import {
    renderProfileSelector,
    onClickCreateProfile,
    onClickDeleteProfile,
    onClickExportProfile,
    onClickImportProfile,
    setRenderRulesListFn as setProfilesRenderRulesListFn,
} from './src/ui-profiles.js';

import {
    renderRulesList,
    onClickAddRule,
    onClickEditRule,
    onClickDeleteRule,
    setGetExpressionsListFn as setRulesGetExpressionsListFn,
} from './src/ui-rules.js';

import {
    renderCharacterAssignments,
    onCharacterProfileChanged,
    onCharacterExpressionSetChanged,
    onExpressionSetAdd,
    onExpressionSetRemove,
} from './src/ui-character-assignments.js';

import {
    registerSlashCommands,
    setGetExpressionLabelFn as setSlashGetExpressionLabelFn,
    setRenderProfileSelectorFn,
    setRenderRulesListFn as setSlashRenderRulesListFn,
    setRenderCharacterAssignmentsFn as setSlashRenderCharacterAssignmentsFn,
} from './src/slash-commands.js';

export { MODULE_NAME };

// Re-export lastExpression for external modules
export { lastExpression };

// Re-export for compatibility
export { getClassificationScores, getExpressionLabel, sendExpressionCall, getExpressionsList, getCachedExpressions };

// ============================================================================
// Module Wiring - Local wrapper functions
// ============================================================================

/**
 * Wrapper for validateImages that passes the drawSpritesList callback
 * @param {string} spriteFolderName 
 * @param {boolean} forceRedrawCached 
 */
async function validateImages(spriteFolderName, forceRedrawCached = false) {
    return validateImagesBase(spriteFolderName, forceRedrawCached, drawSpritesList);
}

/**
 * Wrapper for drawSpritesList that passes the createListItemHtml callback
 * @param {string} spriteFolderName 
 * @param {string[]} labels 
 * @param {any[]} sprites 
 */
async function drawSpritesList(spriteFolderName, labels, sprites) {
    return drawSpritesListBase(spriteFolderName, labels, sprites, createListItemHtml);
}

// Wire up the module dependencies
setUpdateInsightPanelFn((scores) => updateInsightPanel(scores));
setSpritesGetExpressionsListFn(() => getExpressionsList());
setSpritesUpdateVisualNovelModeFn((folder, expr) => updateVisualNovelMode(folder, expr));
setValidateImagesFn(validateImages);
setDisplayUpdateVisualNovelModeFn((folder, expr) => updateVisualNovelMode(folder, expr));
setIsVisualNovelModeFn(isVisualNovelMode);
setChooseSpriteForExpressionFn(chooseSpriteForExpression);

// Wire up visual-novel.js dependencies
setVnValidateImagesFn(validateImages);
setVnGetExpressionLabelFn(getExpressionLabel);

// Wire up module-worker.js dependencies
setWorkerValidateImagesFn(validateImages);
setWorkerGetExpressionLabelFn(getExpressionLabel);
setWorkerGetExpressionsListFn(() => getExpressionsList());

// Wire up ui-handlers.js dependencies
setHandlersValidateImagesFn(validateImages);
setHandlersRenderRulesListFn(() => renderRulesList());

// Wire up ui-profiles.js dependencies
setProfilesRenderRulesListFn(() => renderRulesList());

// Wire up ui-rules.js dependencies
setRulesGetExpressionsListFn(() => getExpressionsList());

// Wire up slash-commands.js dependencies
setSlashGetExpressionLabelFn(getExpressionLabel);
setRenderProfileSelectorFn(renderProfileSelector);
setSlashRenderRulesListFn(() => renderRulesList());
setSlashRenderCharacterAssignmentsFn(() => renderCharacterAssignments());

// ============================================================================
// Fallback Expression Picker
// ============================================================================

async function renderFallbackExpressionPicker() {
    const settings = getSettings();
    const expressions = await getExpressionsList();
    const picker = $('#expressions_plus_fallback');
    
    picker.empty();
    picker.append(`<option value="${OPTION_NO_FALLBACK}">[ No fallback ]</option>`);
    picker.append(`<option value="${OPTION_EMOJI_FALLBACK}">[ Default emojis ]</option>`);
    
    expressions.forEach(expression => {
        const selected = expression === settings.fallback_expression ? 'selected' : '';
        picker.append(`<option value="${expression}" ${selected}>${expression}</option>`);
    });

    // Set current selection
    if (settings.showDefault) {
        picker.val(OPTION_EMOJI_FALLBACK);
    } else if (!settings.fallback_expression) {
        picker.val(OPTION_NO_FALLBACK);
    }
}

// ============================================================================
// Initialization
// ============================================================================

async function addSettings() {
    const settingsHtml = await renderExtensionTemplateAsync(MODULE_NAME, 'settings');
    $('#extensions_settings2').append(settingsHtml);

    // Add insight panel to page
    const insightPanelHtml = await renderExtensionTemplateAsync(MODULE_NAME, 'templates/debug-panel');
    $('body').append(insightPanelHtml);
    $('#expressions_plus_insight_panel').hide();
    initInsightPanel(); // Initialize draggable functionality

    // Bind event handlers
    const settings = getSettings();
    
    $('#expressions_plus_translate').prop('checked', settings.translate).on('change', function() {
        settings.translate = $(this).prop('checked');
        saveSettingsDebounced();
    });
    
    $('#expressions_plus_allow_multiple').prop('checked', settings.allowMultiple).on('change', function() {
        settings.allowMultiple = $(this).prop('checked');
        saveSettingsDebounced();
    });
    
    $('#expressions_plus_reroll').prop('checked', settings.rerollIfSame).on('change', function() {
        settings.rerollIfSame = $(this).prop('checked');
        saveSettingsDebounced();
    });
    
    $('#expressions_plus_fallback').on('change', onFallbackChanged);
    $('#expressions_plus_profile_select').on('change', onProfileChanged);
    
    $('#expressions_plus_profile_create').on('click', onClickCreateProfile);
    $('#expressions_plus_profile_delete').on('click', onClickDeleteProfile);
    $('#expressions_plus_profile_export').on('click', onClickExportProfile);
    $('#expressions_plus_profile_import').on('click', onClickImportProfile);
    
    $('#expressions_plus_add_rule').on('click', onClickAddRule);
    $(document).on('click', '.rule_edit_btn', onClickEditRule);
    $(document).on('click', '.rule_delete_btn', onClickDeleteRule);
    
    $(document).on('change', '.character_profile_select', onCharacterProfileChanged);
    $(document).on('change', '.character_expression_set_select', onCharacterExpressionSetChanged);
    $(document).on('click', '.expression_set_add', onExpressionSetAdd);
    $(document).on('click', '.expression_set_remove', onExpressionSetRemove);
    
    // Insight panel toggle - supports both old 'debugMode' and new 'insightMode' settings
    const insightModeEnabled = settings.insightMode ?? settings.debugMode ?? false;
    $('#expressions_plus_insight_toggle').prop('checked', insightModeEnabled).on('change', toggleInsightPanel);
    setInsightPanelVisible(insightModeEnabled);
    $('#expressions_plus_insight_panel').toggle(insightPanelVisible);
    
    // Collapsible sections
    $(document).on('click', '.section_toggle', function() {
        $(this).next('.section_content').slideToggle();
        $(this).find('i').toggleClass('fa-chevron-down fa-chevron-up');
    });

    // Sprite list event handlers
    $(document).on('click', '.expression_plus_list_item', onClickExpressionImage);
    $(document).on('click', '.expression_plus_list_upload', onClickExpressionUpload);
    $(document).on('click', '.expression_plus_list_delete', onClickExpressionDelete);

    // Initialize UI
    await renderFallbackExpressionPicker();
    renderProfileSelector();
    renderRulesList();
    renderCharacterAssignments();
}

// ============================================================================
// Wand Menu Integration
// ============================================================================

/**
 * Adds the expression set button to the wand menu
 */
async function addWandButton() {
    try {
        // Check if the wand menu exists (it may not in all ST versions)
        const extensionsMenu = $('#extensionsMenu');
        if (extensionsMenu.length === 0) {
            console.debug('Expressions+: Wand menu not found, skipping wand integration');
            return;
        }

        // Load the button template
        const buttonHtml = await renderExtensionTemplateAsync(MODULE_NAME, 'templates/wand-button');
        const dropdownHtml = await renderExtensionTemplateAsync(MODULE_NAME, 'templates/wand-dropdown');

        // Add our container if it doesn't exist, or append to existing
        let container = $('#expressions_plus_wand_container');
        if (container.length === 0) {
            extensionsMenu.append('<div id="expressions_plus_wand_container" class="extension_container"></div>');
            container = $('#expressions_plus_wand_container');
        }

        container.append(buttonHtml);
        $(document.body).append(dropdownHtml);

        const button = $('#expressions_plus_wand');
        const dropdown = $('#expressions_plus_wand_dropdown');
        dropdown.hide();

        // Toggle dropdown on button click
        button.on('click', async function(e) {
            e.preventDefault();
            e.stopPropagation();

            if (dropdown.is(':visible')) {
                dropdown.fadeOut(200);
                return;
            }

            // Position dropdown near button
            const buttonPos = button.offset();
            dropdown.css({
                position: 'absolute',
                left: buttonPos.left,
                bottom: $(window).height() - buttonPos.top + 5,
            });

            // Load expression sets for current character
            loadWandDropdownSets();
            dropdown.fadeIn(200);
        });

        // Close dropdown when clicking elsewhere
        $(document).on('click', function(e) {
            if (!$(e.target).closest('#expressions_plus_wand, #expressions_plus_wand_dropdown').length) {
                dropdown.fadeOut(200);
            }
        });

        // Handle set selection
        $(document).on('click', '.expressions_plus_wand_set_item', async function() {
            const setFolder = String($(this).data('set-folder') || '');
            const setName = $(this).data('set-name');
            
            const currentMessage = getLastCharacterMessage();
            const characterId = getFolderNameByMessage(currentMessage);
            
            if (characterId) {
                setCharacterExpressionSet(characterId, setFolder);
                clearSpriteCache();
                saveSettingsDebounced();
                
                // Refresh the character assignments UI
                renderCharacterAssignments();
                
                // Dispatch event to trigger refresh
                dispatchExpressionSetChanged(characterId, setFolder);
                
                // Show toast
                /** @type {any} */
                const toast = window.toastr;
                toast.success(`Expression set changed to: ${setName}`);
            }
            
            dropdown.fadeOut(200);
        });

        console.debug('Expressions+: Wand menu button added');
    } catch (error) {
        console.error('Expressions+: Failed to add wand button:', error);
    }
}

/**
 * Loads available expression sets into the wand dropdown
 */
function loadWandDropdownSets() {
    const dropdown = $('#expressions_plus_wand_dropdown ul');
    const currentMessage = getLastCharacterMessage();
    const characterId = getFolderNameByMessage(currentMessage);
    
    if (!characterId) {
        dropdown.html('<span>Switch expression set to:</span><li class="list-group-item">No character selected</li>');
        return;
    }
    
    try {
        // getExpressionSets is now synchronous - reads from settings
        const sets = getExpressionSets(characterId);
        const currentSet = getCharacterExpressionSet(characterId);
        
        let html = '<span>Switch expression set to:</span>';
        
        if (sets.length === 0) {
            html += '<li class="list-group-item">No expression sets configured</li>';
        } else {
            for (const set of sets) {
                const isActive = set.folder === currentSet;
                const activeClass = isActive ? 'expressions_plus_wand_set_active' : '';
                const activeIcon = isActive ? '<i class="fa-solid fa-check"></i> ' : '';
                html += `<li class="list-group-item expressions_plus_wand_set_item ${activeClass}" data-set-folder="${set.folder}" data-set-name="${set.name}">${activeIcon}${set.name}</li>`;
            }
        }
        
        dropdown.html(html);
    } catch (error) {
        console.error('Expressions+: Error loading expression sets:', error);
        dropdown.html('<span>Switch expression set to:</span><li class="list-group-item">Error loading sets</li>');
    }
}

function addExpressionImage() {
    const html = `
        <div id="expression-plus-wrapper">
            <div id="expression-plus-holder" class="expression-plus-holder" style="display:none;">
                <div id="expression-plus-holderheader" class="fa-solid fa-grip drag-grabber"></div>
                <img id="expression-plus-image" class="expression-plus">
            </div>
        </div>`;
    $('body').append(html);
    loadMovingUIState();
}

function addVisualNovelMode() {
    const html = `<div id="visual-novel-plus-wrapper"></div>`;
    const element = $(html);
    element.hide();
    $('body').append(element);
}

// ============================================================================
// Main Initialization
// ============================================================================

(async function () {
    migrateSettings();
    addExpressionImage();
    addVisualNovelMode();
    await addSettings();
    await addWandButton();
    registerSlashCommands();
    
    const wrapper = new ModuleWorkerWrapper(moduleWorker);
    const updateFunction = wrapper.update.bind(wrapper);
    setInterval(updateFunction, UPDATE_INTERVAL);
    moduleWorker();
    
    dragElement($('#expression-plus-holder'));
    
    eventSource.on(event_types.CHAT_CHANGED, () => {
        removeExpression();
        clearSpriteCache();
        clearExpressionSetsCache();
        Object.keys(lastExpression).forEach(k => delete lastExpression[k]);

        let imgElement = document.getElementById('expression-plus-image');
        if (imgElement && imgElement instanceof HTMLImageElement) {
            imgElement.src = '';
        }

        if (isVisualNovelMode()) {
            $('#visual-novel-plus-wrapper').empty();
        }

        // Refresh character assignments
        renderCharacterAssignments();

        updateFunction({ newChat: true });
    });

    eventSource.on(event_types.MOVABLE_PANELS_RESET, updateVisualNovelModeDebounced);
    eventSource.on(event_types.GROUP_UPDATED, updateVisualNovelModeDebounced);

    // Listen for expression set changes to refresh the sprite immediately
    window.addEventListener('expressionSetChanged', async (event) => {
        const { characterId, expressionSet } = /** @type {CustomEvent} */ (event).detail;
        console.debug('Expressions+: Expression set changed', { characterId, expressionSet });
        
        // Get the last known expression for this character to re-display it with the new set
        const baseCharacterName = characterId.split('/')[0];
        const currentExpression = lastExpression[baseCharacterName] || 'neutral';
        
        // Build the new sprite folder name with the expression set
        const spriteFolderName = expressionSet 
            ? `${characterId}/${expressionSet}`
            : characterId;
        
        // Force refresh the sprite
        await sendExpressionCall(spriteFolderName, currentExpression, { force: true });
    });

    console.log('Expressions+ extension loaded');
})();
