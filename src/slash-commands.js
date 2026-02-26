/**
 * Slash Commands for Expressions+
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
import { selected_group } from '../../../../group-chats.js';
import { getContext } from '../../../../extensions.js';
import { getCharaFilename } from '../../../../utils.js';
import { SlashCommandParser } from '../../../../slash-commands/SlashCommandParser.js';
import { SlashCommand } from '../../../../slash-commands/SlashCommand.js';
import { ARGUMENT_TYPE, SlashCommandArgument, SlashCommandNamedArgument } from '../../../../slash-commands/SlashCommandArgument.js';

import { getSettings } from './settings.js';
import { getProfiles, getActiveProfile } from './profiles.js';
import { getSpriteFolderName, getLastCharacterMessage, getFolderNameByMessage } from './sprites.js';
import { sendExpressionCall } from './expression-display.js';
import { 
    getExpressionSets, 
    setCharacterExpressionSet, 
    getCharacterExpressionSet,
    addExpressionSet,
    removeExpressionSet,
    dispatchExpressionSetChanged
} from './expression-sets.js';
import { clearSpriteCache } from './state.js';

let getExpressionLabel = null;
let renderProfileSelector = null;
let renderRulesList = null;
let renderCharacterAssignments = null;

/**
 * Sets the getExpressionLabel function reference
 * @param {Function} fn 
 */
export function setGetExpressionLabelFn(fn) {
    getExpressionLabel = fn;
}

/**
 * Sets the renderProfileSelector function reference
 * @param {Function} fn 
 */
export function setRenderProfileSelectorFn(fn) {
    renderProfileSelector = fn;
}

/**
 * Sets the renderRulesList function reference
 * @param {Function} fn 
 */
export function setRenderRulesListFn(fn) {
    renderRulesList = fn;
}

/**
 * Sets the renderCharacterAssignments function reference
 * @param {Function} fn 
 */
export function setRenderCharacterAssignmentsFn(fn) {
    renderCharacterAssignments = fn;
}

// ============================================================================
// Slash Commands
// ============================================================================

/**
 * Registers all slash commands for Expressions+
 */
