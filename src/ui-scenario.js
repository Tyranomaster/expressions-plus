/**
 * UI for Scenario Chat Settings — Expressions+
 *
 * Handles the settings panel for scenario (multi-character) chat detection,
 * including pattern selection, custom regex input, and test detection.
 */

import { saveSettingsDebounced } from '../../../../../script.js';
import { callGenericPopup, POPUP_TYPE } from '../../../../popup.js';
import { getContext } from '../../../../extensions.js';

import { getSettings } from './settings.js';
import { setLastMessage } from './state.js';
import { getActiveScenarioPatterns, splitMessageByCharacters } from './scenario-chat.js';

// ============================================================================
// Settings Panel Initialization
// ============================================================================

/**
 * Initializes the scenario chat settings section event handlers.
 * Called once from index.js after settings HTML is injected.
 */
export function initScenarioSettings() {
    const settings = getSettings();

    $('#expressions_plus_scenario_enabled')
        .prop('checked', settings.scenarioEnabled ?? false)
        .on('change', function () {
            settings.scenarioEnabled = $(this).prop('checked');
            saveSettingsDebounced();
            setLastMessage(null);
        });

    // Built-in pattern toggles
    const patternMap = {
        '#expressions_plus_scenario_pattern_bold': 'bold_markdown',
        '#expressions_plus_scenario_pattern_plain': 'plain_colon',
        '#expressions_plus_scenario_pattern_italic': 'italic_markdown',
    };

    if (!settings.scenarioPatterns) {
        settings.scenarioPatterns = { bold_markdown: true, plain_colon: false, italic_markdown: false };
    }

    for (const [selector, key] of Object.entries(patternMap)) {
        $(selector)
            .prop('checked', !!settings.scenarioPatterns[key])
            .on('change', function () {
                settings.scenarioPatterns[key] = $(this).prop('checked');
                saveSettingsDebounced();
                setLastMessage(null);
            });
    }

    // Custom regex toggle
    $('#expressions_plus_scenario_custom_enabled')
        .prop('checked', settings.scenarioCustomEnabled ?? false)
        .on('change', function () {
            settings.scenarioCustomEnabled = $(this).prop('checked');
            saveSettingsDebounced();
            setLastMessage(null);
            updateCustomFieldsVisibility();
        });

    $('#expressions_plus_scenario_custom_regex')
        .val(settings.scenarioCustomRegex || '')
        .on('change', function () {
            settings.scenarioCustomRegex = /** @type {string} */ ($(this).val()).trim();
            saveSettingsDebounced();
            setLastMessage(null);
        });

    $('#expressions_plus_scenario_custom_flags')
        .val(settings.scenarioCustomFlags || 'gm')
        .on('change', function () {
            settings.scenarioCustomFlags = /** @type {string} */ ($(this).val()).trim() || 'gm';
            saveSettingsDebounced();
            setLastMessage(null);
        });

    $('#expressions_plus_scenario_test').on('click', onClickTestDetection);

    updateCustomFieldsVisibility();
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Shows or hides the custom regex input fields based on the selected pattern.
 */
function updateCustomFieldsVisibility() {
    const settings = getSettings();
    const isCustom = !!settings.scenarioCustomEnabled;
    $('#expressions_plus_scenario_custom_fields').toggle(isCustom);
}

/**
 * Gets the last non-user message from the chat context.
 * @returns {{ mes: string, name: string|null }|null}
 */
function getLastCharacterMessage() {
    try {
        const context = getContext();
        const chat = context.chat || [];
        for (let i = chat.length - 1; i >= 0; i--) {
            const msg = chat[i];
            if (!msg.is_user && !msg.is_system) {
                return { mes: msg.mes || '', name: msg.name || null };
            }
        }
    } catch {
        // ignore
    }
    return null;
}

/**
 * Escapes HTML entities for safe display.
 * @param {string} text
 * @returns {string}
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Truncates text to a maximum length with ellipsis.
 * @param {string} str
 * @param {number} maxLen
 * @returns {string}
 */
function truncate(str, maxLen) {
    if (!str) return '';
    return str.length > maxLen ? str.slice(0, maxLen) + '…' : str;
}

// ============================================================================
// Test Detection
// ============================================================================

/**
 * Tests the current scenario pattern against the last character message
 * and shows the results in a popup.
 */
async function onClickTestDetection() {
    const settings = getSettings();
    const lastMsg = getLastCharacterMessage();

    if (!lastMsg || !lastMsg.mes) {
        /** @type {any} */
        const toast = window.toastr;
        toast.warning('No character message found in the current chat.');
        return;
    }

    const patterns = getActiveScenarioPatterns(settings.scenarioEnabled ? settings : { ...settings, scenarioEnabled: true });
    if (patterns.length === 0) {
        /** @type {any} */
        const toast = window.toastr;
        toast.warning('No valid pattern configured. Enable at least one detection pattern.');
        return;
    }

    const cardCharName = lastMsg.name || 'Character';
    const segments = splitMessageByCharacters(lastMsg.mes, patterns, cardCharName);

    let resultHtml;

    if (segments.length === 0) {
        resultHtml = `
            <div class="scenario_test_dialog">
                <h3><i class="fa-solid fa-vial"></i> Scenario Detection Test</h3>
                <small>Testing against <strong>${escapeHtml(cardCharName)}</strong>'s last message (${lastMsg.mes.length} chars)</small>
                <div class="marginTop10">
                    <div class="scenario_test_empty">
                        <i class="fa-solid fa-circle-xmark" style="color: var(--SmartThemeQuoteColor);"></i>
                        <strong>No character markers detected.</strong>
                        <small>The pattern did not match any character names in the message. Try a different pattern or verify the message format.</small>
                    </div>
                </div>
            </div>
        `;
    } else {
        const segmentRows = segments.map((seg, i) => `
            <div class="scenario_test_segment">
                <div class="scenario_test_segment_header">
                    <strong>${escapeHtml(seg.characterName)}</strong>
                    <small class="scenario_test_range">chars ${seg.startIndex}–${seg.endIndex} (${seg.text.length} chars)</small>
                </div>
                <pre class="scenario_test_pre">${escapeHtml(truncate(seg.text, 500))}</pre>
            </div>
        `).join('');

        const uniqueChars = [...new Set(segments.map(s => s.characterName))];

        resultHtml = `
            <div class="scenario_test_dialog">
                <h3><i class="fa-solid fa-vial"></i> Scenario Detection Test</h3>
                <small>Testing against <strong>${escapeHtml(cardCharName)}</strong>'s last message (${lastMsg.mes.length} chars)</small>
                <div class="marginTop10">
                    <div class="scenario_test_summary">
                        <i class="fa-solid fa-circle-check" style="color: var(--SmartThemeFavColor);"></i>
                        <strong>${segments.length} segment${segments.length !== 1 ? 's' : ''}</strong> detected across
                        <strong>${uniqueChars.length} character${uniqueChars.length !== 1 ? 's' : ''}</strong>:
                        ${uniqueChars.map(n => `<span class="scenario_test_char_badge">${escapeHtml(n)}</span>`).join(' ')}
                    </div>
                    <div class="scenario_test_segments marginTop5">
                        ${segmentRows}
                    </div>
                </div>
            </div>
        `;
    }

    await callGenericPopup(resultHtml, POPUP_TYPE.TEXT, '', {
        okButton: 'Close',
        wide: true,
    });
}
