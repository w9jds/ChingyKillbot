import * as dataset from './constants/systems.json';
import * as moment from 'moment';

import {database} from 'firebase-admin';
import {getNames} from './lib/esi';
import {Attachment} from './models/attachment';
import {KillInfo, KillPackage} from './models/kill';
import { Embed } from './models/embed';

export default class Deaths {
    private integrations: Map<string, database.DataSnapshot> = new Map();
    private sources: object = {};
    private retries = 0;
    public lastRun: moment.Moment;

    constructor(private firebase: database.Database) {
        firebase.ref('integrations')
            .orderByChild('type')
            .equalTo('deaths')
            .on('child_added', this.setIntegration);

        firebase.ref('integrations')
            .orderByChild('type')
            .equalTo('deaths')
            .on('child_changed', this.setIntegration);

        firebase.ref('integrations')
            .orderByChild('type')
            .equalTo('deaths')
            .on('child_removed', this.removeIntegration);
    }

    private setIntegration = (snapshot: database.DataSnapshot): void => {
        let integrationId = snapshot.key;

        if (!this.integrations.has(integrationId)) {
            this.integrations.set(integrationId, snapshot);

            this.firebase.ref(`maps/${snapshot.child('map').val()}/systems`)
                .on('child_added', (snapshot: database.DataSnapshot): void => {
                    if (!this.sources[integrationId]) {
                        this.sources[integrationId] = new Map();
                    }

                    this.sources[integrationId].set(snapshot.key, snapshot);
                });

            this.firebase.ref(`maps/${snapshot.child('map').val()}/systems`)
                .on('child_removed', (snapshot: database.DataSnapshot): void => {
                    if (this.sources[integrationId] && this.sources[integrationId].has(snapshot.key)) {
                        this.sources[integrationId].delete(snapshot.key);
                    }
                });
        }
    }

    private removeIntegration = (snapshot: database.DataSnapshot): void => {
        if (this.integrations.has(snapshot.key)) {
            this.integrations.delete(snapshot.key);

            this.firebase.ref(`maps/${snapshot.child('map').val()}/systems`)
                .off('child_added')
            this.firebase.ref(`maps/${snapshot.child('map').val()}/systems`)
                .off('child_removed')
        }
    }

    public start = async (startTime: moment.Moment) => {
        this.lastRun = startTime;
        try {
            let killmail: KillInfo = await this.getKill() as KillInfo;

            if (killmail && killmail.package) {
                let systemId = killmail.package.killmail.solar_system_id.toString();
                let promises = [];

                Object.keys(this.sources).forEach(integrationId => {
                    let integration = this.integrations.get(integrationId);
                    let systems = this.sources[integrationId];

                    if (integration.child('involved').val() === true) {
                        if (this.isAttacker(integrationId, killmail.package) || this.isVictim(integrationId, killmail.package)) {
                            promises.push(
                                this.sendPostKillmail(killmail.package, this.integrations.get(integrationId))
                            );
                        }
                    }
                    if (integration.child('involved').val() === false) {
                        if (!this.isAttacker(integrationId, killmail.package) && !this.isVictim(integrationId, killmail.package) && systems.has(systemId)) {
                            promises.push(
                                this.sendPostKillmail(killmail.package, this.integrations.get(integrationId))
                            );
                        }
                    }
                });

                if (promises.length > 0) {
                    await Promise.all(promises);
                    this.start(moment());
                }
                else {
                    this.start(moment());
                }
            }
            else {
                this.startDelayed(15000);
            }
        }
        catch(error) {
            console.error(error);
            this.startDelayed(15000);
        }
    }

    private isAttacker = (integrationId: string, killInfo: KillPackage): boolean => {
        let integration = this.integrations.get(integrationId);
        let arePresent = false;

        killInfo.killmail.attackers.forEach(attacker => {
            if (attacker.corporation_id && integration.child('corpId').val() == attacker.corporation_id) {
                arePresent = true;
            }
            if (attacker.alliance_id && integration.child('allianceId').val() == attacker.alliance_id) {
                arePresent = true;
            }
        });

        return arePresent;
    }

    private isVictim = (integrationId: string, killInfo: KillPackage): boolean => {
        let integration = this.integrations.get(integrationId);
        let arePresent = false;

        if (killInfo.killmail.victim.alliance_id && integration.child('allianceId').val() == killInfo.killmail.victim.alliance_id) {
            arePresent = true;
        }
        if (integration.child('corpId').val() == killInfo.killmail.victim.corporation_id) {
            arePresent = true;
        }

        return arePresent;
    }

    private startDelayed = (delay) => setTimeout(() => { this.start(moment()) }, delay);

    private getKill = async (): Promise<any> => {
        let response = await fetch('https://redisq.zkillboard.com/listen.php', {
            method: 'GET'
        });

        if (response.status == 200) {
            return response.json();
        }

        this.startDelayed(10000);
    }

    private sendPostKillmail = async (killmail: KillPackage, integration: database.DataSnapshot): Promise<any> => {
        let attachment = await this.buildAttachment(killmail, integration);
        let response = await fetch(integration.child('webhook').val(), {
            method: 'POST',
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(attachment)
        });

        if (response.status !== 204) {
            console.log(JSON.stringify(attachment));

            console.error(response);
            console.error(await response.json());
        }
    }

