# Printing the CattleBand labels — SEZNIK Josh

Test batch: **batch 4 = S1HCB0381 → S1HCB0400 (20 labels)**.
Full range (S1HCB0321 → S1HCB0421 = 101 labels) can be generated anytime from the label tool at `/labels/`.
Roll: **50 × 30 mm** direct-thermal labels.

Label layout (top to bottom): **HerdIQ** (large, centred) · **Code 128 barcode** (30.8 × 11 mm, 0.25 mm bars) · serial number.

All 20 labels in `print-files/` were machine-checked: every one decodes back to the correct serial.

## What's in `print-files/`

| File | Use |
|---|---|
| `batch04_S1HCB0381-S1HCB0400.pdf` | 20 labels, one per page — **print this from the laptop** |
| `png/*.png` | One image per label (203 dpi, black & white) — for the phone app |
| `serials_batch04_*.xlsx` / `.csv` | Serial list — for the app's Excel/serial printing feature |

Each PDF page is exactly 50 × 30 mm and holds one label as a 400 × 240-dot, 1-bit image —
one image pixel = one printer dot, so nothing gets resized or smudged.

**Other batches:** open the website's label tool (`/labels/`), set the range, and click **PDF** next to the batch
you want in the *Batches* table.

---

## Method A — Laptop over USB (recommended)

Use the **USB cable**, not Bluetooth: it's steadier for long jobs and charges the printer while it works.

### 1. One-time setup

1. **Install the Windows driver.** The listing says *"Compatible with Windows"* and lists USB. I couldn't find a
   public driver download, so get it from SEZNIK support (the listing advertises free installation help and 24/7
   support) or from the box/QR code. Once it's installed, **"Josh"** (or a similar name) shows up under
   *Settings → Bluetooth & devices → Printers & scanners*.
2. Open **Printing preferences** for that printer and set:
   - **Paper size:** custom **50 × 30 mm**. Name it `HerdIQ 50x30`.
   - **Media / paper type:** **Label with gaps** (also called "Gap" or "Die-cut"). Never pick Continuous: the printer
     would ignore the gaps and the labels would drift.
   - **Darkness / density:** start in the **middle** of the range. Full darkness makes the bars bleed into
     each other, and that's the most common reason thermal barcodes won't scan.
   - **Speed:** low or medium.
   - **Orientation:** the 50 mm side goes across the print head.
3. **Gap calibration:** most printers of this type learn the label gap when they power on with a new roll, or when
   you double-press the feed button. Check the manual for this model. If labels start printing across the gaps,
   calibration is the problem.

### 2. Test print — do this before any batch

1. Install **SumatraPDF** (free, small). It prints images at exact size. Adobe Reader works too.
2. Open `batch04_S1HCB0381-S1HCB0400.pdf` → Print → choose the Josh printer → **Pages: 1** (a single test label).
   - **Page scaling: "Actual size" / "Don't scale"**. Never use "Fit" or "Shrink".
   - Paper: `HerdIQ 50x30`. Margins: none.
3. Check the label:
   - **Centred?** If not, open the label tool on the website (`/labels/`), adjust **Shift right / Shift down**
     under *Printer calibration*, then download the batches again.
   - **Upside down?** Tick **Rotate 180°** in the same place.
   - **Bars clean and separate?** If they look fat or merged, reduce darkness by 1–2 steps.
4. **Scan it with the website on your phone.** If it opens S1HCB0381, the whole chain works.

### 3. Print the batch

Print pages 2–20 of `batch04`. Then **scan a few labels** (first, middle, last) with the website before sticking them.

When printing more batches later, wait **1–2 minutes** between batches of 20: the head heats up on long runs and
later labels come out faint. If a label jams or comes out bad, reprint just that page.

---

## Method B — Phone app (WE PRINT)

The listing's app (**"WE PRINT"**) advertises Excel printing and barcodes. I couldn't check its screens, so
this is the general approach, not exact taps:

- **Best case:** import `serials_batch04_S1HCB0381-S1HCB0400.xlsx`, add a **barcode element set to Code 128** that reads
  the `Serial` column plus a text element for the serial, set the label to 50 × 30 mm, and print 20 rows at a time.
- **Fallback (what you do today):** upload the PNGs from `png/` one at a time. It works, but it's slow
  for many labels. Use Method A.

If the app makes its own barcode, check that it's **Code 128** (not QR or EAN) and scan one before the rest.

---

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
