#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
"""
epson-maint - maintenance utility for Epson inkjet printers on Linux.

One-way commands (work through CUPS, raw USB device or the network):
    nozzle          print a nozzle check pattern
    clean           regular head cleaning            (remote command CH 00 00)
    power           Power / Deep Cleaning            (remote command CH 00 10)

Two-way commands (need a direct USB connection, /dev/usb/lpX):
    info            printer identification (model, firmware string)
    status          printer status, error and warning codes, ink info
    waste           waste ink pad counter levels
    reset-waste     reset the waste ink pad counters (known models only)
    restore-waste   write back a backup made by reset-waste
    read-eeprom     read raw EEPROM bytes (read-only, for diagnostics)

Run without arguments to open a small Tkinter window.
Only the Python standard library is used.
"""

import argparse
import datetime
import glob
import json
import os
import re
import select
import shutil
import socket
import struct
import subprocess
import sys
import time

__version__ = "2.0.0"

# =============================================================================
#  ESC/P2 remote mode (one-way maintenance commands)
# =============================================================================

# Identical to the byte strings used by Epson's own Linux utility.
EJL_1284_4 = b"\x00\x00\x00\x1b\x01@EJL 1284.4\n@EJL     \n"
INIT_PRINTER = b"\x1b@"
ENTER_REMOTE = b"\x1b(R\x08\x00\x00REMOTE1"
EXIT_REMOTE = b"\x1b\x00\x00\x00"


def remote_cmd(name: str, payload: bytes = b"") -> bytes:
    """Two ASCII letters + 2-byte little-endian length + parameters."""
    return name.encode("ascii") + struct.pack("<H", len(payload)) + payload


def ti_cmd(now=None) -> bytes:
    """Time stamp (TI). Epson's utility sends it before maintenance jobs."""
    n = now or datetime.datetime.now()
    return remote_cmd("TI", b"\x00" + struct.pack(">H", n.year) +
                      bytes([n.month, n.day, n.hour, n.minute, n.second]))


def _preamble() -> bytes:
    return EJL_1284_4 + INIT_PRINTER + INIT_PRINTER + ENTER_REMOTE


def _job_end() -> bytes:
    return (INIT_PRINTER + INIT_PRINTER + ENTER_REMOTE +
            remote_cmd("JE", b"\x00") + EXIT_REMOTE)


def build_clean(power: bool = False, group: int = 0, now=None) -> bytes:
    """
    CH 02 00 00 xx
        xx = 0x00        regular cleaning, all heads
        xx = 0x10        power cleaning, all heads
        xx = 0x0N/0x1N   nozzle group N only (model dependent, experimental)
    """
    if not 0 <= group <= 0x0F:
        raise ValueError("group must be 0..15")
    flag = (0x10 if power else 0x00) | group
    return (_preamble() + ti_cmd(now) +
            remote_cmd("CH", bytes([0x00, flag])) +
            EXIT_REMOTE + _job_end())


def build_nozzle_check(now=None) -> bytes:
    return (_preamble() + ti_cmd(now) +
            remote_cmd("JS", b"\x00\x00\x00\x00") +
            remote_cmd("NC", b"\x00\x00") +
            EXIT_REMOTE + b"\r\n\r\n" +
            ENTER_REMOTE +
            remote_cmd("VI", b"\x00\x00") +
            remote_cmd("LD") +
            EXIT_REMOTE + b"\x0c" + _job_end())


# =============================================================================
#  Model database (for EEPROM access)
# =============================================================================
#
# Read key, write key and EEPROM addresses are model specific. Writing to the
# wrong address can misconfigure a printer, so EEPROM writes are refused for
# any model not listed here. The values below agree in two independent
# open-source projects (see README "Credits").

MODELS = {
    "L3110 family": {
        "models": [
            "L1110", "L1118", "L1119",
            "L3100", "L3101", "L3104", "L3105", "L3106", "L3107", "L3108",
            "L3109", "L3110", "L3111", "L3114", "L3115", "L3116", "L3117",
            "L3118", "L3119",
            "L3150", "L3151", "L3152", "L3153", "L3156", "L3158",
            "L3160", "L3161", "L3163", "L3165", "L3166", "L3168",
            "L5190", "L5196", "L5198",
            "ET-1110", "ET-2710", "ET-2711", "ET-2712", "ET-2714",
            "ET-2715", "ET-2716", "ET-2718", "ET-2720", "ET-2721",
            "ET-2726", "ET-4700",
        ],
        "read_key": 0x0797,
        "write_key": b"Maribaya",
        # counter = bytes (lo, mid, hi) -> hi<<16 | mid<<8 | lo, then / divider
        "waste": {
            "Main pad": {"addr": [0x30, 0x31, 0x2F], "divider": 63.46},
            "Borderless pad": {"addr": [0x32, 0x33, 0x2F], "divider": 34.16},
        },
        # address -> value written by reset-waste (0x5E = factory default
        # "maintenance required" thresholds)
        "reset": {
            0x30: 0x00, 0x31: 0x00, 0x32: 0x00, 0x33: 0x00, 0x2F: 0x00,
            0x34: 0x00, 0x35: 0x00, 0x36: 0x5E, 0x37: 0x5E, 0x1C: 0x00,
        },
    },
}


