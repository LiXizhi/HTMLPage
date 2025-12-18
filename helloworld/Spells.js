/**
 * Spells.js
 * Spell system for Gem Rush battle.
 * Each spirit can be equipped with a spell that activates when mana is full.
 */

/**
 * Spell Target Types
 * - AUTO_SINGLE: Automatically targets one enemy (usually boss first)
 * - AUTO_ALL: Automatically targets all enemies
 * - SELECT_ENEMY: Player selects an enemy to target
 * - SELECT_CELL: Player selects a grid cell (for row/column spells)
 * - SELECT_ROW: Player selects a row
 * - SELECT_COL: Player selects a column
 * - SELF: Targets the caster spirit or player
 */
const SpellTargetType = {
    AUTO_SINGLE: 'auto_single',
    AUTO_ALL: 'auto_all',
    SELECT_ENEMY: 'select_enemy',
    SELECT_CELL: 'select_cell',
    SELECT_ROW: 'select_row',
    SELECT_COL: 'select_col',
    SELF: 'self'
};

/**
 * Spell Effect Types
 * Used for visual effects and sound
 */
const SpellEffectType = {
    DAMAGE: 'damage',
    HEAL: 'heal',
    BUFF: 'buff',
    DEBUFF: 'debuff',
    CLEAR_GEMS: 'clear_gems',
    TRANSFORM_GEMS: 'transform_gems'
};

/**
 * Base Spell Class
 * All spells inherit from this base class
 */
class Spell {
    /**
     * @param {Object} config - Spell configuration
     * @param {string} config.id - Unique identifier
     * @param {string} config.name - Display name
     * @param {string} config.description - Spell description
     * @param {string} config.icon - Emoji icon for the spell
     * @param {string} config.targetType - One of SpellTargetType values
     * @param {string} config.effectType - One of SpellEffectType values
     * @param {number} config.manaCost - Mana required (usually 100 for full bar)
     * @param {number} config.basePower - Base power/damage of the spell
     * @param {number} config.elementId - Element ID (-1 for neutral)
     */
    constructor(config) {
        this.id = config.id || 'unknown';
        this.name = config.name || 'Unknown Spell';
        this.description = config.description || '';
        this.icon = config.icon || '✨';
        this.targetType = config.targetType || SpellTargetType.AUTO_SINGLE;
        this.effectType = config.effectType || SpellEffectType.DAMAGE;
        this.manaCost = config.manaCost || 100;
        this.basePower = config.basePower || 100;
        this.elementId = config.elementId !== undefined ? config.elementId : -1;
    }

    /**
     * Check if the spell requires user selection
     * @returns {boolean}
     */
    requiresSelection() {
        return [
            SpellTargetType.SELECT_ENEMY,
            SpellTargetType.SELECT_CELL,
            SpellTargetType.SELECT_ROW,
            SpellTargetType.SELECT_COL
        ].includes(this.targetType);
    }

    /**
     * Get the selection prompt message
     * @returns {string}
     */
    getSelectionPrompt() {
        switch (this.targetType) {
            case SpellTargetType.SELECT_ENEMY:
                return '选择一个敌人作为目标';
            case SpellTargetType.SELECT_CELL:
                return '选择一个格子';
            case SpellTargetType.SELECT_ROW:
                return '选择一行来清除';
            case SpellTargetType.SELECT_COL:
                return '选择一列来清除';
            default:
                return '';
        }
    }

    /**
     * Calculate final damage considering element suppression
     * @param {BattleCore} battleCore - The battle core instance
     * @param {number} targetElement - Target's element ID
     * @returns {number}
     */
    calculateDamage(battleCore, targetElement) {
        const modifier = battleCore.getDamageModifier(this.elementId, targetElement);
        return Math.floor(this.basePower * modifier);
    }

    /**
     * Execute the spell
     * Override this method in subclasses for custom behavior
     * @param {BattleCore} battleCore - The battle core instance
     * @param {Object} caster - The spirit casting the spell
     * @param {Object} target - Target information (varies by spell type)
     * @returns {Object} - Result of the spell execution
     */
    execute(battleCore, caster, target) {
        return {
            success: false,
            message: 'Base spell cannot be executed directly'
        };
    }

