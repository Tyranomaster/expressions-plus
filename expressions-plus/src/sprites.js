/**
 * Sprite Management for Expressions+
 */

import { getContext, extension_settings } from '../../../../extensions.js';
import { getCharaFilename, onlyUnique } from '../../../../utils.js';
import { power_user } from '../../../../power-user.js';
import { isMobile } from '../../../../RossAscends-mods.js';
import { debounce_timeout } from '../../../../constants.js';
import { debounce } from '../../../../utils.js';
import { system_message_types } from '../../../../../script.js';

import { RESET_SPRITE_LABEL, RULE_TYPE } from './constants.js';
import { spriteCache } from './state.js';
import { getSettings } from './settings.js';
import { getActiveProfile } from './profiles.js';

// Forward declarations - will be set by index.js
let getExpressionsList = null;
let updateVisualNovelMode = null;

/**
 * Sets the getExpressionsList function reference
 * @param {Function} fn 
 */
export function setGetExpressionsListFn(fn) {
    getExpressionsList = fn;
}

/**
 * Sets the updateVisualNovelMode function reference
 * @param {Function} fn 
 */
export function setUpdateVisualNovelModeFn(fn) {
    updateVisualNovelMode = fn;
}

// ============================================================================
// Sprite Management
// ============================================================================

/**
 * Returns a placeholder image object for a given expression
 * @param {string} expression - The expression label
 * @param {boolean} [isCustom=false] - Whether the expression is custom
 * @returns {import('./constants.js').ExpressionImage}
 */
export function getPlaceholderImage(expression, isCustom = false) {
    const settings = getSettings();
    
    // Show default emoji if enabled and not a custom expression
    if (settings.showDefault && !isCustom) {
        return {
            expression: expression,
            isCustom: false,
            title: `${expression} (default)`,
            type: 'default',
            fileName: `${expression}.png`,
            imageSrc: `/img/default-expressions/${expression}.png`,
        };
    }
    
    return {
        expression: expression,
        isCustom: isCustom,
        title: 'No Image',
        type: 'failure',
        fileName: 'No-Image-Placeholder.svg',
        imageSrc: '/img/No-Image-Placeholder.svg',
    };
}

/**
 * Checks if visual novel mode is active
 * @returns {boolean}
 */
export function isVisualNovelMode() {
    return Boolean(!isMobile() && power_user.waifuMode && getContext().groupId);
}

/**
 * Forces an update of visual novel mode
 */
export async function forceUpdateVisualNovelMode() {
    if (isVisualNovelMode() && updateVisualNovelMode) {
        await updateVisualNovelMode();
    }
}

export const updateVisualNovelModeDebounced = debounce(forceUpdateVisualNovelMode, debounce_timeout.quick);

/**
 * Gets the expression image data from a sprite
 * @param {{ path: string, label: string }} sprite
 * @returns {import('./constants.js').ExpressionImage}
 */
export function getExpressionImageData(sprite) {
    const settings = getSettings();
    const fileName = sprite.path.split('/').pop().split('?')[0];
    const fileNameWithoutExtension = fileName.replace(/\.[^/.]+$/, '');
    return {
        expression: sprite.label,
        fileName: fileName,
        title: fileNameWithoutExtension,
        imageSrc: sprite.path,
        type: 'success',
        isCustom: settings.custom?.includes(sprite.label),
    };
}

/**
 * Fetches sprites list for a character
 * @param {string} name 
 * @returns {Promise<import('./constants.js').Expression[]>}
 */