def find_model(name: str):
    """Return (family_name, spec) for a model string like 'L3110 Series'."""
    if not name:
        return None, None
    norm = name.upper().replace("EPSON", "").replace("SERIES", "").strip()
    tokens = re.split(r"[\s/,]+", norm)
    for fam, spec in MODELS.items():
        for m in spec["models"]:
            if m.upper() in tokens or norm == m.upper():
                return fam, spec
    return None, None


# =============================================================================
#  Transports
# =============================================================================

class UsbLp:
    """Bidirectional access to /dev/usb/lpX (Linux usblp driver)."""

    def __init__(self, path):
        self.path = path
        self.fd = None

    def __enter__(self):
        self.fd = os.open(self.path, os.O_RDWR | os.O_NONBLOCK)
        return self

    def __exit__(self, *exc):
        if self.fd is not None:
            os.close(self.fd)
            self.fd = None

    def write(self, data: bytes):
        view = memoryview(data)
        deadline = time.monotonic() + 10
        while view:
            try:
                n = os.write(self.fd, view)
                view = view[n:]
            except BlockingIOError:
                if time.monotonic() > deadline:
                    raise TimeoutError("write timeout")
                select.select([], [self.fd], [], 0.2)

    def read(self, timeout: float = 1.0) -> bytes:
        deadline = time.monotonic() + timeout
        while True:
            left = deadline - time.monotonic()
            if left <= 0:
                return b""
            r, _, _ = select.select([self.fd], [], [], min(left, 0.2))
            if r:
                try:
                    data = os.read(self.fd, 4096)
                    if data:
                        return data
                except BlockingIOError:
                    pass
            time.sleep(0.02)


def send_raw(data: bytes, queue=None, usb=None, ip=None, port=9100) -> str:
    """One-way send of a byte stream."""
    if queue:
        r = subprocess.run(["lp", "-d", queue, "-o", "raw", "-t", "epson-maint"],
                           input=data, capture_output=True)
        if r.returncode != 0:
            raise RuntimeError(r.stderr.decode(errors="replace").strip()
                               or "lp failed")
        return f"sent to CUPS queue '{queue}'"
    if usb:
        fd = os.open(usb, os.O_WRONLY)
        try:
            os.write(fd, data)
        finally:
            os.close(fd)
        return f"sent to {usb}"
    if ip:
        with socket.create_connection((ip, port), timeout=10) as s:
            s.sendall(data)
        return f"sent to {ip}:{port}"
    raise RuntimeError("no target given (--queue / --usb / --ip)")


def list_cups_queues():
    if not shutil.which("lpstat"):
        return []
    try:
        out = subprocess.run(["lpstat", "-e"], capture_output=True,
                             text=True, timeout=5).stdout
        return [l.strip() for l in out.splitlines() if l.strip()]
    except Exception:
        return []


def list_usb_devices():
    return sorted(glob.glob("/dev/usb/lp*"))


# =============================================================================
#  IEEE 1284.4 ("D4") - packet protocol for two-way communication
# =============================================================================

class D4Error(Exception):
    pass


