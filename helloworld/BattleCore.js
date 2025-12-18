/**
 * BattleCore.js
 * Core logic for Gem Rush battle system.
 * Handles grid management, matching logic, and battle state.
 */

class BattleCore {
    static ELEMENTS = {
        FORGE: { id: 0, name: '熔炼', color: '#ff4d4d', icon: '🔥' }, // Red
        TIDE:  { id: 1, name: '潮汐', color: '#4da6ff', icon: '💧' }, // Blue
        LIFE:  { id: 2, name: '生机', color: '#4dff88', icon: '🌿' }, // Green
        SOL:   { id: 3, name: '烈日', color: '#ffff4d', icon: '☀️' }, // Yellow
        STONE: { id: 4, name: '磐岩', color: '#bf4dff', icon: '💎' }, // Purple
        ROOT:  { id: 5, name: '根系', color: '#8b4513', icon: '🌳' }, // Brown
        NONE:  { id: -1, name: '人形', color: '#ffffff', icon: '👤' }
    };

    static SUPPRESSION = {
        5: 4, // ROOT -> STONE
        4: 1, // STONE -> TIDE
        1: 0, // TIDE -> FORGE
        0: 2, // FORGE -> LIFE
        2: 3, // LIFE -> SOL
        3: 5  // SOL -> ROOT
    };

    static MAX_SPIRITS_IN_BATTLE = 5; // Maximum spirits player can bring to battle

    static getElementById(id) {
        return Object.values(BattleCore.ELEMENTS).find(e => e.id === id) || BattleCore.ELEMENTS.NONE;
    }

    constructor(options = {}) {
        this.rows = options.rows || 8;
        this.cols = options.cols || 8;
        this.gemTypes = options.gemTypes || 6;
        
        this.grid = [];
        this.wordGrid = [];
        this.score = 0;
        this.moves = 0;
        this.level = 1;
        this.wordLevel = 1;
        
        this.enemies = []; // Array of {hp, maxHp, level, avatar, name, isBoss, turn, maxTurn}
        this.spirits = []; // Array of {mana, maxMana, damage, icon, type}
        this.playerHp = 1000;
        this.playerMaxHp = 1000;
        
        this.allWordLevels = {};
        this.wordPairs = [];
        this.crushedPairs = new Set();
        this.availablePairs = [];
        
        this.currentPair = null;
        this.nextSequentialPair = null;
        
        this.isLocked = false;
        this.comboMultiplier = 1;
        this.difficulty = 'normal';
        this.mode = 'moves';
        this.timeLeft = 0;
        this.selectedGem = null;

        // Callbacks for UI updates
        this.onUpdateUI = options.onUpdateUI || (() => {});
        this.onGemMatch = options.onGemMatch || (() => {});
        this.onWordMatch = options.onWordMatch || (() => {});
        this.onBossDamage = options.onBossDamage || (() => {});
        this.onPlayerDamage = options.onPlayerDamage || (() => {});
        this.onGameOver = options.onGameOver || (() => {});
        this.onLevelComplete = options.onLevelComplete || (() => {});
    }

    parseWordData(text) {
        const lines = text.split('\n');
        let currentLevel = 0;
        
        this.allWordLevels = {};
        lines.forEach(line => {
            line = line.trim();
            if (!line) return;
            if (line.toLowerCase().startsWith('## level')) {
                currentLevel = parseInt(line.toLowerCase().replace('## level', '').trim());
                if (!this.allWordLevels[currentLevel]) this.allWordLevels[currentLevel] = [];
            } else if (line.includes(':')) {
                const [cn, en] = line.split(':').map(s => s.trim());
                if (currentLevel > 0 && cn && en) {
                    this.allWordLevels[currentLevel].push({cn, en});
                }
            }
        });
    }

    updateWordList() {
        const levelWords = this.allWordLevels[this.wordLevel];
        if (levelWords && levelWords.length > 0) {
            this.wordPairs = [...levelWords];
        } else {
            this.wordPairs = this.allWordLevels[1] || [];
        }
        
        if (this.wordPairs.length === 0) {
            this.wordPairs = [{cn: "空", en: "Empty"}];
        }
        
        this.currentPair = null;
        this.nextSequentialPair = null;
        this.resetCrushedPairs();
    }

