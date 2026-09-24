# Independent ship accuracy critique

Reference: `/Users/nick/Downloads/image.png`. Scores judge visible resemblance, not effort or object count. Reviewed by independent critic agent after each major section. The concept is a multi-view sheet; broadside, bow, stern, and deck must all agree. No image projection is acceptable.

## Score history

| Review | Accuracy / 10 | End closure / 10 | Evidence |
|---|---:|---:|---|
| Baseline | 4.0 | 1.0 | baseline-bow.png, baseline-stern.png, baseline-broadside.png |
| Section 1 | 6.0 | 9.0 | Five section1 renders: closed ends, headrails, enclosed gallery |
| Section 2 | 7.2 | 9.0 | section2-eevee.png, section2-bow-end.png, section2-stern-end.png |
| Section 3 | 7.6 | 9.0 | section3-eevee.png, section3-stern.png, section3-bow-end.png, section3-stern-end.png |
| Section 4 (Astra) | 7.7 | 9.0 | Seven section4-astra renders; deck 7.8/10, transverse rig proportion mismatch newly exposed |
| Section 5 (Astra) | 6.8 | 9.0 | Interim yard scaling regression; seven section5-astra renders |
| Section 5b (Astra) | 8.0 | 9.0 | Seven section5b-astra renders; yard bug fixed, wider canvas and contiguous copper surface |
| Section 6 (Astra) | 8.3 | 9.0 | Seven section6-astra renders; curved gallery, copper seams, corrected ensigns |
| Section 7 (Astra) | 8.4 | 9.0 | Seven section7-astra renders; rudder attachment, continuous stern strakes, consistent canvas |
| Final pass (Astra) | 8.5 | 9.0 | reference-comparison.png and four game-orbit stills; forward game sails are intentional |

## What is now fixed

The original open bow and stern exposed the bilge and floor. Current end-on and three-quarter renders show enclosed stepped hull geometry. Headrails now have three gold-on-black sweeps, stern has a complete gallery with side returns, hull bottom is broad and U-shaped, square sails are warm cream with shaped feet, and erroneous lower mizzen square sail is removed. Gunports now read as black insets. Section 3 brings lower-hull color and horizontal surface direction closer, and adds useful stern ornament.

## Section 3 verdict

7.6/10: recognizably the same general frigate design, but not yet a convincing detailed match to the supplied concept. Closure is visibly resolved. This is not an acceptance sign-off and must not be reported as an exact match.

## Highest-impact remaining work

1. Deck density and equipment fidelity need a dedicated overhead review. Current close-ups show broad empty spaces, simple black hatch bars, plain mast bases, and simplified cannon shapes. Reference deck has several detailed grating hatches, capstan, barrel clusters, ladders, cannon carriages, working fittings, and raised bow/stern deck organization. Inspect current objects and make a clean top-view render before declaring completeness. Details already modeled but occluded should not be recreated blindly.
2. Surface relief remains too coarse despite better color: lower hull horizontal courses still create deep ledges, while the reference has fine subdued plank joints. End-on bow also retains strong checkerboard stepping on the upper tan band. Reduce protrusion depth without removing the block silhouette. Reference stern has finer, denser framing and relief than current symmetric two-row window facade; this is improved but still simplified.
3. Canvas should look like formed fabric within the voxel style. Square sails retain very rectangular outer edges with an abrupt notch at their center feet; concept has gently varied lateral contours and more organic stepped gathered feet. Bow jibs and aft driver remain flat clean triangles/trapezoid with a different surface treatment from square sails. Keep cream color and existing mast proportions, refine contours and consistent panel depth rather than globally rescaling.

## Verification before final claim

Use neutral lit Eevee/Cycles renders for material assessment; workbench images in this set make cream/gold artificially dark. Render exact broadside plus full bow/stern and overhead views alongside equivalent reference crops. Finish a real orbit of the edited geometry, inspect several off-angle frames for holes/intersections, and verify exported GLB retains edited materials and parts. A score does not substitute for the actual rendered comparison.

## Reference-specific acceptance checks for the next refinement

