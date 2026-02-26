# Expressions+ Extension for SillyTavern

All the functionality of SillyTavern's built-in Expressions extension (local classification option), **plus** advanced customization features — custom expression rules, profiles, expression sets, a built-in extended sprite library, and real-time classification insight.

## Installation

1. Open SillyTavern and navigate to the **Extensions** panel (puzzle piece icon in the top bar)
2. Click the **Install Extension** button (download icon with a plus sign)
3. Paste this URL into the input field:

   ```none
   https://github.com/tyranomaster/expressions-plus
   ```

4. Click **Save** and wait for the extension to download
5. Restart SillyTavern or refresh the page
6. **Disable the built-in Expressions extension** in the Extensions panel to avoid conflicts

> **Note:** You must have [Git](https://git-scm.com/downloads) installed on your system.

## Getting Started

1. Open a chat with any character
2. The local classification model downloads automatically on first use (~100MB from Hugging Face) and runs entirely locally — subsequent classifications are nearly instant
3. Expressions+ will begin detecting emotions from messages and displaying matching sprites

Out of the box, the **Default +** profile is active. It includes rules for 18 combination emotions (like *anxious*, *awe*, *bewildered*, *contempt*, and more) in addition to the base 28 emotions. A matching set of built-in sprites with custom smileys is included in `built-in-sprites/default-plus/`, ready to use as fallback sprites.

## Features

### Custom Expression Rules

Go beyond 1:1 emotion-to-sprite mapping with two rule types:

- **Range Rules** — Trigger a sprite when an emotion's confidence score falls within a specific range
- **Combination Rules** — Trigger a sprite when multiple emotions are detected simultaneously

#### Example: "Smirk" (Range Rule)

1. Add a Range rule named "smirk"
2. Set emotion to "amusement"
3. Enable minimum bound → 5%, maximum bound → 10%
4. Add a `smirk.png` sprite to your character's expression folder

#### Example: "Bittersweet" (Combination Rule)

1. Add a Combination rule named "bittersweet"
2. Add conditions: joy, sadness
3. Set max difference to 25%
4. Add a `bittersweet.png` sprite

### Profiles

Organize rules into reusable profiles:

- Create, import, and export profiles
- Assign profiles to individual characters in the **Character Profile Assignments** section
- Unassigned characters use the currently active profile
- Built-in profiles ship in `built-in-profiles/`
- Profiles can be specifically exported to go into a character image folder, with the option to use profiles from folders (for easy sharing)

### Expression Sets

Organize multiple sprite collections per character and switch between them:

1. Create subfolders inside a character's expression folder (e.g., `chibi/`, `full/`)
2. Place sprites in each subfolder — the base folder serves as the "Default" set
3. Switch sets via the **Character Assignments** dropdown, the **Wand Menu** (magic wand icon in chat), or the `/explus-expressionset` slash command
4. Bundle a profile in the folder for the optional profile from folder override.

### Folder Profiles

Bundle a profile directly with a sprite set so anyone who downloads the set gets the matching rules automatically.

1. Create and configure a profile with your desired rules
2. Click the **Export for Folder** button (folder icon next to the regular export button) — this saves the profile as `expressions-plus-profile.json`
3. Place the exported file in the character's sprite folder (or expression set subfolder)
4. Enable **Prioritize Folder Profiles** in settings — when active, the folder's bundled profile overrides any assigned profile for that character

A notice appears in the settings panel when a folder profile is in use.

### Expression Analytics

An optional local data collector that helps you discover useful combination rules you haven't created yet.

- **Off by default** — enable it in the Expression Analytics section of settings
- Runs entirely locally using IndexedDB (no data is sent anywhere)
- After each classification, it checks whether any 2- or 3-emotion combination from the top results would have outscored the chosen expression
- Click **View Analytics** to browse collected data with filters for max difference, emotion count, minimum occurrences, and minimum score difference
- Use the results to identify frequently occurring emotion combinations worth turning into rules

### Insight Panel

A draggable floating panel showing real-time classification data:

- Top 5 emotion scores with visual bars
- Currently selected expression and whether a custom rule triggered
- Useful for debugging rules and understanding the classifier's output

## Supported Emotions

The local classifier recognizes 28 base emotions:

admiration, amusement, anger, annoyance, approval, caring, confusion, curiosity, desire, disappointment, disapproval, disgust, embarrassment, excitement, fear, gratitude, grief, joy, love, nervousness, optimism, pride, realization, relief, remorse, sadness, surprise, neutral

The **Default +** profile extends these with 18 combination rules: anxious, awe, bewildered, contempt, despair, disdain, dread, elated, exasperated, exhilaration, frustrated, fury, horrified, intrigued, lustful, overwhelmed, unsettled, wonder.

## Slash Commands

| Command | Description |
| --- | --- |
| `/explus-classify [text]` | Classify text and return the detected emotion |
| `/explus-set [expression]` | Force a specific expression for the current character |
| `/explus-profile action=list` | List all available profiles |
| `/explus-profile action=get` | Get the current active profile name |
| `/explus-profile action=set [name]` | Switch to a different profile |
| `/explus-expressionset action=list` | List available expression sets for current character |
| `/explus-expressionset action=get` | Get the current expression set |
| `/explus-expressionset action=set [name]` | Switch to a different expression set |

> The `expressionset` commands accept an optional `character=name` parameter to target a specific character.

## Compatibility

- Requires SillyTavern 1.15.0 or later
- **Disable the built-in Expressions extension** to avoid conflicts
- Compatible with Visual Novel mode for group chats

## Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

## License

AGPL-3.0 — See LICENSE file for details.

Based on and contains code from SillyTavern's built-in Expression Images extension (AGPL-3.0).

## Credits

- **Author**: Tyranomaster
- Built for [SillyTavern](https://github.com/SillyTavern/SillyTavern)
- Based on SillyTavern's [Expression Images](https://docs.sillytavern.app/extensions/expression-images/) extension
- Uses [distilbert-base-uncased-go-emotions](https://huggingface.co/Cohee/distilbert-base-uncased-go-emotions-onnx) for local classification
- Built using Claude Opus 4.5/4.6 through GitHub Copilot in VS Code
