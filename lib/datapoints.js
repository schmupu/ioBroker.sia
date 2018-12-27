/* jshint -W097 */
/* jshint -W030 */
/* jshint strict:true */
/* jslint node: true */
/* jslint esversion: 6 */
'use strict';

let dpSIA = {

  id: {
    type: 'string',
    role: 'text',
    name: 'ID Token', // String
    read: true,
    write: false
  },

  sequence: {
    type: 'number',
    role: 'value', // Number 4 character, 0-9
    name: 'Sequence Number',
    read: true,
    write: false
  },

  rpref: {
    type: 'string',
    role: 'text',
    name: 'Receive Number', // 1-6 ASCII (0-F)
    read: true,
    write: false
  },

  lpref: {
    type: 'string',
    role: 'text',
    name: 'Account Prefix',  // 1-6 ASCII (0-F)
    read: true,
    write: false
  },

  accountnumber: {
    type: 'string',
    role: 'text',
    name: 'Account Number', // 3-16 ASCII (0-F)
    read: true,
    write: false
  },

  msgdata: {
    type: 'string',
    role: 'text',
    name: 'Message Data', // ASCII
    read: true,
    write: false
  },

  extdata: {
    type: 'string',
    role: 'text',
    name: 'Extended Data', // ASCII
    read: true,
    write: false
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
    type: 'string',
    role: 'text',
    name: 'Timestamp', // Timestamp
    read: true,
    write: false
  },

  crc: {
    type: 'number',
    role: 'value',
    name: 'CRC16', // CRC
    read: true,
    write: false
  },

  len: {
    type: 'number',
    role: 'value',
    name: 'Length of Message', // Länge
    read: true,
    write: false
  }

};

exports.dpSIA  = dpSIA;
