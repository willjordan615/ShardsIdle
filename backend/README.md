# Shards Idle - Combat Engine

A Node.js backend for the Shards Idle asynchronous group-based PvE RPG.

## Setup

### 1. Install Dependencies
```bash
cd backend
npm install
```

### 2. Create Data Directory
```bash
mkdir -p data
```

### 3. Copy Game Data
Copy your JSON files into the `data/` directory:
- `skills.json`
- `enemy-skills.json`
- `races.json`
- `challenges.json`

The database (`game.db`) will be created automatically on first run.

### 4. Start the Server
```bash
npm start
```

The server will run on `http://localhost:3001`

## API Endpoints

### Health Check
```
GET /api/health
```

### Start Combat
```
POST /api/combat/start
Content-Type: application/json

{
  "partySnapshots": [
    {
      "characterID": "char_001",
      "characterName": "Thorne",
      "level": 5,
      "stats": {
        "conviction": 70,
        "endurance": 120,
        "ambition": 50,
        "harmony": 80
      },
      "skills": [
        {
          "skillID": "slash",
          "learned": true,
          "usageCount": 10,
          "skillXP": 500,
          "skillLevel": 2
        }
      ],
      "consumables": {
        "escape_rope": 1,
        "health_potion_minor": 3
      },
      "equipment": {
        "mainHand": "iron_sword",
        "chest": "leather_armor"
      }
    }
  ],
  "challengeID": "challenge_goblin_camp",
  "challenges": [
    {
      "id": "challenge_goblin_camp",
      "name": "Goblin Encampment",
      "difficulty": 1,
      "enemies": [
        {
          "enemyID": "goblin_scout_001",
          "enemyName": "Goblin Scout",
          "count": 2,
          "stats": {
            "conviction": 30,
            "endurance": 25,
            "ambition": 40,
            "harmony": 10
          },
          "maxHP": 20,
          "defense": 5,
          "skills": ["goblin_stab", "goblin_dodge"]
        }
      ],
      "rewards": {
        "baseXP": 300,
        "baseGold": 100,
        "lootTable": [
          {
            "itemID": "iron_sword",
            "rarity": "common",
            "dropChance": 0.3
          }
        ]
      }
    }
  ]
}
```

**Response:**
```json
{
  "combatID": "combat_abc123",
  "result": "victory",
  "totalTurns": 12,
  "turns": [
    {
      "turnNumber": 1,
      "actor": "char_001",
      "actorName": "Thorne",
      "action": {
        "type": "skill",
        "skillID": "slash",
        "target": "goblin_scout_001_0"
      },
      "roll": {
        "hitChance": 0.87,
        "rolled": 0.45,
        "hit": true,
        "crit": false
      },
      "result": {
        "message": "Thorne hits Goblin Scout with Slash for 12 damage.",
        "damageDealt": 12,
        "targetHPBefore": 20,
        "targetHPAfter": 8,
        "success": true
      }
    }
  ],
  "participants": {
    "playerCharacters": [
      {
        "characterID": "char_001",
        "characterName": "Thorne",
        "maxHP": 150,
        "finalHP": 125
      }
    ],
    "enemies": [
      {
        "enemyID": "goblin_scout_001_0",
        "enemyName": "Goblin Scout",
        "maxHP": 20,
        "finalHP": 0
      }
    ]
  },
  "rewards": {
    "experienceGained": {
      "char_001": 350
    },
    "skillUsageIncremented": {},
    "lootDropped": [
      {
        "characterID": "char_001",
        "itemID": "iron_sword",
        "rarity": "common"
      }
    ]
  },
  "shouldPersist": true,
  "retreated": false
}
```

### Get Combat Log
```
GET /api/combat/:combatID
```

### Get Character Combat History
```
GET /api/combat/history/:characterID
```

### Apply Rewards
```
POST /api/combat/apply-rewards
Content-Type: application/json

{
  "characterID": "char_001",
  "experience": 350,
  "skills": [
    {
      "skillID": "slash",
      "skillXP": 150,
      "skillLevel": 2,
      "usageCount": 15
    }
  ],
  "loot": [
    {
      "itemID": "iron_sword"
    }
  ]
}
```

## Combat Log Structure

The combat log tracks every action in the fight:

- **Turn**: Each participant gets a turn in initiative order
- **Action**: What the actor did (skill, retreat, item use)
- **Roll**: Probability results (hit chance, rolled value, success)
- **Result**: Outcome message and damage dealt

## Retreat Mechanic

Players can retreat during combat:

```
Retreat Success Chance = max(0.3, (Ambition - Conviction) / 300)
```

- If retreat succeeds, combat ends and log is NOT saved
- If retreat fails, combat continues
- Using an escape consumable guarantees success

## Database

SQLite database stores:
- Combat logs (complete combat history)
- Character progression (level, XP)
- Skill progression (XP, levels, usage)
- Character inventory (items acquired)

Query the database with any SQLite client to inspect data.

## Future Enhancements

- [ ] Status effects (poison, stun, buffs)
- [ ] Cooldowns on skills
- [ ] Party formation and matching
- [ ] Asynchronous turn resolution
- [ ] Multi-wave encounters
- [ ] Boss-specific mechanics
- [ ] PvE leaderboards
