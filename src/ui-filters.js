/**
 * UI for Text Filters — Expressions+
 *
 * Handles the settings panel for built-in filter toggles, custom filter CRUD
 * with modal editor, and filter preset import/export.
 */

import { saveSettingsDebounced } from '../../../../../script.js';
import { callGenericPopup, POPUP_TYPE, POPUP_RESULT } from '../../../../popup.js';
import { getContext } from '../../../../extensions.js';

import { BUILTIN_FILTER, SPLIT_STRATEGY, DEFAULT_SAMPLE_SIZE } from './constants.js';
import { getSettings } from './settings.js';
import { setLastMessage } from './state.js';
import {
    getBuiltInFilters,
    getAllFilters,
    createCustomFilter,
    addCustomFilter,
    updateCustomFilter,
    removeCustomFilter,
    moveFilter,
    exportFilterPreset,
    importFilterPreset,
    testFilter,
} from './filters.js';
import { inspectPreprocessing } from './api.js';
import { getHighlightColor } from './segment-annotations.js';

// ============================================================================
// Helpers
// ============================================================================

/**
 * Live-refreshes all existing annotation highlight spans with current settings.
 * Called when color pickers or opacity sliders change.
 */
function refreshHighlights() {
    const spans = document.querySelectorAll('.segment-annotation-highlight');
    spans.forEach(span => {
        const idx = parseInt(span.getAttribute('data-segment-index') || '-1', 10);
        if (idx < 0) return;
        const currentBg = /** @type {HTMLElement} */ (span).style.backgroundColor;
        // Heuristic: active highlights have higher opacity than inactive
        const settings = getSettings();
        const midpoint = ((settings.highlightOpacityActive ?? 0.40) + (settings.highlightOpacityInactive ?? 0.20)) / 2;
        const opacityMatch = currentBg.match(/,\s*([\d.]+)\)$/);
        const currentOpacity = opacityMatch ? parseFloat(opacityMatch[1]) : 0;
        const isActive = currentOpacity >= midpoint;
        /** @type {HTMLElement} */ (span).style.backgroundColor = getHighlightColor(idx, isActive);
    });
}

// ============================================================================
// Settings Panel — Built-in Filters & Preprocessing Options
// ============================================================================

/**
 * Initializes the text preprocessing section event handlers.
 * Called once from index.js after settings HTML is injected.
 */
