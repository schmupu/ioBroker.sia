import crypto from 'crypto';
import dgram from 'dgram';
import { EventEmitter } from 'events';
import net from 'net';
import * as tools from './tools';

/**
 * Interface account
 */
export interface ifaccount {
    /** accountnumber */
    accountnumber: string;
    /** aes password */
    password: any;
    /** aes paswoord in hex ascii format */
    hex: boolean;
    /** use aes pasword */
    aes: boolean;
}

/**
 * SIA Message
 */
export interface ifsia {
    /** ID Token (required) */
    id: string;
    /** Sequence: 4 ASCII digits (required) */
    seq: string;
    /** Receiver Number: 1-6 HEX ASCII digit (optional) */
    rpref?: string;
    /** Account Prefix: 1-6 HEX ASCII digits (required) */
    lpref: string;
    /** Account Number: 3-16 HEX ASCII characters (required) */
    act: string;
    /** Message  ASCII data consistent with ID token (required) */
    data_message: string;
    /** Exteded message ASCII data (optional) */
    data_extended?: string;
    /** timestamp ASCII in format: HH:MM:SS,MM-DD-YYYY (optional) */
    ts?: string;
    /** CRC - 4 HEX ASCII digits (required) */
    crc: string;
    /** Length - 4 HEX ASCII digits (required) */
    len: string;

    /** Data message: Buffer or String (required) */
    data: Buffer;
    /** calculated CRC - 4 HEX ASCII digits (optional) */
    calc_crc: string;
    /** calculated Length - 4 HEX ASCII digits (optional) */
    calc_len: string;
    /** Forma bin or hex (optional) */
    crcformat: string;
    /** message (optional) */
    str: string;
}

/**
 * SIA Class
 */
export class sia extends EventEmitter {
    private timeout: number;
    private accounts: ifaccount[];
    private port: number;
    private host: string;
    private logger: any;
    private serverudp: dgram.Socket;
    private servertcp: net.Server;
    private sockend: boolean;

    /**
     * Constructor
     *
     * @param parameter parameter
     * @param parameter.timeout timeout
     * @param parameter.host bind host
     * @param parameter.port bind port
     * @param parameter.logger logger
     * @param parameter.sockend close connection
     */
    constructor(parameter: { timeout?: number; host: string; port: number; logger?: any; sockend?: boolean }) {
        super();
        this.timeout = parameter.timeout === undefined ? 10 : parameter.timeout;
        this.sockend = parameter.sockend ? true : false;
        this.host = parameter.host;
        this.port = parameter.port;
        this.accounts = [];
        if (parameter.logger) {
            this.logger = {
                info: parameter.logger.info ? parameter.logger.info : parameter.logger,
                debug: parameter.logger.debug ? parameter.logger.debug : parameter.logger,
                error: parameter.logger.error ? parameter.logger.error : parameter.logger,
            };
        }
        this.serverudp = dgram.createSocket('udp4');
        this.servertcp = net.createServer();
    }

    /**
     * Set accounts
     *
     * @param accounts accounts
     */
    public setAccounts(accounts: ifaccount[]): void {
        this.accounts = accounts;
        for (const account of this.accounts) {
            if (!tools.isHexString(account.accountnumber)) {
                throw new Error(
                    `Accountnumber ${account.accountnumber} not allowed. Use only following characters 0-9 and A-F`,
                );
            }
            if (account.accountnumber.length < 3 || account.accountnumber.length > 16) {
                throw new Error(`Accountnumber ${account.accountnumber} only 3 to 16 characters allowed.`);
            }
            if (account.aes === true) {
                if (account.hex === true) {
                    account.password = Buffer.from(account.password, 'hex');
                }
                const len = account.password.length;
                // Password for AES is not allowed to be longer than 16, 24 and 32 characters
                if (len !== 16 && len !== 24 && len !== 32) {
                    throw new Error(
                        `Password for accountnumber ${account.accountnumber} must be 16, 24 or 32 Byte or 32, 48 or 64 Hex long`,
                    );
                }
            }
        }
        if (this.accounts.length === 0) {
            throw new Error(`Accounts are missing!`);
        }
    }

