    // Fallback: Strongest damage skill available (Must check resources)
    const bestSkill = enemy.skills
        .map(skillID => this.skills.find(s => s.id === skillID))
        .filter(s => s && s.category && s.category.includes('DAMAGE') && this.hasResources(enemy, s))
        .sort((a, b) => (b.basePower || 0) - (a.basePower || 0))[0];
    
    if (bestSkill) {
        const target = alivePlayers.reduce((min, p) => p.currentHP < min.currentHP ? p : min);
        return { type: 'skill', skillID: bestSkill.id, target: target.id };
    }

    // ==========================================
    // NEW LOGIC: NO RESOURCES FALLBACK (Enemies)
    // ==========================================
    const desperationPool = this.skills.filter(s => s.category === 'NO_RESOURCES');

    if (desperationPool.length > 0) {
        const randomIndex = Math.floor(Math.random() * desperationPool.length);
        const chosenSkill = desperationPool[randomIndex];

        console.log(`[DESPERATION] ${enemy.name} is out of resources! Randomly selected: ${chosenSkill.name}`);

        let targetId = null;
        const isSelfish = chosenSkill.effects?.some(e => 
            e.type === 'restore_resource' || 
            (e.type === 'apply_buff' && e.targets === 'self') ||
            (e.type === 'apply_debuff' && e.targets === 'self')
        );

        if (isSelfish) {
            targetId = enemy.id;
        } else {
            const target = alivePlayers.reduce((min, p) => p.currentHP < min.currentHP ? p : min);
            targetId = target.id;
        }

        return { 
            type: 'skill', 
            skillID: chosenSkill.id, 
            target: targetId 
        };
    }

    console.error(`[CRITICAL] ${enemy.name} has no resources AND the global NO_RESOURCES pool is empty! Falling back to basic attack.`);
    const targetFallback = alivePlayers.reduce((min, p) => p.currentHP < min.currentHP ? p : min);
    return { type: 'attack', target: targetFallback.id };
}