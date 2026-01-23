/**
 * Expression Classification & Scoring for Expressions+
 */

import { RULE_TYPE, DEFAULT_FALLBACK_EXPRESSION } from './constants.js';
import { getActiveProfile } from './profiles.js';

// ============================================================================
// Expression Classification & Scoring
// ============================================================================

/**
 * Checks if a score passes a bound check
 * @param {number} score - The score to check
 * @param {number} bound - The bound value
 * @param {boolean} inclusive - Whether to use inclusive comparison
 * @param {boolean} isMin - Whether this is a minimum bound (true) or maximum bound (false)
 * @returns {boolean}
 */
function checkBound(score, bound, inclusive, isMin) {
    if (isMin) {
        return inclusive ? score >= bound : score > bound;
    } else {
        return inclusive ? score <= bound : score < bound;
    }
}

/**
 * Calculates the normalized score for a rule based on the classification scores
 * @param {import('./constants.js').ExpressionRule} rule - The rule to evaluate
 * @param {import('./constants.js').EmotionScore[]} scores - The classification scores
 * @returns {{matched: boolean, normalizedScore: number, rawScore: number}}
 */
export function evaluateRule(rule, scores) {
    if (!rule.enabled) {
        return { matched: false, normalizedScore: 0, rawScore: 0 };
    }

    const scoreMap = new Map(scores.map(s => [s.label, s.score]));
    const highestScore = scores[0]?.score || 0;
    const highestEmotion = scores[0]?.label || '';

    switch (rule.type) {
        case RULE_TYPE.SIMPLE: {
            // Simple rule: just needs to be the highest emotion
            const emotion = rule.conditions[0]?.emotion;
            if (emotion === highestEmotion) {
                return { matched: true, normalizedScore: highestScore, rawScore: highestScore };
            }
            return { matched: false, normalizedScore: 0, rawScore: 0 };
        }

        case RULE_TYPE.RANGE: {
            // Range rule: ALL conditions must be within their configured bounds (AND logic)
            // Each condition checks its emotion's actual score against its bounds
            if (!rule.conditions || rule.conditions.length === 0) {
                return { matched: false, normalizedScore: 0, rawScore: 0 };
            }
            
            let totalScore = 0;
            
            for (const condition of rule.conditions) {
                const emotion = condition.emotion;
                const emotionScore = scoreMap.get(emotion) ?? 0;
                
                // Check minimum bound if enabled
                if (condition.minEnabled) {
                    const minScore = condition.minScore ?? 0;
                    const minInclusive = condition.minInclusive !== false; // default true
                    if (!checkBound(emotionScore, minScore, minInclusive, true)) {
                        return { matched: false, normalizedScore: 0, rawScore: 0 };
                    }
                }
                
                // Check maximum bound if enabled
                if (condition.maxEnabled) {
                    const maxScore = condition.maxScore ?? 1;
                    const maxInclusive = condition.maxInclusive === true; // default false
                    if (!checkBound(emotionScore, maxScore, maxInclusive, false)) {
                        return { matched: false, normalizedScore: 0, rawScore: 0 };
                    }
                }
                
                totalScore += emotionScore;
            }
            
            // Use average score for normalization
            const avgScore = totalScore / rule.conditions.length;
            return { matched: true, normalizedScore: avgScore, rawScore: totalScore };
        }

        case RULE_TYPE.COMBINATION: {
            // Combination: Multiple emotions must be near-equal in value (all must match - AND logic)
            const conditionScores = rule.conditions.map(condition => ({
                emotion: condition.emotion,
                score: scoreMap.get(condition.emotion) ?? 0,
            }));
            
            // Find the highest score among the specified conditions
            const highestConditionScore = Math.max(...conditionScores.map(c => c.score));
            
            // Use the rule-level maxDifference
            const maxDiffPercent = rule.maxDifference ?? 0.25;
            
            // Check if all conditions are within the max difference percentage
            const conditionResults = conditionScores.map(c => {
                if (highestConditionScore === 0) {
                    return { ...c, withinRange: false };
                }
                const minAllowed = highestConditionScore * (1 - maxDiffPercent);
                return {
                    ...c,
                    withinRange: c.score >= minAllowed && c.score > 0,
                };
            });

            // All conditions must match (AND logic only)
            const matched = conditionResults.every(r => r.withinRange);

            if (matched) {
                const totalScore = conditionResults.reduce((sum, r) => sum + r.score, 0);
                const numConditions = conditionResults.length;
                // Normalization: divide by (n+1)/2
                const divisor = (numConditions + 1) / 2;
                const normalizedScore = totalScore / divisor;
                return { matched: true, normalizedScore, rawScore: totalScore };
            }
            return { matched: false, normalizedScore: 0, rawScore: 0 };
        }

        // Handle legacy rule types for backward compatibility
        case 'threshold_high': {
            const condition = rule.conditions[0];
            const emotion = condition?.emotion;
            const minScore = condition?.minScore ?? 0;
            
            if (emotion === highestEmotion && highestScore >= minScore) {
                return { matched: true, normalizedScore: highestScore, rawScore: highestScore };
            }
            return { matched: false, normalizedScore: 0, rawScore: 0 };
        }

        case 'threshold_low': {
            const condition = rule.conditions[0];
            const emotion = condition?.emotion;
            const maxScore = condition?.maxScore ?? 1;
            
            if (emotion === highestEmotion && highestScore < maxScore) {
                return { matched: true, normalizedScore: highestScore, rawScore: highestScore };
            }
            return { matched: false, normalizedScore: 0, rawScore: 0 };
        }

        case 'threshold_range': {
            const condition = rule.conditions[0];
            const emotion = condition?.emotion;
            const minScore = condition?.minScore ?? 0;
            const maxScore = condition?.maxScore ?? 1;
            
            if (emotion === highestEmotion && highestScore >= minScore && highestScore < maxScore) {
                return { matched: true, normalizedScore: highestScore, rawScore: highestScore };
            }
            return { matched: false, normalizedScore: 0, rawScore: 0 };
        }

        case 'combination_near_equal':
        case 'combination_all_high': {
            // Handle legacy combination types
            const conditionScores = rule.conditions.map(condition => ({
                emotion: condition.emotion,
                score: scoreMap.get(condition.emotion) ?? 0,
                minScore: condition.minScore ?? 0,
            }));
            
            const highestConditionScore = Math.max(...conditionScores.map(c => c.score));
            const maxDiffPercent = rule.maxDifference ?? 0.25;
            
            const conditionResults = conditionScores.map(c => {
                if (rule.type === 'combination_all_high') {
                    return { ...c, withinRange: c.score >= c.minScore };
                }
                if (highestConditionScore === 0) {
                    return { ...c, withinRange: false };
                }
                const minAllowed = highestConditionScore * (1 - maxDiffPercent);
                return { ...c, withinRange: c.score >= minAllowed && c.score > 0 };
            });

            const matched = conditionResults.every(r => r.withinRange);

            if (matched) {
                const totalScore = conditionResults.reduce((sum, r) => sum + r.score, 0);
                const numConditions = conditionResults.length;
                const divisor = (numConditions + 1) / 2;
                const normalizedScore = totalScore / divisor;
                return { matched: true, normalizedScore, rawScore: totalScore };
            }
            return { matched: false, normalizedScore: 0, rawScore: 0 };
        }

        default:
            return { matched: false, normalizedScore: 0, rawScore: 0 };
    }
}

