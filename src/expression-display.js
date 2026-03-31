/**
 * Expression Display for Expressions+
 */

import { getContext } from '../../../../extensions.js';
import { dragElement } from '../../../../RossAscends-mods.js';
import { power_user } from '../../../../power-user.js';

import { RESET_SPRITE_LABEL } from './constants.js';
import { lastExpression, spriteCache, setLastMessage, lastSegmentResults, lastScenarioDetected, characterSegmentResults, currentCharacterAvatar } from './state.js';
import { getSettings } from './settings.js';
import { updateCarousel, removeCarousel, clearAllCarousels } from './segment-carousel.js';
import { restoreCharacterLayout } from './sprite-layout.js';
import { getSpritesList, chooseSpriteForExpression as chooseSpriteForExpressionDirect } from './sprites.js';

let validateImages = null;
let updateVisualNovelMode = null;
let isVisualNovelMode = null;
let chooseSpriteForExpression = null;

/** Tracks the previous scenario detection state for carousel cleanup */
let _prevScenarioState = false;

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
    $('#expression-plus-holder').css({ height: '', width: '' });
    $('#expressions_plus_open_chat').hide();
    $('#expressions_plus_no_chat').show();
    clearAllCarousels();
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
                    expressionHolder.css({ height: '', width: '' });

                    // Re-apply per-character saved layout for single-sprite holder only
                    if (expressionHolder.attr('id') === 'expression-plus-holder') {
                        restoreCharacterLayout(currentCharacterAvatar);
                    }

                    // Reinitialize drag to reset stale dimension closures
                    if (expressionHolder.attr('id')) {
                        dragElement(expressionHolder);
                    }

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
    
    if (settings.custom?.includes(expression)) {
        console.debug(`Can't set default emoji for custom expression (${expression}), setting to neutral instead.`);
        expression = 'neutral';
    }

    const defImgUrl = new URL(`../built-in-sprites/default-plus/${expression}.png`, import.meta.url).toString();
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

// ============================================================================
// Scenario Sprite Folder Resolution
// ============================================================================

/**
 * Resolves the sprite folder for a detected scenario character.
 *
 * Resolution order:
 * 1. Try subfolder: {mainFolder}/{charName}; if it has sprites → use it
 * 2. Fall back to the main character's sprite folder (if it has sprites)
 * 3. No sprites anywhere → return null (use built-in defaults)
 *
 * @param {string} charName - Detected character name from scenario parsing
 * @param {string} mainSpriteFolderName - The card character's sprite folder
 * @returns {Promise<string|null>} Resolved folder path, or null if no sprites exist anywhere
 */
async function resolveScenarioSpriteFolder(charName, mainSpriteFolderName) {
    // Ensure main folder sprites are cached
    if (spriteCache[mainSpriteFolderName] === undefined) {
        spriteCache[mainSpriteFolderName] = await getSpritesList(mainSpriteFolderName);
    }

    // Try character subfolder: mainFolder/charName
    const subfolderPath = `${mainSpriteFolderName}/${charName}`;
    if (spriteCache[subfolderPath] === undefined) {
        spriteCache[subfolderPath] = await getSpritesList(subfolderPath);
    }

    // If subfolder has sprites, use it
    if (Array.isArray(spriteCache[subfolderPath]) && spriteCache[subfolderPath].length > 0) {
        return subfolderPath;
    }

    // Fall back to main character's sprites if available
    if (Array.isArray(spriteCache[mainSpriteFolderName]) && spriteCache[mainSpriteFolderName].length > 0) {
        return mainSpriteFolderName;
    }

    // No sprites in subfolder or main folder → use built-in defaults
    return null;
}

// ============================================================================
// Scenario Multi-Sprite Display
// ============================================================================

/**
 * Updates the multi-sprite display for scenario mode.
 * Creates/updates one sprite holder per detected character in the VN wrapper,
 * then positions them side-by-side.
 * @param {string} mainSpriteFolderName - The card character's sprite folder
 */
