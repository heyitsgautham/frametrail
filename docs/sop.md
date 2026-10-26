# Standard operating procedure

How an examiner takes a recorder from the scene to a signed certificate with FrameTrail.
It follows SWGDE 17-V-002 (Best Practices for Data Acquisition from Digital Video Recorders), NISTIR 8172, and the Kerala Police digital evidence SOP for CCTV seizure.

## 1. At the scene

1. Photograph the recorder, its labels, cabling and the number of cameras connected.
2. Note the make, model and serial number from the label.
3. Photograph the recorder's own screen showing its date and time, with a reference clock in the same frame.
   A phone synced to network time works as the reference.
4. Write down both times and the difference.
   The offset is recorder time minus reference time.
5. Never change the recorder's date or time, even if it is wrong.
6. Note whether overwrite is enabled, and the earliest recording the recorder still shows.
   A recorder that overwrites will destroy old footage while it keeps running.
7. Take a native export of the footage you need, and the vendor's player if it offers one.
   Take an open-format copy as a second copy.
8. If the disk will be imaged, power the recorder down as the device manual advises and seize it.

## 2. Acquisition in the lab

1. Remove the disk and connect it through a hardware write blocker.
2. Take a full image of the disk.
3. Record MD5 and SHA-256 of the image.
4. Keep the original disk sealed, and work only on copies of the image.

## 3. Analysis in FrameTrail

1. Intake.
   Load the image and the native exports.
   FrameTrail hashes each file in one read, identifies the vendor from its signature bytes and shows the block map.
   Check the hashes against the ones recorded at acquisition.
2. Timeline.
   The seizure record for each recorder goes into the case.
   Write both times as the clocks showed them, with no UTC offset, since the recorder's own times carry none.
   FrameTrail sets each clock's offset from it and cross-checks it against the burned-in clock.
   Review any camera whose two methods disagree.
3. Recovery.
   If the timeline shows holes, open Recovery.
   Check the recorder's log and the time-reversal evidence for a wipe, then carve the unallocated blocks.
   Only segments whose frames decode are kept, and overwritten ranges are shown as lost.
4. Triage.
   Use the AI markers to decide where to look first.
5. Provenance.
   For each clip you intend to export, check its chain back to the byte extent and the seized image, and re-hash it.
6. Custody.
   Confirm every custody entry verifies before you export.

## 4. Reviewing AI markers

- A marker is a lead, never evidence on its own.
- Watch the footage around every marker you rely on, and confirm or reject it.
- Rejected and unreviewed markers stay in the case record.
- The report lists the model, its version, and each marker's confidence and verdict.
- Do not treat the absence of a marker as proof that nothing happened. Low light, crowds and camera angle cause misses.

## 5. Export and report

1. Export the clips you need.
   FrameTrail remuxes without re-encoding and records what the export kept and could not carry.
2. Generate the certificate, Part B, under Section 63(4)(c) of the Bharatiya Sakshya Adhiniyam, 2023.
   FrameTrail fills device type DVR, make and model, the hash algorithm and value of every source, and the acquisition details.
3. Read every field against your own notes.
4. The certificate is signed by the examiner, by hand or with their digital signature.
   FrameTrail never signs it.
5. Part A is signed by the party producing the record, as the Schedule to the Act requires.
