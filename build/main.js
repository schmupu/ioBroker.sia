"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
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
var utils = __toESM(require("@iobroker/adapter-core"));
var fs = __toESM(require("fs"));
var dp = __toESM(require("./lib/datapoints"));
var siamanager = __toESM(require("./lib/sia"));
var tools = __toESM(require("./lib/tools"));
class sia extends utils.Adapter {
  onlineCheckAvailable;
  onlineCheckTimeout;
  siaclient;
  constructor(options = {}) {
    super({
      ...options,
      name: "sia"
    });
    this.onlineCheckAvailable = false;
    this.onlineCheckTimeout = void 0;
    this.on("ready", this.onReady.bind(this));
    this.on("stateChange", this.onStateChange.bind(this));
    this.on("objectChange", this.onObjectChange.bind(this));
    this.on("message", this.onMessage.bind(this));
    this.on("unload", this.onUnload.bind(this));
  }
  /**
   * Is called when databases are connected and adapter received configuration.
   */
  async onReady() {
    await this.setState("info.connection", { val: true, ack: true });
    this.subscribeStates("*");
    this.log.info(`Starting Adapter ${this.namespace} in version ${this.version}`);
    await this.deleteObjects();
    await this.createObjects();
    const accounts = this.config.keys;
    try {
      this.siaclient = new siamanager.sia({
        timeout: this.config.timeout,
        host: this.config.bind,
        port: this.config.port,
        adapter: this
      });
      this.siaclient.setAccounts(accounts);
      this.siaclient.serverStartTCP();
      this.siaclient.serverStartUDP();
    } catch (err) {
      this.log.error(`Error (1): ${tools.getErrorMessage(err)}`);
    }
    this.siaclient.on("sia", async (sia2, err) => {
      if (sia2) {
        try {
          await this.setStatesSIA(sia2);
        } catch (err2) {
          this.log.error(`Error (2): ${tools.getErrorMessage(err2)}`);
        }
      }
      if (err) {
        this.log.error(`Error (3): ${err}`);
      }
    });
    this.siaclient.on("data", (data) => {
      if (data) {
        this.log.debug(`Data: ${JSON.stringify(data)}`);
        if (this.config.save) {
          const filename = `${tools.addSlashToPath(this.config.path)}sia_msg_${tools.getGuid()}.txt`;
          try {
            fs.writeFileSync(filename, data, "binary");
            if (fs.existsSync(filename)) {
              this.log.info(`Save SIA message to ${filename}`);
            } else {
              this.log.error(`Could not write SIA message to file ${filename}.`);
            }
          } catch (err) {
            this.log.error(
              `Could not write SIA message to file ${filename}. ${tools.getErrorMessage(err)}`
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
  async onUnload(callback) {
    try {
      this.log.info(`Stopping sia processes, please wait!`);
      await this.setState("info.connection", { val: false, ack: true });
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
  async onObjectChange(id, obj) {
  }
  /**
   * Is called if a subscribed state changes
   *
   * @param id id of state
   * @param state state
   */
  onStateChange(id, state) {
    if (state && !state.ack) {
      const stateId = id.replace(`${this.namespace}.`, "");
    }
  }
  /**
   * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
   * Using this method requires "common.messagebox" property to be set to true in io-package.json
   *
   * @param obj object
   */
  onMessage(obj) {
    if (typeof obj === "object" && obj.message) {
      switch (obj.command) {
        case "msg": {
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
  getAcountNumberID(accountnumber) {
    const id = accountnumber.replace(/[.\s]+/g, "_");
    return id;
  }
  async deleteObjects() {
    try {
      await this.getAdapterObjects((obj) => {
        for (const idx in obj) {
          if (!idx.startsWith(`${this.namespace}.accounts.`) || obj[idx].type !== "channel") {
            continue;
          }
          let found = false;
          for (const key of this.config.keys) {
            const idkey = `${this.namespace}.accounts.${this.getAcountNumberID(key.accountnumber)}`;
            if (idx === idkey) {
              found = true;
              break;
            }
          }
          if (found === false) {
            const id = idx.replace("${this.adapter.namespace}.", "");
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
  async createObjects() {
    for (const key of this.config.keys) {
      const id = `accounts.${this.getAcountNumberID(key.accountnumber)}`;
      const obj = dp.dpSIA || {};
      const ret = await this.setObjectNotExists(id, {
        type: "channel",
        common: {
          name: key.accountnumber
        },
        native: {}
      });
      if (ret) {
        this.log.debug(`Create object ${id}`);
      }
      for (const prop in obj) {
        const sid = `${id}.${prop}`;
        const parameter = JSON.parse(JSON.stringify(obj[prop]));
        parameter.name = `${key.accountnumber} - ${parameter.name}`;
        const ret2 = await this.setObjectNotExists(sid, {
          type: "state",
          common: parameter,
          native: {}
        });
        if (ret2) {
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
  convertToUnixTime(timeString) {
    const regex = /(\d{2}):(\d{2}):(\d{2}),(\d{2})-(\d{2})-(\d{4})/;
    const match = timeString.match(regex);
    if (!match) {
      throw new Error(`Ung\xFCltiges Zeitformat`);
    }
    try {
      const [_, hours, minutes, seconds, month, day, year] = match.map(Number);
      const date = new Date(year, month - 1, day, hours, minutes, seconds);
      return date;
    } catch (err) {
      throw new Error(`Ung\xFCltiges Zeitformat`);
    }
  }
  /**
   * Set state for SIA message
   *
   * @param sia - SIA Message
   */
  async setStatesSIA(sia2) {
    const obj = dp.dpSIA || {};
    let val = void 0;
    if (!(sia2 == null ? void 0 : sia2.act)) {
      return;
    }
    this.log.debug(`setStatesSIA for ${sia2.act} : ${JSON.stringify(sia2)}`);
    const id = `accounts.${this.getAcountNumberID(sia2.act)}`;
    if (!await this.objectExists(id)) {
      return;
    }
    for (const prop in obj) {
      const sid = `${id}.${prop}`;
      switch (prop) {
        case "id":
          val = sia2.id;
          break;
        case "sequence":
          val = sia2.seq;
          break;
        case "rpref":
          val = sia2.rpref;
          break;
        case "lpref":
          val = sia2.lpref;
          break;
        case "accountnumber":
          val = sia2.act;
          break;
        case "msgdata":
          val = sia2.data_message;
          break;
        case "extdata":
          val = sia2.data_extended;
          break;
        case "ts":
          try {
            val = this.convertToUnixTime(sia2.ts).toString();
          } catch (err) {
            val = sia2.ts;
          }
          break;
        case "crc":
          val = sia2.crc;
          break;
        case "len":
          val = sia2.len;
          break;
        default:
          val = void 0;
      }
      this.log.debug(`ackSIA : set state for id ${sid} with value ${val}`);
      await this.setState(sid, {
        val,
        ack: true
      });
    }
  }
}
if (require.main !== module) {
  module.exports = (options) => new sia(options);
} else {
  (() => new sia())();
}
//# sourceMappingURL=main.js.map
