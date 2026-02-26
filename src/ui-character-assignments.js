/**
 * Character Profile Assignment UI for Expressions+
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

import { saveSettingsDebounced } from '../../../../../script.js';
import { getContext } from '../../../../extensions.js';

import { getSettings } from './settings.js';
import { getProfiles } from './profiles.js';
import { 
    getExpressionSets, 
    setCharacterExpressionSet,
    addExpressionSet,
    removeExpressionSet,
    validateExpressionSetFolder,
    dispatchExpressionSetChanged
} from './expression-sets.js';
import { clearSpriteCache } from './state.js';
import { DEFAULT_EXPRESSION_SET, DEFAULT_PLUS_EXPRESSION_SET } from './constants.js';

// ============================================================================
// Character Profile Assignment UI
// ============================================================================

/**
 * Renders the character assignments list
 */
export async function renderCharacterAssignments() {
    const settings = getSettings();
    const context = getContext();
    const container = $('#expressions_plus_character_assignments');
    container.empty();

    const profiles = getProfiles();
    const profileOptions = profiles.map(p => 
        `<option value="${p.id}">${p.name}</option>`
    ).join('');

    const characters = context.characters || [];
    
    for (const char of characters) {
        const avatarFileName = char.avatar?.replace(/\.[^/.]+$/, '');
        if (!avatarFileName) continue;

        const assignment = settings.characterAssignments.find(a => a.characterId === avatarFileName);
        const selectedProfile = assignment?.profileId || '';
        const selectedSet = assignment?.expressionSet ?? DEFAULT_PLUS_EXPRESSION_SET;

        const expressionSets = getExpressionSets(avatarFileName);
        const setOptions = expressionSets.map(set => 
            `<option value="${set.folder}" ${set.folder === selectedSet ? 'selected' : ''}>${set.name}</option>`
        ).join('');

        container.append(`
            <div class="character_assignment_item" data-character-id="${avatarFileName}">
                <span class="character_name">${char.name}</span>
                <div class="character_assignment_controls">
                    <select class="character_profile_select text_pole" title="Expression Profile">
                        <option value="">Use active profile</option>
                        ${profileOptions.replace(`value="${selectedProfile}"`, `value="${selectedProfile}" selected`)}
                    </select>
                    <select class="character_expression_set_select text_pole" title="Expression Set">
                        ${setOptions}
                    </select>
                    <div class="menu_button expression_set_add" title="Add expression set folder">
                        <i class="fa-solid fa-plus"></i>
                    </div>
                    <div class="menu_button expression_set_remove" title="Remove selected expression set">
                        <i class="fa-solid fa-trash"></i>
                    </div>
                </div>
            </div>
        `);
    }

    if (characters.length === 0) {
        container.append('<div class="assignments_empty">No characters available</div>');
    }
}

/**
 * Handles character profile assignment change
 */
export function onCharacterProfileChanged() {
    const settings = getSettings();
    const characterId = $(this).closest('.character_assignment_item').data('character-id');
    const profileId = $(this).val();

    let assignment = settings.characterAssignments.find(a => a.characterId === characterId);
    
    if (!assignment) {
        assignment = { characterId, profileId: '', expressionSet: DEFAULT_PLUS_EXPRESSION_SET, expressionSets: [] };
        settings.characterAssignments.push(assignment);
    }
    
    assignment.profileId = profileId;
    
    settings.characterAssignments = settings.characterAssignments.filter(a => 
        a.profileId || a.expressionSet || (a.expressionSets && a.expressionSets.length > 0)
    );

    saveSettingsDebounced();
}

/**
 * Handles character expression set change
 */
export function onCharacterExpressionSetChanged() {
    const characterId = $(this).closest('.character_assignment_item').data('character-id');
    const expressionSet = String($(this).val() || '');

    setCharacterExpressionSet(characterId, expressionSet);
    
    clearSpriteCache();
    
    saveSettingsDebounced();
    
    dispatchExpressionSetChanged(characterId, expressionSet);
}

/**
 * Handles add button click to add a new expression set folder
 */
export async function onExpressionSetAdd() {
    const item = $(this).closest('.character_assignment_item');
    const characterId = item.data('character-id');
    const select = item.find('.character_expression_set_select');
    
    const folderName = prompt(
        'Enter the subfolder name for the expression set.\n\n' +
        'This should match the subfolder name inside the character\'s expressions folder.\n' +
        'Example: If you have "characters/MyChar/chibi/", enter "chibi"'
    );
    
    if (!folderName || !folderName.trim()) return;
    
    const cleanName = folderName.trim();
    
    $(this).find('i').removeClass('fa-plus').addClass('fa-spinner fa-spin');
    
    try {
        const validation = await validateExpressionSetFolder(characterId, cleanName);
        
        if (!validation.valid) {
            const proceed = confirm(
                `No sprites found in "${characterId}/${cleanName}".\n\n` +
                'The folder may not exist yet. You can still add it to your list\n' +
                 'and create the folder manually later.\n\n' +
                'Add this expression set anyway?'
            );
            if (!proceed) return;
        }
        
        const added = addExpressionSet(characterId, cleanName);
        
        if (!added) {
            toast.warning(`Expression set "${cleanName}" already exists for this character.`);
            return;
        }
        
        select.append(`<option value="${cleanName}">${cleanName}</option>`);
        
        select.val(cleanName).trigger('change');
        
        saveSettingsDebounced();
        
        if (validation.valid) {
            toast.success(`Added expression set "${cleanName}" with ${validation.spriteCount} sprites`);
        } else {
            toast.info(`Added expression set "${cleanName}" to list (create the folder and add sprites)`);
        }
    } finally {
        $(this).find('i').removeClass('fa-spinner fa-spin').addClass('fa-plus');
    }
}

/**
 * Handles remove button click to remove an expression set folder
 */
export function onExpressionSetRemove() {
    const item = $(this).closest('.character_assignment_item');
    const characterId = item.data('character-id');
    const select = item.find('.character_expression_set_select');
    const selectedValue = String(select.val() || '');
    
    if (selectedValue === DEFAULT_EXPRESSION_SET) {
        toast.warning('Cannot remove the character base folder option');
        return;
    }
    
    if (!confirm(`Remove "${selectedValue}" from your expression sets list?\n\n(This only removes it from the menu - it won't delete any files)`)) {
        return;
    }
    
    const removed = removeExpressionSet(characterId, selectedValue);
    
    if (removed) {
        select.find(`option[value="${selectedValue}"]`).remove();
        
        select.val(DEFAULT_EXPRESSION_SET).trigger('change');
        
        saveSettingsDebounced();
        toast.success(`Removed "${selectedValue}" from expression sets list`);
    }
}
