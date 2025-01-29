---
name: Bug report
about: Something is not working as it should
title: ''
labels: ''
assignees: ''
---

**Describe the bug**  
A clear and concise description of what the bug is.

**To Reproduce**  
If you have problems processing SIA messages, I need the following information:

1. Manufacturer and type of alarm system
2. The SIA message as a file. You can create a file if you activate it in the instance configuration.
3. If you use encryption (AES), then I need the key to decrypt the message again.
4. The debug output/logging from ioBroker when processing the message
5. A clear and concise description of what you expected to happen.

After you have completed points 2 and 3, please change the key.
Without this information I can recreate the bug and would close the Issue.

**Versions:**

- Adapter version: <adapter-version>
- JS-Controller version: <js-controller-version> <!-- determine this with `iobroker -v` on the console -->
- Node version: <node-version> <!-- determine this with `node -v` on the console -->
- Operating system: <os-name>

**Additional context**  
Add any other context about the problem here.
