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

    // Terrain types map to elements for elemental bonus
    // Terrain element matches gem type for scoring bonus
    static TERRAINS = {
        CITY:    { id: 0, name: '城市/火山', element: 0, color: '#ff4d4d', bgColor: 'rgba(255, 77, 77, 0.3)', icon: '🔥' },   // Red - FORGE
        OCEAN:   { id: 1, name: '海洋/水域', element: 1, color: '#4da6ff', bgColor: 'rgba(77, 166, 255, 0.3)', icon: '💧' },  // Blue - TIDE
        PLAIN:   { id: 2, name: '平原/耕地', element: 2, color: '#4dff88', bgColor: 'rgba(77, 255, 136, 0.3)', icon: '🌿' },  // Green - LIFE
        DESERT:  { id: 3, name: '沙漠/荒漠', element: 3, color: '#ffff4d', bgColor: 'rgba(255, 255, 77, 0.3)', icon: '☀️' },  // Yellow - SOL
        MOUNTAIN:{ id: 4, name: '高山/丘陵', element: 4, color: '#bf4dff', bgColor: 'rgba(191, 77, 255, 0.3)', icon: '💎' },  // Purple - STONE
        FOREST:  { id: 5, name: '森林/林地', element: 5, color: '#8b4513', bgColor: 'rgba(139, 69, 19, 0.3)', icon: '🌳' }    // Brown - ROOT
    };

    // Terrain bonus multipliers based on matching gem count
    static TERRAIN_BONUS = {
        1: 1.25,  // 1 matching gem: x1.25
        2: 1.50,  // 2 matching gems: x1.50
        3: 2.00,  // 3 matching gems: x2.00
        4: 3.50,  // 4 matching gems: x3.50
        5: 5.00,  // 5 matching gems: x5.00
        6: 8.00   // 6+ matching gems: x8.00
    };

    // Base scores for gem matches (by count)
    // 基础消除得分 - 消除数量越多得分越高，但增长放缓以鼓励道具使用
    static BASE_SCORES = {
        3: 100,   // 3 gems: 100 points (x1.0)
        4: 180,   // 4 gems: 180 points (x1.8) - creates item
        5: 300,   // 5 gems: 300 points (x3.0) - creates advanced item
        6: 450    // 6+ gems: 450 points (x4.5) - maximum item
    };

    // Combo multipliers for cascade matches
    // 连击倍数 - 指数级增长，奖励连锁消除
    static COMBO_MULTIPLIERS = {
        1: 1.0,   // Initial match: x1.0
        2: 1.2,   // 1st cascade: x1.2 (+20%)
        3: 1.5,   // 2nd cascade: x1.5 (+50%)
        4: 2.0,   // 3rd cascade: x2.0 (double)
        5: 3.0,   // 4th cascade: x3.0 (huge)
        6: 4.0    // 5th+ cascade: x4.0 (max)
    };

    static getTerrainById(id) {
        return Object.values(BattleCore.TERRAINS).find(t => t.id === id) || BattleCore.TERRAINS.PLAIN;
    }

    static getTerrainByElement(elementId) {
        return Object.values(BattleCore.TERRAINS).find(t => t.element === elementId) || BattleCore.TERRAINS.PLAIN;
    }

    static getTerrainBonus(matchingCount) {
        if (matchingCount <= 0) return 1;
        if (matchingCount >= 6) return BattleCore.TERRAIN_BONUS[6];
        return BattleCore.TERRAIN_BONUS[matchingCount] || 1;
    }

    /**
     * Get base score for a match based on gem count
     * @param {number} gemCount - Number of gems matched (3+)
     * @returns {number} - Base score value
     */
    static getBaseScore(gemCount) {
        if (gemCount < 3) return 0;
        if (gemCount >= 6) return BattleCore.BASE_SCORES[6];
        return BattleCore.BASE_SCORES[gemCount] || BattleCore.BASE_SCORES[3];
    }

    /**
     * Get combo multiplier based on cascade count
     * @param {number} comboCount - Current combo/cascade count (1 = initial match)
     * @returns {number} - Combo multiplier
     */
    static getComboMultiplier(comboCount) {
        if (comboCount <= 1) return BattleCore.COMBO_MULTIPLIERS[1];
        if (comboCount >= 6) return BattleCore.COMBO_MULTIPLIERS[6];
        return BattleCore.COMBO_MULTIPLIERS[comboCount] || 1;
    }

    /**
     * Calculate total score for a match
     * Score = BaseScore × TerrainBonus × ComboMultiplier
     * @param {number} gemCount - Number of gems matched
     * @param {number} terrainMatchCount - Number of gems matching their terrain element
     * @param {number} comboCount - Current combo/cascade count
     * @returns {Object} - {totalScore, baseScore, terrainBonus, comboMultiplier, breakdown}
     */
    static calculateMatchScore(gemCount, terrainMatchCount, comboCount) {
        const baseScore = BattleCore.getBaseScore(gemCount);
        const terrainBonus = BattleCore.getTerrainBonus(terrainMatchCount);
        const comboMultiplier = BattleCore.getComboMultiplier(comboCount);
        
        const totalScore = Math.floor(baseScore * terrainBonus * comboMultiplier);
        
        return {
            totalScore,
            baseScore,
            terrainBonus,
            comboMultiplier,
            breakdown: {
                gemCount,
                terrainMatchCount,
                comboCount,
                formula: `${baseScore} × ${terrainBonus.toFixed(2)} × ${comboMultiplier.toFixed(1)} = ${totalScore}`
            }
        };
    }

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
        this.terrainGrid = []; // Terrain type for each cell (element ID 0-5)
        this.score = 0;
        this.moves = 0;
        this.level = 1;
        this.wordLevel = 1;
        
        this.enemies = []; // Array of {hp, maxHp, level, avatar, name, isBoss, turn, maxTurn, defense}
        this.spirits = []; // Array of {mana, maxMana, damage, icon, type, defense}
        this.playerHp = 1000;
        this.playerMaxHp = 1000;
        this.playerDefense = 0; // Player defense value
        
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
        this.levelCompleted = false; // Prevent duplicate level complete triggers

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

    /**
     * Initialize level with auto-generated config
     * @param {number} lvl - Level number (1+)
     * @param {Object} options - Options including difficulty, mode, wordLevel
     */
    initLevel(lvl, options = {}) {
        this.initLevelFromConfig({
            level: lvl,
            config: {
                mode: options.mode || this.mode
            }
        }, options);
    }

    /**
     * Initialize level from a config object (from Level Editor or auto-generated)
     * Missing config will be auto-generated based on level and difficulty
     * @param {Object} config - Level configuration (can be minimal, missing fields auto-generated)
     * @param {Object} options - Additional options (difficulty, wordLevel, etc.)
     * @returns {boolean} - True if successfully initialized
     */
    initLevelFromConfig(config = {}, options = {}) {
        const lvl = config.level || 1;
        this.level = lvl;
        
        // Reset score on level 1 or custom levels
        if (lvl === 1 || !options._preserveScore) {
            this.score = 0;
        }
        
        this.levelCompleted = false;
        this.difficulty = options.difficulty || this.difficulty || 'normal';
        this.wordLevel = options.wordLevel || this.wordLevel;
        
        // Difficulty Multipliers for auto-generation
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
        
        // Apply player config (or defaults)
        const playerConfig = config.player || {};
        this.playerHp = playerConfig.hp || 1000;
        this.playerMaxHp = playerConfig.maxHp || playerConfig.hp || 1000;
        this.playerDefense = playerConfig.defense || 0;
        
        // Apply or generate enemies config
        const elementKeys = ['FORGE', 'TIDE', 'LIFE', 'SOL', 'STONE', 'ROOT'];
        if (config.enemies && config.enemies.length > 0) {
            this.enemies = config.enemies.map((e, idx) => ({
                id: e.id !== undefined ? e.id : idx,
                name: e.name || `Enemy ${idx + 1}`,
                hp: e.hp || 1000,
                maxHp: e.maxHp || e.hp || 1000,
                level: e.level || lvl,
                avatar: e.avatar || '👾',
                isBoss: e.isBoss !== undefined ? e.isBoss : (idx === 0),
                turn: e.turn || 3,
                maxTurn: e.maxTurn || e.turn || 3,
                attack: e.attack || 100,
                element: e.element !== undefined ? e.element : Math.floor(Math.random() * 6),
                defense: e.defense || 0
            }));
        } else {
            // Auto-generate enemies based on level
            this.enemies = this._generateEnemies(lvl, hpMult);
        }
        
        // Apply or generate spirits config
        if (config.spirits && config.spirits.length > 0) {
            this.spirits = config.spirits.map((s, idx) => {
                const typeId = s.type !== undefined ? s.type : idx;
                const element = BattleCore.ELEMENTS[elementKeys[typeId]] || BattleCore.ELEMENTS.FORGE;
                return {
                    type: typeId,
                    icon: element.icon,
                    name: s.name || element.name || `Spirit ${idx + 1}`,
                    mana: s.mana || 0,
                    maxMana: s.maxMana || 300,
                    damage: s.damage || 150,
                    element: typeId,
                    defense: s.defense || 0
                };
            });
        } else {
            // Auto-generate spirits based on level
            this.spirits = this._generateSpirits(lvl);
        }
        
        // Apply mode config
        const modeConfig = config.config || {};
        this.mode = modeConfig.mode || options.mode || 'moves';
        
        if (this.mode === 'time') {
            this.timeLeft = modeConfig.time || timeBase;
        } else {
            this.moves = modeConfig.moves || movesBase;
        }
        
        // Apply terrain grid or generate
        if (config.terrainGrid && config.terrainGrid.length > 0) {
            this.terrainGrid = config.terrainGrid.map(row => [...row]);
        } else {
            this.createTerrainGrid();
        }
        
        // Apply gem grid or generate
        if (config.grid && config.grid.length > 0) {
            this.grid = config.grid.map(row => [...row]);
            // Initialize wordGrid for custom grids
            this.wordGrid = [];
            for (let r = 0; r < this.rows; r++) {
                this.wordGrid[r] = [];
                for (let c = 0; c < this.cols; c++) {
                    this.wordGrid[r][c] = null;
                }
            }
        } else {
            this.createInitialGrid();
        }
        
        // Reset other battle state
        this.comboMultiplier = 1;
        this.isLocked = false;
        
        console.log('[BattleCore] Level initialized:', config.name || `Level ${this.level}`);
        return true;
    }

    /**
     * Generate enemies based on level and HP multiplier
     * @private
     */
    _generateEnemies(lvl, hpMult) {
        const enemies = [];
        const totalHp = Math.floor((800 + (lvl * 200)) * hpMult);
        
        const avatars = ['👹', '💀', '👻', '👽', '👾', '🤖'];
        const minionAvatars = ['👿', '👺', '🤡', '👽', '👾'];
        
        const bossNames = ['暗影领主', '毁灭者', '深渊之王', '噩梦统治者', '混沌之主', '虚空行者', 
                          '黑暗君王', '末日使者', '幽冥霸主', '魔焰之王'];
        const minionNames = ['暗影仆从', '骷髅兵', '幽灵战士', '小恶魔', '暗影侍卫', '虚空爬虫',
                            '地狱犬', '亡灵士兵', '噩梦魔物', '堕落精灵'];
        
        const isBossOnly = Math.random() < 0.3 && lvl > 1;
        
        if (isBossOnly) {
            enemies.push({
                id: 0,
                name: bossNames[Math.floor(Math.random() * bossNames.length)],
                hp: totalHp,
                maxHp: totalHp,
                level: lvl,
                avatar: avatars[Math.floor(Math.random() * avatars.length)],
                isBoss: true,
                turn: 3,
                maxTurn: 3,
                attack: 100 + (lvl * 20),
                element: Math.floor(Math.random() * 6),
                defense: 0
            });
        } else {
            const bossHp = Math.floor(totalHp * 0.6);
            const minionHp = Math.floor(totalHp * 0.2);
            
            enemies.push({
                id: 0,
                name: bossNames[Math.floor(Math.random() * bossNames.length)],
                hp: bossHp,
                maxHp: bossHp,
                level: lvl,
                avatar: avatars[Math.floor(Math.random() * avatars.length)],
                isBoss: true,
                turn: 3,
                maxTurn: 3,
                attack: 100 + (lvl * 20),
                element: Math.floor(Math.random() * 6),
                defense: 0
            });
            
            const shuffledMinionNames = [...minionNames].sort(() => Math.random() - 0.5);
            for (let i = 1; i <= 2; i++) {
                enemies.push({
                    id: i,
                    name: shuffledMinionNames[i - 1],
                    hp: minionHp,
                    maxHp: minionHp,
                    level: lvl,
                    avatar: minionAvatars[Math.floor(Math.random() * minionAvatars.length)],
                    isBoss: false,
                    turn: 3 + i,
                    maxTurn: 3 + i,
                    attack: 50 + (lvl * 10),
                    element: Math.floor(Math.random() * 6),
                    defense: 0
                });
            }
        }
        return enemies;
    }

    /**
     * Generate spirits based on level
     * @private
     */
    _generateSpirits(lvl) {
        const spirits = [];
        const elementKeys = ['FORGE', 'TIDE', 'LIFE', 'SOL', 'STONE', 'ROOT'];
        const spiritNames = {
            FORGE: ['炎灵', '火焰精灵', '熔岩之子', '烈焰守护者'],
            TIDE:  ['水灵', '潮汐精灵', '深海之魂', '清流使者'],
            LIFE:  ['生灵', '自然精灵', '万物之灵', '生机守护者'],
            SOL:   ['光灵', '太阳精灵', '金阳之子', '光明使者'],
            STONE: ['岩灵', '磐石精灵', '山岳之魂', '坚岩守护者'],
            ROOT:  ['木灵', '森林精灵', '古木之灵', '林木守护者']
        };
        
        const shuffledKeys = [...elementKeys].sort(() => Math.random() - 0.5);
        const selectedKeys = shuffledKeys.slice(0, BattleCore.MAX_SPIRITS_IN_BATTLE);
        
        for (const key of selectedKeys) {
            const element = BattleCore.ELEMENTS[key];
            const names = spiritNames[key];
            const randomName = names[Math.floor(Math.random() * names.length)];
            spirits.push({
                type: element.id,
                icon: element.icon,
                name: randomName,
                mana: 0,
                maxMana: 300,
                damage: 150 + (lvl * 50),
                element: element.id,
                defense: 0
            });
        }
        return spirits;
    }

    /**
     * Create terrain grid with various patterns
     * Terrain types correspond to elements for bonus scoring
     */
    createTerrainGrid() {
        this.terrainGrid = [];
        
        // Choose a random terrain pattern
        const patternType = Math.floor(Math.random() * 5);
        
        for (let r = 0; r < this.rows; r++) {
            this.terrainGrid[r] = [];
            for (let c = 0; c < this.cols; c++) {
                let terrainElement;
                
                switch (patternType) {
                    case 0: // Horizontal stripes
                        terrainElement = r % 6;
                        break;
                    case 1: // Vertical stripes
                        terrainElement = c % 6;
                        break;
                    case 2: // Checkerboard (2x2 blocks)
                        terrainElement = (Math.floor(r / 2) + Math.floor(c / 2)) % 6;
                        break;
                    case 3: // Quadrants
                        const midR = this.rows / 2;
                        const midC = this.cols / 2;
                        if (r < midR && c < midC) terrainElement = 0; // Top-left: FORGE (Red)
                        else if (r < midR && c >= midC) terrainElement = 1; // Top-right: TIDE (Blue)
                        else if (r >= midR && c < midC) terrainElement = 2; // Bottom-left: LIFE (Green)
                        else terrainElement = 3; // Bottom-right: SOL (Yellow)
                        break;
                    case 4: // Random regions using Perlin-like simple noise
                    default:
                        // Simple deterministic pattern based on position
                        const noise = Math.sin(r * 0.5 + c * 0.3) * Math.cos(r * 0.3 - c * 0.5);
                        terrainElement = Math.abs(Math.floor(noise * 10)) % 6;
                        break;
                }
                
                this.terrainGrid[r][c] = terrainElement;
            }
        }
    }

    /**
     * Get terrain element at position
     * @param {number} r - Row
     * @param {number} c - Column
     * @returns {number} - Element ID (0-5)
     */
    getTerrainAt(r, c) {
        if (r >= 0 && r < this.rows && c >= 0 && c < this.cols) {
            return this.terrainGrid[r][c];
        }
        return 0;
    }

    /**
     * Calculate terrain bonus for a match
     * @param {Array} matches - Array of {r, c} positions
     * @returns {Object} - {bonus: multiplier, matchingCount: count, terrainElement: element}
     */
    calculateTerrainBonus(matches) {
        if (!matches || matches.length === 0) return { bonus: 1, matchingCount: 0, terrainElement: -1 };
        
        // Count gems that match their terrain element
        let matchingCount = 0;
        const terrainCounts = {};
        
        for (const m of matches) {
            const gemType = this.grid[m.r][m.c];
            const terrainElement = this.terrainGrid[m.r][m.c];
            
            if (gemType === terrainElement) {
                matchingCount++;
                terrainCounts[terrainElement] = (terrainCounts[terrainElement] || 0) + 1;
            }
        }
        
        // Find the dominant terrain element in matching
        let dominantTerrain = -1;
        let maxCount = 0;
        for (const [terrain, count] of Object.entries(terrainCounts)) {
            if (count > maxCount) {
                maxCount = count;
                dominantTerrain = parseInt(terrain);
            }
        }
        
        const bonus = BattleCore.getTerrainBonus(matchingCount);
        
        return {
            bonus,
            matchingCount,
            terrainElement: dominantTerrain
        };
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

        // Horizontal (3+ in a row)
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

        // Vertical (3+ in a column)
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

        // 2x2 grid match - also absorbs nearby cells of the same color
        for (let r = 0; r < this.rows - 1; r++) {
            for (let c = 0; c < this.cols - 1; c++) {
                const type = this.grid[r][c];
                if (type !== null && 
                    type === this.grid[r][c+1] && 
                    type === this.grid[r+1][c] && 
                    type === this.grid[r+1][c+1]) {
                    // Add the 2x2 core
                    matches.add(`${r},${c}`);
                    matches.add(`${r},${c+1}`);
                    matches.add(`${r+1},${c}`);
                    matches.add(`${r+1},${c+1}`);
                    
                    // Absorb nearby cells of the same color (adjacent to the 2x2 block)
                    const adjacentOffsets = [
                        [-1, 0], [-1, 1],   // Top row
                        [2, 0], [2, 1],     // Bottom row
                        [0, -1], [1, -1],   // Left column
                        [0, 2], [1, 2]      // Right column
                    ];
                    
                    for (const [dr, dc] of adjacentOffsets) {
                        const nr = r + dr;
                        const nc = c + dc;
                        if (nr >= 0 && nr < this.rows && nc >= 0 && nc < this.cols) {
                            if (this.grid[nr][nc] === type) {
                                matches.add(`${nr},${nc}`);
                            }
                        }
                    }
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
        // Prevent duplicate triggers
        if (this.levelCompleted) return true;

        const allDead = this.enemies.every(e => e.hp <= 0);
        if (allDead) {
            this.levelCompleted = true;
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

    /**
     * Equip random spells to all spirits that don't already have spells
     * Ensures each spirit has a unique spell when possible
     * Requires spellRegistry from Spells.js to be loaded
     */
    equipRandomSpells() {
        if (typeof spellRegistry === 'undefined') {
            console.warn('spellRegistry not available, cannot equip random spells');
            return;
        }
        
        const allSpellIds = spellRegistry.getAllSpellIds();
        // Shuffle the spell IDs to randomize assignment
        const shuffledSpellIds = [...allSpellIds].sort(() => Math.random() - 0.5);
        const usedSpells = new Set();
        
        // Track already equipped spells
        this.spirits.forEach(spirit => {
            if (spirit.spell && spirit.spell.id) {
                usedSpells.add(spirit.spell.id);
            }
        });
        
        this.spirits.forEach((spirit, index) => {
            // Skip if already equipped
            if (spirit.spell) return;
            
            let spellId;
            // Find first unused spell from shuffled list
            const unusedFromShuffle = shuffledSpellIds.find(id => !usedSpells.has(id));
            if (unusedFromShuffle) {
                spellId = unusedFromShuffle;
            } else {
                // All spells used, pick random (allows duplicates only when necessary)
                spellId = allSpellIds[Math.floor(Math.random() * allSpellIds.length)];
            }
            usedSpells.add(spellId);
            
            // Create and equip the spell
            const spell = spellRegistry.create(spellId, spirit.element);
            if (spell) {
                spirit.spell = spell;
            }
        });
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = BattleCore;
}
