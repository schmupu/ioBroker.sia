/**
 * Interface sia
 */
export interface ifSIA {
    [index: string]: object;
}

/**
 * Datatpoints
 */
export const dpSIA: ifSIA = {
    id: {
        type: 'string',
        role: 'text',
        name: 'ID Token', // String
        read: true,
        write: false,
        def: '',
    },

    sequence: {
        type: 'string',
        role: 'value', // Number 4 character, 0-9
        name: 'Sequence Number',
        read: true,
        write: false,
        def: '',
    },

    rpref: {
        type: 'string',
        role: 'text',
        name: 'Receive Number', // 1-6 ASCII (0-F)
        read: true,
        write: false,
        def: '',
    },

    lpref: {
        type: 'string',
        role: 'text',
        name: 'Account Prefix', // 1-6 ASCII (0-F)
        read: true,
        write: false,
        def: '',
    },

    accountnumber: {
        type: 'string',
        role: 'text',
        name: 'Account Number', // 3-16 ASCII (0-F)
        read: true,
        write: false,
        def: '',
    },

    msgdata: {
        type: 'string',
        role: 'text',
        name: 'Message Data', // ASCII
        read: true,
        write: false,
        def: '',
    },

    extdata: {
        type: 'string',
        role: 'text',
        name: 'Extended Data', // ASCII
        read: true,
        write: false,
        def: '',
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
        write: false,
        def: new Date(),
    },

    crc: {
        type: 'number',
        role: 'value',
        name: 'CRC16', // CRC
        read: true,
        write: false,
        def: 0,
    },

    len: {
        type: 'number',
        role: 'value',
        name: 'Length of Message', // Länge
        read: true,
        write: false,
        def: 0,
    },
};