    /**
     * Get spell info for UI display
     * @returns {Object}
     */
    getInfo() {
        return {
            id: this.id,
            name: this.name,
            description: this.description,
            icon: this.icon,
            targetType: this.targetType,
            effectType: this.effectType,
            manaCost: this.manaCost,
            basePower: this.basePower,
            requiresSelection: this.requiresSelection()
        };
    }
}

// ============================================
// DAMAGE SPELLS
// ============================================

/**
 * Single Target Attack Spell
 * Deals damage to one enemy (auto-targets boss first)
 */
class FireballSpell extends Spell {
    constructor(elementId = 0) {
        super({
            id: 'fireball',
            name: '火球术',
            description: '向敌人发射一个火球，造成伤害',
            icon: '🔥',
            targetType: SpellTargetType.AUTO_SINGLE,
            effectType: SpellEffectType.DAMAGE,
            manaCost: 100,
            basePower: 200,
            elementId: elementId
        });
    }

    execute(battleCore, caster, target) {
        // Find primary target (boss first, then first alive enemy)
        let targetEnemy = battleCore.enemies.find(e => e.isBoss && e.hp > 0);
        if (!targetEnemy) {
            targetEnemy = battleCore.enemies.find(e => e.hp > 0);
        }

        if (!targetEnemy) {
            return { success: false, message: '没有可攻击的目标' };
        }

        const damage = this.calculateDamage(battleCore, targetEnemy.element);
        const targetIndex = battleCore.enemies.indexOf(targetEnemy);
        
        battleCore.damageEnemy(damage, this.elementId, targetIndex);

        return {
            success: true,
            message: `${this.name}对${targetEnemy.name}造成了${damage}点伤害！`,
            damage: damage,
            targetIndex: targetIndex,
            effectType: this.effectType
        };
    }
}

/**
 * Water Wave - AOE spell that damages all enemies
 */
class WaterWaveSpell extends Spell {
    constructor(elementId = 1) {
        super({
            id: 'water_wave',
            name: '潮汐波',
            description: '释放水波攻击所有敌人',
            icon: '🌊',
            targetType: SpellTargetType.AUTO_ALL,
            effectType: SpellEffectType.DAMAGE,
            manaCost: 100,
            basePower: 120,
            elementId: elementId
        });
    }

    execute(battleCore, caster, target) {
        const aliveEnemies = battleCore.enemies.filter(e => e.hp > 0);
        if (aliveEnemies.length === 0) {
            return { success: false, message: '没有可攻击的目标' };
        }

        let totalDamage = 0;
        const damages = [];

        aliveEnemies.forEach(enemy => {
            const damage = this.calculateDamage(battleCore, enemy.element);
            const idx = battleCore.enemies.indexOf(enemy);
            enemy.hp = Math.max(0, enemy.hp - damage);
            totalDamage += damage;
            damages.push({ enemyIndex: idx, damage: damage });
            battleCore.onBossDamage(damage, idx);
        });

        battleCore.checkWinCondition();

        return {
            success: true,
            message: `${this.name}对所有敌人造成了共${totalDamage}点伤害！`,
            totalDamage: totalDamage,
            damages: damages,
            effectType: this.effectType
        };
    }
}

/**
 * Lightning Strike - Player selects an enemy to deal heavy damage
 */
class LightningStrikeSpell extends Spell {
    constructor(elementId = 3) {
        super({
            id: 'lightning_strike',
            name: '雷霆一击',
            description: '选择一个敌人，造成大量伤害',
            icon: '⚡',
            targetType: SpellTargetType.SELECT_ENEMY,
            effectType: SpellEffectType.DAMAGE,
            manaCost: 100,
            basePower: 300,
            elementId: elementId
        });
    }

    execute(battleCore, caster, target) {
        // target should be { enemyIndex: number }
        if (target === null || target.enemyIndex === undefined) {
            return { success: false, message: '请选择一个目标', needsSelection: true };
        }

        const enemy = battleCore.enemies[target.enemyIndex];
        if (!enemy || enemy.hp <= 0) {
            return { success: false, message: '无效的目标' };
        }

        const damage = this.calculateDamage(battleCore, enemy.element);
        enemy.hp = Math.max(0, enemy.hp - damage);
        battleCore.onBossDamage(damage, target.enemyIndex);
        battleCore.checkWinCondition();

        return {
            success: true,
            message: `${this.name}对${enemy.name}造成了${damage}点伤害！`,
            damage: damage,
            targetIndex: target.enemyIndex,
            effectType: this.effectType
        };
    }
}

