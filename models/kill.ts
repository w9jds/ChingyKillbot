export interface KillInfo {
    package: KillPackage;
}

export interface KillPackage {
    killID: number;
    killmail: KillMail;
    zkb: ZKillboard;
}

export interface KillMail {
    killmail_id: number;
    killmail_time: string;
    victim: Victim;
    attackers: Attacker[];
    solar_system_id: number;
}

export interface Attacker {
    security_status?: number;
    final_blow?: boolean;
    damage_done?: number;
    character_id?: number;
    corporation_id?: number;
    alliance_id?: number;
    ship_type_id?: number;
    weapon_type_id?: number;
}

export interface Victim {
    damage_taken: number;
    ship_type_id: number;
    character_id: number;
    corporation_id: number;
    alliance_id?: number;
    faction_id: number;
    items?: any[];
    position?: any;
}

export interface ZKillboard {
    locationID: number;
    hash: string;
    fittedValue: number;
    totalValue: number;
    points: number;
    npc: boolean;
    solor: boolean;
    awok: boolean;
    href: string;
}
