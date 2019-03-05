/* jshint -W097 */
/* jshint -W030 */
/* jshint strict:true */
/* jslint node: true */
/* jslint esversion: 6 */
'use strict';

const utils = require('@iobroker/adapter-core');
const dp = require(__dirname + '/lib/datapoints');
const net = require('net');
const crypto = require('crypto');
const adapterName = require('./package.json').name.split('.').pop();

let server = null; // Server instance
let adapter;

function startAdapter(options) {
  options = options || {};
  options.name = adapterName;
  adapter = new utils.Adapter(options);

  // *****************************************************************************************************
  // is called when adapter shuts down - callback has to be called under any circumstances!
  // *****************************************************************************************************
  adapter.on('unload', function (callback) {
    try {
      adapter.log.info('Closing SIA Server');
      if (server) {
        server.close();
      }
      callback();
    } catch (e) {
      callback();
    }
  });

  // *****************************************************************************************************
  // is called when databases are connected and adapter received configuration.
  // start here!
  // *****************************************************************************************************
  adapter.on('ready', function () {
    adapter.log.info("Starting " + adapter.namespace);
    adapter.getForeignObject('system.config', (err, obj) => {
      if (adapter.config.keys) {
        for (let i in adapter.config.keys) {
          for (let j in adapter.config.keys[i]) {
            if (j === 'password') {
              if (obj && obj.native && obj.native.secret) {
                adapter.config.keys[i][j] = decrypt(obj.native.secret, adapter.config.keys[i][j]);
              } else {
                adapter.config.keys[i][j] = decrypt('Zgfr56gFe87jJOM', adapter.config.keys[i][j]);
              }
            }
          }
        }
      }
      main();
    });
  });
  return adapter;
}

// *****************************************************************************************************
// Password decrypt
// *****************************************************************************************************
// decrypt password
function decrypt(key, value) {
  let result = '';
  if (value.startsWith('(crypt)')) {
    value = value.substr(7);
    for (let i = 0; i < value.length; ++i) {
      result += String.fromCharCode(key[i % key.length].charCodeAt(0) ^ value.charCodeAt(i));
    }
  } else {
    result = value;
  }
  return result;
}

// *****************************************************************************************************
// Main function
// *****************************************************************************************************
function main() {

  for (let i in adapter.config.keys) {
    if (adapter.config.keys[i].aes === true) {
      if(adapter.config.keys[i].hex === true) {
        // if password is hex instead of byte, convert hex to byte
        adapter.config.keys[i].password = new Buffer(adapter.config.keys[i].password, 'hex').toString();
      }
      let len = adapter.config.keys[i].password.length;
        // Password for AES is not allowed to be longer than 16, 24 and 32 characters 
      if (len !== 16 && len !== 24 && len !== 32) {
        adapter.log.error('Password for accountnumber ' + adapter.config.keys[i].accountnumber + ' must be 16, 24 or 32 Byte or 32, 48 or 64 Hex long');
      }
    }
  }


  // delete not used / missing object in configuration
  deleteObjects();
  // add object from configuration.
  createObjects();
  // start socket server
  serverStart();
  // all states changes inside the adapters namespace are subscribed
  // adapter.subscribeStates('*');
}

// *****************************************************************************************************
// convert subcriber to ID for using as channel name. Special characters and spaces are deleted.
// *****************************************************************************************************
function getAcountNumberID(accountnumber) {
  var id = accountnumber.replace(/[.\s]+/g, '_');
  return id;
}

// *****************************************************************************************************
// delete channel and states which are missing in configuration
// *****************************************************************************************************
function deleteChannel(obj) {
  // adapter.log.info('deleteChannel: ' + JSON.stringify(obj));
  // search recrusive for channel name. If found and missing in
  // configuration, delete channel and all states
  Object.keys(obj).forEach((key) => {
    if (obj[key] && typeof obj[key] === 'object') {
      deleteChannel(obj[key]); // recurse.
    } else {
      if (obj[key] == 'channel') {
        var found = false;
        var channelname = obj.common.name;
        // Channel Name ist ein accountnumber
        for (var i = 0; i < adapter.config.keys.length; i++) {
          var keyc = adapter.config.keys[i];
          var idc = getAcountNumberID(keyc.accountnumber);
          if (idc == channelname) {
            found = true;
          }
        }
        if (!found) {
          adapter.deleteChannel(channelname);
        }
      }
    }
  });
}

