/**
 * StatusEngine - Handles all status effect mechanics
 * Modular system for applying, ticking, and resolving status effects
 */
class StatusEngine {
    constructor(statusesData) {
        this.statuses = statusesData; // Array of status definitions from statuses.json
        this.statusMap = {}; // Quick lookup: statusId -> statusDef
        this.initializeStatusMap();
    }

    /**
     * Build quick lookup map for O(1) status definition access
     */
    initializeStatusMap() {
        this.statuses.forEach(status => {
            this.statusMap[status.id] = status;
        });
    }

    /**
     * Apply a status effect to a target
     * @param {Object} target - Character or enemy to receive status
     * @param {string} statusId - ID of status to apply
     * @param {number} duration - How many turns (default from status definition)
     * @param {number} magnitude - Intensity multiplier (default 1)
     * @returns {boolean} - True if applied, false if not found
     */
    applyStatus(target, statusId, duration, magnitude = 1) {
        const statusDef = this.statusMap[statusId];
        if (!statusDef) {
            console.warn(`Status not found: ${statusId}`);
            return false;
        }

        const finalDuration = duration !== undefined ? duration : statusDef.defaultDuration;

        // Check for stacking rules
        const existingStatus = target.statusEffects?.find(s => s.id === statusId);
        if (existingStatus) {
            const stackBehaviour = statusDef.stackingBehaviour || 'extend';
            if (stackBehaviour === 'escalate') {
                // Escalating: each reapplication increases magnitude and resets duration
                existingStatus.magnitude = Math.min(existingStatus.magnitude + magnitude, statusDef.maxMagnitude || 5);
                existingStatus.duration = finalDuration;
            } else {
                // Default: extend duration, take highest magnitude
                existingStatus.duration = Math.max(existingStatus.duration, finalDuration);
                existingStatus.magnitude = Math.max(existingStatus.magnitude, magnitude);
            }
            return true;
        }

        // Add new status
        if (!target.statusEffects) target.statusEffects = [];
        target.statusEffects.push({
            id: statusId,
            name: statusDef.name,
            duration: finalDuration,
            magnitude,
            type: statusDef.type,
            sourceId: null  // populated by engine when actor context is available
        });

        return true;
    }

    /**
     * Process all active status effects on a target
     * Called each turn to apply damage, healing, stat effects, etc.
     * @param {Object} target - Character/enemy with status effects
     * @returns {Object} - { damageDealt, healed, statReductions, messages }
     */
    processStatusEffects(target) {
        const result = {
            damageDealt: 0,
            healed: 0,
            messages: [],
            statReductions: {},
            statBoosts: {},
            skillDelayMultiplier: 1.0,
            incomingDamageMultiplier: 1.0,
            staminaRegenMultiplier: 1.0,
            manaRegenMultiplier: 1.0,
            manaDrainPerTurn: 0,
            // Lifedrain: damage ticked that should also heal a remote source
            sourceHeals: []  // [{ sourceId, amount }] — engine credits HP to the source combatant
        };

        if (!target.statusEffects || target.statusEffects.length === 0) {
            return result;
        }

        target.statusEffects.forEach(activeStatus => {
            const statusDef = this.statusMap[activeStatus.id];
            if (!statusDef) return;

            const effects = statusDef.effects;

            // Apply damage over time effects
            if (effects.damagePerTurn) {
                const damage = Math.floor(this.evaluateExpression(effects.damagePerTurn, activeStatus.magnitude));
                result.damageDealt += damage;
                result.messages.push(`${target.name} takes ${damage} damage from ${statusDef.name}`);
            }

            // Apply healing effects
            if (effects.healPerTurn) {
                const healing = Math.floor(this.evaluateExpression(effects.healPerTurn, activeStatus.magnitude));
                result.healed += healing;
                result.messages.push(`${target.name} heals for ${healing} HP from ${statusDef.name}`);
            }

            // Apply stat reductions (debuffs)
            if (effects.statReduction) {
                Object.entries(effects.statReduction).forEach(([stat, reduction]) => {
                    result.statReductions[stat] = (result.statReductions[stat] || 0) + reduction;
                });
            }

            // Apply stat boosts (buffs)
            if (effects.statBoost) {
                Object.entries(effects.statBoost).forEach(([stat, boost]) => {
                    result.statBoosts[stat] = (result.statBoosts[stat] || 0) + boost;
                });
            }

            // Apply multiplier effects
            if (effects.skillDelayMultiplier) {
                result.skillDelayMultiplier *= effects.skillDelayMultiplier;
            }

            if (effects.incomingDamageMultiplier) {
                result.incomingDamageMultiplier *= effects.incomingDamageMultiplier;
            }

            if (effects.staminaRegenMultiplier) {
                result.staminaRegenMultiplier *= effects.staminaRegenMultiplier;
            }

            if (effects.manaRegenMultiplier) {
                result.manaRegenMultiplier *= effects.manaRegenMultiplier;
            }

            if (effects.manaDrainPerTurn) {
                const drain = Math.floor(this.evaluateExpression(effects.manaDrainPerTurn, activeStatus.magnitude));
                result.manaDrainPerTurn += drain;
                result.messages.push(`${target.name} loses ${drain} mana from ${statusDef.name}`);
            }

            // Leech DoT: tick damage that heals the caster (sourceId stored on active status)
            if (effects.sourceHealPerTurn && activeStatus.sourceId) {
                const healAmount = Math.floor(this.evaluateExpression(effects.sourceHealPerTurn, activeStatus.magnitude));
                if (healAmount > 0) {
                    result.sourceHeals.push({ sourceId: activeStatus.sourceId, amount: healAmount });
                    result.messages.push(`${target.name} is drained by Life Leech`);
                }
            }
        });

        return result;
    }

