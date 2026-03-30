import { eventSource, event_types, saveSettingsDebounced } from '../../../../script.js';
import { dragElement, isMobile } from '../../../RossAscends-mods.js';
import { ModuleWorkerWrapper, renderExtensionTemplateAsync, getContext } from '../../../extensions.js';
import { power_user } from '../../../power-user.js';

import {
    saveCurrentCharacterLayout,
    restoreCharacterLayout,
    clearHolderMovingUIState,
    onHolderResized,
    resetAllCharacterLayouts,
} from './src/sprite-layout.js';

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
    setLastClassificationScores,
    setLastMessage,
    clearExpressionSetsCache,
    clearFolderProfileCache,
    clearSegmentState,
    currentCharacterAvatar,
    setCurrentCharacterAvatar,
} from './src/state.js';

import {
    getSettings,
    migrateSettings,
} from './src/settings.js';

import {
    getClassificationScores,
    getExpressionLabel,
    classifyMessageSegments,
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
    getSpriteFolderName,
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
    setOnFolderProfileUpdatedFn as setWorkerOnFolderProfileUpdatedFn,
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
    setGetExpressionsListFn as setHandlersGetExpressionsListFn,
    initLowConfidenceSettings,
} from './src/ui-handlers.js';

import {
    renderProfileSelector,
    onClickCreateProfile,
    onClickDeleteProfile,
    onClickExportProfile,
    onClickExportProfileForFolder,
    onClickImportProfile,
    onClickEditProfile,
    setRenderRulesListFn as setProfilesRenderRulesListFn,
} from './src/ui-profiles.js';

