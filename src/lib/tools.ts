import axios from 'axios';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { NodeSSH, Config as NodeSSHConfig } from 'node-ssh';

export type sshconfig = NodeSSHConfig;

/**
 * Sleep
 *
 * @param seconds sleep time
 * @returns void
 */
export function wait(seconds: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, seconds * 1000));
}

/**
 * convert Unix timestamp in ms to format YYYYMMDD_hhmmssmmm
 *
 * @param timestamp unix timestamp in ms
 * @returns timestamp as string YYYYMMDD_hhmmssmmm
 */
export function getTimeStrFromUnixTime(timestamp: number = Date.now()): string {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0'); // +1 weil getMonth() 0-basiert ist
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    const milliseconds = String(date.getMilliseconds()).padStart(3, '0');
    return `${year}${month}${day}_${hours}${minutes}${seconds}${milliseconds}`;
}

/**
 * Substr
 *
 * @param text test
 * @param start from
 * @param length length
 * @returns substring
 */
export function substr(text: string, start: number, length?: number): string {
    length = length === undefined || length > text.length ? text.length : length;
    const retstr = text.substring(start, start + length);
    return retstr;
}

/**
 * Checks if a text contains only letters between 0-9, a-f or A-F
 *
 * @param text to check
 * @returns true or false
 */
export function isHexString(text: string): boolean {
    return /^[0-9A-Fa-f]+$/.test(text);
}

/**
 *
 * @returns guid
 */
export function getGuid(): string {
    function _p8(s: boolean): any {
        const p = substr(`${Math.random().toString(16)}000000000`, 2, 8);
        return s ? `-${substr(p, 0, 4)}-${substr(p, 4, 4)}` : p;
    }

    return `${_p8(false)}${_p8(true)}${_p8(true)}${_p8(false)}`;
}

/**
 *
 * @param text text mit nummer
 * @returns nummer
 */
export function textToNumber(text: string): string {
    let numb: any = '';
    if (text) {
        numb = text.match(/[\d*#]/g);
        numb = numb.join('');
    }
    return numb;
}

/**
 * Tests whether the given variable is a real object and not an Array
 *
 * @param it The variable to test
 * @returns if an object
 */
export function isObject(it: any): boolean {
    // This is necessary because:
    // typeof null === 'object'
    // typeof [] === 'object'
    // [] instanceof Object === true
    return Object.prototype.toString.call(it) === '[object Object]';
}

/**
 * Tests whether the given variable is really an Array
 *
 * @param it The variable to test
 */
export function isArray(it: any): boolean {
    if (Array.isArray != null) {
        return Array.isArray(it);
    }
    return Object.prototype.toString.call(it) === '[object Array]';
}

/**
 * Translates text using the Google Translate API
 *
 * @param text The text to translate
 * @param targetLang The target languate
 * @returns string
 */
export async function _translateText(text: string, targetLang: string): Promise<string> {
    if (targetLang === 'en') {
        return text;
    }
    try {
        const url = `http://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}&ie=UTF-8&oe=UTF-8`;
        const response = await axios({ url, timeout: 5000 });
        if (isArray(response.data)) {
            // we got a valid response
            return response.data[0][0][0];
        }
        throw new Error('Invalid response for translate request');
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e) {
        throw new Error(`Could not translate to "${targetLang}"`);
    }
}

/**
 * Checks OS
 *
 * @returns true if Windows
 */
export function isWindow(): boolean {
    return process.platform.startsWith('win');
}

/**
 * Adds / to pathname
 *
 * @param path pathname
 * @returns pathname with ending /
 */
export function addSlashToPath(path: string): string {
    if (isWindow() && path?.slice(-1) != '\\') {
        return `${path}\\`;
    }
    if (!isWindow() && path?.slice(-1) != '/') {
        return `${path}/`;
    }
    return path;
}

/**
 * Get basename of filename
 *
 * @param filename with ending like test.gsm
 * @returns filename without ending like test
 */
export function getFilenameWithoutExtension(filename: string): string {
    return filename.split('.').slice(0, -1).join('.') || filename;
}

/**
 * SSH
 *
 * @param srcfile source file
 * @param dstfile destination file
 * @param config configuration file for SSH
 */
export async function sendSSH(srcfile: string, dstfile: string, config: sshconfig): Promise<void> {
    const ssh = new NodeSSH();
    await ssh.connect(config);
    await ssh.putFile(srcfile, dstfile);
}

/**
 * Errormessage
 *
 * @param error error
 * @returns error as message
 */
export function getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }
    return String(error);
}

/**
 * ompare if propierties of object a exist in  object b
 *
 * @param obja - object 1 for comapring
 * @param objb - object 2 for comparing
 */
export function propertiesObjAinObjB(obja: any, objb: any): any {
    if (obja === objb) {
        return true;
    }
    if (!(obja instanceof Object) || !(objb instanceof Object)) {
        return false;
    }
    if (obja.constructor !== objb.constructor) {
        return false;
    }
    for (const p in obja) {
        if (!Object.prototype.hasOwnProperty.call(obja, p)) {
            continue;
        }
        if (!Object.prototype.hasOwnProperty.call(objb, p)) {
            return false;
        }
        if (obja[p] === objb[p]) {
            continue;
        }
        if (typeof obja[p] !== 'object') {
            return false;
        }
        if (!propertiesObjAinObjB(obja[p], objb[p])) {
            return false;
        } // Objects and Arrays must be tested recursively
    }
    return true;
}
