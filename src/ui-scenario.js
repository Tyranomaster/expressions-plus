/**
 * UI for Scenario Chat Settings — Expressions+
 *
 * Handles the settings panel for scenario (multi-character) chat detection,
 * including pattern selection, custom regex input, and test detection.
 */

import { saveSettingsDebounced } from '../../../../../script.js';
import { callGenericPopup, POPUP_TYPE, POPUP_RESULT } from '../../../../popup.js';
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

    $('#expressions_plus_scenario_test').on('click', onClickTestDetection);
    $('#expressions_plus_scenario_add_pattern').on('click', onClickAddScenarioPattern);

    renderScenarioCustomPatternsList();
}

// ============================================================================
// Helpers
// ============================================================================

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
// Custom Pattern Rules — Rendering & CRUD
// ============================================================================

/**
 * Renders the custom scenario patterns list in the settings panel
 */
function renderScenarioCustomPatternsList() {
    const settings = getSettings();
    const container = $('#expressions_plus_scenario_custom_patterns_list');
    container.empty();

    const patterns = settings.scenarioCustomPatterns || [];
    if (patterns.length === 0) {
        container.append('<div class="scenario_pattern_empty_notice"><small>No custom pattern rules defined. Add one to detect custom character formats.</small></div>');
        return;
    }

    for (const pattern of patterns) {
        const tooltipLines = [
            pattern.name,
            pattern.description ? `\n${pattern.description}` : '',
            `\nPattern: ${pattern.pattern}`,
            `Flags: ${pattern.flags || 'gm'}`,
        ].filter(Boolean).join('\n');

        const item = $(`
            <div class="scenario_pattern_item" data-pattern-id="${pattern.id}" title="${escapeHtml(tooltipLines)}">
                <label class="checkbox_label scenario_pattern_toggle">
                    <input type="checkbox" class="scenario_pattern_enabled_toggle" ${pattern.enabled ? 'checked' : ''}>
                </label>
                <span class="scenario_pattern_name">${escapeHtml(pattern.name)}</span>
                <span class="scenario_pattern_preview">${escapeHtml(truncate(pattern.pattern, 30))}</span>
                <div class="scenario_pattern_actions">
                    <div class="menu_button menu_button_icon scenario_pattern_edit_btn" title="Edit Pattern">
                        <i class="fa-solid fa-pencil"></i>
                    </div>
                    <div class="menu_button menu_button_icon scenario_pattern_delete_btn" title="Delete Pattern">
                        <i class="fa-solid fa-trash"></i>
                    </div>
                </div>
            </div>
        `);

        item.find('.scenario_pattern_enabled_toggle').on('change', function () {
            pattern.enabled = $(this).prop('checked');
            saveSettingsDebounced();
            setLastMessage(null);
        });

        item.find('.scenario_pattern_edit_btn').on('click', () => onClickEditScenarioPattern(pattern.id));
        item.find('.scenario_pattern_delete_btn').on('click', () => onClickDeleteScenarioPattern(pattern.id));

        container.append(item);
    }
}

/**
 * Opens a modal editor for creating or editing a custom scenario pattern.
 * @param {Object|null} existingPattern - Null for new pattern
 * @returns {Promise<{name: string, pattern: string, flags: string, description: string}|null>}
 */