// *****************************************************************************************************
// list of all objects (devices, channel, states) for this instance. call function  deleteChannel
// for deleting old (not used) channels in configuration
// *****************************************************************************************************
function deleteObjects() {
  adapter.getAdapterObjects(function (obj) {
    deleteChannel(obj);
  });
}

// *******************************************************************************
// Compare if propierties of object a exist in  object b
// *******************************************************************************
function propertiesObjAinObjB(obja, objb) {
  if (obja === objb) return true;
  if (!(obja instanceof Object) || !(objb instanceof Object)) return false;
  if (obja.constructor !== objb.constructor) return false;
  for (let p in obja) {
    if (!obja.hasOwnProperty(p)) continue;
    if (!objb.hasOwnProperty(p)) return false;
    if (obja[p] === objb[p]) continue;
    if (typeof (obja[p]) !== "object") return false;
    if (!propertiesObjAinObjB(obja[p], objb[p])) return false; // Objects and Arrays must be tested recursively
  }
  return true;
}

// *****************************************************************************************************
// create for every ID a channel and create a few states
// *****************************************************************************************************
function createObjectSIA(id, key) {
  let obj = dp.dpSIA || {};
  adapter.setObjectNotExists(id, {
    type: 'channel',
    common: {
      name: key.accountnumber
    },
    native: {}
  });
  for (let prop in obj) {
    let sid = id + '.' + prop;
    let parameter = JSON.parse(JSON.stringify(obj[prop]));
    parameter.name = key.accountnumber + ' ' + parameter.name;
    /*
    adapter.setObjectNotExists(sid, {
      type: 'state',
      common: parameter,
      native: {}
    });
    */
    adapter.getObject(sid, function (err, obj) {
      if (!obj) {
        adapter.setObjectNotExists(sid, {
          type: 'state',
          common: parameter,
          native: {}
        }, function () {
          adapter.log.debug("Create parameters for object " + sid);
        });
      } else {
        parameter.name = obj.common.name;
        if (!propertiesObjAinObjB(parameter, obj.common)) {
          obj.common = parameter;
          adapter.extendObject(sid, obj, function () {
            adapter.log.debug("Changed parameters for object " + sid);
          });
        }
      }
    });
  }
}

// *****************************************************************************************************
// read configuration, and create for all accountnumbers a channel and states
// *****************************************************************************************************
function createObjects() {
  for (var i = 0; i < adapter.config.keys.length; i++) {
    var key = adapter.config.keys[i];
    var id = getAcountNumberID(key.accountnumber);
    createObjectSIA(id, key);
  }
}

// *****************************************************************************************************
// ASCII Text -> BYTES
// *****************************************************************************************************
function getBytes(text) {
  let bytes = [];
  for (let i = 0; i < text.length; i++) {
    let charCode = text.charCodeAt(i);
    let cLen = Math.ceil(Math.log(charCode) / Math.log(256));
    for (let j = 0; j < cLen; j++) {
      bytes.push((charCode << (j * 8)) & 0xFF);
    }
  }
  return bytes;
}

// *****************************************************************************************************
// Padding /  str = customPadding(str, 16, 0x0, "hex"); // magic happens here
// *****************************************************************************************************
function customPadding(str, bytelen, padder, format) {
  let blockSize = bytelen * 16;
  str = new Buffer(str, "utf8").toString(format);
  //1 char = 8bytes
  let bitLength = str.length * 8;
  if (bitLength < blockSize) {
    for (let i = bitLength; i < blockSize; i += 8) {
      str += padder;
    }
  } else if (bitLength > blockSize) {
    while ((str.length * 8) % blockSize != 0) {
      str += padder;
    }
  }
  return new Buffer(str, format).toString("utf8");
}

