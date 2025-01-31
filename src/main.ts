/*
 * Created with @iobroker/create-adapter v2.5.0
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
import * as utils from '@iobroker/adapter-core';
import * as fs from 'fs';
import * as dp from './lib/datapoints';
import * as siamanager from './lib/sia';
import * as tools from './lib/tools';

class sia extends utils.Adapter {
    private onlineCheckAvailable: boolean;
    private onlineCheckTimeout: ReturnType<typeof this.setTimeout>;
    private siaclient: any;

    public constructor(options: Partial<utils.AdapterOptions> = {}) {
        super({
            ...options,
            name: 'sia',
        });

        this.onlineCheckAvailable = false;
        this.onlineCheckTimeout = undefined;
        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        this.on('objectChange', this.onObjectChange.bind(this));
        this.on('message', this.onMessage.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    private async onReady(): Promise<void> {
        // await tools.wait(10);
        await this.setState('info.connection', { val: true, ack: true });
        this.subscribeStates('*');
        this.log.info(`Starting Adapter ${this.namespace} in version ${this.version}`);
        // delete not used / missing object in configuration
        await this.deleteObjects();
        // add object from configuration.
        await this.createObjects();
        const accounts: siamanager.ifaccount[] = this.config.keys as any;
        try {
            this.siaclient = new siamanager.sia({
                timeout: this.config.timeout,
                host: this.config.bind,
                port: this.config.port,
                logger: this.log,
            });
            this.siaclient.setAccounts(accounts);
            this.siaclient.serverStartTCP();
            this.siaclient.serverStartUDP();
        } catch (err) {
            this.log.error(`Error (1): ${tools.getErrorMessage(err)}`);
        }
        this.siaclient.on('sia', async (sia: siamanager.ifsia, err: any) => {
            if (sia) {
                try {
                    await this.setStatesSIA(sia);
                } catch (err) {
                    this.log.error(`Error (2): ${tools.getErrorMessage(err)}`);
                }
            }
            if (err) {
                this.log.error(`Error (3): ${err}`);
            }
        });
        this.siaclient.on('data', (data: any) => {
            if (data) {
                this.log.debug(`Data: ${JSON.stringify(data)}`);
                if (this.config.save) {
                    const filename = `${tools.addSlashToPath(this.config.path)}sia_msg_${Date.now()}.txt`;
                    try {
                        if (!fs.existsSync(this.config.path)) {
                            this.log.info(`Creating path ${this.config.path}`);
                            fs.mkdirSync(this.config.path, { recursive: true });
                        }
                        fs.writeFileSync(filename, data, 'binary');
                        if (fs.existsSync(filename)) {
                            this.log.info(`Save SIA message to ${filename}`);
                        } else {
                            this.log.error(`Could not write SIA message to file ${filename}.`);
                        }
                    } catch (err) {
                        this.log.error(
                            `Could not write SIA message to file ${filename}. ${tools.getErrorMessage(err)}`,
                        );
                    }
                }
            }
        });
    }

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     *
     * @param callback calback function
     */
    private async onUnload(callback: () => void): Promise<void> {
        try {
            this.log.info(`Stopping sia processes, please wait!`);
            await this.setState('info.connection', { val: false, ack: true });
            callback();
        } catch (err) {
            this.log.error(`Error: ${tools.getErrorMessage(err)}`);
            callback();
        }
    }

    /**
     * Is called if a subscribed object changes
     *
     * @param id id of the object
     * @param obj object
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private async onObjectChange(id: string, obj: ioBroker.Object | null | undefined): Promise<void> {
        // const sia = await Lupus.getInstance(this);
        // await sia.onObjectChange(id, obj);
    }

    /**
     * Is called if a subscribed state changes
     *
     * @param id id of state
     * @param state state
     */
    private onStateChange(id: string, state: ioBroker.State | null | undefined): void {
        if (state && !state.ack) {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const stateId = id.replace(`${this.namespace}.`, '');
        }
    }

    /**
     * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
     * Using this method requires "common.messagebox" property to be set to true in io-package.json
     *
     * @param obj object
     */
    private onMessage(obj: ioBroker.Message): void {
        if (typeof obj === 'object' && obj.message) {
            switch (obj.command) {
                case 'msg': {
                    break;
                }
                default:
                    this.log.error(`Unknown comannd ${obj.command} in onMessage`);
                    break;
            }
        }
    }

    /**
     * convert subcriber to ID for using as channel name. Special characters and spaces are deleted.
     *
     * @param accountnumber - accountnumber
     */
    private getAcountNumberID(accountnumber: string): string {
        const id = accountnumber.replace(/[.\s]+/g, '_');
        return id;
    }

    public async deleteObjects(): Promise<void> {
        try {
            await this.getAdapterObjects((obj: any) => {
                for (const idx in obj) {
                    if (!idx.startsWith(`${this.namespace}.accounts.`) || obj[idx].type !== 'channel') {
                        continue;
                    }
                    let found = false;
                    for (const key of this.config.keys as any) {
                        const idkey = `${this.namespace}.accounts.${this.getAcountNumberID(key.accountnumber)}`;
                        if (idx === idkey) {
                            found = true;
                            break;
                        }
                    }
                    if (found === false) {
                        const id = idx.replace('${this.adapter.namespace}.', '');
                        this.log.debug(`Deleting object ${idx} recursive`);
                        this.delObject(id, { recursive: true });
                    }
                }
            });
        } catch (err) {
            throw new Error(`Could not delte objects ${tools.getErrorMessage(err)}`);
        }
    }

    /**
     * read configuration, and create for all subscribers a channel and states
     */
    public async createObjects(): Promise<void> {
        for (const key of this.config.keys as any) {
            const id = `accounts.${this.getAcountNumberID(key.accountnumber)}`;
            const obj = dp.dpSIA || {};
            const ret = await this.setObjectNotExists(id, {
                type: 'channel',
                common: {
                    name: key.accountnumber,
                },
                native: {},
            });
            if (ret) {
                this.log.debug(`Create object ${id}`);
            }
            for (const prop in obj) {
                const sid = `${id}.${prop}`;
                const parameter = JSON.parse(JSON.stringify(obj[prop]));
                parameter.name = `${key.accountnumber} - ${parameter.name}`;
                const ret = await this.setObjectNotExists(sid, {
                    type: 'state',
                    common: parameter,
                    native: {},
                });
                if (ret) {
                    this.log.debug(`Create object ${sid}`);
                }
            }
        }
    }

    /**
     * convert timestring from format HH:MM:SS,MM-DD-YYYY to Date()
     *
     * @param timeString in format HH:MM:SS,MM-DD-YYYY
     * @returns Date
     */
    private convertToUnixTime(timeString: string): Date {
        // Zerlege den String in seine Bestandteile
        const regex = /(\d{2}):(\d{2}):(\d{2}),(\d{2})-(\d{2})-(\d{4})/;
        const match = timeString.match(regex);
        if (!match) {
            throw new Error(`Ungültiges Zeitformat`);
        }
        try {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const [_, hours, minutes, seconds, month, day, year] = match.map(Number);
            // Erstelle ein Date-Objekt (Monate in JS sind 0-basiert, daher -1)
            const date = new Date(year, month - 1, day, hours, minutes, seconds);
            // Unix-Timestamp in Sekunden zurückgeben
            // return Math.floor(date.getTime() / 1000);
            return date;
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (err) {
            throw new Error(`Ungültiges Zeitformat ${timeString}`);
        }
    }

    /**
     * Set state for SIA message
     *
     * @param sia - SIA Message
     */
    private async setStatesSIA(sia: siamanager.ifsia): Promise<void> {
        const obj = dp.dpSIA || {};
        let val: any = undefined;
        if (!sia?.act) {
            throw new Error(`Accountnumber is missing in SIA message.`);
        }
        this.log.debug(`setStatesSIA for ${sia.act} : ${JSON.stringify(sia)}`);
        const id = `accounts.${this.getAcountNumberID(sia.act)}`;
        if (!(await this.objectExists(id))) {
            throw new Error(`Object ${id} for accountnumber ${sia.act} is missing in SIA message.`);
        }
        for (const prop in obj) {
            const sid = `${id}.${prop}`;
            switch (prop) {
                case 'id':
                    val = sia.id;
                    break;
                case 'sequence':
                    val = sia.seq;
                    break;
                case 'rpref':
                    val = sia.rpref;
                    break;
                case 'lpref':
                    val = sia.lpref;
                    break;
                case 'accountnumber':
                    val = sia.act;
                    break;
                case 'msgdata':
                    val = sia.data_message;
                    break;
                case 'extdata':
                    val = sia.data_extended;
                    break;
                case 'ts':
                    try {
                        val = this.convertToUnixTime(sia.ts).toString();
                        // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    } catch (err) {
                        val = sia.ts;
                    }
                    break;
                case 'crc':
                    val = sia.crc;
                    break;
                case 'len':
                    val = sia.len;
                    break;
                default:
                    val = undefined;
            }
            this.log.debug(`ackSIA : set state for id ${sid} with value ${val}`);
            await this.setState(sid, {
                val: val,
                ack: true,
            });
        }
    }
}

if (require.main !== module) {
    // Export the constructor in compact mode
    module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new sia(options);
} else {
    // otherwise start the instance directly
    (() => new sia())();
}
