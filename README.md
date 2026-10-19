# Recurio+ network simulator

A local browser visualization of camera traffic over LoRa. The default JRBP view compresses **July 2009–May 2025** into chronological monthly frames, using **401,897 unique image records from 22 cameras**. All communication remains direct to the gateway; no adaptive routing or semantic reference algorithm is implemented.

## Run

```bash
python scripts/index_dataset.py --root /data/JR_CAMERA_TRAPS
python server.py --port 8888
```

Open **http://localhost:8888**. No frontend build or npm install is needed. Python 3.10+ is required. The server binds to localhost. If the historical index is missing, synthetic mode works independently. The dataset selector indicates when the index needs rebuilding.

## Historical playback

- **One shared calendar:** one frame = one calendar month. All 191 months are retained, including quiet periods. Default playback is four months per second, roughly 48 seconds for the entire record. Speed controls change playback speed, not counts or chronology.
- **Network heat:** camera fills, halos and links encode the number of recorded images at that camera in the current month. Counts appear under each camera. Zero-count links are faint and have no moving traffic dots.
- **Historical heatmap:** rows = cameras; columns = months. A fixed logarithmic color scale (`log(1 + count)`) spans the full dataset so colors remain comparable across cameras and years. Gray means no recorded images, not known downtime. The full history is visible, including months ahead of the playback cursor.
- **Explore:** hover a heatmap cell for its count; click it to select that camera and seek to that month. The timeline slider also seeks, pauses playback, and recomputes cumulative costs through that month. Keyboard users can operate the slider and camera buttons.
- **Inspect:** select a camera for current-month counts, cumulative modeled energy and a representative image: the latest recorded timestamp in that camera-month.
- **Costs:** bars show current monthly whole-network costs relative to the historical peak, with chronological cost traces and cumulative totals. Workload changes drive cost changes; no savings are scripted.
- **Export:** JSON contains monthly camera traffic aggregates, modeled costs and representative-image provenance. It is explicitly **not an individual-image ledger**. Full image records remain in the source spreadsheet.

The indexer scans the entire metadata spreadsheet, matches existing files, deduplicates image paths, and aggregates by camera and calendar month. There is no 500-image sampling cap. The current source has 401,909 metadata rows, including 12 repeated image paths, yielding 401,897 unique indexed images. The resulting index is approximately 511 KB because each occupied camera-month stores a count and one representative image. Image files are not copied. Generated metadata lives in ignored `web/data/jrbp.json`.

Thumbnails require Pillow, already available in this environment. Otherwise install it with `python -m pip install Pillow`. Use `--data-root` on the server for an alternative dataset location. Filenames and recorded timestamps are retained for representative samples; exact camera coordinates are not published.

## What is recorded vs modeled

**Recorded:** image counts, camera IDs, chronological months, species annotations and representative-image source timestamps/paths. Monthly aggregation preserves long-term trends, not individual capture intervals or within-month bursts. The recorded timezone, camera clock synchronization and deployment uptime are not established. The first and last months can represent partial coverage.

**Modeled:** fictional positions, direct LoRa delivery, radio parameters and costs. Each report uses 6,000 image bytes + 40 provenance bytes + 32 header bytes. These are assumed transmitted sizes, not measured JPEG sizes. LoRa rate is 5.5 kbit/s, transmit power 120 mW, and capture/processing energy 6 mJ per report. Seed-42 link probabilities are fixed per camera. Expected airtime is `bytes × 8 / rate / link_probability`; camera energy is `airtime × transmit_power + processing_energy`. Every recorded image contributes one report's cost.

Historical replay accounts for energy across years **without truncating observations when a hypothetical battery runs out**. Real maintenance/battery replacement is unknown; lifetime battery percentages are not inferred. Energy excludes gateway power, idle draw and receive windows. Airtime is the sum of radio usage, not wall-clock latency. Contention, duty-cycle limits, fragmentation, queues and actual delivery outcomes are not modeled. Moving dots illustrate aggregate activity, not individual packets.

All positions and the optional 150-unit BLE reach circles are illustrative. There is no BLE traffic, shared memory, image embedding, semantic matching or self-configuration.

## Synthetic mode

The selector also retains the original deterministic 20-camera demo: one image per camera per one-minute step, up to 600 steps. Its costs use a 12-step rolling average relative to the initial baseline; its 3,600 J batteries admit only affordable reports. This is useful for checking the direct-to-gateway baseline independently of the dataset.

## Code and checks

`web/simulation.js` holds the model; `web/app.js` renders the SVG network and interactive canvas heatmap. `scripts/index_dataset.py` builds the historical index; `server.py` serves the app and local thumbnails.

```bash
npm test
python -m py_compile server.py scripts/index_dataset.py
```

Tests cover direct-only transmission, deterministic accounting, battery admission in synthetic mode, chronological monthly replay including zero-traffic months, count conservation, energy scaling and bounded playback. Browser checks also verified historical default loading, heatmap colors/hover/seeking, all 401,897 reports at the final month, JSON export, replay, synthetic fallback and mobile layout.