These checks are tied to the supplied multi-view sheet (`/Users/nick/Downloads/image.png`) and should be judged from renders, not object names or the presence of hidden geometry.

### Deck, hatches, capstan, mast bases

- Provide one neutral-lit overhead render at the reference's top-view angle and one three-quarter deck crop. The deck must read as occupied working space across the foredeck, between masts, and quarterdeck; long unbroken tan rectangles fail even if parts exist below the camera line.
- Hatches must be raised, framed grating assemblies with visible cross-slats and dark recesses. Their fore, middle, and aft placement and relative scale should agree with the reference deck plan; flat black bars or isolated dark squares do not pass.
- The capstan must read as a circular/stepped wooden fitting with a central drum and surrounding bars or spokes, placed on the working deck near the forward working area shown in the reference. A single dark cube or an unlit color patch does not pass.
- Each of the three mast feet must be visible from above as a stepped partner/collar or square footing integrated into the planks, with nearby ladders, bitts, or deck fittings where shown. Bare vertical trunks entering an empty deck fail. Do not add a fourth mast to chase detail: preserve the reference's three-mast spacing and bowsprit.
- Overhead silhouettes should show the reference's narrowed bow, fuller middle, rounded enclosed stern, side gunwale rhythm, and raised fore/aft deck organization. Deck detail that changes these proportions is a regression.

### Cannons and side rhythm

- Broadside renders must retain the reference's regular black gunport cadence along the tan battery band, with consistent vertical alignment and no accidental gaps or double openings.
- At least one three-quarter and one overhead crop must show cannon tubes, carriages, and wheel/block supports as separate readable forms behind selected ports. Uniform black rectangles, floating barrels, or repeated ungrounded cylinders fail the detail check.
- Cannon scale must remain subordinate to hull height and ports: the reference reads as a compact voxel carriage inside each opening, not a row of oversized tubes projecting beyond the hull.

### Hull, stern, and surface fidelity

- Lower-hull courses must remain horizontal and fine-grained, with shallow relief. Deep shelf-like ledges or a checkerboard wall on the upper tan band are regressions even when the red-brown color is correct.
- The stern must read as a framed enclosed gallery from rear and rear three-quarter views: dense gold/black framing, two compact rows of windows/panels, side returns, and a rounded/stepped outer contour. A symmetric flat two-row facade fails the reference match.
- Bow closure, headrails, and the broad U-shaped lower hull remain acceptance gates. Any visible hole into the bilge, exposed floor, or broken headrail cancels a detail pass.

### Sails and rigging

- Square sails must keep the warm cream palette and mast proportions while gaining gently varied stepped outer contours. Hard rectangular edges with one abrupt center notch at the foot remain a mismatch.
- Jibs and the aft driver must use the same formed-fabric/panel treatment as the square sails: visible but restrained panel seams, consistent thickness/depth, and gathered or stepped feet. Flat clean triangles/trapezoids with a different surface treatment fail.
- Sails should preserve the reference's relative area and spacing in broadside and bow/stern views. Do not globally rescale sails to hide deck or hull errors.

### Render evidence required for sign-off

- Submit neutral-lit Eevee or Cycles broadside, bow, stern, and overhead frames at comparable framing to the reference, plus at least three off-angle orbit frames. Workbench-only or a single hero frame is insufficient.
- Score visible match only. Hidden or occluded modeled parts do not receive credit until an appropriate camera exposes them; do not recreate parts blindly without checking the current overhead and orbit renders.

Current user instruction: ASTRA ONLY. Do not switch to Luna. This critic has not changed task model settings.


## Section 4 preliminary overhead critique (Astra)

Evidence: `section4-overhead.png`, compared directly with the supplied reference top view. Overall score remains provisionally **7.6/10** pending a complete new render set; deck resemblance alone is approximately **5.5/10**.

