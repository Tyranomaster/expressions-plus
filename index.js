/**
 * Expressions+ Extension
 * Advanced expression system with customizable emotion rules, profiles, and complex emotion detection.
 */

/* global toastr */

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

import { Fuse } from '../../../../lib.js';
import { characters, eventSource, event_types, generateQuietPrompt, generateRaw, getRequestHeaders, online_status, saveSettingsDebounced, substituteParams, substituteParamsExtended, system_message_types, this_chid } from '../../../../script.js';
import { dragElement, isMobile } from '../../../RossAscends-mods.js';
import { getContext, getApiUrl, modules, extension_settings, ModuleWorkerWrapper, doExtrasFetch, renderExtensionTemplateAsync } from '../../../extensions.js';
import { loadMovingUIState, power_user } from '../../../power-user.js';
import { onlyUnique, debounce, getCharaFilename, trimToEndSentence, trimToStartSentence, waitUntilCondition, findChar, isFalseBoolean } from '../../../utils.js';
import { hideMutedSprites, selected_group } from '../../../group-chats.js';
import { isJsonSchemaSupported } from '../../../textgen-settings.js';
import { debounce_timeout } from '../../../constants.js';
import { SlashCommandParser } from '../../../slash-commands/SlashCommandParser.js';
import { SlashCommand } from '../../../slash-commands/SlashCommand.js';
import { ARGUMENT_TYPE, SlashCommandArgument, SlashCommandNamedArgument } from '../../../slash-commands/SlashCommandArgument.js';
import { SlashCommandEnumValue, enumTypes } from '../../../slash-commands/SlashCommandEnumValue.js';
import { commonEnumProviders } from '../../../slash-commands/SlashCommandCommonEnumsProvider.js';
import { slashCommandReturnHelper } from '../../../slash-commands/SlashCommandReturnHelper.js';
import { generateWebLlmChatPrompt, isWebLlmSupported } from '../../shared.js';
import { Popup, POPUP_RESULT } from '../../../popup.js';
import { t } from '../../../i18n.js';
import { removeReasoningFromString } from '../../../reasoning.js';

// Import from local modules
import {
    MODULE_NAME,
    SETTINGS_KEY,
    UPDATE_INTERVAL,
    STREAMING_UPDATE_INTERVAL,
    DEFAULT_FALLBACK_EXPRESSION,
    DEFAULT_LLM_PROMPT,
    DEFAULT_EXPRESSIONS,
    OPTION_NO_FALLBACK,
    OPTION_EMOJI_FALLBACK,
    RESET_SPRITE_LABEL,
    DEFAULT_PROFILE_NAME,
    EXPRESSION_API,
    PROMPT_TYPE,
    RULE_TYPE,
} from './src/constants.js';

import {
    expressionsList,
    lastCharacter,
    lastMessage,
    spriteCache,
    inApiCall,
    lastServerResponseTime,
    lastExpression,
    lastClassificationScores,
    insightPanelVisible,
    setExpressionsList,
    setLastCharacter,
    setLastMessage,
    setSpriteCache,
    clearSpriteCache,
    setInApiCall,
    setLastServerResponseTime,
    setLastExpressionForCharacter,
    setLastClassificationScores,
    setInsightPanelVisible,
} from './src/state.js';

import {
    getDefaultSettings,
    createDefaultProfile,
    getSettings,
    migrateSettings,
} from './src/settings.js';

import {
    getProfiles,
    getProfileById,
    getActiveProfile,
    createProfile,
    deleteProfile,
    exportProfile,
    importProfile,
} from './src/profiles.js';

import {
    validateRuleName,
    createRule,
    updateRule,
    deleteRule,
} from './src/rules.js';

import {
    evaluateRule,
    selectExpression,
} from './src/classification.js';

import {
    getClassificationScores,
    getExpressionLabel,
    onTextGenSettingsReady,
    setGetExpressionsListFn as setApiGetExpressionsListFn,
    setUpdateInsightPanelFn,
} from './src/api.js';

