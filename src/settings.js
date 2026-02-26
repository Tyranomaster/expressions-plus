/**
 * Settings Management for Expressions+
 */

import { saveSettingsDebounced } from '../../../../../script.js';
import { extension_settings } from '../../../../extensions.js';
import {
    SETTINGS_KEY,
    DEFAULT_FALLBACK_EXPRESSION,
    DEFAULT_EXPRESSIONS,
    DEFAULT_PROFILE_ID,
    DEFAULT_PROFILE_NAME,
    DEFAULT_PLUS_PROFILE_ID,
    DEFAULT_PLUS_PROFILE_NAME,
    DEFAULT_ACTIVE_PROFILE_ID,
    DEFAULT_EXPRESSION_SET,
    DEFAULT_PLUS_EXPRESSION_SET,
    EXPRESSION_API,
    RULE_TYPE,
} from './constants.js';

const BUILT_IN_PROFILE_DEFINITIONS = [
    {
        id: DEFAULT_PROFILE_ID,
        name: DEFAULT_PROFILE_NAME,
        fileNames: [
            'default.json',
            'expressions-plus-profile-Default.json',
        ],
    },
    {
        id: DEFAULT_PLUS_PROFILE_ID,
        name: DEFAULT_PLUS_PROFILE_NAME,
        fileNames: [
            'default-plus.json',
            'expressions-plus-profile-Default__.json',
            'expressions-plus-profile-Default%20%2B.json',
        ],
    },
];

let builtInProfilesCache = null;

// ============================================================================
// Default Settings
// ============================================================================

/**
 * Creates the default profile with base emotions as simple rules
 * @returns {import('./constants.js').ExpressionProfile}
 */
export function createDefaultProfile() {
    const rules = createBaseEmotionRules();

    return {
        id: DEFAULT_PROFILE_ID,
        name: DEFAULT_PROFILE_NAME,
        rules: rules,
        fallbackExpression: DEFAULT_FALLBACK_EXPRESSION,
        isDefault: true,
    };
}

/**
 * Creates the default+ profile with base emotions as simple rules
 * @returns {import('./constants.js').ExpressionProfile}
 */
export function createDefaultPlusProfile() {
    const rules = createBaseEmotionRules();

    return {
        id: DEFAULT_PLUS_PROFILE_ID,
        name: DEFAULT_PLUS_PROFILE_NAME,
        rules: rules,
        fallbackExpression: DEFAULT_FALLBACK_EXPRESSION,
        isDefault: true,
    };
}

/**
 * Creates base emotion rules
 * @returns {import('./constants.js').ExpressionRule[]}
 */
function createBaseEmotionRules() {
    const rules = DEFAULT_EXPRESSIONS.map((emotion, index) => ({
        id: `base_${emotion}`,
        name: emotion,
        type: RULE_TYPE.SIMPLE,
        conditions: [{ emotion: emotion }],
        enabled: true,
    }));

    return rules;
}

/**
 * Gets fallback built-in profiles if bundled profile JSON cannot be loaded
 * @returns {import('./constants.js').ExpressionProfile[]}
 */
function getFallbackBuiltInProfiles() {
    return [createDefaultProfile(), createDefaultPlusProfile()];
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
        showDefault: true,
        custom: [],
        
        profiles: getFallbackBuiltInProfiles(),
        characterAssignments: [],
        activeProfileId: DEFAULT_ACTIVE_PROFILE_ID,
        insightMode: false,
        
        lowConfidenceEnabled: true,
        lowConfidenceThreshold: 0.10,
        lowConfidenceExpression: 'neutral',
        
        prioritizeFolderProfiles: true,
        
        analyticsEnabled: false,
        analyticsEmotionCount: 'both', // 2, 3, or 'both'
    };
}

/**
 * Converts profile data from an imported profile JSON into internal profile format
 * @param {any} data
 * @param {{id: string, name: string, isDefault?: boolean}} options
 * @returns {import('./constants.js').ExpressionProfile|null}
 */
function createProfileFromImportData(data, options) {
    if (!data || data.type !== 'expressions-plus-profile' || !data.profile) {
        return null;
    }

    const profileData = data.profile;
    const sourceRules = Array.isArray(profileData.rules) ? profileData.rules : [];
    const rules = sourceRules.map((rule, index) => ({
        ...rule,
        id: rule?.id || `built_in_rule_${options.id}_${index}`,
        conditions: Array.isArray(rule?.conditions) ? rule.conditions : [],
        enabled: rule?.enabled ?? true,
    }));

    return {
        id: options.id,
        name: options.name,
        rules,
        fallbackExpression: profileData.fallbackExpression || DEFAULT_FALLBACK_EXPRESSION,
        isDefault: options.isDefault ?? true,
    };
}

/**
 * Loads bundled built-in profiles from the extension folder
 * @returns {Promise<import('./constants.js').ExpressionProfile[]>}
 */
