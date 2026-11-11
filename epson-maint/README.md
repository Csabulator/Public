# epson-maint

A small maintenance tool for Epson inkjet printers on Linux. It does what the
official *Epson Printer Utility* for Linux leaves out, so you don't have to
boot Windows just to clean your print head:

| Function | Official Linux utility | epson-maint |
|---|:-:|:-:|
| Nozzle check | ✓ | ✓ |
| Head cleaning | ✓ | ✓ |
| **Power / Deep Cleaning** | – | ✓ |
| **Status, error and warning codes** | partly | ✓ |
| **Waste ink pad counter (read)** | – | ✓ |
| **Waste ink pad counter (reset, with backup and restore)** | – | ✓ (supported models) |

It is a single Python 3 file that only uses the standard library. The GUI needs
Tkinter (`sudo apt install python3-tk`).

> **Status:** the protocol code is tested against a simulated printer.
> Real-hardware reports are very welcome. Please open an issue with your model
> and the output of `epson-maint info`.

## Install

```sh
curl -O https://raw.githubusercontent.com/Csabulator/Public/main/epson-maint/epson_maint.py
chmod +x epson_maint.py
```

## Usage

Run `./epson_maint.py` with no arguments to open the GUI, or use the command line:

```sh
# one-way commands: CUPS queue, USB or network
./epson_maint.py nozzle                    # auto-picks the only Epson CUPS queue
./epson_maint.py clean  --queue EPSON_L3110
./epson_maint.py power  --usb              # Power Cleaning, asks for confirmation
./epson_maint.py power  --ip 192.168.1.50  # network printers, raw port 9100

# two-way commands: direct USB only (/dev/usb/lpX)
./epson_maint.py info
./epson_maint.py status
./epson_maint.py waste
./epson_maint.py reset-waste --backup-dir ~/printer-backups
./epson_maint.py restore-waste ~/printer-backups/epson-waste-backup-20261111-180923.json
./epson_maint.py read-eeprom 0x2F 0x30 0x31
```

If you get *Permission denied* on `/dev/usb/lp0`, add yourself to the `lp`
group (`sudo usermod -aG lp $USER`, then log in again) or use `sudo`.

`--debug` prints a hex dump of the USB traffic.

### Power Cleaning

Power Cleaning sends remote command `CH 00 10` instead of the regular
`CH 00 00`. It uses a lot more ink and fills the waste ink pad faster. Use it
only after 2–3 regular cleanings have not fixed the nozzle check pattern.
`--group N` cleans a single nozzle group (experimental and model dependent).

### Waste ink counter reset

Epson printers count the ink that goes into the waste ink pad during cleanings
and stop working once the counter reaches its limit (status: *Waste ink pad
counter overflow*). Resetting the counter makes the printer work again. **But
if the pad really is saturated, ink will eventually leak out underneath the
printer.** Clean or replace the pad, or fit an external waste ink tank.

Safety measures in `reset-waste`:

* It only writes to the EEPROM if the model reported by the printer is in the
  built-in database. It never guesses for unknown models.
* It saves the current values to a JSON backup before writing anything.
* It asks you to type `RESET` before writing.
* It reads every byte back after writing, because some firmware answers *OK*
  but ignores the write.
* `restore-waste` writes a backup back.

You use this function at your own risk.

### Supported models for EEPROM functions

The L3110 family: L1110, L1118, L1119, L3100–L3119, L3150–L3168, L5190–L5198,
ET-1110, ET-2710–ET-2726, ET-4700.

Nozzle check, cleaning, Power Cleaning and status work on most Epson inkjet
printers. Adding a model only needs its read key, write key and EEPROM
addresses in the `MODELS` table. Pull requests are welcome, but please cite a
reliable source or a tested device.

## Printer shared by a Synology NAS (or another print server)

* **Cleaning and nozzle check** work through the CUPS queue on your PC. The
  data is sent raw and the NAS passes it straight through to the printer.
* **Two-way functions** don't work through a print share, because the share
  only passes data in one direction. Run the script on the NAS itself over
  SSH. DSM 7 ships with Python 3:

  ```sh
  scp epson_maint.py admin@nas:~/
  ssh admin@nas
  ls /dev/usb/                       # check that lp0 exists
  sudo python3 epson_maint.py status --usb /dev/usb/lp0
  ```

  If the device is busy, pause the DSM print service for a moment, or plug the
  printer into your PC temporarily.

## How it works

* One-way commands use ESC/P2 *remote mode*. These are the same byte
  sequences the official Epson utility sends, plus the Power Cleaning flag.
* Two-way commands switch the printer to IEEE 1284.4 (D4) packet mode and talk
  to its `EPSON-CTRL` service: `di` (identification), `st` (status) and the
  factory `||` command (EEPROM read and write).

Run the tests with `python3 -m unittest discover -s tests`. The tests include
a simulated printer that speaks D4 and EPSON-CTRL.

## Credits

No code was copied from these projects, but their published research made
this tool possible:

* [Gutenprint / escputil](https://gimp-print.sourceforge.io/): remote-mode
  command reference.
* [Ircama/epson_print_conf](https://github.com/Ircama/epson_print_conf)
  (EUPL-1.2): EPSON-CTRL, EEPROM command format, status codes and model data.
* [reinkpy](https://codeberg.org/atufi/reinkpy) (AGPL-3.0): an independent
  source for the same model keys and addresses.

Epson is a trademark of Seiko Epson Corporation. This project is not
affiliated with or endorsed by Epson.

## License

MIT, see [LICENSE](LICENSE).
