/**
 * Rules UI for Expressions+
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

import { Popup, POPUP_RESULT } from '../../../../popup.js';

import { RULE_TYPE } from './constants.js';
import { getActiveProfile, getCachedFolderProfile } from './profiles.js';
import { currentSpriteFolderName } from './state.js';
import { createRule, updateRule, deleteRule, moveRule, sortRules } from './rules.js';
let getExpressionsList = null;

/**
 * Sets the getExpressionsList function reference
 * @param {Function} fn 
 */
export function setGetExpressionsListFn(fn) {
    getExpressionsList = fn;
}

// ============================================================================
// Rules UI
// ============================================================================

/**
 * Updates the folder profile notice banner without re-rendering the full rules list.
 * Called by the module worker after fetching/caching a folder profile.
 */
export function updateFolderProfileNotice() {
    const folderProfile = getCachedFolderProfile(currentSpriteFolderName);
    const notice = $('#expressions_plus_folder_profile_notice');
    if (folderProfile) {
        $('#expressions_plus_folder_profile_name').text(`Using folder profile: "${folderProfile.name}"`);
        notice.show();
    } else {
        notice.hide();
    }
}

/**
 * Renders the rules list
 */
export function renderRulesList() {
    const profile = getActiveProfile();
    const container = $('#expressions_plus_rules_list');
    container.empty();
    updateFolderProfileNotice();

    const isReadonly = profile.isDefault === true;

    // Toggle add/sort buttons based on readonly state
    const addBtn = $('#expressions_plus_add_rule');
    const sortAscBtn = $('#expressions_plus_sort_rules_asc');
    const sortDescBtn = $('#expressions_plus_sort_rules_desc');

    if (isReadonly) {
        addBtn.addClass('disabled').attr('title', 'Cannot modify a built-in profile');
        sortAscBtn.addClass('disabled').attr('title', 'Cannot modify a built-in profile');
        sortDescBtn.addClass('disabled').attr('title', 'Cannot modify a built-in profile');
    } else {
        addBtn.removeClass('disabled').attr('title', '');
        sortAscBtn.removeClass('disabled').attr('title', 'Sort A → Z');
        sortDescBtn.removeClass('disabled').attr('title', 'Sort Z → A');
    }

    if (isReadonly) {
        container.append('<div class="readonly_profile_notice"><i class="fa-solid fa-lock"></i> This is a built-in profile. To add or modify rules, create a new profile based on this one.</div>');
    }

    const customRules = profile.rules.filter(r => r.type !== RULE_TYPE.SIMPLE && r.type !== 'simple');
    const baseRules = profile.rules.filter(r => r.type === RULE_TYPE.SIMPLE || r.type === 'simple');

    if (customRules.length === 0) {
        if (!isReadonly) {
            container.append('<div class="rules_empty_message">No custom expression rules defined.<br>Click "Add Rule" to create one.</div>');
        }
    } else {
        customRules.forEach(rule => {
            container.append(createRuleItemHtml(rule, isReadonly));
        });
        if (!isReadonly) {
            initRuleDragAndDrop();
        }
    }

    $('#expressions_plus_base_rules_count').text(`${baseRules.length} base expressions active`);
}

/**
 * Creates HTML for a rule list item
 * @param {Object} rule 
 * @returns {string}
 */
