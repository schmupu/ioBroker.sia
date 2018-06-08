'use strict';

var utils = require(__dirname + '/lib/utils'); // Get common adapter utils
var dp = require(__dirname + '/lib/datapoints');

var net = require('net');

var adapter = new utils.Adapter('contactid');



var server = null; // Server instance


// *****************************************************************************************************
// is called when adapter shuts down - callback has to be called under any circumstances!
// *****************************************************************************************************
adapter.on('unload', function(callback) {
  try {
    adapter.log.info('Closing Contact ID Server');

    if (server) {
      server.close();
    }

    callback();
  } catch (e) {
    callback();
  }

});


// *****************************************************************************************************
// is called if a subscribed object changes
// *****************************************************************************************************
adapter.on('objectChange', function(id, obj) {

  // Warning, obj can be null if it was deleted
  if (obj) {

  }

});


// *****************************************************************************************************
// is called if a subscribed state changes
// *****************************************************************************************************
adapter.on('stateChange', function(id, state) {

  // Warning, state can be null if it was deleted
  if (state && !state.ack) {

  }

});



// *****************************************************************************************************
// is called when databases are connected and adapter received configuration.
// start here!
// *****************************************************************************************************
adapter.on('ready', function() {

  adapter.log.info(adapter.namespace);
  main();

});


// *****************************************************************************************************
// Main function
// *****************************************************************************************************
function main() {

  // delete not used / missing object in configuration
  deleteObects();

  // add object from configuration.
  createObjects();

  // start socket server
  serverStart();

  // in this contactid all states changes inside the adapters namespace are subscribed
  // adapter.subscribeStates('*');

}


// *****************************************************************************************************
// convert subcriber to ID for using as channel name. Special characters and spaces are deleted.
// *****************************************************************************************************
function getSubscriberID(subscriber) {

  var id = subscriber.replace(/[.\s]+/g, '_');
  return id;

}