export async function getSpritesList(name) {
    try {
        const result = await fetch(`/api/sprites/get?name=${encodeURIComponent(name)}`);
        let sprites = result.ok ? (await result.json()) : [];

        const grouped = sprites.reduce((acc, sprite) => {
            const imageData = getExpressionImageData(sprite);
            let existingExpression = acc.find(exp => exp.label === sprite.label);
            if (existingExpression) {
                existingExpression.files.push(imageData);
            } else {
                acc.push({ label: sprite.label, files: [imageData] });
            }
            return acc;
        }, []);

        for (const expression of grouped) {
            expression.files.sort((a, b) => {
                if (a.title === expression.label) return -1;
                if (b.title === expression.label) return 1;
                return a.title.localeCompare(b.title);
            });
            for (let i = 1; i < expression.files.length; i++) {
                expression.files[i].type = 'additional';
            }
        }

        return grouped;
    } catch (err) {
        console.error(err);
        return [];
    }
}

/**
 * Selects a sprite for an expression
 * @param {string} spriteFolderName 
 * @param {string} expression 
 * @param {Object} options 
 * @returns {import('./constants.js').ExpressionImage|null}
 */
export function chooseSpriteForExpression(spriteFolderName, expression, { prevExpressionSrc = null, overrideSpriteFile = null } = {}) {
    const settings = getSettings();
    
    if (!spriteCache[spriteFolderName]) return null;
    if (expression === RESET_SPRITE_LABEL) return null;

    let sprite = spriteCache[spriteFolderName].find(x => x.label === expression);
    
    // Try fallback expression
    if (!(sprite?.files.length > 0) && settings.fallback_expression) {
        sprite = spriteCache[spriteFolderName].find(x => x.label === settings.fallback_expression);
    }
    
    if (!(sprite?.files.length > 0)) return null;

    let spriteFile = sprite.files[0];

    if (overrideSpriteFile) {
        const searched = sprite.files.find(x => x.fileName === overrideSpriteFile);
        if (searched) spriteFile = searched;
    } else if (settings.allowMultiple && sprite.files.length > 1) {
        let possibleFiles = sprite.files;
        if (settings.rerollIfSame) {
            possibleFiles = possibleFiles.filter(x => !prevExpressionSrc || x.imageSrc !== prevExpressionSrc);
        }
        spriteFile = possibleFiles[Math.floor(Math.random() * possibleFiles.length)];
    }

    return spriteFile;
}

/**
 * Gets the sprite folder name for the current context
 * @param {Object} [characterMessage] 
 * @param {string} [characterName] 
 * @returns {string}
 */
export function getSpriteFolderName(characterMessage = null, characterName = null) {
    const context = getContext();
    let spriteFolderName = characterName ?? context.name2;
    const message = characterMessage ?? getLastCharacterMessage();
    const avatarFileName = getFolderNameByMessage(message);
    
    // Check for expression override in original extension settings
    const expressionOverride = extension_settings.expressionOverrides?.find(e => e.name == avatarFileName);
    if (expressionOverride && expressionOverride.path) {
        spriteFolderName = expressionOverride.path;
    }

    return spriteFolderName;
}

/**
 * Gets the folder name by message
 * @param {Object} message 
 * @returns {string}
 */
export function getFolderNameByMessage(message) {
    const context = getContext();
    let avatarPath = '';

    if (context.groupId) {
        avatarPath = message.original_avatar || context.characters.find(x => message.force_avatar && message.force_avatar.includes(encodeURIComponent(x.avatar)))?.avatar;
    } else if (context.characterId !== undefined) {
        avatarPath = getCharaFilename();
    }

    if (!avatarPath) return '';
    return avatarPath.replace(/\.[^/.]+$/, '');
}

/**
 * Gets the last character message from chat
 * @returns {{mes: string, name: string|null, original_avatar: string|null, force_avatar: string|null}}
 */
export function getLastCharacterMessage() {
    const context = getContext();
    const reversedChat = context.chat.slice().reverse();

    for (let mes of reversedChat) {
        if (mes.is_user || mes.is_system || mes.extra?.type === system_message_types.NARRATOR) {
            continue;
        }
        return { mes: mes.mes, name: mes.name, original_avatar: mes.original_avatar, force_avatar: mes.force_avatar };
    }

    return { mes: '', name: null, original_avatar: null, force_avatar: null };
}

