![Logo](admin/sia.png)

# ioBroker.sia
==================

[![Travis CI Build Status](https://travis-ci.org/schmupu/ioBroker.sia.svg?branch=master)](https://travis-ci.org/schmupu/ioBroker.sia)
[![AppVeyor Build Status](https://ci.appveyor.com/api/projects/status/github/schmupu/ioBroker.sia?branch=master&svg=true)](https://ci.appveyor.com/project/schmupu/ioBroker-sia/)
[![NPM version](http://img.shields.io/npm/v/iobroker.sia.svg)](https://www.npmjs.com/package/iobroker.sia)
[![Downloads](https://img.shields.io/npm/dm/iobroker.sia.svg)](https://www.npmjs.com/package/iobroker.sia)

[![NPM](https://nodei.co/npm/iobroker.sia.png?downloads=true)](https://nodei.co/npm/iobroker.sia/)


The protocol SIA DC-09 is used by alarm systems to communicate with the central stations.

This adapter is a SIA Server. When an alarm event is triggered, the alarm system sends over IP the sia message to the central station.
You can use ioBroker with this adapter as central station. For example. you can send for a alarm by SIA a telegram message.  

[SIA DC-09 protocol](https://www.yumpu.com/en/document/view/47594214/dc-09-preparing-for-ansi-public-review-security-industry-)

## Install & Configuration

1. Install the adapter
2. Configuration of the adapter:

  Choose the IP-address and port for listening for SIA requests.
  Register you subcriber name to identify you burglar alarm messages and
  select your burglar alarm type.

3. Configure your burglar system to send SIA messages

    * Lupusec XT1:

      not supported

    * Lupusec XT1+/XT2/XT2+/XT3:

      Einstellungen -> Contact ID : ip://subcriber@ip-address-iobroker:port/SIA
      Example: ip://test@192.168.20.1:50001/SIA

    * other alarm systems:

      the Adapter will work with all alarm systems, which supports
      the SIA DC-09 proctocol


## Changelog

### 0.0.3 (08.06.2018)
* (Stübi) SIA regex optimized

### 0.0.2 (08.06.2018)
* (Stübi) bug fixing

### 0.0.1 (07.06.2018)
* (Stübi) first implementation


## License
The MIT License (MIT)

Copyright (c) 2018 Thorsten <thorsten@stueben.de>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