export function initFilterSettings() {
    const settings = getSettings();

    $('#expressions_plus_sample_size')
        .val(settings.sampleSize ?? DEFAULT_SAMPLE_SIZE)
        .on('change', function () {
            const val = parseInt(String($(this).val()), 10);
            if (!isNaN(val) && val > 1600) {
                /** @type {any} */
                const toast = window.toastr;
                toast.warning('Sample size cannot exceed 1600 characters. Value has been clamped.');
            }
            settings.sampleSize = isNaN(val) ? DEFAULT_SAMPLE_SIZE : Math.max(50, Math.min(1600, val));
            $(this).val(settings.sampleSize);
            saveSettingsDebounced();
            setLastMessage(null);
        });

    $('#expressions_plus_split_strategy')
        .val(settings.splitStrategy ?? SPLIT_STRATEGY.HYBRID)
        .on('change', function () {
            settings.splitStrategy = $(this).val();
            saveSettingsDebounced();
            setLastMessage(null);
        });

    $('#expressions_plus_multi_segment')
        .prop('checked', settings.multiSegmentEnabled ?? true)
        .on('change', function () {
            settings.multiSegmentEnabled = $(this).prop('checked');
            saveSettingsDebounced();
            setLastMessage(null);
        });

    const defaultColors = ['#3B82F6', '#A855F7', '#22C55E', '#F97316', '#EC4899', '#EAB308'];
    if (!Array.isArray(settings.highlightColors)) {
        settings.highlightColors = [...defaultColors];
    }
    for (let i = 0; i < 6; i++) {
        $(`#expressions_plus_highlight_color_${i}`)
            .val(settings.highlightColors[i] ?? defaultColors[i])
            .on('input', function () {
                settings.highlightColors[i] = $(this).val();
                saveSettingsDebounced();
                refreshHighlights();
            });
    }

    const inactiveOpacityPct = Math.round((settings.highlightOpacityInactive ?? 0.20) * 100);
    $('#expressions_plus_highlight_opacity_inactive')
        .val(inactiveOpacityPct)
        .on('input', function () {
            const pct = parseInt(String($(this).val()), 10);
            settings.highlightOpacityInactive = pct / 100;
            $('#expressions_plus_opacity_inactive_label').text(`${pct}%`);
            saveSettingsDebounced();
            refreshHighlights();
        });
    $('#expressions_plus_opacity_inactive_label').text(`${inactiveOpacityPct}%`);

    const activeOpacityPct = Math.round((settings.highlightOpacityActive ?? 0.40) * 100);
    $('#expressions_plus_highlight_opacity_active')
        .val(activeOpacityPct)
        .on('input', function () {
            const pct = parseInt(String($(this).val()), 10);
            settings.highlightOpacityActive = pct / 100;
            $('#expressions_plus_opacity_active_label').text(`${pct}%`);
            saveSettingsDebounced();
            refreshHighlights();
        });
    $('#expressions_plus_opacity_active_label').text(`${activeOpacityPct}%`);

    $('#expressions_plus_highlight_reset').on('click', function () {
        settings.highlightColors = [...defaultColors];
        settings.highlightOpacityInactive = 0.20;
        settings.highlightOpacityActive = 0.40;
        for (let i = 0; i < 6; i++) {
            $(`#expressions_plus_highlight_color_${i}`).val(defaultColors[i]);
        }
        $('#expressions_plus_highlight_opacity_inactive').val(20);
        $('#expressions_plus_opacity_inactive_label').text('20%');
        $('#expressions_plus_highlight_opacity_active').val(40);
        $('#expressions_plus_opacity_active_label').text('40%');
        saveSettingsDebounced();
        refreshHighlights();
    });

    renderFilterList();

    $('#expressions_plus_add_filter').on('click', onClickAddFilter);
    $('#expressions_plus_export_filters').on('click', onClickExportFilters);
    $('#expressions_plus_import_filters').on('click', onClickImportFilters);
    $('#expressions_plus_inspect_classifier').on('click', onClickInspectClassifier);
}

// ============================================================================
// Custom Filter List Rendering
// ============================================================================

/**
 * Renders the unified filter list (built-in + custom) in filterOrder
 */
export function renderFilterList() {
    const container = $('#expressions_plus_all_filters_list');
    container.empty();

    const filters = getAllFilters();
    if (filters.length === 0) {
        container.append('<div class="filter_empty_notice"><small>No filters defined.</small></div>');
        return;
    }

    for (const filter of filters) {
        const isBuiltIn = !!filter.isBuiltIn;

        const tooltipLines = [
            filter.name,
            filter.description ? `\n${filter.description}` : '',
            `\nPattern: ${filter.pattern}`,
            `Flags: ${filter.flags || 'gi'}`,
            `Replacement: ${filter.replacement ? '"' + filter.replacement + '"' : '(remove)'}`,
        ].filter(Boolean).join('\n');

        const actionsHtml = isBuiltIn ? '' : `
                <div class="filter_actions">
                    <div class="menu_button menu_button_icon filter_edit_btn" title="Edit Filter">
                        <i class="fa-solid fa-pencil"></i>
                    </div>
                    <div class="menu_button menu_button_icon filter_delete_btn" title="Delete Filter">
                        <i class="fa-solid fa-trash"></i>
                    </div>
                </div>`;

        const badgeHtml = isBuiltIn
            ? '<span class="filter_builtin_badge">built-in</span>'
            : '';

        const item = $(`
            <div class="filter_item" data-filter-id="${filter.id}" draggable="true" title="${escapeHtml(tooltipLines)}">
                <span class="filter_drag_handle" title="Drag to reorder">
                    <i class="fa-solid fa-grip-vertical"></i>
                </span>
                <label class="checkbox_label filter_toggle">
                    <input type="checkbox" class="filter_enabled_toggle" ${filter.enabled ? 'checked' : ''}>
                </label>
                <span class="filter_name">${escapeHtml(filter.name)}</span>
                ${badgeHtml}
                <span class="filter_pattern_preview">${escapeHtml(truncate(filter.pattern, 30))}</span>
                ${actionsHtml}
            </div>
        `);

        item.find('.filter_enabled_toggle').on('change', function () {
            const settings = getSettings();
            const checked = $(this).prop('checked');
            if (isBuiltIn) {
                if (!settings.filtersBuiltIn) settings.filtersBuiltIn = {};
                settings.filtersBuiltIn[filter.id] = checked;
            } else {
                updateCustomFilter(filter.id, { enabled: checked });
            }
            saveSettingsDebounced();
            setLastMessage(null);
        });

        if (!isBuiltIn) {
            item.find('.filter_edit_btn').on('click', () => onClickEditFilter(filter.id));
            item.find('.filter_delete_btn').on('click', () => onClickDeleteFilter(filter.id));
        }

        container.append(item);
    }

    initFilterDragAndDrop();
}

