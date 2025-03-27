# CANopen Elevator Protocol (CiA 417)

## Overview

The CANopen Elevator Profile (CiA 417) is a standardized protocol for elevator control systems. It defines the communication objects and behavior for elevator components such as controllers, door drives, and call panels.

## Object Dictionary

The CANopen protocol uses an Object Dictionary to organize all accessible data. Each entry in the dictionary is addressed by a 16-bit index and an 8-bit sub-index.

### Key Objects for Elevator Control

| Index    | Name                   | Description                                      | Access |
|----------|------------------------|--------------------------------------------------|--------|
| 0x1000   | Device Type            | Identifies the device as a CiA 417 device        | RO     |
| 0x1001   | Error Register         | Device error status                              | RO     |
| 0x1002   | Manufacturer Status    | Manufacturer-specific status (emergency state)   | RO     |
| 0x6000   | Elevator Status        | Current status of the elevator (bit-mapped)      | RO     |
| 0x6001   | Current Floor          | Current floor position                           | RO     |
| 0x6002   | Target Floor           | Requested floor destination                      | RW     |
| 0x6010   | Door Command           | Command to control the door (0=close, 1=open)    | RW     |

### Elevator Status Bits (0x6000)

| Bit | Description         |
|-----|---------------------|
| 0   | Door Open           |
| 1   | Door Opening        |
| 2   | In Motion           |
| 3   | Door Closing        |
| 4   | Door Closed         |
| 5   | Direction Up        |
| 6   | Direction Down      |
| 7   | Door Obstruction    |

## Communication

CANopen uses several communication objects:

1. **Service Data Objects (SDO)**: Used for parameter access and configuration
2. **Process Data Objects (PDO)**: Used for real-time data exchange
3. **Network Management (NMT)**: Used for controlling the CANopen device state
4. **Emergency Objects (EMCY)**: Used for communicating error conditions

### SDO Protocol

SDOs are used to access the Object Dictionary. The client (e.g., a robot) sends a request to the server (elevator controller), and the server responds.

#### SDO Read Request
```
Client → Server: [0x40][Index Low][Index High][Subindex][0][0][0][0]
```

#### SDO Read Response
```
Server → Client: [0x4F][Index Low][Index High][Subindex][Data0][Data1][Data2][Data3]
```

#### SDO Write Request
```
Client → Server: [0x2F][Index Low][Index High][Subindex][Data0][Data1][Data2][Data3]
```

#### SDO Write Response
```
Server → Client: [0x60][Index Low][Index High][Subindex][0][0][0][0]
```

## Implementation Notes

When implementing a CANopen elevator interface:

1. Start by establishing communication and setting the device to operational state
2. Monitor the elevator status (0x6000) for changes in door state and direction
3. Read the current floor (0x6001) to track position
4. Write to the target floor (0x6002) to request elevator movement
5. Use door commands (0x6010) to control door opening/closing when appropriate

## References

- CiA 417: CANopen Application Profile for Lift Control Systems
- CiA 301: CANopen Application Layer and Communication Profile 