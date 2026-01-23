/**
 * Settings Management for Expressions+
 */

import { saveSettingsDebounced } from '../../../../../script.js';
import { extension_settings } from '../../../../extensions.js';
import {
    SETTINGS_KEY,
    DEFAULT_FALLBACK_EXPRESSION,
    DEFAULT_EXPRESSIONS,
    DEFAULT_PROFILE_NAME,
    EXPRESSION_API,
    RULE_TYPE,
} from './constants.js';

// ============================================================================
// Default Settings
// ============================================================================

/**
 * Creates the default profile with base emotions as simple rules
 * @returns {import('./constants.js').ExpressionProfile}
 */
export function createDefaultProfile() {
    const rules = DEFAULT_EXPRESSIONS.map((emotion, index) => ({
        id: `base_${emotion}`,
        name: emotion,
        type: RULE_TYPE.SIMPLE,
        conditions: [{ emotion: emotion }],
        enabled: true,
    }));

    return {
        id: 'default',
        name: DEFAULT_PROFILE_NAME,
        rules: rules,
        fallbackExpression: DEFAULT_FALLBACK_EXPRESSION,
        isDefault: true,
    };
}

/**
 * Creates the default settings object for expressions+
 * @returns {Object} Default settings
 */
export function getDefaultSettings() {
    return {
        // Base expression settings (compatible with original)
        api: EXPRESSION_API.local,
        translate: false,
        allowMultiple: true,
        rerollIfSame: false,
        filterAvailable: false,
        fallback_expression: DEFAULT_FALLBACK_EXPRESSION,
        showDefault: false,
        custom: [],
        
        // Expressions+ specific settings
        profiles: [createDefaultProfile()],
        characterAssignments: [],
        activeProfileId: 'default',
        insightMode: false,
    };
}

// ============================================================================
// Settings Management
// ============================================================================

/**
 * Gets the extension settings, initializing if necessary
 * @returns {Object} The extension settings
 */
export function getSettings() {
    if (!extension_settings[SETTINGS_KEY]) {
        extension_settings[SETTINGS_KEY] = getDefaultSettings();
    }
    return extension_settings[SETTINGS_KEY];
}

/**
 * Migrates settings from older versions
 */
export function migrateSettings() {
    const settings = getSettings();
    
    // Migrate from original expressions extension if needed
    if (extension_settings.expressions && !settings._migratedFromOriginal) {
        const original = extension_settings.expressions;
        settings.api = original.api ?? settings.api;
        settings.translate = original.translate ?? settings.translate;
        settings.allowMultiple = original.allowMultiple ?? settings.allowMultiple;
        settings.rerollIfSame = original.rerollIfSame ?? settings.rerollIfSame;
        settings.filterAvailable = original.filterAvailable ?? settings.filterAvailable;
        settings.llmPrompt = original.llmPrompt ?? settings.llmPrompt;
        settings.promptType = original.promptType ?? settings.promptType;
        settings.fallback_expression = original.fallback_expression ?? settings.fallback_expression;
        settings.showDefault = original.showDefault ?? settings.showDefault;
        settings.custom = original.custom ?? settings.custom;
        settings._migratedFromOriginal = true;
        saveSettingsDebounced();
    }

    // Ensure profiles array exists
    if (!Array.isArray(settings.profiles) || settings.profiles.length === 0) {
        settings.profiles = [createDefaultProfile()];
        saveSettingsDebounced();
    }

    // Ensure character assignments array exists
    if (!Array.isArray(settings.characterAssignments)) {
        settings.characterAssignments = [];
        saveSettingsDebounced();
    }
    
    // Migrate debugMode to insightMode
    if (settings.debugMode !== undefined && settings.insightMode === undefined) {
        settings.insightMode = settings.debugMode;
        delete settings.debugMode;
        saveSettingsDebounced();
    }
}