// ============================================
// GRID MANIPULATION SPELLS
// ============================================

/**
 * Row Clear Spell - Clears all gems in a selected row
 */
class RowClearSpell extends Spell {
    constructor(elementId = 4) {
        super({
            id: 'row_clear',
            name: '横扫千军',
            description: '清除选中行的所有宝石，并造成伤害',
            icon: '➡️',
            targetType: SpellTargetType.SELECT_ROW,
            effectType: SpellEffectType.CLEAR_GEMS,
            manaCost: 100,
            basePower: 150,
            elementId: elementId
        });
    }

    execute(battleCore, caster, target) {
        // target should be { row: number }
        if (target === null || target.row === undefined) {
            return { success: false, message: '请选择一行', needsSelection: true };
        }

        const row = target.row;
        if (row < 0 || row >= battleCore.rows) {
            return { success: false, message: '无效的行' };
        }

        // Collect cells to clear
        const cellsToRemove = [];
        for (let c = 0; c < battleCore.cols; c++) {
            if (battleCore.grid[row][c] !== null) {
                cellsToRemove.push({ r: row, c: c, type: battleCore.grid[row][c] });
                battleCore.grid[row][c] = null;
                battleCore.wordGrid[row][c] = null;
            }
        }

        // Deal damage based on gems cleared
        const damage = Math.floor(this.basePower * (cellsToRemove.length / battleCore.cols));
        battleCore.damageEnemy(damage, this.elementId, 0);

        return {
            success: true,
            message: `${this.name}清除了${cellsToRemove.length}个宝石，造成${damage}点伤害！`,
            cellsCleared: cellsToRemove,
            damage: damage,
            effectType: this.effectType,
            requiresGravity: true
        };
    }
}

/**
 * Column Clear Spell - Clears all gems in a selected column
 */
class ColumnClearSpell extends Spell {
    constructor(elementId = 5) {
        super({
            id: 'column_clear',
            name: '天崩地裂',
            description: '清除选中列的所有宝石，并造成伤害',
            icon: '⬇️',
            targetType: SpellTargetType.SELECT_COL,
            effectType: SpellEffectType.CLEAR_GEMS,
            manaCost: 100,
            basePower: 150,
            elementId: elementId
        });
    }

    execute(battleCore, caster, target) {
        // target should be { col: number }
        if (target === null || target.col === undefined) {
            return { success: false, message: '请选择一列', needsSelection: true };
        }

        const col = target.col;
        if (col < 0 || col >= battleCore.cols) {
            return { success: false, message: '无效的列' };
        }

        // Collect cells to clear
        const cellsToRemove = [];
        for (let r = 0; r < battleCore.rows; r++) {
            if (battleCore.grid[r][col] !== null) {
                cellsToRemove.push({ r: r, c: col, type: battleCore.grid[r][col] });
                battleCore.grid[r][col] = null;
                battleCore.wordGrid[r][col] = null;
            }
        }

        // Deal damage based on gems cleared
        const damage = Math.floor(this.basePower * (cellsToRemove.length / battleCore.rows));
        battleCore.damageEnemy(damage, this.elementId, 0);

        return {
            success: true,
            message: `${this.name}清除了${cellsToRemove.length}个宝石，造成${damage}点伤害！`,
            cellsCleared: cellsToRemove,
            damage: damage,
            effectType: this.effectType,
            requiresGravity: true
        };
    }
}

/**
 * Cross Clear Spell - Clears both row and column of selected cell
 */
class CrossClearSpell extends Spell {
    constructor(elementId = 0) {
        super({
            id: 'cross_clear',
            name: '十字斩',
            description: '清除选中格子所在的整行和整列',
            icon: '✚',
            targetType: SpellTargetType.SELECT_CELL,
            effectType: SpellEffectType.CLEAR_GEMS,
            manaCost: 100,
            basePower: 200,
            elementId: elementId
        });
    }