function createRuleItemHtml(rule, isReadonly = false) {
    const typeLabels = {
        [RULE_TYPE.SIMPLE]: 'Simple',
        [RULE_TYPE.RANGE]: 'Range',
        [RULE_TYPE.COMBINATION]: 'Combination',
        // Legacy types
        'threshold_high': 'High',
        'threshold_low': 'Low', 
        'threshold_range': 'Range',
        'combination_near_equal': 'Combination',
        'combination_all_high': 'Combination',
    };

    // Create a summary of conditions for display
    const conditionsSummary = rule.conditions.map(c => {
        let text = c.emotion;
        if (rule.type === RULE_TYPE.RANGE || rule.type === 'threshold_high' || rule.type === 'threshold_low' || rule.type === 'threshold_range') {
            const parts = [];
            if (c.minEnabled || c.minScore !== undefined) {
                const minVal = ((c.minScore ?? 0) * 100).toFixed(0);
                const minOp = c.minInclusive !== false ? '≤' : '<';
                parts.push(`${minVal}%${minOp}`);
            }
            parts.push(c.emotion);
            if (c.maxEnabled || c.maxScore !== undefined) {
                const maxVal = ((c.maxScore ?? 1) * 100).toFixed(0);
                const maxOp = c.maxInclusive === true ? '≤' : '<';
                parts.push(`${maxOp}${maxVal}%`);
            }
            return parts.join('');
        }
        return text;
    }).join(' + ');

    const actionsHtml = isReadonly ? '' : `
            <div class="rule_actions">
                <button class="menu_button rule_edit_btn" title="Edit">
                    <i class="fa-solid fa-pencil"></i>
                </button>
                <button class="menu_button rule_delete_btn" title="Delete">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>`;

    const dragHandleHtml = isReadonly ? '' : `
            <span class="rule_drag_handle" title="Drag to reorder">
                <i class="fa-solid fa-grip-vertical"></i>
            </span>`;

    return `
        <div class="rule_item" data-rule-id="${rule.id}" ${isReadonly ? '' : 'draggable="true"'}>
            ${dragHandleHtml}
            <span class="rule_name">${rule.name}</span>
            <span class="rule_type_badge" data-type="${rule.type}">${typeLabels[rule.type] || rule.type}</span>
            <span class="rule_conditions_summary" title="${conditionsSummary}">${conditionsSummary}</span>
            ${actionsHtml}
        </div>
    `;
}

// ============================================================================
// Rule Drag & Drop Reordering
// ============================================================================

/** @type {HTMLElement|null} */
let draggedRuleEl = null;

/**
 * Initializes drag-and-drop on the rule items in the list
 */
function initRuleDragAndDrop() {
    const container = document.getElementById('expressions_plus_rules_list');
    if (!container) return;

    container.querySelectorAll('.rule_item[draggable]').forEach(item => {
        item.addEventListener('dragstart', onRuleDragStart);
        item.addEventListener('dragend', onRuleDragEnd);
        item.addEventListener('dragover', onRuleDragOver);
        item.addEventListener('dragenter', onRuleDragEnter);
        item.addEventListener('dragleave', onRuleDragLeave);
        item.addEventListener('drop', onRuleDrop);
    });
}

/** @param {DragEvent} e */
function onRuleDragStart(e) {
    draggedRuleEl = /** @type {HTMLElement} */ (e.currentTarget);
    draggedRuleEl.classList.add('rule_dragging');
    if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', draggedRuleEl.dataset.ruleId || '');
    }
}

/** @param {DragEvent} e */
function onRuleDragEnd(e) {
    const el = /** @type {HTMLElement} */ (e.currentTarget);
    el.classList.remove('rule_dragging');
    document.querySelectorAll('.rule_drag_over').forEach(el => el.classList.remove('rule_drag_over'));
    draggedRuleEl = null;
}

/** @param {DragEvent} e */
function onRuleDragOver(e) {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
}

/** @param {DragEvent} e */
function onRuleDragEnter(e) {
    e.preventDefault();
    const target = /** @type {HTMLElement} */ (e.currentTarget);
    if (target !== draggedRuleEl) {
        target.classList.add('rule_drag_over');
    }
}

/** @param {DragEvent} e */
function onRuleDragLeave(e) {
    const target = /** @type {HTMLElement} */ (e.currentTarget);
    target.classList.remove('rule_drag_over');
}

/** @param {DragEvent} e */
function onRuleDrop(e) {
    e.preventDefault();
    const target = /** @type {HTMLElement} */ (e.currentTarget);
    target.classList.remove('rule_drag_over');

    if (!draggedRuleEl || target === draggedRuleEl) return;

    const profile = getActiveProfile();
    if (profile.isDefault) return;

    const draggedId = draggedRuleEl.dataset.ruleId;
    const targetId = target.dataset.ruleId;
    if (!draggedId || !targetId) return;
    const targetIndex = profile.rules.findIndex(r => r.id === targetId);
    if (targetIndex === -1) return;

    if (moveRule(profile.id, draggedId, targetIndex)) {
        renderRulesList();
    }
}

/**
 * Handles clicking sort rules A-Z
 */
