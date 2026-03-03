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

import { getRequestHeaders, saveSettingsDebounced } from '../../../../../script.js';
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
        'Enter the subfolder name for the new expression set.\n\n' +
        `This will be a subfolder inside this character's sprite directory:\n` +
        `  characters/${characterId}/<subfolder name>\n\n` +
        'Use a short, descriptive name (e.g., "chibi", "formal", "casual").\n' +
        'Only letters, numbers, hyphens and underscores are recommended.'
    );
    
    if (!folderName || !folderName.trim()) return;
    
    const cleanName = folderName.trim();
    
    if (cleanName.includes('/') || cleanName.includes('\\') || cleanName.includes('..')) {
        toast.error('Folder name cannot contain path separators or ".."');
        return;
    }
    
    $(this).find('i').removeClass('fa-plus').addClass('fa-spinner fa-spin');
    
    try {
        const validation = await validateExpressionSetFolder(characterId, cleanName);
        
        if (!validation.valid) {
            const { Popup } = await import('../../../../popup.js');
            const action = await Popup.show.confirm(
                'Create Expression Set Folder',
                `<p>The folder <code>characters/${characterId}/${cleanName}/</code> doesn't exist yet or has no sprites.</p>` +
                '<p>Would you like to create it now?</p>',
            );
            if (!action) return;

            // Create the folder by uploading a tiny placeholder, then removing it
            try {
                const canvas = document.createElement('canvas');
                canvas.width = 1;
                canvas.height = 1;
                const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
                const formData = new FormData();
                formData.append('name', `${characterId}/${cleanName}`);
                formData.append('label', '_placeholder');
                formData.append('avatar', blob, '_placeholder.png');
                formData.append('spriteName', '_placeholder');

                const uploadResult = await fetch('/api/sprites/upload', {
                    method: 'POST',
                    headers: getRequestHeaders({ omitContentType: true }),
                    body: formData,
                });

                if (!uploadResult.ok) {
                    throw new Error(`Server returned ${uploadResult.status}`);
                }

                // Clean up the placeholder
                await fetch('/api/sprites/delete', {
                    method: 'POST',
                    headers: getRequestHeaders(),
                    body: JSON.stringify({
                        name: `${characterId}/${cleanName}`,
                        label: '_placeholder',
                        spriteName: '_placeholder',
                    }),
                });
            } catch (err) {
                console.error('Expressions+: Failed to create subfolder:', err);
                toast.error(`Failed to create folder: ${err.message}`);
                return;
            }
        }
        
        const added = addExpressionSet(characterId, cleanName);
        
        if (!added) {
            toast.warning(`Expression set "${cleanName}" already exists for this character.`);
            return;
        }
        
        select.append(`<option value="${cleanName}">\u{1F4C1} ${cleanName}</option>`);
        
        select.val(cleanName).trigger('change');
        
        saveSettingsDebounced();
        
        if (validation.valid) {
            toast.success(`Added expression set "${cleanName}" with ${validation.spriteCount} sprites`);
        } else {
            toast.success(`Created expression set folder "${characterId}/${cleanName}/"`);
        }
    } finally {
        $(this).find('i').removeClass('fa-spinner fa-spin').addClass('fa-plus');
    }
}

/**
 * Handles remove button click to remove an expression set folder
 */
export async function onExpressionSetRemove() {
    const item = $(this).closest('.character_assignment_item');
    const characterId = item.data('character-id');
    const select = item.find('.character_expression_set_select');
    const selectedValue = String(select.val() || '');
    
    if (selectedValue === DEFAULT_EXPRESSION_SET) {
        toast.warning('Cannot remove the character base folder option');
        return;
    }

    if (selectedValue === DEFAULT_PLUS_EXPRESSION_SET) {
        toast.warning('Cannot remove the Default+ built-in set');
        return;
    }
    
    const { Popup, POPUP_TYPE } = await import('../../../../popup.js');

    // Check how many sprites are in the folder
    const folderPath = `${characterId}/${selectedValue}`;
    let spriteCount = 0;
    let sprites = [];
    try {
        const result = await fetch(`/api/sprites/get?name=${encodeURIComponent(folderPath)}`, {
            headers: getRequestHeaders(),
        });
        if (result.ok) {
            sprites = await result.json();
            spriteCount = Array.isArray(sprites) ? sprites.length : 0;
        }
    } catch { /* ignore */ }

    const fileInfo = spriteCount > 0
        ? `<p>This folder contains <b>${spriteCount} sprite(s)</b>.</p>`
        : '<p>This folder is empty or does not exist.</p>';

    const action = await Popup.show.confirm(
        'Remove Expression Set',
        `<p>Remove <code>${selectedValue}</code> from the expression sets list?</p>` +
        fileInfo +
        (spriteCount > 0
            ? '<p>Would you also like to <b>delete the sprite files</b> in this folder?</p>' +
              '<ul style="margin:0.5em 0;"><li><b>OK</b> — Remove from list only (keep files)</li>' +
              '<li><b>Delete Files</b> — Remove from list <em>and</em> delete all sprites in the folder</li></ul>'
            : ''),
        {
            customButtons: spriteCount > 0
                ? [{ text: 'Delete Files', result: 2, classes: ['menu_button', 'redWarningBG'] }]
                : undefined,
        },
    );

    if (!action) return;

    const shouldDeleteFiles = action === 2;

    if (shouldDeleteFiles && spriteCount > 0) {
        $(this).find('i').removeClass('fa-trash').addClass('fa-spinner fa-spin');
        try {
            for (const sprite of sprites) {
                // Extract filename without extension from the path
                const pathParts = sprite.path.split('/');
                const fullFileName = pathParts[pathParts.length - 1].split('?')[0]; // strip cache-bust query
                const spriteName = fullFileName.replace(/\.[^/.]+$/, ''); // strip extension
                await fetch('/api/sprites/delete', {
                    method: 'POST',
                    headers: getRequestHeaders(),
                    body: JSON.stringify({
                        name: folderPath,
                        label: sprite.label,
                        spriteName: spriteName,
                    }),
                });
            }
            toast.success(`Deleted ${spriteCount} sprite(s) from "${selectedValue}"`);
        } catch (err) {
            console.error('Expressions+: Error deleting sprites:', err);
            toast.error(`Failed to delete some sprites: ${err.message}`);
        } finally {
            $(this).find('i').removeClass('fa-spinner fa-spin').addClass('fa-trash');
        }
    }

    const removed = removeExpressionSet(characterId, selectedValue);
    
    if (removed) {
        select.find(`option[value="${selectedValue}"]`).remove();
        
        select.val(DEFAULT_EXPRESSION_SET).trigger('change');
        
        clearSpriteCache();
        saveSettingsDebounced();
        toast.success(`Removed "${selectedValue}" from expression sets list`);
    }
}