async function updateScenarioDisplay(mainSpriteFolderName) {
    const settings = getSettings();
    const vnWrapper = $('#visual-novel-plus-wrapper');

    // Show VN wrapper, hide single-sprite wrapper
    $('#expression-plus-wrapper').hide();
    vnWrapper.show();

    const detectedChars = Object.keys(characterSegmentResults);

    // Remove holders for characters no longer detected
    vnWrapper.find('.expression-plus-holder[data-scenario-char]').each((_, el) => {
        const charName = $(el).attr('data-scenario-char');
        if (!detectedChars.includes(charName)) {
            $(el).remove();
        }
    });

    for (const charName of detectedChars) {
        const results = characterSegmentResults[charName];
        if (!results || results.length === 0) continue;

        // Resolve sprite folder: main → subfolder → fallback to main
        const resolvedFolder = await resolveScenarioSpriteFolder(charName, mainSpriteFolderName);
        const spriteFolderName = resolvedFolder || mainSpriteFolderName;

        // Get the expression from the last segment result
        const lastResult = results[results.length - 1];
        const expression = lastResult?.expression || 'neutral';

        // Find or create the holder
        const safeAttr = CSS.escape(charName);
        let holder = vnWrapper.find(`.expression-plus-holder[data-scenario-char="${safeAttr}"]`);
        let img;

        // Try to find a sprite file (null when resolvedFolder is null → no sprites anywhere)
        const spriteFile = resolvedFolder
            ? chooseSpriteForExpressionDirect(spriteFolderName, expression, {
                prevExpressionSrc: holder.find('img').attr('src') || null,
            })
            : null;

        // Show holder if we have a sprite OR showDefault is enabled
        const shouldShow = spriteFile || settings.showDefault;

        if (holder.length) {
            img = holder.find('img');
            if (spriteFile) {
                await setImage(img, spriteFile.imageSrc);
            } else if (settings.showDefault) {
                setDefaultEmojiForImage(img, expression);
            }
            // Update the name label text (in case charName changed)
            holder.find('.expression-plus-scenario-label').text(charName);
            holder.toggleClass('hidden', !shouldShow);
        } else {
            // Create from the template
            const template = $('#expression-plus-holder').clone();
            template.removeAttr('id');
            const safeId = charName.replace(/[^a-zA-Z0-9_-]/g, '_');
            template.attr('id', `expression-plus-scenario-${safeId}`);
            template.attr('data-scenario-char', charName);
            template.find('.drag-grabber').attr('id', `expression-plus-scenario-${safeId}header`);

            // Add character name label above the sprite
            const label = $('<div class="expression-plus-scenario-label"></div>').text(charName);
            template.find('img').before(label);

            vnWrapper.append(template);
            dragElement($(template[0]));
            template.toggleClass('hidden', !shouldShow);
            img = template.find('img');
            img.removeAttr('id');
            img.addClass('expression-plus');

            if (spriteFile) {
                await setImage(img, spriteFile.imageSrc);
            } else if (settings.showDefault) {
                setDefaultEmojiForImage(img, expression);
            }

            template.fadeIn(250);
        }

        if (img) {
            img.attr('data-sprite-folder-name', spriteFolderName);
            img.attr('data-expression', expression);
            img.attr('data-sprite-filename', spriteFile?.fileName || null);
            img.attr('title', `${charName}: ${expression}`);
        }
    }

    await positionScenarioSprites(vnWrapper);
}

/**
 * Positions scenario sprite holders side-by-side in the VN wrapper,
 * similar to group chat VN mode layout.
 * @param {JQuery} container - The VN wrapper container
 */