// *****************************************************************************************************
// Encrypt / Input: ASCII , Output: HEX
// *****************************************************************************************************
function encrypt_hex(password, decrypted) {
  try {
    let test = decrypted.length;
    let iv = new Buffer(16);
    iv.fill(0);
    let crypted = decrypted;
    let aes;
    // password = customPadding(password, 24, 0x0, "hex"); // magic happens here
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
        return undefined;
    }
    let cipher = crypto.createCipheriv(aes, password, iv);
    //cipher.setAutoPadding(false);
    let encoded = cipher.update(crypted, 'utf8', 'hex');
    encoded += cipher.final('hex');
    return (encoded ? encoded : undefined);
  } catch (e) {
    return undefined;
  }
}

// *****************************************************************************************************
// Decrypt / Input: HEX, Output ASCII
// *****************************************************************************************************
function decrypt_hex(password, encrypted) {
  try {
    let iv = new Buffer(16);
    iv.fill(0);
    let crypted = new Buffer(encrypted, 'hex').toString('binary');
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
        return undefined;
    }
    let decipher = crypto.createDecipheriv(aes, password, iv);
    decipher.setAutoPadding(false);
    let decoded = decipher.update(crypted, 'binary', 'utf8');
    decoded += decipher.final('utf8');
    return (decoded ? decoded : undefined);
  } catch (e) {
    return undefined;
  }
}

// *****************************************************************************************************
// get timestamp in following format <_HH:MM:SS,MM-DD-YYYY>
// *****************************************************************************************************
function getTimestamp(datum) {
  if (!datum) {
    datum = new Date();
  }
  let month = ('0' + datum.getUTCMonth()).slice(-2); // liefert 0 - 11
  let year = datum.getUTCFullYear(); // YYYY (startet nicht bei 0)
  let day = ('0' + datum.getUTCDate()).slice(-2); // liefert 1 - 31
  let hour = ('0' + datum.getUTCHours()).slice(-2); // liefert 0 - 23
  let minute = ('0' + datum.getUTCMinutes()).slice(-2);
  let second = ('0' + datum.getUTCSeconds()).slice(-2);
  let str = '_' + hour + ':' + minute + ':' + second + ',' + month + '-' + day + '-' + year;
  return str;
}

// *****************************************************************************************************
// Is SIA Message in time (+20 or -40 seconds)
// *****************************************************************************************************
function isInTime(ts) {
  if (ts) {
    let [tt, dd] = ts.split(',');
    let val = new Date(dd + "," + tt + " UTC");
    // val = val.toUTCString();
    [tt, dd] = getTimestamp().substring(1).split(',');
    let now = new Date();
    // now = now.toUTCString();
    let diff = Math.abs((val - now) / 1000);
    // if (diff > 20 || diff < -40) {
    if (adapter.config.timeout > 0 && diff > adapter.config.timeout) {
      adapter.log.debug("Timestamp difference. Time in message " + val.toUTCString() + ". Time now " + now.toUTCString());
      return false;
    } else {
      return true;
    }
  } else {
    return true;
  }
}

// *****************************************************************************************************
// Acount configuration
// *****************************************************************************************************
function getAcctInfo(act) {
  for (let i = 0; i < adapter.config.keys.length; i++) {
    let key = adapter.config.keys[i];
    if (key.accountnumber == act) {
      return key;
    }
  }
  // adapter.log.info("Could not found entries for accountnumber " + act + " in the configuration");
  return undefined;
}

// *****************************************************************************************************
// Accountnumber exist in Config
// *****************************************************************************************************
function acctExist(act) {
  let key = getAcctInfo(act);
  if (key) {
    return true;
  } else {
    return false;
  }
}

