/**
 * Expression Display for Expressions+
 */

import { getContext } from '../../../../extensions.js';

import { RESET_SPRITE_LABEL } from './constants.js';
import { lastExpression, spriteCache, setLastMessage } from './state.js';
import { getSettings } from './settings.js';

// Forward declarations - will be set by index.js
let validateImages = null;
let updateVisualNovelMode = null;
let isVisualNovelMode = null;
let chooseSpriteForExpression = null;

/**
 * Sets the validateImages function reference
 * @param {Function} fn 
 */
export function setValidateImagesFn(fn) {
    validateImages = fn;
}

/**
 * Sets the updateVisualNovelMode function reference
 * @param {Function} fn 
 */
export function setUpdateVisualNovelModeFn(fn) {
    updateVisualNovelMode = fn;
}

/**
 * Sets the isVisualNovelMode function reference
 * @param {Function} fn 
 */
export function setIsVisualNovelModeFn(fn) {
    isVisualNovelMode = fn;
}

/**
 * Sets the chooseSpriteForExpression function reference
 * @param {Function} fn 
 */
export function setChooseSpriteForExpressionFn(fn) {
    chooseSpriteForExpression = fn;
}

// ============================================================================
// Expression Display
// ============================================================================

/**
 * Removes expression from display
 */
export function removeExpression() {
    setLastMessage(null);
    $('img.expression-plus').off('error');
    $('img.expression-plus').prop('src', '');
    $('img.expression-plus').removeClass('default');
    $('#expressions_plus_open_chat').hide();
    $('#expressions_plus_no_chat').show();
}

/**
 * Sets the image with animation
 * @param {JQuery} img 
 * @param {string} path 
 */
export async function setImage(img, path) {
    return new Promise(resolve => {
        const prevExpressionSrc = img.attr('src');
        const expressionClone = img.clone();
        const originalId = img.data('filename');

        if (prevExpressionSrc !== path && !img.hasClass('expression-plus-animating')) {
            expressionClone.addClass('expression-plus-clone');
            expressionClone.data('filename', '').css({ opacity: 0 });
            expressionClone.attr('src', path);
            expressionClone.appendTo(img.parent());

            const duration = 200;
            img.addClass('expression-plus-animating');

            const imgWidth = img.width();
            const imgHeight = img.height();
            const expressionHolder = img.parent();
            expressionHolder.css('min-width', imgWidth > 100 ? imgWidth : 100);
            expressionHolder.css('min-height', imgHeight > 100 ? imgHeight : 100);

            img.css('position', 'absolute').width(imgWidth).height(imgHeight);
            expressionClone.addClass('expression-plus-animating');
            
            expressionClone.css({ opacity: 0 }).animate({ opacity: 1 }, duration)
                .promise().done(function () {
                    img.animate({ opacity: 0 }, duration);
                    img.remove();
                    expressionClone.data('filename', originalId);
                    expressionClone.removeClass('expression-plus-animating');
                    expressionHolder.css('min-width', 100);
                    expressionHolder.css('min-height', 100);

                    if (expressionClone.prop('complete')) {
                        resolve();
                    } else {
                        expressionClone.one('load', () => resolve());
                    }
                });

            expressionClone.removeClass('expression-plus-clone');
            expressionClone.removeClass('default');
            expressionClone.off('error');
            expressionClone.on('error', function () {
                $(this).attr('src', '');
                $(this).off('error');
                resolve();
            });
        } else {
            resolve();
        }
    });
}

/**
 * Sets the default emoji expression image for the given image element
 * @param {JQuery<HTMLElement>} img - The image element to set the default expression for
 * @param {string} expression - The expression label to use for the default image
 */
export function setDefaultEmojiForImage(img, expression) {
    const settings = getSettings();
    
    // Can't set default emoji for custom expressions
    if (settings.custom?.includes(expression)) {
        console.debug(`Can't set default emoji for custom expression (${expression}), setting to neutral instead.`);
        expression = 'neutral';
    }

    const defImgUrl = `/img/default-expressions/${expression}.png`;
    img.attr('src', defImgUrl);
    img.attr('data-expression', expression);
    img.attr('data-sprite-filename', null);
    img.attr('title', expression);
    img.addClass('default');
}

/**
 * Clears the image element to display no expression
 * @param {JQuery<HTMLElement>} img - The image element to clear
 * @param {string} expression - The expression label
 */
