/**
 * Analytics Module for Expressions+
 * Collects and stores data about expression combinations that could outperform chosen expressions.
 */

import { RULE_TYPE } from './constants.js';
import { getSettings } from './settings.js';
import { getActiveProfile } from './profiles.js';

// ============================================================================
// Constants
// ============================================================================

const DB_NAME = 'ExpressionsPlus_Analytics';
const DB_VERSION = 1;
const STORE_NAME = 'combinationHits';

// ============================================================================
// IndexedDB Management
// ============================================================================

/** @type {IDBDatabase|null} */
let db = null;

/**
 * Opens the IndexedDB database
 * @returns {Promise<IDBDatabase>}
 */
function openDatabase() {
    return new Promise((resolve, reject) => {
        if (db) {
            resolve(db);
            return;
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => {
            console.error('Expressions+ Analytics: Failed to open database', request.error);
            reject(request.error);
        };

        request.onsuccess = () => {
            db = request.result;
            resolve(db);
        };

        request.onupgradeneeded = (event) => {
            const database = /** @type {IDBOpenDBRequest} */ (event.target).result;
            
            if (!database.objectStoreNames.contains(STORE_NAME)) {
                const store = database.createObjectStore(STORE_NAME, { 
                    keyPath: 'id', 
                    autoIncrement: true 
                });
                
                store.createIndex('combinationKey', 'combinationKey', { unique: false });
                store.createIndex('timestamp', 'timestamp', { unique: false });
                store.createIndex('emotionCount', 'emotionCount', { unique: false });
            }
        };
    });
}

/**
 * Ensures database is initialized
 * @returns {Promise<void>}
 */
export async function initAnalyticsDatabase() {
    try {
        await openDatabase();
        console.log('Expressions+ Analytics: Database initialized');
    } catch (error) {
        console.error('Expressions+ Analytics: Failed to initialize database', error);
    }
}

// ============================================================================
// Data Collection
// ============================================================================

/**
 * @typedef {Object} AnalyticsEntry
 * @property {number} [id] - Auto-generated ID
 * @property {string} timestamp - ISO timestamp
 * @property {string} text - The classified text
 * @property {string} chosenExpression - The expression that was chosen
 * @property {number} chosenScore - The normalized score of the chosen expression
 * @property {string[]} combination - The emotions in the winning combination (sorted alphabetically)
 * @property {string} combinationKey - Joined combination key for grouping (e.g., "joy+surprise")
 * @property {number} combinationScore - The normalized score of the combination
 * @property {number} emotionCount - Number of emotions in the combination (2 or 3)
 * @property {import('./constants.js').EmotionScore[]} topEmotions - Top 5 emotion scores for context
 */

/**
 * Generates all combinations of n elements from an array
 * @template T
 * @param {T[]} arr - Source array
 * @param {number} n - Number of elements per combination
 * @returns {T[][]}
 */
function getCombinations(arr, n) {
    const result = [];
    
    function combine(start, combo) {
        if (combo.length === n) {
            result.push([...combo]);
            return;
        }
        for (let i = start; i < arr.length; i++) {
            combo.push(arr[i]);
            combine(i + 1, combo);
            combo.pop();
        }
    }
    
    combine(0, []);
    return result;
}

/**
 * Calculates the normalized score for a hypothetical combination
 * Uses the same formula as RULE_TYPE.COMBINATION in classification.js
 * @param {string[]} emotions - The emotions in the combination
 * @param {Map<string, number>} scoreMap - Map of emotion -> score
 * @param {number} maxDifference - Maximum allowed difference (0-1)
 * @returns {{matched: boolean, normalizedScore: number}}
 */
function evaluateHypotheticalCombination(emotions, scoreMap, maxDifference) {
    const scores = emotions.map(e => scoreMap.get(e) ?? 0);
    const highestScore = Math.max(...scores);
    
    if (highestScore === 0) {
        return { matched: false, normalizedScore: 0 };
    }
    
    const minAllowed = highestScore * (1 - maxDifference);
    const allWithinRange = scores.every(s => s >= minAllowed && s > 0);
    
    if (!allWithinRange) {
        return { matched: false, normalizedScore: 0 };
    }
    
    // Calculate normalized score: totalScore / ((n+1)/2)
    const totalScore = scores.reduce((sum, s) => sum + s, 0);
    const divisor = (emotions.length + 1) / 2;
    const normalizedScore = totalScore / divisor;
    
    return { matched: true, normalizedScore };
}

/**
 * Gets the set of combination keys that already have rules defined
 * @returns {Set<string>}
 */
function getExistingCombinationRuleKeys() {
    const profile = getActiveProfile();
    const existingKeys = new Set();
    
    for (const rule of profile.rules) {
        if (rule.type === RULE_TYPE.COMBINATION && rule.enabled) {
            const emotions = rule.conditions.map(c => c.emotion).sort();
            const key = emotions.join('+');
            existingKeys.add(key);
        }
    }
    
    return existingKeys;
}

/**
 * Analyzes classification results and stores any combinations that outperform the chosen expression
 * @param {string} text - The text that was classified
 * @param {import('./constants.js').EmotionScore[]} scores - The classification scores (sorted by score desc)
 * @param {string} chosenExpression - The expression that was chosen
 * @param {number} chosenScore - The normalized score of the chosen expression
 * @returns {Promise<void>}
 */
export async function analyzeAndStore(text, scores, chosenExpression, chosenScore) {
    const settings = getSettings();
    
    // Check if analytics collection is enabled
    if (!settings.analyticsEnabled) {
        return;
    }
    
    if (!scores || scores.length < 2) {
        return;
    }
    
    try {
        const database = await openDatabase();
        const scoreMap = new Map(scores.map(s => [s.label, s.score]));
        const topEmotions = scores.slice(0, 5);
        const topEmotionLabels = topEmotions.map(s => s.label);
        const existingRuleKeys = getExistingCombinationRuleKeys();
        
        // We'll test a wide range of maxDifference values (0.05 to 0.50 in 0.05 increments)
        // to capture all potentially interesting combinations
        const maxDifferenceValues = [0.50]; // Use the maximum to capture all possible matches
        
        const emotionCounts = settings.analyticsEmotionCount === 'both' 
            ? [2, 3] 
            : [settings.analyticsEmotionCount];
        
        const entriesToStore = [];
        const seenCombinations = new Set(); // Avoid duplicates within this analysis
        
        for (const emotionCount of emotionCounts) {
            if (topEmotionLabels.length < emotionCount) continue;
            
            const combinations = getCombinations(topEmotionLabels, emotionCount);
            
            for (const combo of combinations) {
                // Sort alphabetically for consistent key
                const sortedCombo = [...combo].sort();
                const combinationKey = sortedCombo.join('+');
                
                // Skip if we already have a rule for this combination
                if (existingRuleKeys.has(combinationKey)) {
                    continue;
                }
                
                // Skip if we've already processed this combination in this batch
                if (seenCombinations.has(combinationKey)) {
                    continue;
                }
                
                // Evaluate with the maximum difference to see if it could ever match
                const result = evaluateHypotheticalCombination(sortedCombo, scoreMap, 0.50);
                
                if (result.matched && result.normalizedScore > chosenScore) {
                    seenCombinations.add(combinationKey);
                    
                    /** @type {AnalyticsEntry} */
                    const entry = {
                        timestamp: new Date().toISOString(),
                        text: text.substring(0, 500), // Limit text length
                        chosenExpression,
                        chosenScore,
                        combination: sortedCombo,
                        combinationKey,
                        combinationScore: result.normalizedScore,
                        emotionCount,
                        topEmotions,
                    };
                    
                    entriesToStore.push(entry);
                }
            }
        }
        
        // Store all entries in a single transaction
        if (entriesToStore.length > 0) {
            const transaction = database.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            
            for (const entry of entriesToStore) {
                store.add(entry);
            }
            
            await new Promise((resolve, reject) => {
                transaction.oncomplete = resolve;
                transaction.onerror = () => reject(transaction.error);
            });
        }
    } catch (error) {
        console.error('Expressions+ Analytics: Failed to analyze and store', error);
    }
}

// ============================================================================
// Data Retrieval
// ============================================================================

/**
 * @typedef {Object} CombinationSummary
 * @property {string} combinationKey - The combination key (e.g., "joy+surprise")
 * @property {string[]} emotions - The individual emotions
 * @property {number} count - Number of occurrences
 * @property {number} emotionCount - Number of emotions (2 or 3)
 * @property {number} avgScoreDifference - Average difference between combination and chosen scores
 * @property {AnalyticsEntry[]} entries - Individual entries for this combination
 */

/**
 * Gets all analytics entries
 * @returns {Promise<AnalyticsEntry[]>}
 */
export async function getAllEntries() {
    try {
        const database = await openDatabase();
        const transaction = database.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        
        return new Promise((resolve, reject) => {
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        console.error('Expressions+ Analytics: Failed to get entries', error);
        return [];
    }
}

/**
 * Gets summarized analytics data grouped by combination
 * @param {Object} filters - Filter options
 * @param {number} [filters.maxDifference=0.50] - Maximum difference threshold for filtering
 * @param {number|'both'} [filters.emotionCount='both'] - Filter by emotion count
 * @param {number} [filters.minOccurrences=1] - Minimum occurrences to include
 * @param {number} [filters.minScoreDiff=0] - Minimum average score difference to include
 * @returns {Promise<CombinationSummary[]>}
 */
export async function getSummarizedData(filters = {}) {
    const { 
        maxDifference = 0.50, 
        emotionCount = 'both',
        minOccurrences = 1,
        minScoreDiff = 0
    } = filters;
    
    const entries = await getAllEntries();
    
    // Group by combination key
    /** @type {Map<string, AnalyticsEntry[]>} */
    const grouped = new Map();
    
    for (const entry of entries) {
        // Filter by emotion count
        if (emotionCount !== 'both' && entry.emotionCount !== emotionCount) {
            continue;
        }
        
        // Filter by maxDifference - re-evaluate the combination with the filter threshold
        const scoreMap = new Map(entry.topEmotions.map(s => [s.label, s.score]));
        const result = evaluateHypotheticalCombination(entry.combination, scoreMap, maxDifference);
        
        if (!result.matched || result.normalizedScore <= entry.chosenScore) {
            continue;
        }
        
        const key = entry.combinationKey;
        if (!grouped.has(key)) {
            grouped.set(key, []);
        }
        grouped.get(key).push(entry);
    }
    
    // Convert to summaries
    const summaries = [];
    
    for (const [key, groupEntries] of grouped) {
        if (groupEntries.length < minOccurrences) {
            continue;
        }
        
        const avgScoreDifference = groupEntries.reduce(
            (sum, e) => sum + (e.combinationScore - e.chosenScore), 
            0
        ) / groupEntries.length;
        
        // Filter by minimum score difference
        if (avgScoreDifference < minScoreDiff) {
            continue;
        }
        
        summaries.push({
            combinationKey: key,
            emotions: key.split('+'),
            count: groupEntries.length,
            emotionCount: groupEntries[0].emotionCount,
            avgScoreDifference,
            entries: groupEntries,
        });
    }
    
    // Sort by count descending
    summaries.sort((a, b) => b.count - a.count);
    
    return summaries;
}

/**
 * Gets the total count of entries
 * @returns {Promise<number>}
 */
export async function getTotalEntryCount() {
    try {
        const database = await openDatabase();
        const transaction = database.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        
        return new Promise((resolve, reject) => {
            const request = store.count();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        console.error('Expressions+ Analytics: Failed to get count', error);
        return 0;
    }
}

// ============================================================================
// Data Management
// ============================================================================

/**
 * Clears all analytics data
 * @returns {Promise<void>}
 */
export async function clearAllData() {
    try {
        const database = await openDatabase();
        const transaction = database.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        
        await new Promise((resolve, reject) => {
            const request = store.clear();
            request.onsuccess = resolve;
            request.onerror = () => reject(request.error);
        });
        
        console.log('Expressions+ Analytics: All data cleared');
    } catch (error) {
        console.error('Expressions+ Analytics: Failed to clear data', error);
        throw error;
    }
}

/**
 * Exports all analytics data as JSON
 * @returns {Promise<string>}
 */
export async function exportData() {
    const entries = await getAllEntries();
    return JSON.stringify(entries, null, 2);
}

/**
 * Imports analytics data from JSON
 * @param {string} jsonData - JSON string of analytics entries
 * @returns {Promise<number>} Number of entries imported
 */
export async function importData(jsonData) {
    try {
        const entries = JSON.parse(jsonData);
        
        if (!Array.isArray(entries)) {
            throw new Error('Invalid data format: expected an array');
        }
        
        const database = await openDatabase();
        const transaction = database.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        
        let imported = 0;
        for (const entry of entries) {
            // Validate entry has required fields
            if (entry.combinationKey && entry.timestamp && entry.text) {
                // Remove id to let IndexedDB auto-generate
                delete entry.id;
                store.add(entry);
                imported++;
            }
        }
        
        await new Promise((resolve, reject) => {
            transaction.oncomplete = resolve;
            transaction.onerror = () => reject(transaction.error);
        });
        
        return imported;
    } catch (error) {
        console.error('Expressions+ Analytics: Failed to import data', error);
        throw error;
    }
}