// *****************************************************************************************************
// Acknowledge for SIA
// *****************************************************************************************************
function nackSIA(crcformat) {
  let ts = getTimestamp(); // tiemstamp
  let str = '"NAK"' + '0000' + 'R0' + 'L0' + 'A0' + '[]' + ts;
  let crc = crc16str(str);
  let len = str.length;
  let crchex = ('0000' + crc.toString(16)).substr(-4).toUpperCase();
  let lenhex = ('0000' + len.toString(16)).substr(-4).toUpperCase();
  /*
  let start = new Buffer([0x0a, crc >>> 8 & 0xff, crc & 0xff, len >>> 8 & 0xff, len & 0xff]);
  let end = new Buffer([0x0d]);
  let buf = new Buffer(str);
  let nack = Buffer.concat([start, buf, end]);
  */
  let start = new Buffer([0x0a]);
  let end = new Buffer([0x0d]);
  let crcbuf;
  if (crcformat === 'bin') {
    // Lupusec sends in 2 bin instead of 4 hex
    crcbuf = new Buffer([crc >>> 8 & 0xff, crc & 0xff]);
    adapter.log.info("Created NAK : <0x0A><0x" + crchex + ">" + lenhex + str + "<0x0D>");
  } else {
    crcbuf = new Buffer(crchex);
    adapter.log.info("Created NAK : <0x0A>" + crchex + "" + lenhex + str + "<0x0D>");
  }
  // let crcbuf = new Buffer(crchex);
  // let crcbuf = new Buffer([crc >>> 8 & 0xff, crc & 0xff]);
  let lenbuf = new Buffer(lenhex);
  let buf = new Buffer(str);
  let nack = Buffer.concat([start, crcbuf, lenbuf, buf, end]);

  adapter.log.debug("nackSIA : " + JSON.stringify(nack));
  return nack;
}

// *****************************************************************************************************
// Acknowledge for SIA
// *****************************************************************************************************
function ackSIA(sia) {
  if (sia) {
    let ts = getTimestamp(); // tiemstamp
    let cfg = getAcctInfo(sia.act);
    let str = "";
    adapter.log.debug("ackSIA (cfg) : " + JSON.stringify(cfg));
    adapter.log.debug("ackSIA (sia) : " + JSON.stringify(sia));
    if (sia.crc == sia.calc_crc && sia.len == sia.calc_len && cfg && isInTime(sia.ts)) {
    // if (sia.crc == sia.calc_crc && sia.len == sia.calc_len && cfg) {
      let rpref = sia.rpref && sia.rpref.length > 0 ? "R" + sia.rpref : "";
      let lpref = sia.lpref && sia.lpref.length > 0 ? "L" + sia.lpref : "";
      if (sia.id[0] == "*") {
        let msglen = ('|]' + ts).length;
        let padlen = 16 - (msglen % 16);
        let pad = new Buffer(padlen);
        /*
        let pad = "";
        if(padlen > 0) {
          padlen = 16 - padlen;
          pad = new Buffer(padlen);
        }
        */
        let msg = encrypt_hex(cfg.password, pad + '|]' + ts);
        str = '"*ACK"' + sia.seq + rpref + lpref + '#' + sia.act + '[' + msg;
      } else {
        str = '"ACK"' + sia.seq + rpref + lpref + '#' + sia.act + '[]';
      }
      let crc = crc16str(str);
      let len = str.length;
      let crchex = ('0000' + crc.toString(16)).substr(-4).toUpperCase();
      let lenhex = ('0000' + len.toString(16)).substr(-4).toUpperCase();

      /*
      let start = new Buffer([0x0a, crc >>> 8 & 0xff, crc & 0xff, len >>> 8 & 0xff, len & 0xff]);
      let end = new Buffer([0x0d]);
      let buf = new Buffer(str);
      let ack = Buffer.concat([start, buf, end]);
      */
      let start = new Buffer([0x0a]);
      let end = new Buffer([0x0d]);
      let crcbuf;
      if (sia && sia.crcformat === 'bin') {
        // Lupusec sends in 2 bin instead of 4 hex
        crcbuf = new Buffer([crc >>> 8 & 0xff, crc & 0xff]);
        adapter.log.info("Created ACK : <0x0A><0x" + crchex + ">" + lenhex + str + "<0x0D>");
      } else {
        crcbuf = new Buffer(crchex);
        adapter.log.info("Created ACK : <0x0A>" + crchex + "" + lenhex + str + "<0x0D>");
      }
      // let crcbuf = new Buffer(crchex);
      // let crcbuf = new Buffer([crc >>> 8 & 0xff, crc & 0xff]);
      let lenbuf = new Buffer(lenhex);
      let buf = new Buffer(str);
      let ack = Buffer.concat([start, crcbuf, lenbuf, buf, end]);

      adapter.log.debug("ackSIA : " + JSON.stringify(ack));
      return ack;
    }
  }
  return undefined;
}

