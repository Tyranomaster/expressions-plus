/**
 * Slash Commands for Expressions+
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
import { selected_group } from '../../../../group-chats.js';
import { SlashCommandParser } from '../../../../slash-commands/SlashCommandParser.js';
import { SlashCommand } from '../../../../slash-commands/SlashCommand.js';
import { ARGUMENT_TYPE, SlashCommandArgument, SlashCommandNamedArgument } from '../../../../slash-commands/SlashCommandArgument.js';

import { getSettings } from './settings.js';
import { getProfiles, getActiveProfile } from './profiles.js';
import { getSpriteFolderName, getLastCharacterMessage } from './sprites.js';
import { sendExpressionCall } from './expression-display.js';

// Forward declarations - will be set by index.js
let getExpressionLabel = null;
let renderProfileSelector = null;
let renderRulesList = null;

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

    // Classify command
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

    // Profile commands
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
}