export function setNoneForImage(img, expression) {
    img.attr('src', '');
    img.attr('data-expression', expression);
    img.attr('data-sprite-filename', null);
    img.attr('title', expression);
    img.removeClass('default');
}

/**
 * Sets the expression for a character
 * @param {string} spriteFolderName 
 * @param {string} expression 
 * @param {Object} options 
 */
export async function setExpression(spriteFolderName, expression, { force = false, overrideSpriteFile = null } = {}) {
    if (validateImages) {
        await validateImages(spriteFolderName);
    }
    const img = $('img.expression-plus');
    const prevExpressionSrc = img.attr('src');
    const expressionClone = img.clone();

    const spriteFile = chooseSpriteForExpression(spriteFolderName, expression, { 
        prevExpressionSrc, 
        overrideSpriteFile 
    });
    
    if (spriteFile) {
        if (force && isVisualNovelMode()) {
            const context = getContext();
            const group = context.groups.find(x => x.id === context.groupId);
            const memberName = spriteFolderName.split('/')[0] ?? spriteFolderName;

            const groupMember = group.members
                .map(member => context.characters.find(x => x.avatar === member))
                .find(gm => gm && gm.name === memberName);
                
            if (groupMember) {
                await setImage($(`.expression-plus-holder[data-avatar="${groupMember.avatar}"] img`), spriteFile.imageSrc);
                return;
            }
        }

        if (prevExpressionSrc !== spriteFile.imageSrc && !img.hasClass('expression-plus-animating')) {
            expressionClone.addClass('expression-plus-clone');
            expressionClone.attr('id', '').css({ opacity: 0 });
            expressionClone.attr('src', spriteFile.imageSrc);
            expressionClone.attr('data-sprite-folder-name', spriteFolderName);
            expressionClone.attr('data-expression', expression);
            expressionClone.attr('data-sprite-filename', spriteFile.fileName);
            expressionClone.attr('title', expression);
            expressionClone.appendTo($('#expression-plus-holder'));

            const duration = 200;
            img.addClass('expression-plus-animating');

            const imgWidth = img.width();
            const imgHeight = img.height();
            const expressionHolder = img.parent();
            expressionHolder.css('min-width', imgWidth > 100 ? imgWidth : 100);
            expressionHolder.css('min-height', imgHeight > 100 ? imgHeight : 100);

            img.css('position', 'absolute').width(imgWidth).height(imgHeight);
            expressionClone.addClass('expression-plus-animating');
            
            expressionClone.css({ opacity: 0 }).animate({ opacity: 1 }, duration)
                .promise().done(function () {
                    img.animate({ opacity: 0 }, duration);
                    img.remove();
                    expressionClone.attr('id', 'expression-plus-image');
                    expressionClone.removeClass('expression-plus-animating');
                    expressionHolder.css('min-width', 100);
                    expressionHolder.css('min-height', 100);
                });

            expressionClone.removeClass('expression-plus-clone');
            expressionClone.removeClass('default');
            expressionClone.off('error');
            expressionClone.on('error', function (error) {
                $(this).attr('src', '');
                $(this).off('error');
            });
        }

        console.info('Expression+ set', { expression: spriteFile.expression, file: spriteFile.fileName });
    } else {
        const settings = getSettings();
        img.attr('data-sprite-folder-name', spriteFolderName);
        
        img.off('error');
        
        if (settings.showDefault && expression !== RESET_SPRITE_LABEL) {
            setDefaultEmojiForImage(img, expression);
        } else {
            setNoneForImage(img, expression);
        }
        
        console.debug('Expression+ not found:', expression);
    }

    // Show the expression holder
    document.getElementById('expression-plus-holder').style.display = '';
}

/**
 * Sends expression update
 * @param {string} spriteFolderName 
 * @param {string} expression 
 * @param {Object} options 
 */
export async function sendExpressionCall(spriteFolderName, expression, { force = false, vnMode = null, overrideSpriteFile = null } = {}) {
    lastExpression[spriteFolderName.split('/')[0]] = expression;
    
    if (vnMode === null) {
        vnMode = isVisualNovelMode();
    }

    if (vnMode && updateVisualNovelMode) {
        await updateVisualNovelMode(spriteFolderName, expression);
    } else {
        setExpression(spriteFolderName, expression, { force, overrideSpriteFile });
    }
}
