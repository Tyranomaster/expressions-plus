/**
 * Constants and Type Definitions for Expressions+
 */

// ============================================================================
// Constants
// ============================================================================

export const MODULE_NAME = 'third-party/expressions-plus';
export const SETTINGS_KEY = 'expressions-plus';
export const UPDATE_INTERVAL = 2000;
export const STREAMING_UPDATE_INTERVAL = 10000;
export const DEFAULT_FALLBACK_EXPRESSION = 'joy';

/** @type {string[]} Default emotion labels from the classifier model */
export const DEFAULT_EXPRESSIONS = [
    'admiration', 'amusement', 'anger', 'annoyance', 'approval', 'caring',
    'confusion', 'curiosity', 'desire', 'disappointment', 'disapproval',
    'disgust', 'embarrassment', 'excitement', 'fear', 'gratitude', 'grief',
    'joy', 'love', 'nervousness', 'optimism', 'pride', 'realization',
    'relief', 'remorse', 'sadness', 'surprise', 'neutral',
];

export const OPTION_NO_FALLBACK = '#none';
export const OPTION_EMOJI_FALLBACK = '#emoji';
export const RESET_SPRITE_LABEL = '#reset';
export const DEFAULT_PROFILE_NAME = 'Default';

/** @enum {number} */
export const EXPRESSION_API = {
    local: 0,
};

/**
 * Rule types for custom expressions
 * @enum {string}
 */
export const RULE_TYPE = {
    /** Single emotion with no threshold constraints (base behavior) */
    SIMPLE: 'simple',
    /** Single emotion within a configurable range (can emulate above/below/range) */
    RANGE: 'range',
    /** Multiple emotions that are close in value */
    COMBINATION: 'combination',
};

// ============================================================================
// Type Definitions (JSDoc only - for documentation)
// ============================================================================

/**
 * @typedef {Object} EmotionScore
 * @property {string} label - The emotion label
 * @property {number} score - The emotion score (0-1)
 */

/**
 * @typedef {Object} RuleCondition
 * @property {string} emotion - The emotion label to check
 * @property {number} [minScore] - Minimum score threshold (0-1)
 * @property {number} [maxScore] - Maximum score threshold (0-1)
 * @property {boolean} [minEnabled=false] - Whether the minimum bound is active
 * @property {boolean} [maxEnabled=false] - Whether the maximum bound is active  
 * @property {boolean} [minInclusive=true] - If true, uses >=, otherwise >
 * @property {boolean} [maxInclusive=false] - If true, uses <=, otherwise <
 */

/**
 * @typedef {Object} ExpressionRule
 * @property {string} id - Unique identifier for the rule
 * @property {string} name - Display name / sprite name for this expression
 * @property {RULE_TYPE} type - The type of rule
 * @property {RuleCondition[]} conditions - Array of conditions that must be met
 * @property {boolean} [enabled=true] - Whether this rule is active
 * @property {number} [maxDifference] - Max % difference between conditions (for combination)
 */

/**
 * @typedef {Object} ExpressionProfile
 * @property {string} id - Unique identifier for the profile
 * @property {string} name - Display name for the profile
 * @property {ExpressionRule[]} rules - Array of custom expression rules
 * @property {string} fallbackExpression - Fallback expression if no rules match
 * @property {boolean} [isDefault=false] - Whether this is the default profile
 */

/**
 * @typedef {Object} CharacterProfileAssignment
 * @property {string} characterId - Character avatar filename (without extension)
 * @property {string} profileId - Profile ID assigned to this character
 */

/**
 * @typedef {Object} Expression
 * @property {string} label - The label of the expression
 * @property {ExpressionImage[]} files - One or more images to represent this expression
 */

/**
 * @typedef {Object} ExpressionImage
 * @property {string} expression - The expression label
 * @property {boolean} [isCustom=false] - If the expression is added by user
 * @property {string} fileName - The filename with extension
 * @property {string} title - The title for the image
 * @property {string} imageSrc - The image source / full path
 * @property {'success' | 'additional' | 'failure' | 'default'} type - The type of the image
 */
