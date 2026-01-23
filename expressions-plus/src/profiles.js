/**
 * Profile Management for Expressions+
 */

import { saveSettingsDebounced } from '../../../../../script.js';
import { getContext } from '../../../../extensions.js';
import { getCharaFilename } from '../../../../utils.js';
import { DEFAULT_FALLBACK_EXPRESSION } from './constants.js';
import { getSettings, createDefaultProfile } from './settings.js';

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
    
    // Check for character-specific assignment
    if (context.characterId !== undefined) {
        const avatarFileName = getCharaFilename();
        const assignment = settings.characterAssignments.find(a => a.characterId === avatarFileName);
        if (assignment) {
            const profile = getProfileById(assignment.profileId);
            if (profile) return profile;
        }
    }
    
    // Fall back to active profile or default
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
            // Deep copy rules with new IDs
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

    // Remove profile
    settings.profiles = settings.profiles.filter(p => p.id !== profileId);
    
    // Update any character assignments using this profile
    settings.characterAssignments = settings.characterAssignments.filter(a => a.profileId !== profileId);
    
    // Reset active profile if it was deleted
    if (settings.activeProfileId === profileId) {
        settings.activeProfileId = 'default';
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
        
        // Check for name conflict
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
