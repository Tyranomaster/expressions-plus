/**
 * Profile UI for Expressions+
 */

/* global toastr */

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

import { getSettings } from './settings.js';
import { 
    getProfiles, 
    getActiveProfile, 
    createProfile, 
    deleteProfile, 
    exportProfile, 
    importProfile 
} from './profiles.js';

// Forward declarations - will be set by index.js
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
        option.text = profile.name + (profile.isDefault ? ' (Default)' : '');
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

    // Check for duplicate name
    if (getProfiles().some(p => p.name === name)) {
        toast.error(`A profile named "${name}" already exists`);
        return;
    }

    // Ask if they want to copy from existing profile
    const profiles = getProfiles();
    let copyFromId = null;
    
    if (profiles.length > 0) {
        const copyOptions = profiles.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
        const popupHtml = `
            <p>Would you like to copy rules from an existing profile?</p>
            <select id="copy_profile_select" class="text_pole">
                <option value="">Start empty</option>
                ${copyOptions}
            </select>
        `;
        
        const popup = new Popup(popupHtml, POPUP_RESULT.AFFIRMATIVE, '', {
            okButton: 'Continue',
            cancelButton: 'Cancel',
        });
        
        const result = await popup.show();
        
        if (result === POPUP_RESULT.AFFIRMATIVE) {
            copyFromId = String($(popup.dlg).find('#copy_profile_select').val() || '') || null;
        } else if (result === null) {
            return; // Cancelled
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
