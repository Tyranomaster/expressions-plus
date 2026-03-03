/**
 * Expression Sets Management for Expressions+
 * Handles user-configured sprite folder sets (subfolders) for characters
 */

import { getRequestHeaders } from '../../../../../script.js';
import { getSettings } from './settings.js';
import { DEFAULT_EXPRESSION_SET, DEFAULT_PLUS_EXPRESSION_SET } from './constants.js';

// ============================================================================
// Expression Sets API
// ============================================================================

/**
 * Gets the configured expression sets for a character from settings
 * Expression sets are user-configured folder names stored in settings.
 * @param {string} characterId - The character avatar filename (without extension)
 * @returns {import('./constants.js').ExpressionSet[]} Array of expression sets
 */
export function getExpressionSets(characterId) {
    if (!characterId) {
        return [{ name: 'Default + (Smiley Set)', folder: DEFAULT_PLUS_EXPRESSION_SET }];
    }
    
    const settings = getSettings();
    const assignment = settings.characterAssignments?.find(a => a.characterId === characterId);
    const configuredSets = assignment?.expressionSets || [];
    
    const sets = [
        { name: 'Default + (Smiley Set)', folder: DEFAULT_PLUS_EXPRESSION_SET },
        { name: characterId, folder: DEFAULT_EXPRESSION_SET },
    ];
    
    for (const folderName of configuredSets) {
        if (folderName && folderName.trim()) {
            if (!sets.some(set => set.folder === folderName)) {
                sets.push({ name: `\u{1F4C1} ${folderName}`, folder: folderName });
            }
        }
    }
    
    return sets;
}

/**
 * Adds an expression set folder for a character
 * @param {string} characterId - The character avatar filename (without extension)
 * @param {string} folderName - The subfolder name to add
 * @returns {boolean} True if added successfully, false if already exists
 */
export function addExpressionSet(characterId, folderName) {
    if (!characterId || !folderName || !folderName.trim()) return false;
    
    const settings = getSettings();
    
    if (!settings.characterAssignments) {
        settings.characterAssignments = [];
    }
    
    let assignment = settings.characterAssignments.find(a => a.characterId === characterId);
    
    if (!assignment) {
        assignment = { 
            characterId, 
            profileId: '', 
            expressionSet: DEFAULT_PLUS_EXPRESSION_SET,
            expressionSets: []
        };
        settings.characterAssignments.push(assignment);
    }
    
    if (!assignment.expressionSets) {
        assignment.expressionSets = [];
    }
    
    const normalizedName = folderName.trim();
    if (assignment.expressionSets.includes(normalizedName)) {
        return false;
    }
    
    assignment.expressionSets.push(normalizedName);
    return true;
}

/**
 * Removes an expression set folder for a character
 * @param {string} characterId - The character avatar filename (without extension)
 * @param {string} folderName - The subfolder name to remove
 * @returns {boolean} True if removed successfully
 */
export function removeExpressionSet(characterId, folderName) {
    if (!characterId || !folderName) return false;
    
    const settings = getSettings();
    const assignment = settings.characterAssignments?.find(a => a.characterId === characterId);
    
    if (!assignment || !assignment.expressionSets) return false;
    
    const index = assignment.expressionSets.indexOf(folderName);
    if (index === -1) return false;
    
    assignment.expressionSets.splice(index, 1);
    
    if (assignment.expressionSet === folderName) {
        assignment.expressionSet = DEFAULT_EXPRESSION_SET;
    }
    
    return true;
}

/**
 * Validates that a folder contains sprites by checking the API
 * @param {string} characterId - The character folder name
 * @param {string} folderName - The subfolder name to validate
 * @returns {Promise<{valid: boolean, spriteCount: number}>} Validation result
 */
export async function validateExpressionSetFolder(characterId, folderName) {
    try {
        const path = folderName ? `${characterId}/${folderName}` : characterId;
        const result = await fetch(`/api/sprites/get?name=${encodeURIComponent(path)}`, {
            headers: getRequestHeaders(),
        });
        
        if (result.ok) {
            const sprites = await result.json();
            if (Array.isArray(sprites) && sprites.length > 0) {
                return { valid: true, spriteCount: sprites.length };
            }
        }
    } catch (error) {
        console.debug('Expressions+: Error validating folder:', error);
    }
    
    return { valid: false, spriteCount: 0 };
}

/**
 * Gets the current expression set for a character
 * @param {string} characterId - The character avatar filename (without extension)
 * @returns {string} The expression set folder name (empty string for base folder)
 */
export function getCharacterExpressionSet(characterId) {
    const settings = getSettings();
    const assignment = settings.characterAssignments?.find(a => a.characterId === characterId);
    return assignment?.expressionSet ?? DEFAULT_PLUS_EXPRESSION_SET;
}

/**
 * Sets the expression set for a character
 * @param {string} characterId - The character avatar filename (without extension)
 * @param {string} expressionSet - The expression set folder name (empty for base folder)
 */
export function setCharacterExpressionSet(characterId, expressionSet) {
    const settings = getSettings();
    
    if (!settings.characterAssignments) {
        settings.characterAssignments = [];
    }
    
    let assignment = settings.characterAssignments.find(a => a.characterId === characterId);
    
    if (assignment) {
        assignment.expressionSet = expressionSet;
    } else {
        settings.characterAssignments.push({
            characterId,
            profileId: '',
            expressionSet,
            expressionSets: [],
        });
    }
}

/**
 * Dispatches an expression set changed event
 * @param {string} characterId - The character ID
 * @param {string} expressionSet - The new expression set folder
 */
export function dispatchExpressionSetChanged(characterId, expressionSet) {
    const event = new CustomEvent('expressionSetChanged', { 
        detail: { characterId, expressionSet } 
    });
    window.dispatchEvent(event);
}