import {
    getPlaceholderImage,
    isVisualNovelMode,
    forceUpdateVisualNovelMode,
    updateVisualNovelModeDebounced,
    getExpressionImageData,
    getSpritesList,
    chooseSpriteForExpression,
    getSpriteFolderName,
    getFolderNameByMessage,
    getLastCharacterMessage,
    validateImages as validateImagesBase,
    drawSpritesList as drawSpritesListBase,
    createListItemHtml,
    setGetExpressionsListFn as setSpritesGetExpressionsListFn,
    setUpdateVisualNovelModeFn as setSpritesUpdateVisualNovelModeFn,
} from './src/sprites.js';

import {
    removeExpression,
    setImage,
    setDefaultEmojiForImage,
    setNoneForImage,
    setExpression,
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
    onApiChanged,
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
} from './src/ui-character-assignments.js';

import {
    registerSlashCommands,
    setGetExpressionLabelFn as setSlashGetExpressionLabelFn,
    setRenderProfileSelectorFn,
    setRenderRulesListFn as setSlashRenderRulesListFn,
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
setApiGetExpressionsListFn(() => getExpressionsList());
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

// ============================================================================
// Type Definitions (imported from constants.js, kept here for reference)
// ============================================================================

/**
 * @typedef {Object} EmotionScore
 * @property {string} label - The emotion label
 * @property {number} score - The emotion score (0-1)
 */

/**
 * @typedef {Object} RuleCondition
 * @property {string} emotion - The emotion label to check
 * @property {number} [minScore] - Minimum score threshold
 * @property {number} [maxScore] - Maximum score threshold
 */

/**
 * @typedef {Object} ExpressionRule
 * @property {string} id - Unique identifier for the rule
 * @property {string} name - Display name / sprite name for this expression
 * @property {RULE_TYPE} type - The type of rule
 * @property {RuleCondition[]} conditions - Array of conditions that must be met
 * @property {boolean} [enabled=true] - Whether this rule is active
 * @property {number} [maxDifference] - Max % difference between conditions (for near-equal)
 */

/**
 * @typedef {Object} ExpressionProfile
 * @property {string} id - Unique identifier for the profile
 * @property {string} name - Display name for the profile
 * @property {ExpressionRule[]} rules - Array of custom expression rules
 * @property {string} fallbackExpression - Fallback expression if no rules match
 * @property {boolean} [isDefault=false] - Whether this is the default profile
 */

/**
 * @typedef {Object} CharacterProfileAssignment
 * @property {string} characterId - Character avatar filename (without extension)
 * @property {string} profileId - Profile ID assigned to this character
 */

/**
 * @typedef {Object} Expression
 * @property {string} label - The label of the expression
 * @property {ExpressionImage[]} files - One or more images to represent this expression
 */

/**
 * @typedef {Object} ExpressionImage
 * @property {string} expression - The expression label
 * @property {boolean} [isCustom=false] - If the expression is added by user
 * @property {string} fileName - The filename with extension
 * @property {string} title - The title for the image
 * @property {string} imageSrc - The image source / full path
 * @property {'success' | 'additional' | 'failure' | 'default'} type - The type of the image
 */

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
    
    $('#expressions_plus_api').val(settings.api).on('change', onApiChanged);
    
    $('#expressions_plus_llm_prompt').val(settings.llmPrompt).on('input', function() {
        settings.llmPrompt = $(this).val();
        saveSettingsDebounced();
    });
    
    $(`input[name="expressions_plus_prompt_type"][value="${settings.promptType}"]`).prop('checked', true);
    $('input[name="expressions_plus_prompt_type"]').on('change', function() {
        settings.promptType = $(this).val();
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

    // Show/hide LLM options based on API
    $('.expressions_plus_llm_prompt_block').toggle([EXPRESSION_API.llm, EXPRESSION_API.webllm].includes(settings.api));
    $('.expressions_plus_prompt_type_block').toggle(settings.api === EXPRESSION_API.llm);

    // Initialize UI
    await renderFallbackExpressionPicker();
    renderProfileSelector();
    renderRulesList();
    renderCharacterAssignments();
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
    registerSlashCommands();
    
    const wrapper = new ModuleWorkerWrapper(moduleWorker);
    const updateFunction = wrapper.update.bind(wrapper);
    setInterval(updateFunction, UPDATE_INTERVAL);
    moduleWorker();
    
    dragElement($('#expression-plus-holder'));
    
    eventSource.on(event_types.CHAT_CHANGED, () => {
        removeExpression();
        clearSpriteCache();
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

    console.log('Expressions+ extension loaded');
})();