    private getNamesFallback = async (retry: number, killInfo: KillPackage, integration: database.DataSnapshot) => {
        let output = await this.getKillNames(killInfo, 
            parseInt(integration.child('corpId').val()),
            parseInt(integration.child('allianceId').val())
        );
        
        if (!output.names || output.names.error) {
            if (retry == 3) {
                throw output.names;
            }
            retry += 1;
            return await this.getNamesFallback(retry, killInfo, integration);
        }

        return output;
    }

    private getKillNames = async (killInfo: KillPackage, corpId: number, allianceId: number) => {
        let finalBlow, allied = [], dataIds = [];

        if (killInfo.killmail.victim.character_id) {
            dataIds.push(killInfo.killmail.victim.character_id);
        }
        if (killInfo.killmail.victim.corporation_id) {
            dataIds.push(killInfo.killmail.victim.corporation_id);
        }
        if (killInfo.killmail.victim.ship_type_id) {
            dataIds.push(killInfo.killmail.victim.ship_type_id);
        }
        if (killInfo.killmail.solar_system_id) {
            dataIds.push(killInfo.killmail.solar_system_id);
        }
        if (killInfo.killmail.victim.alliance_id) {
            dataIds.push(killInfo.killmail.victim.alliance_id);
        }

        killInfo.killmail.attackers.forEach(attacker => {
            if (attacker.final_blow) {
                finalBlow = {
                    characterId: attacker.character_id,
                    corporationId: attacker.corporation_id,
                    allianceId: attacker.alliance_id ? attacker.alliance_id : null,
                    shipTypeId: attacker.ship_type_id
                };
            }

            if (attacker.alliance_id && attacker.alliance_id == allianceId) {
                allied.push(attacker.character_id);
            } 
            else if (attacker.corporation_id && attacker.corporation_id == corpId) {
                allied.push(attacker.character_id);
            }

            if (attacker.character_id && dataIds.indexOf(attacker.character_id) == -1) {
                dataIds.push(attacker.character_id);
            }
            if (attacker.corporation_id && dataIds.indexOf(attacker.corporation_id) == -1) {
                dataIds.push(attacker.corporation_id);
            }
            if (attacker.ship_type_id && dataIds.indexOf(attacker.ship_type_id) == -1) {
                dataIds.push(attacker.ship_type_id);
            }
        });

        let names = await getNames(dataIds);
        return { finalBlow, names, allied };
    }

    private buildAttachment = async (killInfo: KillPackage, integration: database.DataSnapshot): Promise<any> => {
        let attacker = this.isAttacker(integration.key, killInfo);
        let victim = this.isVictim(integration.key, killInfo);
        let output = await this.getNamesFallback(0, killInfo, integration);
        let names = output.names.reduce((result, current) => {
            result[current.id] = current;
            return result;
        }, {});

        let systemName = names[killInfo.killmail.solar_system_id].name;
        let killingPilot = names[output.finalBlow.characterId] ? 
            names[output.finalBlow.characterId].name + ' (' + names[output.finalBlow.corporationId].name + ')' :
            names[output.finalBlow.shipTypeId] ? names[output.finalBlow.shipTypeId].name :  'Unknown';
        
        if (!attacker && !victim) {
            let systemData = dataset[systemName];
            if (systemData.wormholeClassID == 7 || systemData.wormholeClassID == 8 || systemData.wormholeClassID == 9) {
                throw `Kill ${killInfo.killmail.killmail_id} took place in ${systemName}`;
            }
        }

        let kill: Embed = {
            title: `${killingPilot} killed ${names[killInfo.killmail.victim.character_id].name} (${names[killInfo.killmail.victim.corporation_id].name})`,
            color: attacker ? 8103679 : victim ? 16711680 : 6710886,
            url: `https://zkillboard.com/kill/${killInfo.killID}`,
            timestamp: moment(killInfo.killmail.killmail_time).toISOString(),
            thumbnail: {
                url: `https://imageserver.eveonline.com/Render/${killInfo.killmail.victim.ship_type_id}_128.png`
            },
            fields:[
                {
                    name: 'Ship',
                    value: `[${names[killInfo.killmail.victim.ship_type_id].name}](https://zkillboard.com/ship/${killInfo.killmail.victim.ship_type_id}/)`,
                    inline: true
                },
                {
                    name: 'System',
                    value: `[${systemName}](https://zkillboard.com/system/${killInfo.killmail.solar_system_id})`,
                    inline: true
                },
                {
                    name: 'Pilots Involved',
                    value: killInfo.killmail.attackers ? killInfo.killmail.attackers.length.toString() : '0',
                    inline: true
                },
                {
                    name: 'Value',
                    value: `${killInfo.zkb.totalValue.toLocaleString('en')} ISK`,
                    inline: true
                }
            ]
        };

        if (output && output.allied && output.allied.length > 0) {
            let alliedPilots = output.allied
                .filter(id => names[id] ? true : false)
                .map(id =>`[${names[id].name}](${`https://zkillboard.com/character/${id}/`})`);

            kill.fields.push({
                name: 'Friendly Pilots Involved',
                value: alliedPilots.join(', ')
            });
        }

        return {
            content: killInfo.zkb.totalValue >= 3000000000 ? 
                `WOAH! Look at that kill <@${integration.child('channelId').val()}>` : '',
            embeds: [kill]
        };
    }
}