/**
 * Determines the best matching expression based on classification scores and active profile
 * @param {import('./constants.js').EmotionScore[]} scores - The classification scores
 * @returns {{expression: string, score: number, isCustom: boolean, ruleId: string|null}}
 */
export function selectExpression(scores) {
    const profile = getActiveProfile();
    
    if (!scores || scores.length === 0) {
        return { 
            expression: profile.fallbackExpression || DEFAULT_FALLBACK_EXPRESSION, 
            score: 0, 
            isCustom: false, 
            ruleId: null 
        };
    }

    // Evaluate all rules
    const ruleResults = profile.rules.map(rule => {
        const result = evaluateRule(rule, scores);
        return {
            rule,
            ...result,
        };
    });

    // Filter matched rules and sort by normalized score (descending)
    const matchedRules = ruleResults
        .filter(r => r.matched)
        .sort((a, b) => {
            // Sort by normalized score descending
            if (b.normalizedScore !== a.normalizedScore) {
                return b.normalizedScore - a.normalizedScore;
            }
            // Tie-breaker: prefer custom rules (non-SIMPLE) over base rules
            const aIsCustom = a.rule.type !== RULE_TYPE.SIMPLE;
            const bIsCustom = b.rule.type !== RULE_TYPE.SIMPLE;
            if (aIsCustom !== bIsCustom) {
                return bIsCustom ? 1 : -1;
            }
            // Further tie-breaker: more specific rules (more conditions) win
            return b.rule.conditions.length - a.rule.conditions.length;
        });

    if (matchedRules.length > 0) {
        const best = matchedRules[0];
        return {
            expression: best.rule.name,
            score: best.normalizedScore,
            isCustom: best.rule.type !== RULE_TYPE.SIMPLE,
            ruleId: best.rule.id,
        };
    }

    // No rules matched, use fallback
    return {
        expression: profile.fallbackExpression || DEFAULT_FALLBACK_EXPRESSION,
        score: 0,
        isCustom: false,
        ruleId: null,
    };
}
