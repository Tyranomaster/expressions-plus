/**
 * Module Worker for Expressions+
 */

import { getContext } from '../../../../extensions.js';

import { STREAMING_UPDATE_INTERVAL } from './constants.js';
import {
    expressionsList,
    lastCharacter,
    lastMessage,
    spriteCache,
    lastServerResponseTime,
    setExpressionsList,
    setLastCharacter,
    setLastMessage,
    setLastServerResponseTime,
    clearSpriteCache,
} from './state.js';
import { getSettings } from './settings.js';
import { 
    isVisualNovelMode, 
    forceUpdateVisualNovelMode,
    getSpriteFolderName,
    getLastCharacterMessage,
} from './sprites.js';
import { removeExpression, sendExpressionCall } from './expression-display.js';

// Forward declarations - will be set by index.js
let validateImages = null;
let getExpressionLabel = null;
let getExpressionsList = null;

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

/**
 * Sets the getExpressionsList function reference
 * @param {Function} fn 
 */
export function setGetExpressionsListFn(fn) {
    getExpressionsList = fn;
}

// ============================================================================
// Module Worker
// ============================================================================

/**
 * Main module worker that processes expressions
 * @param {Object} options 
 * @param {boolean} [options.newChat=false]
 */
export async function moduleWorker({ newChat = false } = {}) {
    const context = getContext();
    const settings = getSettings();

    if (!context.groupId && context.characterId === undefined) {
        removeExpression();
        return;
    }

    const vnMode = isVisualNovelMode();
    const vnWrapperVisible = $('#visual-novel-plus-wrapper').is(':visible');

    if (vnMode) {
        $('#expression-plus-wrapper').hide();
        $('#visual-novel-plus-wrapper').show();
    } else {
        $('#expression-plus-wrapper').show();
        $('#visual-novel-plus-wrapper').hide();
    }

    const vnStateChanged = vnMode !== vnWrapperVisible;

    if (vnStateChanged) {
        setLastMessage(null);
        $('#visual-novel-plus-wrapper').empty();
        $('#expression-plus-holder').css({ top: '', left: '', right: '', bottom: '', height: '', width: '', margin: '' });
    }

    const currentLastMessage = getLastCharacterMessage();
    let spriteFolderName = getSpriteFolderName(currentLastMessage, currentLastMessage.name);

    if (Object.keys(spriteCache).length === 0) {
        if (validateImages) {
            await validateImages(spriteFolderName);
        }
        setLastCharacter(context.groupId || context.characterId);
    }

    const offlineMode = $('.expressions_plus_settings .offline_mode');
    offlineMode.css('display', 'none');
    
    if (offlineMode.is(':visible')) {
        setExpressionsList(null);
        clearSpriteCache();
        if (getExpressionsList) {
            setExpressionsList(await getExpressionsList());
        }
        if (validateImages) {
            await validateImages(spriteFolderName, true);
        }
        await forceUpdateVisualNovelMode();
    }

    if (context.groupId && !Array.isArray(spriteCache[spriteFolderName]) && validateImages) {
        await validateImages(spriteFolderName, true);
        await forceUpdateVisualNovelMode();
    }

    if (context.groupId && vnMode && newChat) {
        await forceUpdateVisualNovelMode();
    }

    if ((!Array.isArray(spriteCache[spriteFolderName]) || spriteCache[spriteFolderName].length === 0) && !settings.showDefault) {
        return;
    }

    const lastMessageChanged = !((lastCharacter === context.characterId || lastCharacter === context.groupId) && lastMessage === currentLastMessage.mes);

    if (!lastMessageChanged) return;

    if (!context.groupId && context.streamingProcessor && !context.streamingProcessor.isFinished) {
        const now = Date.now();
        const timeSinceLastServerResponse = now - lastServerResponseTime;

        if (timeSinceLastServerResponse < STREAMING_UPDATE_INTERVAL) {
            return;
        }
    }

    try {
        let expression = null;
        if (getExpressionLabel) {
            expression = await getExpressionLabel(currentLastMessage.mes);
        }

        if (spriteFolderName === currentLastMessage.name && !context.groupId) {
            spriteFolderName = context.name2;
        }

        const force = !!context.groupId;

        if (currentLastMessage.mes == '...' && expressionsList.includes(settings.fallback_expression)) {
            expression = settings.fallback_expression;
        }

        await sendExpressionCall(spriteFolderName, expression, { force, vnMode });
    } catch (error) {
        console.error(error);
    } finally {
        setLastCharacter(context.groupId || context.characterId);
        setLastMessage(currentLastMessage.mes);
        setLastServerResponseTime(Date.now());
    }
}