    execute(battleCore, caster, target) {
        // target should be { row: number, col: number }
        if (target === null || target.row === undefined || target.col === undefined) {
            return { success: false, message: '请选择一个格子', needsSelection: true };
        }

        const { row, col } = target;
        if (row < 0 || row >= battleCore.rows || col < 0 || col >= battleCore.cols) {
            return { success: false, message: '无效的位置' };
        }

        const cellsToRemove = [];
        const cleared = new Set();

        // Clear row
        for (let c = 0; c < battleCore.cols; c++) {
            const key = `${row},${c}`;
            if (!cleared.has(key) && battleCore.grid[row][c] !== null) {
                cellsToRemove.push({ r: row, c: c, type: battleCore.grid[row][c] });
                cleared.add(key);
                battleCore.grid[row][c] = null;
                battleCore.wordGrid[row][c] = null;
            }
        }

        // Clear column
        for (let r = 0; r < battleCore.rows; r++) {
            const key = `${r},${col}`;
            if (!cleared.has(key) && battleCore.grid[r][col] !== null) {
                cellsToRemove.push({ r: r, c: col, type: battleCore.grid[r][col] });
                cleared.add(key);
                battleCore.grid[r][col] = null;
                battleCore.wordGrid[r][col] = null;
            }
        }

        const damage = Math.floor(this.basePower * (cellsToRemove.length / (battleCore.rows + battleCore.cols - 1)));
        battleCore.damageEnemy(damage, this.elementId, 0);

        return {
            success: true,
            message: `${this.name}清除了${cellsToRemove.length}个宝石，造成${damage}点伤害！`,
            cellsCleared: cellsToRemove,
            damage: damage,
            effectType: this.effectType,
            requiresGravity: true
        };
    }
}

// ============================================
// UTILITY / SUPPORT SPELLS
// ============================================

/**
 * Heal Spell - Restores player HP
 */
class HealSpell extends Spell {
    constructor(elementId = 2) {
        super({
            id: 'heal',
            name: '生命之泉',
            description: '恢复玩家生命值',
            icon: '💚',
            targetType: SpellTargetType.SELF,
            effectType: SpellEffectType.HEAL,
            manaCost: 100,
            basePower: 300,
            elementId: elementId
        });
    }

    execute(battleCore, caster, target) {
        const healAmount = this.basePower;
        const oldHp = battleCore.playerHp;
        battleCore.playerHp = Math.min(battleCore.playerMaxHp, battleCore.playerHp + healAmount);
        const actualHeal = battleCore.playerHp - oldHp;

        return {
            success: true,
            message: `${this.name}恢复了${actualHeal}点生命！`,
            healAmount: actualHeal,
            effectType: this.effectType
        };
    }
}

/**
 * Shield Spell - Reduces enemy turn counters (delays attacks)
 */
class ShieldSpell extends Spell {
    constructor(elementId = 4) {
        super({
            id: 'shield',
            name: '磐石护盾',
            description: '延迟所有敌人的攻击回合',
            icon: '🛡️',
            targetType: SpellTargetType.SELF,
            effectType: SpellEffectType.BUFF,
            manaCost: 100,
            basePower: 2, // Turns to add
            elementId: elementId
        });
    }

    execute(battleCore, caster, target) {
        let affected = 0;
        battleCore.enemies.forEach(enemy => {
            if (enemy.hp > 0) {
                enemy.turn += this.basePower;
                affected++;
            }
        });

        return {
            success: true,
            message: `${this.name}延迟了${affected}个敌人${this.basePower}回合！`,
            turnsAdded: this.basePower,
            affectedCount: affected,
            effectType: this.effectType
        };
    }
}

/**
 * Transform Spell - Converts random gems to caster's element
 */
class TransformSpell extends Spell {
    constructor(elementId = 1) {
        super({
            id: 'transform',
            name: '元素转化',
            description: '将若干随机宝石转化为施法者的元素',
            icon: '🔄',
            targetType: SpellTargetType.SELF,
            effectType: SpellEffectType.TRANSFORM_GEMS,
            manaCost: 100,
            basePower: 5, // Number of gems to transform
            elementId: elementId
        });
    }

