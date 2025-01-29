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
var tools_exports = {};
__export(tools_exports, {
  _translateText: () => _translateText,
  addSlashToPath: () => addSlashToPath,
  getErrorMessage: () => getErrorMessage,
  getFilenameWithoutExtension: () => getFilenameWithoutExtension,
  getGuid: () => getGuid,
  isArray: () => isArray,
  isHexString: () => isHexString,
  isObject: () => isObject,
  isWindow: () => isWindow,
  propertiesObjAinObjB: () => propertiesObjAinObjB,
  sendSSH: () => sendSSH,
  substr: () => substr,
  textToNumber: () => textToNumber,
  wait: () => wait
});
module.exports = __toCommonJS(tools_exports);
var import_axios = __toESM(require("axios"));
var import_node_ssh = require("node-ssh");
function wait(seconds) {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1e3));
}
function substr(text, start, length) {
  length = length === void 0 || length > text.length ? text.length : length;
  const retstr = text.substring(start, start + length);
  return retstr;
}
function isHexString(text) {
  return /^[0-9A-Fa-f]+$/.test(text);
}
function getGuid() {
  function _p8(s) {
    const p = substr(`${Math.random().toString(16)}000000000`, 2, 8);
    return s ? `-${substr(p, 0, 4)}-${substr(p, 4, 4)}` : p;
  }
  return `${_p8(false)}${_p8(true)}${_p8(true)}${_p8(false)}`;
}
function textToNumber(text) {
  let numb = "";
  if (text) {
    numb = text.match(/[\d*#]/g);
    numb = numb.join("");
  }
  return numb;
}
function isObject(it) {
  return Object.prototype.toString.call(it) === "[object Object]";
}
function isArray(it) {
  if (Array.isArray != null) {
    return Array.isArray(it);
  }
  return Object.prototype.toString.call(it) === "[object Array]";
}
async function _translateText(text, targetLang) {
  if (targetLang === "en") {
    return text;
  }
  try {
    const url = `http://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}&ie=UTF-8&oe=UTF-8`;
    const response = await (0, import_axios.default)({ url, timeout: 5e3 });
    if (isArray(response.data)) {
      return response.data[0][0][0];
    }
    throw new Error("Invalid response for translate request");
  } catch (e) {
    throw new Error(`Could not translate to "${targetLang}"`);
  }
}
function isWindow() {
  return process.platform.startsWith("win");
}
function addSlashToPath(path) {
  if (isWindow() && (path == null ? void 0 : path.slice(-1)) != "\\") {
    return `${path}\\`;
  }
  if (!isWindow() && (path == null ? void 0 : path.slice(-1)) != "/") {
    return `${path}/`;
  }
  return path;
}
function getFilenameWithoutExtension(filename) {
  return filename.split(".").slice(0, -1).join(".") || filename;
}
async function sendSSH(srcfile, dstfile, config) {
  const ssh = new import_node_ssh.NodeSSH();
  await ssh.connect(config);
  await ssh.putFile(srcfile, dstfile);
}
function getErrorMessage(error) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
function propertiesObjAinObjB(obja, objb) {
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
    if (typeof obja[p] !== "object") {
      return false;
    }
    if (!propertiesObjAinObjB(obja[p], objb[p])) {
      return false;
    }
  }
  return true;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  _translateText,
  addSlashToPath,
  getErrorMessage,
  getFilenameWithoutExtension,
  getGuid,
  isArray,
  isHexString,
  isObject,
  isWindow,
  propertiesObjAinObjB,
  sendSSH,
  substr,
  textToNumber,
  wait
});
//# sourceMappingURL=tools.js.map