// *****************************************************************************************************
// Set state for SIA message
// *****************************************************************************************************
function setStatesSIA(sia) {
  var obj = dp.dpSIA || {};
  var val = null;
  if (sia) {
    adapter.log.debug("setStatesSIA sia.act : " + sia.act);
    if (acctExist(sia.act)) {
      adapter.log.debug("setStatesSIA for " + sia.act + " : " + JSON.stringify(sia));
      var id = getAcountNumberID(sia.act);
      for (let prop in obj) {
        var sid = id + '.' + prop;
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
            /*
             var [tt, dd] = sia.ts.split(',');
             if (tt && dd) {
               val = new Date(dd + "," + tt + " UTC");
             } else {
               val = "";
             }
             */
            val = sia.ts;
            break;
          case 'crc':
            val = sia.crc;
            break;
          case 'len':
            val = sia.len;
            break;
          default:
            val = null;
        }
        adapter.log.debug("ackSIA : set state for id " + sid + " with value " + val);
        adapter.setState(sid, {
          val: val,
          ack: true
        });
      }
    }
  }
}

// *****************************************************************************************************
// start socket server for listining for SIA
// *****************************************************************************************************
function serverStart() {
  server = net.createServer(onClientConnected);
  server.listen(adapter.config.port, adapter.config.bind, function () {
    var text = 'SIA Server listening on IP-Adress: ' + server.address().address + ':' + server.address().port;
    adapter.log.info(text);
  });
}

// *****************************************************************************************************
// Convert Byte to Hex String
// *****************************************************************************************************
function byteToHexString(uint8arr) {
  if (!uint8arr) {
    return '';
  }
  var hexStr = '';
  for (var i = 0; i < uint8arr.length; i++) {
    var hex = (uint8arr[i] & 0xff).toString(16);
    hex = (hex.length === 1) ? '0' + hex : hex;
    hexStr += hex;
  }
  return hexStr.toUpperCase();
}

// *****************************************************************************************************
// SIA CRC Format
// *****************************************************************************************************
function getcrcFormat(data) {
  let crcformat = 'hex';
  if (data) {
    // Check if CRC 2 Byte Binary or 4 Byte HEX
    if (data[5] == '0'.charCodeAt() && data[9] == '"'.charCodeAt()) {
      crcformat = 'hex';
    }
    // Lupusec sends the CRC in binary forum
    if (data[3] == '0'.charCodeAt() && data[7] == '"'.charCodeAt()) {
      crcformat = 'bin';
    }
  }
  return crcformat;
}

