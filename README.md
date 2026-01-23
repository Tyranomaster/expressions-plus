# Expressions+ Extension for SillyTavern

All the functionality of SillyTavern's built-in Expressions extension (local classification option), **PLUS** advanced customization features like expression rules, profiles, and real-time insight into emotion classification.

## What's New in Expressions+

### Local Classification Only

Expressions+ uses exclusively the **Local** classification API, which leverages a built-in transformers.js model for emotion detection. This enables the extension to work with the full vector output from the classifier, allowing for:

- Advanced rule-based expression matching
- Multi-emotion combination detection
- Fine-grained threshold controls
- Real-time confidence score visualization

The local model downloads automatically on first use (~50MB) and runs entirely in your browser.

> **First-Time Setup:** The first time you receive a message after installing the extension, there may be a brief delay (10-30 seconds depending on your connection) while the classification model downloads from Hugging Face. Subsequent classifications will be nearly instant as the model is cached locally.

### Custom Expression Rules

Go beyond simple 1:1 emotion-to-sprite mapping with powerful rule types:

- **Range Rules** - Trigger sprites only when an emotion's confidence score falls within a specific range (e.g., show "smirk" only when amusement is between 20-40%)
- **Combination Rules** - Trigger sprites when multiple emotions are detected simultaneously (e.g., "bittersweet" when both joy and sadness are high)

#### Example: Creating a "Smirk" Expression

1. Add a new Range rule named "smirk"
2. Set emotion to "amusement"
3. Enable minimum bound, set to 20%
4. Enable maximum bound, set to 40%
5. Add a `smirk.png` sprite to your character's expression folder

#### Example: Creating a "Bittersweet" Expression

1. Add a new Combination rule named "bittersweet"
2. Add condition: joy
3. Add condition: sadness
4. Set max difference to 25%
5. Add a `bittersweet.png` sprite

### Profile System

Organize your rules into reusable profiles:

- Create multiple expression profiles with different rule sets
- Assign specific profiles to individual characters
- Export and import profiles to share with others
- Default profile includes all 28 base emotions from the classifier

### Insight Panel

A draggable floating panel that shows real-time classification data:

- Top 5 emotion scores with visual bars
- Currently selected expression
- Whether a custom rule was triggered
- Normalized confidence scores (We use a custom normalization rule for emotion selection:(total score*((emotion rule count + 1) / 2)))

Perfect for debugging your custom rules or understanding how the classifier interprets messages.

---

## Installation

1. Open SillyTavern and navigate to the **Extensions** panel (puzzle piece icon in the top bar)
2. Click the **Install Extension** button (looks like a download icon with a plus sign)
3. Paste this URL into the input field:

   ```none
   https://github.com/tyranomaster/expressions-plus
   ```

4. Click **Save** and wait for the extension to download
5. Restart SillyTavern or refresh the page

> **Note:** You must have Git installed on your system. If you don't have Git, follow the instructions on the [Git installation page](https://git-scm.com/downloads).

---

## Usage

### Basic Setup

1. Open SillyTavern and go to Extensions panel
2. Find "Expressions+" in the extension list
3. The local classification model will download automatically on first use

### Creating Custom Rules

1. Click **Add Rule** in the Expressions+ settings
2. Choose a rule type:
   - **Range**: Set min/max thresholds for a single emotion
   - **Combination**: Require multiple emotions to be present
3. Name your rule (this should match your sprite filename)
4. Configure conditions and save

### Using Profiles

- **Create Profile**: Click the + button next to the profile dropdown
- **Delete Profile**: Select a profile and click the trash icon
- **Export**: Save a profile as JSON to share
- **Import**: Load a profile from a JSON file

### Character Assignments

Expand the "Character Profile Assignments" section to assign specific profiles to characters. Unassigned characters use the active profile.

---

## Inherited Features (from Built-in Expressions)

Expressions+ includes all functionality from SillyTavern's built-in Expressions extension:

### Sprite Management

- Automatic emotion detection from character messages
- Multiple sprites per expression (randomly selected)
- Re-roll option when the same expression repeats
- Visual Novel mode support for group chats
- Custom expression uploads
- Fallback/default expression support

### Default Emotions

The local classifier model recognizes 28 emotions:

- admiration, amusement, anger, annoyance, approval, caring
- confusion, curiosity, desire, disappointment, disapproval, disgust
- embarrassment, excitement, fear, gratitude, grief, joy
- love, nervousness, optimism, pride, realization, relief
- remorse, sadness, surprise, neutral

### Slash Commands

- `/explus-classify [text]` - Classify text and return the detected emotion label
- `/explus-set [expression]` - Force set a specific expression for the current character (alias: `/exp-set`)
- `/explus-profile` - Manage expression profiles:
  - `/explus-profile action=list` - List all available profiles
  - `/explus-profile action=get` - Get the current active profile name
  - `/explus-profile action=set [profile name]` - Switch to a different profile

---

## Compatibility

- Requires SillyTavern 1.12.0 or later
- **Disable the built-in Expressions extension** to avoid conflicts
- Compatible with Visual Novel mode for group chats

## Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

## License

AGPL-3.0 License - See LICENSE file for details.

This extension is based on and contains code from SillyTavern's built-in Expression Images extension, which is licensed under AGPL-3.0.

## Credits

- **Author**: Tyranomaster
- Built for [SillyTavern](https://github.com/SillyTavern/SillyTavern)
- Based on SillyTavern's [Expression Images](https://docs.sillytavern.app/extensions/expression-images/) extension
- Uses the [distilbert-base-uncased-go-emotions](https://huggingface.co/Cohee/distilbert-base-uncased-go-emotions-onnx) model for local classification
- Built using Claude Opus 4.5 through Github Copilot in VSCode
- Built though extensive referencing of the default expressions module in SillyTavern