    /**
     * Check if a status prevents an action
     * @param {Object} target - Character/enemy to check
     * @returns {Object} - { canAct, reason, skipTurn }
     */
    checkActionBlock(target) {
        if (!target.statusEffects || target.statusEffects.length === 0) {
            return { canAct: true };
        }

        for (const activeStatus of target.statusEffects) {
            const statusDef = this.statusMap[activeStatus.id];
            if (!statusDef) continue;

            if (statusDef.effects.skipTurn) {
                return {
                    canAct: false,
                    reason: `${target.name} is ${statusDef.name} and cannot act!`,
                    skipTurn: true
                };
            }

            if (statusDef.effects.blockSkillCostType) {
                // This is checked during skill selection
            }
        }

        return { canAct: true };
    }

    /**
     * Check if a skill is blocked by status effects
     * @param {Object} target - Character/enemy
     * @param {Object} skill - Skill being used
     * @returns {boolean} - True if skill is blocked
     */
    isSkillBlocked(target, skill) {
        if (!target.statusEffects) return false;

        for (const activeStatus of target.statusEffects) {
            const statusDef = this.statusMap[activeStatus.id];
            if (!statusDef) continue;

            // Check for skill cost type blocks (e.g., Silence blocks mana skills)
            if (statusDef.effects.blockSkillCostType === skill.costType) {
                return true;
            }
        }

        return false;
    }

    /**
     * Tick down and remove expired status effects
     * @param {Object} target - Character/enemy with effects
     */
    updateStatusDurations(target) {
        if (!target.statusEffects) return;

        target.statusEffects = target.statusEffects
            .map(effect => ({ ...effect, duration: effect.duration - 1 }))
            .filter(effect => {
                if (effect.duration <= 0) {
                    console.log(`[STATUS] ${effect.name} expired on ${target.name}`);
                    return false;
                }
                return true;
            });
    }

    /**
     * Get all active status messages for a target
     * @param {Object} target - Character/enemy
     * @returns {string[]} - Array of status descriptions
     */
    getActiveStatusMessages(target) {
        if (!target.statusEffects || target.statusEffects.length === 0) {
            return [];
        }

        return target.statusEffects.map(activeStatus => {
            const statusDef = this.statusMap[activeStatus.id];
            return `${statusDef.name} (${activeStatus.duration} turn${activeStatus.duration > 1 ? 's' : ''})`;
        });
    }

    /**
     * Remove a specific status from a target
     * @param {Object} target - Character/enemy
     * @param {string} statusId - Status to remove
     * @returns {boolean} - True if removed
     */
    removeStatus(target, statusId) {
        if (!target.statusEffects) return false;

        const index = target.statusEffects.findIndex(s => s.id === statusId);
        if (index >= 0) {
            const removed = target.statusEffects.splice(index, 1);
            console.log(`[STATUS] Removed ${removed[0].name} from ${target.name}`);
            return true;
        }
        return false;
    }

    /**
     * Clear all status effects from a target
     * @param {Object} target - Character/enemy
     */
    clearAllStatus(target) {
        if (target.statusEffects) {
            target.statusEffects = [];
        }
    }

    /**
     * Evaluate expressions like "magnitude * 5" or "magnitude * 10"
     * @param {string} expression - Expression with 'magnitude' variable
     * @param {number} magnitude - Magnitude value
     * @returns {number} - Evaluated result
     */
    evaluateExpression(expression, magnitude) {
        // Safe evaluation for simple math expressions
        try {
            return Function('"use strict"; return (' + expression.replace(/magnitude/g, magnitude) + ')')();
        } catch (error) {
            console.error(`Failed to evaluate expression: ${expression}`, error);
            return 0;
        }
    }

    /**
     * Get a summary of all status effects on a target for debugging
     * @param {Object} target - Character/enemy
     * @returns {Object} - Debug info
     */
    getStatusDebugInfo(target) {
        if (!target.statusEffects || target.statusEffects.length === 0) {
            return { count: 0, effects: [] };
        }

        return {
            count: target.statusEffects.length,
            effects: target.statusEffects.map(e => ({
                id: e.id,
                name: e.name,
                duration: e.duration,
                magnitude: e.magnitude,
                type: e.type
            }))
        };
    }
}

module.exports = StatusEngine;
