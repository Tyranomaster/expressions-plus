/**
 * Insight Panel for Expressions+
 * (Formerly Debug Panel)
 */

import { saveSettingsDebounced } from '../../../../../script.js';
import { dragElement } from '../../../../RossAscends-mods.js';

import { insightPanelVisible, lastClassificationScores, setInsightPanelVisible } from './state.js';
import { getSettings } from './settings.js';
import { selectExpression } from './classification.js';

// ============================================================================
// Insight Panel
// ============================================================================

/**
 * @typedef {Object} EmotionScore
 * @property {string} label - The emotion label
 * @property {number} score - The emotion score (0-1)
 */

/**
 * Updates the insight panel with current classification scores
 * @param {EmotionScore[]} scores 
 */
export function updateInsightPanel(scores) {
    const panel = $('#expressions_plus_insight_panel');
    if (!panel.length) return;

    const scoresHtml = scores.slice(0, 10).map((score, index) => `
        <div class="insight_score_item">
            <span class="insight_score_rank">#${index + 1}</span>
            <span class="insight_score_label">${score.label}</span>
            <span class="insight_score_value">${(score.score * 100).toFixed(2)}%</span>
            <div class="insight_score_bar" style="width: ${score.score * 100}%"></div>
        </div>
    `).join('');

    const selectedResult = selectExpression(scores);
    const selectedHtml = `
        <div class="insight_selected">
            <strong>Selected:</strong> ${selectedResult.expression}
            ${selectedResult.isCustom ? '<span class="insight_custom_badge">(custom rule)</span>' : ''}
            <br>
            <small>Normalized Score: ${(selectedResult.score * 100).toFixed(2)}%</small>
        </div>
    `;

    panel.find('.insight_scores_container').html(selectedHtml + scoresHtml);
}

/**
 * Toggles the insight panel visibility
 */
export function toggleInsightPanel() {
    setInsightPanelVisible(!insightPanelVisible);
    const settings = getSettings();
    settings.insightMode = insightPanelVisible;
    saveSettingsDebounced();
    
    $('#expressions_plus_insight_panel').toggle(insightPanelVisible);
    $('#expressions_plus_insight_toggle').toggleClass('active', insightPanelVisible);
    
    if (insightPanelVisible && lastClassificationScores) {
        updateInsightPanel(lastClassificationScores);
    }
}

/**
 * Initializes the insight panel with draggable functionality
 */
export function initInsightPanel() {
    dragElement($('#expressions_plus_insight_panel'));
}
