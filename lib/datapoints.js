dpSIA = {

  id: {
    type: 'string',
    role: 'value',
    name: 'ID Token',
    read: true,
    write: false
  },

  sequence: {
    type: 'string',
    role: 'value',
    name: 'Sequence Number',
    read: true,
    write: false
  },

  rpref: {
    type: 'string',
    role: 'value',
    name: 'Receive Number',
    read: true,
    write: false
  },

  lpref: {
    type: 'string',
    role: 'value',
    name: 'Account Prefix',
    read: true,
    write: false
  },

  accountnumber: {
    type: 'string',
    role: 'value',
    name: 'Account Number',
    read: true,
    write: false
  },

  msgdata: {
    type: 'string',
    role: 'value',
    name: 'Message Data',
    read: true,
    write: false
  },

  extdata: {
    type: 'string',
    role: 'value',
    name: 'Extended Data',
    read: true,
    write: false
  },

  ts: {
    type: 'string',
    role: 'value',
    name: 'Timestamp',
    read: true,
    write: false
  },

  crc: {
    type: 'string',
    role: 'value',
    name: 'CRC16',
    read: true,
    write: false
  },

  len: {
    type: 'number',
    role: 'value',
    name: 'Length of Message',
    read: true,
    write: false
  }

};

exports.dpSIA  = dpSIA;