1. Five nearly identical single-direction barred hatches dominate the working deck. Replace their bar pattern with readable cross-grating, raised timber frames, and dark recesses. Vary hatch sizes and placement to the reference, including a larger central assembly and smaller aft fittings.
2. Working-deck density is still low. Reference has barrel clusters, mast partner assemblies, compact bitts/cleats, ladders or companionway details, and a capstan with an actual drum and head. Current capstan reads mainly as thin spokes around a small square. Inspect existing occluded fittings before adding replacements.
3. Current gun carriages resemble narrow fork brackets. Reference shows wooden cradles, paired dark wheels, and short banded barrels as distinct chunky forms. Verify a deck crop with these details clearly visible.
4. Current overhead stern is nearly a flat transom at full beam; reference narrows and rounds through its aft portion and organizes that area as a compact raised quarterdeck. The reference illustrated deck also appears more slender (roughly 4.5:1 versus the current overhead roughly 3.7:1). Confirm camera and dimensions before any global beam edit; these are image estimates, not a measured requirement.
5. Section 3 broadside lower-hull ledges remain too deep compared with the reference's subdued plank joints. Surface relief is still a separate major correction after deck organization.

Do not treat this preliminary review as a section 4 pass. Fresh neutral-lit overhead and deck three-quarter views are required to credit the new fittings.


## Section 4 full review (Astra)

Evidence: all seven `section4-astra-` renders: broadside, bow, stern, bow-full, stern-full, overhead, and deck-oblique. **Overall 7.7/10; deck 7.8/10; end closure 9.0/10.** The substantial deck improvement is real. Overall score increases only slightly because the new full end views expose a major unresolved proportion mismatch. This is not a sign-off.

### Credited improvement

Cross-gratings now read as framed recessed assemblies of varied size. Capstan has a readable head, drum, and bars. Cannons have separately readable wooden cradles and paired dark wheels. Mast partner fittings, barrel clusters, bitts, coils, ladders, shot racks, and wheel produce occupied working areas. These now satisfy the basic deck-equipment presence/readability gate.

### Next corrections, in priority order

1. **Transverse rig width:** in the full end views, the model's lowest square yards/sails span only about 1.1 times the hull beam. The corresponding reference bow and stern illustrations show approximately 1.5–1.7 times beam. These are visual image estimates, but the mismatch is large: the model reads as narrow vertical canvas over a broad hull. Check actual hull beam and rig dimensions, then match relative end-on silhouette; avoid judging this from broadside alone. The lower square sail feet also need two broader hanging lobes with gently stepped contours, replacing mostly straight bottoms interrupted by tiny repeated notches.
2. **Hull surface relief:** bow and stern close-ups reveal deep ledges and regularly recessed gaps that read like a perforated lattice. Reference planking has shallow joints with much less depth. Reduce course protrusion and close excessive face-to-face recesses while retaining the stepped hull silhouette.
3. **Stern geometry:** large rectangular two-row gallery remains too planar and rectilinear. Taper/round the aft hull plan and gallery corners toward the reference's compact enclosed stern, then add finer varied gold/black ornament. Existing closure must remain intact.
4. **Deck material separation:** wood fittings, barrels, ladders, and gun carriages are almost the same tan as deck planks. Reference uses distinct warmer/darker timber and dark barrel hoops. Add restrained contrast without altering the now-improved layout. The main-mast partner also overlaps the adjacent hatch's forward edge in overhead/deck-oblique views; give those assemblies clear separation.

Future scores should use the full view set consistently. The previous 7.6 was based on incomplete end-on sail evidence; neither detail count nor deck-only improvement justifies ignoring newly exposed silhouette mismatches.


## Section 5 review (Astra): yard regression blocks acceptance

Evidence: all seven `section5-astra-` images. **Overall 6.8/10 as rendered; deck 8.0/10; closure 9.0/10.** This is an interim regression score, not an assessment of the intended geometry after repair.