    execute(battleCore, caster, target) {
        const targetElement = caster.element;
        const candidates = [];

        // Find all gems that are not already the target element
        for (let r = 0; r < battleCore.rows; r++) {
            for (let c = 0; c < battleCore.cols; c++) {
                if (battleCore.grid[r][c] !== null && battleCore.grid[r][c] !== targetElement) {
                    candidates.push({ r, c });
                }
            }
        }

        // Shuffle and pick
        const shuffled = candidates.sort(() => Math.random() - 0.5);
        const toTransform = shuffled.slice(0, Math.min(this.basePower, shuffled.length));

        const transformed = [];
        toTransform.forEach(cell => {
            const oldType = battleCore.grid[cell.r][cell.c];
            battleCore.grid[cell.r][cell.c] = targetElement;
            transformed.push({ r: cell.r, c: cell.c, oldType, newType: targetElement });
        });

        return {
            success: true,
            message: `${this.name}转化了${transformed.length}个宝石！`,
            transformedCells: transformed,
            effectType: this.effectType,
            requiresRender: true
        };
    }
}

// ============================================
// SPELL REGISTRY
// ============================================

/**
 * SpellRegistry - Central registry for all available spells
 * Used to create spell instances and look up spell definitions
 */
class SpellRegistry {
    constructor() {
        this.spells = new Map();
        this.defaultSpellsByElement = new Map();
        this._registerDefaultSpells();
    }

    /**
     * Register a spell class
     * @param {string} id - Unique spell ID
     * @param {Function} SpellClass - The spell class constructor
     */
    register(id, SpellClass) {
        this.spells.set(id, SpellClass);
    }

    /**
     * Set the default spell for an element
     * @param {number} elementId - Element ID
     * @param {string} spellId - Spell ID
     */
    setDefaultSpell(elementId, spellId) {
        this.defaultSpellsByElement.set(elementId, spellId);
    }

    /**
     * Create a spell instance by ID
     * @param {string} id - Spell ID
     * @param {number} elementId - Override element ID (optional)
     * @returns {Spell|null}
     */
    create(id, elementId) {
        const SpellClass = this.spells.get(id);
        if (!SpellClass) return null;
        return new SpellClass(elementId);
    }

    /**
     * Get the default spell for an element
     * @param {number} elementId - Element ID
     * @returns {Spell|null}
     */
    getDefaultSpellForElement(elementId) {
        const spellId = this.defaultSpellsByElement.get(elementId);
        if (!spellId) return null;
        return this.create(spellId, elementId);
    }

    /**
     * Get all registered spell IDs
     * @returns {Array<string>}
     */
    getAllSpellIds() {
        return Array.from(this.spells.keys());
    }

    /**
     * Get spell info by ID (without creating instance)
     * @param {string} id - Spell ID
     * @returns {Object|null}
     */
    getSpellInfo(id) {
        const spell = this.create(id);
        return spell ? spell.getInfo() : null;
    }

    /**
     * Register all default spells
     * @private
     */
    _registerDefaultSpells() {
        // Register spell classes
        this.register('fireball', FireballSpell);
        this.register('water_wave', WaterWaveSpell);
        this.register('lightning_strike', LightningStrikeSpell);
        this.register('row_clear', RowClearSpell);
        this.register('column_clear', ColumnClearSpell);
        this.register('cross_clear', CrossClearSpell);
        this.register('heal', HealSpell);
        this.register('shield', ShieldSpell);
        this.register('transform', TransformSpell);

        // Set default spells for each element
        // FORGE (0) - Fire element: Fireball
        this.setDefaultSpell(0, 'fireball');
        // TIDE (1) - Water element: Water Wave
        this.setDefaultSpell(1, 'water_wave');
        // LIFE (2) - Nature element: Heal
        this.setDefaultSpell(2, 'heal');
        // SOL (3) - Lightning element: Lightning Strike
        this.setDefaultSpell(3, 'lightning_strike');
        // STONE (4) - Earth element: Row Clear
        this.setDefaultSpell(4, 'row_clear');
        // ROOT (5) - Wood element: Column Clear
        this.setDefaultSpell(5, 'column_clear');
    }
}

// Global spell registry instance
const spellRegistry = new SpellRegistry();