    /**
     * convert ASCII Text -> BYTES
     *
     * @param text string in ASCII format
     */
    private getBytes(text: string): any {
        const bytes = [];
        for (let i = 0; i < text.length; i++) {
            const charCode = text.charCodeAt(i);
            const cLen = Math.ceil(Math.log(charCode) / Math.log(256));
            for (let j = 0; j < cLen; j++) {
                bytes.push((charCode << (j * 8)) & 0xff);
            }
        }
        return bytes;
    }

    /**
     * Padding  /  str = customPadding(str, 16, 0x0, "hex"); // magic happens here
     *
     * @param str -
     * @param bytelen -
     * @param padder -
     * @param format -
     */
    private customPadding(str: string, bytelen: number, padder: any, format: any): string {
        const blockSize = bytelen * 16;
        str = Buffer.from(str, 'utf8').toString(format);
        //1 char = 8bytes
        const bitLength = str.length * 8;
        if (bitLength < blockSize) {
            for (let i = bitLength; i < blockSize; i += 8) {
                str += padder;
            }
        } else if (bitLength > blockSize) {
            while ((str.length * 8) % blockSize != 0) {
                str += padder;
            }
        }
        return Buffer.from(str, format).toString('utf8');
    }

    /**
     *  Encrypt / Input: ASCII , Output: HEX
     *
     * @param password - key / password for decrypting message
     * @param decrypted - messages for encrypting
     */
    private encrypt_hex(password: string, decrypted: any): string {
        try {
            const iv = Buffer.alloc(16);
            iv.fill(0);
            let aes;
            switch (password.length) {
                case 16:
                    aes = 'aes-128-cbc';
                    break;
                case 24:
                    aes = 'aes-192-cbc';
                    break;
                case 32:
                    aes = 'aes-256-cbc';
                    break;
                default:
                    throw new Error(`Could not encrypt to hex. Wrong password length.`);
            }
            // Creating Cipheriv with its parameter
            const cipher = crypto.createCipheriv(aes, password, iv);
            // cipher.setAutoPadding(false);
            let encrypt = cipher.update(decrypted);
            encrypt = Buffer.concat([encrypt, cipher.final()]);
            return encrypt.toString('hex');
        } catch (err) {
            throw new Error(`Could not encrypt message`, { cause: err });
        }
    }

    /**
     * Decrypt messages
     *
     * @param password - key / password for decrypting message
     * @param encrypted encrypted password
     * @returns decrypted messsag in hex format
     */
    private decrypt_hex(password: string, encrypted: any): string {
        try {
            const iv = Buffer.alloc(16);
            iv.fill(0);
            let aes;
            //  password = customPadding(password, 24, 0x0, "hex"); // magic happens here
            switch (password.length) {
                case 16:
                    aes = 'aes-128-cbc';
                    break;
                case 24:
                    aes = 'aes-192-cbc';
                    break;
                case 32:
                    aes = 'aes-256-cbc';
                    break;
                default:
                    throw new Error(`Could not decrypt from hex. Wrong password length.`);
            }
            const decipher = crypto.createDecipheriv(aes, password, iv);
            decipher.setAutoPadding(false);
            let decrypt = decipher.update(encrypted, 'hex', 'utf-8');
            decrypt += decipher.final('utf-8');
            return decrypt;
        } catch (err) {
            throw new Error(`Could not decrypt message`, { cause: err });
        }
    }

    /**
     * get timestamp in GMT in following format <HH:MM:SS,MM-DD-YYYY>
     *
     * @returns timestamp as strng
     */
    private getSIATimestampFromUTCDateNow(): string {
        const date = new Date();
        const hours = String(date.getUTCHours()).padStart(2, '0');
        const minutes = String(date.getUTCMinutes()).padStart(2, '0');
        const seconds = String(date.getUTCSeconds()).padStart(2, '0');
        const month = String(date.getUTCMonth() + 1).padStart(2, '0'); // Monate sind 0-basiert
        const day = String(date.getUTCDate()).padStart(2, '0');
        const year = date.getUTCFullYear();
        /** GMT Date */
        return `${hours}:${minutes}:${seconds},${month}-${day}-${year}`;
    }