// *****************************************************************************************************
// delete channel and states which are missing in configuration
// *****************************************************************************************************
function deleteChannel(obj) {

  // adapter.log.info('deleteChannel: ' + JSON.stringify(obj));

  // search recrusive for channel name. If found and missing in
  // configuration, delete channel and all states
  Object.keys(obj).forEach(key => {

    if (obj[key] && typeof obj[key] === 'object') {

      deleteChannel(obj[key]); // recurse.

    } else {

      if (obj[key] == 'channel') {

        var found = false;
        var channelname = obj.common.name;

        // Channel Name ist ein subscriber
        for (var i = 0; i < adapter.config.keys.length; i++) {

          var key = adapter.config.keys[i];
          var id = getSubscriberID(key.subscriber);

          if (id == channelname) {

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
function deleteObects() {

  adapter.getAdapterObjects(function(obj) {

    deleteChannel(obj);

  });

}


// *****************************************************************************************************
// create for every ID a channel and create a few states
// *****************************************************************************************************
function createObjectSIA(id, key) {

  let obj = dp.dpSIA || {};

  adapter.setObjectNotExists(id, {
    type: 'channel',
    common: {
      name: key.subscriber
    },
    native: {}
  });

  for (let prop in obj) {

    let sid = id + '.' + prop;
    let parameter = JSON.parse(JSON.stringify(obj[prop]));

    parameter.name = key.subscriber + ' ' + parameter.name;

    adapter.setObjectNotExists(sid, {
      type: 'state',
      common: parameter,
      native: {}
    });

  }

}


// *****************************************************************************************************
// create for every ID a channel and create a few states
// *****************************************************************************************************
function createObjectCID(id, key) {

  let obj = dp.dpCID || {};

  adapter.setObjectNotExists(id, {
    type: 'channel',
    common: {
      name: key.subscriber
    },
    native: {}
  });

  for (let prop in obj) {

    let sid = id + '.' + prop;
    let parameter = JSON.parse(JSON.stringify(obj[prop]));

    parameter.name = key.subscriber + ' ' + parameter.name;

    adapter.setObjectNotExists(sid, {
      type: 'state',
      common: parameter,
      native: {}
    });

  }

}

// *****************************************************************************************************
// read configuration, and create for all subscribers a channel and states
// *****************************************************************************************************
function createObjects() {

  var type = adapter.config.alarmtype;

  for (var i = 0; i < adapter.config.keys.length; i++) {

    var key = adapter.config.keys[i];
    var id = getSubscriberID(key.subscriber);

    switch (type) {

      case "cid":
        createObjectCID(id, key);
        break;

      case "sia":
        createObjectSIA(id, key);
        break;

      default:

    }

  }

}


// *****************************************************************************************************
// read configuration by subscriber and return the alarmsytem
// *****************************************************************************************************
function getAlarmSystem(subscriber) {

  for (var i = 0; i < adapter.config.keys.length; i++) {

    var key = adapter.config.keys[i];

    if (key.subscriber == subscriber) {

      return key.alarmsystem;

    }

  }

  return null;

}


// *****************************************************************************************************
// Acknowledge for CID
// *****************************************************************************************************
function ackCID(cid) {

  var ack = null;

  switch (getAlarmSystem(cid.subscriber)) {

    case "lupusec_xt1":

      ack = new Buffer(1);
      ack[0] = 6; //Acknowledge Lupusex 0x6
      break;

    case "lupusec_xt1p":
    case "lupusec_xt2":
    case "lupusec_xt2p":
    case "lupusec_xt3":

      ack = cid.data; // komplette Nachricht wieder zurückegeben
      break;

    default:

     ack = null;

  }

  return ack;

}

// *****************************************************************************************************
// Acknowledge for SIA
// *****************************************************************************************************
function ackSIA(sia) {

  if (sia) {

    var id = null;
    var rpref = sia.rpref.length > 0 ? "R" + sia.rpref : "";
    var lpref = sia.lpref.length > 0 ? "L" + sia.lpref : "";

    if (sia.crc == sia.calc_crc && sia.len == sia.calc_len) {
      id = 'ACK';
    } else {
      id = 'ACK';
    }

    var str = '"' + id + '"' + sia.seq + rpref + lpref + '#' + sia.act + '[]';
    var crc = crc16str(str);
    var len = str.length;

    var start = new Buffer([0x0a, crc >>> 8 & 0xff, crc & 0xff, len >>> 8 & 0xff, len & 0xff]);
    var end = new Buffer([0x0d]);
    var buf = new Buffer(str);
    var ack = Buffer.concat([start, buf, end]);
    return ack;

  } else {

    return null;

  }

}

// *****************************************************************************************************
// Set state for contact id message
// *****************************************************************************************************
function setStatesSIA(sia) {

  var obj = dp.dpSIA || {};
  var val = null;

  if (sia) {

    for (var i = 0; i < adapter.config.keys.length; i++) {

      var key = adapter.config.keys[i];

      if (key.subscriber == sia.act) {

        var id = getSubscriberID(sia.act);

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

          adapter.setState(sid, {
            val: val,
            ack: true
          });

        }

      }

    }

  }

}

// *****************************************************************************************************
// Set state for contact id message
// *****************************************************************************************************
function setStatesCID(cid) {

  var obj = dp.dpCID || {};
  var val = null;

  if (cid) {

    for (var i = 0; i < adapter.config.keys.length; i++) {

      var key = adapter.config.keys[i];

      if (key.subscriber == cid.subscriber) {

        var id = getSubscriberID(cid.subscriber);

        for (let prop in obj) {

          var sid = id + '.' + prop;

          switch (prop) {

            case 'subscriber':
              val = cid.subscriber;
              break;

            case 'event':
              val = cid.event;
              break;

            case 'eventtext':
              val = cid.eventtext;
              break;

            case 'group':
              val = cid.group;
              break;

            case 'qualifier':
              val = cid.qualifier;
              break;

            case 'sensor':
              val = cid.sensor;
              break;

            case 'message':
              val = cid.data;
              break;

            default:
              val = null;

          }

          adapter.setState(sid, {
            val: val,
            ack: true
          });

        }

      }

    }

  }

}


// *****************************************************************************************************
// start socket server for listining for contact IDs
// *****************************************************************************************************
function serverStart() {

  server = net.createServer(onClientConnected);

  server.listen(adapter.config.port, adapter.config.bind, function() {

    var text = 'Contact ID Server listening on IP-Adress: ' + server.address().address + ':' + server.address().port;
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
// SIA Message parsen
// *****************************************************************************************************
function parseSIA(data) {

  var sia = {};
  var len = data.length - 1;
  var tmp = null;
  var str = null;
  var m = null;
  var n = null;
  var regex = null;
  var sialen = null;
  var siacrc = null;

  if (data && data[0] == 0x0a && data[len] == 0x0d) {

    sia.data = data; // komplette Nachricht
    sia.lf = data[0]; // <lf>
    // sia.crc = data.subarray(1, 3); // <crc>
    sia.crc = data[1] * 256 + data[2];
    sia.len = parseInt((data.subarray(3, 7)).toString(), 16); // length of data
    sia.cr = data[len]; // <cr>

    sia.str = (data.subarray(7, len)).toString(); // data
    regex = /\"(.+)\"(\d{4})(R.{1,6}){0,1}(L.{1,6})\#([\w\d]+)\[(.+?)\](\[(.+?)\])?(_(.+)){0,1}/gm;

    sia.calc_len = sia.str.length;
    sia.calc_crc = crc16str(sia.str);

    if ((m = regex.exec(sia.str)) !== null && m.length >= 6) {

      sia.id = m[1]; // id (SIA-DCS, ACK)
      sia.seq = m[2]; // sqeuence number (0002 or 0003)
      sia.rpref = m[3] || ""; // Receiver Number - optional (R0, R1, R123456)
      if (sia.rpref.length > 1) {
        sia.rpref = sia.rpref.substr(1);
      }
      sia.lpref = m[4]; // Prefix Acount number - required (L0, L1, L1232)
      if (sia.lpref.length > 1) {
        sia.lpref = sia.lpref.substr(1);
      }
      sia.act = m[5]; // Acount number - required (1224, ABCD124)
      sia.data_message = m[6]; // Message
      sia.data_extended = m[8] || ""; // extended Message
      sia.ts = m[10] || "";

    }

  }

  return sia;

}

// *****************************************************************************************************
// alarm system connected and sending contact ID message
// *****************************************************************************************************
function onClientConnected(sock) {

  var remoteAddress = sock.remoteAddress + ':' + sock.remotePort;
  var strclose = "close"
  var len = strclose.length;
  var ack = null;

  // adapter.log.info('New client connected: ' + remoteAddress);

  sock.on('data', function(data) {

    var strdata = data.toString().trim();
    adapter.log.info(remoteAddress + ' sending following message: ' + strdata);

    if (adapter.config.alarmtype == "cid") {

      // [alarmanlage 18140101001B4B6]
      // [alarmanlage 18160200000C5B7]

      var cid = parseCID(strdata);

      if (cid) {

        // adapter.log.info("Received message: " + JSON.stringify(cid));
        setStatesCID(cid);
        ack = ackCID(cid);
        sock.end(ack);

      } else {

        sock.end();

      }

    }

    if (adapter.config.alarmtype == "sia") {

      var sia = parseSIA(data);

      if (sia) {

        setStatesSIA(sia);
        ack = ackSIA(sia);
        sock.end(ack);

      } else {

        sock.end();

      }

    }


  });

  sock.on('close', function() {
    adapter.log.info('connection from ' + remoteAddress + ' closed');
  });


  sock.on('error', function(err) {
    adapter.log.error('Connection ' + remoteAddress + ' error: ' + err.message);
  });

}


// *****************************************************************************************************
// parse contactid and put into object
// *****************************************************************************************************
function parseCID(data) {

  var reg = /^\[(.+) 18(.)(.{3})(.{2})(.{3})(.)(.*)\]/gm;
  var match = reg.exec(data);
  var cid = null;

  if (match) {

    // <ACCT><MT><QXYZ><GG><CCC><S>
    cid = {

      data: data,
      subscriber: match[1].trim(),
      qualifier: match[2],
      event: match[3],
      eventtext: getEventText(match[3]),
      group: match[4],
      sensor: match[5],
      checksum: match[6]
    };

  }

  return cid;

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


// *****************************************************************************************************
// Text for Events
// *****************************************************************************************************
function getEventText(event) {

  var events = dp.events || [];
  return events[event];

}