// *****************************************************************************************************
// SIA Message parsen
// *****************************************************************************************************
function parseSIA(data) {
  let sia = {};
  let len = data.length - 1;
  let str = null;
  let m = null;
  let regex = null;
  if (data && data[0] == 0x0a && data[len] == 0x0d) {
    sia.data = data; // komplette Nachricht
    sia.lf = data[0]; // <lf>
    // Check if CRC 2 Byte Binary or 4 Byte HEX
    if (data[5] == '0'.charCodeAt() && data[9] == '"'.charCodeAt()) {
      str = new Buffer((data.subarray(9, len)));
      sia.len = parseInt(data.toString().substring(5, 9), 16);
      sia.crc = parseInt(data.toString().substring(1, 5), 16);
      sia.crcformat = 'hex';
    }
    // Lupusec sends the CRC in binary forum
    if (data[3] == '0'.charCodeAt() && data[7] == '"'.charCodeAt()) {
      str = new Buffer((data.subarray(7, len)));
      sia.len = parseInt(data.toString().substring(3, 7), 16);
      sia.crc = data[1] * 256 + data[2];
      sia.crcformat = 'bin';
    }
    // Length of Message
    //tmp = data.toString().substring(3, 7);
    // let tmp = (data.subarray(3, 7)).toString();
    // sia.len = parseInt(tmp, 16); // length of data
    adapter.log.debug("data : " + data);
    sia.cr = data[len]; // <cr>
    // str = new Buffer((data.subarray(7, len)));
    sia.str = str.toString();
    sia.calc_len = sia.str.length;
    sia.calc_crc = crc16str(sia.str);

    let crchex = ('0000' + sia.crc.toString(16)).substr(-4).toUpperCase();
    let lenhex = ('0000' + sia.len.toString(16)).substr(-4).toUpperCase();
    if (sia.crcformat === 'bin') {
      // Lupusec sends in 2 bin instead of 4 hex
      adapter.log.info("SIA Message : <0x0A><0x" + crchex + ">" + lenhex  + str + "<0x0D>");
    } else {
      adapter.log.info("SIA Message : <0x0A>" + crchex + "" + lenhex  + str + "<0x0D>");
    }

    adapter.log.debug("parseSIA sia.str : " + sia.str);
    if (sia.calc_len != sia.len || sia.calc_crc != sia.crc) {
      adapter.log.info("CRC or Length different to the caclulated values");
      adapter.log.debug("SIA crc= " + sia.crc + ", calc_crc=" + sia.calc_crc);
      adapter.log.debug("SIA len= " + sia.len + ", calc_len=" + sia.calc_len);
      adapter.log.debug("Message for CRC and LEN calculation" + sia.str);
      adapter.log.debug("Message for CRC and LEN calculation (String)" + sia.str.toString());
      return undefined;
      // sia.calc_len = sia.len;
      // sia.calc_crc = sia.crc;
    }
    // Example str:
    // "SIA-DCS"0002R1L232#78919[1234|NFA129][S123Main St., 55123]_11:10:00,10-12-2019
    // "SIA-DCS"0002R1L232#78919[ ][ ]_11:10:00,10-12-2019
    // "SIA-DCS"0266L0#alarm1[alarm2|Nri1OP0001*Familie*]_16:22:03,06-08-2018
    // http://s545463982.onlinehome.us/DC09Gen/
    // "*SIA-DCS"9876R579BDFL789ABC#12345A[209c9d400b655df7a26aecb6a887e7ee6ed8103217079aae7cbd9dd7551e96823263460f7ef0514864897ae9789534f1
    regex = /\"(.+)\"(\d{4})(R(.{1,6})){0,1}(L(.{1,6}))\#([\w\d]+)\[(.+)/gm;
    if ((m = regex.exec(sia.str)) !== null && m.length >= 8) {
      adapter.log.debug("parseSIA regex   : " + JSON.stringify(sia));
      sia.id = m[1] || undefined; // id (SIA-DCS, ACK) - required
      sia.seq = m[2] || undefined; // sqeuence number (0002 or 0003) - required
      sia.rpref = m[4] || ""; // Receiver Number - optional (R0, R1, R123456)
      sia.lpref = m[6] || undefined; // Prefix Acount number - required (L0, L1, L1232) - required
      sia.act = m[7] || undefined; // Acount number - required (1224, ABCD124) - required
      sia.pad = ""; // Pad
      let msg = m[8] || "";
      let cfg = getAcctInfo(sia.act);
      if (!cfg) {
        adapter.log.info("Could not found entries for accountnumber " + sia.act + " in the configuration");
        return undefined;
      }
      // if id starts with *, message is encrypted
      if (sia.id && sia.id[0] == "*") {
        if (cfg.aes == true && cfg.password) {
          msg = decrypt_hex(cfg.password, msg);
          if (msg) {
            let padlen = msg.indexOf("|");
            sia.pad = msg.substring(0, padlen); // len of pad
            msg = msg.substring(padlen + 1); // Data Message
          } else {
            adapter.log.info("Could not decrypt message");
            return undefined;
          }
        } else {
          adapter.log.info("Could not decrypt message, because AES encrypting disabled or password is missing");
          return undefined;
        }
      }
      if (sia.id && sia.id[0] != "*" && cfg.aes == true) {
        adapter.log.info("Encrypting enabled, message was sent not entcrypted");
        return undefined;
      }
      regex = /(.+?)\](\[(.*?)\])?(_(.+)){0,1}/gm;
      if ((m = regex.exec(msg)) !== null && m.length >= 1) {
        sia.data_message = m[1] || ""; // Message
        sia.data_extended = m[3] || ""; // extended Message
        sia.ts = m[5] || "";
      }
    }
  }
  adapter.log.debug("parseSIA : " + JSON.stringify(sia));
  // Test if all required fields will be sent
  if (sia && sia.id && sia.seq && sia.lpref && sia.act && sia.pad != undefined) {
    return sia;
  } else {
    adapter.log.info("Required SIA fields missing");
    return undefined;
  }
}

