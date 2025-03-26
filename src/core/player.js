export class Player {
    constructor(x = 100, y = 100, map = null, team = null) {
        this.id = Math.random().toString(36).substr(2, 9);
        this.size = 20; // Player size in pixels
        this.speed = 200; // Speed in units per second (increased from 2 to account for deltaTime)
        this.direction = 0; // Base direction
        this.team = team; // 'red', 'blue', or null for spectator/neutral
        
        // Game-related properties
        this.health = 100;
        this.money = 800; // Starting money
        this.equipment = []; // Initialize as empty array
        this.activeWeaponIndex = 0;
        this.isAlive = true;
        this.role = team === 'red' ? 'attacker' : 'defender';
        this.hasBomb = false; // Add bomb carrying status
        
        // Aiming properties - make sure this is always initialized
        this.aim = {
            angle: 0, // Aim direction in radians
            x: 0,     // Target x position (mouse position)
            y: 0      // Target y position (mouse position)
        };
        
        // Round-specific properties
        this.isPlanting = false;
        this.isDefusing = false;
        this.plantingProgress = 0;
        this.defusingProgress = 0;

        // If map is provided, find a safe spawn point
        if (map) {
            const safePosition = this.findSafeSpawnPosition(map);
            this.x = safePosition.x;
            this.y = safePosition.y;
        } else {
            this.x = x;
            this.y = y;
        }
    }

    findSafeSpawnPosition(map) {
        console.log(`Finding safe spawn position for player. Team: ${this.team}`);
        
        // If player has a team, use team spawn point
        if (this.team && (this.team === 'red' || this.team === 'blue')) {
            const spawnPoint = map.getSpawnPoint(this.team);
            console.log(`Initial team spawn point:`, spawnPoint);
            
            // Check if spawn point is safe
            if (this.canMove(spawnPoint.x, spawnPoint.y, map)) {
                console.log(`Initial spawn point is safe, using it:`, spawnPoint);
                return spawnPoint;
            }
            
            console.log(`Initial spawn point wasn't safe, trying spiral pattern...`);
            // If not safe, try nearby positions in a spiral pattern
            const maxRadius = 5;
            for (let radius = 1; radius <= maxRadius; radius++) {
                for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 8) {
                    const x = spawnPoint.x + Math.cos(angle) * (radius * map.tileSize);
                    const y = spawnPoint.y + Math.sin(angle) * (radius * map.tileSize);
                    
                    if (this.canMove(x, y, map)) {
                        const safeSpawn = { x, y };
                        console.log(`Found safe spawn point in spiral:`, safeSpawn);
                        return safeSpawn;
                    }
                }
            }
            console.log(`No safe position found in spiral pattern`);
        }

        console.log(`Falling back to random position search...`);
        // Fallback to random position if team spawn isn't available
        const maxAttempts = 100; // Prevent infinite loops
        let attempts = 0;

        while (attempts < maxAttempts) {
            // Generate random position within map bounds
            const x = Math.floor(Math.random() * (map.tiles[0].length - 2) + 1) * map.tileSize;
            const y = Math.floor(Math.random() * (map.tiles.length - 2) + 1) * map.tileSize;

            // Check if position is safe
            if (this.canMove(x, y, map)) {
                return { x, y };
            }
            attempts++;
        }

        // Fallback: scan map systematically for first safe position
        for (let y = 1; y < map.tiles.length - 1; y++) {
            for (let x = 1; x < map.tiles[0].length - 1; x++) {
                const worldX = x * map.tileSize;
                const worldY = y * map.tileSize;
                if (this.canMove(worldX, worldY, map)) {
                    return { x: worldX, y: worldY };
                }
            }
        }

        // If all else fails, return center of map
        return {
            x: (map.tiles[0].length / 2) * map.tileSize,
            y: (map.tiles.length / 2) * map.tileSize
        };
    }

    update(keys, map, deltaTime = 1/60) {
        // Skip update if player is dead
        if (!this.isAlive) return;
        
        let newX = this.x;
        let newY = this.y;

        // Apply deltaTime to movement
        const frameSpeed = this.speed * deltaTime;

        if (keys.ArrowUp || keys.w) newY -= frameSpeed;
        if (keys.ArrowDown || keys.s) newY += frameSpeed;
        if (keys.ArrowLeft || keys.a) newX -= frameSpeed;
        if (keys.ArrowRight || keys.d) newX += frameSpeed;

        // Check collision before applying movement
        if (this.canMove(newX, this.y, map)) this.x = newX;
        if (this.canMove(this.x, newY, map)) this.y = newY;
    }

    canMove(newX, newY, map) {
        // Check corners of player hitbox
        const points = [
            { x: newX - this.size/2, y: newY - this.size/2 },
            { x: newX + this.size/2, y: newY - this.size/2 },
            { x: newX - this.size/2, y: newY + this.size/2 },
            { x: newX + this.size/2, y: newY + this.size/2 }
        ];

        return points.every(point => map.isWalkable(point.x, point.y));
    }

    // Take damage
    takeDamage(amount) {
        this.health -= amount;
        
        if (this.health <= 0) {
            this.health = 0;
            this.die();
        }
        
        return this.health;
    }
    
    // Player dies
    die() {
        this.isAlive = false;
        this.health = 0;
        
        // Stop any bomb interaction
        if (this.isPlanting || this.isDefusing) {
            if (window.game) {
                if (this.isPlanting) window.game.stopPlantingBomb();
                if (this.isDefusing) window.game.stopDefusingBomb();
            }
        }
        
        // Drop bomb if carrying
        if (this.hasBomb && window.game) {
            window.game.dropBomb(this);
        }
        
        // If this is a client death, ensure it's synchronized
        if (window.game && window.game.combatManager) {
            window.game.combatManager.syncHealth(this.id, 0);
        }
    }
    
    // Reset player for new round - modified to preserve weapons
    resetForNewRound(map) {
        this.health = 100;
        this.isAlive = true;
        this.isPlanting = false;
        this.isDefusing = false;
        this.plantingProgress = 0;
        this.defusingProgress = 0;
        this.hasBomb = false;
        
        // Note: We intentionally do NOT reset equipment or money here
        // to preserve weapons between rounds
        
        // Reset position to spawn point
        if (map) {
            try {
                const safePosition = this.findSafeSpawnPosition(map);
                if (safePosition && typeof safePosition.x === 'number' && typeof safePosition.y === 'number') {
                    this.x = safePosition.x;
                    this.y = safePosition.y;
                }
            } catch (error) {
                console.error('Error finding safe position:', error);
                // Use default spawn if there's an error
                if (this.team === 'red') {
                    this.x = 100;
                    this.y = 100;
                } else {
                    this.x = 300;
                    this.y = 300;
                }
            }
        }
    }

    updateAim(mouseX, mouseY, camera) {
        // Convert screen coordinates to world coordinates
        const worldX = mouseX + camera.x;
        const worldY = mouseY + camera.y;
        
        // Update aim target
        this.aim.x = worldX;
        this.aim.y = worldY;
        
        // Calculate angle between player and mouse
        this.aim.angle = Math.atan2(worldY - this.y, worldX - this.x);
        
        // Also update base direction for other uses
        this.direction = this.aim.angle;
        
        // Return true if the aim angle changed significantly (for optimization)
        return true;
    }

    normalizeForSync() {
        // Create a safe copy of equipment without circular references
        const safeEquipment = [];
        
        if (this.equipment && Array.isArray(this.equipment)) {
            for (const item of this.equipment) {
                if (item) {
                    // Only include essential weapon properties
                    safeEquipment.push({
                        id: item.id,
                        currentAmmo: item.currentAmmo,
                        reserveAmmo: item.reserveAmmo,
                        // Include only essential properties needed for sync
                        type: item.type,
                        isReloading: item.isReloading,
                        lastFired: item.lastFired
                    });
                }
            }
        }
        
        // Return a clean object with only the properties needed for network sync
        return {
            id: this.id,
            x: this.x,
            y: this.y,
            direction: this.direction,
            health: this.health,
            money: this.money,
            team: this.team,
            isAlive: this.isAlive,
            role: this.role,
            activeWeaponIndex: this.activeWeaponIndex,
            equipment: safeEquipment,
            hasBomb: this.hasBomb,
            isPlanting: this.isPlanting,
            isDefusing: this.isDefusing,
            plantingProgress: this.plantingProgress,
            defusingProgress: this.defusingProgress,
            aim: {
                angle: this.aim.angle,
                x: this.aim.x,
                y: this.aim.y
            }
        };
    }
}

// Make Player globally available
window.Player = Player; 
