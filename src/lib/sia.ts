import crypto from 'crypto';
import dgram from 'dgram';
import { EventEmitter } from 'events';
import net from 'net';
import * as tools from './tools';

/**
 * Interface account
 */
export interface ifaccount {
    accountnumber: string;
    password: any;
    hex: boolean;
    aes: boolean;
}

/**
 * SIA Message
 */
export interface ifsia {
    id: string;
    seq: string; // sequence
    rpref: any;
    lpref: any;
    act: string; // accountnumber
    data: any; // complete messsage
    data_message: any; // msgdata
    data_extended: any; // extdata
    ts: any; // timestamp
    crc: any;
    calc_crc: any;
    calc_len: number;
    len: any;
    crcformat: string;
    lf: any;
    cr: any;
    str: any;
    pad: any;
}

/**
 * SIA Class
 */
export class sia extends EventEmitter {
    private timeout: number;
    private accounts: ifaccount[];
    private adapter: any;
    private port: number;
    private host: string;

    /**
     * Constructor
     *
     * @param parameter parameter
     * @param parameter.accounts acccounts
     * @param parameter.timeout timeout
     * @param parameter.host bind host
     * @param parameter.port bind port
     * @param parameter.adapter iobroker adapter
     */
    constructor(parameter: { accounts: ifaccount[]; timeout?: number; host: string; port: number; adapter: any }) {
        super();
        this.accounts = parameter.accounts;
        this.timeout = parameter.timeout === undefined ? 10 : parameter.timeout;
        this.adapter = parameter.adapter;
        this.host = parameter.host;
        this.port = parameter.port;
        this.init();
    }

    /**
     * Init function
     */
    private init(): void {
        for (const account of this.accounts) {
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
            throw new Error(`Could not encrypt to hex: ${tools.getErrorMessage(err)}`);
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
            throw new Error(`Could not decrypt from hex: ${tools.getErrorMessage(err)}`);
        }
    }

    /**
     * get timestamp in following format <_HH:MM:SS,MM-DD-YYYY>
     *
     * @param datum date object or leave empty
     * @returns timestamp as strng
     */
    private getTimestamp(datum?: Date): string {
        if (!datum) {
            datum = new Date();
        }
        // let month = ('0' + datum.getUTCMonth()).slice(-2); // liefert 0 - 11
        const month = `0${datum.getUTCMonth() + 1}`.slice(-2);
        const year = datum.getUTCFullYear(); // YYYY (startet nicht bei 0)
        const day = `0${datum.getUTCDate()}`.slice(-2); // liefert 1 - 31
        const hour = `0${datum.getUTCHours()}`.slice(-2); // liefert 0 - 23
        const minute = `0${datum.getUTCMinutes()}`.slice(-2);
        const second = `0${datum.getUTCSeconds()}`.slice(-2);
        const str = `_${hour}:${minute}:${second},${month}-${day}-${year}`;
        return str;
    }

    /**
     * Is SIA Message in time (+20 or -40 seconds)
     *
     * @param ts timestamp in seconds, for examp -20, +20
     * @returns true if timestamp in range, else false
     */
    private isInTime(ts: any): boolean {
        if (ts) {
            let [tt, dd] = ts.split(',');
            const val = new Date(`${dd},${tt} UTC`);
            // val = val.toUTCString();
            [tt, dd] = this.getTimestamp().substring(1).split(',');
            const now = new Date();
            // now = now.toUTCString();
            const diff = Math.abs((val.getMilliseconds() - now.getMilliseconds()) / 1000);
            // if (diff > 20 || diff < -40) {
            if (this.timeout > 0 && diff > this.timeout) {
                return false;
            }
            return true;
        }
        return true;
    }