// *****************************************************************************************************
// alarm system connected and sending SIA  message
// *****************************************************************************************************
function onClientConnected(sock) {
  // See https://nodejs.org/api/stream.html#stream_readable_setencoding_encoding
  // sock.setEncoding(null);
  // Hack that must be added to make this work as expected
  // delete sock._readableState.decoder;
  var remoteAddress = sock.remoteAddress + ':' + sock.remotePort;
  var ack = null;
  // adapter.log.info('New client connected: ' + remoteAddress);
  sock.on('data', function (data) {
    // data = Buffer.from(data,'binary');
    // data = new Buffer(data);
    adapter.log.debug('received from ' + remoteAddress + ' following data: ' + JSON.stringify(data));
    adapter.log.info('received from ' + remoteAddress + ' following message: ' + data.toString().trim());
    var sia = parseSIA(data);
    if (sia) {
      setStatesSIA(sia);
      ack = ackSIA(sia);
      if(!ack) {
        let crcformat = getcrcFormat(data);
        ack = nackSIA(crcformat);
      }
    } else {
      let crcformat = getcrcFormat(data);
      ack = nackSIA(crcformat);
    }
    try {
      adapter.log.info('sending to ' + remoteAddress + ' following message: ' + ack.toString().trim());
      sock.end(ack);
    } catch (e) {
      // Error Message 
    }
  });
  sock.on('close', function () {
    adapter.log.info('connection from ' + remoteAddress + ' closed');
  });
  sock.on('error', function (err) {
    adapter.log.error('Connection ' + remoteAddress + ' error: ' + err.message);
  });
}