async function loadBuiltInProfilesFromFiles() {
    if (builtInProfilesCache) {
        return builtInProfilesCache;
    }

    const loadedProfiles = [];

    for (const definition of BUILT_IN_PROFILE_DEFINITIONS) {
        try {
            for (const fileName of definition.fileNames) {
                const profileUrl = new URL(`../built-in-profiles/${fileName}`, import.meta.url);
                const response = await fetch(profileUrl);
                if (!response.ok) {
                    continue;
                }

                const data = await response.json();
                const profile = createProfileFromImportData(data, {
                    id: definition.id,
                    name: definition.name,
                    isDefault: true,
                });

                if (profile) {
                    loadedProfiles.push(profile);
                    break;
                }
            }
        } catch {
        }
    }

    builtInProfilesCache = loadedProfiles.length > 0 ? loadedProfiles : getFallbackBuiltInProfiles();
    return builtInProfilesCache;
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
export async function migrateSettings() {
    const settings = getSettings();
    
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

    if (!Array.isArray(settings.profiles) || settings.profiles.length === 0) {
        settings.profiles = getFallbackBuiltInProfiles();
        saveSettingsDebounced();
    }

    const builtInProfiles = await loadBuiltInProfilesFromFiles();
    let didUpdateProfiles = false;

    for (const builtInProfile of builtInProfiles) {
        const existingIndex = settings.profiles.findIndex(profile => profile.id === builtInProfile.id);
        if (existingIndex >= 0) {
            const existing = settings.profiles[existingIndex];
            const rulesChanged = JSON.stringify(existing.rules) !== JSON.stringify(builtInProfile.rules);
            if (rulesChanged || existing.fallbackExpression !== builtInProfile.fallbackExpression) {
                existing.rules = structuredClone(builtInProfile.rules);
                existing.fallbackExpression = builtInProfile.fallbackExpression;
                existing.isDefault = true;
                didUpdateProfiles = true;
            }
        } else {
            settings.profiles.push(structuredClone(builtInProfile));
            didUpdateProfiles = true;
        }
    }

    if (didUpdateProfiles) {
        saveSettingsDebounced();
    }

    if (!settings._defaultPlusMigrationApplied) {
        if (settings.activeProfileId === DEFAULT_PROFILE_ID && settings.profiles.some(profile => profile.id === DEFAULT_PLUS_PROFILE_ID)) {
            settings.activeProfileId = DEFAULT_PLUS_PROFILE_ID;
        }
        settings._defaultPlusMigrationApplied = true;
        saveSettingsDebounced();
    }

    const hasActiveProfile = settings.profiles.some(profile => profile.id === settings.activeProfileId);
    if (!hasActiveProfile) {
        settings.activeProfileId = settings.profiles.some(profile => profile.id === DEFAULT_ACTIVE_PROFILE_ID)
            ? DEFAULT_ACTIVE_PROFILE_ID
            : settings.profiles[0]?.id;
        saveSettingsDebounced();
    }

    if (!Array.isArray(settings.characterAssignments)) {
        settings.characterAssignments = [];
        saveSettingsDebounced();
    }

    if (!settings._defaultPlusExpressionSetMigrationApplied && Array.isArray(settings.characterAssignments)) {
        let didUpdateAssignments = false;
        for (const assignment of settings.characterAssignments) {
            if (!assignment) continue;

            if (assignment.expressionSet === DEFAULT_EXPRESSION_SET || assignment.expressionSet === undefined || assignment.expressionSet === null) {
                assignment.expressionSet = DEFAULT_PLUS_EXPRESSION_SET;
                didUpdateAssignments = true;
            }

            if (!Array.isArray(assignment.expressionSets)) {
                assignment.expressionSets = [];
                didUpdateAssignments = true;
            }

            if (!assignment.expressionSets.includes(DEFAULT_PLUS_EXPRESSION_SET)) {
                assignment.expressionSets.push(DEFAULT_PLUS_EXPRESSION_SET);
                didUpdateAssignments = true;
            }
        }

        settings._defaultPlusExpressionSetMigrationApplied = true;
        saveSettingsDebounced();
    }

    // One-time migration: rename Default profile to Default (Legacy)
    if (!settings._defaultLegacyRenameMigrationApplied) {
        const defaultProfile = settings.profiles.find(p => p.id === DEFAULT_PROFILE_ID);
        if (defaultProfile && defaultProfile.name === 'Default') {
            defaultProfile.name = DEFAULT_PROFILE_NAME;
        }
        settings._defaultLegacyRenameMigrationApplied = true;
        saveSettingsDebounced();
    }

    // One-time migration: enable showDefault (Default+ smiley fallback) for existing users
    if (!settings._showDefaultMigrationApplied) {
        settings.showDefault = true;
        settings._showDefaultMigrationApplied = true;
        saveSettingsDebounced();
    }

    // Ensure Default+ profile is first in the profiles array
    const defaultPlusIndex = settings.profiles.findIndex(p => p.id === DEFAULT_PLUS_PROFILE_ID);
    if (defaultPlusIndex > 0) {
        const [defaultPlusProfile] = settings.profiles.splice(defaultPlusIndex, 1);
        settings.profiles.unshift(defaultPlusProfile);
        saveSettingsDebounced();
    }
    
    // Migrate debugMode to insightMode
    if (settings.debugMode !== undefined && settings.insightMode === undefined) {
        settings.insightMode = settings.debugMode;
        delete settings.debugMode;
        saveSettingsDebounced();
    }
}
