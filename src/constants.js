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
export const DEFAULT_PROFILE_NAME = 'Default (Legacy)';
export const DEFAULT_PROFILE_ID = 'default';
export const DEFAULT_PLUS_PROFILE_ID = 'default_plus';
export const DEFAULT_PLUS_PROFILE_NAME = 'Default +';
export const DEFAULT_ACTIVE_PROFILE_ID = DEFAULT_PLUS_PROFILE_ID;
export const DEFAULT_EXPRESSION_SET = '';
export const DEFAULT_PLUS_EXPRESSION_SET = 'default-plus';
export const FOLDER_PROFILE_FILENAME = 'expressions-plus-profile.json';
export const FOLDER_PROFILE_CACHE_TTL = 60000;

/** @enum {number} */
export const EXPRESSION_API = {
    local: 0,
};

/**
 * Rule types for custom expressions
 * @enum {string}
 */
export const RULE_TYPE = {
    SIMPLE: 'simple',
    RANGE: 'range',
    COMBINATION: 'combination',
};

/**
 * Splitting strategies for multi-segment classification
 * @enum {string}
 */
export const SPLIT_STRATEGY = {
    PARAGRAPH: 'paragraph',
    SENTENCE: 'sentence',
    HYBRID: 'hybrid',
};

/** Default sample size (characters) for classifier input.
 *  DistilBERT accepts up to 512 tokens; 1600 chars is a conservative
 *  character-level cap that avoids exceeding the token limit. */
export const DEFAULT_SAMPLE_SIZE = 1600;

/**
 * Built-in scenario chat detection patterns
 * @enum {string}
 */
export const SCENARIO_PATTERN = {
    BOLD_MARKDOWN: 'bold_markdown',
    PLAIN_COLON: 'plain_colon',
    ITALIC_MARKDOWN: 'italic_markdown',
    CUSTOM: 'custom',
};

/**
 * Built-in filter IDs
 * @enum {string}
 */
export const BUILTIN_FILTER = {
    OOC: 'builtin_ooc',
    EXTENSIONS: 'builtin_extensions',
    HTML: 'builtin_html',
    EMOJI: 'builtin_emoji',
    RP_MARKUP: 'builtin_rp_markup',
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
 * @property {string} [expressionSet] - Currently active expression set subfolder (empty = base folder)
 * @property {string[]} [expressionSets] - User-configured expression set folder names
 */

/**
 * @typedef {Object} ExpressionSet
 * @property {string} name - Display name of the expression set
 * @property {string} folder - Subfolder name (empty for base folder)
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

/**
 * @typedef {Object} TextFilter
 * @property {string} id - Unique identifier for the filter
 * @property {string} name - Display name
 * @property {string} [description] - Human-readable description of what the filter removes
 * @property {string} pattern - Regex pattern string
 * @property {string} [flags='gi'] - Regex flags
 * @property {string} [replacement=''] - Replacement string (default: empty = remove)
 * @property {boolean} enabled - Whether the filter is active
 * @property {boolean} [isBuiltIn=false] - Whether this is a built-in filter
 */

/**
 * @typedef {Object} TextSegment
 * @property {string} text - The segment text content
 * @property {number} startIndex - Start character index in the filtered text
 * @property {number} endIndex - End character index in the filtered text
 * @property {number} [originalStartIndex] - Start character index in the original (pre-filter) text
 * @property {number} [originalEndIndex] - End character index in the original (pre-filter) text
 */

/**
 * @typedef {Object} SegmentResult
 * @property {TextSegment} segment - The text segment
 * @property {EmotionScore[]} scores - Classification scores for this segment
 * @property {string} expression - The selected expression for this segment
 * @property {number} score - The normalized score of the selected expression
 * @property {boolean} isCustom - Whether the expression came from a custom rule
 * @property {string|null} ruleId - The matched rule ID (if any)
 * @property {string} [originalText] - The original (pre-filter) text for annotation purposes
 */

/**
 * @typedef {Object} FilterPreset
 * @property {string} type - Always 'expressions-plus-filters'
 * @property {number} version - Preset format version
 * @property {Object} builtInStates - Map of built-in filter ID → enabled boolean
 * @property {TextFilter[]} customFilters - Array of custom filter definitions
 */

/**
 * @typedef {Object} ScenarioSegment
 * @property {string} characterName - The detected character name
 * @property {string} text - The character's dialogue/text content
 * @property {number} startIndex - Start character index in the original message
 * @property {number} endIndex - End character index in the original message
 */

/**
 * @typedef {Object} ScenarioPattern
 * @property {string} id - Pattern identifier (matches SCENARIO_PATTERN enum)
 * @property {string} name - Human-readable pattern name
 * @property {string} description - Description with format example
 * @property {string} pattern - Regex pattern string (must have one capture group for character name)
 * @property {string} flags - Regex flags
 */
