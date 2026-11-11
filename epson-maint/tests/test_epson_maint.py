"""
Tests for epson_maint. A simulated printer speaks IEEE 1284.4 and EPSON-CTRL,
so the two-way code paths can be tested without hardware.

Run:  python3 -m unittest discover -s tests
"""
import datetime
import json
import os
import struct
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import epson_maint as em  # noqa: E402

SPEC = em.MODELS["L3110 family"]
NOW = datetime.datetime(2026, 11, 11, 17, 36, 40)


class FakePrinter:
    """Simulated Epson L3110 on the far end of /dev/usb/lp0."""

    def __init__(self, model="L3110 Series", revisions=(0x10,), ignore_writes=False):
        self.model = model
        self.revisions = revisions
        self.ignore_writes = ignore_writes
        self.out = b""
        self.rx = b""
        self.rev = None
        self.d4 = False
        self.mem = {a: 0 for a in range(0x800)}
        # main pad ~ 100 %: 6346 counts -> 0x0018CA
        self.mem[0x30], self.mem[0x31], self.mem[0x2F] = 0xCA, 0x18, 0x00
        self.mem[0x32], self.mem[0x33] = 0x10, 0x05
        self.mem[0x36] = self.mem[0x37] = 0x00
        self.writes = []

    # file-like interface used by D4
    def __enter__(self):
        return self

    def __exit__(self, *exc):
        pass

    def read(self, timeout=1.0):
        data, self.out = self.out, b""
        return data

    def write(self, data):
        if not self.d4 and data.startswith(b"\x00\x00\x00\x1b\x01@EJL 1284.4"):
            self.d4 = True
            self.out += b"\x00\x00\x00\x08\x01\x00\xc5\x00"
            return
        self.rx += data
        while len(self.rx) >= 6:
            psid, ssid, length, credit, ctrl = struct.unpack(">BBHBB", self.rx[:6])
            if len(self.rx) < length:
                return
            pkt, self.rx = self.rx[:length], self.rx[length:]
            self.on_packet(psid, pkt[6:])

    def reply(self, sid, payload, credit=1):
        self.out += struct.pack(">BBHBB", sid, sid, 6 + len(payload), credit, 0) + payload

    def on_packet(self, sid, p):
        if sid == 0:
            c = p[0]
            if c == 0x00:
                if p[1] in self.revisions:
                    self.rev = p[1]
                    self.reply(0, bytes([0x80, 0x00, p[1]]))
                else:
                    self.reply(0, bytes([0x80, 0x02, self.revisions[0]]))
            elif c == 0x09:
                self.reply(0, b"\x89\x00\x02" + p[1:])
            elif c == 0x01:
                expected = 11 if self.rev == 0x10 else 9
                assert len(p) == expected, (len(p), self.rev)
                self.reply(0, bytes([0x81, 0x00, p[1], p[2]]) +
                           struct.pack(">HHHH", 0x200, 0x200, 8, 1))
            elif c == 0x04:
                self.reply(0, bytes([0x84, 0x00, p[1], p[2]]) + struct.pack(">H", 2))
            elif c == 0x02:
                self.reply(0, bytes([0x82, 0x00, p[1], p[2]]))
            elif c == 0x08:
                self.reply(0, b"\x88\x00")
            return
        assert sid == 2
        cmd, ln = p[:2], struct.unpack("<H", p[2:4])[0]
        arg = p[4:4 + ln]
        assert len(arg) == ln
        if cmd == b"di":
            self.reply(2, ("@EJL ID\r\nMFG:EPSON;CMD:ESCPL2,BDC,D4,D4PX,ESCPR7;"
                           f"MDL:{self.model};CLS:PRINTER;DES:EPSON {self.model};"
                           ).encode(), credit=0)
        elif cmd == b"st":
            body = (b"\x01\x01\x00"            # status: error
                    b"\x02\x01\x10"            # error: waste ink overflow
                    b"\x04\x01\x10"            # warning
                    b"\x0f\x0d\x03"            # ink info, 3 bytes / colour
                    b"\x01\x00\x50\x03\x01\x40\x04\x02\x30\x05\x03\x20")
            self.reply(2, b"\x00@BDC ST2\r\n" + struct.pack("<H", len(body)) + body,
                       credit=0)
        elif cmd == b"||":
            rkey = struct.unpack("<H", arg[:2])[0]
            if rkey != SPEC["read_key"]:
                self.reply(2, b"@BDC PS\r\n||:NA;", credit=0)
                return
            op = arg[2]
            assert arg[3] == (~op & 0xFF)
            addr = struct.unpack("<H", arg[5:7])[0]
            if op == ord("A"):
                self.reply(2, f"@BDC PS\r\nEE:{addr:04X}{self.mem[addr]:02X};".encode(),
                           credit=0)
            elif op == ord("B"):
                value, key = arg[7], arg[8:]
                if key != b"Nbsjcbzb":
                    self.reply(2, b"@BDC PS\r\n||:NA;", credit=0)
                    return
                self.writes.append((addr, value))
                if not self.ignore_writes:
                    self.mem[addr] = value
                self.reply(2, b"@BDC PS\r\n||:42:OK;", credit=0)


def patched(printer):
    return mock.patch.object(em, "UsbLp", lambda path: printer)


