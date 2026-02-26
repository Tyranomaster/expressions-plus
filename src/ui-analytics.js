/**
 * Analytics UI for Expressions+
 * Handles the analytics viewer dialog and interactions.
 */

import { saveSettingsDebounced } from '../../../../../script.js';
import { renderExtensionTemplateAsync } from '../../../../extensions.js';
import { MODULE_NAME } from './constants.js';
import { getSettings } from './settings.js';
import {
    initAnalyticsDatabase,
    getSummarizedData,
    getTotalEntryCount,
    clearAllData,
    exportData,
    importData,
} from './analytics.js';

/**
 * @typedef {Object} ToastrLib
 * @property {function(string, string=, Object=): void} error
 * @property {function(string, string=, Object=): void} success  
 * @property {function(string, string=, Object=): void} warning
 * @property {function(string, string=, Object=): void} info
 */

/** @type {ToastrLib} */
// @ts-ignore - toastr is a global library
const toast = window.toastr;

/** @type {boolean} */
let dialogInitialized = false;

// ============================================================================
// Dialog Management
// ============================================================================

/**
 * Initializes the analytics dialog (loads template, binds events)
 */
export async function initAnalyticsDialog() {
    if (dialogInitialized) return;
    
    await initAnalyticsDatabase();
    
    const dialogHtml = await renderExtensionTemplateAsync(MODULE_NAME, 'templates/analytics-dialog');
    $('body').append(dialogHtml);
    
    bindDialogEvents();
    
    dialogInitialized = true;
}

/**
 * Opens the analytics dialog
 */
export async function openAnalyticsDialog() {
    if (!dialogInitialized) {
        await initAnalyticsDialog();
    }
    
    $('#expressions_plus_analytics_dialog').show();
    await refreshAnalyticsData();
}

/**
 * Closes the analytics dialog
 */
export function closeAnalyticsDialog() {
    $('#expressions_plus_analytics_dialog').hide();
}

/**
 * Binds event handlers for the dialog
 */
function bindDialogEvents() {
    $('.analytics_dialog_close').on('click', closeAnalyticsDialog);
    
    $('.analytics_dialog_overlay').on('click', function(e) {
        if (e.target === this) {
            closeAnalyticsDialog();
        }
    });
    
    $('#analytics_max_difference').on('input', function() {
        $('#analytics_max_difference_value').text($(this).val() + '%');
    });
    
    $('#analytics_apply_filters').on('click', refreshAnalyticsData);
    
    $('#analytics_export_btn').on('click', handleExport);
    $('#analytics_import_btn').on('click', () => $('#analytics_import_file').click());
    $('#analytics_import_file').on('change', handleImport);
    $('#analytics_clear_btn').on('click', handleClearData);
    
    $('#analytics_results_list').on('click', '.analytics_combination_header', function() {
        const $item = $(this).closest('.analytics_combination_item');
        const $entries = $item.find('.analytics_combination_entries');
        const $toggle = $(this).find('.analytics_combination_toggle');
        
        $entries.slideToggle(200);
        $toggle.toggleClass('expanded');
    });
    
    $(document).on('keydown', (e) => {
        if (e.key === 'Escape' && $('#expressions_plus_analytics_dialog').is(':visible')) {
            closeAnalyticsDialog();
        }
    });
}

// ============================================================================
// Data Display
// ============================================================================

/**
 * Gets the current filter values from the dialog
 * @returns {{maxDifference: number, emotionCount: number|'both', minOccurrences: number, minScoreDiff: number}}
 */
function getFilterValues() {
    const maxDifference = parseInt(String($('#analytics_max_difference').val()), 10) / 100;
    const emotionCountVal = String($('input[name="analytics_emotion_count"]:checked').val());
    const emotionCount = emotionCountVal === 'both' ? 'both' : parseInt(emotionCountVal, 10);
    const minOccurrences = parseInt(String($('#analytics_min_occurrences').val()), 10) || 1;
    const minScoreDiff = (parseFloat(String($('#analytics_min_score_diff').val())) || 0) / 100;
    
    return { maxDifference, emotionCount, minOccurrences, minScoreDiff };
}

/**
 * Refreshes the analytics data display
 */