// *****************************************************************************************************
// CRC Calculation. Example. crc16([0x20, 0x22])
// *****************************************************************************************************
function crc16(data) {
  /* CRC table for the CRC-16. The poly is 0x8005 (x^16 + x^15 + x^2 + 1) */
  const crctab16 = new Uint16Array([
    0x0000, 0xC0C1, 0xC181, 0x0140, 0xC301, 0x03C0, 0x0280, 0xC241,
    0xC601, 0x06C0, 0x0780, 0xC741, 0x0500, 0xC5C1, 0xC481, 0x0440,
    0xCC01, 0x0CC0, 0x0D80, 0xCD41, 0x0F00, 0xCFC1, 0xCE81, 0x0E40,
    0x0A00, 0xCAC1, 0xCB81, 0x0B40, 0xC901, 0x09C0, 0x0880, 0xC841,
    0xD801, 0x18C0, 0x1980, 0xD941, 0x1B00, 0xDBC1, 0xDA81, 0x1A40,
    0x1E00, 0xDEC1, 0xDF81, 0x1F40, 0xDD01, 0x1DC0, 0x1C80, 0xDC41,
    0x1400, 0xD4C1, 0xD581, 0x1540, 0xD701, 0x17C0, 0x1680, 0xD641,
    0xD201, 0x12C0, 0x1380, 0xD341, 0x1100, 0xD1C1, 0xD081, 0x1040,
    0xF001, 0x30C0, 0x3180, 0xF141, 0x3300, 0xF3C1, 0xF281, 0x3240,
    0x3600, 0xF6C1, 0xF781, 0x3740, 0xF501, 0x35C0, 0x3480, 0xF441,
    0x3C00, 0xFCC1, 0xFD81, 0x3D40, 0xFF01, 0x3FC0, 0x3E80, 0xFE41,
    0xFA01, 0x3AC0, 0x3B80, 0xFB41, 0x3900, 0xF9C1, 0xF881, 0x3840,
    0x2800, 0xE8C1, 0xE981, 0x2940, 0xEB01, 0x2BC0, 0x2A80, 0xEA41,
    0xEE01, 0x2EC0, 0x2F80, 0xEF41, 0x2D00, 0xEDC1, 0xEC81, 0x2C40,
    0xE401, 0x24C0, 0x2580, 0xE541, 0x2700, 0xE7C1, 0xE681, 0x2640,
    0x2200, 0xE2C1, 0xE381, 0x2340, 0xE101, 0x21C0, 0x2080, 0xE041,
    0xA001, 0x60C0, 0x6180, 0xA141, 0x6300, 0xA3C1, 0xA281, 0x6240,
    0x6600, 0xA6C1, 0xA781, 0x6740, 0xA501, 0x65C0, 0x6480, 0xA441,
    0x6C00, 0xACC1, 0xAD81, 0x6D40, 0xAF01, 0x6FC0, 0x6E80, 0xAE41,
    0xAA01, 0x6AC0, 0x6B80, 0xAB41, 0x6900, 0xA9C1, 0xA881, 0x6840,
    0x7800, 0xB8C1, 0xB981, 0x7940, 0xBB01, 0x7BC0, 0x7A80, 0xBA41,
    0xBE01, 0x7EC0, 0x7F80, 0xBF41, 0x7D00, 0xBDC1, 0xBC81, 0x7C40,
    0xB401, 0x74C0, 0x7580, 0xB541, 0x7700, 0xB7C1, 0xB681, 0x7640,
    0x7200, 0xB2C1, 0xB381, 0x7340, 0xB101, 0x71C0, 0x7080, 0xB041,
    0x5000, 0x90C1, 0x9181, 0x5140, 0x9301, 0x53C0, 0x5280, 0x9241,
    0x9601, 0x56C0, 0x5780, 0x9741, 0x5500, 0x95C1, 0x9481, 0x5440,
    0x9C01, 0x5CC0, 0x5D80, 0x9D41, 0x5F00, 0x9FC1, 0x9E81, 0x5E40,
    0x5A00, 0x9AC1, 0x9B81, 0x5B40, 0x9901, 0x59C0, 0x5880, 0x9841,
    0x8801, 0x48C0, 0x4980, 0x8941, 0x4B00, 0x8BC1, 0x8A81, 0x4A40,
    0x4E00, 0x8EC1, 0x8F81, 0x4F40, 0x8D01, 0x4DC0, 0x4C80, 0x8C41,
    0x4400, 0x84C1, 0x8581, 0x4540, 0x8701, 0x47C0, 0x4680, 0x8641,
    0x8201, 0x42C0, 0x4380, 0x8341, 0x4100, 0x81C1, 0x8081, 0x4040
  ]);
  var len = data.length;
  var buffer = 0;
  var crc;
  while (len--) {
    crc = ((crc >>> 8) ^ (crctab16[(crc ^ (data[buffer++])) & 0xff]));
  }
  return crc;
  // return [(crc >>> 8 & 0xff), (crc & 0xff)];
}

// *****************************************************************************************************
// CRC Calculation. Example. crc16([0x20, 0x22])
// *****************************************************************************************************
function crc16str(str) {
  return crc16(new Buffer(str));
}

// If started as allInOne mode => return function to create instance
if (typeof module !== "undefined" && module.parent) {
  module.exports = startAdapter;
} else {
  // or start the instance directly
  startAdapter();
}
