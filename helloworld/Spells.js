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
     * Calculate final damage considering element suppression and spirit mana
     * Damage scales with spirit's current mana (mana/100 as multiplier)
     * @param {BattleCore} battleCore - The battle core instance
     * @param {number} targetElement - Target's element ID
     * @param {number} spiritMana - Spirit's current mana (0-100+)
     * @returns {number}
     */
    calculateDamage(battleCore, targetElement, spiritMana = 100) {
        const modifier = battleCore.getDamageModifier(this.elementId, targetElement);
        // Mana scaling: damage increases proportionally with mana
        // At 100 mana = 100% damage, at 200 mana = 200% damage, etc.
        const manaMultiplier = spiritMana / 100;
        return Math.floor(this.basePower * modifier * manaMultiplier);
    }

    /**
     * Execute the spell
     * Override this method in subclasses for custom behavior
     * @param {BattleCore} battleCore - The battle core instance
     * @param {Object} caster - The spirit casting the spell (includes mana info)
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

        // Damage scales with caster's current mana
        const damage = this.calculateDamage(battleCore, targetEnemy.element, caster.mana);
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
            // Damage scales with caster's current mana
            const damage = this.calculateDamage(battleCore, enemy.element, caster.mana);
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

        // Damage scales with caster's current mana
        const damage = this.calculateDamage(battleCore, enemy.element, caster.mana);
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
 * Calculate score/damage for spell-cleared gems
 * Groups gems by type and checks for connected matches
 * Connected gems of 3+ of the same type use BattleCore's scoring
 * Unconnected or less than 3 gems: each gem is worth 20 score
 * @param {Array} cellsToRemove - Array of cleared cells with type info {r, c, type}
 * @param {number} spiritMana - Spirit's current mana for scaling (default 100)
 * @returns {number} - Total score/damage
 */
function calculateSpellClearScore(cellsToRemove, spiritMana = 100) {
    if (cellsToRemove.length === 0) return 0;
    
    // Mana scaling: damage increases proportionally with mana
    const manaMultiplier = spiritMana / 100;
    
    // Group cells by type
    const cellsByType = {};
    cellsToRemove.forEach(cell => {
        if (cell.type !== null && cell.type !== undefined) {
            if (!cellsByType[cell.type]) {
                cellsByType[cell.type] = [];
            }
            cellsByType[cell.type].push({ r: cell.r, c: cell.c });
        }
    });
    
    // Find connected groups within each type
    function findConnectedGroups(cells) {
        if (cells.length === 0) return [];
        
        const visited = new Set();
        const groups = [];
        
        // Check if two cells are adjacent
        function isAdjacent(cell1, cell2) {
            return (Math.abs(cell1.r - cell2.r) === 1 && cell1.c === cell2.c) ||
                   (Math.abs(cell1.c - cell2.c) === 1 && cell1.r === cell2.r);
        }
        
        // BFS to find connected component
        function bfs(startIdx) {
            const group = [];
            const queue = [startIdx];
            visited.add(startIdx);
            
            while (queue.length > 0) {
                const idx = queue.shift();
                group.push(cells[idx]);
                
                for (let i = 0; i < cells.length; i++) {
                    if (!visited.has(i) && isAdjacent(cells[idx], cells[i])) {
                        visited.add(i);
                        queue.push(i);
                    }
                }
            }
            return group;
        }
        
        // Find all connected groups
        for (let i = 0; i < cells.length; i++) {
            if (!visited.has(i)) {
                groups.push(bfs(i));
            }
        }
        
        return groups;
    }
    
    // Calculate total score
    let totalScore = 0;
    
    for (const [type, cells] of Object.entries(cellsByType)) {
        const connectedGroups = findConnectedGroups(cells);
        
        for (const group of connectedGroups) {
            const count = group.length;
            if (count < 3) {
                // Less than 3 connected gems: 20 each
                totalScore += count * 20;
            } else {
                // 3+ connected gems: use base scoring
                if (typeof BattleCore !== 'undefined' && BattleCore.getBaseScore) {
                    totalScore += BattleCore.getBaseScore(count);
                } else {
                    // Fallback scoring if BattleCore not available
                    const baseScores = { 3: 100, 4: 180, 5: 300, 6: 450 };
                    if (count >= 6) {
                        totalScore += baseScores[6];
                    } else {
                        totalScore += baseScores[count] || baseScores[3];
                    }
                }
            }
        }
    }
    
    // Apply mana multiplier to final score
    return Math.floor(totalScore * manaMultiplier);
}

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

        // Calculate damage based on cleared gems score, scaled by caster's mana
        // Spell clears deal damage to enemies, not add to spirit mana
        const damage = calculateSpellClearScore(cellsToRemove, caster.mana);
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
 * 贯穿光束：清除指定一列上的所有方块和障碍物
 */
