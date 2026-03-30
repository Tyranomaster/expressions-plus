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

/**
 * Last segment results from multi-segment classification (v0.4.0)
 * @type {import('./constants.js').SegmentResult[]|null}
 */
export let lastSegmentResults = null;

/**
 * Segment results keyed by character name for VN mode (v0.4.0)
 * @type {{[characterName: string]: import('./constants.js').SegmentResult[]}}
 */
export let characterSegmentResults = {};

/**
 * Whether the last classified message was detected as a scenario (multi-character) message
 * @type {boolean}
 */
export let lastScenarioDetected = false;

/**
 * The avatar filename of the currently displayed character (for per-character layout tracking)
 * @type {string|null}
 */
export let currentCharacterAvatar = null;

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

// ============================================================================
// Segment Results Setters (v0.4.0)
// ============================================================================

/**
 * Sets the last segment results from multi-segment classification
 * @param {import('./constants.js').SegmentResult[]|null} value
 */
export function setLastSegmentResults(value) {
    lastSegmentResults = value;
}

/**
 * Sets segment results for a specific character (VN mode)
 * @param {string} characterName
 * @param {import('./constants.js').SegmentResult[]} results
 */
export function setCharacterSegmentResults(characterName, results) {
    characterSegmentResults[characterName] = results;
}

/**
 * Clears all character segment results
 */
export function clearCharacterSegmentResults() {
    characterSegmentResults = {};
}

/**
 * Clears all segment-related state
 */
export function clearSegmentState() {
    lastSegmentResults = null;
    characterSegmentResults = {};
    lastScenarioDetected = false;
}

/**
 * Sets whether the last message was detected as a scenario (multi-character) message
 * @param {boolean} value
 */
export function setLastScenarioDetected(value) {
    lastScenarioDetected = value;
}

/**
 * Sets the current character avatar filename
 * @param {string|null} value
 */
export function setCurrentCharacterAvatar(value) {
    currentCharacterAvatar = value;
}