class D4:
    """
    Minimal IEEE 1284.4 host implementation (revision 0x10 with automatic
    fallback to 0x20), enough to talk to the EPSON-CTRL service.

    Packet header: psid, ssid, length (BE16, incl. header), credit, control
    """

    TX = 0  # transaction channel socket id
    D4_ERRORS = {
        0x80: "malformed packet", 0x81: "packet without credit",
        0x82: "unmatched reply", 0x83: "packet too large",
        0x84: "channel not open", 0x85: "unknown result",
        0x86: "credit overflow", 0x87: "reserved command",
    }

    def __init__(self, io, timeout=3.0, debug=False):
        self.io = io
        self.timeout = timeout
        self.debug = debug
        self.rev = 0x10
        self.buf = b""
        self.credit = {}          # socket id -> credits we may use to send
        self.inbox = {}           # socket id -> list of payloads

    # -- low level -----------------------------------------------------------

    def _log(self, direction, data):
        if self.debug:
            print(f"  {direction} {data.hex(' ')}", file=sys.stderr)

    def _send_packet(self, sid, payload, credit=1):
        pkt = struct.pack(">BBHBB", sid, sid, 6 + len(payload), credit, 0) + payload
        self._log(">>", pkt)
        self.io.write(pkt)

    def _recv_packet(self, timeout):
        deadline = time.monotonic() + timeout
        while True:
            if len(self.buf) >= 6:
                psid, ssid, length, credit, ctrl = struct.unpack(">BBHBB", self.buf[:6])
                if length < 6:  # garbage: resync by dropping a byte
                    self.buf = self.buf[1:]
                    continue
                if len(self.buf) >= length:
                    pkt, self.buf = self.buf[:length], self.buf[length:]
                    self._log("<<", pkt)
                    self.credit[psid] = self.credit.get(psid, 0) + credit
                    return psid, pkt[6:]
            left = deadline - time.monotonic()
            if left <= 0:
                return None, None
            self.buf += self.io.read(min(left, 0.5))

    def _transact(self, cmd: bytes, reply_code: int):
        self._send_packet(self.TX, cmd)
        deadline = time.monotonic() + self.timeout
        while time.monotonic() < deadline:
            sid, payload = self._recv_packet(deadline - time.monotonic())
            if sid is None:
                break
            if sid != self.TX:
                self.inbox.setdefault(sid, []).append(payload)
                continue
            if not payload:
                continue
            if payload[0] == 0x7F and len(payload) >= 4:
                raise D4Error("printer reported D4 error: " +
                              self.D4_ERRORS.get(payload[3], hex(payload[3])))
            if payload[0] == reply_code:
                return payload[1:]
        raise D4Error(f"no reply to D4 command 0x{cmd[0]:02x}")

    # -- transaction commands ------------------------------------------------

    def init(self):
        # Ask the printer to switch to IEEE 1284.4 mode, drop its greeting.
        self.io.write(EJL_1284_4)
        t = time.monotonic() + 1.0
        while time.monotonic() < t:
            self.io.read(0.2)
        self.buf = b""
        for _ in range(2):
            r = self._transact(bytes([0x00, self.rev]), 0x80)
            result, rev = r[0], (r[1] if len(r) > 1 else self.rev)
            if result == 0x00:
                return
            if result == 0x02 and rev in (0x10, 0x20) and rev != self.rev:
                self.rev = rev
                continue
            raise D4Error(f"Init refused (result 0x{result:02x})")
        raise D4Error("Init failed")

    def get_socket(self, service: str) -> int:
        r = self._transact(b"\x09" + service.encode("ascii"), 0x89)
        if r[0] != 0x00:
            raise D4Error(f"service {service} not available")
        return r[1]

    def open(self, sid: int):
        if self.rev == 0x10:
            cmd = struct.pack(">BBBHHHH", 0x01, sid, sid, 0x0200, 0x0200, 0, 0)
        else:
            cmd = struct.pack(">BBBHHH", 0x01, sid, sid, 0x0200, 0x0200, 0)
        r = self._transact(cmd, 0x81)
        if r[0] not in (0x00, 0x04):  # 0x04: channel already open
            raise D4Error(f"OpenChannel refused (result 0x{r[0]:02x})")
        if len(r) >= 11:
            self.credit[sid] = self.credit.get(sid, 0) + struct.unpack(">H", r[9:11])[0]

    def request_credit(self, sid: int):
        if self.rev == 0x10:
            cmd = struct.pack(">BBBHH", 0x04, sid, sid, 0x0080, 0xFFFF)
        else:
            cmd = struct.pack(">BBBH", 0x04, sid, sid, 0x0000)
        r = self._transact(cmd, 0x84)
        if r[0] == 0x00 and len(r) >= 5:
            self.credit[sid] = self.credit.get(sid, 0) + struct.unpack(">H", r[3:5])[0]

    def close(self, sid: int):
        cmd = (bytes([0x02, sid, sid, 0x00]) if self.rev == 0x10
               else bytes([0x02, sid, sid]))
        try:
            self._transact(cmd, 0x82)
        except D4Error:
            pass

    def exit(self):
        try:
            self._transact(b"\x08", 0x88)
        except D4Error:
            pass

    # -- data ----------------------------------------------------------------

    def request(self, sid: int, data: bytes) -> bytes:
        """Send data on a channel and wait for one reply packet."""
        if self.credit.get(sid, 0) < 1:
            self.request_credit(sid)
        if self.credit.get(sid, 0) < 1:
            raise D4Error("printer granted no credit")
        self.credit[sid] -= 1
        self.inbox.pop(sid, None)
        self._send_packet(sid, data, credit=1)
        deadline = time.monotonic() + self.timeout
        while time.monotonic() < deadline:
            if self.inbox.get(sid):
                return self.inbox[sid].pop(0)
            s, payload = self._recv_packet(deadline - time.monotonic())
            if s == sid and payload:
                return payload
            if s is not None and s != sid and payload:
                self.inbox.setdefault(s, []).append(payload)
        raise D4Error("no reply from printer")