    /**
     * SIA Message was not succesfull, create NAK
     *
     * @param crcformat crcformat
     * @returns NAK Message
     */
    private nackSIA(crcformat: string): Buffer {
        const ts = this.getTimestamp(); // tiemstamp
        const str = `"NAK"` + `0000` + `R0` + `L0` + `A0` + `[]${ts}`;
        const crc = this.crc16str(str);
        const len = str.length;
        const crchex = `0000${crc.toString(16)}`.slice(-4).toUpperCase();
        const lenhex = `0000${len.toString(16)}`.slice(-4).toUpperCase();
        const start = Buffer.from([0x0a]);
        const end = Buffer.from([0x0d]);
        let crcbuf;
        if (crcformat === 'bin') {
            /* Lupusec sends in 2 bin instead of 4 hex */
            crcbuf = Buffer.from([(crc >>> 8) & 0xff, crc & 0xff]);
            this.adapter.log.debug(`Created NAK : <0x0A><0x${crchex}>${lenhex}${str}<0x0D>`);
        } else {
            crcbuf = Buffer.from(crchex);
            this.adapter.log.debug(`Created NAK : <0x0A>${crchex}${lenhex}${str}<0x0D>`);
        }
        const lenbuf = Buffer.from(lenhex);
        const buf = Buffer.from(str);
        const nack = Buffer.concat([start, crcbuf, lenbuf, buf, end]);
        this.adapter.log.debug(`nackSIA : ${JSON.stringify(nack)}`);
        return nack;
    }

    /**
     * get Account from config
     *
     * @param act accountnummber
     * @returns account
     */
    private getAcctInfo(act: string): ifaccount {
        for (let i = 0; i < this.accounts.length; i++) {
            const key = this.accounts[i];
            if (key.accountnumber === act) {
                return key;
            }
        }
        throw new Error(`Acoocunt ${act} unknown. Not found in configuratin!`);
    }