import {
    renderRulesList,
    updateFolderProfileNotice,
    onClickAddRule,
    onClickEditRule,
    onClickDeleteRule,
    onClickSortRulesAsc,
    onClickSortRulesDesc,
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

import {
    initAnalyticsDialog,
    initAnalyticsSettings,
} from './src/ui-analytics.js';

import {
    exportCurrentFolder,
    exportSpritePack,
    importSpritePack,
    checkAndReconstructSpritePack,
    setValidateImagesFn as setSpritePackValidateImagesFn,
    setRenderCharacterAssignmentsFn as setSpritePackRenderCharacterAssignmentsFn,
} from './src/sprite-pack.js';

import { initFilterSettings } from './src/ui-filters.js';
import { initScenarioSettings } from './src/ui-scenario.js';

import {
    setSendExpressionCallFn as setCarouselSendExpressionCallFn,
    setGetSpriteFolderNameFn as setCarouselGetSpriteFolderNameFn,
    setCarouselUpdateInsightPanelFn,
    setCarouselSetLastClassificationScoresFn,
    clearAllCarousels,
} from './src/segment-carousel.js';

export { MODULE_NAME };

export { lastExpression };

export { getClassificationScores, getExpressionLabel, classifyMessageSegments, sendExpressionCall, getExpressionsList, getCachedExpressions };

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
setWorkerOnFolderProfileUpdatedFn(() => updateFolderProfileNotice());

// Wire up ui-handlers.js dependencies
setHandlersValidateImagesFn(validateImages);
setHandlersRenderRulesListFn(() => renderRulesList());
setHandlersGetExpressionsListFn(() => getExpressionsList());

// Wire up ui-profiles.js dependencies
setProfilesRenderRulesListFn(() => renderRulesList());

// Wire up ui-rules.js dependencies
setRulesGetExpressionsListFn(() => getExpressionsList());

// Wire up slash-commands.js dependencies
setSlashGetExpressionLabelFn(getExpressionLabel);
setRenderProfileSelectorFn(renderProfileSelector);
setSlashRenderRulesListFn(() => renderRulesList());
setSlashRenderCharacterAssignmentsFn(() => renderCharacterAssignments());

// Wire up sprite-pack.js dependencies
setSpritePackValidateImagesFn(validateImages);
setSpritePackRenderCharacterAssignmentsFn(() => renderCharacterAssignments());

// Wire up segment-carousel.js dependencies
setCarouselSendExpressionCallFn(sendExpressionCall);
setCarouselGetSpriteFolderNameFn(getSpriteFolderName);
setCarouselUpdateInsightPanelFn((scores) => updateInsightPanel(scores));
setCarouselSetLastClassificationScoresFn(setLastClassificationScores);

// ============================================================================
// Fallback Expression Picker
// ============================================================================

async function renderFallbackExpressionPicker() {
    const settings = getSettings();
    const expressions = await getExpressionsList();
    const picker = $('#expressions_plus_fallback');
    
    picker.empty();
    picker.append(`<option value="${OPTION_NO_FALLBACK}">[ No fallback ]</option>`);
    picker.append(`<option value="${OPTION_EMOJI_FALLBACK}">[ Default+ smileys ]</option>`);
    
    expressions.forEach(expression => {
        const selected = expression === settings.fallback_expression ? 'selected' : '';
        picker.append(`<option value="${expression}" ${selected}>${expression}</option>`);
    });

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
    initInsightPanel();

    // Add segment carousel panel to page
    const carouselPanelHtml = await renderExtensionTemplateAsync(MODULE_NAME, 'templates/carousel-panel');
    $('body').append(carouselPanelHtml);
    $('#expressions_plus_carousel_panel').hide();
    dragElement($('#expressions_plus_carousel_panel'));

    // Restore saved panel positions from movingUI state (panels load after ST's loadMovingUIState runs)
    // Only restore top/left/margin — skip bottom/right/width/height to avoid pinning or collapsing
    if (!isMobile() && power_user.movingUI && power_user.movingUIState) {
        for (const panelId of ['expressions_plus_insight_panel', 'expressions_plus_carousel_panel']) {
            const saved = power_user.movingUIState[panelId];
            if (saved) {
                /** @type {Record<string, string>} */
                const posOnly = {};
                if (saved.top !== undefined) posOnly.top = saved.top;
                if (saved.left !== undefined) posOnly.left = saved.left;
                if (saved.margin !== undefined) posOnly.margin = saved.margin;
                $(`#${panelId}`).css(posOnly);
            }
        }
    }

    // Bind event handlers
    const settings = getSettings();
    
    $('#expressions_plus_translate').prop('checked', settings.translate).on('change', function() {
        settings.translate = $(this).prop('checked');
        saveSettingsDebounced();
        setLastMessage(null);
    });
    
    $('#expressions_plus_allow_multiple').prop('checked', settings.allowMultiple).on('change', function() {
        settings.allowMultiple = $(this).prop('checked');
        saveSettingsDebounced();
    });
    
    $('#expressions_plus_reroll').prop('checked', settings.rerollIfSame).on('change', function() {
        settings.rerollIfSame = $(this).prop('checked');
        saveSettingsDebounced();
    });
    
    $('#expressions_plus_prioritize_folder_profiles').prop('checked', settings.prioritizeFolderProfiles).on('change', function() {
        settings.prioritizeFolderProfiles = $(this).prop('checked');
        clearFolderProfileCache();
        saveSettingsDebounced();
        renderRulesList();
    });
    
    $('#expressions_plus_fallback').on('change', onFallbackChanged);
    $('#expressions_plus_profile_select').on('change', onProfileChanged);
    
    $('#expressions_plus_profile_create').on('click', onClickCreateProfile);
    $('#expressions_plus_profile_edit').on('click', onClickEditProfile);
    $('#expressions_plus_profile_delete').on('click', onClickDeleteProfile);
    $('#expressions_plus_profile_export').on('click', onClickExportProfile);
    $('#expressions_plus_profile_export_folder').on('click', onClickExportProfileForFolder);
    $('#expressions_plus_profile_import').on('click', onClickImportProfile);
    
    $('#expressions_plus_add_rule').on('click', onClickAddRule);
    $('#expressions_plus_sort_rules_asc').on('click', onClickSortRulesAsc);
    $('#expressions_plus_sort_rules_desc').on('click', onClickSortRulesDesc);
    $(document).on('click', '.rule_edit_btn', onClickEditRule);
    $(document).on('click', '.rule_delete_btn', onClickDeleteRule);
    
    $(document).on('change', '.character_profile_select', onCharacterProfileChanged);
    $(document).on('change', '.character_expression_set_select', onCharacterExpressionSetChanged);
    $(document).on('click', '.expression_set_add', onExpressionSetAdd);
    $(document).on('click', '.expression_set_remove', onExpressionSetRemove);
    
    const insightModeEnabled = settings.insightMode ?? settings.debugMode ?? false;
    $('#expressions_plus_insight_toggle').prop('checked', insightModeEnabled).on('change', toggleInsightPanel);
    setInsightPanelVisible(insightModeEnabled);
    $('#expressions_plus_insight_panel').toggle(insightPanelVisible);
    
    $('.expressions_plus_settings').on('click', '.section_toggle', function() {
        $(this).next('.section_content').slideToggle();
        $(this).find('i').toggleClass('fa-chevron-down fa-chevron-up');
    });

    $(document).on('click', '.expression_plus_list_item', onClickExpressionImage);
    $(document).on('click', '.expression_plus_list_upload', onClickExpressionUpload);
    $(document).on('click', '.expression_plus_list_delete', onClickExpressionDelete);

    $('#expressions_plus_export_folder').on('click', exportCurrentFolder);
    $('#expressions_plus_export_all').on('click', exportSpritePack);
    $('#expressions_plus_import_sprites').on('click', importSpritePack);

    await renderFallbackExpressionPicker();
    renderProfileSelector();
    renderRulesList();
    renderCharacterAssignments();
    
    await initLowConfidenceSettings();
    
    initAnalyticsSettings();
    await initAnalyticsDialog();

    // Initialize text preprocessing / filter settings (v0.4.0)
    initFilterSettings();

    // Initialize scenario (multi-character) chat settings (v0.4.0)
    initScenarioSettings();
}

// ============================================================================
// Wand Menu Integration
// ============================================================================

/**
 * Adds the expression set button to the wand menu
 */
async function addWandButton() {
    try {
        const extensionsMenu = $('#extensionsMenu');
        if (extensionsMenu.length === 0) {
            console.debug('Expressions+: Wand menu not found, skipping wand integration');
            return;
        }

        const buttonHtml = await renderExtensionTemplateAsync(MODULE_NAME, 'templates/wand-button');
        const dropdownHtml = await renderExtensionTemplateAsync(MODULE_NAME, 'templates/wand-dropdown');

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

        // Close dropdown when clicking outside — only bound while dropdown is visible
        const closeDropdown = (e) => {
            if (!$(e.target).closest('#expressions_plus_wand, #expressions_plus_wand_dropdown').length) {
                dropdown.fadeOut(200, () => $(document).off('click.wandClose'));
            }
        };

        button.on('click', async function(e) {
            e.preventDefault();
            e.stopPropagation();

            if (dropdown.is(':visible')) {
                dropdown.fadeOut(200, () => $(document).off('click.wandClose'));
                return;
            }

            const buttonPos = button.offset();
            dropdown.css({
                position: 'absolute',
                left: buttonPos.left,
                bottom: $(window).height() - buttonPos.top + 5,
            });

            loadWandDropdownSets();
            dropdown.fadeIn(200);
            $(document).on('click.wandClose', closeDropdown);
        });

        $(document).on('click', '.expressions_plus_wand_set_item', async function() {
            const setFolder = String($(this).data('set-folder') || '');
            const setName = $(this).data('set-name');
            
            const currentMessage = getLastCharacterMessage();
            const characterId = getFolderNameByMessage(currentMessage);
            
            if (characterId) {
                setCharacterExpressionSet(characterId, setFolder);
                clearSpriteCache();
                saveSettingsDebounced();
                renderCharacterAssignments();
                dispatchExpressionSetChanged(characterId, setFolder);
                
                // Show toast
                /** @type {any} */
                const toast = window.toastr;
                toast.success(`Expression set changed to: ${setName}`);
            }
            
            dropdown.fadeOut(200, () => $(document).off('click.wandClose'));
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
    // Per-character layout is restored in CHAT_CHANGED handler via restoreCharacterLayout()
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
    await migrateSettings();
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

    // Clear stale bottom/right that dragElement may set during initialization
    // These cause panels to get pinned with fixed lower bounds on reload
    for (const selector of ['#expression-plus-holder', '#expressions_plus_insight_panel', '#expressions_plus_carousel_panel']) {
        $(selector).css({ bottom: '', right: '' });
    }

    // Save per-character layout after drag ends on the single-sprite holder
    $(document).on('mouseup', '#expression-plus-holderheader', () => {
        saveCurrentCharacterLayout();
    });

    eventSource.on(event_types.CHAT_CHANGED, () => {
        // Save outgoing character's layout before clearing
        saveCurrentCharacterLayout();
        clearHolderMovingUIState();

        removeExpression();
        clearSpriteCache();
        clearExpressionSetsCache();
        clearFolderProfileCache();
        clearSegmentState();
        clearAllCarousels();
        Object.keys(lastExpression).forEach(k => delete lastExpression[k]);

        let imgElement = document.getElementById('expression-plus-image');
        if (imgElement && imgElement instanceof HTMLImageElement) {
            imgElement.src = '';
        }

        if (isVisualNovelMode()) {
            $('#visual-novel-plus-wrapper').empty();
        }

        // Determine the new character's avatar key for layout restoration
        const context = getContext();
        let newAvatarKey = null;
        if (!context.groupId && context.characterId !== undefined) {
            const char = context.characters?.[context.characterId];
            if (char?.avatar) {
                newAvatarKey = char.avatar.replace(/\.[^/.]+$/, '');
            }
        }
        setCurrentCharacterAvatar(newAvatarKey);
        restoreCharacterLayout(newAvatarKey);

        // Re-initialize dragElement to reset its closured height/width variables.
        // Without this, elementDrag() applies the previous character's dimensions on first drag.
        dragElement($('#expression-plus-holder'));

        renderCharacterAssignments();

        // Check for sprite pack manifest and reconstruct if needed (fire-and-forget)
        checkAndReconstructSpritePack().then(reconstructed => {
            if (reconstructed) {
                renderCharacterAssignments();
                updateFunction({ newChat: true });
            }
        }).catch(err => console.error('Expressions+: Reconstruction error:', err));

        updateFunction({ newChat: true });
    });

    eventSource.on(event_types.MOVABLE_PANELS_RESET, () => {
        // Wipe all per-character saved layouts
        resetAllCharacterLayouts();

        // Clear inline styles on our draggable panels so CSS defaults take over
        for (const selector of ['#expression-plus-holder', '#expressions_plus_insight_panel', '#expressions_plus_carousel_panel']) {
            const el = $(selector)[0];
            if (!el) continue;
            $(el).css({ top: '', left: '', right: '', bottom: '', height: '', width: '', margin: '', minWidth: '', minHeight: '' });
            // Reset browser resize tracking
            el.style.resize = 'none';
            void el.offsetHeight;
            el.style.resize = '';
        }

        // Clear inline styles on any VN/scenario holders currently in the DOM
        $('#visual-novel-plus-wrapper .expression-plus-holder').each((_, el) => {
            $(el).css({ top: '', left: '', right: '', bottom: '', height: '', width: '', margin: '', minWidth: '', minHeight: '' });
            $(el).data('dragged', false);
            // Reset browser resize tracking
            el.style.resize = 'none';
            void el.offsetHeight;
            el.style.resize = '';
        });

        // Re-lay out VN group sprites with fresh positions
        updateVisualNovelModeDebounced();
    });
    eventSource.on(event_types.GROUP_UPDATED, updateVisualNovelModeDebounced);

    window.addEventListener('expressionSetChanged', async (event) => {
        const { characterId, expressionSet } = /** @type {CustomEvent} */ (event).detail;
        console.debug('Expressions+: Expression set changed', { characterId, expressionSet });
        const baseCharacterName = characterId.split('/')[0];
        const currentExpression = lastExpression[baseCharacterName] || 'neutral';
        const spriteFolderName = expressionSet 
            ? `${characterId}/${expressionSet}`
            : characterId;
        await sendExpressionCall(spriteFolderName, currentExpression, { force: true });
    });

    // Listen for resize events from dragElement to save per-character layout
    eventSource.on('resizeUI', (elementId) => {
        onHolderResized(elementId);
    });

    console.log('Expressions+ extension loaded');
})();