class EpsonCtrl:
    """EPSON-CTRL service over D4: status, identification, EEPROM."""

    def __init__(self, io, debug=False):
        self.d4 = D4(io, debug=debug)
        self.sid = None

    def __enter__(self):
        self.d4.init()
        try:
            self.sid = self.d4.get_socket("EPSON-CTRL")
        except D4Error:
            self.sid = 0x02  # well-known socket on Epson printers
        self.d4.open(self.sid)
        return self

    def __exit__(self, *exc):
        if self.sid is not None:
            self.d4.close(self.sid)
        self.d4.exit()

    def cmd(self, name: str, payload: bytes = b"") -> bytes:
        return self.d4.request(self.sid, remote_cmd(name, payload))

    # -- high level ----------------------------------------------------------

    def device_id(self) -> dict:
        raw = self.cmd("di", b"\x01").decode("latin-1")
        out = {}
        for part in raw.split(";"):
            if ":" in part:
                k, v = part.split(":", 1)
                out[k.strip().split("\n")[-1].strip()] = v.strip()
        out["_raw"] = raw
        return out

    def status(self) -> dict:
        return parse_status(self.cmd("st", b"\x01"))

    def read_eeprom(self, spec, addr: int) -> int:
        r = self.cmd("||", eeprom_read_payload(spec, addr))
        m = re.search(rb"EE:([0-9A-Fa-f]{6})", r)
        if not m:
            raise D4Error(f"EEPROM read 0x{addr:03X} refused: {r!r}")
        got_addr, value = int(m.group(1)[:4], 16), int(m.group(1)[4:], 16)
        if got_addr != addr:
            raise D4Error(f"EEPROM address mismatch (0x{addr:X} != 0x{got_addr:X})")
        return value

    def write_eeprom(self, spec, addr: int, value: int):
        r = self.cmd("||", eeprom_write_payload(spec, addr, value))
        if b":OK;" not in r:
            raise D4Error(f"EEPROM write 0x{addr:03X} refused: {r!r}")
        # Some firmware answers OK but ignores the write: always read back.
        back = self.read_eeprom(spec, addr)
        if back != value:
            raise D4Error(f"EEPROM write 0x{addr:03X} not applied "
                          f"(wanted 0x{value:02X}, reads 0x{back:02X})")


# -- EPSON-CTRL "factory" command encoding -----------------------------------

def _factory_header(spec, op: str) -> bytes:
    c = ord(op)
    return (struct.pack("<H", spec["read_key"]) +
            bytes([c, ~c & 0xFF, ((c >> 1) & 0x7F) | ((c << 7) & 0x80)]))


def eeprom_read_payload(spec, addr: int) -> bytes:
    return _factory_header(spec, "A") + struct.pack("<H", addr)


def eeprom_write_payload(spec, addr: int, value: int) -> bytes:
    key = bytes(0 if b == 0 else b + 1 for b in spec["write_key"])
    return _factory_header(spec, "B") + struct.pack("<HB", addr, value) + key


def waste_levels(values: dict, spec) -> dict:
    """values: address -> byte. Returns name -> percent."""
    out = {}
    for name, w in spec["waste"].items():
        lo, mid, hi = (values[a] for a in w["addr"])
        out[name] = round(((hi << 16) | (mid << 8) | lo) / w["divider"], 1)
    return out


# =============================================================================
#  Status (ST2) parser
# =============================================================================

STATUS_CODES = {
    0x00: "Error", 0x01: "Self printing", 0x02: "Busy", 0x03: "Waiting",
    0x04: "Idle (ready)", 0x05: "Paused", 0x07: "Cleaning",
    0x08: "Factory shipment (not initialized)", 0x0A: "Shutting down",
    0x0F: "Nozzle check", 0x11: "Charging",
}