    /**
     * Craete Acknowledge for SIA
     *
     * @param sia - SIA Message
     * @returns ack message
     */
    private ackSIA(sia: ifsia): any {
        if (sia) {
            const ts = this.getTimestamp(); // tiemstamp
            const cfg = this.getAcctInfo(sia.act);
            let str = '';
            this.adapter.log.debug(`ackSIA (cfg) : ${JSON.stringify(cfg)}`);
            this.adapter.log.debug(`ackSIA (sia) : ${JSON.stringify(sia)}`);
            if (sia.crc == sia.calc_crc && sia.len == sia.calc_len && cfg && this.isInTime(sia.ts)) {
                // if (sia.crc == sia.calc_crc && sia.len == sia.calc_len && cfg) {
                const rpref = sia.rpref && sia.rpref.length > 0 ? `R${sia.rpref}` : '';
                const lpref = sia.lpref && sia.lpref.length > 0 ? `L${sia.lpref}` : '';
                if (sia.id[0] == '*') {
                    const msglen = `|]${ts}`.length;
                    const padlen = 16 - (msglen % 16);
                    // let pad = new Buffer(padlen);
                    const pad = Buffer.alloc(padlen, 0x00);
                    // let pad = Buffer.alloc(padlen, 0x00);
                    const msg = this.encrypt_hex(cfg.password, `${pad.toString()}|] ${ts}`);
                    // const dmsg = this.decrypt_hex(cfg.password, msg); // only for deguging
                    // const dmsghex = new Buffer(dmsg).toString('hex');
                    str = `"*ACK"${sia.seq}${rpref}${lpref}#${sia.act}[${msg}`;
                } else {
                    str = `"ACK"${sia.seq}${rpref}${lpref}#${sia.act}[]`;
                }
                const crc = this.crc16str(str);
                const len = str.length;
                const crchex = `0000${crc.toString(16)}`.slice(-4).toUpperCase();
                const lenhex = `0000${len.toString(16)}`.slice(-4).toUpperCase();
                /*
                let start = new Buffer([0x0a, crc >>> 8 & 0xff, crc & 0xff, len >>> 8 & 0xff, len & 0xff]);
                let end = new Buffer([0x0d]);
                let buf = new Buffer(str);
                let ack = Buffer.concat([start, buf, end]);
                */
                const start = Buffer.from([0x0a]);
                const end = Buffer.from([0x0d]);
                let crcbuf;
                if (sia && sia.crcformat === 'bin') {
                    /* Lupusec sends in 2 bin instead of 4 hex */
                    crcbuf = Buffer.from([(crc >>> 8) & 0xff, crc & 0xff]);
                    this.adapter.log.info(`Created ACK : <0x0A><0x${crchex}>${lenhex}${str}<0x0D>`);
                } else {
                    crcbuf = Buffer.from(crchex);
                    this.adapter.log.info(`Created ACK : <0x0A>${crchex}${lenhex}${str}<0x0D>`);
                }
                /* let crcbuf = new Buffer(crchex); */
                /* let crcbuf = new Buffer([crc >>> 8 & 0xff, crc & 0xff]); */
                const lenbuf = Buffer.from(lenhex);
                const buf = Buffer.from(str);
                const ack = Buffer.concat([start, crcbuf, lenbuf, buf, end]);

                this.adapter.log.debug(`ackSIA : ${JSON.stringify(ack)}`);
                return ack;
            }
        }
        throw new Error(`Could not create ACK for message!`);
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
    private getcrcFormat(data: any): any {
        let crcformat = 'hex';
        if (data) {
            // Check if CRC 2 Byte Binary or 4 Byte HEX
            if (data[5] == '0'.charCodeAt(0) && data[9] == '"'.charCodeAt(0)) {
                crcformat = 'hex';
            }
            // Lupusec sends the CRC in binary forum
            if (data[3] == '0'.charCodeAt(0) && data[7] == '"'.charCodeAt(0)) {
                crcformat = 'bin';
            }
        }
        return crcformat;
    }

    /**
     * delete 0x00 at the end of the buffer
     *
     * @param data - string buffer
     * @returns strng without 0x00
     */
    private deleteAppendingZero(data: any): string {
        if (data) {
            for (let i = data.length - 1; i > 0; i--) {
                if (data[i] === 0x00) {
                    data = data.slice(0, i);
                } else {
                    break;
                }
            }
        }
        return data;
    }

    /**
     * parse SIA message
     *
     * @param data - SIA Message
     * @returns parsed sia data
     */
    private parseSIA_old(data: any): ifsia | undefined {
        data = this.deleteAppendingZero(data);
        const sia: any = {};
        const len = data.length - 1;
        let str = null;
        let m = null;
        let regex = null;
        if (data && data[0] == 0x0a && data[len] == 0x0d) {
            sia.data = data; // komplette Nachricht
            sia.lf = data[0]; // <lf>
            // Check if CRC 2 Byte Binary or 4 Byte HEX
            if (data[5] == '0'.charCodeAt(0) && data[9] == '"'.charCodeAt(0)) {
                str = Buffer.from(data.subarray(9, len));
                sia.len = parseInt(data.toString().substring(5, 9), 16);
                sia.crc = parseInt(data.toString().substring(1, 5), 16);
                sia.crcformat = 'hex';
            }
            // Lupusec sends the CRC in binary forum
            if (data[3] == '0'.charCodeAt(0) && data[7] == '"'.charCodeAt(0)) {
                str = Buffer.from(data.subarray(7, len));
                sia.len = parseInt(data.toString().substring(3, 7), 16);
                sia.crc = data[1] * 256 + data[2];
                sia.crcformat = 'bin';
            }
            // Length of Message
            //tmp = data.toString().substring(3, 7);
            // let tmp = (data.subarray(3, 7)).toString();
            // sia.len = parseInt(tmp, 16); // length of data
            this.adapter.log.debug(`data : ${data}`);
            sia.cr = data[len]; // <cr>
            // str = new Buffer((data.subarray(7, len)));

            if (!str) {
                return undefined;
            }
            sia.str = str.toString() || '';
            sia.calc_len = str.length;
            sia.calc_crc = this.crc16str(str);

            /*
            sia.calc_len = sia.str.length;
            sia.calc_crc = crc16str(sia.str);
            */
            const crchex = `0000${sia.crc.toString(16)}`.slice(-4).toUpperCase();
            const lenhex = `0000${sia.len.toString(16)}`.slice(-4).toUpperCase();
            if (sia.crcformat === 'bin') {
                // Lupusec sends in 2 bin instead of 4 hex
                this.adapter.log.info(`SIA Message : <0x0A><0x${crchex}>${lenhex}${str.toString()}<0x0D>`);
            } else {
                this.adapter.log.info(`SIA Message : <0x0A>${crchex}${lenhex}${str.toString()}<0x0D>`);
            }
            this.adapter.log.debug(`parseSIA sia.str : ${sia.str}`);
            if (sia.calc_len != sia.len || sia.calc_crc != sia.crc) {
                this.adapter.log.info('CRC or Length different to the caclulated values');
                this.adapter.log.debug(`SIA crc= ${sia.crc}, calc_crc=${sia.calc_crc}`);
                this.adapter.log.debug(`SIA len= ${sia.len}, calc_len=${sia.calc_len}`);
                this.adapter.log.debug(`Message for CRC and LEN calculation${sia.str}`);
                this.adapter.log.debug(`Message for CRC and LEN calculation (String)${sia.str.toString()}`);
                return undefined;
                // sia.calc_len = sia.len;
                // sia.calc_crc = sia.crc;
            }
            // Example str:
            // "SIA-DCS"0002R1L232#78919[1234|NFA129][S123Main St., 55123]_11:10:00,10-12-2019
            // "SIA-DCS"0002R1L232#78919[ ][ ]_11:10:00,10-12-2019
            // "SIA-DCS"0266L0#alarm1[alarm2|Nri1OP0001*Familie*]_16:22:03,06-08-2018
            // https://dc09gen.northlat.com/
            // "*SIA-DCS"9876R579BDFL789ABC#12345A[209c9d400b655df7a26aecb6a887e7ee6ed8103217079aae7cbd9dd7551e96823263460f7ef0514864897ae9789534f1
            // regex = /\"(.+)\"(\d{4})(R(.{1,6})){0,1}(L(.{1,6}))\#([\w\d]+)\[(.+)/gm; // befor Isue 11
            // regex = /\"(.+)\"(\d{4})(R(.{0,6})){0,1}(L(.{0,6}))\#([\w\d]+)\[(.+)/gm; // Isue 11
            regex = /"(.+)"(\d{4})(R(.{0,6})){0,1}(L(.{0,6}))#([\w\d]+)\[(.+)/gm; // Isue 11
            if ((m = regex.exec(sia.str)) !== null && m.length >= 8) {
                let lpref = undefined;
                this.adapter.log.debug(`parseSIA regex   : ${JSON.stringify(sia)}`);
                sia.id = m[1] || undefined; // id (SIA-DCS, ACK) - required
                sia.seq = m[2] || undefined; // sqeuence number (0002 or 0003) - required
                sia.rpref = m[4] || ''; // Receiver Number - optional (R0, R1, R123456)
                if (m[5] === 'L') {
                    lpref = 0;
                }
                sia.lpref = m[6] || lpref; // Prefix Acount number - required (L0, L1, L1232) - required
                sia.act = m[7] || undefined; // Acount number - required (1224, ABCD124) - required
                sia.pad = ''; // Pad
                let msg: any = m[8] || '';
                const cfg = this.getAcctInfo(sia.act);
                if (!cfg) {
                    this.adapter.log.info(`Could not found entries for accountnumber ${sia.act} in the configuration`);
                    return undefined;
                }
                // if id starts with *, message is encrypted
                if (sia.id && sia.id[0] == '*') {
                    if (cfg.aes == true && cfg.password) {
                        msg = this.decrypt_hex(cfg.password, msg);
                        if (msg) {
                            const padlen = msg.indexOf('|');
                            sia.pad = msg.substring(0, padlen); // len of pad
                            msg = msg.substring(padlen + 1); // Data Message
                            this.adapter.log.info(`SIA Message decrypted part: ${msg}`);
                        } else {
                            this.adapter.log.info('Could not decrypt message');
                            return undefined;
                        }
                    } else {
                        this.adapter.log.info(
                            'Could not decrypt message, because AES encrypting disabled or password is missing',
                        );
                        return undefined;
                    }
                }
                if (sia.id && sia.id[0] != '*' && cfg.aes == true) {
                    this.adapter.log.info('Encrypting enabled, message was sent not entcrypted');
                    return undefined;
                }
                regex = /(.+?)\](\[(.*?)\])?(_(.+)){0,1}/gm;
                if ((m = regex.exec(msg)) !== null && m.length >= 1) {
                    sia.data_message = m[1] || ''; // Message
                    sia.data_extended = m[3] || ''; // extended Message
                    sia.ts = m[5] || '';
                }
            }
        }
        this.adapter.log.debug(`parseSIA : ${JSON.stringify(sia)}`);
        // Test if all required fields will be sent
        if (sia && sia.id && sia.seq && sia.lpref && sia.act && sia.pad != undefined) {
            return sia;
        }
        this.adapter.log.info('Required SIA fields missing');
        return undefined;
    }

