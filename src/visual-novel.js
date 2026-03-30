/**
 * Visual Novel Mode for Expressions+
 */

import { getContext } from '../../../../extensions.js';
import { power_user } from '../../../../power-user.js';
import { onlyUnique } from '../../../../utils.js';
import { hideMutedSprites } from '../../../../group-chats.js';
import { dragElement } from '../../../../RossAscends-mods.js';

import { spriteCache, setSpriteCache, characterSegmentResults, lastExpression } from './state.js';
import { getSettings } from './settings.js';
import { 
    getSpritesList, 
    getSpriteFolderName, 
    chooseSpriteForExpression 
} from './sprites.js';
import { setImage, setDefaultEmojiForImage } from './expression-display.js';
import { updateCarousel } from './segment-carousel.js';

let validateImages = null;
let getExpressionLabel = null;

/**
 * Sets the validateImages function reference
 * @param {Function} fn 
 */
export function setValidateImagesFn(fn) {
    validateImages = fn;
}

/**
 * Sets the getExpressionLabel function reference
 * @param {Function} fn 
 */
export function setGetExpressionLabelFn(fn) {
    getExpressionLabel = fn;
}

// ============================================================================
// Visual Novel Mode
// ============================================================================

/**
 * Updates visual novel mode display
 * @param {string} spriteFolderName 
 * @param {string} expression 
 */
export async function updateVisualNovelMode(spriteFolderName, expression) {
    const vnContainer = $('#visual-novel-plus-wrapper');
    
    await visualNovelRemoveInactive(vnContainer);
    const setSpritePromises = await visualNovelSetCharacterSprites(vnContainer, spriteFolderName, expression);
    
    await visualNovelUpdateLayers(vnContainer);
    await Promise.allSettled(setSpritePromises);
    if (setSpritePromises.length > 0) {
        await visualNovelUpdateLayers(vnContainer);
    }
}

/**
 * Removes inactive characters from VN display
 * @param {JQuery} container 
 */
async function visualNovelRemoveInactive(container) {
    const context = getContext();
    const group = context.groups.find(x => x.id == context.groupId);
    const promises = [];

    container.find('.expression-plus-holder').each((_, current) => {
        const promise = new Promise(resolve => {
            const element = $(current);
            const avatar = element.data('avatar');

            if (!group.members.includes(avatar) || group.disabled_members.includes(avatar)) {
                element.fadeOut(250, () => {
                    element.remove();
                    resolve();
                });
            } else {
                resolve();
            }
        });
        promises.push(promise);
    });

    await Promise.allSettled(promises);
}

/**
 * Sets character sprites in VN mode
 * @param {JQuery} vnContainer 
 * @param {string} spriteFolderName 
 * @param {string} expression 
 * @returns {Promise<Promise<void>[]>}
 */
async function visualNovelSetCharacterSprites(vnContainer, spriteFolderName, expression) {
    const originalExpression = expression;
    const context = getContext();
    const group = context.groups.find(x => x.id == context.groupId);
    const settings = getSettings();
    const setSpritePromises = [];

    for (const avatar of group.members) {
        const isDisabled = group.disabled_members.includes(avatar);
        if (isDisabled && hideMutedSprites) continue;

        const character = context.characters.find(x => x.avatar == avatar);
        if (!character) continue;

        // Reset expression to the original for each member
        expression = originalExpression;

        const expressionImage = vnContainer.find(`.expression-plus-holder[data-avatar="${avatar}"]`);
        let img;

        const memberSpriteFolderName = getSpriteFolderName({ original_avatar: character.avatar }, character.name);
        const isSpeaker = !spriteFolderName || spriteFolderName == memberSpriteFolderName;

        if (spriteCache[memberSpriteFolderName] === undefined) {
            spriteCache[memberSpriteFolderName] = await getSpritesList(memberSpriteFolderName);
        }

        const prevExpressionSrc = expressionImage.find('img').attr('src') || null;

        if (!originalExpression && Array.isArray(spriteCache[memberSpriteFolderName]) && spriteCache[memberSpriteFolderName].length > 0) {
            expression = await getLastMessageSprite(avatar);
        } else if (originalExpression && !isSpeaker) {
            // Non-speaking characters: use their own last known expression
            // instead of the speaking character's expression
            const memberName = memberSpriteFolderName.split('/')[0] ?? memberSpriteFolderName;
            expression = lastExpression[memberName] ?? originalExpression;
        }

        const spriteFile = chooseSpriteForExpression(memberSpriteFolderName, expression, { prevExpressionSrc });
        
        if (expressionImage.length) {
            if (isSpeaker) {
                if (validateImages) {
                    await validateImages(memberSpriteFolderName, true);
                }
                const path = spriteFile?.imageSrc || '';
                img = expressionImage.find('img');
                await setImage(img, path);
                if (!spriteFile && settings.showDefault && expression) {
                    setDefaultEmojiForImage(img, expression);
                }
            }
            expressionImage.toggleClass('hidden', !spriteFile && !settings.showDefault);
        } else {
            const template = $('#expression-plus-holder').clone();
            template.attr('id', `expression-plus-${avatar}`);
            template.attr('data-avatar', avatar);
            template.find('.drag-grabber').attr('id', `expression-plus-${avatar}header`);
            $('#visual-novel-plus-wrapper').append(template);
            dragElement($(template[0]));
            template.toggleClass('hidden', !spriteFile && !settings.showDefault);
            img = template.find('img');
            if (spriteFile) {
                await setImage(img, spriteFile.imageSrc);
            } else if (settings.showDefault && expression) {
                setDefaultEmojiForImage(img, expression);
            } else {
                await setImage(img, '');
            }
            const fadeInPromise = new Promise(resolve => {
                template.fadeIn(250, () => resolve());
            });
            setSpritePromises.push(fadeInPromise);
        }

        if (!img) continue;

        img.attr('data-sprite-folder-name', spriteFolderName);
        img.attr('data-expression', expression);
        img.attr('data-sprite-filename', spriteFile?.fileName || null);
        img.attr('title', expression);

        const charSegResults = characterSegmentResults[character.name];
        if (charSegResults && charSegResults.length > 1) {
            updateCarousel(character.name, charSegResults, character.name, memberSpriteFolderName);
        }
    }

    return setSpritePromises;
}

