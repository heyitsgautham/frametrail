# User manual

FrameTrail runs in the browser at http://localhost:3150 after `pnpm build && pnpm start`.
The left rail lists the nine screens in the order an examination runs.
The case number and title sit in the top bar on every screen.

## 1. Intake, "Acquire, hash, identify"

- **Seized recorder disk** shows the image file, its size and a progress bar while it is read.
- **Hashes over every byte** shows MD5 and SHA-256, both computed in one read pass.
- **Vendor signature** shows the bytes that identified the recorder, highlighted in a hex strip, with the offset, model and firmware.
- The disk map shows every block, coloured by whether the recorder's index lists it.
- **Other exhibits in this case** lists the remaining sources, such as the NVR export.
- The write-blocked badge confirms the sources are read-only.

## 2. Recovery, "Someone wiped this recorder"

- **Time reversal** plots block number against recorded time.
  A drop means newer footage sits in front of older footage, which is how a re-initialised disk looks.
  When the disk shows no reversal the screen says "No sign of re-initialisation".
- The recorder's own log sits beside it, with the initialisation record highlighted, and the list of evidence under it.
- **Carve unallocated blocks** scans every block the index does not list.
  Each segment it keeps plays with its byte extent and hashes.
  Overwritten ranges are listed with "Nothing decodable survives".

## 3. Timeline, "One clock for every camera"

- Each recorder's card shows **Recorder screen at seizure** against the **Reference clock**, and the offset between them.
- **Cross-check, burned-in clock** shows the offset and drift read from the pixels, and how well it agrees.
- **Align clocks** moves every lane onto one reference clock.
  The raw recorder time always stays visible beside the reference time.
- Hatched red blocks marked **Not in the index** are holes, and red markers are records from the recorder's log.
- The two players are held to the same reference time.
  Each shows its recorder's raw time underneath.

## 4. Triage, "Where to look first"

- Every marker is an **AI-assisted finding** from the offline person detector, with its confidence.
- Confirm or reject each marker.
  Your verdicts carry into the report, and unreviewed markers stay marked as pending.

## 5. Provenance, "Where did this clip come from?"

- **Pick a clip to trace it back to the seized bytes.**
- The chain runs from the exported clip to its video stream, its byte extent and the seized image, with a SHA-256 at each step.
- **Kept by the export** and **Lost or not recorded** say what the remux carried and what it could not.
- **Re-hash this clip** hashes the file again in the browser and compares it with the value recorded at export.

## 6. Custody, "A log that cannot be quietly edited"

- Every action on the evidence is one entry, sealed by a hash over the previous entry's hash.
- **How each entry is sealed** explains the rule.
- **Test it** lets you edit one entry.
  That entry and every entry after it turn red, and the badge reads that the chain is broken.

## 7. Report, "Ready for the examiner to sign"

- **Generate certificate** fills the **Certificate, Part B** under Section 63(4)(c) of the Bharatiya Sakshya Adhiniyam, 2023, from the case.
- **Limitations, stated in the report** lists what the analysis cannot show.
- The name, designation and signature lines stay blank for the examiner.

## 8. Vendors, "Honest about coverage"

- One row per OEM, with **What the adapter does** and **Tested on, and limits**.
- A brand without a tested adapter reads **Reported as unsupported**, and FrameTrail never forces its files through another parser.

## 9. Research, "How we built it"

- The footage credit, how the fixtures were built, validation against the planted values, the offline model, and the standards and law we followed.