ERROR_CODES = {
    0x00: "Fatal error (service required or power-cycle the printer)",
    0x01: "Other interface is selected",
    0x02: "Cover open",
    0x04: "Paper jam",
    0x05: "Ink out",
    0x06: "Paper out",
    0x0C: "Paper size / type / path error",
    0x10: "Waste ink pad counter overflow (ink pad full)",
    0x11: "Waiting for return from tear-off position",
    0x12: "Double feed",
    0x1A: "Cartridge cover open",
    0x22: "Maintenance box missing",
    0x25: "Rear cover open",
    0x2B: "Tray cover open",
    0x2C: "Ink cartridge overflow",
    0x33: "Initial ink charge not possible",
    0x36: "Maintenance box cover open",
    0x37: "Scanner or front cover open",
    0x41: "Maintenance request",
    0x47: "Printing disabled",
    0x4A: "Maintenance box near end",
    0x4B: "Driver mismatch",
}

WARNING_CODES = {
    0x10: "Ink low (black or yellow)", 0x11: "Ink low (magenta)",
    0x12: "Ink low (yellow or cyan)", 0x13: "Ink low (cyan or matte black)",
    0x14: "Ink low (photo black)", 0x15: "Ink low (red)",
    0x16: "Ink low (blue)", 0x17: "Ink low (gloss optimizer)",
    0x44: "Black print mode",
    0x51: "Cleaning disabled (cyan)", 0x52: "Cleaning disabled (magenta)",
    0x53: "Cleaning disabled (yellow)", 0x54: "Cleaning disabled (black)",
}

INK_COLOURS = {
    0x00: "Black", 0x01: "Cyan", 0x02: "Magenta", 0x03: "Yellow",
    0x04: "Light cyan", 0x05: "Light magenta", 0x06: "Dark yellow",
    0x07: "Grey", 0x08: "Light black", 0x09: "Red", 0x0A: "Blue",
    0x0B: "Gloss optimizer", 0x0C: "Light grey", 0x0D: "Orange",
}


def parse_status(data: bytes) -> dict:
    start = data.find(b"BDC ST2\r\n")
    if start < 0:
        raise ValueError("not an ST2 status reply")
    body = data[start + 9:]
    if len(body) < 2:
        raise ValueError("truncated status reply")
    length = struct.unpack("<H", body[:2])[0]
    buf = body[2:2 + length]
    res = {"status": None, "error": None, "warnings": [], "inks": [], "raw": {}}
    while len(buf) >= 2:
        ftype, flen = buf[0], buf[1]
        item, buf = buf[2:2 + flen], buf[2 + flen:]
        res["raw"][f"0x{ftype:02X}"] = item.hex(" ")
        if ftype == 0x01 and item:
            res["status"] = STATUS_CODES.get(item[0], f"unknown (0x{item[0]:02X})")
        elif ftype == 0x02 and item:
            res["error"] = ERROR_CODES.get(item[0], f"unknown error (0x{item[0]:02X})")
        elif ftype == 0x04:
            res["warnings"] = [WARNING_CODES.get(i, f"unknown (0x{i:02X})") for i in item]
        elif ftype == 0x0F and item:
            step = item[0] or 3
            for off in range(1, len(item) - 2, step):
                colour, level = item[off + 1], item[off + 2]
                res["inks"].append((INK_COLOURS.get(colour, f"0x{colour:02X}"), level))
    return res


# =============================================================================
#  Actions
# =============================================================================

POWER_WARNING = (
    "Power Cleaning uses much more ink than a regular cleaning and fills the\n"
    "waste ink pad faster. Use it only if 2-3 regular cleanings did not fix\n"
    "the nozzle check pattern. If it does not help, do not repeat it right\n"
    "away: let the printer rest for a few hours so the ink can dissolve the\n"
    "dried-up residue."
)

RESET_WARNING = (
    "The waste ink counter stops the printer because the waste ink pad (or\n"
    "tank) is considered full. Resetting the counter makes the printer work\n"
    "again, but if the pad is really saturated, ink WILL eventually leak out\n"
    "underneath the printer. Clean or replace the pad, or fit an external\n"
    "waste ink tank, before or right after resetting.\n"
    "\n"
    "You use this function at your own risk."
)

ONE_WAY = {
    "nozzle": ("Nozzle check", lambda g: build_nozzle_check()),
    "clean": ("Head cleaning", lambda g: build_clean(False, g)),
    "power": ("Power (deep) cleaning", lambda g: build_clean(True, g)),
}