// ============================================================================
// Filter Drag & Drop Reordering
// ============================================================================

/** @type {HTMLElement|null} */
let draggedFilterEl = null;

/**
 * Initializes drag-and-drop on the filter items in the list
 */
function initFilterDragAndDrop() {
    const container = document.getElementById('expressions_plus_all_filters_list');
    if (!container) return;

    container.querySelectorAll('.filter_item[draggable]').forEach(item => {
        item.addEventListener('dragstart', onFilterDragStart);
        item.addEventListener('dragend', onFilterDragEnd);
        item.addEventListener('dragover', onFilterDragOver);
        item.addEventListener('dragenter', onFilterDragEnter);
        item.addEventListener('dragleave', onFilterDragLeave);
        item.addEventListener('drop', onFilterDrop);
    });
}

/** @param {DragEvent} e */
function onFilterDragStart(e) {
    draggedFilterEl = /** @type {HTMLElement} */ (e.currentTarget);
    draggedFilterEl.classList.add('filter_dragging');
    if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', draggedFilterEl.dataset.filterId || '');
    }
}

/** @param {DragEvent} e */
function onFilterDragEnd(e) {
    const el = /** @type {HTMLElement} */ (e.currentTarget);
    el.classList.remove('filter_dragging');
    document.querySelectorAll('.filter_drag_over').forEach(el => el.classList.remove('filter_drag_over'));
    draggedFilterEl = null;
}

/** @param {DragEvent} e */
function onFilterDragOver(e) {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
}

/** @param {DragEvent} e */
function onFilterDragEnter(e) {
    e.preventDefault();
    const target = /** @type {HTMLElement} */ (e.currentTarget);
    if (target !== draggedFilterEl) {
        target.classList.add('filter_drag_over');
    }
}

/** @param {DragEvent} e */
function onFilterDragLeave(e) {
    const target = /** @type {HTMLElement} */ (e.currentTarget);
    target.classList.remove('filter_drag_over');
}

/** @param {DragEvent} e */
function onFilterDrop(e) {
    e.preventDefault();
    const target = /** @type {HTMLElement} */ (e.currentTarget);
    target.classList.remove('filter_drag_over');

    if (!draggedFilterEl || target === draggedFilterEl) return;

    const draggedId = draggedFilterEl.dataset.filterId;
    const targetId = target.dataset.filterId;
    if (!draggedId || !targetId) return;

    // Find target index in filterOrder
    const settings = getSettings();
    const targetIndex = (settings.filterOrder || []).indexOf(targetId);
    if (targetIndex === -1) return;

    if (moveFilter(draggedId, targetIndex)) {
        saveSettingsDebounced();
        setLastMessage(null);
        renderFilterList();
    }
}

// ============================================================================
// Filter Modal Editor
// ============================================================================

/**
 * Opens the filter editor modal for creating or editing a custom filter.
 * @param {import('./constants.js').TextFilter|null} existingFilter - Null for new filter
 */
