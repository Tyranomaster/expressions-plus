/**
 * Rules UI for Expressions+
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

import { Popup, POPUP_RESULT } from '../../../../popup.js';

import { RULE_TYPE } from './constants.js';
import { getActiveProfile } from './profiles.js';
import { createRule, updateRule, deleteRule } from './rules.js';

// Forward declarations - will be set by index.js
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
 * Renders the rules list
 */
export function renderRulesList() {
    const profile = getActiveProfile();
    const container = $('#expressions_plus_rules_list');
    container.empty();

    // Separate custom rules from base rules (including legacy types)
    const customRules = profile.rules.filter(r => r.type !== RULE_TYPE.SIMPLE && r.type !== 'simple');
    const baseRules = profile.rules.filter(r => r.type === RULE_TYPE.SIMPLE || r.type === 'simple');

    if (customRules.length === 0) {
        container.append('<div class="rules_empty_message">No custom expression rules defined.<br>Click "Add Rule" to create one.</div>');
    } else {
        customRules.forEach(rule => {
            container.append(createRuleItemHtml(rule));
        });
    }

    // Show base rules count
    $('#expressions_plus_base_rules_count').text(`${baseRules.length} base expressions active`);
}

/**
 * Creates HTML for a rule list item
 * @param {Object} rule 
 * @returns {string}
 */
function createRuleItemHtml(rule) {
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
            // Format as range: n <=/< x <=/< m
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

    return `
        <div class="rule_item" data-rule-id="${rule.id}">
            <span class="rule_name">${rule.name}</span>
            <span class="rule_type_badge">${typeLabels[rule.type] || rule.type}</span>
            <span class="rule_conditions_summary" title="${conditionsSummary}">${conditionsSummary}</span>
            <div class="rule_actions">
                <button class="menu_button rule_edit_btn" title="Edit">
                    <i class="fa-solid fa-pencil"></i>
                </button>
                <button class="menu_button rule_delete_btn" title="Delete">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        </div>
    `;
}

/**
 * Handles clicking add rule button
 */
export async function onClickAddRule() {
    await showRuleEditor(null);
}

/**
 * Handles clicking edit rule button
 */
export async function onClickEditRule() {
    const ruleId = $(this).closest('.rule_item').data('rule-id');
    await showRuleEditor(ruleId);
}

/**
 * Handles clicking delete rule button
 */
export async function onClickDeleteRule() {
    const ruleItem = $(this).closest('.rule_item');
    const ruleId = ruleItem.data('rule-id');
    const profile = getActiveProfile();
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

        // Convert legacy rule types to new types for editing
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

        // Setup condition management
        const $dlg = $(popup.dlg);
        const conditionsContainer = $dlg.find('#rule_editor_conditions');
        
        // Initialize conditions from existing rule (converting legacy format)
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
        
        // Initialize max difference for combination rules
        const initialMaxDiff = rule?.maxDifference ?? 0.25;
        $dlg.find('#rule_editor_max_diff').val((initialMaxDiff * 100).toFixed(0));

        function renderConditions() {
            const ruleType = String($dlg.find('#rule_editor_type').val());
            const isCombination = ruleType === RULE_TYPE.COMBINATION;
            const isRange = ruleType === RULE_TYPE.RANGE;
            
            // Show/hide combination settings
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
            
            // Range UI: [checkbox] n% [</<= toggle] emotion [</<= toggle] m% [checkbox]
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

        // Event handlers
        $dlg.find('#rule_editor_type').on('change', function() {
            // Reset conditions when changing type
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

        // Handle min/max enable checkboxes
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

        // Handle other changes
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

        // Initial render
        renderConditions();

        // Show popup and handle result
        const result = await popup.show();
        
        if (result === POPUP_RESULT.AFFIRMATIVE) {
            const name = String($dlg.find('#rule_editor_name').val() || '').trim();
            const type = String($dlg.find('#rule_editor_type').val());

            // Validate
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
            
            // Add maxDifference for combination rules
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