async function positionScenarioSprites(container) {
    const images = container.find('.expression-plus-holder[data-scenario-char]:not(.hidden)').toArray();
    if (images.length === 0) return;

    // Wait for images to load
    for (const el of images) {
        const imgEl = $(el).find('img')[0];
        if (imgEl instanceof HTMLImageElement && !imgEl.complete) {
            await new Promise(resolve => imgEl.addEventListener('load', resolve, { once: true }));
        }
    }

    const containerWidth = container.width();
    const pivotalPoint = containerWidth * 0.5;

    const widths = images.map(el => $(el).width());
    let totalWidth = widths.reduce((a, b) => a + b, 0);
    let currentPosition = pivotalPoint - (totalWidth / 2);

    // Handle overlap when total width exceeds container
    if (totalWidth > containerWidth) {
        const totalOverlap = totalWidth - containerWidth;
        const totalWidthWithoutWidest = totalWidth - Math.max(...widths);
        if (totalWidthWithoutWidest > 0) {
            const overlaps = widths.map(w => (w / totalWidthWithoutWidest) * totalOverlap);
            for (let i = 0; i < widths.length; i++) {
                widths[i] -= overlaps[i];
            }
        }
        currentPosition = 0;
    }

    // Z-index: last character (most recent speaker) gets highest
    const maxZ = images.length;

    for (let i = 0; i < images.length; i++) {
        const el = $(images[i]);
        const elId = el.attr('id');

        // Don't reposition if user has dragged it or it has saved movingUIState
        if (el.data('dragged') ||
            (elId && power_user.movingUIState?.[elId] &&
             typeof power_user.movingUIState[elId] === 'object' &&
             Object.keys(power_user.movingUIState[elId]).length > 0)) {
            if (elId && power_user.movingUIState?.[elId]) {
                el.css(power_user.movingUIState[elId]);
            }
            currentPosition += widths[i];
            continue;
        }

        el.css('z-index', i === images.length - 1 ? maxZ : i);
        el.show();

        if (power_user.reduced_motion) {
            el.css('left', currentPosition + 'px');
        } else {
            el.animate({ left: currentPosition + 'px' }, 500);
        }

        currentPosition += widths[i];
    }
}

/**
 * Removes all scenario-specific sprite holders from the VN wrapper.
 */
function cleanupScenarioHolders() {
    $('#visual-novel-plus-wrapper .expression-plus-holder[data-scenario-char]').remove();
}

/**
 * Updates a single character's sprite in an existing scenario holder.
 * Used by carousel navigation in scenario mode to avoid destroying all holders.
 * @param {string} characterKey - The detected character name (matches data-scenario-char attribute)
 * @param {string} spriteFolderName - The resolved sprite folder name
 * @param {string} expression - The expression label
 */
async function updateScenarioCharacterSprite(characterKey, spriteFolderName, expression) {
    const vnWrapper = $('#visual-novel-plus-wrapper');

    const safeAttr = CSS.escape(characterKey);
    const holder = vnWrapper.find(`.expression-plus-holder[data-scenario-char="${safeAttr}"]`);
    if (!holder.length) return;

    const img = holder.find('img');
    if (!img.length) return;

    const spriteFile = chooseSpriteForExpressionDirect(spriteFolderName, expression, {
        prevExpressionSrc: img.attr('src') || null,
    });

    if (spriteFile) {
        await setImage(img, spriteFile.imageSrc);
        img.attr('data-expression', expression);
        img.attr('data-sprite-filename', spriteFile.fileName);
        img.attr('title', `${characterKey}: ${expression}`);
        holder.removeClass('hidden');
    } else {
        const settings = getSettings();
        if (settings.showDefault && expression !== RESET_SPRITE_LABEL) {
            setDefaultEmojiForImage(img, expression);
            holder.removeClass('hidden');
        } else {
            setNoneForImage(img, expression);
        }
    }
}

/**
 * Updates a single character's sprite in a VN group-chat holder.
 * Used by carousel navigation in VN mode to target only one character's
 * data-avatar holder, avoiding setExpression's broad $('img.expression-plus') selector.
 * @param {string} spriteFolderName - The character's sprite folder
 * @param {string} expression - The expression label
 */