/**
 * Validate images for a character
 * @param {string} spriteFolderName 
 * @param {boolean} forceRedrawCached 
 * @param {Function} drawSpritesList - Function to draw sprites list
 */
export async function validateImages(spriteFolderName, forceRedrawCached = false, drawSpritesList = null) {
    if (!spriteFolderName) return;

    const labels = await getExpressionsList();

    if (spriteCache[spriteFolderName]) {
        if (forceRedrawCached && drawSpritesList && $('#expresssions_plus_image_list').data('name') !== spriteFolderName) {
            await drawSpritesList(spriteFolderName, labels, spriteCache[spriteFolderName]);
        }
        return;
    }

    const sprites = await getSpritesList(spriteFolderName);
    if (drawSpritesList) {
        let validExpressions = await drawSpritesList(spriteFolderName, labels, sprites);
        spriteCache[spriteFolderName] = validExpressions;
    } else {
        spriteCache[spriteFolderName] = sprites;
    }
}

/**
 * Draw the sprites list in the UI
 * @param {string} spriteFolderName 
 * @param {string[]} labels 
 * @param {import('./constants.js').Expression[]} sprites 
 * @param {Function} createListItemHtml - Function to create list item HTML
 * @returns {Promise<import('./constants.js').Expression[]>}
 */
export async function drawSpritesList(spriteFolderName, labels, sprites, createListItemHtml) {
    let validExpressions = [];

    $('#expressions_plus_no_chat').hide();
    $('#expressions_plus_open_chat').show();
    $('#expresssions_plus_image_list').empty();
    $('#expresssions_plus_image_list').data('name', spriteFolderName);
    $('#expressions_plus_image_list_header_name').text(spriteFolderName);

    if (!Array.isArray(labels)) return [];

    // Get custom expression names from current profile
    const profile = getActiveProfile();
    const customExpressionNames = profile.rules
        .filter(r => r.type !== RULE_TYPE.SIMPLE)
        .map(r => r.name);
    
    // Combine base labels with custom expression names
    const allLabels = [...labels, ...customExpressionNames].filter(onlyUnique).sort();

    for (const expression of allLabels) {
        const isCustom = customExpressionNames.includes(expression);
        const images = sprites
            .filter(s => s.label === expression)
            .map(s => s.files)
            .flat();

        if (images.length === 0) {
            const html = createListItemHtml(expression, [getPlaceholderImage(expression, isCustom)], isCustom);
            $('#expresssions_plus_image_list').append(html);
            continue;
        }

        validExpressions.push({ label: expression, files: images });
        const html = createListItemHtml(expression, images, isCustom);
        $('#expresssions_plus_image_list').append(html);
    }

    return validExpressions;
}

/**
 * Creates HTML for a list item
 * @param {string} expression 
 * @param {import('./constants.js').ExpressionImage[]} images 
 * @param {boolean} isCustom 
 * @returns {string}
 */
export function createListItemHtml(expression, images, isCustom) {
    return images.map(image => `
        <div class="expression_plus_list_item interactable" 
             data-expression="${expression}" 
             data-expression-type="${image.type}" 
             data-filename="${image.fileName}">
            <div class="expression_plus_list_buttons">
                <div class="menu_button expression_plus_list_upload" title="Upload image">
                    <i class="fa-solid fa-upload"></i>
                </div>
                <div class="menu_button expression_plus_list_delete" title="Delete image">
                    <i class="fa-solid fa-trash"></i>
                </div>
            </div>
            <div class="expression_plus_list_title">
                <span>${expression}</span>
                ${isCustom ? '<small class="expression_plus_list_custom">(custom)</small>' : ''}
            </div>
            <div class="expression_plus_list_image_container" title="${image.title}">
                <img class="expression_plus_list_image" src="${image.imageSrc}" alt="${image.title}" />
            </div>
        </div>
    `).join('');
}