export function registerSlashCommands() {
    // Expression set command
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'explus-set',
        aliases: ['exp-set'],
        callback: async (args, searchTermArg) => {
            const searchTerm = String(searchTermArg || '').trim().toLowerCase();
            if (!searchTerm) {
                toast.error('No expression name provided');
                return '';
            }

            const currentLastMessage = selected_group ? getLastCharacterMessage() : null;
            const spriteFolderName = getSpriteFolderName(currentLastMessage, currentLastMessage?.name);
            
            await sendExpressionCall(spriteFolderName, searchTerm, { force: true });
            toast.success(`Expression set to: ${searchTerm}`);
            return searchTerm;
        },
        namedArgumentList: [
            SlashCommandNamedArgument.fromProps({
                name: 'type',
                description: 'Type of set operation',
                typeList: [ARGUMENT_TYPE.STRING],
                isRequired: false,
                defaultValue: 'expression',
            }),
        ],
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: 'Expression label to set',
                typeList: [ARGUMENT_TYPE.STRING],
                isRequired: true,
            }),
        ],
        helpString: 'Force sets the expression for the current character using Expressions+.',
        returns: 'The set expression label.',
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'explus-classify',
        callback: async (_, textArg) => {
            const text = String(textArg || '');
            if (!text) {
                toast.error('No text provided');
                return '';
            }

            if (!getExpressionLabel) {
                toast.error('Expression label function not available');
                return '';
            }

            const label = await getExpressionLabel(text);
            console.debug(`Expressions+ classification result for "${text}": ${label}`);
            toast.info(`Classification result: ${label}`);
            return label;
        },
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: 'Text to classify',
                typeList: [ARGUMENT_TYPE.STRING],
                isRequired: true,
            }),
        ],
        returns: 'Emotion classification label for the given text.',
        helpString: 'Performs emotion classification using Expressions+ rules.',
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'explus-profile',
        callback: async (args, valueArg) => {
            const settings = getSettings();
            const action = String(args.action || 'get');
            const value = String(valueArg || '');
            
            switch (action) {
                case 'list': {
                    const profiles = getProfiles().map(p => p.name).join(', ');
                    toast.info(`Available profiles: ${profiles}`);
                    return profiles;
                }
                case 'get': {
                    const activeProfile = getActiveProfile().name;
                    toast.info(`Active profile: ${activeProfile}`);
                    return activeProfile;
                }
                case 'set': {
                    const profile = getProfiles().find(p => p.name.toLowerCase() === value.toLowerCase());
                    if (profile) {
                        settings.activeProfileId = profile.id;
                        saveSettingsDebounced();
                        if (renderProfileSelector) {
                            renderProfileSelector();
                        }
                        if (renderRulesList) {
                            renderRulesList();
                        }
                        toast.success(`Profile changed to: ${profile.name}`);
                        return profile.name;
                    }
                    toast.error(`Profile "${value}" not found`);
                    return '';
                }
                default: {
                    const defaultProfile = getActiveProfile().name;
                    toast.info(`Active profile: ${defaultProfile}`);
                    return defaultProfile;
                }
            }
        },
        namedArgumentList: [
            SlashCommandNamedArgument.fromProps({
                name: 'action',
                description: 'Action: list, get, set',
                typeList: [ARGUMENT_TYPE.STRING],
                defaultValue: 'get',
            }),
        ],
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: 'Profile name (for set action)',
                typeList: [ARGUMENT_TYPE.STRING],
                isRequired: false,
            }),
        ],
        returns: 'Profile name or list of profiles.',
        helpString: 'Manage Expressions+ profiles.',
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'explus-expressionset',
        aliases: ['exp-expressionset', 'explus-set-folder'],
        callback: async (args, valueArg) => {
            const action = String(args.action || 'get');
            const value = String(valueArg || '');
            const context = getContext();
            
            let characterId = '';
            if (args.character) {
                characterId = String(args.character);
            } else {
                const currentMessage = selected_group ? getLastCharacterMessage() : null;
                characterId = currentMessage 
                    ? getFolderNameByMessage(currentMessage)
                    : getCharaFilename();
            }
            
            if (!characterId) {
                toast.error('No character selected');
                return '';
            }
            
            switch (action) {
                case 'list': {
                    const sets = getExpressionSets(characterId);
                    const setNames = sets.map(s => s.name).join(', ');
                    toast.info(`Available expression sets: ${setNames}`);
                    return setNames;
                }
                case 'get': {
                    const currentSet = getCharacterExpressionSet(characterId);
                    const displayName = currentSet || 'Default (Base Folder)';
                    toast.info(`Current expression set: ${displayName}`);
                    return currentSet;
                }
                case 'set': {
                    if (!value) {
                        toast.error('No expression set name provided');
                        return '';
                    }
                    
                    const sets = getExpressionSets(characterId);
                    const targetSet = sets.find(s => 
                        s.name.toLowerCase() === value.toLowerCase() ||
                        s.folder.toLowerCase() === value.toLowerCase()
                    );
                    
                    if (targetSet) {
                        setCharacterExpressionSet(characterId, targetSet.folder);
                        clearSpriteCache();
                        saveSettingsDebounced();
                        
                        if (renderCharacterAssignments) {
                            renderCharacterAssignments();
                        }
                        
                        dispatchExpressionSetChanged(characterId, targetSet.folder);
                        
                        toast.success(`Expression set changed to: ${targetSet.name}`);
                        return targetSet.folder;
                    }
                    
                    toast.error(`Expression set "${value}" not found. Use action=add to add a new set.`);
                    return '';
                }
                case 'add': {
                    if (!value) {
                        toast.error('No folder name provided');
                        return '';
                    }
                    
                    const added = addExpressionSet(characterId, value);
                    
                    if (added) {
                        saveSettingsDebounced();
                        if (renderCharacterAssignments) {
                            renderCharacterAssignments();
                        }
                        toast.success(`Added expression set "${value}"`);
                        return value;
                    } else {
                        toast.error(`Expression set "${value}" already exists`);
                        return '';
                    }
                }
                case 'remove': {
                    if (!value) {
                        toast.error('No folder name provided');
                        return '';
                    }
                    
                    const removed = removeExpressionSet(characterId, value);
                    
                    if (removed) {
                        saveSettingsDebounced();
                        clearSpriteCache();
                        if (renderCharacterAssignments) {
                            renderCharacterAssignments();
                        }
                        toast.success(`Removed expression set "${value}"`);
                        return value;
                    } else {
                        toast.error(`Expression set "${value}" not found or cannot be removed`);
                        return '';
                    }
                }
                default: {
                    const currentSet = getCharacterExpressionSet(characterId);
                    const displayName = currentSet || 'Default (Base Folder)';
                    toast.info(`Current expression set: ${displayName}`);
                    return currentSet;
                }
            }
        },
        namedArgumentList: [
            SlashCommandNamedArgument.fromProps({
                name: 'action',
                description: 'Action: list, get, set, add, remove',
                typeList: [ARGUMENT_TYPE.STRING],
                defaultValue: 'get',
            }),
            SlashCommandNamedArgument.fromProps({
                name: 'character',
                description: 'Character avatar filename (optional, defaults to current)',
                typeList: [ARGUMENT_TYPE.STRING],
                isRequired: false,
            }),
        ],
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: 'Expression set/folder name (for set/add/remove actions)',
                typeList: [ARGUMENT_TYPE.STRING],
                isRequired: false,
            }),
        ],
        returns: 'Expression set name or list of sets.',
        helpString: 'Manage expression sets (sprite subfolders) for characters. Actions: list (show configured sets), get (show current), set (switch to a set), add (add a new folder name), remove (remove a folder name).',
    }));
}