class TestOneWay(unittest.TestCase):

    def test_clean_matches_epson_utility(self):
        data = em.build_clean(False, now=NOW)
        self.assertTrue(data.startswith(em.EJL_1284_4 + b"\x1b@\x1b@" + em.ENTER_REMOTE))
        self.assertIn(b"CH\x02\x00\x00\x00" + em.EXIT_REMOTE, data)
        self.assertIn(b"TI\x08\x00\x00\x07\xea\x0b\x0b\x11\x24\x28", data)
        self.assertTrue(data.endswith(em.ENTER_REMOTE + b"JE\x01\x00\x00" + em.EXIT_REMOTE))

    def test_power_clean_flag(self):
        self.assertIn(b"CH\x02\x00\x00\x10", em.build_clean(True))
        self.assertIn(b"CH\x02\x00\x00\x13", em.build_clean(True, 3))
        with self.assertRaises(ValueError):
            em.build_clean(True, 16)

    def test_nozzle_check(self):
        data = em.build_nozzle_check()
        self.assertIn(b"JS\x04\x00\x00\x00\x00\x00NC\x02\x00\x00\x00", data)
        self.assertIn(b"VI\x02\x00\x00\x00LD\x00\x00", data)

    def test_dump_cli(self):
        with tempfile.TemporaryDirectory() as d:
            f = os.path.join(d, "x.bin")
            em.main(["power", "--dump", f])
            with open(f, "rb") as fh:
                self.assertIn(b"CH\x02\x00\x00\x10", fh.read())


class TestEncoding(unittest.TestCase):

    def test_eeprom_payloads(self):
        self.assertEqual(em.eeprom_read_payload(SPEC, 0x30).hex(" "),
                         "97 07 41 be a0 30 00")
        self.assertEqual(em.eeprom_write_payload(SPEC, 0x36, 0x5E).hex(" "),
                         "97 07 42 bd 21 36 00 5e " + b"Nbsjcbzb".hex(" "))

    def test_model_lookup(self):
        for name in ("L3110 Series", "EPSON L3110", "l3150 series", "ET-2710 Series"):
            self.assertEqual(em.find_model(name)[0], "L3110 family", name)
        for name in ("L3210 Series", "XP-2100", "", "L31"):
            self.assertIsNone(em.find_model(name)[1], name)

    def test_waste_levels(self):
        lv = em.waste_levels({0x30: 0xCA, 0x31: 0x18, 0x2F: 0, 0x32: 0, 0x33: 0}, SPEC)
        self.assertAlmostEqual(lv["Main pad"], 100.0, places=1)
        self.assertEqual(lv["Borderless pad"], 0.0)


class TestTwoWay(unittest.TestCase):

    def test_info(self):
        with patched(FakePrinter()):
            out = em.do_info("/dev/usb/lp0")
        self.assertIn("L3110 Series", out)
        self.assertIn("L3110 family", out)

    def test_status(self):
        with patched(FakePrinter()):
            out = em.do_status("/dev/usb/lp0")
        self.assertIn("Waste ink pad counter overflow", out)
        self.assertIn("Black", out)
        self.assertIn("80%", out)

    def test_waste(self):
        with patched(FakePrinter()):
            out = em.do_waste("/dev/usb/lp0")
        self.assertIn("100.0 %", out)

    def test_revision_fallback(self):
        with patched(FakePrinter(revisions=(0x20,))):
            self.assertIn("100.0 %", em.do_waste("/dev/usb/lp0"))

    def test_reset_and_restore(self):
        p = FakePrinter()
        with tempfile.TemporaryDirectory() as d, patched(p):
            out = em.do_reset("/dev/usb/lp0", backup_dir=d)
            self.assertIn("Main pad: 0.0 %", out)
            self.assertEqual(dict(p.writes), SPEC["reset"])
            self.assertEqual(p.mem[0x36], 0x5E)
            backup = [f for f in os.listdir(d) if f.endswith(".json")][0]
            with open(os.path.join(d, backup)) as fh:
                saved = json.load(fh)
            self.assertEqual(saved["values"]["0x030"], 0xCA)
            em.do_restore("/dev/usb/lp0", os.path.join(d, backup))
            self.assertEqual((p.mem[0x30], p.mem[0x31], p.mem[0x36]), (0xCA, 0x18, 0x00))

    def test_reset_cancelled_writes_nothing(self):
        p = FakePrinter()
        with tempfile.TemporaryDirectory() as d, patched(p):
            out = em.do_reset("/dev/usb/lp0", backup_dir=d, confirm=lambda s: False)
        self.assertIn("Cancelled", out)
        self.assertEqual(p.writes, [])

    def test_reset_refuses_unknown_model(self):
        p = FakePrinter(model="L3210 Series")
        with tempfile.TemporaryDirectory() as d, patched(p):
            with self.assertRaises(RuntimeError):
                em.do_reset("/dev/usb/lp0", backup_dir=d)
        self.assertEqual(p.writes, [])

    def test_ignored_write_is_detected(self):
        p = FakePrinter(ignore_writes=True)
        with tempfile.TemporaryDirectory() as d, patched(p):
            with self.assertRaises(em.D4Error):
                em.do_reset("/dev/usb/lp0", backup_dir=d)


if __name__ == "__main__":
    unittest.main()