// ============================================
// SPELL MANAGER
// ============================================

/**
 * SpellManager - Manages spell casting for a battle
 * Handles spell selection, targeting, and execution
 */
class SpellManager {
    /**
     * @param {BattleCore} battleCore - The battle core instance
     */
    constructor(battleCore) {
        this.battleCore = battleCore;
        this.pendingSpell = null; // Spell waiting for user selection
        this.pendingCaster = null; // Spirit that's casting the pending spell

        // Callbacks
        this.onSpellCast = () => {};
        this.onSelectionRequired = () => {};
        this.onSpellComplete = () => {};
    }

    /**
     * Equip a spell to a spirit
     * @param {Object} spirit - The spirit object
     * @param {string} spellId - The spell ID to equip
     */
    equipSpell(spirit, spellId) {
        const spell = spellRegistry.create(spellId, spirit.element);
        if (spell) {
            spirit.spell = spell;
        }
    }

    /**
     * Equip default spells to all spirits based on their elements
     */
    equipDefaultSpells() {
        this.battleCore.spirits.forEach(spirit => {
            const spell = spellRegistry.getDefaultSpellForElement(spirit.element);
            if (spell) {
                spirit.spell = spell;
            }
        });
    }

    /**
     * Check if a spirit can cast its spell
     * @param {Object} spirit - The spirit to check
     * @returns {boolean}
     */
    canCast(spirit) {
        if (!spirit || !spirit.spell) return false;
        return spirit.mana >= spirit.spell.manaCost;
    }

    /**
     * Attempt to cast a spirit's spell
     * @param {Object} spirit - The casting spirit
     * @param {Object} target - Target info (optional, for spells requiring selection)
     * @returns {Object} - Result of the cast attempt
     */
    castSpell(spirit, target = null) {
        if (!spirit || !spirit.spell) {
            return { success: false, message: '该精灵没有装备技能' };
        }

        if (spirit.mana < spirit.spell.manaCost) {
            return { success: false, message: '法力不足' };
        }

        const spell = spirit.spell;

        // Check if spell requires selection and none provided
        if (spell.requiresSelection() && target === null) {
            this.pendingSpell = spell;
            this.pendingCaster = spirit;
            this.onSelectionRequired(spell, spirit);
            return { 
                success: false, 
                needsSelection: true, 
                message: spell.getSelectionPrompt(),
                targetType: spell.targetType
            };
        }

        // Execute the spell
        const result = spell.execute(this.battleCore, spirit, target);

        if (result.success) {
            // Consume mana
            spirit.mana -= spell.manaCost;
            
            // Clear pending state
            this.pendingSpell = null;
            this.pendingCaster = null;

            this.onSpellCast(spell, spirit, result);
            this.onSpellComplete(result);
        }

        return result;
    }

    /**
     * Complete a pending spell with user selection
     * @param {Object} target - The selected target
     * @returns {Object} - Result of the cast
     */
    completePendingSpell(target) {
        if (!this.pendingSpell || !this.pendingCaster) {
            return { success: false, message: '没有等待中的技能' };
        }

        return this.castSpell(this.pendingCaster, target);
    }

    /**
     * Cancel the pending spell
     */
    cancelPendingSpell() {
        this.pendingSpell = null;
        this.pendingCaster = null;
    }

    /**
     * Check if there's a pending spell waiting for selection
     * @returns {boolean}
     */
    hasPendingSpell() {
        return this.pendingSpell !== null;
    }

    /**
     * Get the pending spell info
     * @returns {Object|null}
     */
    getPendingSpellInfo() {
        if (!this.pendingSpell) return null;
        return {
            spell: this.pendingSpell.getInfo(),
            caster: this.pendingCaster
        };
    }
}

// ============================================
// EXPORTS
// ============================================

// Export for ES modules or Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        SpellTargetType,
        SpellEffectType,
        Spell,
        FireballSpell,
        WaterWaveSpell,
        LightningStrikeSpell,
        RowClearSpell,
        ColumnClearSpell,
        CrossClearSpell,
        HealSpell,
        ShieldSpell,
        TransformSpell,
        SpellRegistry,
        SpellManager,
        spellRegistry
    };
}