async function openScenarioPatternEditorModal(existingPattern) {
    const isEdit = !!existingPattern;
    const title = isEdit ? 'Edit Custom Pattern Rule' : 'New Custom Pattern Rule';

    const html = `
        <div class="scenario_pattern_editor">
            <h3>${title}</h3>
            <div class="flex-container flexFlowColumn marginTop5">
                <label for="scenario_pattern_editor_name" title="A short, descriptive name for this pattern.">Pattern Name</label>
                <input type="text" id="scenario_pattern_editor_name" class="text_pole"
                    value="${escapeHtml(existingPattern?.name || '')}"
                    placeholder="e.g., Angle Bracket Format">
            </div>
            <div class="flex-container flexFlowColumn marginTop5">
                <label for="scenario_pattern_editor_description" title="Optional explanation of what this pattern matches.">Description <small>(optional)</small></label>
                <input type="text" id="scenario_pattern_editor_description" class="text_pole"
                    value="${escapeHtml(existingPattern?.description || '')}"
                    placeholder="e.g., Matches <Character Name> text">
            </div>
            <div class="flex-container flexFlowColumn marginTop5">
                <label for="scenario_pattern_editor_pattern" title="A JavaScript-compatible regular expression with a capture group for the character name.">Regex Pattern</label>
                <input type="text" id="scenario_pattern_editor_pattern" class="text_pole"
                    value="${escapeHtml(existingPattern?.pattern || '')}"
                    placeholder="e.g., <(.+?)>:\\s*">
                <small>Use a capture group <code>(...)</code> for the character name. If omitted, the entire match is used.</small>
            </div>
            <div class="flex-container flexFlowColumn marginTop5" style="max-width: 100px;">
                <label for="scenario_pattern_editor_flags" title="Regex flags: g = global, m = multiline, i = case-insensitive.">Flags</label>
                <input type="text" id="scenario_pattern_editor_flags" class="text_pole"
                    value="${escapeHtml(existingPattern?.flags || 'gm')}"
                    placeholder="gm">
            </div>
            <div class="flex-container flexFlowColumn marginTop10">
                <label for="scenario_pattern_editor_test_input">Test Text</label>
                <textarea id="scenario_pattern_editor_test_input" class="text_pole" rows="3"
                    placeholder="Paste sample text here to test your pattern..."></textarea>
            </div>
            <div class="flex-container gap5px marginTop5">
                <div id="scenario_pattern_editor_test_btn" class="menu_button menu_button_icon">
                    <i class="fa-solid fa-vial"></i>
                    <span>Test Pattern</span>
                </div>
            </div>
            <div id="scenario_pattern_editor_test_result" class="filter_test_result" style="display: none;">
                <div class="scenario_pattern_test_matches"></div>
                <div class="scenario_pattern_test_output"></div>
            </div>
        </div>
    `;

    $(document).off('click', '#scenario_pattern_editor_test_btn').on('click', '#scenario_pattern_editor_test_btn', function () {
        const pattern = String($('#scenario_pattern_editor_pattern').val() || '');
        const flags = String($('#scenario_pattern_editor_flags').val() || 'gm');
        const testInput = String($('#scenario_pattern_editor_test_input').val() || '');

        if (!pattern || !testInput) return;

        try {
            const gFlags = flags.includes('g') ? flags : flags + 'g';
            const regex = new RegExp(pattern, gFlags);
            const matches = [...testInput.matchAll(regex)];
            const resultEl = $('#scenario_pattern_editor_test_result');
            resultEl.show();

            if (matches.length === 0) {
                resultEl.find('.scenario_pattern_test_matches').html('<strong>0</strong> matches found');
                resultEl.find('.scenario_pattern_test_output').html('');
            } else {
                const names = matches.map(m => escapeHtml((m[1] ?? m[0]).trim()));
                resultEl.find('.scenario_pattern_test_matches').html(
                    `<strong>${matches.length}</strong> match${matches.length !== 1 ? 'es' : ''} found`
                );
                resultEl.find('.scenario_pattern_test_output').html(
                    `<strong>Captured names:</strong> ${names.map(n => `<span class="scenario_test_char_badge">${n}</span>`).join(' ')}`
                );
            }
        } catch (err) {
            const resultEl = $('#scenario_pattern_editor_test_result');
            resultEl.show();
            resultEl.find('.scenario_pattern_test_matches').html(`<span class="filter_test_error">Error: ${escapeHtml(err.message)}</span>`);
            resultEl.find('.scenario_pattern_test_output').html('');
        }
    });

    let capturedValues = null;

    const result = await callGenericPopup(html, POPUP_TYPE.CONFIRM, '', {
        okButton: isEdit ? 'Save' : 'Create',
        cancelButton: 'Cancel',
        wide: true,
        onClosing: (popup) => {
            if (popup.result === POPUP_RESULT.AFFIRMATIVE) {
                capturedValues = {
                    name: String($('#scenario_pattern_editor_name').val() || '').trim(),
                    description: String($('#scenario_pattern_editor_description').val() || '').trim(),
                    pattern: String($('#scenario_pattern_editor_pattern').val() || '').trim(),
                    flags: String($('#scenario_pattern_editor_flags').val() || '').trim() || 'gm',
                };
            }
            return true;
        },
    });

    $(document).off('click', '#scenario_pattern_editor_test_btn');

    if (result !== POPUP_RESULT.AFFIRMATIVE || !capturedValues) return null;

    const { name, pattern, flags } = capturedValues;

    if (!name || !pattern) {
        /** @type {any} */
        const toast = window.toastr;
        toast.warning('Pattern name and regex are required.');
        return null;
    }

    try {
        new RegExp(pattern, flags);
    } catch {
        /** @type {any} */
        const toast = window.toastr;
        toast.error('Invalid regex pattern.');
        return null;
    }

    return capturedValues;
}

async function onClickAddScenarioPattern() {
    const result = await openScenarioPatternEditorModal(null);
    if (!result) return;

    const settings = getSettings();
    if (!Array.isArray(settings.scenarioCustomPatterns)) {
        settings.scenarioCustomPatterns = [];
    }

    settings.scenarioCustomPatterns.push({
        id: `scenario_custom_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        name: result.name,
        pattern: result.pattern,
        flags: result.flags,
        description: result.description,
        enabled: true,
    });

    saveSettingsDebounced();
    setLastMessage(null);
    renderScenarioCustomPatternsList();
}

async function onClickEditScenarioPattern(patternId) {
    const settings = getSettings();
    const pattern = (settings.scenarioCustomPatterns || []).find(p => p.id === patternId);
    if (!pattern) return;

    const result = await openScenarioPatternEditorModal(pattern);
    if (!result) return;

    Object.assign(pattern, result);
    saveSettingsDebounced();
    setLastMessage(null);
    renderScenarioCustomPatternsList();
}

function onClickDeleteScenarioPattern(patternId) {
    const settings = getSettings();
    if (!Array.isArray(settings.scenarioCustomPatterns)) return;
    const index = settings.scenarioCustomPatterns.findIndex(p => p.id === patternId);
    if (index < 0) return;
    settings.scenarioCustomPatterns.splice(index, 1);
    saveSettingsDebounced();
    setLastMessage(null);
    renderScenarioCustomPatternsList();
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