/**
 * Gets the last message sprite for an avatar
 * @param {string} avatar 
 * @returns {Promise<string|null>}
 */
async function getLastMessageSprite(avatar) {
    const context = getContext();
    const lastMessage = context.chat.slice().reverse().find(x => 
        x.original_avatar == avatar || (x.force_avatar && x.force_avatar.includes(encodeURIComponent(avatar)))
    );

    if (lastMessage && getExpressionLabel) {
        return await getExpressionLabel(lastMessage.mes || '', lastMessage.name || '');
    }

    return null;
}

/**
 * Updates VN mode layer positions
 * @param {JQuery} container 
 */
async function visualNovelUpdateLayers(container) {
    const context = getContext();
    const group = context.groups.find(x => x.id == context.groupId);
    
    if (!group) {
        return;
    }
    
    const recentMessages = context.chat.map(x => x.original_avatar).filter(x => x).reverse().filter(onlyUnique);
    const filteredMembers = group.members.filter(x => !group.disabled_members.includes(x));
    
    const layerIndices = filteredMembers.slice().sort((a, b) => {
        const aRecentIndex = recentMessages.indexOf(a);
        const bRecentIndex = recentMessages.indexOf(b);
        const aFilteredIndex = filteredMembers.indexOf(a);
        const bFilteredIndex = filteredMembers.indexOf(b);

        if (aRecentIndex !== -1 && bRecentIndex !== -1) {
            return bRecentIndex - aRecentIndex;
        } else if (aRecentIndex !== -1) {
            return 1;
        } else if (bRecentIndex !== -1) {
            return -1;
        } else {
            return aFilteredIndex - bFilteredIndex;
        }
    });

    const setLayerIndicesPromises = [];
    const containerWidth = container.width();
    const pivotalPoint = containerWidth * 0.5;

    const sortFunction = (a, b) => {
        const avatarA = $(a).data('avatar');
        const avatarB = $(b).data('avatar');
        return filteredMembers.indexOf(avatarA) - filteredMembers.indexOf(avatarB);
    };

    let images = Array.from($('#visual-novel-plus-wrapper .expression-plus-holder')).sort(sortFunction);
    
    if (images.length === 0) {
        return;
    }
    
    let imagesWidth = [];

    for (const image of images) {
        const $image = $(image);
        $image.show();
        
        const img = $image.find('img')[0];
        if (img instanceof HTMLImageElement && !img.complete) {
            await new Promise(resolve => img.addEventListener('load', resolve, { once: true }));
        }
    }

    images.forEach((image) => {
        const width = $(image).width();
        imagesWidth.push(width);
    });

    let totalWidth = imagesWidth.reduce((a, b) => a + b, 0);
    let currentPosition = pivotalPoint - (totalWidth / 2);

    if (totalWidth > containerWidth) {
        let totalOverlap = totalWidth - containerWidth;
        let totalWidthWithoutWidest = imagesWidth.reduce((a, b) => a + b, 0) - Math.max(...imagesWidth);
        let overlaps = imagesWidth.map(width => (width / totalWidthWithoutWidest) * totalOverlap);
        imagesWidth = imagesWidth.map((width, index) => width - overlaps[index]);
        currentPosition = 0;
    }

    images.forEach((current, index) => {
        const element = $(current);
        const elementID = element.attr('id');
        const avatar = element.data('avatar');

        // Check if user has manually positioned this holder via movingUIState
        if (element.data('dragged') ||
            (elementID && power_user.movingUIState?.[elementID] &&
             typeof power_user.movingUIState[elementID] === 'object' &&
             Object.keys(power_user.movingUIState[elementID]).length > 0)) {
            if (elementID && power_user.movingUIState?.[elementID]) {
                element.css(power_user.movingUIState[elementID]);
            }
            return;
        }

        const layerIndex = layerIndices.indexOf(avatar);
        element.css('z-index', layerIndex);
        element.show();

        const promise = new Promise(resolve => {
            if (power_user.reduced_motion) {
                element.css('left', currentPosition + 'px');
                requestAnimationFrame(() => resolve());
            } else {
                element.animate({ left: currentPosition + 'px' }, 500, () => {
                    resolve();
                });
            }
        });

        currentPosition += imagesWidth[index];
        setLayerIndicesPromises.push(promise);
    });

    await Promise.allSettled(setLayerIndicesPromises);
}