class ColumnClearSpell extends Spell {
    constructor(elementId = 5) {
        super({
            id: 'column_clear',
            name: '贯穿光束',
            description: '【单线清除】清除指定一列上的所有方块和障碍物，快速清除直线上高耐久障碍物',
            icon: '⚡',
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

        // Calculate damage based on cleared gems score, scaled by caster's mana
        // Spell clears deal damage to enemies, not add to spirit mana
        const damage = calculateSpellClearScore(cellsToRemove, caster.mana);
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
 * Area Clear Spell - Clears 3x3 area around selected cell
 * 范围震爆：清除指定中心点3x3区域内的所有方块和障碍物
 */
class AreaClearSpell extends Spell {
    constructor(elementId = 0) {
        super({
            id: 'area_clear',
            name: '范围震爆',
            description: '【范围清场】清除指定中心点3x3区域内的所有方块和障碍物，应对密集障碍物挑战',
            icon: '💥',
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

        // Clear 3x3 area centered on selected cell
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                const r = row + dr;
                const c = col + dc;
                if (r >= 0 && r < battleCore.rows && c >= 0 && c < battleCore.cols) {
                    const key = `${r},${c}`;
                    if (!cleared.has(key) && battleCore.grid[r][c] !== null) {
                        cellsToRemove.push({ r: r, c: c, type: battleCore.grid[r][c] });
                        cleared.add(key);
                        battleCore.grid[r][c] = null;
                        battleCore.wordGrid[r][c] = null;
                    }
                }
            }
        }

        // Calculate damage based on cleared gems score, scaled by caster's mana
        const damage = calculateSpellClearScore(cellsToRemove, caster.mana);
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
        // Heal amount scales with caster's current mana
        const manaMultiplier = caster.mana / 100;
        const healAmount = Math.floor(this.basePower * manaMultiplier);
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
        // Fixed 1 turn delay
        const turnsToAdd = 1;
        
        let affected = 0;
        battleCore.enemies.forEach(enemy => {
            if (enemy.hp > 0) {
                enemy.turn += turnsToAdd;
                affected++;
            }
        });

        return {
            success: true,
            message: `${this.name}延迟了${affected}个敌人${turnsToAdd}回合！`,
            turnsAdded: turnsToAdd,
            affectedCount: affected,
            effectType: this.effectType
        };
    }
}

/**
 * Transform Spell - Converts random gems to caster's element
 * 元素转换：将棋盘上随机10个方块转化为该精灵对应颜色的方块
 */
class TransformSpell extends Spell {
    constructor(elementId = 1) {
        super({
            id: 'transform',
            name: '元素转换',
            description: '【方块集中】将棋盘上随机10个方块转化为该精灵对应颜色的方块，便于进行5消或6消',
            icon: '🔄',
            targetType: SpellTargetType.SELF,
            effectType: SpellEffectType.TRANSFORM_GEMS,
            manaCost: 100,
            basePower: 10, // Number of gems to transform
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

        // Number of gems to transform scales with caster's current mana
        const manaMultiplier = caster.mana / 100;
        const gemsToTransform = Math.max(1, Math.floor(this.basePower * manaMultiplier));

        // Shuffle and pick
        const shuffled = candidates.sort(() => Math.random() - 0.5);
        const toTransform = shuffled.slice(0, Math.min(gemsToTransform, shuffled.length));

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

/**
 * Element Lock Spell - Removes the least common gem color from the board
 * 元素锁定：消除棋盘上最少数量的一个颜色的方块
 */
class ElementLockSpell extends Spell {
    constructor(elementId = 2) {
        super({
            id: 'element_lock',
            name: '元素锁定',
            description: '【消除保护】消除棋盘上最少数量的一个颜色的方块，移除干扰颜色，优化布局',
            icon: '🔒',
            targetType: SpellTargetType.SELF,
            effectType: SpellEffectType.CLEAR_GEMS,
            manaCost: 100,
            basePower: 100,
            elementId: elementId
        });
    }

    execute(battleCore, caster, target) {
        // Count gems by type
        const gemCounts = {};
        for (let r = 0; r < battleCore.rows; r++) {
            for (let c = 0; c < battleCore.cols; c++) {
                const type = battleCore.grid[r][c];
                if (type !== null) {
                    gemCounts[type] = (gemCounts[type] || 0) + 1;
                }
            }
        }

        // Find the least common gem type
        let minCount = Infinity;
        let minType = null;
        for (const [type, count] of Object.entries(gemCounts)) {
            if (count < minCount) {
                minCount = count;
                minType = parseInt(type);
            }
        }

        if (minType === null) {
            return { success: false, message: '棋盘上没有可消除的宝石' };
        }

        // Clear all gems of the least common type
        const cellsToRemove = [];
        for (let r = 0; r < battleCore.rows; r++) {
            for (let c = 0; c < battleCore.cols; c++) {
                if (battleCore.grid[r][c] === minType) {
                    cellsToRemove.push({ r: r, c: c, type: minType });
                    battleCore.grid[r][c] = null;
                    battleCore.wordGrid[r][c] = null;
                }
            }
        }

        // Calculate damage based on cleared gems score, scaled by caster's mana
        const damage = calculateSpellClearScore(cellsToRemove, caster.mana);
        battleCore.damageEnemy(damage, this.elementId, 0);

        return {
            success: true,
            message: `${this.name}消除了${cellsToRemove.length}个宝石，造成${damage}点伤害！`,
            cellsCleared: cellsToRemove,
            damage: damage,
            effectType: this.effectType,
            requiresGravity: true
        };
    }
}

/**
 * Chaos Shuffle Spell - Shuffles all gems on the board randomly
 * 混沌重构：重新随机打乱所有方块的位置，不影响障碍物
 */
class ChaosShuffleSpell extends Spell {
    constructor(elementId = 3) {
        super({
            id: 'chaos_shuffle',
            name: '混沌重构',
            description: '【全盘洗牌】重新随机打乱所有方块的位置，不影响障碍物，绝境重置寻求新机会',
            icon: '🌀',
            targetType: SpellTargetType.SELF,
            effectType: SpellEffectType.TRANSFORM_GEMS,
            manaCost: 100,
            basePower: 0,
            elementId: elementId
        });
    }

    execute(battleCore, caster, target) {
        // Collect all gem positions and their types
        const gemCells = [];
        const gemTypes = [];

        for (let r = 0; r < battleCore.rows; r++) {
            for (let c = 0; c < battleCore.cols; c++) {
                const type = battleCore.grid[r][c];
                if (type !== null) {
                    gemCells.push({ r, c });
                    gemTypes.push(type);
                }
            }
        }

        if (gemCells.length < 2) {
            return { success: false, message: '棋盘上没有足够的宝石进行洗牌' };
        }

        // Shuffle gem types using Fisher-Yates algorithm
        for (let i = gemTypes.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [gemTypes[i], gemTypes[j]] = [gemTypes[j], gemTypes[i]];
        }

        // Reassign shuffled types to positions
        const shuffledCells = [];
        for (let i = 0; i < gemCells.length; i++) {
            const { r, c } = gemCells[i];
            const oldType = battleCore.grid[r][c];
            const newType = gemTypes[i];
            battleCore.grid[r][c] = newType;
            shuffledCells.push({ r, c, oldType, newType });
        }

        return {
            success: true,
            message: `${this.name}重新打乱了${shuffledCells.length}个宝石的位置！`,
            shuffledCells: shuffledCells,
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
        this.register('area_clear', AreaClearSpell);
        this.register('heal', HealSpell);
        this.register('shield', ShieldSpell);
        this.register('transform', TransformSpell);
        this.register('element_lock', ElementLockSpell);
        this.register('chaos_shuffle', ChaosShuffleSpell);

        // Set default spells for each element
        // FORGE (0) - Fire element: 范围震爆
        this.setDefaultSpell(0, 'area_clear');
        // TIDE (1) - Water element: 元素转换
        this.setDefaultSpell(1, 'transform');
        // LIFE (2) - Nature element: 元素锁定
        this.setDefaultSpell(2, 'element_lock');
        // SOL (3) - Lightning element: 混沌重构
        this.setDefaultSpell(3, 'chaos_shuffle');
        // STONE (4) - Earth element: Row Clear (横扫千军)
        this.setDefaultSpell(4, 'row_clear');
        // ROOT (5) - Wood element: 贯穿光束
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
     * Spell consumes ALL of the spirit's mana on cast
     * Damage/effect scales with the spirit's current mana
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

        // Execute the spell (damage/effect scales with current mana)
        const result = spell.execute(this.battleCore, spirit, target);

        if (result.success) {
            // Consume ALL mana (not just manaCost)
            result.manaConsumed = spirit.mana;
            spirit.mana = 0;
            
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
        AreaClearSpell,
        HealSpell,
        ShieldSpell,
        TransformSpell,
        ElementLockSpell,
        ChaosShuffleSpell,
        SpellRegistry,
        SpellManager,
        spellRegistry
    };
}
