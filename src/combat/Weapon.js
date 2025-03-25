export class Weapon {
    constructor(config) {
        // Basic properties
        this.id = config.id;
        this.name = config.name;
        this.type = config.type; // 'primary' or 'secondary'
        
        // Combat stats
        this.damage = config.damage;
        this.range = config.range; // Maximum effective range in pixels
        this.accuracy = config.accuracy; // Lower is more accurate (in radians)
        this.fireRate = config.fireRate; // Rounds per second
        this.magazineSize = config.magazineSize; // Rounds per clip
        this.reserveAmmoMax = config.reserveAmmo; // Maximum reserve ammo
        this.reloadTime = config.reloadTime; // Time in ms to reload
        
        // Economic value
        this.cost = config.cost;
        
        // State properties
        this.currentAmmo = config.magazineSize;
        this.reserveAmmo = config.reserveAmmo;
        this.isReloading = false;
        this.lastFired = 0;
        
        // Visual properties (to be used later)
        this.bulletTrailColor = config.bulletTrailColor || '#fff';
        this.muzzleFlash = config.muzzleFlash || false;
    }
    
    // Calculate time between shots in milliseconds
    get fireInterval() {
        return 1000 / this.fireRate;
    }
    
    // Check if the weapon can fire
    canFire(now) {
        if (this.isReloading) return false;
        if (this.currentAmmo <= 0) return false;
        if (now - this.lastFired < this.fireInterval) return false;
        return true;
    }
    
    // Fire the weapon
    fire(now) {
        if (!this.canFire(now)) return false;
        
        this.currentAmmo--;
        this.lastFired = now;
        
        // Automatically reload when empty if there's reserve ammo
        if (this.currentAmmo === 0 && this.reserveAmmo > 0) {
            this.startReload();
        }
        
        return true;
    }
    
    // Start reloading process
    startReload() {
        if (this.isReloading || this.reserveAmmo <= 0 || this.currentAmmo === this.magazineSize) {
            return false;
        }
        
        this.isReloading = true;
        
        // Set timeout to finish reloading
        setTimeout(() => this.finishReload(), this.reloadTime);
        
        return true;
    }
    
    // Finish reloading and update ammo counts
    finishReload() {
        if (!this.isReloading) return;
        
        const neededAmmo = this.magazineSize - this.currentAmmo;
        const ammoToAdd = Math.min(neededAmmo, this.reserveAmmo);
        
        this.currentAmmo += ammoToAdd;
        this.reserveAmmo -= ammoToAdd;
        this.isReloading = false;
    }
    
    // Calculate damage based on distance
    calculateDamage(distance) {
        // Full damage up to 50% of effective range
        if (distance <= this.range * 0.5) return this.damage;
        
        // Linear falloff from 50% to 100% of range
        if (distance <= this.range) {
            const falloffFactor = 1 - ((distance - this.range * 0.5) / (this.range * 0.5));
            return Math.max(this.damage * falloffFactor, this.damage * 0.3); // Minimum 30% damage
        }
        
        // Beyond maximum range - minimum damage
        return this.damage * 0.3;
    }
    
    // Calculate bullet trajectory with accuracy variation
    calculateBulletTrajectory(direction) {
        // Add random deviation based on accuracy
        const deviation = (Math.random() - 0.5) * 2 * this.accuracy;
        return direction + deviation;
    }
    
    // Create a deep copy of this weapon
    clone() {
        return new Weapon({
            id: this.id,
            name: this.name,
            type: this.type,
            damage: this.damage,
            range: this.range,
            accuracy: this.accuracy,
            fireRate: this.fireRate,
            magazineSize: this.magazineSize,
            reserveAmmo: this.reserveAmmoMax,
            reloadTime: this.reloadTime,
            cost: this.cost,
            bulletTrailColor: this.bulletTrailColor,
            muzzleFlash: this.muzzleFlash
        });
    }
}

