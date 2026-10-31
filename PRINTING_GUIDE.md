# Printing CattleBand labels

Everything happens on the website. No laptop, cable or other app is needed except the printer's own phone app.

**Labels:** 50 × 30 mm direct-thermal roll, SEZNIK Josh (shows up as "LD0801 Label Printer").

## Everyday printing (phone)

1. On the HerdIQ website, tap the small **printer icon** at the top right of the home page. It opens the
   label tool (`/labels/`).
2. **Template:** pick one. *Template 1 · HerdIQ standard* is the production design: HerdIQ title, barcode,
   serial number.
3. **Serial numbers:** type the first and last serial, e.g. `S1HCB0401` → `S1HCB0420`. The tool shows how many
   labels that is.
4. Check the **preview**. Open *See all labels* to check every one.
5. Tap **Download PDF**.
6. Open the PDF in the printer's phone app (VPrint), check the label size is **50 × 30 mm**, and print over
   Bluetooth.
7. Scan the first printed label with the website's scanner before printing the rest.

The tool remembers the last template, range and alignment on that phone.

## Customising a design (templates)

Tap **Customize** next to the template. You can change:

- **Title:** text, font (Sans / Serif / Monospace), bold, size, letter spacing, position, fine move.
- **Logo:** upload a PNG/JPG/SVG, set its height and side of the title, and set the black/white cut-off.
- **Barcode / QR:** barcode only, QR only, both side by side, or nothing. Set barcode height, bar thickness,
  QR size, QR content (serial number, or a link to the device page) and the gap between them.
- **Serial number text:** font, size, spacing, position.
- **Margins.**

The preview updates as you change things. Built-in templates never change. Use **Save as new template**
(e.g. "Template 3"), and it appears under *My templates*.

- Templates you save live **on that phone/browser only**. To move one, use **Export template** and then
  **Import template** on the other device.
- To give **everyone** a template, add the exported template to `site/data/label-templates.json` in GitHub.
  It then appears under *Shared (website)* on every device.
- If the design doesn't fit on 30 mm, the tool says so instead of producing a broken label.

### Barcode or QR?

- **Barcode (Code 128):** what Template 1 uses. The website's scanner reads it.
- **QR code:** stays readable when dirty, scratched or seen at an angle, which matters on an animal.
  - **"Serial number only"** works with the website's scanner and keeps working if the site moves.
  - **"Link to the device page"** lets *any* phone camera open the page directly. But it ties every printed
    sticker to the current website address, so only use it once the final domain is fixed.

## Printer alignment

The first test print came out left of centre, so the tool **shifts every PDF 1.5 mm to the right by
default**. To fine-tune it:

1. Open **Printer alignment** in the tool and tap **Download alignment test (PDF)**. Print it.
2. Measure the gap between the printed border and the label edge on the **left (L)** and on the **right (R)**.
3. Add **(R − L) ÷ 2** to *Shift right*. Example: L = 2 mm, R = 5 mm → add 1.5 mm.

The setting is saved on that phone and applies to every template. If the print is also squashed or much
smaller than the preview, the app's label size is wrong (it must be **50 × 30 mm**, not 40 × 30). Fix that
before touching the alignment.

## Files in `print-files/`

| File | What |
|---|---|
| `TEST_6-labels_S1HCB0381-S1HCB0386.pdf` | 6 labels, Template 1, with the 1.5 mm right shift |
| `batch04_S1HCB0381-S1HCB0400.pdf` | 20 labels, same settings |
| `ALIGNMENT_TEST.pdf` | Alignment test (border 4 mm inside the edge), with the 1.5 mm shift |
| `png/`, `serials_*` | Older image/serial files for batch 4 (made before the alignment shift) |

All PDFs are vector. Text uses real fonts, and every bar is a whole number of printer dots (0.125 mm) wide.
All labels were machine-checked to decode at 203 dpi.

## Printing from a laptop instead (optional)

Open the PDF in Edge and choose **LD0801 Label Printer**. Under *More settings*: paper size 50 × 30 mm,
Scale **Actual size**, Margins **None**, Colour **Black and white**. Check that the preview shows one 5:3 label
per page; a long, thin strip means the driver's paper size is wrong.

## ⚠ Durability — read this before sticking labels on buffaloes

Direct-thermal paper labels **are not made for outdoor use on an animal**. Heat (sun on a dark collar can go
well above 50 °C), UV, rain, mud, dung, and rubbing against posts and other animals will darken, fade or scratch
them. That often takes **weeks, not months**. Once the barcode can't be read, a worker can't identify the band.

Fine for the lab and enclosure testing. Before deploying on animals:

1. **Cheap, now:** buy **synthetic (PP/PET) direct-thermal labels** for this printer, not paper ones. Cover each
   one with **clear laminating tape**, clear heat-shrink, or a thin clear epoxy/UV-resin coat.
2. **Proper, for production:** **laser-engrave the serial and the Code 128 barcode straight into the enclosure**,
   or use thermal-transfer resin labels on polyester (this needs a ribbon printer, which the Josh isn't).
   Engraving lasts as long as the enclosure.
3. **Always keep the human-readable serial** on the label (it's there now). When a barcode is damaged, workers can
   type it into the website (`321` is enough).

### Placement

- Stick on a **flat, clean, dry** face of the enclosure (wipe with isopropyl alcohol first).
- If the surface curves, lay the barcode's **length along the flat (straight) direction**, so the bars wrap around
  the curve. If the barcode itself bends away from the camera, the ends get squashed and it won't read.
- Leave the blank margin to the **left and right of the bars** uncovered. Scanners need that quiet zone.