def resolve_usb(path):
    if path and path != "auto":
        return path
    devs = list_usb_devices()
    if not devs:
        raise RuntimeError("no /dev/usb/lp* device found (is the printer "
                           "connected by USB and the usblp module loaded?)")
    return devs[0]


def detect_spec(ctrl, model_override=None):
    did = ctrl.device_id()
    model = did.get("MDL", "")
    fam, spec = find_model(model_override or model)
    return model, fam, spec


def format_status(st: dict) -> str:
    lines = [f"Status : {st['status'] or 'unknown'}",
             f"Error  : {st['error'] or 'none'}"]
    if st["warnings"]:
        lines.append("Warning: " + "; ".join(st["warnings"]))
    for name, level in st["inks"]:
        lines.append(f"Ink    : {name:<14} {level}%")
    return "\n".join(lines)


def do_info(dev, debug=False):
    with UsbLp(dev) as io, EpsonCtrl(io, debug) as c:
        did = c.device_id()
    model = did.get("MDL", "?")
    fam, _ = find_model(model)
    return (f"Model  : {model}\nMaker  : {did.get('MFG', '?')}\n"
            f"Command sets: {did.get('CMD', '?')}\n"
            f"EEPROM support: {fam or 'not in database (read/write disabled)'}")


def do_status(dev, debug=False):
    with UsbLp(dev) as io, EpsonCtrl(io, debug) as c:
        return format_status(c.status())


def read_waste(c, spec):
    addrs = sorted({a for w in spec["waste"].values() for a in w["addr"]})
    vals = {a: c.read_eeprom(spec, a) for a in addrs}
    return waste_levels(vals, spec)


def do_waste(dev, model=None, debug=False):
    with UsbLp(dev) as io, EpsonCtrl(io, debug) as c:
        name, fam, spec = detect_spec(c, model)
        if not spec:
            raise RuntimeError(f"model '{name}' is not in the database")
        lv = read_waste(c, spec)
    return f"Model: {name}\n" + "\n".join(f"{k:<15}: {v:6.1f} %" for k, v in lv.items())


def do_reset(dev, model=None, backup_dir=".", confirm=lambda summary: True,
             debug=False):
    with UsbLp(dev) as io, EpsonCtrl(io, debug) as c:
        name, fam, spec = detect_spec(c, model)
        if not spec:
            raise RuntimeError(f"model '{name}' is not in the database; "
                               "refusing to write to the EEPROM")
        before = read_waste(c, spec)
        old = {a: c.read_eeprom(spec, a) for a in spec["reset"]}
        stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
        bfile = os.path.join(backup_dir, f"epson-waste-backup-{stamp}.json")
        with open(bfile, "w") as f:
            json.dump({"model": name, "family": fam,
                       "values": {f"0x{a:03X}": v for a, v in old.items()}},
                      f, indent=2)
        lines = [f"Model: {name}",
                 *(f"  {k}: {v:.1f} %" for k, v in before.items()),
                 f"Backup of current values: {bfile}"]
        if not confirm("\n".join(lines)):
            return "\n".join(lines + ["Cancelled, nothing written."])
        for a, v in spec["reset"].items():
            c.write_eeprom(spec, a, v)
        after = read_waste(c, spec)
    lines += ["Counters reset and verified:",
              *(f"  {k}: {v:.1f} %" for k, v in after.items()),
              "Switch the printer off and on again."]
    return "\n".join(lines)


def do_restore(dev, backup_file, model=None, debug=False):
    with open(backup_file) as f:
        data = json.load(f)
    with UsbLp(dev) as io, EpsonCtrl(io, debug) as c:
        name, fam, spec = detect_spec(c, model)
        if not spec or fam != data.get("family"):
            raise RuntimeError("backup does not belong to this printer model")
        for a, v in data["values"].items():
            addr = int(a, 16)
            if addr not in spec["reset"]:
                raise RuntimeError(f"address {a} not allowed for this model")
            c.write_eeprom(spec, addr, int(v))
    return f"Restored {len(data['values'])} values from {backup_file}."


def do_read_eeprom(dev, addrs, model=None, debug=False):
    with UsbLp(dev) as io, EpsonCtrl(io, debug) as c:
        name, fam, spec = detect_spec(c, model)
        if not spec:
            raise RuntimeError(f"model '{name}' is not in the database")
        return "\n".join(f"0x{a:03X} = 0x{c.read_eeprom(spec, a):02X}" for a in addrs)


# =============================================================================
#  GUI
# =============================================================================