export function onClickSortRulesAsc() {
    const profile = getActiveProfile();
    if (profile.isDefault) {
        toast.warning('Cannot modify a built-in profile. Create a new profile to reorder rules.');
        return;
    }
    if (sortRules(profile.id, 'asc')) {
        renderRulesList();
        toast.success('Rules sorted A → Z');
    }
}

/**
 * Handles clicking sort rules Z-A
 */
export function onClickSortRulesDesc() {
    const profile = getActiveProfile();
    if (profile.isDefault) {
        toast.warning('Cannot modify a built-in profile. Create a new profile to reorder rules.');
        return;
    }
    if (sortRules(profile.id, 'desc')) {
        renderRulesList();
        toast.success('Rules sorted Z → A');
    }
}

/**
 * Handles clicking add rule button
 */
export async function onClickAddRule() {
    const profile = getActiveProfile();
    if (profile.isDefault) {
        toast.warning('Cannot add rules to a built-in profile. Create a new profile based on this one to add custom rules.');
        return;
    }
    await showRuleEditor(null);
}

/**
 * Handles clicking edit rule button
 */
export async function onClickEditRule() {
    const profile = getActiveProfile();
    if (profile.isDefault) {
        toast.warning('Cannot edit rules in a built-in profile. Create a new profile based on this one to modify rules.');
        return;
    }
    const ruleId = $(this).closest('.rule_item').data('rule-id');
    await showRuleEditor(ruleId);
}

/**
 * Handles clicking delete rule button
 */
export async function onClickDeleteRule() {
    const profile = getActiveProfile();
    if (profile.isDefault) {
        toast.warning('Cannot delete rules from a built-in profile. Create a new profile based on this one to modify rules.');
        return;
    }
    const ruleItem = $(this).closest('.rule_item');
    const ruleId = ruleItem.data('rule-id');
    const rule = profile.rules.find(r => r.id === ruleId);
    
    if (!rule) return;

    const confirmation = await Popup.show.confirm(
        'Delete Rule',
        `Are you sure you want to delete the rule "${rule.name}"?`
    );
    
    if (!confirmation) return;

    if (deleteRule(profile.id, ruleId)) {
        renderRulesList();
        toast.success(`Rule "${rule.name}" deleted`);
    }
}

// ============================================================================
// Rule Editor Modal
// ============================================================================

/**
 * Shows the rule editor modal
 * @param {string|null} ruleId - Rule ID to edit, or null for new rule
 */