- **Blocking regression:** multiple black yards run entirely off both sides of the bow/stern images. Broadside confirms these are actual overlong beams crossing multiple masts and the jib area. Restore each yard to bounded endpoints just beyond its own sail, checking transformed world dimensions rather than applying another blind scale. Fresh broadside and full end renders are required before crediting the rig adjustment.
- Sail canvas transverse span itself is much closer to the reference. Wider lower sails and paired hanging lobes improve end silhouette. In broadside the deepest central cut now looks exaggerated; review lobe shape once the yard bug is fixed. Canvas surface still resembles deeply extruded alternating strips in close-up, rather than fine fabric panels.
- The copper backing change removes some open-looking dark gaps, but bow/stern close-ups still display a regular pattern of deep square recesses and protruding cubes. This does not yet meet the shallow-plank-relief criterion. Visible relief must be reduced, not just backed with another surface.
- Warmer/darker deck fittings improve separation, and the moved hatch no longer intersects the main-mast partner. Deck rises modestly to 8.0. Barrel hoop contrast remains weak compared with the reference.
- Gallery shaping remains needed, but repair the yard regression before treating another major section as finished.


## Section 5b review (Astra)

Evidence: all seven `section5b-astra-` images. **Overall 8.0/10; deck 8.0/10; end closure 9.0/10.** No sign-off yet.

### Fixed and credited

- Overlong yards are repaired in both broadside and full end views. Lowest sail span is now approximately 1.6 times hull beam and matches the reference far better. Keep this rig width.
- Square sails no longer contain obvious light gaps or deep alternating strip extrusions.
- Lower-hull square cavities are removed. Continuous shallow copper strakes are a much stronger base for the reference appearance.

### Remaining work

1. **Stern/gallery:** highest remaining structural mismatch. Full-beam rectangular aft plan and straight planar window facade remain unlike the reference's narrowed/rounded stern with wrapped gallery corners. Shape the aft approximately 10–15% of the plan, keep gallery enclosed, wrap bays around corners, and replace oversized straight cornices with compact richer gold/black framing and crest details. This is not a request to change the entire hull beam.
2. **Copper articulation:** current broadside is nearly an uninterrupted brown band; the reference contains visible shallow rectangular courses. Add restrained staggered face seams and subtle panel color variation on the current surface. Do not restore the deep cube offsets or cavities.
3. **Flags:** the small canton currently reads as a cross-grid. Reference has a recognizable Union design with diagonal white/red saltire within blue, and a lightly folded/stepped outer silhouette. Refine actual editable flag geometry or material mapping accordingly.
4. **Lighting evidence:** full bow rendering makes cream sails gray with severe one-sided shadow. Add neutral front fill in final verification so material comparison is fair; do not compensate by arbitrary sail material changes.

Deck layout gains from section 5 remain intact. Reference deck proportions and general stern shape remain visibly different; an 8.0 score indicates clear resemblance with substantial remaining reference mismatches, not exact reconstruction.


## Section 6 review (Astra)

Evidence: all seven `section6-astra-` images. **Overall 8.3/10; deck 8.1/10; end closure 9.0/10.** Clear reference resemblance, still not an exact match or final sign-off.

Curved/wrapped gallery and rounded aft plan improve the stern substantially. Shallow copper face joints now provide the missing course articulation without the earlier square cavities. Ensign cantons are recognizable and folded flag geometry reads properly.

Remaining significant corrections:

1. **Rudder attachment:** the pale rudder is visibly detached below the sloped stern in broadside and rear three-quarter images; its straps terminate without reaching the hull. Fit the rudder and hinges to the actual sloping sternpost. Parent identified the same issue independently and is correcting it.
2. **Canvas consistency:** square sails now use soft, thin faceted surfaces, while jibs and aft driver remain visibly rigid gridded panels with a different depth/shading treatment. Apply comparably restrained panel depth and fabric shaping to those surfaces while preserving their reference silhouette and area.
3. **Stern detail:** geometry is now acceptable as a base. Reference framing is still finer and more varied than the repeated equal-size four-pane bays and thick gold bars. Refine framing and dark/gold ornament locally rather than reshaping the entire stern again.
4. **Under-stern strakes:** dark horizontal shelf bands remain visible under the gallery. Inspect actual ledge depth and make the stern course treatment consistent with the now-subdued bow and side surfaces.
5. **Verification:** use brighter neutral canvas lighting for the final full bow/stern evidence, then supply at least three full-geometry off-angle orbit images. Current close-up deck views omit sails; they cannot establish that rig/sail intersections and closure remain clean from arbitrary angles.


