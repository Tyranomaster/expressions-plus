/**
 * Sprite Pack Import/Export for Expressions+
 *
 * Exports character sprites as a ZIP using a _xp_ prefix convention for subfolder
 * files and a disguised manifest (_xp_manifest.png). On import, the standard
 * /api/sprites/upload-zip extracts everything flat into the base folder.
 * Expressions-Plus detects the manifest on next load, reassembles the subfolder
 * structure via individual uploads, then cleans up the prefixed files and manifest.
 * Without Expressions-Plus, the _xp_ files are silently ignored by the built-in
 * extension (unrecognized expression labels). JSZip (already bundled) is used for export.
 */

import { getRequestHeaders, saveSettingsDebounced } from '../../../../../script.js';
import { getExpressionSets, addExpressionSet } from './expression-sets.js';
import { getBaseSpriteFolderName, getSpriteFolderName, getFolderNameByMessage, getLastCharacterMessage } from './sprites.js';
import { spriteCache, clearSpriteCache, clearExpressionSetsCache } from './state.js';
import { DEFAULT_EXPRESSION_SET, DEFAULT_PLUS_EXPRESSION_SET } from './constants.js';

// ============================================================================
// Constants
// ============================================================================

/** Label the server extracts for the manifest file (lowercased, no extension) */
const MANIFEST_LABEL = '_xp_manifest';

/** Prefix applied to subfolder sprite filenames inside the ZIP */
const XP_PREFIX = '_xp_';

/** Manifest schema version */
const SPRITE_PACK_VERSION = '0.3.1';

/**
 * @typedef {Object} ToastrLib
 * @property {function(string, string=, Object=): *} error
 * @property {function(string, string=, Object=): *} success
 * @property {function(string, string=, Object=): *} warning
 * @property {function(string, string=, Object=): *} info
 * @property {function(*): void} clear
 */

/** @type {ToastrLib & {clear: function}} */
// @ts-ignore - toastr is a global library
const toast = window.toastr;

// ============================================================================
// Dependency Injection
// ============================================================================

let validateImages = null;
let renderCharacterAssignments = null;

/**
 * Sets the validateImages function reference
 * @param {Function} fn
 */
export function setValidateImagesFn(fn) {
    validateImages = fn;
}

/**
 * Sets the renderCharacterAssignments function reference
 * @param {Function} fn
 */
export function setRenderCharacterAssignmentsFn(fn) {
    renderCharacterAssignments = fn;
}

// ============================================================================
// Export — Current Folder (flat, no manifest)
// ============================================================================

/**
 * Exports just the currently active sprite folder as a flat ZIP (no manifest).
 * Works identically to the built-in extension's export.
 */