// Define weapon catalog
export const WeaponCatalog = {
    // Secondary weapons (pistols)
    STARTER_PISTOL: {
        id: 'STARTER_PISTOL',
        name: 'Rustler',
        type: 'secondary',
        damage: 20,
        range: 500,
        accuracy: 0.05,
        fireRate: 2.5,
        magazineSize: 12,
        reserveAmmo: 36,
        reloadTime: 1200,
        cost: 0,
        bulletTrailColor: '#ffe476'
    },
    HEAVY_PISTOL: {
        id: 'heavy_pistol',
        name: 'Hand Cannon',
        type: 'secondary',
        damage: 40,
        range: 400,
        accuracy: 0.07,
        fireRate: 1.5,
        magazineSize: 8,
        reserveAmmo: 24,
        reloadTime: 1400,
        cost: 500,
        bulletTrailColor: '#ff9a76'
    },
    QUICK_PISTOL: {
        id: 'quick_pistol',
        name: 'Bullet Bee',
        type: 'secondary',
        damage: 15,
        range: 350,
        accuracy: 0.06,
        fireRate: 5,
        magazineSize: 20,
        reserveAmmo: 60,
        reloadTime: 1000,
        cost: 400,
        bulletTrailColor: '#ffe476'
    },
    
    // Primary weapons - Rifles
    ASSAULT_RIFLE: {
        id: 'assault_rifle',
        name: 'Recoiler',
        type: 'primary',
        damage: 25,
        range: 800,
        accuracy: 0.04,
        fireRate: 8,
        magazineSize: 30,
        reserveAmmo: 90,
        reloadTime: 2000,
        cost: 2700,
        bulletTrailColor: '#76ff91'
    },
    SNIPER_RIFLE: {
        id: 'sniper_rifle',
        name: 'Long Goodbye',
        type: 'primary',
        damage: 100,
        range: 1500,
        accuracy: 0.01,
        fireRate: 0.8,
        magazineSize: 5,
        reserveAmmo: 15,
        reloadTime: 3000,
        cost: 4750,
        bulletTrailColor: '#767eff'
    },
    
    // Primary weapons - SMGs
    SMG: {
        id: 'smg',
        name: 'Buzzsaw',
        type: 'primary',
        damage: 15,
        range: 500,
        accuracy: 0.08,
        fireRate: 12,
        magazineSize: 35,
        reserveAmmo: 105,
        reloadTime: 1800,
        cost: 1500,
        bulletTrailColor: '#ffd876'
    },
    COMPACT_SMG: {
        id: 'compact_smg',
        name: 'Pocket Storm',
        type: 'primary',
        damage: 12,
        range: 400,
        accuracy: 0.09,
        fireRate: 14,
        magazineSize: 25,
        reserveAmmo: 75,
        reloadTime: 1500,
        cost: 1200,
        bulletTrailColor: '#ffd876'
    },
    
    // Primary weapons - Shotguns
    SHOTGUN: {
        id: 'shotgun',
        name: 'Roomsweeper',
        type: 'primary',
        damage: 25, // Per pellet, fires 8 pellets
        range: 300,
        accuracy: 0.15,
        fireRate: 1.2,
        magazineSize: 7,
        reserveAmmo: 21,
        reloadTime: 3500,
        cost: 2000,
        bulletTrailColor: '#ff7676',
        pelletCount: 8
    },
    COMBAT_SHOTGUN: {
        id: 'combat_shotgun',
        name: 'Quick Spread',
        type: 'primary',
        damage: 20, // Per pellet, fires 6 pellets
        range: 250,
        accuracy: 0.12,
        fireRate: 2,
        magazineSize: 8,
        reserveAmmo: 32,
        reloadTime: 2500,
        cost: 1800,
        bulletTrailColor: '#ff7676',
        pelletCount: 6
    },
    
    // Create an instance of a weapon from the catalog
    createWeapon: function(weaponId) {
        // Check if the ID exists directly
        if (this[weaponId]) {
            return new Weapon(this[weaponId]);
        }
        
        // Try with uppercase (in case we got lowercase from network)
        const upperCaseId = String(weaponId).toUpperCase();
        if (this[upperCaseId]) {
            return new Weapon(this[upperCaseId]);
        }
        
        // Handle special case for starter_pistol since it's used in code
        if (weaponId === 'starter_pistol') {
            return new Weapon(this.STARTER_PISTOL);
        }
        
        console.error(`Weapon with ID ${weaponId} not found!`);
        
        // Return a basic pistol as fallback instead of null
        return new Weapon(this.STARTER_PISTOL);
    },
    
    // Get all weapons of a specific type
    getWeaponsByType: function(type) {
        return Object.keys(this)
            .filter(key => typeof this[key] === 'object' && this[key].type === type)
            .map(key => this[key]);
    },
    
    // Get all available weapons
    getAllWeapons: function() {
        return Object.keys(this)
            .filter(key => typeof this[key] === 'object')
            .map(key => this[key]);
    }
};

// Make classes available globally
window.Weapon = Weapon;
window.WeaponCatalog = WeaponCatalog; 