    /**
     * parse SIA message
     *
     * @param data - SIA Message
     * @returns parsed sia data
     */
    private parseSIA(data: any): ifsia {
        data = this.deleteAppendingZero(data);
        //const sia: any = {};
        const datalen = data.length - 1;
        const sia: ifsia = {
            id: '',
            seq: '',
            rpref: undefined,
            lpref: undefined,
            act: '',
            data: undefined,
            data_message: undefined,
            data_extended: undefined,
            ts: undefined,
            crc: undefined,
            calc_crc: undefined,
            calc_len: 0,
            len: undefined,
            crcformat: '',
            lf: undefined,
            cr: undefined,
            str: undefined,
            pad: undefined,
        };
        let str = undefined;
        if (data && data[0] == 0x0a && data[datalen] == 0x0d) {
            sia.data = data; // komplette Nachricht
            sia.lf = data[0]; // <lf>
            // Check if CRC 2 Byte Binary or 4 Byte HEX
            if (data[5] == '0'.charCodeAt(0) && data[9] == '"'.charCodeAt(0)) {
                str = Buffer.from(data.subarray(9, datalen));
                sia.len = parseInt(data.toString().substring(5, 9), 16);
                sia.crc = parseInt(data.toString().substring(1, 5), 16);
                sia.crcformat = 'hex';
            }
            // Lupusec sends the CRC in binary forum
            if (data[3] == '0'.charCodeAt(0) && data[7] == '"'.charCodeAt(0)) {
                str = Buffer.from(data.subarray(7, datalen));
                sia.len = parseInt(data.toString().substring(3, 7), 16);
                sia.crc = data[1] * 256 + data[2];
                sia.crcformat = 'bin';
            }
            // Length of Message
            //tmp = data.toString().substring(3, 7);
            // let tmp = (data.subarray(3, 7)).toString();
            // sia.len = parseInt(tmp, 16); // length of data
            this.adapter.log.debug(`data : ${data}`);
            sia.cr = data[datalen]; // <cr>
            // str = new Buffer((data.subarray(7, len)));

            if (!str) {
                throw new Error(`Could not parse SIA message. Message (str) ist empay`);
            }
            sia.str = str.toString() || '';
            sia.calc_len = str.length;
            sia.calc_crc = this.crc16str(str);

            /*
              sia.calc_len = sia.str.length;
              sia.calc_crc = crc16str(sia.str);
              */
            const crchex = `0000${sia.crc.toString(16)}`.slice(-4).toUpperCase();
            const lenhex = `0000${sia.len.toString(16)}`.slice(-4).toUpperCase();
            if (sia.crcformat === 'bin') {
                // Lupusec sends in 2 bin instead of 4 hex
                this.adapter.log.info(`SIA Message : <0x0A><0x${crchex}>${lenhex}${str.toString()}<0x0D>`);
            } else {
                this.adapter.log.info(`SIA Message : <0x0A>${crchex}${lenhex}${str.toString()}<0x0D>`);
            }
            this.adapter.log.debug(`parseSIA sia.str : ${sia.str}`);
            if (sia.calc_len != sia.len || sia.calc_crc != sia.crc) {
                this.adapter.log.info('CRC or Length different to the caclulated values');
                this.adapter.log.debug(`SIA crc= ${sia.crc}, calc_crc=${sia.calc_crc}`);
                this.adapter.log.debug(`SIA len= ${sia.len}, calc_len=${sia.calc_len}`);
                this.adapter.log.debug(`Message for CRC and LEN calculation${sia.str}`);
                this.adapter.log.debug(`Message for CRC and LEN calculation (String)${sia.str.toString()}`);
                throw new Error(`Could not parse SIA message. CRC Error!`);
            }
            // Example str:
            // "SIA-DCS"0002R1L232#78919[1234|NFA129][S123Main St., 55123]_11:10:00,10-12-2019
            // "SIA-DCS"0002R1L232#78919[ ][ ]_11:10:00,10-12-2019
            // "SIA-DCS"0266L0#alarm1[alarm2|Nri1OP0001*Familie*]_16:22:03,06-08-2018
            // https://dc09gen.northlat.com/
            // "*SIA-DCS"9876R579BDFL789ABC#12345A[209c9d400b655df7a26aecb6a887e7ee6ed8103217079aae7cbd9dd7551e96823263460f7ef0514864897ae9789534f1
            // regex = /\"(.+)\"(\d{4})(R(.{1,6})){0,1}(L(.{1,6}))\#([\w\d]+)\[(.+)/gm; // befor Isue 11
            // regex = /\"(.+)\"(\d{4})(R(.{0,6})){0,1}(L(.{0,6}))\#([\w\d]+)\[(.+)/gm; // Isue 11
            const regexstr = /"(.+)"(\d{4})(R(.{0,6})){0,1}(L(.{0,6}))#([\w\d]+)\[(.+)/gm; // Isue 11
            const regexstr_result = regexstr.exec(sia.str);
            if (regexstr_result && regexstr_result.length >= 8) {
                let lpref = undefined;
                this.adapter.log.debug(`parseSIA regex   : ${JSON.stringify(sia)}`);
                sia.id = regexstr_result[1] || ''; // id (SIA-DCS, ACK) - required
                sia.seq = regexstr_result[2] || ''; // sqeuence number (0002 or 0003) - required
                sia.rpref = regexstr_result[4] || ''; // Receiver Number - optional (R0, R1, R123456)
                if (regexstr_result[5] === 'L') {
                    lpref = 0;
                }
                sia.lpref = regexstr_result[6] || lpref; // Prefix Acount number - required (L0, L1, L1232) - required
                sia.act = regexstr_result[7] || ''; // Acount number - required (1224, ABCD124) - required
                sia.pad = ''; // Pad
                let msg: any = regexstr_result[8] || '';
                const cfg = this.getAcctInfo(sia.act);
                if (!cfg) {
                    throw new Error(
                        `Could not parse SIA message. Could not found entries for accountnumber ${sia.act} in the configuration`,
                    );
                }
                // if id starts with *, message is encrypted
                if (sia.id && sia.id[0] == '*') {
                    if (cfg.aes == true && cfg.password) {
                        msg = this.decrypt_hex(cfg.password, msg);
                        if (msg) {
                            const padlen = msg.indexOf('|');
                            sia.pad = msg.substring(0, padlen); // len of pad
                            msg = msg.substring(padlen + 1); // Data Message
                            this.adapter.log.info(`SIA Message decrypted part: ${msg}`);
                        } else {
                            throw new Error(`Could not parse SIA message. Could not decrypt message`);
                        }
                    } else {
                        throw new Error(
                            `Could not parse SIA message. Could not decrypt message, because AES encrypting disabled or password is missing`,
                        );
                    }
                }
                if (sia.id && sia.id[0] != '*' && cfg.aes == true) {
                    throw new Error(`Could not parse SIA message. Encrypting enabled, message was sent not entcrypted`);
                }
                const regexmsg = /(.+?)\](\[(.*?)\])?(_(.+)){0,1}/gm;
                const regexmsg_result = regexmsg.exec(msg);
                if (regexmsg_result && regexmsg_result.length >= 1) {
                    sia.data_message = regexmsg_result[1] || ''; // Message
                    sia.data_extended = regexmsg_result[3] || ''; // extended Message
                    sia.ts = regexmsg_result[5] || '';
                }
            }
        }
        this.adapter.log.debug(`parseSIA : ${JSON.stringify(sia)}`);
        // Test if all required fields will be sent
        if (sia && sia.id && sia.seq && sia.lpref && sia.act && sia.pad != undefined) {
            return sia;
        }
        throw new Error(`Could not parse SIA message. Required SIA fields missing`);
    }

    /**
     * Listen Server TCP
     */
    public serverStartTCP(): void {
        const servertcp = net.createServer(sock => {
            // See https://nodejs.org/api/stream.html#stream_readable_setencoding_encoding
            // sock.setEncoding(null);
            // Hack that must be added to make this work as expected
            // delete sock._readableState.decoder;
            const remoteAddress = `${sock.remoteAddress}:${sock.remotePort}`;
            this.adapter.log.debug(`New client connected: ${remoteAddress}`);
            sock.on('data', (data: any) => {
                try {
                    // data = Buffer.from(data,'binary');
                    // data = new Buffer(data);
                    this.adapter.log.debug(`received from ${remoteAddress} following data: ${JSON.stringify(data)}`);
                    this.adapter.log.info(
                        `received from ${remoteAddress} following message: ${data.toString().trim()}`,
                    );
                    this.emit('data', data);
                    const sia = this.parseSIA(data);
                    const ack = this.ackSIA(sia);
                    // set states only if ACK okay
                    sock.end(ack);
                    this.emit('sia', sia, undefined);
                    this.adapter.log.info(`sending to ${remoteAddress} following message: ${ack.toString().trim()}`);
                } catch (err) {
                    const crcformat = this.getcrcFormat(data);
                    const ack = this.nackSIA(crcformat);
                    sock.end(ack);
                    this.emit('sia', undefined, tools.getErrorMessage(err));
                }
            });
            sock.on('close', () => {
                this.adapter.log.info(`connection from ${remoteAddress} closed`);
            });
            sock.on('error', (err: any) => {
                this.adapter.log.error(`Connection ${remoteAddress} error:  ${tools.getErrorMessage(err)}`);
            });
        });

        servertcp.listen(this.port, this.host, () => {
            const text = `SIA Server listening on IP-Adress (TCP): ${this.host}:${this.port}`;
            this.adapter.log.info(text);
        });
    }

    /**
     * Listen Server UDP
     */
    public serverStartUDP(): void {
        const serverudp = dgram.createSocket('udp4');
        serverudp.on('message', (data: any, remote: any) => {
            try {
                this.adapter.log.debug(`received from ${remote.address} following data: ${JSON.stringify(data)}`);
                this.adapter.log.info(`received from ${remote.address} following message: ${data.toString().trim()}`);
                this.emit('data', data);
                const sia = this.parseSIA(data);
                const ack = this.ackSIA(sia);
                // set states only if ACK okay
                serverudp.send(ack, 0, ack.length, remote.port, remote.address, (err: any, bytes: any) => {});
                this.emit('sia', { sia, undefined });
                this.adapter.log.info(`sending to ${remote.address} following message: ${ack.toString().trim()}`);
            } catch (err) {
                const crcformat = this.getcrcFormat(data);
                const ack = this.nackSIA(crcformat);
                serverudp.send(ack, 0, ack.length, remote.port, remote.address, (err: any, bytes: any) => {});
                this.emit('sia', undefined, tools.getErrorMessage(err));
            }
        });
        serverudp.on('close', () => {
            this.adapter.log.info(`UDP Connection closed`);
        });
        serverudp.on('error', (err: any) => {
            this.adapter.log.error(`UDP Error: ${tools.getErrorMessage(err)}`);
            serverudp.close();
        });
        serverudp.bind(this.port, this.host, () => {
            const text = `SIA Server listening on IP-Adress (UDP): ${
                serverudp.address().address
            }:${serverudp.address().port}`;
            this.adapter.log.info(text);
        });
    }

    /**
     * CRC Calculation. Example. crc16([0x20, 0x22])
     *
     * @param data - string
     * @returns crc
     */
    private crc16(data: any): any {
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
     * @param str string
     * @returns crc as sting
     */
    private crc16str(str: any): any {
        return this.crc16(Buffer.from(str));
    }
}
