/**
 * Rule Management for Expressions+
 */

import { saveSettingsDebounced } from '../../../../../script.js';
import { DEFAULT_EXPRESSIONS, RULE_TYPE } from './constants.js';
import { getProfileById } from './profiles.js';

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

// ============================================================================
// Rule Management
// ============================================================================

/**
 * Validates a rule name for conflicts
 * @param {string} name - The name to validate
 * @param {string} profileId - The profile to check in
 * @param {string} [excludeRuleId] - Rule ID to exclude from check (for edits)
 * @returns {{valid: boolean, message: string}}
 */
export function validateRuleName(name, profileId, excludeRuleId = null) {
    const normalizedName = name.toLowerCase().trim();
    
    // Check against base expressions
    if (DEFAULT_EXPRESSIONS.includes(normalizedName)) {
        // Only invalid if trying to create a non-simple rule with base name
        // Simple rules can use base names
        return {
            valid: false,
            message: `"${name}" is a base expression. Choose a different name for custom rules.`,
        };
    }
    
    // Check against existing rules in this profile
    const profile = getProfileById(profileId);
    if (profile) {
        const existingRule = profile.rules.find(r => 
            r.name.toLowerCase() === normalizedName && r.id !== excludeRuleId
        );
        if (existingRule) {
            return {
                valid: false,
                message: `A rule named "${name}" already exists in this profile. Rename the existing rule or choose a different name.`,
            };
        }
    }
    
    return { valid: true, message: '' };
}

/**
 * Creates a new rule in a profile
 * @param {string} profileId 
 * @param {Partial<import('./constants.js').ExpressionRule>} ruleData 
 * @returns {import('./constants.js').ExpressionRule|null}
 */
export function createRule(profileId, ruleData) {
    const profile = getProfileById(profileId);
    if (!profile) return null;

    // Validate name
    const validation = validateRuleName(ruleData.name, profileId);
    if (!validation.valid) {
        toast.error(validation.message);
        return null;
    }

    const rule = {
        id: `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: ruleData.name,
        type: ruleData.type || RULE_TYPE.SIMPLE,
        conditions: ruleData.conditions || [],
        enabled: ruleData.enabled !== false,
        maxDifference: ruleData.maxDifference,
    };

    profile.rules.push(rule);
    saveSettingsDebounced();
    return rule;
}

/**
 * Updates an existing rule
 * @param {string} profileId 
 * @param {string} ruleId 
 * @param {Partial<import('./constants.js').ExpressionRule>} updates 
 * @returns {boolean}
 */
export function updateRule(profileId, ruleId, updates) {
    const profile = getProfileById(profileId);
    if (!profile) return false;

    const ruleIndex = profile.rules.findIndex(r => r.id === ruleId);
    if (ruleIndex === -1) return false;

    // Validate name if changed
    if (updates.name && updates.name !== profile.rules[ruleIndex].name) {
        const validation = validateRuleName(updates.name, profileId, ruleId);
        if (!validation.valid) {
            toast.error(validation.message);
            return false;
        }
    }

    profile.rules[ruleIndex] = { ...profile.rules[ruleIndex], ...updates };
    saveSettingsDebounced();
    return true;
}

/**
 * Deletes a rule from a profile
 * @param {string} profileId 
 * @param {string} ruleId 
 * @returns {boolean}
 */
export function deleteRule(profileId, ruleId) {
    const profile = getProfileById(profileId);
    if (!profile) return false;

    profile.rules = profile.rules.filter(r => r.id !== ruleId);
    saveSettingsDebounced();
    return true;
}