export async function exportCurrentFolder() {
    const characterMessage = getLastCharacterMessage();
    const folderName = getSpriteFolderName(characterMessage);

    if (!folderName) {
        toast.warning('No character selected');
        return;
    }

    const exportToast = toast.info('Exporting folder...', 'Export', { timeOut: 0, extendedTimeOut: 0 });

    try {
        await import('../../../../../lib/jszip.min.js');
        // @ts-ignore — JSZip is a UMD global loaded dynamically
        const zip = new JSZip();

        const sprites = await fetchRawSprites(folderName);
        let fileCount = 0;

        for (const sprite of sprites) {
            // Skip any leftover _xp_ / manifest files
            if (sprite.label === MANIFEST_LABEL || sprite.label.startsWith(XP_PREFIX)) continue;

            const fileName = extractFileName(sprite.path);
            const blob = await fetchSpriteBlob(sprite.path);
            if (blob) {
                zip.file(fileName, blob);
                fileCount++;
            }
        }

        if (fileCount === 0) {
            toast.clear(exportToast);
            toast.warning('No sprites found in this folder');
            return;
        }

        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const safeName = folderName.replace(/\//g, '_');
        triggerDownload(zipBlob, `${safeName}_sprites.zip`);

        toast.clear(exportToast);
        toast.success(`Exported ${fileCount} sprites from ${folderName.includes('/') ? folderName.split('/').pop() : folderName}`);
    } catch (error) {
        toast.clear(exportToast);
        console.error('Expressions+: Folder export failed:', error);
        toast.error('Failed to export folder');
    }
}

// ============================================================================
// Export — All (base + subfolders with manifest)
// ============================================================================

/**
 * @typedef {Object} SpritePackManifest
 * @property {string} version
 * @property {string} character
 * @property {string[]} subfolders
 * @property {{[prefixedName: string]: {folder: string, originalName: string}}} files
 */

/**
 * Exports all sprites (base folder + registered subfolders) as a ZIP file.
 * Base sprites are stored flat; subfolder sprites are prefixed with _xp_{folder}_.
 * A manifest file (_xp_manifest.png) containing JSON metadata is included.
 */
export async function exportSpritePack() {
    const characterMessage = getLastCharacterMessage();
    const characterId = getFolderNameByMessage(characterMessage);
    const baseName = getBaseSpriteFolderName(characterMessage);

    if (!characterId || !baseName) {
        toast.warning('No character selected');
        return;
    }

    const exportToast = toast.info('Building sprite pack...', 'Export', { timeOut: 0, extendedTimeOut: 0 });

    try {
        // Load JSZip (UMD — attaches to window.JSZip)
        await import('../../../../../lib/jszip.min.js');
        // @ts-ignore — JSZip is a UMD global loaded dynamically
        const zip = new JSZip();

        // Fetch base folder sprites (raw server response: [{label, path}, ...])
        const baseSprites = await fetchRawSprites(baseName);

        // Get registered subfolders (exclude pseudo-sets)
        const expressionSets = getExpressionSets(characterId)
            .filter(s => s.folder !== DEFAULT_PLUS_EXPRESSION_SET && s.folder !== DEFAULT_EXPRESSION_SET);

        /** @type {SpritePackManifest} */
        const manifest = {
            version: SPRITE_PACK_VERSION,
            character: baseName,
            subfolders: expressionSets.map(s => s.folder),
            files: {},
        };

        let fileCount = 0;

        // ---- Base sprites → ZIP root (no prefix) ----
        for (const sprite of baseSprites) {
            // Skip leftover manifest / _xp_ files from a previous export
            if (sprite.label === MANIFEST_LABEL || sprite.label.startsWith(XP_PREFIX)) continue;

            const fileName = extractFileName(sprite.path);
            const blob = await fetchSpriteBlob(sprite.path);
            if (blob) {
                zip.file(fileName, blob);
                fileCount++;
            }
        }

        // ---- Subfolder sprites → ZIP with _xp_{folder}_ prefix ----
        for (const set of expressionSets) {
            const folderSprites = await fetchRawSprites(`${baseName}/${set.folder}`);
            const sanitizedFolder = sanitizeFolderName(set.folder);

            for (const sprite of folderSprites) {
                const originalFileName = extractFileName(sprite.path);
                const prefixedFileName = `${XP_PREFIX}${sanitizedFolder}_${originalFileName}`;

                manifest.files[prefixedFileName] = {
                    folder: set.folder,
                    originalName: originalFileName,
                };

                const blob = await fetchSpriteBlob(sprite.path);
                if (blob) {
                    zip.file(prefixedFileName, blob);
                    fileCount++;
                }
            }
        }

        if (fileCount === 0) {
            toast.clear(exportToast);
            toast.warning('No sprites found to export');
            return;
        }

        // ---- Manifest (JSON disguised as .png) ----
        const manifestJson = JSON.stringify(manifest, null, 2);
        zip.file(`${MANIFEST_LABEL}.png`, new Blob([manifestJson], { type: 'text/plain' }));

        // ---- Generate & download ----
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        triggerDownload(zipBlob, `${baseName}_sprites.zip`);

        toast.clear(exportToast);
        const subfolderNote = expressionSets.length > 0
            ? ` (${expressionSets.length} subfolder${expressionSets.length !== 1 ? 's' : ''})`
            : '';
        toast.success(`Exported ${fileCount} sprites${subfolderNote}`);
    } catch (error) {
        toast.clear(exportToast);
        console.error('Expressions+: Export failed:', error);
        toast.error('Failed to export sprite pack');
    }
}

// ============================================================================
// Import (ZIP Upload)
// ============================================================================

/**
 * Opens a file picker for a ZIP, uploads it to /api/sprites/upload-zip
 * (extracts flat into the base character folder), then triggers reconstruction
 * to reassemble subfolder structure from the manifest.
 */
export async function importSpritePack() {
    const characterMessage = getLastCharacterMessage();
    const baseName = getBaseSpriteFolderName(characterMessage);

    if (!baseName) {
        toast.warning('No character selected');
        return;
    }

    /** @param {Event} e */
    const handleUpload = async (e) => {
        const file = /** @type {HTMLInputElement} */ (e.target).files?.[0];
        if (!file) return;

        const uploadToast = toast.info('Uploading sprite pack...', 'Import', { timeOut: 0, extendedTimeOut: 0 });

        try {
            const formData = new FormData();
            formData.append('name', baseName);
            formData.append('avatar', file);

            const result = await fetch('/api/sprites/upload-zip', {
                method: 'POST',
                headers: getRequestHeaders({ omitContentType: true }),
                body: formData,
            });

            if (!result.ok) {
                throw new Error(`Server returned ${result.status}`);
            }

            const data = await result.json();
            toast.clear(uploadToast);
            toast.success(`Uploaded ${data.count} files from sprite pack`);

            // Clear cache and attempt reconstruction
            delete spriteCache[baseName];
            await checkAndReconstructSpritePack();

            // Refresh sprite list UI
            if (validateImages) {
                await validateImages(baseName, true);
            }
        } catch (error) {
            toast.clear(uploadToast);
            console.error('Expressions+: Sprite pack upload failed:', error);
            toast.error('Failed to upload sprite pack');
        }

        /** @type {HTMLFormElement} */ (/** @type {HTMLInputElement} */ (e.target).form)?.reset();
    };

    $('#expressions_plus_upload_zip')
        .off('change')
        .on('change', handleUpload)
        .trigger('click');
}

// ============================================================================
// Reconstruction
// ============================================================================

/**
 * Checks for a sprite pack manifest (_xp_manifest.png) in the base character
 * folder. If found, moves prefixed sprites to their correct subfolders,
 * registers expression sets, and cleans up.
 *
 * This is called:
 * - Immediately after a sprite pack ZIP is uploaded (importSpritePack)
 * - On CHAT_CHANGED (fire-and-forget, to handle CharX imports or other sources)
 *
 * @returns {Promise<boolean>} True if reconstruction was performed
 */
export async function checkAndReconstructSpritePack() {
    const characterMessage = getLastCharacterMessage();
    const characterId = getFolderNameByMessage(characterMessage);
    const baseName = getBaseSpriteFolderName(characterMessage);

    if (!characterId || !baseName) return false;

    // Quick check: look for manifest in the base folder
    const baseSprites = await fetchRawSprites(baseName);
    const manifestSprite = baseSprites.find(s => s.label === MANIFEST_LABEL);
    if (!manifestSprite) return false;

    console.log('Expressions+: Sprite pack manifest found — starting reconstruction');

    // ---- Parse manifest ----
    /** @type {SpritePackManifest} */
    let manifest;
    try {
        const manifestUrl = manifestSprite.path.split('?')[0];
        const response = await fetch(manifestUrl);
        const text = await response.text();
        manifest = JSON.parse(text);
    } catch (error) {
        console.error('Expressions+: Failed to parse sprite pack manifest:', error);
        await deleteSprite(baseName, MANIFEST_LABEL, MANIFEST_LABEL);
        return false;
    }

    if (!manifest.files || !manifest.subfolders || !Array.isArray(manifest.subfolders)) {
        console.warn('Expressions+: Invalid sprite pack manifest structure');
        await deleteSprite(baseName, MANIFEST_LABEL, MANIFEST_LABEL);
        return false;
    }

    const reconstructToast = toast.info(
        `Reconstructing ${manifest.subfolders.length} subfolder(s)...`,
        'Sprite Pack',
        { timeOut: 0, extendedTimeOut: 0 },
    );

    // ---- Find all _xp_-prefixed sprites ----
    const xpSprites = baseSprites.filter(s =>
        s.label.startsWith(XP_PREFIX) && s.label !== MANIFEST_LABEL,
    );

    let uploadedCount = 0;
    let errorCount = 0;

    for (const sprite of xpSprites) {
        const fileName = extractFileName(sprite.path);

        // Look up mapping (case-insensitive for robustness)
        const fileNameLower = fileName.toLowerCase();
        const manifestKey = Object.keys(manifest.files)
            .find(k => k.toLowerCase() === fileNameLower);

        if (!manifestKey) {
            console.warn(`Expressions+: No manifest mapping for ${fileName}, skipping`);
            continue;
        }

        const mapping = manifest.files[manifestKey];

        try {
            // Fetch the sprite image
            const blob = await fetchSpriteBlob(sprite.path);
            if (!blob) continue;

            // Derive label and spriteName from the original filename
            const originalNameNoExt = mapping.originalName.replace(/\.[^/.]+$/, '');
            const label = originalNameNoExt.match(/^(.+?)(?:[-\\.].*?)?$/)?.[1] ?? originalNameNoExt;

            // Upload to the correct subfolder
            const targetFolder = `${baseName}/${mapping.folder}`;
            const formData = new FormData();
            formData.append('name', targetFolder);
            formData.append('label', label);
            formData.append('avatar', blob, mapping.originalName);
            formData.append('spriteName', originalNameNoExt);

            const uploadResult = await fetch('/api/sprites/upload', {
                method: 'POST',
                headers: getRequestHeaders({ omitContentType: true }),
                body: formData,
            });

            if (uploadResult.ok) {
                uploadedCount++;
            } else {
                errorCount++;
                console.error(`Expressions+: Failed to upload ${mapping.originalName} to ${mapping.folder}`);
            }

            // Delete the _xp_ file from the base folder
            const spriteNameNoExt = fileName.replace(/\.[^/.]+$/, '');
            await deleteSprite(baseName, sprite.label, spriteNameNoExt);
        } catch (error) {
            errorCount++;
            console.error(`Expressions+: Error reconstructing ${fileName}:`, error);
        }
    }

    // ---- Cleanup ----
    await deleteSprite(baseName, MANIFEST_LABEL, MANIFEST_LABEL);

    // Register subfolders as expression sets
    for (const folder of manifest.subfolders) {
        addExpressionSet(characterId, folder);
    }
    saveSettingsDebounced();

    // Clear caches so next render picks up the new state
    clearSpriteCache();
    clearExpressionSetsCache();

    toast.clear(reconstructToast);

    if (errorCount > 0) {
        toast.warning(`Reconstructed ${uploadedCount} sprites with ${errorCount} error(s)`);
    } else {
        toast.success(`Reconstructed ${uploadedCount} sprites across ${manifest.subfolders.length} subfolder(s)`);
    }

    // Re-render character assignments so the expression set dropdown reflects new subfolders
    if (renderCharacterAssignments) {
        renderCharacterAssignments();
    }

    console.log(`Expressions+: Reconstruction complete — ${uploadedCount} uploaded, ${errorCount} errors`);
    return true;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Fetches the raw sprite list from the server (ungrouped {label, path} objects)
 * @param {string} name - Sprite folder name (e.g., "CharName" or "CharName/subfolder")
 * @returns {Promise<{label: string, path: string}[]>}
 */
async function fetchRawSprites(name) {
    try {
        const result = await fetch(`/api/sprites/get?name=${encodeURIComponent(name)}`, {
            headers: getRequestHeaders(),
        });
        return result.ok ? await result.json() : [];
    } catch {
        return [];
    }
}

/**
 * Extracts the filename from a sprite path (strips directory and query params)
 * @param {string} spritePath - e.g., "/characters/CharName/joy.png?t=20240610"
 * @returns {string} e.g., "joy.png"
 */
function extractFileName(spritePath) {
    return spritePath.split('/').pop()?.split('?')[0] ?? '';
}

/**
 * Fetches a sprite image as a Blob
 * @param {string} spritePath - Full sprite URL path
 * @returns {Promise<Blob|null>}
 */
async function fetchSpriteBlob(spritePath) {
    try {
        const url = spritePath.split('?')[0];
        const response = await fetch(url);
        return response.ok ? await response.blob() : null;
    } catch {
        return null;
    }
}

/**
 * Sanitizes a folder name for use in the _xp_ prefix.
 * Only allows alphanumeric characters and underscores.
 * @param {string} name
 * @returns {string}
 */
function sanitizeFolderName(name) {
    return name.replace(/[^a-zA-Z0-9_]/g, '_');
}

/**
 * Deletes a sprite file from a character folder
 * @param {string} name - Character folder name
 * @param {string} label - Expression label
 * @param {string} spriteName - Sprite name without extension
 */
async function deleteSprite(name, label, spriteName) {
    try {
        await fetch('/api/sprites/delete', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ name, label, spriteName }),
        });
    } catch (error) {
        console.error(`Expressions+: Failed to delete sprite ${spriteName}:`, error);
    }
}

/**
 * Triggers a file download in the browser
 * @param {Blob} blob
 * @param {string} fileName
 */
function triggerDownload(blob, fileName) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
}