    /**
     * you get local Timen from GMT timestamp in format <HH:MM:SS,MM-DD-YYYY>
     *
     * @param ts date string in format HH:MM:SS,MM-DD-YYY
     * @returns localtime as Date
     */
    private getUTCDateFromSIATimestamp(ts: string): Date {
        const [timePart, datePart] = ts.split(',');
        const [hours, minutes, seconds] = timePart.split(':').map(Number);
        const [month, day, year] = datePart.split('-').map(Number);
        // Erstellen des GMT-Datums (Monate in JS sind 0-basiert)
        const gmtDate = new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds));
        /** returns gmt date */
        return gmtDate;
    }

    /**
     * Is SIA Message in timerange (for example +20 or -40 seconds)
     *
     * @param ts1 date string in format HH:MM:SS,MM-DD-YYY
     * @param ts2 date string in format HH:MM:SS,MM-DD-YYY
     * @returns true if timestamp in range, else false
     */
    private isInTime(ts1: string, ts2?: string): boolean {
        if (!ts1 || ts1.length === 0) {
            return true;
        }
        /** time from sia message */
        const date_ts1 = this.getUTCDateFromSIATimestamp(ts1);
        /** gmt time */
        ts2 = ts2 && ts2.length > 0 ? ts2 : this.getSIATimestampFromUTCDateNow();
        const date_ts2 = this.getUTCDateFromSIATimestamp(ts2);
        this.logger && this.logger.debug(`Timestamp date_ts: ${date_ts1.toLocaleString()}`);
        this.logger && this.logger.debug(`Timestamp date_now: ${date_ts2.toLocaleString()}`);
        /** diference in seconds */
        const diff = Math.abs((date_ts2.valueOf() - date_ts1.valueOf()) / 1000);
        if (this.timeout > 0 && diff > this.timeout) {
            return false;
        }
        return true;
    }

    /**
     * get Account from config
     *
     * @param act accountnummber
     * @returns account
     */
    private getAccountInfo(act: string): ifaccount {
        for (let i = 0; i < this.accounts.length; i++) {
            const key = this.accounts[i];
            if (key.accountnumber === act) {
                return key;
            }
        }
        throw new Error(`Acoocunt ${act} unknown. Not found in configuratin!`);
    }

    /**
     * SIA Message was not succesfull, create NAK
     *
     * @param data message
     * @returns NAK Message
     */
    public createNACK(data: Buffer): Buffer {
        const ts = this.getSIATimestampFromUTCDateNow(); // tiemstamp
        const str = `"NAK"` + `0000` + `R0` + `L0` + `A0` + `[]_${ts}`;
        const crc = this.crc16str(str);
        const len = str.length;
        const crchex = `0000${crc.toString(16)}`.slice(-4).toUpperCase();
        const lenhex = `0000${len.toString(16)}`.slice(-4).toUpperCase();
        const start = Buffer.from([0x0a]);
        const end = Buffer.from([0x0d]);
        let crcbuf;
        const crcformat = this.getcrcFormat(data);
        switch (crcformat) {
            case 'bin':
                /** Lupusec sends in 2 bin instead of 4 hex */
                crcbuf = Buffer.from([(crc >>> 8) & 0xff, crc & 0xff]);
                this.logger && this.logger.debug(`Created NAK : <0x0A><0x${crchex}>${lenhex}${str}<0x0D>`);
                break;
            case 'hex':
                crcbuf = Buffer.from(crchex);
                this.logger && this.logger.debug(`Created NAK : <0x0A>${crchex}${lenhex}${str}<0x0D>`);
                break;
            default:
                /** Empty message */
                crcbuf = Buffer.from('');
                this.logger && this.logger.error(`Created NAK : <0x0A><0x0D>`);
                break;
        }
        const lenbuf = Buffer.from(lenhex);
        const buf = Buffer.from(str);
        const nack = Buffer.concat([start, crcbuf, lenbuf, buf, end]);
        this.logger && this.logger.debug(`createNACK : ${JSON.stringify(nack)}`);
        return nack;
    }

    /**
     * Craete Acknowledge for SIA
     *
     * @param sia - SIA Message
     * @returns ack message
     */
    public createACK(sia: ifsia): Buffer {
        if (!sia) {
            throw new Error(`Could not create ACK for message!`);
        }
        /** get timestamp now */
        const ts = this.getSIATimestampFromUTCDateNow();
        const cfg = this.getAccountInfo(sia.act);
        if (!cfg) {
            throw new Error(`Could not create ACK. Accountnumber ${sia.act} missing in the configuration`);
        }
        /** if timestamp not set, the message is in time (noch check needed) */
        const intime = sia.ts && sia.ts.length > 0 ? this.isInTime(sia.ts, ts) : true;
        this.logger && this.logger.debug(`createACK (cfg) : ${JSON.stringify(cfg)}`);
        this.logger && this.logger.debug(`createACK (sia) : ${JSON.stringify(sia)}`);
        let str = '';
        if (!intime) {
            throw new Error(`Could not create ACK. Message to old (timestamp msg: ${sia.ts}, timestamp now: ${ts})`);
        }
        if (sia.calc_len != sia.len) {
            throw new Error(`Could not create ACK. Length of message is not correct!`);
        }
        if (sia.calc_crc != sia.crc) {
            throw new Error(`Could not create ACK. CRC of message is not correct!`);
        }
        const rpref = sia.rpref && sia.rpref.length > 0 ? `R${sia.rpref}` : '';
        const lpref = sia.lpref && sia.lpref.length > 0 ? `L${sia.lpref}` : '';
        switch (sia.id) {
            case '*SIA-DCS':
            case '*ADM-CID': {
                if (!cfg.aes || !cfg.password) {
                    throw new Error(
                        `Could not create ACK. Could not encrypt message, because AES encrypting disabled or password is missing for ${cfg.accountnumber}`,
                    );
                }
                const msglen = `|]_${ts}`.length;
                const padlen = 16 - (msglen % 16);
                const pad = Buffer.alloc(padlen, 0x00);
                const msg = this.encrypt_hex(cfg.password, `${pad.toString()}|]_${ts}`);
                str = `"*ACK"${sia.seq}${rpref}${lpref}#${sia.act}[${msg}`;
                break;
            }
            case 'SIA-DCS':
            case 'ADM-CID': {
                str = `"ACK"${sia.seq}${rpref}${lpref}#${sia.act}[]`;
                break;
            }
            default:
                break;
        }
        const crc = this.crc16str(str);
        const len = str.length;
        const crchex = `0000${crc.toString(16)}`.slice(-4).toUpperCase();
        const lenhex = `0000${len.toString(16)}`.slice(-4).toUpperCase();
        const start = Buffer.from([0x0a]);
        const end = Buffer.from([0x0d]);
        let crcbuf;
        switch (sia?.crcformat) {
            case 'bin':
                /* Lupusec sends in 2 bin instead of 4 hex */
                crcbuf = Buffer.from([(crc >>> 8) & 0xff, crc & 0xff]);
                this.logger && this.logger.debug(`Created ACK : <0x0A><0x${crchex}>${lenhex}${str}<0x0D>`);
                break;
            case 'hex':
                crcbuf = Buffer.from(crchex);
                this.logger && this.logger.debug(`Created ACK : <0x0A>${crchex}${lenhex}${str}<0x0D>`);
                break;
            default:
                throw new Error(`Could not create ACK for message. Message not in BIN or HEX foramt!`);
                break;
        }
        const lenbuf = Buffer.from(lenhex);
        const buf = Buffer.from(str);
        const ack = Buffer.concat([start, crcbuf, lenbuf, buf, end]);
        this.logger && this.logger.debug(`createACK : ${JSON.stringify(ack)}`);
        return ack;
    }

    /**
     * Convert Byte to Hex String
     *
     * @param uint8arr - btyte buffer
     * @returns conveerted string
     */
    private byteToHexString(uint8arr: any): any {
        if (!uint8arr) {
            return '';
        }
        let hexStr = '';
        for (let i = 0; i < uint8arr.length; i++) {
            let hex = (uint8arr[i] & 0xff).toString(16);
            hex = hex.length === 1 ? `0${hex}` : hex;
            hexStr += hex;
        }
        return hexStr.toUpperCase();
    }

    /**
     * SIA CRC Format
     *
     * @param data - CRC
     * @returns crc format
     */
    private getcrcFormat(data: Buffer): string {
        if (data) {
            // Check if CRC 2 Byte Binary or 4 Byte HEX
            if (data[5] == '0'.charCodeAt(0) && data[9] == '"'.charCodeAt(0)) {
                return 'hex';
            }
            // Lupusec sends the CRC in binary forum
            if (data[3] == '0'.charCodeAt(0) && data[7] == '"'.charCodeAt(0)) {
                return 'bin';
            }
        }
        return '';
    }

    /**
     * delete 0x00 at the end of the buffer
     *
     * @param data - string buffer
     * @returns strng without 0x00
     */
    private deleteAppendingZero(data: Buffer): Buffer {
        if (data) {
            for (let i = data.length - 1; i > 0; i--) {
                if (data[i] === 0x00) {
                    data = data.subarray(0, i);
                } else {
                    break;
                }
            }
        }
        return data;
    }

    /**
     * parse SIA message (https://dc09gen.northlat.com/)
     *
     * @param data - SIA Message
     * @returns parsed sia data
     */
    public parseSIA(data: Buffer): ifsia {
        data = this.deleteAppendingZero(data);
        const datalen = data.length - 1;
        if (!data || data[0] !== 0x0a || data[datalen] !== 0x0d) {
            throw new Error(`Receive message ${data?.toString()} is corrupted.`);
        }
        const crcformat = this.getcrcFormat(data);
        let str = '';
        let len = '';
        let crc = '';
        switch (crcformat) {
            case 'hex':
                /** Check if CRC 2 Byte Binary or 4 Byte HEX */
                str = Buffer.from(data.subarray(9, datalen)).toString();
                len = data.subarray(5, 9).toString().toUpperCase();
                crc = data.subarray(1, 5).toString().toUpperCase();
                this.logger && this.logger.debug(`SIA Message : <0x0A>${crc}${len}${str?.toString()}<0x0D>`);
                break;
            case 'bin':
                /** Lupusec sends the CRC in binary form */
                str = Buffer.from(data.subarray(7, datalen)).toString();
                len = `0000${data.subarray(3, 7).toString()}`.slice(-4).toUpperCase();
                crc = `0000${(data[1] * 256 + data[2]).toString(16)}`.slice(-4).toUpperCase();
                /** Lupusec sends in 2 bin instead of 4 hex */
                this.logger && this.logger.debug(`SIA Message : <0x0A><0x${crc}>${len}${str?.toString()}<0x0D>`);
                break;
            default:
                throw new Error(`Could not parse SIA message. Message not in BIN or HEX format!`);
        }
        if (str.length === 0) {
            throw new Error(`Could not parse SIA message. Message corupted`);
        }
        const calc_len = `0000${str.length.toString(16)}`.slice(-4).toUpperCase();
        const calc_crc = `0000${this.crc16str(str).toString(16)}`.slice(-4).toUpperCase();
        if (calc_len != len) {
            throw new Error(`Could not parse SIA message. Length of message is not correct!`);
        }
        if (calc_crc != crc) {
            throw new Error(`Could not parse SIA message. CRC of message is not correct!`);
        }
        this.logger && this.logger.debug(`parseSIA str : ${str}`);
        const regexstr = /"(.+)"(\d{4})(R(.{0,6})){0,1}(L(.{0,6}))#([\w\d]+)\[(.+)/gm;
        const regexstr_result = regexstr.exec(str);
        if (!regexstr_result || regexstr_result.length !== 9) {
            throw new Error('Could not parse SIA message. Message corupted');
        }
        const id: string = regexstr_result[1] || '';
        const seq: string = regexstr_result[2] || '';
        const rpref: string = regexstr_result[4] || '';
        const lpref: string = regexstr_result[6] || '';
        const act: string = regexstr_result[7] || '';
        let msg: string = regexstr_result[8] || '';
        const cfg = this.getAccountInfo(act);
        if (!cfg) {
            throw new Error(`Could not parse SIA message. Accountnumber ${act} missing in the configuration`);
        }
        /** if id starts with *, message is encrypted */
        switch (id) {
            case '*SIA-DCS':
            case '*ADM-CID':
                if (!cfg.aes || !cfg.password) {
                    throw new Error(
                        `Could not parse SIA message. Could not decrypt message, because AES encrypting disabled or password is missing for ${cfg.accountnumber}`,
                    );
                }
                msg = this.decrypt_hex(cfg.password, msg);
                if (msg) {
                    const padlen = msg.indexOf('|');
                    msg = msg.substring(padlen + 1); // Data Message
                    this.logger && this.logger.debug(`SIA Message decrypted part: ${msg}`);
                } else {
                    throw new Error(`Could not parse SIA message. Could not decrypt message`);
                }
                break;
            case 'SIA-DCS':
            case 'ADM-CID':
                if (cfg.aes) {
                    throw new Error(`Could not parse SIA message. Encrypting enabled, message was sent not entcrypted`);
                }
                break;
            default:
                break;
        }
        const regexmsg = /(.+?)\](\[(.*?)\])?(_(.+)){0,1}/gm;
        const regexmsg_result = regexmsg.exec(msg);
        if (!regexmsg_result || regexmsg_result.length !== 6) {
            throw new Error(`Incorrect format of data message ${msg}`);
        }
        /** Message */
        const data_message = regexmsg_result[1] || '';
        /** Extended message */
        const data_extended = regexmsg_result[3] || '';
        /** timeestamp */
        const ts = regexmsg_result[5] || '';
        /** return values */
        const sia: ifsia = {
            id: id,
            seq: seq,
            lpref: lpref,
            rpref: rpref,
            act: act,
            data_extended: data_extended,
            data_message: data_message,
            crc: crc,
            len: len,
            data: data,
            calc_crc: calc_crc,
            calc_len: calc_len,
            crcformat: crcformat,
            str: str,
            ts: ts,
        };
        this.logger && this.logger.debug(`parseSIA : ${JSON.stringify(sia)}`);
        // Test if all required fields are filled
        if (
            sia &&
            sia.id.length > 0 &&
            sia.seq.length > 0 &&
            sia.lpref.length > 0 &&
            sia.act.length > 0 &&
            sia.data_message.length > 0
        ) {
            return sia;
        }
        throw new Error(`Could not parse SIA message ${data.toString()}. Required SIA fields missing`);
    }

    /**
     * Listen Server TCP
     */
    public serverStartTCP(): void {
        // this.servertcp = net.createServer();
        this.servertcp.on('connection', sock => {
            let handletimeout: NodeJS.Timeout | undefined = undefined;
            const remoteAddress = `${sock.remoteAddress}:${sock.remotePort}`;
            this.logger && this.logger.debug(`New client connected: ${remoteAddress}`);
            sock.on('data', (data: any) => {
                try {
                    this.logger &&
                        this.logger.debug(`received from ${remoteAddress} following data: ${JSON.stringify(data)}`);
                    this.logger &&
                        this.logger.info(`received from ${remoteAddress} following message: ${data.toString().trim()}`);
                    this.emit('data', data);
                    const sia = this.parseSIA(data);
                    const ack = this.createACK(sia);
                    sock.write(ack);
                    if (this.sockend) {
                        sock.end();
                    } else {
                        /** close connection afer 30 seconds */
                        handletimeout = setTimeout(() => {
                            this.logger && this.logger.info(`disconnecting connection from ${remoteAddress}`);
                            sock.end();
                        }, 30 * 1000);
                    }
                    this.emit('sia', sia, undefined);
                    this.logger &&
                        this.logger.info(`sending to ${remoteAddress} following ACK message: ${ack.toString().trim()}`);
                } catch (err) {
                    const ack = this.createNACK(data);
                    sock.write(ack);
                    sock.end(ack);
                    this.emit('sia', undefined, tools.getErrorMessage(err));
                    this.logger &&
                        this.logger.error(
                            `sending to ${remoteAddress} following NACK message: ${ack.toString().trim()} because of error ${tools.getErrorMessage(err)}`,
                        );
                }
            });
            sock.on('end', () => {
                if (!this.sockend) {
                    handletimeout && clearTimeout(handletimeout);
                }
                this.logger && this.logger.info(`connection from ${remoteAddress} disconnected`);
            });
            sock.on('close', () => {
                this.logger && this.logger.info(`connection from ${remoteAddress} closed`);
            });
            sock.on('error', (err: any) => {
                this.logger && this.logger.error(`Connection ${remoteAddress} error:  ${tools.getErrorMessage(err)}`);
                this.emit('error', tools.getErrorMessage(err));
            });
        });
        this.servertcp.on('close', () => {
            this.logger && this.logger.info(`TCP Listen server on ${this.host}:${this.port} closed`);
            this.emit('close');
        });
        this.servertcp.listen(this.port, this.host, () => {
            this.logger && this.logger.info(`SIA Server listening on IP-Adress (TCP): ${this.host}:${this.port}`);
        });
    }

    /**
     * Stop TCP Server
     */
    public serverStopTCP(): void {
        if (this.servertcp) {
            this.servertcp.close(err => {
                if (err) {
                    throw new Error(`Could not close TCP Listen server on : ${this.host}:${this.port}`);
                } else {
                    this.logger.info(`Close TCP Listen server on: ${this.host}:${this.port}`);
                }
            });
        }
    }

    /**
     * Listen Server UDP
     */
    public serverStartUDP(): void {
        // const serverudp = dgram.createSocket('udp4');
        this.serverudp.on('message', (data: any, remote: any) => {
            try {
                this.logger &&
                    this.logger.debug(`received from ${remote.address} following data: ${JSON.stringify(data)}`);
                this.logger &&
                    this.logger.info(`received from ${remote.address} following message: ${data.toString().trim()}`);
                this.emit('data', data);
                const sia = this.parseSIA(data);
                const ack = this.createACK(sia);
                // set states only if ACK okay
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                this.serverudp.send(ack, 0, ack.length, remote.port, remote.address, (err: any, bytes: any) => {});
                this.emit('sia', sia, undefined);
                this.logger &&
                    this.logger.info(`sending to ${remote.address} following ACK message: ${ack.toString().trim()}`);
            } catch (err) {
                const ack = this.createNACK(data);
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                this.serverudp.send(ack, 0, ack.length, remote.port, remote.address, (err: any, bytes: any) => {});
                this.emit('sia', undefined, tools.getErrorMessage(err));
                this.logger &&
                    this.logger.error(
                        `sending to ${remote.address} following NACK message: ${ack.toString().trim()}  because of error ${tools.getErrorMessage(err)}`,
                    );
            }
        });
        this.serverudp.on('close', () => {
            this.logger && this.logger.info(`UDP Connection closed`);
            this.emit('close');
        });
        this.serverudp.on('error', (err: any) => {
            this.logger && this.logger.error(`UDP Error: ${tools.getErrorMessage(err)}`);
            this.emit('error', tools.getErrorMessage(err));
        });
        this.serverudp.bind(this.port, this.host, () => {
            this.logger &&
                this.logger.info(
                    `SIA Server listening on IP-Adress (UDP): ${this.serverudp.address().address}:${this.serverudp.address().port}`,
                );
        });
    }

    /**
     * Stop UDP Server
     */
    public serverStopUDP(): void {
        if (this.serverudp) {
            this.serverudp.close(() => {
                this.logger.info(
                    `Close UDP Listen server on: ${this.serverudp.address().address}:${this.serverudp.address().port}`,
                );
            });
        }
    }

    /**
     * CRC Calculation. Example. crc16([0x20, 0x22])
     *
     * @param data - string
     * @returns crc
     */
    private crc16old(data: any): any {
        /* CRC table for the CRC-16. The poly is 0x8005 (x^16 + x^15 + x^2 + 1) */
        const crctab16 = new Uint16Array([
            0x0000, 0xc0c1, 0xc181, 0x0140, 0xc301, 0x03c0, 0x0280, 0xc241, 0xc601, 0x06c0, 0x0780, 0xc741, 0x0500,
            0xc5c1, 0xc481, 0x0440, 0xcc01, 0x0cc0, 0x0d80, 0xcd41, 0x0f00, 0xcfc1, 0xce81, 0x0e40, 0x0a00, 0xcac1,
            0xcb81, 0x0b40, 0xc901, 0x09c0, 0x0880, 0xc841, 0xd801, 0x18c0, 0x1980, 0xd941, 0x1b00, 0xdbc1, 0xda81,
            0x1a40, 0x1e00, 0xdec1, 0xdf81, 0x1f40, 0xdd01, 0x1dc0, 0x1c80, 0xdc41, 0x1400, 0xd4c1, 0xd581, 0x1540,
            0xd701, 0x17c0, 0x1680, 0xd641, 0xd201, 0x12c0, 0x1380, 0xd341, 0x1100, 0xd1c1, 0xd081, 0x1040, 0xf001,
            0x30c0, 0x3180, 0xf141, 0x3300, 0xf3c1, 0xf281, 0x3240, 0x3600, 0xf6c1, 0xf781, 0x3740, 0xf501, 0x35c0,
            0x3480, 0xf441, 0x3c00, 0xfcc1, 0xfd81, 0x3d40, 0xff01, 0x3fc0, 0x3e80, 0xfe41, 0xfa01, 0x3ac0, 0x3b80,
            0xfb41, 0x3900, 0xf9c1, 0xf881, 0x3840, 0x2800, 0xe8c1, 0xe981, 0x2940, 0xeb01, 0x2bc0, 0x2a80, 0xea41,
            0xee01, 0x2ec0, 0x2f80, 0xef41, 0x2d00, 0xedc1, 0xec81, 0x2c40, 0xe401, 0x24c0, 0x2580, 0xe541, 0x2700,
            0xe7c1, 0xe681, 0x2640, 0x2200, 0xe2c1, 0xe381, 0x2340, 0xe101, 0x21c0, 0x2080, 0xe041, 0xa001, 0x60c0,
            0x6180, 0xa141, 0x6300, 0xa3c1, 0xa281, 0x6240, 0x6600, 0xa6c1, 0xa781, 0x6740, 0xa501, 0x65c0, 0x6480,
            0xa441, 0x6c00, 0xacc1, 0xad81, 0x6d40, 0xaf01, 0x6fc0, 0x6e80, 0xae41, 0xaa01, 0x6ac0, 0x6b80, 0xab41,
            0x6900, 0xa9c1, 0xa881, 0x6840, 0x7800, 0xb8c1, 0xb981, 0x7940, 0xbb01, 0x7bc0, 0x7a80, 0xba41, 0xbe01,
            0x7ec0, 0x7f80, 0xbf41, 0x7d00, 0xbdc1, 0xbc81, 0x7c40, 0xb401, 0x74c0, 0x7580, 0xb541, 0x7700, 0xb7c1,
            0xb681, 0x7640, 0x7200, 0xb2c1, 0xb381, 0x7340, 0xb101, 0x71c0, 0x7080, 0xb041, 0x5000, 0x90c1, 0x9181,
            0x5140, 0x9301, 0x53c0, 0x5280, 0x9241, 0x9601, 0x56c0, 0x5780, 0x9741, 0x5500, 0x95c1, 0x9481, 0x5440,
            0x9c01, 0x5cc0, 0x5d80, 0x9d41, 0x5f00, 0x9fc1, 0x9e81, 0x5e40, 0x5a00, 0x9ac1, 0x9b81, 0x5b40, 0x9901,
            0x59c0, 0x5880, 0x9841, 0x8801, 0x48c0, 0x4980, 0x8941, 0x4b00, 0x8bc1, 0x8a81, 0x4a40, 0x4e00, 0x8ec1,
            0x8f81, 0x4f40, 0x8d01, 0x4dc0, 0x4c80, 0x8c41, 0x4400, 0x84c1, 0x8581, 0x4540, 0x8701, 0x47c0, 0x4680,
            0x8641, 0x8201, 0x42c0, 0x4380, 0x8341, 0x4100, 0x81c1, 0x8081, 0x4040,
        ]);
        let len = data.length;
        let buffer = 0;
        let crc = 0;
        while (len--) {
            crc = (crc >>> 8) ^ crctab16[(crc ^ data[buffer++]) & 0xff];
        }
        return crc;
        /* return [(crc >>> 8 & 0xff), (crc & 0xff)]; */
    }

    /**
     * CRC Calculation. Example. crc16([0x20, 0x22])
     *
     * @param buffer has to bei a Buffer like crc16([0x20, 0x22])
     * @returns crc as number
     */
    private crc16(buffer: Buffer): number {
        let crc = 0;
        for (const byte of buffer) {
            let temp = byte & 0xff;
            for (let i = 0; i < 8; i++) {
                temp ^= crc & 1;
                crc >>= 1;
                if (temp & 1) {
                    crc ^= 0xa001;
                }
                temp >>= 1;
            }
        }
        return crc;
    }

    /**
     * CRC Calculation. Example. crc16str([0x20, 0x22]) or crc16src('hello');
     *
     * @param str kann ein String oder Buffer sein
     * @returns crc as number
     */
    private crc16str(str: string | Buffer): number {
        // const crc = this.crc16old(Buffer.from(str));
        const crc = this.crc16(Buffer.from(str));
        return crc;
    }
}
