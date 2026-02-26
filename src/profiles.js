/**
 * Profile Management for Expressions+
 */

import { saveSettingsDebounced } from '../../../../../script.js';
import { getContext } from '../../../../extensions.js';
import { getCharaFilename } from '../../../../utils.js';
import { DEFAULT_FALLBACK_EXPRESSION, DEFAULT_ACTIVE_PROFILE_ID, DEFAULT_PROFILE_ID, FOLDER_PROFILE_FILENAME, FOLDER_PROFILE_CACHE_TTL } from './constants.js';
import { getSettings, createDefaultProfile } from './settings.js';
import { folderProfileCache, setFolderProfileCache } from './state.js';

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
// Profile Management
// ============================================================================

/**
 * Gets all profiles
 * @returns {import('./constants.js').ExpressionProfile[]}
 */
export function getProfiles() {
    return getSettings().profiles;
}

/**
 * Gets a profile by ID
 * @param {string} profileId 
 * @returns {import('./constants.js').ExpressionProfile|undefined}
 */
export function getProfileById(profileId) {
    return getProfiles().find(p => p.id === profileId);
}

/**
 * Gets the active profile for the current character
 * @returns {import('./constants.js').ExpressionProfile}
 */
export function getActiveProfile() {
    const settings = getSettings();
    const context = getContext();
    
    if (context.characterId !== undefined) {
        const avatarFileName = getCharaFilename();
        const assignment = settings.characterAssignments.find(a => a.characterId === avatarFileName);
        if (assignment) {
            const profile = getProfileById(assignment.profileId);
            if (profile) return profile;
        }
    }
    
    const activeProfile = getProfileById(settings.activeProfileId);
    return activeProfile || getProfiles()[0] || createDefaultProfile();
}

/**
 * Creates a new profile
 * @param {string} name - Profile name
 * @param {string} [copyFromId] - Optional profile ID to copy rules from
 * @returns {import('./constants.js').ExpressionProfile}
 */
export function createProfile(name, copyFromId = null) {
    const id = `profile_${Date.now()}`;
    let rules = [];
    let fallbackExpression = DEFAULT_FALLBACK_EXPRESSION;

    if (copyFromId) {
        const sourceProfile = getProfileById(copyFromId);
        if (sourceProfile) {
            rules = JSON.parse(JSON.stringify(sourceProfile.rules)).map(rule => ({
                ...rule,
                id: `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            }));
            fallbackExpression = sourceProfile.fallbackExpression;
        }
    }

    const profile = {
        id,
        name,
        rules,
        fallbackExpression,
        isDefault: false,
    };

    getSettings().profiles.push(profile);
    saveSettingsDebounced();
    return profile;
}

/**
 * Renames an existing profile
 * @param {string} profileId 
 * @param {string} newName 
 * @returns {boolean}
 */
export function renameProfile(profileId, newName) {
    const profile = getProfileById(profileId);
    if (!profile) {
        toast.error('Profile not found');
        return false;
    }

    if (profile.isDefault) {
        toast.error('Cannot rename a built-in profile');
        return false;
    }

    const trimmedName = newName.trim();
    if (!trimmedName) {
        toast.error('Profile name cannot be empty');
        return false;
    }

    if (getProfiles().some(p => p.name === trimmedName && p.id !== profileId)) {
        toast.error(`A profile named "${trimmedName}" already exists`);
        return false;
    }

    profile.name = trimmedName;
    saveSettingsDebounced();
    return true;
}

/**
 * Deletes a profile
 * @param {string} profileId 
 * @returns {boolean} Success
 */
export function deleteProfile(profileId) {
    const settings = getSettings();
    const profile = getProfileById(profileId);
    
    if (!profile || profile.isDefault) {
        toast.error('Cannot delete the default profile');
        return false;
    }

    settings.profiles = settings.profiles.filter(p => p.id !== profileId);
    
    settings.characterAssignments = settings.characterAssignments.filter(a => a.profileId !== profileId);
    
    if (settings.activeProfileId === profileId) {
        const fallbackProfile = getProfileById(DEFAULT_ACTIVE_PROFILE_ID)
            || getProfileById(DEFAULT_PROFILE_ID)
            || settings.profiles[0];
        settings.activeProfileId = fallbackProfile?.id || DEFAULT_PROFILE_ID;
    }

    saveSettingsDebounced();
    return true;
}

/**
 * Exports a profile to JSON
 * @param {string} profileId 
 * @returns {string|null} JSON string
 */
export function exportProfile(profileId) {
    const profile = getProfileById(profileId);
    if (!profile) return null;
    
    const exportData = {
        version: 1,
        type: 'expressions-plus-profile',
        profile: { ...profile, id: undefined, isDefault: undefined },
    };
    
    return JSON.stringify(exportData, null, 2);
}

/**
 * Imports a profile from JSON
 * @param {string} jsonString 
 * @param {string} [newName] - Optional new name for the profile
 * @returns {import('./constants.js').ExpressionProfile|null}
 */
export function importProfile(jsonString, newName = null) {
    try {
        const data = JSON.parse(jsonString);
        
        if (data.type !== 'expressions-plus-profile' || !data.profile) {
            toast.error('Invalid profile format');
            return null;
        }

        const name = newName || data.profile.name || 'Imported Profile';
        
        if (getProfiles().some(p => p.name === name)) {
            toast.error(`A profile named "${name}" already exists`);
            return null;
        }

        const profile = {
            id: `profile_${Date.now()}`,
            name,
            rules: data.profile.rules.map(rule => ({
                ...rule,
                id: `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            })),
            fallbackExpression: data.profile.fallbackExpression || DEFAULT_FALLBACK_EXPRESSION,
            isDefault: false,
        };

        getSettings().profiles.push(profile);
        saveSettingsDebounced();
        
        toast.success(`Profile "${name}" imported successfully`);
        return profile;
    } catch (error) {
        console.error('Error importing profile:', error);
        toast.error('Failed to import profile');
        return null;
    }
}

