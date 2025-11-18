# HTML Page Game Development - AI Agent Instructions

## Project Overview
This repository contains a collection of single-page HTML5 educational games and interactive web applications, primarily designed for the Keepwork platform. All games are self-contained HTML files with embedded CSS and JavaScript.

## Core Architecture Principles

### Single-File Structure
- **Every game is a standalone `.html` file** - no external CSS/JS files (except CDN libraries)
- Games are organized by type: educational activities, character AI, mini-games, contests
- Obsolete files are moved to `old_obsoleted_files/` directory

### Standard Technology Stack
1. **Tailwind CSS**: Always use CDN version for styling
   ```html
   <script src="https://cdn.keepwork.com/keepwork/cdn/tailwindcss@3.4.16.js"></script>
   ```
2. **No custom CSS/font files** - Use only Tailwind utility classes and inline styles
3. **Three.js** (when needed): Use CDN for 3D games like `guess_cubes.html`
   ```html
   <script src="https://cdnproxy.keepwork.com/jsdelivr/npm/three@0.128.0/build/three.min.js"></script>
   ```

### UI/UX Design Patterns

#### Landscape-First Layout
- Design for landscape orientation without requiring scroll by default
- Use viewport height units (`vh`) and flexbox for responsive full-screen layouts
- See `typing_game.html` for responsive stats panel implementation

#### Use Rem instead of Px
Set base font-size, so that 1rem = 10px. Use Rem instead of px for everthing to allow for easier scaling across devices. Use this function to adjust root font size based on viewport dimensions:
```javascript 
function adjustRootFontSize() {
  // 游戏主容器的设计尺寸
  const DESIGN_WIDTH = 1280;
  const DESIGN_HEIGHT = 720;
  
  // 获取视口尺寸
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  
  // 计算基于宽度和高度的缩放比例
  const scaleByWidth = viewportWidth / DESIGN_WIDTH;
  const scaleByHeight = viewportHeight / DESIGN_HEIGHT;
  
  // 取较小的缩放比例，确保内容完全可见（等比例缩放）
  const scale = Math.min(scaleByWidth, scaleByHeight);
  
  // 设置根元素的 font-size
  // 假设设计稿基准是 1rem = 10px，则调整后的 font-size = 10 * scale
  const baseFontSize = 10; // 设计稿基准
  const finalFontSize = baseFontSize * scale;
  
  document.documentElement.style.fontSize = `${finalFontSize}px`;
}
```      

#### Common UI Components
- **Rules Modal**: Initial popup showing game instructions with "Start Game" button
  - Example in `guess_cubes.html` lines 308-332
  - Typically hidden after first interaction, with floating help button (❓) to reopen
- **Stats Display**: Real-time scoring/progress indicators in fixed corners
  - Left side: Level info, cube counts, game state
  - Right side: Controls, difficulty selector, action buttons
- **Success Effects**: Centered overlay messages using `#successEffect` pattern with fade animations

#### Mobile Responsiveness
- Use `@media (max-width: 768px)` breakpoints
- Switch from fixed positioning to flexbox layouts on small screens

### JavaScript Patterns

#### No DOMContentLoaded
- **Start game logic at the end of script tags** - do not wrap in `DOMContentLoaded`
- Initialize immediately after DOM is parsed

#### Event-Driven Architecture
All games implement a parent-child messaging system with `postMessage`:

```javascript
// Standard message types to handle:
window.addEventListener('message', function(e) {
  switch(e.data.type) {
    case 'setGameConfig':      // Receive markdown/JSON config from parent
    case 'getGameStats':       // Return current score/difficulty
    case 'gameContinue':       // Handle restart/challenge actions
  }
});

// Standard events to send to parent:
window.parent.postMessage({ type: 'gameLoaded' }, '*');
window.parent.postMessage({ type: 'gameStarted' }, '*');
window.parent.postMessage({ 
  type: 'gameFinished', 
  data: { earnedPoints, wpm, accuracy, difficulty } 
}, '*');
```

#### Game State Management
- Track `gameStarted` flag globally to send `gameLoaded` only once
- Store high scores in `localStorage` (e.g., `bestScore`, `highestScore`)
- Use level-based progression system (see `typing_game.html` lines 756-840)

### Keepwork SDK Integration

When games need server-side features (data storage, TTS, LLM chat), include:

```html
<script src="https://cdn.keepwork.com/sdk/keepworkSDK.iife.js"></script>
```

Initialize the SDK:
```javascript
const sdk = new KeepworkSDK({
  timeout: 30000
});
console.log(`Keepwork SDK initialized token: ${sdk.token}`);
```

**SDK Features Used:**
- Text-to-speech services
- LLM chatbot integration (see `characterAI.html`)
- User data persistence
- Authentication via URL token parameter: `?token=eyJhbGci...`

### Internationalization (i18n)

Games support multi-language via embedded translation objects:

```javascript
const translations = {
  zhCN: { /* Chinese text */ },
  enUS: { /* English text */ }
};

// Detect language from URL param or browser
const urlParams = new URLSearchParams(window.location.search);
const langParam = urlParams.get('lang'); // ?lang=zhCN or ?lang=enUS
const currentLanguage = langParam || (navigator.language.startsWith('zh') ? 'zhCN' : 'enUS');

// Apply with data-i18n attributes
<div data-i18n="ui.buttons.newGame">🎮 重新开始</div>
```

See `guess_cubes.html` lines 592-692 for complete implementation.

### Game Scoring System

Standard scoring pattern across games:
- **100-point scale**: Total score normalized to 100 regardless of levels
- **Efficiency-based**: `baseScore * (minRequired / actualUsed)`
- **Level progression**: Divide 100 by total levels for per-level scoring
- **Persistent high scores**: Always track `bestScore` in localStorage

```javascript
function calculateGameScore(gridSize, actualCubes, minCubes, maxLevels = 10) {
  const baseScore = 100 / maxLevels;
  const efficiency = Math.min(1, minCubes / actualCubes);
  return Math.round(baseScore * efficiency);
}
```

## Development Workflow

### Creating New Games
1. Copy structure from similar game in root directory
2. Use Tailwind CDN - never create separate CSS files
3. Implement standard message handlers for parent integration
4. Add rules modal with floating help button
5. Test landscape layout without scrolling

### Editing Existing Games
- **Make small, incremental edits** - don't regenerate entire files
- Preserve existing game logic and state management
- Maintain backward compatibility with parent window messaging


## Common Pitfalls to Avoid

❌ Don't use external CSS/font files  
❌ Don't wrap initialization in DOMContentLoaded  
❌ Don't create multi-file projects  
❌ Don't ignore mobile responsiveness  
❌ Don't forget parent window messaging protocol  

✅ Do use Tailwind CDN for all styling  
✅ Do start game logic at end of script tag  
✅ Do keep everything in single HTML file  
✅ Do design for landscape-first  
✅ Do implement standard postMessage handlers