## Section 7 review (Astra)

Evidence: all seven `section7-astra-` images. **Overall 8.4/10; deck 8.1/10; end closure 9.0/10.** Rudder follows the sloping stern and is visibly attached. Horizontal under-gallery shelves are gone. Square sails, jibs, and driver now share a thin continuous cloth treatment and warmer palette.

Highest remaining reference mismatch is canvas surface articulation: surfaces are now too blank, especially broadside jibs, which resemble clean graphic cutouts. Add faint panel seams and slight cream variation on the continuous surfaces. Avoid thick extruded strips and high-contrast grid lines.

Remaining reference-specific fine-detail gaps include the coarse repeated equal-size four-pane gallery grid, simplified uniform mast/timber finish, and the deck silhouette still appearing broader than the illustrated reference. These should be assessed in the planned side-by-side comparison; they do not justify a blind global rebuild.

Verification is now the next major gate: supply full-geometry off-angle orbit evidence. Thin jib-edge curves overlap the mast centerline in the bow projection; these may be normal depth overlap, so inspect in orbit before editing them. Current deck crops intentionally hide most rigging and cannot establish sail/rig intersection quality.


## Section 7 off-angle orbit review (Astra)

Evidence: `section7-orbit-031.png`, `091.png`, `151.png`, `211.png`. Hull enclosure remains visibly intact across all four angles. The repeated oversized fighting-top slabs are clearly exposed; parent is replacing these with tier-appropriate platforms and trestletrees. Tallest rig is cropped in frames 151 and 211, so final orbit framing must expand.

**Unresolved rig/cloth overlap:** frame 151 shows triangular shroud/ratline patterns terminating within the lower main-course canvas (approximately image x595,y505 at the upper tip) and lower fore-course canvas (approximately x875,y615). These could indicate sail surfaces crossing shroud paths, but cast rigging shadows can produce similar internal patterns. Therefore this is a verification flag, not a confirmed intersection. Inspect an unlit/material pass or perform direct segment–cloth intersection checks. If actual penetration exists, give the cloth forward clearance or place shrouds behind the cloth while preserving mast-top and deck attachment endpoints. Do not flatten or remove rigging based on projection alone.

The four orbit images add useful full-geometry evidence, but the pending platform edits and unresolved rig/cloth interpretation mean no final intersection sign-off yet. Overall section 7 score remains 8.4 pending these checks.


## Final pass review (Astra): final requested scope

The user limited work to one final pass, then requested forward-facing square sails, animated sails/anchors/lights, and preparation as an NPC replacement. The concept-angle reconstruction is preserved separately in `royal-navy-frigate-reference-match.blend`; the current game version intentionally differs in square-sail angle. Do not reopen broad reconstruction iterations.

Evidence independently viewed: `reference-comparison.png` and `game-orbit-031.png`, `091.png`, `151.png`, `211.png`. Independently read `rig-intersections-after.json`, which contains `[]`.

**Final reference resemblance: 8.5/10. End closure: 9.0/10. No concrete blocking visual defect found in the four current game-orbit stills.** This is a strong recognizable reconstruction, not an exact copy of the concept.

- Current framing includes the full rig and hull in all four supplied game views.
- Oversized repeated mast platforms have been replaced with detailed lower platforms and compact upper structures.
- Canvas seams are restrained and continuous; hull/gallery/rudder remain enclosed and connected.
- Previous shroud penetration patterns are cleared in the supplied views; the empty centerline/BVH intersection report supports geometric clearance at the tested state.
- Forward-facing square sails are an authorized game change and are not counted as a reconstruction error.

Residual reference differences are recorded as limitations, not new work requests: smoother/simpler canvas contours and material treatment; cleaner, coarser repetitive gallery detail; different deck silhouette and equipment distribution.

**Review boundary:** these still images do not certify animation playback or clearance at every animated pose. The final video should visibly demonstrate sail movement, anchor movement, and light changes, with extreme poses checked for clipping. Runtime draw-batch count, file size, and loader-test results were reported by the parent and were not independently rerun by this visual critic.
