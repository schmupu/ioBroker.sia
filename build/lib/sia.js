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
var crypto = __toESM(require("crypto"));
var dgram = __toESM(require("dgram"));
var import_events = require("events");
var net = __toESM(require("net"));
var tools = __toESM(require("./tools"));
class sia extends import_events.EventEmitter {
  timeout;
  accounts;
  port;
  host;
  logger;
  serverudp;
  servertcp;
  sockend;
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
  constructor(parameter) {
    super();
    this.timeout = parameter.timeout === void 0 ? 10 : parameter.timeout;
    this.sockend = parameter.sockend ? true : false;
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
    this.serverudp = dgram.createSocket("udp4");
    this.servertcp = net.createServer();
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
      const cipher = crypto.createCipheriv(aes, password, iv);
      let encrypt = cipher.update(decrypted);
      encrypt = Buffer.concat([encrypt, cipher.final()]);
      return encrypt.toString("hex");
    } catch (err) {
      throw new Error(`Could not encrypt message ${tools.getErrorMessage(err)}`);
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
      const decipher = crypto.createDecipheriv(aes, password, iv);
      decipher.setAutoPadding(false);
      let decrypt = decipher.update(encrypted, "hex", "utf-8");
      decrypt += decipher.final("utf-8");
      return decrypt;
    } catch (err) {
      throw new Error(`Could not decrypt message ${tools.getErrorMessage(err)}`);
    }
  }
  /**
   * get timestamp in GMT in following format <HH:MM:SS,MM-DD-YYYY>
   *
   * @returns timestamp as strng
   */
  getSIATimestampFromUTCDateNow() {
    const date = /* @__PURE__ */ new Date();
    const hours = String(date.getUTCHours()).padStart(2, "0");
    const minutes = String(date.getUTCMinutes()).padStart(2, "0");
    const seconds = String(date.getUTCSeconds()).padStart(2, "0");
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const day = String(date.getUTCDate()).padStart(2, "0");
    const year = date.getUTCFullYear();
    return `${hours}:${minutes}:${seconds},${month}-${day}-${year}`;
  }
  /**
   * you get local Timen from GMT timestamp in format <HH:MM:SS,MM-DD-YYYY>
   *
   * @param ts date string in format HH:MM:SS,MM-DD-YYY
   * @returns localtime as Date
   */
  getUTCDateFromSIATimestamp(ts) {
    const [timePart, datePart] = ts.split(",");
    const [hours, minutes, seconds] = timePart.split(":").map(Number);
    const [month, day, year] = datePart.split("-").map(Number);
    const gmtDate = new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds));
    return gmtDate;
  }
  /**
   * Is SIA Message in timerange (for example +20 or -40 seconds)
   *
   * @param ts1 date string in format HH:MM:SS,MM-DD-YYY
   * @param ts2 date string in format HH:MM:SS,MM-DD-YYY
   * @returns true if timestamp in range, else false
   */
  isInTime(ts1, ts2) {
    if (!ts1 || ts1.length === 0) {
      return true;
    }
    const date_ts1 = this.getUTCDateFromSIATimestamp(ts1);
    ts2 = ts2 && ts2.length > 0 ? ts2 : this.getSIATimestampFromUTCDateNow();
    const date_ts2 = this.getUTCDateFromSIATimestamp(ts2);
    this.logger && this.logger.debug(`Timestamp date_ts: ${date_ts1.toLocaleString()}`);
    this.logger && this.logger.debug(`Timestamp date_now: ${date_ts2.toLocaleString()}`);
    const diff = Math.abs((date_ts2.valueOf() - date_ts1.valueOf()) / 1e3);
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
   * SIA Message was not succesfull, create NAK
   *
   * @param data message
   * @returns NAK Message
   */
  createNACK(data) {
    const ts = this.getSIATimestampFromUTCDateNow();
    const str = `"NAK"0000R0L0A0[]_${ts}`;
    const crc = this.crc16str(str);
    const len = str.length;
    const crchex = `0000${crc.toString(16)}`.slice(-4).toUpperCase();
    const lenhex = `0000${len.toString(16)}`.slice(-4).toUpperCase();
    const start = Buffer.from([10]);
    const end = Buffer.from([13]);
    let crcbuf;
    const crcformat = this.getcrcFormat(data);
    switch (crcformat) {
      case "bin":
        crcbuf = Buffer.from([crc >>> 8 & 255, crc & 255]);
        this.logger && this.logger.debug(`Created NAK : <0x0A><0x${crchex}>${lenhex}${str}<0x0D>`);
        break;
      case "hex":
        crcbuf = Buffer.from(crchex);
        this.logger && this.logger.debug(`Created NAK : <0x0A>${crchex}${lenhex}${str}<0x0D>`);
        break;
      default:
        crcbuf = Buffer.from("");
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
  createACK(sia2) {
    if (!sia2) {
      throw new Error(`Could not create ACK for message!`);
    }
    const ts = this.getSIATimestampFromUTCDateNow();
    const cfg = this.getAccountInfo(sia2.act);
    if (!cfg) {
      throw new Error(`Could not create ACK. Accountnumber ${sia2.act} missing in the configuration`);
    }
    const intime = sia2.ts && sia2.ts.length > 0 ? this.isInTime(sia2.ts, ts) : true;
    this.logger && this.logger.debug(`createACK (cfg) : ${JSON.stringify(cfg)}`);
    this.logger && this.logger.debug(`createACK (sia) : ${JSON.stringify(sia2)}`);
    let str = "";
    if (!intime) {
      throw new Error(`Could not create ACK. Message to old (timestamp msg: ${sia2.ts}, timestamp now: ${ts})`);
    }
    if (sia2.calc_len != sia2.len) {
      throw new Error(`Could not create ACK. Length of message is not correct!`);
    }
    if (sia2.calc_crc != sia2.crc) {
      throw new Error(`Could not create ACK. CRC of message is not correct!`);
    }
    const rpref = sia2.rpref && sia2.rpref.length > 0 ? `R${sia2.rpref}` : "";
    const lpref = sia2.lpref && sia2.lpref.length > 0 ? `L${sia2.lpref}` : "";
    switch (sia2.id) {
      case "*SIA-DCS":
      case "*ADM-CID": {
        if (!cfg.aes || !cfg.password) {
          throw new Error(
            `Could not create ACK. Could not encrypt message, because AES encrypting disabled or password is missing for ${cfg.accountnumber}`
          );
        }
        const msglen = `|]_${ts}`.length;
        const padlen = 16 - msglen % 16;
        const pad = Buffer.alloc(padlen, 0);
        const msg = this.encrypt_hex(cfg.password, `${pad.toString()}|]_${ts}`);
        str = `"*ACK"${sia2.seq}${rpref}${lpref}#${sia2.act}[${msg}`;
        break;
      }
      case "SIA-DCS":
      case "ADM-CID": {
        str = `"ACK"${sia2.seq}${rpref}${lpref}#${sia2.act}[]`;
        break;
      }
      default:
        break;
    }
    const crc = this.crc16str(str);
    const len = str.length;
    const crchex = `0000${crc.toString(16)}`.slice(-4).toUpperCase();
    const lenhex = `0000${len.toString(16)}`.slice(-4).toUpperCase();
    const start = Buffer.from([10]);
    const end = Buffer.from([13]);
    let crcbuf;
    switch (sia2 == null ? void 0 : sia2.crcformat) {
      case "bin":
        crcbuf = Buffer.from([crc >>> 8 & 255, crc & 255]);
        this.logger && this.logger.debug(`Created ACK : <0x0A><0x${crchex}>${lenhex}${str}<0x0D>`);
        break;
      case "hex":
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
    if (data) {
      if (data[5] == "0".charCodeAt(0) && data[9] == '"'.charCodeAt(0)) {
        return "hex";
      }
      if (data[3] == "0".charCodeAt(0) && data[7] == '"'.charCodeAt(0)) {
        return "bin";
      }
    }
    return "";
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
  parseSIA(data) {
    data = this.deleteAppendingZero(data);
    const datalen = data.length - 1;
    if (!data || data[0] !== 10 || data[datalen] !== 13) {
      throw new Error(`Receive message ${data == null ? void 0 : data.toString()} is corrupted.`);
    }
    const crcformat = this.getcrcFormat(data);
    let str = "";
    let len = "";
    let crc = "";
    switch (crcformat) {
      case "hex":
        str = Buffer.from(data.subarray(9, datalen)).toString();
        len = data.subarray(5, 9).toString().toUpperCase();
        crc = data.subarray(1, 5).toString().toUpperCase();
        this.logger && this.logger.debug(`SIA Message : <0x0A>${crc}${len}${str == null ? void 0 : str.toString()}<0x0D>`);
        break;
      case "bin":
        str = Buffer.from(data.subarray(7, datalen)).toString();
        len = `0000${data.subarray(3, 7).toString()}`.slice(-4).toUpperCase();
        crc = `0000${(data[1] * 256 + data[2]).toString(16)}`.slice(-4).toUpperCase();
        this.logger && this.logger.debug(`SIA Message : <0x0A><0x${crc}>${len}${str == null ? void 0 : str.toString()}<0x0D>`);
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
      throw new Error("Could not parse SIA message. Message corupted");
    }
    const id = regexstr_result[1] || "";
    const seq = regexstr_result[2] || "";
    const rpref = regexstr_result[4] || "";
    const lpref = regexstr_result[6] || "";
    const act = regexstr_result[7] || "";
    let msg = regexstr_result[8] || "";
    const cfg = this.getAccountInfo(act);
    if (!cfg) {
      throw new Error(`Could not parse SIA message. Accountnumber ${act} missing in the configuration`);
    }
    switch (id) {
      case "*SIA-DCS":
      case "*ADM-CID":
        if (!cfg.aes || !cfg.password) {
          throw new Error(
            `Could not parse SIA message. Could not decrypt message, because AES encrypting disabled or password is missing for ${cfg.accountnumber}`
          );
        }
        msg = this.decrypt_hex(cfg.password, msg);
        if (msg) {
          const padlen = msg.indexOf("|");
          msg = msg.substring(padlen + 1);
          this.logger && this.logger.debug(`SIA Message decrypted part: ${msg}`);
        } else {
          throw new Error(`Could not parse SIA message. Could not decrypt message`);
        }
        break;
      case "SIA-DCS":
      case "ADM-CID":
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
    const data_message = regexmsg_result[1] || "";
    const data_extended = regexmsg_result[3] || "";
    const ts = regexmsg_result[5] || "";
    const sia2 = {
      id,
      seq,
      lpref,
      rpref,
      act,
      data_extended,
      data_message,
      crc,
      len,
      data,
      calc_crc,
      calc_len,
      crcformat,
      str,
      ts
    };
    this.logger && this.logger.debug(`parseSIA : ${JSON.stringify(sia2)}`);
    if (sia2 && sia2.id.length > 0 && sia2.seq.length > 0 && sia2.lpref.length > 0 && sia2.act.length > 0 && sia2.data_message.length > 0) {
      return sia2;
    }
    throw new Error(`Could not parse SIA message ${data.toString()}. Required SIA fields missing`);
  }
  /**
   * Listen Server TCP
   */
  serverStartTCP() {
    this.servertcp.on("connection", (sock) => {
      let handletimeout = void 0;
      const remoteAddress = `${sock.remoteAddress}:${sock.remotePort}`;
      this.logger && this.logger.debug(`New client connected: ${remoteAddress}`);
      sock.on("data", (data) => {
        try {
          this.logger && this.logger.debug(`received from ${remoteAddress} following data: ${JSON.stringify(data)}`);
          this.logger && this.logger.info(`received from ${remoteAddress} following message: ${data.toString().trim()}`);
          this.emit("data", data);
          const sia2 = this.parseSIA(data);
          const ack = this.createACK(sia2);
          sock.write(ack);
          if (this.sockend) {
            sock.end();
          } else {
            handletimeout = setTimeout(() => {
              this.logger && this.logger.info(`disconnecting connection from ${remoteAddress}`);
              sock.end();
            }, 30 * 1e3);
          }
          this.emit("sia", sia2, void 0);
          this.logger && this.logger.info(`sending to ${remoteAddress} following ACK message: ${ack.toString().trim()}`);
        } catch (err) {
          const ack = this.createNACK(data);
          sock.write(ack);
          sock.end(ack);
          this.emit("sia", void 0, tools.getErrorMessage(err));
          this.logger && this.logger.error(
            `sending to ${remoteAddress} following NACK message: ${ack.toString().trim()} because of error ${tools.getErrorMessage(err)}`
          );
        }
      });
      sock.on("end", () => {
        if (!this.sockend) {
          handletimeout && clearTimeout(handletimeout);
        }
        this.logger && this.logger.info(`connection from ${remoteAddress} disconnected`);
      });
      sock.on("close", () => {
        this.logger && this.logger.info(`connection from ${remoteAddress} closed`);
      });
      sock.on("error", (err) => {
        this.logger && this.logger.error(`Connection ${remoteAddress} error:  ${tools.getErrorMessage(err)}`);
        this.emit("error", tools.getErrorMessage(err));
      });
    });
    this.servertcp.on("close", () => {
      this.logger && this.logger.info(`TCP Listen server on ${this.host}:${this.port} closed`);
      this.emit("close");
    });
    this.servertcp.listen(this.port, this.host, () => {
      this.logger && this.logger.info(`SIA Server listening on IP-Adress (TCP): ${this.host}:${this.port}`);
    });
  }
  /**
   * Stop TCP Server
   */
  serverStopTCP() {
    if (this.servertcp) {
      this.servertcp.close((err) => {
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
  serverStartUDP() {
    this.serverudp.on("message", (data, remote) => {
      try {
        this.logger && this.logger.debug(`received from ${remote.address} following data: ${JSON.stringify(data)}`);
        this.logger && this.logger.info(`received from ${remote.address} following message: ${data.toString().trim()}`);
        this.emit("data", data);
        const sia2 = this.parseSIA(data);
        const ack = this.createACK(sia2);
        this.serverudp.send(ack, 0, ack.length, remote.port, remote.address, (err, bytes) => {
        });
        this.emit("sia", sia2, void 0);
        this.logger && this.logger.info(`sending to ${remote.address} following ACK message: ${ack.toString().trim()}`);
      } catch (err) {
        const ack = this.createNACK(data);
        this.serverudp.send(ack, 0, ack.length, remote.port, remote.address, (err2, bytes) => {
        });
        this.emit("sia", void 0, tools.getErrorMessage(err));
        this.logger && this.logger.error(
          `sending to ${remote.address} following NACK message: ${ack.toString().trim()}  because of error ${tools.getErrorMessage(err)}`
        );
      }
    });
    this.serverudp.on("close", () => {
      this.logger && this.logger.info(`UDP Connection closed`);
      this.emit("close");
    });
    this.serverudp.on("error", (err) => {
      this.logger && this.logger.error(`UDP Error: ${tools.getErrorMessage(err)}`);
      this.emit("error", tools.getErrorMessage(err));
    });
    this.serverudp.bind(this.port, this.host, () => {
      this.logger && this.logger.info(
        `SIA Server listening on IP-Adress (UDP): ${this.serverudp.address().address}:${this.serverudp.address().port}`
      );
    });
  }
  /**
   * Stop UDP Server
   */
  serverStopUDP() {
    if (this.serverudp) {
      this.serverudp.close(() => {
        this.logger.info(
          `Close UDP Listen server on: ${this.serverudp.address().address}:${this.serverudp.address().port}`
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
  crc16old(data) {
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
   * @param buffer has to bei a Buffer like crc16([0x20, 0x22])
   * @returns crc as number
   */
  crc16(buffer) {
    let crc = 0;
    for (let idx = 0; idx < buffer.length; idx++) {
      const byte = buffer[idx];
      let temp = byte & 255;
      for (let i = 0; i < 8; i++) {
        temp ^= crc & 1;
        crc >>= 1;
        if (temp & 1) {
          crc ^= 40961;
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
  crc16str(str) {
    const crc = this.crc16(Buffer.from(str));
    return crc;
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  sia
});
//# sourceMappingURL=sia.js.map