async function refreshAnalyticsData() {
    const $resultsList = $('#analytics_results_list');
    $resultsList.html('<div class="analytics_loading"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</div>');
    
    try {
        const totalCount = await getTotalEntryCount();
        
        const filters = getFilterValues();
        const summaries = await getSummarizedData(filters);
        
        const filteredEntryCount = summaries.reduce((sum, s) => sum + s.count, 0);
        $('#analytics_total_count').text(`${filteredEntryCount} / ${totalCount} entries`);
        
        if (summaries.length === 0) {
            $resultsList.html('<div class="analytics_no_data">No data matches the current filters</div>');
            $('#analytics_filtered_count').text('Showing 0 combinations');
            return;
        }
        
        $resultsList.empty();
        
        const template = /** @type {HTMLTemplateElement} */ (document.getElementById('analytics_combination_template'));
        const entryTemplate = /** @type {HTMLTemplateElement} */ (document.getElementById('analytics_entry_template'));
        
        for (const summary of summaries) {
            const itemClone = /** @type {DocumentFragment} */ (template.content.cloneNode(true));
            const itemElement = /** @type {HTMLElement} */ (itemClone.firstElementChild);
            const $item = $(itemElement);
            
            $item.find('.analytics_combination_key').text(summary.combinationKey);
            $item.find('.analytics_count_badge').text(`${summary.count} hits`);
            $item.find('.analytics_emotion_count_badge').text(`${summary.emotionCount} emotions`);
            $item.find('.analytics_diff_badge').text(`+${(summary.avgScoreDifference * 100).toFixed(1)}%`);
            
            const $entriesContainer = $item.find('.analytics_combination_entries');
            
            for (const entry of summary.entries.slice(0, 50)) {
                const entryClone = /** @type {DocumentFragment} */ (entryTemplate.content.cloneNode(true));
                const entryElement = /** @type {HTMLElement} */ (entryClone.firstElementChild);
                const $entry = $(entryElement);
                
                $entry.find('.analytics_entry_combo_score').text((entry.combinationScore * 100).toFixed(1) + '%');
                $entry.find('.analytics_entry_chosen_score').text((entry.chosenScore * 100).toFixed(1) + '%');
                $entry.find('.analytics_entry_chosen_name').text(`(${entry.chosenExpression})`);
                $entry.find('.analytics_entry_text').text(entry.text);
                $entry.find('.analytics_entry_timestamp').text(formatTimestamp(entry.timestamp));
                
                $entriesContainer.append($entry);
            }
            
            if (summary.entries.length > 50) {
                $entriesContainer.append(`<div class="analytics_entry_item" style="justify-content: center; color: var(--SmartThemeQuoteColor);">...and ${summary.entries.length - 50} more entries</div>`);
            }
            
            $resultsList.append($item);
        }
        
        $('#analytics_filtered_count').text(`Showing ${summaries.length} combinations`);
        
    } catch (error) {
        console.error('Failed to refresh analytics data:', error);
        $resultsList.html('<div class="analytics_no_data">Error loading data</div>');
    }
}

/**
 * Formats a timestamp for display
 * @param {string} isoTimestamp 
 * @returns {string}
 */
function formatTimestamp(isoTimestamp) {
    try {
        const date = new Date(isoTimestamp);
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
        return isoTimestamp;
    }
}

// ============================================================================
// Data Management Actions
// ============================================================================

/**
 * Handles exporting analytics data
 */
async function handleExport() {
    try {
        const data = await exportData();
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `expressions-plus-analytics-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        toast.success('Analytics data exported successfully');
    } catch (error) {
        console.error('Export failed:', error);
        toast.error('Failed to export analytics data');
    }
}

/**
 * Handles importing analytics data
 * @param {Event} event 
 */
async function handleImport(event) {
    const input = /** @type {HTMLInputElement} */ (event.target);
    const file = input.files?.[0];
    
    if (!file) return;
    
    try {
        const text = await file.text();
        const count = await importData(text);
        
        toast.success(`Imported ${count} entries successfully`);
        await refreshAnalyticsData();
    } catch (error) {
        console.error('Import failed:', error);
        toast.error('Failed to import analytics data: ' + error.message);
    } finally {
        input.value = '';
    }
}

/**
 * Handles clearing all analytics data
 */
async function handleClearData() {
    const confirmed = await new Promise(resolve => {
        const popup = $(`
            <div class="analytics_confirm_overlay"></div>
            <div class="analytics_confirm_popup">
                <p>Are you sure you want to clear all analytics data?</p>
                <p class="analytics_confirm_warning">This action cannot be undone.</p>
                <div class="analytics_confirm_buttons">
                    <button class="menu_button confirm_yes">Yes, Clear Data</button>
                    <button class="menu_button confirm_no">Cancel</button>
                </div>
            </div>
        `);
        
        $('body').append(popup);
        
        popup.find('.confirm_yes').on('click', () => {
            popup.remove();
            resolve(true);
        });
        
        popup.find('.confirm_no, .analytics_confirm_overlay').on('click', () => {
            popup.remove();
            resolve(false);
        });
    });
    
    if (!confirmed) return;
    
    try {
        await clearAllData();
        toast.success('Analytics data cleared');
        await refreshAnalyticsData();
    } catch (error) {
        console.error('Clear data failed:', error);
        toast.error('Failed to clear analytics data');
    }
}

// ============================================================================
// Settings UI Handlers
// ============================================================================

/**
 * Initializes the analytics settings UI
 */
export function initAnalyticsSettings() {
    const settings = getSettings();
    
    $('#expressions_plus_analytics_enabled').prop('checked', settings.analyticsEnabled ?? false)
        .on('change', function() {
            settings.analyticsEnabled = $(this).prop('checked');
            saveSettingsDebounced();
        });
    
    const emotionCount = settings.analyticsEmotionCount ?? 'both';
    $(`input[name="expressions_plus_analytics_emotion_count"][value="${emotionCount}"]`).prop('checked', true);
    
    $('input[name="expressions_plus_analytics_emotion_count"]').on('change', function() {
        const value = String($(this).val());
        settings.analyticsEmotionCount = value === 'both' ? 'both' : parseInt(value, 10);
        saveSettingsDebounced();
    });
    
    $('#expressions_plus_analytics_view').on('click', openAnalyticsDialog);
}