async function openFilterEditorModal(existingFilter) {
    const isEdit = !!existingFilter;
    const title = isEdit ? 'Edit Custom Filter' : 'New Custom Filter';

    const html = `
        <div class="filter_editor">
            <h3>${title}</h3>
            <div class="flex-container flexFlowColumn marginTop5">
                <label for="filter_editor_name" title="A short, descriptive name for this filter.">Filter Name</label>
                <input type="text" id="filter_editor_name" class="text_pole" 
                    value="${escapeHtml(existingFilter?.name || '')}" 
                    placeholder="e.g., Remove action text">
            </div>
            <div class="flex-container flexFlowColumn marginTop5">
                <label for="filter_editor_description" title="Optional explanation of what this filter does. Shown in hover tooltips.">Description <small>(optional)</small></label>
                <input type="text" id="filter_editor_description" class="text_pole" 
                    value="${escapeHtml(existingFilter?.description || '')}" 
                    placeholder="e.g., Removes asterisk-wrapped action/narration text">
            </div>
            <div class="flex-container flexFlowColumn marginTop5">
                <label for="filter_editor_pattern" title="A JavaScript-compatible regular expression pattern. Matched portions of the text will be replaced (or removed if replacement is empty).">Regex Pattern</label>
                <input type="text" id="filter_editor_pattern" class="text_pole" 
                    value="${escapeHtml(existingFilter?.pattern || '')}" 
                    placeholder="e.g., \\*[^*]+\\*">
                <small>JavaScript regex pattern. Matched text will be replaced or removed.</small>
            </div>
            <div class="flex-container gap10px marginTop5">
                <div class="flex-container flexFlowColumn flex1">
                    <label for="filter_editor_flags" title="Regex flags: g = global (replace all), i = case-insensitive, m = multiline, s = dotAll, u = unicode.">Flags</label>
                    <input type="text" id="filter_editor_flags" class="text_pole" 
                        value="${escapeHtml(existingFilter?.flags || 'gi')}" 
                        placeholder="gi">
                    <small>g=global, i=case-insensitive, u=unicode</small>
                </div>
                <div class="flex-container flexFlowColumn flex1">
                    <label for="filter_editor_replacement" title="Text to replace matched content with. Leave empty to remove matches entirely. Supports regex backreferences ($1, $2, etc.).">Replacement</label>
                    <input type="text" id="filter_editor_replacement" class="text_pole" 
                        value="${escapeHtml(existingFilter?.replacement || '')}" 
                        placeholder="(empty = remove)">
                    <small>Leave empty to remove matched text</small>
                </div>
                </div>
            </div>
            <div class="flex-container flexFlowColumn marginTop10">
                <label for="filter_editor_test_input">Test Text</label>
                <textarea id="filter_editor_test_input" class="text_pole" rows="3" 
                    placeholder="Paste sample text here to test your filter...">${escapeHtml('')}</textarea>
            </div>
            <div class="flex-container gap5px marginTop5">
                <div id="filter_editor_test_btn" class="menu_button menu_button_icon">
                    <i class="fa-solid fa-vial"></i>
                    <span>Test Filter</span>
                </div>
            </div>
            <div id="filter_editor_test_result" class="filter_test_result" style="display: none;">
                <div class="filter_test_matches"></div>
                <div class="filter_test_output"></div>
            </div>
        </div>
    `;

    // Register test button handler BEFORE showing popup so it's active while open
    $(document).off('click', '#filter_editor_test_btn').on('click', '#filter_editor_test_btn', function () {
        const pattern = String($('#filter_editor_pattern').val() || '');
        const flags = String($('#filter_editor_flags').val() || '');
        const testInput = String($('#filter_editor_test_input').val() || '');

        if (!pattern || !testInput) return;

        const testResult = testFilter(pattern, flags, testInput);
        const resultEl = $('#filter_editor_test_result');
        resultEl.show();

        if (testResult.error) {
            resultEl.find('.filter_test_matches').html(`<span class="filter_test_error">Error: ${escapeHtml(testResult.error)}</span>`);
            resultEl.find('.filter_test_output').html('');
        } else {
            resultEl.find('.filter_test_matches').html(
                `<strong>${testResult.matches.length}</strong> match${testResult.matches.length !== 1 ? 'es' : ''} found`
            );
            resultEl.find('.filter_test_output').html(
                `<strong>Result:</strong><br><pre>${escapeHtml(testResult.resultText)}</pre>`
            );
        }
    });

    // Capture form values in onClosing while popup DOM is still alive,
    // because the DOM is removed before the callGenericPopup promise resolves.
    let capturedValues = null;

    const result = await callGenericPopup(html, POPUP_TYPE.CONFIRM, '', {
        okButton: isEdit ? 'Save' : 'Create',
        cancelButton: 'Cancel',
        wide: true,
        onClosing: (popup) => {
            if (popup.result === POPUP_RESULT.AFFIRMATIVE) {
                capturedValues = {
                    name: String($('#filter_editor_name').val() || '').trim(),
                    description: String($('#filter_editor_description').val() || '').trim(),
                    pattern: String($('#filter_editor_pattern').val() || '').trim(),
                    flags: String($('#filter_editor_flags').val() || '').trim() || 'gi',
                    replacement: String($('#filter_editor_replacement').val() || ''),
                };
            }
            return true;
        },
    });

    // Clean up delegated handler after popup closes
    $(document).off('click', '#filter_editor_test_btn');

    if (result !== POPUP_RESULT.AFFIRMATIVE || !capturedValues) return null;

    const { name, description, pattern, flags, replacement } = capturedValues;

    if (!name || !pattern) {
        /** @type {any} */
        const toast = window.toastr;
        toast.warning('Filter name and pattern are required.');
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

    return { name, description, pattern, flags, replacement };
}

// ============================================================================
// Event Handlers
// ============================================================================

async function onClickAddFilter() {
    const result = await openFilterEditorModal(null);
    if (!result) return;

    const filter = createCustomFilter(result);
    addCustomFilter(filter);
    saveSettingsDebounced();
    setLastMessage(null);
    renderFilterList();
}

async function onClickEditFilter(filterId) {
    const settings = getSettings();
    const filter = (settings.filtersCustom || []).find(f => f.id === filterId);
    if (!filter) return;

    const result = await openFilterEditorModal(filter);
    if (!result) return;

    updateCustomFilter(filterId, result);
    saveSettingsDebounced();
    setLastMessage(null);
    renderFilterList();
}

function onClickDeleteFilter(filterId) {
    removeCustomFilter(filterId);
    saveSettingsDebounced();
    setLastMessage(null);
    renderFilterList();
}

async function onClickExportFilters() {
    const preset = exportFilterPreset();
    const blob = new Blob([JSON.stringify(preset, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = 'expressions-plus-filters.json';
    a.click();

    URL.revokeObjectURL(url);

    /** @type {any} */
    const toast = window.toastr;
    toast.success('Filter preset exported.');
}

async function onClickImportFilters() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    input.addEventListener('change', async () => {
        const file = input.files?.[0];
        if (!file) return;

        try {
            const text = await file.text();
            const data = JSON.parse(text);
            const success = importFilterPreset(data);

            if (success) {
                saveSettingsDebounced();
                setLastMessage(null);
                renderFilterList();
                initFilterSettingsState();

                /** @type {any} */
                const toast = window.toastr;
                toast.success('Filter preset imported.');
            } else {
                /** @type {any} */
                const toast = window.toastr;
                toast.error('Invalid filter preset file.');
            }
        } catch (error) {
            console.error('Expressions+ Filter Import error:', error);
            /** @type {any} */
            const toast = window.toastr;
            toast.error('Failed to import filter preset.');
        }
    });

    input.click();
}

/**
 * Re-syncs the filter list and control states after import
 */
function initFilterSettingsState() {
    renderFilterList();

    const settings = getSettings();
    $('#expressions_plus_sample_size').val(settings.sampleSize ?? DEFAULT_SAMPLE_SIZE);
    $('#expressions_plus_split_strategy').val(settings.splitStrategy ?? SPLIT_STRATEGY.HYBRID);
    $('#expressions_plus_multi_segment').prop('checked', settings.multiSegmentEnabled ?? true);
}

// ============================================================================
// Classifier Input Inspector
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
    }
    return null;
}

/**
 * Builds an HTML string from `textBefore` with regex matches highlighted in red.
 * @param {string} textBefore - The text before the filter was applied
 * @param {string} pattern - The regex pattern
 * @param {string} flags - The regex flags
 * @returns {string} HTML with matched portions wrapped in red highlight spans
 */
function buildDiffHighlight(textBefore, pattern, flags) {
    if (!textBefore || !pattern) return escapeHtml(textBefore);
    try {
        const gFlags = flags.includes('g') ? flags : flags + 'g';
        const regex = new RegExp(pattern, gFlags);
        const parts = [];
        let last = 0;
        for (const m of textBefore.matchAll(regex)) {
            if (m.index > last) {
                parts.push(escapeHtml(textBefore.substring(last, m.index)));
            }
            parts.push(`<span class="inspector_removed">${escapeHtml(m[0])}</span>`);
            last = m.index + m[0].length;
        }
        if (last < textBefore.length) {
            parts.push(escapeHtml(textBefore.substring(last)));
        }
        return parts.join('');
    } catch {
        return escapeHtml(textBefore);
    }
}

/**
 * Opens a popup showing the full preprocessing pipeline for the last message.
 */
async function onClickInspectClassifier() {
    const lastMsg = getLastCharacterMessage();
    if (!lastMsg || !lastMsg.mes) {
        /** @type {any} */
        const toast = window.toastr;
        toast.warning('No character message found in the current chat.');
        return;
    }

    const result = inspectPreprocessing(lastMsg.mes);

    const segmentRows = result.segments.map((seg, i) => {
        const origSlice = result.postMacro.substring(seg.originalStart, Math.min(seg.originalEnd, result.postMacro.length));

        return `
            <div class="inspector_segment">
                <div class="inspector_segment_header">
                    <span class="inspector_segment_badge" style="background: ${getSegmentColor(i)};">Segment ${i + 1}</span>
                    <span class="inspector_segment_range">chars ${seg.originalStart}–${seg.originalEnd} (${seg.preprocessed.length} chars after preprocessing)</span>
                </div>
                <div class="inspector_segment_body">
                    <div class="inspector_step_label">Original text slice:</div>
                    <pre class="inspector_pre inspector_pre_dim">${escapeHtml(origSlice)}</pre>
                    <div class="inspector_step_label">Classifier input:</div>
                    <pre class="inspector_pre">${escapeHtml(seg.preprocessed)}</pre>
                </div>
            </div>
        `;
    }).join('<div class="inspector_segment_divider">---</div>');

    const filterSteps = (result.filterSteps || []);
    let filterStageNum = 3;
    const filterStageRows = filterSteps.map((step) => {
        const charsLabel = step.charsRemoved !== 0
            ? `<span class="inspector_char_count">${step.charsRemoved > 0 ? '−' : '+'}${Math.abs(step.charsRemoved)} chars</span>`
            : '<span class="inspector_char_count inspector_diff_none">no change</span>';

        const diffHtml = step.charsRemoved !== 0 && step.filterPattern
            ? buildDiffHighlight(step.textBefore, step.filterPattern, step.filterFlags || 'gi')
            : escapeHtml(step.textBefore);

        const num = filterStageNum++;
        return `
            <div class="inspector_stage inspector_stage_filter">
                <div class="inspector_stage_header">
                    <span class="inspector_stage_num">${num}</span>
                    <i class="fa-solid fa-filter" style="opacity:0.5;"></i>
                    <strong>${escapeHtml(step.filterName)}</strong>
                    ${charsLabel}
                </div>
                <pre class="inspector_pre">${diffHtml}</pre>
            </div>
        `;
    }).join(`
                <div class="inspector_stage_arrow">
                    <span class="inspector_diff_note"><i class="fa-solid fa-arrow-down"></i></span>
                </div>
    `);

    const diffSummary = result.postMacro !== result.rawText
        ? '<span class="inspector_diff_note"><i class="fa-solid fa-wand-magic-sparkles"></i> Macros expanded</span>'
        : '<span class="inspector_diff_note inspector_diff_none">No macro changes</span>';

    const afterFiltersNum = filterStageNum++;
    const segmentsNum = filterStageNum++;

    const html = `
        <div class="inspector_dialog inspector_dialog_scroll">
            <h3><i class="fa-solid fa-magnifying-glass-chart"></i> Classifier Input Inspector</h3>
            <small>Showing preprocessing pipeline for <strong>${escapeHtml(lastMsg.name || 'Unknown')}</strong>'s last message (${result.rawText.length} chars)</small>

            <div class="inspector_pipeline">
                <div class="inspector_stage">
                    <div class="inspector_stage_header">
                        <span class="inspector_stage_num">1</span>
                        <strong>Raw Message</strong>
                        <span class="inspector_char_count">${result.rawText.length} chars</span>
                    </div>
                    <pre class="inspector_pre inspector_pre_dim">${escapeHtml(result.rawText)}</pre>
                </div>

                <div class="inspector_stage_arrow">${diffSummary}</div>

                <div class="inspector_stage">
                    <div class="inspector_stage_header">
                        <span class="inspector_stage_num">2</span>
                        <strong>After Macro Expansion</strong>
                        <span class="inspector_char_count">${result.postMacro.length} chars</span>
                    </div>
                    <pre class="inspector_pre">${escapeHtml(result.postMacro)}</pre>
                </div>

                ${filterStageRows ? `
                <div class="inspector_stage_arrow">
                    <span class="inspector_diff_note"><i class="fa-solid fa-filter"></i> ${filterSteps.length} filter${filterSteps.length !== 1 ? 's' : ''} applied</span>
                </div>
                ${filterStageRows}
                ` : ''}

                <div class="inspector_stage_arrow">
                    <span class="inspector_diff_note"><i class="fa-solid fa-arrow-down"></i> Final filtered result</span>
                </div>

                <div class="inspector_stage">
                    <div class="inspector_stage_header">
                        <span class="inspector_stage_num">${afterFiltersNum}</span>
                        <strong>After All Filters</strong>
                        <span class="inspector_char_count">${result.postFilters.length} chars</span>
                    </div>
                    <pre class="inspector_pre">${escapeHtml(result.postFilters)}</pre>
                </div>

                <div class="inspector_stage_arrow">
                    <span class="inspector_diff_note"><i class="fa-solid fa-scissors"></i> Split into ${result.segments.length} segment${result.segments.length !== 1 ? 's' : ''}</span>
                </div>

                <div class="inspector_stage">
                    <div class="inspector_stage_header">
                        <span class="inspector_stage_num">${segmentsNum}</span>
                        <strong>Segments → Classifier</strong>
                    </div>
                    <div class="inspector_segments_list">
                        ${segmentRows || '<div class="inspector_empty">No segments produced.</div>'}
                    </div>
                </div>
            </div>
        </div>
    `;

    await callGenericPopup(html, POPUP_TYPE.TEXT, '', {
        okButton: 'Close',
        wide: true,
        large: true,
    });
}

/**
 * Returns a color for segment index from the annotation palette.
 * @param {number} index
 * @returns {string}
 */
function getSegmentColor(index) {
    const colors = [
        'rgba(59, 130, 246, 0.7)',
        'rgba(168, 85, 247, 0.7)',
        'rgba(34, 197, 94, 0.7)',
        'rgba(249, 115, 22, 0.7)',
        'rgba(236, 72, 153, 0.7)',
        'rgba(234, 179, 8, 0.7)',
    ];
    return colors[index % colors.length];
}

// ============================================================================
// Helpers
// ============================================================================

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function truncate(str, maxLen) {
    if (!str) return '';
    return str.length > maxLen ? str.slice(0, maxLen) + '...' : str;
}
