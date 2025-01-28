"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
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
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var datapoints_exports = {};
__export(datapoints_exports, {
  dpSIA: () => dpSIA
});
module.exports = __toCommonJS(datapoints_exports);
const dpSIA = {
  id: {
    type: "string",
    role: "text",
    name: "ID Token",
    // String
    read: true,
    write: false,
    def: ""
  },
  sequence: {
    type: "string",
    role: "value",
    // Number 4 character, 0-9
    name: "Sequence Number",
    read: true,
    write: false,
    def: ""
  },
  rpref: {
    type: "string",
    role: "text",
    name: "Receive Number",
    // 1-6 ASCII (0-F)
    read: true,
    write: false,
    def: ""
  },
  lpref: {
    type: "string",
    role: "text",
    name: "Account Prefix",
    // 1-6 ASCII (0-F)
    read: true,
    write: false,
    def: ""
  },
  accountnumber: {
    type: "string",
    role: "text",
    name: "Account Number",
    // 3-16 ASCII (0-F)
    read: true,
    write: false,
    def: ""
  },
  msgdata: {
    type: "string",
    role: "text",
    name: "Message Data",
    // ASCII
    read: true,
    write: false,
    def: ""
  },
  extdata: {
    type: "string",
    role: "text",
    name: "Extended Data",
    // ASCII
    read: true,
    write: false,
    def: ""
  },
  /*
  ts: {
    type: 'number',
    role: 'value.time',
    name: 'Timestamp', // Timestamp
    read: true,
    write: false
  },
  */
  ts: {
    type: "string",
    role: "text",
    name: "Timestamp",
    // Timestamp
    read: true,
    write: false,
    def: /* @__PURE__ */ new Date()
  },
  crc: {
    type: "number",
    role: "value",
    name: "CRC16",
    // CRC
    read: true,
    write: false,
    def: 0
  },
  len: {
    type: "number",
    role: "value",
    name: "Length of Message",
    // Länge
    read: true,
    write: false,
    def: 0
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  dpSIA
});
//# sourceMappingURL=datapoints.js.map
