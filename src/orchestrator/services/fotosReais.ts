/** Source photos and layout references are identified by the prompt attachment manifest. */
export const INSTRUCOES_FOTOS_REAIS = `
REAL BEFORE/AFTER - INTEGRATED PHOTO COMPOSITION:
Use the attached SOURCE BEFORE and SOURCE AFTER photos directly inside the final design. Deliver the complete composition with both photos already fitted to their frames, borders and corner masks, plus the exact labels "Antes" and "Depois".
Preserve each source patient's anatomy, lip contour, skin texture, lighting and clinical result. Do not beautify, retouch, invent or exaggerate the treatment outcome. Do not generate a replacement patient, borrow patients from layout references, swap the sources, or blend BEFORE and AFTER.
Fit the supplied photos edge-to-edge within the reference's photo frames using proportional scaling and careful cropping of peripheral background only. Keep the treatment area visible and undistorted. Do not stretch the photos or add letterboxing, colored halos, gaps or blank bands inside the frames.
There is NO later photo overlay step. Do NOT draw cyan/green placeholder masks or empty photo frames: output the real source photos integrated into the finished design. Only the official logo uses the separate magenta placeholder.
Patient photos have been removed from layout references and replaced with gray rectangles. These rectangles mark photo placement ONLY: replace them completely with the supplied SOURCE BEFORE and SOURCE AFTER. Never leave the gray rectangles in the final artwork. Use the actual orientation and visible details of each source, not an invented frontal view.
`;