// ============================================================================
// Folder Profile Support
// ============================================================================

/**
 * Fetches an expressions-plus profile from a sprite image folder.
 * Looks for a well-known filename (expressions-plus-profile.json) in the sprite folder.
 * @param {string} spriteFolderName - The sprite folder path (e.g. "CharacterName" or "CharacterName/subfolder")
 * @returns {Promise<import('./constants.js').ExpressionProfile|null>} The parsed profile, or null if not found
 */
export async function fetchFolderProfile(spriteFolderName) {
    if (!spriteFolderName) return null;

    try {
        const encodedPath = spriteFolderName.split('/').map(s => encodeURIComponent(s)).join('/');
        const url = `/characters/${encodedPath}/${FOLDER_PROFILE_FILENAME}`;
        const response = await fetch(url);

        if (!response.ok) {
            return null;
        }

        const data = await response.json();

        if (!data || data.type !== 'expressions-plus-profile' || !data.profile) {
            console.debug('Expressions+: Invalid folder profile format in', spriteFolderName);
            return null;
        }

        const profileData = data.profile;
        const sourceRules = Array.isArray(profileData.rules) ? profileData.rules : [];

        const profile = {
            id: `folder_profile_${Date.now()}`,
            name: profileData.name || 'Folder Profile',
            rules: sourceRules.map((rule, index) => ({
                ...rule,
                id: rule?.id || `folder_rule_${index}_${Math.random().toString(36).substr(2, 9)}`,
                conditions: Array.isArray(rule?.conditions) ? rule.conditions : [],
                enabled: rule?.enabled ?? true,
            })),
            fallbackExpression: profileData.fallbackExpression || DEFAULT_FALLBACK_EXPRESSION,
            isDefault: false,
            isFolderProfile: true,
        };

        console.debug('Expressions+: Loaded folder profile from', spriteFolderName, profile.name);
        return profile;
    } catch (error) {
        return null;
    }
}

/**
 * Fetches and caches a folder profile for the given sprite folder.
 * Uses a TTL-based cache to avoid re-fetching on every worker tick.
 * @param {string} spriteFolderName - The sprite folder path
 * @returns {Promise<import('./constants.js').ExpressionProfile|null>}
 */
export async function fetchAndCacheFolderProfile(spriteFolderName) {
    if (!spriteFolderName) return null;

    const cached = folderProfileCache[spriteFolderName];
    if (cached && (Date.now() - cached.timestamp) < FOLDER_PROFILE_CACHE_TTL) {
        return cached.profile;
    }

    const profile = await fetchFolderProfile(spriteFolderName);
    setFolderProfileCache(spriteFolderName, { profile, timestamp: Date.now() });
    return profile;
}

/**
 * Gets the active profile, considering folder profile override.
 * If prioritizeFolderProfiles is enabled and a cached folder profile exists
 * for the given sprite folder, it takes precedence over the assigned profile.
 * @param {string} [spriteFolderName] - The current sprite folder name
 * @returns {import('./constants.js').ExpressionProfile}
 */
export function getActiveProfileWithFolderOverride(spriteFolderName) {
    const settings = getSettings();

    if (settings.prioritizeFolderProfiles && spriteFolderName) {
        const cached = folderProfileCache[spriteFolderName];
        if (cached && cached.profile && (Date.now() - cached.timestamp) < FOLDER_PROFILE_CACHE_TTL) {
            return cached.profile;
        }
    }

    return getActiveProfile();
}

/**
 * Gets the cached folder profile for a sprite folder (if any).
 * Used by UI to show folder profile notice.
 * @param {string} [spriteFolderName] - The sprite folder name
 * @returns {import('./constants.js').ExpressionProfile|null}
 */
export function getCachedFolderProfile(spriteFolderName) {
    if (!spriteFolderName) return null;

    const settings = getSettings();
    if (!settings.prioritizeFolderProfiles) return null;

    const cached = folderProfileCache[spriteFolderName];
    if (cached && cached.profile && (Date.now() - cached.timestamp) < FOLDER_PROFILE_CACHE_TTL) {
        return cached.profile;
    }
    return null;
}