async function updateVnCharacterSprite(spriteFolderName, expression) {
    const context = getContext();
    const group = context.groups?.find(x => x.id == context.groupId);
    if (!group) return;

    const memberName = spriteFolderName.split('/')[0] ?? spriteFolderName;
    const groupMember = group.members
        .map(member => context.characters.find(x => x.avatar === member))
        .find(gm => gm && gm.name === memberName);
    if (!groupMember) return;

    const holder = $(`#visual-novel-plus-wrapper .expression-plus-holder[data-avatar="${groupMember.avatar}"]`);
    if (!holder.length) return;

    const img = holder.find('img');
    if (!img.length) return;

    const spriteFile = chooseSpriteForExpressionDirect(spriteFolderName, expression, {
        prevExpressionSrc: img.attr('src') || null,
    });

    if (spriteFile) {
        await setImage(img, spriteFile.imageSrc);
        img.attr('data-expression', expression);
        img.attr('data-sprite-filename', spriteFile.fileName);
        img.attr('title', expression);
        holder.removeClass('hidden');
    } else {
        const settings = getSettings();
        if (settings.showDefault && expression !== RESET_SPRITE_LABEL) {
            setDefaultEmojiForImage(img, expression);
            holder.removeClass('hidden');
        } else {
            setNoneForImage(img, expression);
        }
    }
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
                    expressionHolder.css({ height: '', width: '' });

                    // Re-apply per-character saved layout if available
                    restoreCharacterLayout(currentCharacterAvatar);

                    // Reinitialize drag to reset stale dimension closures
                    if (expressionHolder.attr('id')) {
                        dragElement(expressionHolder);
                    }
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

    document.getElementById('expression-plus-holder').style.display = '';
}

/**
 * Sends expression update
 * @param {string} spriteFolderName 
 * @param {string} expression 
 * @param {Object} options 
 */
export async function sendExpressionCall(spriteFolderName, expression, { force = false, vnMode = null, overrideSpriteFile = null, isCarouselNavigation = false, scenarioCharacterKey = null } = {}) {
    lastExpression[spriteFolderName.split('/')[0]] = expression;
    
    if (vnMode === null) {
        vnMode = isVisualNovelMode();
    }

    // Scenario multi-sprite display (non-group, non-VN, non-carousel)
    if (lastScenarioDetected && !isCarouselNavigation) {
        await updateScenarioDisplay(spriteFolderName);
    } else if (lastScenarioDetected && isCarouselNavigation) {
        // Carousel navigation in scenario mode: update only the targeted character's sprite
        await updateScenarioCharacterSprite(scenarioCharacterKey || spriteFolderName, spriteFolderName, expression);
    } else {
        // Normal mode: clean up any leftover scenario holders
        cleanupScenarioHolders();

        if (vnMode && updateVisualNovelMode && !isCarouselNavigation) {
            await updateVisualNovelMode(spriteFolderName, expression);
        } else if (vnMode && isCarouselNavigation) {
            // VN carousel navigation: directly target the specific character's holder
            await updateVnCharacterSprite(spriteFolderName, expression);
        } else {
            // Restore single-sprite wrapper visibility when not in scenario or VN mode
            if (!$('#expression-plus-wrapper').is(':visible') && !vnMode) {
                $('#expression-plus-wrapper').show();
                $('#visual-novel-plus-wrapper').hide();
            }
            setExpression(spriteFolderName, expression, { force, overrideSpriteFile });
        }
    }

    // Carousel updates
    if (!isCarouselNavigation) {
        // Clear all carousels when scenario detection state changes
        if (lastScenarioDetected !== _prevScenarioState) {
            clearAllCarousels();
            _prevScenarioState = lastScenarioDetected;
        }

        if (lastScenarioDetected) {
            // Scenario mode: update carousel with one row per detected character
            for (const [charName, results] of Object.entries(characterSegmentResults)) {
                if (!results || results.length === 0) continue;
                const resolvedFolder = await resolveScenarioSpriteFolder(charName, spriteFolderName);
                const charSpriteFolderName = resolvedFolder || spriteFolderName;
                updateCarousel(charName, results, charName, charSpriteFolderName);
            }
        } else {
            const characterKey = spriteFolderName.split('/')[0] ?? spriteFolderName;
            const segResults = lastSegmentResults;
            if (segResults && segResults.length > 1) {
                const displayName = spriteFolderName.split('/')[0] ?? spriteFolderName;
                updateCarousel(characterKey, segResults, displayName, spriteFolderName);
            } else {
                removeCarousel(characterKey);
            }
        }
    }
}
