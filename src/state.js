/**
 * State Variables for Expressions+
 * Mutable state that persists during the session
 */

// ============================================================================
// State Variables
// ============================================================================

/** @type {string[]|null} Cached list of expression labels */
export let expressionsList = null;

/** @type {*} Last processed character */
export let lastCharacter = undefined;

/** @type {*} Last processed message */
export let lastMessage = null;

/** @type {{[characterKey: string]: import('./constants.js').Expression[]}} Sprite cache by character */
export let spriteCache = {};

/** @type {number} Timestamp of last server response */
export let lastServerResponseTime = 0;

/** @type {{[characterName: string]: string}} Last expression per character */
export let lastExpression = {};

/** @type {import('./constants.js').EmotionScore[]|null} Last classification scores for insight panel */
export let lastClassificationScores = null;

/** @type {boolean} Whether insight panel is visible */
export let insightPanelVisible = false;

/** @type {string|null} The current sprite folder name being processed */
export let currentSpriteFolderName = null;

/** @type {{[characterName: string]: import('./constants.js').ExpressionSet[]}} Cached expression sets per character */
export let expressionSetsCache = {};

/**
 * Cached folder profiles by sprite folder name
 * @type {{[folderName: string]: {profile: import('./constants.js').ExpressionProfile|null, timestamp: number}}}
 */
export let folderProfileCache = {};

// ============================================================================
// State Setters (for controlled mutation from other modules)
// ============================================================================

/**
 * Sets the expressions list
 * @param {string[]|null} value 
 */
export function setExpressionsList(value) {
    expressionsList = value;
}

/**
 * Sets the last character
 * @param {*} value 
 */
export function setLastCharacter(value) {
    lastCharacter = value;
}

/**
 * Sets the last message
 * @param {*} value 
 */
export function setLastMessage(value) {
    lastMessage = value;
}

/**
 * Sets or clears sprite cache for a character
 * @param {string} key 
 * @param {import('./constants.js').Expression[]|undefined} value 
 */
export function setSpriteCache(key, value) {
    if (value === undefined) {
        delete spriteCache[key];
    } else {
        spriteCache[key] = value;
    }
}

/**
 * Clears the entire sprite cache
 */
export function clearSpriteCache() {
    spriteCache = {};
}

/**
 * Sets the last server response time
 * @param {number} value 
 */
export function setLastServerResponseTime(value) {
    lastServerResponseTime = value;
}

/**
 * Sets the last expression for a character
 * @param {string} characterName 
 * @param {string} expression 
 */
export function setLastExpressionForCharacter(characterName, expression) {
    lastExpression[characterName] = expression;
}

/**
 * Sets the last classification scores
 * @param {import('./constants.js').EmotionScore[]|null} value 
 */
export function setLastClassificationScores(value) {
    lastClassificationScores = value;
}

/**
 * Sets the insight panel visibility
 * @param {boolean} value 
 */
export function setInsightPanelVisible(value) {
    insightPanelVisible = value;
}

/**
 * Sets the current sprite folder name being processed
 * @param {string|null} value 
 */
export function setCurrentSpriteFolderName(value) {
    currentSpriteFolderName = value;
}

/**
 * Sets or clears expression sets cache for a character
 * @param {string} key 
 * @param {import('./constants.js').ExpressionSet[]|undefined} value 
 */
export function setExpressionSetsCache(key, value) {
    if (value === undefined) {
        delete expressionSetsCache[key];
    } else {
        expressionSetsCache[key] = value;
    }
}

/**
 * Clears the entire expression sets cache
 */
export function clearExpressionSetsCache() {
    expressionSetsCache = {};
}

/**
 * Sets or clears a folder profile cache entry
 * @param {string} key - Sprite folder name
 * @param {{profile: import('./constants.js').ExpressionProfile|null, timestamp: number}|undefined} value
 */
export function setFolderProfileCache(key, value) {
    if (value === undefined) {
        delete folderProfileCache[key];
    } else {
        folderProfileCache[key] = value;
    }
}

/**
 * Clears the entire folder profile cache
 */
export function clearFolderProfileCache() {
    folderProfileCache = {};
}