async function showRuleEditor(ruleId) {
    try {
        const profile = getActiveProfile();
        const rule = ruleId ? profile.rules.find(r => r.id === ruleId) : null;
        const isNew = !rule;
        let effectiveType = rule?.type || RULE_TYPE.COMBINATION;
        if (['threshold_high', 'threshold_low', 'threshold_range'].includes(effectiveType)) {
            effectiveType = RULE_TYPE.RANGE;
        } else if (['combination_near_equal', 'combination_all_high'].includes(effectiveType)) {
            effectiveType = RULE_TYPE.COMBINATION;
        }

        const emotions = getExpressionsList ? await getExpressionsList() : [];
        const emotionOptions = emotions.map(e => `<option value="${e}">${e}</option>`).join('');

        const typeOptions = [
            { value: RULE_TYPE.COMBINATION, label: 'Combination - Multiple emotions close in value' },
            { value: RULE_TYPE.RANGE, label: 'Range - Single emotion within score bounds' },
        ].map(t => `<option value="${t.value}" ${effectiveType === t.value ? 'selected' : ''}>${t.label}</option>`).join('');

        const html = `
            <div class="rule_editor">
                <div class="rule_editor_field">
                    <label>Expression Name (sprite filename)</label>
                    <input type="text" id="rule_editor_name" class="text_pole" value="${rule?.name || ''}" 
                           placeholder="e.g., depressed, lustful, bittersweet">
                    <small>This will be the sprite filename to look for (e.g., depressed.png)</small>
                </div>
                
                <div class="rule_editor_field">
                    <label>Rule Type</label>
                    <select id="rule_editor_type" class="text_pole">
                        ${typeOptions}
                    </select>
                </div>

                <div class="rule_editor_field">
                    <label>Conditions</label>
                    <div id="rule_editor_conditions"></div>
                    <div id="rule_editor_combination_settings" style="display: none;">
                        <div class="combination_diff_container">
                            <label>Maximum % difference between emotions to trigger:</label>
                            <input type="number" id="rule_editor_max_diff" class="text_pole" 
                                   value="25" min="0" max="100" step="1">%
                            <small>e.g., 25% means if the highest emotion is at 10%, all others must be at least 7.5%</small>
                        </div>
                    </div>
                    <button class="menu_button" id="rule_editor_add_condition">
                        <i class="fa-solid fa-plus"></i> <span>Add Condition</span>
                    </button>
                </div>
            </div>
        `;

        const popup = new Popup(html, POPUP_RESULT.AFFIRMATIVE, '', {
            okButton: isNew ? 'Create' : 'Save',
            cancelButton: 'Cancel',
            wide: true,
            large: true,
        });
        const $dlg = $(popup.dlg);
        const conditionsContainer = $dlg.find('#rule_editor_conditions');
        let conditions = [];
        if (rule?.conditions) {
            conditions = rule.conditions.map(c => ({
                emotion: c.emotion,
                minScore: c.minScore ?? 0,
                maxScore: c.maxScore ?? 1,
                minEnabled: c.minEnabled ?? (c.minScore !== undefined),
                maxEnabled: c.maxEnabled ?? (c.maxScore !== undefined),
                minInclusive: c.minInclusive ?? true,
                maxInclusive: c.maxInclusive ?? false,
            }));
        }
        const initialMaxDiff = rule?.maxDifference ?? 0.25;
        $dlg.find('#rule_editor_max_diff').val((initialMaxDiff * 100).toFixed(0));

        function renderConditions() {
            const ruleType = String($dlg.find('#rule_editor_type').val());
            const isCombination = ruleType === RULE_TYPE.COMBINATION;
            const isRange = ruleType === RULE_TYPE.RANGE;
            $dlg.find('#rule_editor_combination_settings').css('display', isCombination ? 'block' : 'none');
            
            conditionsContainer.empty();
            conditions.forEach((condition, index) => {
                conditionsContainer.append(createConditionEditor(condition, index, emotionOptions, isRange));
            });
            
            if (conditions.length === 0) {
                conditionsContainer.append('<div class="conditions_empty">Add at least one condition</div>');
            }
        }

        function createConditionEditor(condition, index, emotionOpts, isRange) {
            const minChecked = condition.minEnabled ? 'checked' : '';
            const maxChecked = condition.maxEnabled ? 'checked' : '';
            const minInclusiveChecked = condition.minInclusive !== false ? 'checked' : '';
            const maxInclusiveChecked = condition.maxInclusive === true ? 'checked' : '';
            const rangeUI = isRange ? `
                <div class="condition_range_ui">
                    <label class="checkbox_label" title="Enable minimum bound">
                        <input type="checkbox" class="condition_min_enabled" ${minChecked}>
                    </label>
                    <input type="number" class="condition_min_val text_pole" 
                           value="${((condition.minScore ?? 0) * 100).toFixed(0)}" 
                           min="0" max="100" step="1" ${!condition.minEnabled ? 'disabled' : ''}>%
                    <select class="condition_min_op text_pole" ${!condition.minEnabled ? 'disabled' : ''}>
                        <option value="inclusive" ${minInclusiveChecked ? 'selected' : ''}>≤</option>
                        <option value="exclusive" ${!minInclusiveChecked ? 'selected' : ''}>&lt;</option>
                    </select>
                    <select class="condition_emotion text_pole">
                        <option value="">Select...</option>
                        ${emotionOpts.replace(`value="${condition.emotion}"`, `value="${condition.emotion}" selected`)}
                    </select>
                    <select class="condition_max_op text_pole" ${!condition.maxEnabled ? 'disabled' : ''}>
                        <option value="exclusive" ${!maxInclusiveChecked ? 'selected' : ''}>&lt;</option>
                        <option value="inclusive" ${maxInclusiveChecked ? 'selected' : ''}>≤</option>
                    </select>
                    <input type="number" class="condition_max_val text_pole" 
                           value="${((condition.maxScore ?? 1) * 100).toFixed(0)}" 
                           min="0" max="100" step="1" ${!condition.maxEnabled ? 'disabled' : ''}>%
                    <label class="checkbox_label" title="Enable maximum bound">
                        <input type="checkbox" class="condition_max_enabled" ${maxChecked}>
                    </label>
                </div>
            ` : `
                <select class="condition_emotion text_pole">
                    <option value="">Select emotion...</option>
                    ${emotionOpts.replace(`value="${condition.emotion}"`, `value="${condition.emotion}" selected`)}
                </select>
            `;

            return `
                <div class="condition_editor" data-index="${index}">
                    ${rangeUI}
                    <button class="menu_button condition_remove" title="Remove">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>
            `;
        }

        $dlg.find('#rule_editor_type').on('change', function() {
            conditions = conditions.map(c => ({
                emotion: c.emotion,
                minScore: 0,
                maxScore: 1,
                minEnabled: false,
                maxEnabled: false,
                minInclusive: true,
                maxInclusive: false,
            }));
            renderConditions();
        });
        
        $dlg.find('#rule_editor_add_condition').on('click', () => {
            conditions.push({ 
                emotion: '', 
                minScore: 0, 
                maxScore: 1, 
                minEnabled: false, 
                maxEnabled: false,
                minInclusive: true,
                maxInclusive: false,
            });
            renderConditions();
        });

        $dlg.on('click', '.condition_remove', function() {
            const index = $(this).closest('.condition_editor').data('index');
            conditions.splice(index, 1);
            renderConditions();
        });

        $dlg.on('change', '.condition_min_enabled, .condition_max_enabled', function() {
            const conditionEl = $(this).closest('.condition_editor');
            const index = conditionEl.data('index');
            const isMin = $(this).hasClass('condition_min_enabled');
            const enabled = $(this).prop('checked');
            
            if (isMin) {
                conditions[index].minEnabled = enabled;
                conditionEl.find('.condition_min_val, .condition_min_op').prop('disabled', !enabled);
            } else {
                conditions[index].maxEnabled = enabled;
                conditionEl.find('.condition_max_val, .condition_max_op').prop('disabled', !enabled);
            }
        });

        $dlg.on('change', '.condition_emotion, .condition_min_val, .condition_max_val, .condition_min_op, .condition_max_op', function() {
            const conditionEl = $(this).closest('.condition_editor');
            const index = conditionEl.data('index');
            
            conditions[index].emotion = String(conditionEl.find('.condition_emotion').val());
            
            const minVal = conditionEl.find('.condition_min_val').val();
            const maxVal = conditionEl.find('.condition_max_val').val();
            
            if (minVal !== undefined && minVal !== '') {
                conditions[index].minScore = parseFloat(String(minVal)) / 100;
            }
            if (maxVal !== undefined && maxVal !== '') {
                conditions[index].maxScore = parseFloat(String(maxVal)) / 100;
            }
            
            conditions[index].minInclusive = conditionEl.find('.condition_min_op').val() === 'inclusive';
            conditions[index].maxInclusive = conditionEl.find('.condition_max_op').val() === 'inclusive';
        });

        renderConditions();

        const result = await popup.show();
        
        if (result === POPUP_RESULT.AFFIRMATIVE) {
            const name = String($dlg.find('#rule_editor_name').val() || '').trim();
            const type = String($dlg.find('#rule_editor_type').val());

            if (!name) {
                toast.error('Please enter an expression name');
                return;
            }

            const validConditions = conditions.filter(c => c.emotion);
            if (validConditions.length === 0) {
                toast.error('Please add at least one condition with an emotion');
                return;
            }

            const ruleData = {
                name,
                type,
                conditions: validConditions,
                enabled: rule?.enabled !== false,
            };
            
            if (type === RULE_TYPE.COMBINATION) {
                const maxDiffVal = String($dlg.find('#rule_editor_max_diff').val() || '25');
                ruleData.maxDifference = parseFloat(maxDiffVal) / 100;
            }

            if (isNew) {
                if (createRule(profile.id, ruleData)) {
                    renderRulesList();
                    toast.success(`Rule "${name}" created`);
                }
            } else {
                if (updateRule(profile.id, ruleId, ruleData)) {
                    renderRulesList();
                    toast.success(`Rule "${name}" updated`);
                }
            }
        }
    } catch (error) {
        console.error('Error in showRuleEditor:', error);
        toast.error('Failed to open rule editor');
    }
}