def run_gui():
    import tkinter as tk
    from tkinter import ttk, messagebox, scrolledtext

    root = tk.Tk()
    root.title(f"Epson Maintenance {__version__}")
    frm = ttk.Frame(root, padding=10)
    frm.grid(sticky="nsew")
    pad = {"padx": 6, "pady": 4}

    mode = tk.StringVar(value="usb" if list_usb_devices() else "queue")
    target = tk.StringVar()
    group = tk.IntVar(value=0)

    ttk.Label(frm, text="Connection:").grid(row=0, column=0, sticky="w", **pad)
    mf = ttk.Frame(frm)
    mf.grid(row=0, column=1, sticky="w", **pad)
    combo = ttk.Combobox(frm, textvariable=target, width=30)
    combo.grid(row=0, column=2, **pad)

    def refresh(*_):
        m = mode.get()
        if m == "queue":
            q = list_cups_queues()
            combo["values"] = q
            target.set(q[0] if q else "")
        elif m == "usb":
            u = list_usb_devices()
            combo["values"] = u
            target.set(u[0] if u else "/dev/usb/lp0")
        else:
            combo["values"] = []
            target.set("192.168.1.")
        for b in two_way_buttons:
            b["state"] = "normal" if m == "usb" else "disabled"

    for val, lbl in (("usb", "USB"), ("queue", "CUPS queue"), ("ip", "Network IP")):
        ttk.Radiobutton(mf, text=lbl, value=val, variable=mode,
                        command=refresh).pack(side="left")

    ttk.Label(frm, text="Nozzle group:").grid(row=1, column=0, sticky="w", **pad)
    gf = ttk.Frame(frm)
    gf.grid(row=1, column=1, columnspan=2, sticky="w", **pad)
    ttk.Spinbox(gf, from_=0, to=5, width=4, textvariable=group,
                state="readonly").pack(side="left")
    ttk.Label(gf, text="  0 = all (recommended); 1-5 experimental").pack(side="left")

    out = scrolledtext.ScrolledText(frm, width=72, height=14, font=("monospace", 9))
    out.grid(row=4, column=0, columnspan=3, **pad)

    def show(text):
        out.insert("end", text.rstrip() + "\n\n")
        out.see("end")

    def run(fn):
        root.config(cursor="watch")
        root.update()
        try:
            show(fn())
        except Exception as e:
            show(f"Error: {e}")
            messagebox.showerror("Error", str(e))
        finally:
            root.config(cursor="")

    def one_way(action):
        name, builder = ONE_WAY[action]
        if action == "power" and not messagebox.askyesno(
                "Power Cleaning", POWER_WARNING + "\n\nContinue?"):
            return
        t = target.get().strip()
        if mode.get() == "usb":
            t = resolve_usb(t)
        run(lambda: f"{name}: " + send_raw(builder(group.get()), **{mode.get(): t}))

    def reset():
        if not messagebox.askyesno("Reset waste ink counter",
                                   RESET_WARNING + "\n\nContinue?", icon="warning"):
            return
        run(lambda: do_reset(
            resolve_usb(target.get()), backup_dir=os.path.expanduser("~"),
            confirm=lambda s: messagebox.askyesno("Confirm", s + "\n\nWrite now?")))

    b1 = ttk.Frame(frm)
    b1.grid(row=2, column=0, columnspan=3, pady=(8, 2))
    ttk.Button(b1, text="Nozzle check", width=18,
               command=lambda: one_way("nozzle")).pack(side="left", padx=3)
    ttk.Button(b1, text="Head cleaning", width=18,
               command=lambda: one_way("clean")).pack(side="left", padx=3)
    ttk.Button(b1, text="Power (deep) cleaning", width=22,
               command=lambda: one_way("power")).pack(side="left", padx=3)

    b2 = ttk.Frame(frm)
    b2.grid(row=3, column=0, columnspan=3, pady=(2, 8))
    two_way_buttons = [
        ttk.Button(b2, text="Printer info", width=14,
                   command=lambda: run(lambda: do_info(resolve_usb(target.get())))),
        ttk.Button(b2, text="Status / errors", width=16,
                   command=lambda: run(lambda: do_status(resolve_usb(target.get())))),
        ttk.Button(b2, text="Waste ink level", width=16,
                   command=lambda: run(lambda: do_waste(resolve_usb(target.get())))),
        ttk.Button(b2, text="Reset waste counter", width=20, command=reset),
    ]
    for b in two_way_buttons:
        b.pack(side="left", padx=3)

    refresh()
    show("Two-way functions (info, status, waste counter) need a direct USB "
         "connection.")
    root.mainloop()