    resetCrushedPairs() {
        this.crushedPairs = new Set();
        this.availablePairs = [...this.wordPairs];
    }

    isPairCrushed(pair) {
        if (!pair) return false;
        return this.crushedPairs.has(`${pair.cn}:${pair.en}`);
    }

    markPairAsCrushed(pair) {
        if (!pair) return;
        const pairKey = `${pair.cn}:${pair.en}`;
        this.crushedPairs.add(pairKey);
        this.availablePairs = this.availablePairs.filter(
            p => `${p.cn}:${p.en}` !== pairKey
        );
        if (this.availablePairs.length === 0) {
            this.resetCrushedPairs();
        }
    }

    getAvailablePair() {
        if (this.availablePairs.length === 0) {
            this.resetCrushedPairs();
        }
        return this.availablePairs[Math.floor(Math.random() * this.availablePairs.length)];
    }

    initLevel(lvl, options = {}) {
        this.level = lvl;
        this.difficulty = options.difficulty || this.difficulty;
        this.mode = options.mode || this.mode;
        this.wordLevel = options.wordLevel || this.wordLevel;

        if (lvl === 1) {
            this.score = 0;
        }
        
        this.playerHp = 1000;
        this.playerMaxHp = 1000;

        // Difficulty Multipliers
        let hpMult = 1;
        let movesBase = 30;
        let timeBase = 90;

        if (this.difficulty === 'easy') {
            hpMult = 0.7;
            movesBase = 40;
            timeBase = 120;
        } else if (this.difficulty === 'hard') {
            hpMult = 1.5;
            movesBase = 20;
            timeBase = 60;
        }

        // Setup Enemies (1 boss + 2 minions or just 1 boss)
        this.enemies = [];
        const totalHp = Math.floor((800 + (lvl * 200)) * hpMult);
        
        const avatars = ['👹', '💀', '👻', '👽', '👾', '🤖'];
        const minionAvatars = ['👿', '👺', '🤡', '👽', '👾'];
        
        const isBossOnly = Math.random() < 0.3 && lvl > 1; // 30% chance for boss only after level 1
        
        if (isBossOnly) {
            this.enemies.push({
                id: 0,
                name: `Boss`,
                hp: totalHp,
                maxHp: totalHp,
                level: lvl,
                avatar: avatars[Math.floor(Math.random() * avatars.length)],
                isBoss: true,
                turn: 3,
                maxTurn: 3,
                attack: 100 + (lvl * 20),
                element: Math.floor(Math.random() * 6)
            });
        } else {
            // 1 Boss + 2 Minions
            const bossHp = Math.floor(totalHp * 0.6);
            const minionHp = Math.floor(totalHp * 0.2);
            
            this.enemies.push({
                id: 0,
                name: `Boss`,
                hp: bossHp,
                maxHp: bossHp,
                level: lvl,
                avatar: avatars[Math.floor(Math.random() * avatars.length)],
                isBoss: true,
                turn: 3,
                maxTurn: 3,
                attack: 100 + (lvl * 20),
                element: Math.floor(Math.random() * 6)
            });
            
            for (let i = 1; i <= 2; i++) {
                this.enemies.push({
                    id: i,
                    name: `Minion ${i}`,
                    hp: minionHp,
                    maxHp: minionHp,
                    level: lvl,
                    avatar: minionAvatars[Math.floor(Math.random() * minionAvatars.length)],
                    isBoss: false,
                    turn: 3 + i, // Minions might have different turn counts
                    maxTurn: 3 + i,
                    attack: 50 + (lvl * 10),
                    element: Math.floor(Math.random() * 6)
                });
            }
        }

        // Setup Spirits - randomly select MAX_SPIRITS_IN_BATTLE from 6 elements (each element at most once)
        this.spirits = [];
        const elementKeys = ['FORGE', 'TIDE', 'LIFE', 'SOL', 'STONE', 'ROOT'];
        // Shuffle and pick first MAX_SPIRITS_IN_BATTLE elements
        const shuffledKeys = [...elementKeys].sort(() => Math.random() - 0.5);
        const selectedKeys = shuffledKeys.slice(0, BattleCore.MAX_SPIRITS_IN_BATTLE);
        
        for (const key of selectedKeys) {
            const element = BattleCore.ELEMENTS[key];
            this.spirits.push({
                type: element.id,
                icon: element.icon,
                name: element.name,
                mana: 0,
                maxMana: 100,
                damage: 150 + (lvl * 50),
                element: element.id
            });
        }

        // Mode Setup
        if (this.mode === 'time') {
            this.timeLeft = timeBase;
        } else {
            this.moves = movesBase;
        }

        this.comboMultiplier = 1;
        this.isLocked = false;
        this.createInitialGrid();
    }

