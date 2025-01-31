"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var sia_exports = {};
__export(sia_exports, {
  sia: () => sia
});
module.exports = __toCommonJS(sia_exports);
var import_crypto = __toESM(require("crypto"));
var import_dgram = __toESM(require("dgram"));
var import_events = require("events");
var import_net = __toESM(require("net"));
var tools = __toESM(require("./tools"));
class sia extends import_events.EventEmitter {
  timeout;
  accounts;
  adapter;
  port;
  host;
  logger;
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
  constructor(parameter) {
    super();
    this.timeout = parameter.timeout === void 0 ? 10 : parameter.timeout;
    this.host = parameter.host;
    this.port = parameter.port;
    this.accounts = [];
    if (parameter.logger) {
      this.logger = {
        info: parameter.logger.info ? parameter.logger.info : parameter.logger,
        debug: parameter.logger.debug ? parameter.logger.debug : parameter.logger,
        error: parameter.logger.error ? parameter.logger.error : parameter.logger
      };
    }
  }
  /**
   * Set accounts
   *
   * @param accounts accounts
   */
  setAccounts(accounts) {
    this.accounts = accounts;
    for (const account of this.accounts) {
      if (!tools.isHexString(account.accountnumber)) {
        throw new Error(
          `Accountnumber ${account.accountnumber} not allowed. Use only following characters 0-9 and A-F`
        );
      }
      if (account.accountnumber.length < 3 || account.accountnumber.length > 16) {
        throw new Error(`Accountnumber ${account.accountnumber} only 3 to 16 characters allowed.`);
      }
      if (account.aes === true) {
        if (account.hex === true) {
          account.password = Buffer.from(account.password, "hex");
        }
        const len = account.password.length;
        if (len !== 16 && len !== 24 && len !== 32) {
          throw new Error(
            `Password for accountnumber ${account.accountnumber} must be 16, 24 or 32 Byte or 32, 48 or 64 Hex long`
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
  getBytes(text) {
    const bytes = [];
    for (let i = 0; i < text.length; i++) {
      const charCode = text.charCodeAt(i);
      const cLen = Math.ceil(Math.log(charCode) / Math.log(256));
      for (let j = 0; j < cLen; j++) {
        bytes.push(charCode << j * 8 & 255);
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
  customPadding(str, bytelen, padder, format) {
    const blockSize = bytelen * 16;
    str = Buffer.from(str, "utf8").toString(format);
    const bitLength = str.length * 8;
    if (bitLength < blockSize) {
      for (let i = bitLength; i < blockSize; i += 8) {
        str += padder;
      }
    } else if (bitLength > blockSize) {
      while (str.length * 8 % blockSize != 0) {
        str += padder;
      }
    }
    return Buffer.from(str, format).toString("utf8");
  }
  /**
   *  Encrypt / Input: ASCII , Output: HEX
   *
   * @param password - key / password for decrypting message
   * @param decrypted - messages for encrypting
   */
  encrypt_hex(password, decrypted) {
    try {
      const iv = Buffer.alloc(16);
      iv.fill(0);
      let aes;
      switch (password.length) {
        case 16:
          aes = "aes-128-cbc";
          break;
        case 24:
          aes = "aes-192-cbc";
          break;
        case 32:
          aes = "aes-256-cbc";
          break;
        default:
          throw new Error(`Could not encrypt to hex. Wrong password length.`);
      }
      const cipher = import_crypto.default.createCipheriv(aes, password, iv);
      let encrypt = cipher.update(decrypted);
      encrypt = Buffer.concat([encrypt, cipher.final()]);
      return encrypt.toString("hex");
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
  decrypt_hex(password, encrypted) {
    try {
      const iv = Buffer.alloc(16);
      iv.fill(0);
      let aes;
      switch (password.length) {
        case 16:
          aes = "aes-128-cbc";
          break;
        case 24:
          aes = "aes-192-cbc";
          break;
        case 32:
          aes = "aes-256-cbc";
          break;
        default:
          throw new Error(`Could not decrypt from hex. Wrong password length.`);
      }
      const decipher = import_crypto.default.createDecipheriv(aes, password, iv);
      decipher.setAutoPadding(false);
      let decrypt = decipher.update(encrypted, "hex", "utf-8");
      decrypt += decipher.final("utf-8");
      return decrypt;
    } catch (err) {
      throw new Error(`Could not decrypt message`, { cause: err });
    }
  }
  /**
   * get timestamp in following format <_HH:MM:SS,MM-DD-YYYY>
   *
   * @param datum date object or leave empty
   * @returns timestamp as strng
   */
  getTimestamp(datum) {
    if (!datum) {
      datum = /* @__PURE__ */ new Date();
    }
    const month = `0${datum.getUTCMonth() + 1}`.slice(-2);
    const year = datum.getUTCFullYear();
    const day = `0${datum.getUTCDate()}`.slice(-2);
    const hour = `0${datum.getUTCHours()}`.slice(-2);
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
  isInTime(ts) {
    if (ts) {
      let [tt, dd] = ts.split(",");
      const val = /* @__PURE__ */ new Date(`${dd},${tt} UTC`);
      [tt, dd] = this.getTimestamp().substring(1).split(",");
      const now = /* @__PURE__ */ new Date();
      const diff = Math.abs((val.getMilliseconds() - now.getMilliseconds()) / 1e3);
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
  createNACK(crcformat) {
    const ts = this.getTimestamp();
    const str = `"NAK"0000R0L0A0[]${ts}`;
    const crc = this.crc16str(str);
    const len = str.length;
    const crchex = `0000${crc.toString(16)}`.slice(-4).toUpperCase();
    const lenhex = `0000${len.toString(16)}`.slice(-4).toUpperCase();
    const start = Buffer.from([10]);
    const end = Buffer.from([13]);
    let crcbuf;
    if (crcformat === "bin") {
      crcbuf = Buffer.from([crc >>> 8 & 255, crc & 255]);
      this.logger && this.logger.debug(`Created NAK : <0x0A><0x${crchex}>${lenhex}${str}<0x0D>`);
    } else {
      crcbuf = Buffer.from(crchex);
      this.logger && this.logger.debug(`Created NAK : <0x0A>${crchex}${lenhex}${str}<0x0D>`);
    }
    const lenbuf = Buffer.from(lenhex);
    const buf = Buffer.from(str);
    const nack = Buffer.concat([start, crcbuf, lenbuf, buf, end]);
    this.logger && this.logger.debug(`createNACK : ${JSON.stringify(nack)}`);
    return nack;
  }
  /**
   * get Account from config
   *
   * @param act accountnummber
   * @returns account
   */
  getAccountInfo(act) {
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
  createACK(sia2) {
    if (sia2) {
      const ts = this.getTimestamp();
      const cfg = this.getAccountInfo(sia2.act);
      let str = "";
      this.logger && this.logger.debug(`createACK (cfg) : ${JSON.stringify(cfg)}`);
      this.logger && this.logger.debug(`createACK (sia) : ${JSON.stringify(sia2)}`);
      if (sia2.crc == sia2.calc_crc && sia2.len == sia2.calc_len && cfg && this.isInTime(sia2.ts)) {
        const rpref = sia2.rpref && sia2.rpref.length > 0 ? `R${sia2.rpref}` : "";
        const lpref = sia2.lpref && sia2.lpref.length > 0 ? `L${sia2.lpref}` : "";
        if (sia2.id[0] === "*") {
          if (!cfg.aes || !cfg.password) {
            throw new Error(
              `Could not create ACK. Could not encrypt message, because AES encrypting disabled or password is missing for ${cfg.accountnumber}`
            );
          }
          const msglen = `|]${ts}`.length;
          const padlen = 16 - msglen % 16;
          const pad = Buffer.alloc(padlen, 0);
          const msg = this.encrypt_hex(cfg.password, `${pad.toString()}|] ${ts}`);
          str = `"*ACK"${sia2.seq}${rpref}${lpref}#${sia2.act}[${msg}`;
        } else {
          str = `"ACK"${sia2.seq}${rpref}${lpref}#${sia2.act}[]`;
        }
        const crc = this.crc16str(str);
        const len = str.length;
        const crchex = `0000${crc.toString(16)}`.slice(-4).toUpperCase();
        const lenhex = `0000${len.toString(16)}`.slice(-4).toUpperCase();
        const start = Buffer.from([10]);
        const end = Buffer.from([13]);
        let crcbuf;
        if (sia2 && sia2.crcformat === "bin") {
          crcbuf = Buffer.from([crc >>> 8 & 255, crc & 255]);
          this.logger && this.logger.debug(`Created ACK : <0x0A><0x${crchex}>${lenhex}${str}<0x0D>`);
        } else {
          crcbuf = Buffer.from(crchex);
          this.logger && this.logger.debug(`Created ACK : <0x0A>${crchex}${lenhex}${str}<0x0D>`);
        }
        const lenbuf = Buffer.from(lenhex);
        const buf = Buffer.from(str);
        const ack = Buffer.concat([start, crcbuf, lenbuf, buf, end]);
        this.logger && this.logger.debug(`createACK : ${JSON.stringify(ack)}`);
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
  byteToHexString(uint8arr) {
    if (!uint8arr) {
      return "";
    }
    let hexStr = "";
    for (let i = 0; i < uint8arr.length; i++) {
      let hex = (uint8arr[i] & 255).toString(16);
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
  getcrcFormat(data) {
    let crcformat = "hex";
    if (data) {
      if (data[5] == "0".charCodeAt(0) && data[9] == '"'.charCodeAt(0)) {
        crcformat = "hex";
      }
      if (data[3] == "0".charCodeAt(0) && data[7] == '"'.charCodeAt(0)) {
        crcformat = "bin";
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
  deleteAppendingZero(data) {
    if (data) {
      for (let i = data.length - 1; i > 0; i--) {
        if (data[i] === 0) {
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
  parseSIA(data) {
    data = this.deleteAppendingZero(data);
    const datalen = data.length - 1;
    const sia2 = {
      id: "",
      seq: "",
      rpref: void 0,
      lpref: void 0,
      act: "",
      data: void 0,
      data_message: void 0,
      data_extended: void 0,
      ts: void 0,
      crc: void 0,
      calc_crc: void 0,
      calc_len: 0,
      len: void 0,
      crcformat: "",
      lf: void 0,
      cr: void 0,
      str: void 0,
      pad: void 0
    };
    let str = void 0;
    if (data && data[0] == 10 && data[datalen] == 13) {
      sia2.data = data;
      sia2.lf = data[0];
      if (data[5] == "0".charCodeAt(0) && data[9] == '"'.charCodeAt(0)) {
        str = Buffer.from(data.subarray(9, datalen));
        sia2.len = parseInt(data.toString().substring(5, 9), 16);
        sia2.crc = parseInt(data.toString().substring(1, 5), 16);
        sia2.crcformat = "hex";
      }
      if (data[3] == "0".charCodeAt(0) && data[7] == '"'.charCodeAt(0)) {
        str = Buffer.from(data.subarray(7, datalen));
        sia2.len = parseInt(data.toString().substring(3, 7), 16);
        sia2.crc = data[1] * 256 + data[2];
        sia2.crcformat = "bin";
      }
      this.logger && this.logger.debug(`data : ${data}`);
      sia2.cr = data[datalen];
      if (!str) {
        throw new Error(`Could not parse SIA message. Message (str) ist empay`);
      }
      sia2.str = str.toString() || "";
      sia2.calc_len = str.length;
      sia2.calc_crc = this.crc16str(str);
      const crchex = `0000${sia2.crc.toString(16)}`.slice(-4).toUpperCase();
      const lenhex = `0000${sia2.len.toString(16)}`.slice(-4).toUpperCase();
      if (sia2.crcformat === "bin") {
        this.logger && this.logger.debug(`SIA Message : <0x0A><0x${crchex}>${lenhex}${str.toString()}<0x0D>`);
      } else {
        this.logger && this.logger.debug(`SIA Message : <0x0A>${crchex}${lenhex}${str.toString()}<0x0D>`);
      }
      this.logger && this.logger.debug(`parseSIA sia.str : ${sia2.str}`);
      if (sia2.calc_len != sia2.len || sia2.calc_crc != sia2.crc) {
        this.logger && this.logger.debug("CRC or Length different to the caclulated values");
        this.logger && this.logger.debug(`SIA crc= ${sia2.crc}, calc_crc=${sia2.calc_crc}`);
        this.logger && this.logger.debug(`SIA len= ${sia2.len}, calc_len=${sia2.calc_len}`);
        this.logger && this.logger.debug(`Message for CRC and LEN calculation${sia2.str}`);
        this.logger && this.logger.debug(`Message for CRC and LEN calculation (String)${sia2.str.toString()}`);
        throw new Error(`Could not parse SIA message. CRC Error!`);
      }
      const regexstr = /"(.+)"(\d{4})(R(.{0,6})){0,1}(L(.{0,6}))#([\w\d]+)\[(.+)/gm;
      const regexstr_result = regexstr.exec(sia2.str);
      if (regexstr_result && regexstr_result.length >= 8) {
        let lpref = void 0;
        this.logger && this.logger.debug(`parseSIA regex   : ${JSON.stringify(sia2)}`);
        sia2.id = regexstr_result[1] || "";
        sia2.seq = regexstr_result[2] || "";
        sia2.rpref = regexstr_result[4] || "";
        if (regexstr_result[5] === "L") {
          lpref = 0;
        }
        sia2.lpref = regexstr_result[6] || lpref;
        sia2.act = regexstr_result[7] || "";
        sia2.pad = "";
        let msg = regexstr_result[8] || "";
        const cfg = this.getAccountInfo(sia2.act);
        if (!cfg) {
          throw new Error(
            `Could not parse SIA message. Accountnumber ${sia2.act} missing in the configuration`
          );
        }
        if (sia2.id && sia2.id[0] == "*") {
          if (!cfg.aes || !cfg.password) {
            throw new Error(
              `Could not parse SIA message. Could not decrypt message, because AES encrypting disabled or password is missing for ${cfg.accountnumber}`
            );
          }
          msg = this.decrypt_hex(cfg.password, msg);
          if (msg) {
            const padlen = msg.indexOf("|");
            sia2.pad = msg.substring(0, padlen);
            msg = msg.substring(padlen + 1);
            this.logger && this.logger.debug(`SIA Message decrypted part: ${msg}`);
          } else {
            throw new Error(`Could not parse SIA message. Could not decrypt message`);
          }
        }
        if (sia2.id && sia2.id[0] != "*" && cfg.aes == true) {
          throw new Error(`Could not parse SIA message. Encrypting enabled, message was sent not entcrypted`);
        }
        const regexmsg = /(.+?)\](\[(.*?)\])?(_(.+)){0,1}/gm;
        const regexmsg_result = regexmsg.exec(msg);
        if (regexmsg_result && regexmsg_result.length >= 1) {
          sia2.data_message = regexmsg_result[1] || "";
          sia2.data_extended = regexmsg_result[3] || "";
          sia2.ts = regexmsg_result[5] || "";
        }
      }
    }
    this.logger && this.logger.debug(`parseSIA : ${JSON.stringify(sia2)}`);
    if (sia2 && sia2.id && sia2.seq && sia2.lpref && sia2.act && sia2.data_message) {
      return sia2;
    }
    throw new Error(`Could not parse SIA message ${data}. Required SIA fields missing`);
  }
  /**
   * Listen Server TCP
   */
  serverStartTCP() {
    const servertcp = import_net.default.createServer((sock) => {
      const remoteAddress = `${sock.remoteAddress}:${sock.remotePort}`;
      this.logger && this.logger.debug(`New client connected: ${remoteAddress}`);
      sock.on("data", (data) => {
        try {
          this.logger && this.logger.debug(`received from ${remoteAddress} following data: ${JSON.stringify(data)}`);
          this.logger && this.logger.info(`received from ${remoteAddress} following message: ${data.toString().trim()}`);
          this.emit("data", data);
          const sia2 = this.parseSIA(data);
          const ack = this.createACK(sia2);
          sock.end(ack);
          this.emit("sia", sia2, void 0);
          this.logger && this.logger.info(`sending to ${remoteAddress} following ACK message: ${ack.toString().trim()}`);
        } catch (err) {
          const crcformat = this.getcrcFormat(data);
          const ack = this.createNACK(crcformat);
          sock.end(ack);
          this.emit("sia", void 0, tools.getErrorMessage(err));
          this.logger && this.logger.error(
            `sending to ${remoteAddress} following NACK message: ${ack.toString().trim()} because of error ${tools.getErrorMessage(err)}`
          );
        }
      });
      sock.on("close", () => {
        this.logger && this.logger.info(`connection from ${remoteAddress} closed`);
      });
      sock.on("error", (err) => {
        this.logger && this.logger.error(`Connection ${remoteAddress} error:  ${tools.getErrorMessage(err)}`);
        this.emit("error", tools.getErrorMessage(err));
      });
    });
    servertcp.listen(this.port, this.host, () => {
      this.logger && this.logger.info(`SIA Server listening on IP-Adress (TCP): ${this.host}:${this.port}`);
    });
  }
  /**
   * Listen Server UDP
   */
  serverStartUDP() {
    const serverudp = import_dgram.default.createSocket("udp4");
    serverudp.on("message", (data, remote) => {
      try {
        this.logger && this.logger.debug(`received from ${remote.address} following data: ${JSON.stringify(data)}`);
        this.logger && this.logger.info(`received from ${remote.address} following message: ${data.toString().trim()}`);
        this.emit("data", data);
        const sia2 = this.parseSIA(data);
        const ack = this.createACK(sia2);
        serverudp.send(ack, 0, ack.length, remote.port, remote.address, (err, bytes) => {
        });
        this.emit("sia", { sia: sia2, undefined: void 0 });
        this.logger && this.logger.info(`sending to ${remote.address} following ACK message: ${ack.toString().trim()}`);
      } catch (err) {
        const crcformat = this.getcrcFormat(data);
        const ack = this.createNACK(crcformat);
        serverudp.send(ack, 0, ack.length, remote.port, remote.address, (err2, bytes) => {
        });
        this.emit("sia", void 0, tools.getErrorMessage(err));
        this.logger && this.logger.error(
          `sending to ${remote.address} following NACK message: ${ack.toString().trim()}  because of error ${tools.getErrorMessage(err)}`
        );
      }
    });
    serverudp.on("close", () => {
      this.logger && this.logger.info(`UDP Connection closed`);
    });
    serverudp.on("error", (err) => {
      this.logger && this.logger.error(`UDP Error: ${tools.getErrorMessage(err)}`);
      serverudp.close();
      this.emit("error", tools.getErrorMessage(err));
    });
    serverudp.bind(this.port, this.host, () => {
      this.logger && this.logger.info(
        `SIA Server listening on IP-Adress (UDP): ${serverudp.address().address}:${serverudp.address().port}`
      );
    });
  }
  /**
   * CRC Calculation. Example. crc16([0x20, 0x22])
   *
   * @param data - string
   * @returns crc
   */
  crc16(data) {
    const crctab16 = new Uint16Array([
      0,
      49345,
      49537,
      320,
      49921,
      960,
      640,
      49729,
      50689,
      1728,
      1920,
      51009,
      1280,
      50625,
      50305,
      1088,
      52225,
      3264,
      3456,
      52545,
      3840,
      53185,
      52865,
      3648,
      2560,
      51905,
      52097,
      2880,
      51457,
      2496,
      2176,
      51265,
      55297,
      6336,
      6528,
      55617,
      6912,
      56257,
      55937,
      6720,
      7680,
      57025,
      57217,
      8e3,
      56577,
      7616,
      7296,
      56385,
      5120,
      54465,
      54657,
      5440,
      55041,
      6080,
      5760,
      54849,
      53761,
      4800,
      4992,
      54081,
      4352,
      53697,
      53377,
      4160,
      61441,
      12480,
      12672,
      61761,
      13056,
      62401,
      62081,
      12864,
      13824,
      63169,
      63361,
      14144,
      62721,
      13760,
      13440,
      62529,
      15360,
      64705,
      64897,
      15680,
      65281,
      16320,
      16e3,
      65089,
      64001,
      15040,
      15232,
      64321,
      14592,
      63937,
      63617,
      14400,
      10240,
      59585,
      59777,
      10560,
      60161,
      11200,
      10880,
      59969,
      60929,
      11968,
      12160,
      61249,
      11520,
      60865,
      60545,
      11328,
      58369,
      9408,
      9600,
      58689,
      9984,
      59329,
      59009,
      9792,
      8704,
      58049,
      58241,
      9024,
      57601,
      8640,
      8320,
      57409,
      40961,
      24768,
      24960,
      41281,
      25344,
      41921,
      41601,
      25152,
      26112,
      42689,
      42881,
      26432,
      42241,
      26048,
      25728,
      42049,
      27648,
      44225,
      44417,
      27968,
      44801,
      28608,
      28288,
      44609,
      43521,
      27328,
      27520,
      43841,
      26880,
      43457,
      43137,
      26688,
      30720,
      47297,
      47489,
      31040,
      47873,
      31680,
      31360,
      47681,
      48641,
      32448,
      32640,
      48961,
      32e3,
      48577,
      48257,
      31808,
      46081,
      29888,
      30080,
      46401,
      30464,
      47041,
      46721,
      30272,
      29184,
      45761,
      45953,
      29504,
      45313,
      29120,
      28800,
      45121,
      20480,
      37057,
      37249,
      20800,
      37633,
      21440,
      21120,
      37441,
      38401,
      22208,
      22400,
      38721,
      21760,
      38337,
      38017,
      21568,
      39937,
      23744,
      23936,
      40257,
      24320,
      40897,
      40577,
      24128,
      23040,
      39617,
      39809,
      23360,
      39169,
      22976,
      22656,
      38977,
      34817,
      18624,
      18816,
      35137,
      19200,
      35777,
      35457,
      19008,
      19968,
      36545,
      36737,
      20288,
      36097,
      19904,
      19584,
      35905,
      17408,
      33985,
      34177,
      17728,
      34561,
      18368,
      18048,
      34369,
      33281,
      17088,
      17280,
      33601,
      16640,
      33217,
      32897,
      16448
    ]);
    let len = data.length;
    let buffer = 0;
    let crc = 0;
    while (len--) {
      crc = crc >>> 8 ^ crctab16[(crc ^ data[buffer++]) & 255];
    }
    return crc;
  }
  /**
   * CRC Calculation. Example. crc16([0x20, 0x22])
   *
   * @param str string
   * @returns crc as sting
   */
  crc16str(str) {
    return this.crc16(Buffer.from(str));
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  sia
});
//# sourceMappingURL=sia.js.map