# =============================================================================
#  CLI
# =============================================================================

def _ask(prompt, word):
    try:
        return input(f"{prompt}\nType {word} to continue: ").strip() == word
    except EOFError:
        return False


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    if not argv:
        try:
            return run_gui()
        except Exception as e:
            print(f"GUI not available ({e}). Command line usage:\n", file=sys.stderr)

    p = argparse.ArgumentParser(
        prog="epson-maint",
        description="Maintenance utility for Epson inkjet printers.")
    p.add_argument("--version", action="version", version=__version__)
    p.add_argument("action", choices=[*ONE_WAY, "info", "status", "waste",
                                      "reset-waste", "restore-waste", "read-eeprom"])
    p.add_argument("args", nargs="*", help="backup file (restore-waste) or "
                   "addresses (read-eeprom, e.g. 0x2F 0x30)")
    t = p.add_mutually_exclusive_group()
    t.add_argument("--queue", help="CUPS queue name (see: lpstat -e)")
    t.add_argument("--usb", nargs="?", const="auto",
                   help="USB device (default: first /dev/usb/lp*)")
    t.add_argument("--ip", help="printer IP address (raw port 9100)")
    t.add_argument("--dump", metavar="FILE", help="write bytes to FILE, do not send")
    p.add_argument("--port", type=int, default=9100)
    p.add_argument("--group", type=int, default=0,
                   help="nozzle group, 0 = all (experimental)")
    p.add_argument("--model", help="override detected model name")
    p.add_argument("--backup-dir", default=".", help="where reset-waste stores backups")
    p.add_argument("-y", "--yes", action="store_true",
                   help="do not ask for confirmation (power cleaning only)")
    p.add_argument("--debug", action="store_true", help="hex dump D4 traffic")
    a = p.parse_args(argv)

    try:
        if a.action in ONE_WAY:
            name, builder = ONE_WAY[a.action]
            data = builder(a.group)
            if a.dump:
                with open(a.dump, "wb") as f:
                    f.write(data)
                print(f"{len(data)} bytes written to {a.dump}")
                return
            if a.action == "power" and not a.yes:
                print(POWER_WARNING)
                if not _ask("", "yes"):
                    print("Cancelled.")
                    return
            queue, usb = a.queue, (resolve_usb(a.usb) if a.usb else None)
            if not (queue or usb or a.ip):
                qs = list_cups_queues()
                epson = [q for q in qs if "epson" in q.lower()]
                if len(epson) == 1 or len(qs) == 1:
                    queue = (epson or qs)[0]
                    print(f"Using CUPS queue: {queue}")
                elif list_usb_devices():
                    usb = list_usb_devices()[0]
                else:
                    sys.exit("Choose a target: --queue NAME | --usb | --ip ADDRESS "
                             f"(queues: {', '.join(qs) or 'none'})")
            print(f"{name}: " + send_raw(data, queue=queue, usb=usb, ip=a.ip, port=a.port))
            return

        if a.queue or a.ip or a.dump:
            sys.exit(f"'{a.action}' needs two-way communication: use --usb "
                     "(direct USB connection).")
        dev = resolve_usb(a.usb or "auto")

        if a.action == "info":
            print(do_info(dev, a.debug))
        elif a.action == "status":
            print(do_status(dev, a.debug))
        elif a.action == "waste":
            print(do_waste(dev, a.model, a.debug))
        elif a.action == "reset-waste":
            print(RESET_WARNING + "\n")
            print(do_reset(dev, a.model, a.backup_dir,
                           confirm=lambda s: (print(s), _ask("", "RESET"))[1],
                           debug=a.debug))
        elif a.action == "restore-waste":
            if len(a.args) != 1:
                sys.exit("usage: epson-maint restore-waste BACKUP.json")
            print(do_restore(dev, a.args[0], a.model, a.debug))
        elif a.action == "read-eeprom":
            if not a.args:
                sys.exit("usage: epson-maint read-eeprom 0x2F 0x30 ...")
            print(do_read_eeprom(dev, [int(x, 0) for x in a.args], a.model, a.debug))
    except PermissionError:
        sys.exit("Permission denied. Run with sudo, or add yourself to the 'lp' "
                 "group: sudo usermod -aG lp $USER (then log in again).")
    except (RuntimeError, D4Error, OSError, ValueError) as e:
        sys.exit(f"Error: {e}")


if __name__ == "__main__":
    main()