    /**
     * Get spirit by element type
     * @param {number} elementId - The element ID (0-5)
     * @returns {object|null} - The spirit object or null if not found
     */
    getSpiritByElement(elementId) {
        return this.spirits.find(s => s.element === elementId) || null;
    }

    createInitialGrid() {
        this.grid = [];
        this.wordGrid = [];
        for (let r = 0; r < this.rows; r++) {
            this.grid[r] = [];
            this.wordGrid[r] = [];
            for (let c = 0; c < this.cols; c++) {
                this.wordGrid[r][c] = null;
                let type;
                do {
                    type = Math.floor(Math.random() * this.gemTypes);
                } while (
                    (c >= 2 && this.grid[r][c-1] === type && this.grid[r][c-2] === type) ||
                    (r >= 2 && this.grid[r-1][c] === type && this.grid[r-2][c] === type)
                );
                this.grid[r][c] = type;
            }
        }
        this.ensureWords();
    }

    getValidSpot() {
        let candidates = [];
        const existingWordCols = [];
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                if (this.wordGrid[r][c]) {
                    existingWordCols.push({ r, c });
                }
            }
        }

        // Pass 1: Strict constraints
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                if (!this.wordGrid[r][c] && this.grid[r][c] !== null) {
                    // Constraint 1: Not left/right most
                    if (c === 0 || c === this.cols - 1) continue;

                    // Constraint 2: At least 1 cell away (gap) in either row or col
                    let valid = true;
                    for (const w of existingWordCols) {
                        if (Math.abs(w.r - r) < 2 && Math.abs(w.c - c) < 2) {
                            valid = false;
                            break;
                        }
                    }

                    if (valid) {
                        candidates.push({ r, c });
                    }
                }
            }
        }

        if (candidates.length > 0) {
            return candidates[Math.floor(Math.random() * candidates.length)];
        }

        // Pass 2: Fallback - any empty spot
        candidates = [];
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                if (!this.wordGrid[r][c] && this.grid[r][c] !== null) {
                    candidates.push({ r, c });
                }
            }
        }

        if (candidates.length === 0) return null;
        return candidates[Math.floor(Math.random() * candidates.length)];
    }

    ensureWords() {
        const changedCells = [];
        // Count existing words
        let cnCount = 0;
        let enCount = 0;
        let hasTargetCN = false;
        let hasTargetEN = false;

        const existingWords = new Set();

        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const w = this.wordGrid[r][c];
                if (w) {
                    existingWords.add(w.word);
                    if (w.lang === 'CN') cnCount++;
                    if (w.lang === 'EN') enCount++;
                    if (this.currentPair) {
                        if (w.word === this.currentPair.cn) hasTargetCN = true;
                        if (w.word === this.currentPair.en) hasTargetEN = true;
                    }
                }
            }
        }

        // If current pair is missing, pick new one
        if (!this.currentPair) {
            if (cnCount > 0) {
                // Find the CN word on board
                let found = null;
                for (let r = 0; r < this.rows; r++) {
                    for (let c = 0; c < this.cols; c++) {
                        if (this.wordGrid[r][c] && this.wordGrid[r][c].lang === 'CN') {
                            found = this.wordGrid[r][c];
                            break;
                        }
                    }
                    if (found) break;
                }
                if (found) {
                    const pair = this.wordPairs.find(p => p.cn === found.word);
                    if (pair && !this.isPairCrushed(pair)) this.currentPair = pair;
                    else this.currentPair = this.nextSequentialPair || this.getAvailablePair();
                } else {
                    this.currentPair = this.nextSequentialPair || this.getAvailablePair();
                }
            } else if (enCount > 0) {
                // 70% chance to use existing English words in the scene first
                if (Math.random() < 0.7) {
                    const enWords = [];
                    for (let r = 0; r < this.rows; r++) {
                        for (let c = 0; c < this.cols; c++) {
                            if (this.wordGrid[r][c] && this.wordGrid[r][c].lang === 'EN') {
                                enWords.push(this.wordGrid[r][c]);
                            }
                        }
                    }

                    if (enWords.length > 0) {
                        const randomEn = enWords[Math.floor(Math.random() * enWords.length)];
                        const pair = this.wordPairs.find(p => p.en === randomEn.word);
                        if (pair && !this.isPairCrushed(pair)) this.currentPair = pair;
                        else this.currentPair = this.nextSequentialPair || this.getAvailablePair();
                    } else {
                        this.currentPair = this.nextSequentialPair || this.getAvailablePair();
                    }
                } else {
                    this.currentPair = this.nextSequentialPair || this.getAvailablePair();
                }
            } else {
                this.currentPair = this.nextSequentialPair || this.getAvailablePair();
            }
        }

        if (!this.currentPair) {
            this.currentPair = { cn: "空", en: "Empty" };
        }

        // Add CN if missing
        if (cnCount < 1) {
            const spot = this.getValidSpot();
            if (spot) {
                this.wordGrid[spot.r][spot.c] = {
                    word: this.currentPair.cn,
                    lang: 'CN',
                    isEntangled: false
                };
                changedCells.push(spot);
                existingWords.add(this.currentPair.cn);
                cnCount++;
            }
        }

        // Add Target EN if missing
        hasTargetEN = false;
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const w = this.wordGrid[r][c];
                if (w && w.word === this.currentPair.en) hasTargetEN = true;
            }
        }

        if (!hasTargetEN) {
            const spot = this.getValidSpot();
            if (spot) {
                this.wordGrid[spot.r][spot.c] = {
                    word: this.currentPair.en,
                    lang: 'EN',
                    isEntangled: false
                };
                changedCells.push(spot);
                existingWords.add(this.currentPair.en);
                enCount++;
            }
        }

        // Fill remaining EN slots (up to 4)
        let attempts = 0;
        while (enCount < 4 && attempts < 20) {
            const spot = this.getValidSpot();
            if (!spot) break;

            const availableForFill = this.availablePairs.filter(
                p => p.en !== this.currentPair.en && !existingWords.has(p.en)
            );

            if (availableForFill.length === 0) break;

            const randomPair = availableForFill[Math.floor(Math.random() * availableForFill.length)];

            this.wordGrid[spot.r][spot.c] = {
                word: randomPair.en,
                lang: 'EN',
                isEntangled: false
            };
            changedCells.push(spot);
            existingWords.add(randomPair.en);
            enCount++;
            attempts++;
        }
        return changedCells;
    }

    findMatches() {
        const matches = new Set();

        // Horizontal
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols - 2; c++) {
                const type = this.grid[r][c];
                if (type !== null && type === this.grid[r][c+1] && type === this.grid[r][c+2]) {
                    matches.add(`${r},${c}`);
                    matches.add(`${r},${c+1}`);
                    matches.add(`${r},${c+2}`);
                }
            }
        }

        // Vertical
        for (let c = 0; c < this.cols; c++) {
            for (let r = 0; r < this.rows - 2; r++) {
                const type = this.grid[r][c];
                if (type !== null && type === this.grid[r+1][c] && type === this.grid[r+2][c]) {
                    matches.add(`${r},${c}`);
                    matches.add(`${r+1},${c}`);
                    matches.add(`${r+2},${c}`);
                }
            }
        }

        return Array.from(matches).map(s => {
            const [r, c] = s.split(',').map(Number);
            return { r, c };
        });
    }

    getDamageModifier(attackerElement, defenderElement) {
        if (attackerElement === -1 || defenderElement === -1) return 1.0;
        
        if (BattleCore.SUPPRESSION[attackerElement] === defenderElement) {
            return 1.15; // Countering
        }
        if (BattleCore.SUPPRESSION[defenderElement] === attackerElement) {
            return 0.85; // Being countered
        }
        return 1.0;
    }

    damageEnemy(amount, attackerElement = -1, enemyIndex = 0) {
        if (this.enemies.length === 0) return;
        
        // If enemyIndex is -1, damage all enemies (split damage)
        if (enemyIndex === -1) {
            const aliveEnemies = this.enemies.filter(e => e.hp > 0);
            if (aliveEnemies.length === 0) return;
            const damagePerEnemy = Math.floor(amount / aliveEnemies.length);
            this.enemies.forEach((enemy, idx) => {
                if (enemy.hp > 0) {
                    const modifier = this.getDamageModifier(attackerElement, enemy.element);
                    const finalDamage = Math.floor(damagePerEnemy * modifier);
                    enemy.hp = Math.max(0, enemy.hp - finalDamage);
                    this.onBossDamage(finalDamage, idx);
                }
            });
        } else {
            // Always attack boss first if alive
            let target = this.enemies.find(e => e.isBoss && e.hp > 0);
            
            // If boss is dead, attack first alive minion
            if (!target) {
                target = this.enemies.find(e => e.hp > 0);
            }

            if (target) {
                const modifier = this.getDamageModifier(attackerElement, target.element);
                const finalDamage = Math.floor(amount * modifier);
                target.hp = Math.max(0, target.hp - finalDamage);
                this.onBossDamage(finalDamage, this.enemies.indexOf(target));
            }
        }
        
        this.checkWinCondition();
    }

    processEnemyTurns() {
        let playerDamaged = false;
        this.enemies.forEach((enemy, idx) => {
            if (enemy.hp > 0) {
                enemy.turn--;
                if (enemy.turn <= 0) {
                    // Attack!
                    // Player is human, no attribute (-1)
                    const modifier = this.getDamageModifier(enemy.element, -1);
                    const finalDamage = Math.floor(enemy.attack * modifier);
                    
                    this.playerHp = Math.max(0, this.playerHp - finalDamage);
                    enemy.turn = enemy.maxTurn;
                    playerDamaged = true;
                    this.onPlayerDamage(finalDamage, idx);
                }
            }
        });
        
        if (this.playerHp <= 0) {
            this.onGameOver();
        }
        return playerDamaged;
    }

    checkWinCondition() {
        const allDead = this.enemies.every(e => e.hp <= 0);
        if (allDead) {
            this.onLevelComplete();
            return true;
        }

        if (this.playerHp <= 0) {
            this.onGameOver();
            return true;
        }

        if (this.mode === 'moves' && this.moves <= 0) {
            this.onGameOver();
            return true;
        }

        if (this.mode === 'time' && this.timeLeft <= 0) {
            this.onGameOver();
            return true;
        }

        return false;
    }

    advanceWordPair() {
        if (this.currentPair) {
            this.markPairAsCrushed(this.currentPair);
            this.nextSequentialPair = this.getAvailablePair();
        }
        this.currentPair = null;
    }

    swapGems(p1, p2) {
        const t = this.grid[p1.r][p1.c];
        this.grid[p1.r][p1.c] = this.grid[p2.r][p2.c];
        this.grid[p2.r][p2.c] = t;

        const tw = this.wordGrid[p1.r][p1.c];
        this.wordGrid[p1.r][p1.c] = this.wordGrid[p2.r][p2.c];
        this.wordGrid[p2.r][p2.c] = tw;
    }

    applyGravity() {
        const moved = [];
        for (let c = 0; c < this.cols; c++) {
            let emptyRow = this.rows - 1;
            for (let r = this.rows - 1; r >= 0; r--) {
                if (this.grid[r][c] !== null) {
                    if (emptyRow !== r) {
                        this.grid[emptyRow][c] = this.grid[r][c];
                        this.wordGrid[emptyRow][c] = this.wordGrid[r][c];
                        this.grid[r][c] = null;
                        this.wordGrid[r][c] = null;
                        moved.push({ from: { r, c }, to: { r: emptyRow, c } });
                    }
                    emptyRow--;
                }
            }
            // Fill new gems
            for (let r = emptyRow; r >= 0; r--) {
                this.grid[r][c] = Math.floor(Math.random() * this.gemTypes);
                this.wordGrid[r][c] = null;
                moved.push({ from: null, to: { r, c }, type: this.grid[r][c] });
            }
        }
        return moved;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = BattleCore;
}
