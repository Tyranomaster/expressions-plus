/**
 * Character Profile Assignment UI for Expressions+
 */

import { saveSettingsDebounced } from '../../../../../script.js';
import { getContext } from '../../../../extensions.js';

import { getSettings } from './settings.js';
import { getProfiles } from './profiles.js';

// ============================================================================
// Character Profile Assignment UI
// ============================================================================

/**
 * Renders the character assignments list
 */
export function renderCharacterAssignments() {
    const settings = getSettings();
    const context = getContext();
    const container = $('#expressions_plus_character_assignments');
    container.empty();

    const profiles = getProfiles();
    const profileOptions = profiles.map(p => 
        `<option value="${p.id}">${p.name}</option>`
    ).join('');

    // Get all characters
    const characters = context.characters || [];
    
    characters.forEach(char => {
        const avatarFileName = char.avatar?.replace(/\.[^/.]+$/, '');
        if (!avatarFileName) return;

        const assignment = settings.characterAssignments.find(a => a.characterId === avatarFileName);
        const selectedProfile = assignment?.profileId || '';

        container.append(`
            <div class="character_assignment_item" data-character-id="${avatarFileName}">
                <span class="character_name">${char.name}</span>
                <select class="character_profile_select text_pole">
                    <option value="">Use active profile</option>
                    ${profileOptions.replace(`value="${selectedProfile}"`, `value="${selectedProfile}" selected`)}
                </select>
            </div>
        `);
    });

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

    // Remove existing assignment
    settings.characterAssignments = settings.characterAssignments.filter(a => a.characterId !== characterId);

    // Add new assignment if not empty
    if (profileId) {
        settings.characterAssignments.push({ characterId, profileId });
    }

    saveSettingsDebounced();
}
