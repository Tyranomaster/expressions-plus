/**
 * Profile UI for Expressions+
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
import { Popup, POPUP_RESULT } from '../../../../popup.js';
import { DEFAULT_ACTIVE_PROFILE_ID, DEFAULT_PLUS_PROFILE_ID, DEFAULT_PROFILE_ID, FOLDER_PROFILE_FILENAME } from './constants.js';

import { getSettings } from './settings.js';
import { 
    getProfiles, 
    getActiveProfile, 
    createProfile, 
    deleteProfile, 
    exportProfile, 
    importProfile,
    renameProfile,
} from './profiles.js';

let renderRulesList = null;

/**
 * Sets the renderRulesList function reference
 * @param {Function} fn 
 */
export function setRenderRulesListFn(fn) {
    renderRulesList = fn;
}

// ============================================================================
// Profile UI
// ============================================================================

/**
 * Renders the profile selector dropdown
 */
export function renderProfileSelector() {
    const settings = getSettings();
    const profiles = getProfiles();
    const select = $('#expressions_plus_profile_select');
    
    select.empty();
    profiles.forEach(profile => {
        const option = document.createElement('option');
        option.value = profile.id;
        option.text = profile.name + (profile.id === DEFAULT_ACTIVE_PROFILE_ID ? ' (Default)' : '');
        option.selected = profile.id === settings.activeProfileId;
        select.append(option);
    });
}

/**
 * Handles creating a new profile
 */
export async function onClickCreateProfile() {
    const name = await Popup.show.input('Create Profile', 'Enter a name for the new profile:');
    if (!name) return;
    if (getProfiles().some(p => p.name === name)) {
        toast.error(`A profile named "${name}" already exists`);
        return;
    }
    const profiles = getProfiles();
    let copyFromId = null;
    
    if (profiles.length > 0) {
        const builtInOrder = [DEFAULT_PLUS_PROFILE_ID, DEFAULT_PROFILE_ID];
        const builtIn = builtInOrder
            .map(id => profiles.find(p => p.id === id))
            .filter(Boolean);
        const custom = profiles.filter(p => !builtInOrder.includes(p.id));

        const builtInOptions = builtIn.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
        const customOptions = custom.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
        const popupHtml = `
            <p>Which profile would you like to copy rules from?</p>
            <select id="copy_profile_select" class="text_pole">
                ${builtInOptions}
                ${customOptions}
            </select>
        `;
        
        const popup = new Popup(popupHtml, POPUP_RESULT.AFFIRMATIVE, '', {
            okButton: 'Continue',
            cancelButton: 'Cancel',
        });
        
        const result = await popup.show();
        
        if (result === POPUP_RESULT.AFFIRMATIVE) {
            copyFromId = String($(popup.dlg).find('#copy_profile_select').val() || '') || null;
        } else {
            return;
        }
    }

    const profile = createProfile(name, copyFromId);
    if (profile) {
        getSettings().activeProfileId = profile.id;
        saveSettingsDebounced();
        renderProfileSelector();
        if (renderRulesList) {
            renderRulesList();
        }
        toast.success(`Profile "${name}" created`);
    }
}

/**
 * Handles editing (renaming) the active profile
 */
export async function onClickEditProfile() {
    const profile = getActiveProfile();

    if (profile.isDefault) {
        toast.error('Cannot rename a built-in profile');
        return;
    }

    const newName = await Popup.show.input(
        'Rename Profile',
        `Enter a new name for the profile "${profile.name}":`,
        profile.name,
    );
    if (!newName || newName === profile.name) return;

    if (renameProfile(profile.id, newName)) {
        renderProfileSelector();
        toast.success(`Profile renamed to "${newName}"`);
    }
}

/**
 * Handles deleting the active profile
 */
export async function onClickDeleteProfile() {
    const profile = getActiveProfile();
    
    if (profile.isDefault) {
        toast.error('Cannot delete the default profile');
        return;
    }

    const confirmation = await Popup.show.confirm(
        'Delete Profile',
        `Are you sure you want to delete the profile "${profile.name}"?<br>This cannot be undone.`
    );
    
    if (!confirmation) return;

    if (deleteProfile(profile.id)) {
        renderProfileSelector();
        if (renderRulesList) {
            renderRulesList();
        }
        toast.success(`Profile "${profile.name}" deleted`);
    }
}

/**
 * Handles exporting the active profile
 */
export async function onClickExportProfile() {
    const profile = getActiveProfile();
    const json = exportProfile(profile.id);
    
    if (!json) {
        toast.error('Failed to export profile');
        return;
    }

    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `expressions-plus-profile-${profile.name.replace(/[^a-z0-9]/gi, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    toast.success(`Profile "${profile.name}" exported`);
}

/**
 * Handles importing a profile from file
 */
export async function onClickImportProfile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    
    input.onchange = async (e) => {
        const target = /** @type {HTMLInputElement} */ (e.target);
        const file = target.files?.[0];
        if (!file) return;

        try {
            const text = await file.text();
            const profile = importProfile(text);
            
            if (profile) {
                getSettings().activeProfileId = profile.id;
                saveSettingsDebounced();
                renderProfileSelector();
                if (renderRulesList) {
                    renderRulesList();
                }
            }
        } catch (error) {
            console.error('Import error:', error);
            toast.error('Failed to import profile');
        }
    };

    input.click();
}

/**
 * Handles exporting the active profile with a fixed filename for placement in a sprite folder
 */
export async function onClickExportProfileForFolder() {
    const profile = getActiveProfile();
    const json = exportProfile(profile.id);
    
    if (!json) {
        toast.error('Failed to export profile');
        return;
    }

    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = FOLDER_PROFILE_FILENAME;
    a.click();
    URL.revokeObjectURL(url);
    
    toast.success(`Profile "${profile.name}" exported as ${FOLDER_PROFILE_FILENAME}`);
}
