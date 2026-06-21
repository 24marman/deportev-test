const TOP_SCORER_HIGGSFIELD_PRESET_VERSION = "top-scorers-bw-grunge-v1";
const TOP_SCORER_HIGGSFIELD_MODEL = process.env.HIGGSFIELD_IMAGE_MODEL || "flux_kontext";
const TOP_SCORER_HIGGSFIELD_ASPECT_RATIO = process.env.HIGGSFIELD_IMAGE_ASPECT_RATIO || "1:1";

function buildTopScorerHiggsfieldPrompt({ direction = "left" } = {}) {
  return [
    `ART DIRECTION LOCKED PRESET: ${TOP_SCORER_HIGGSFIELD_PRESET_VERSION}.`,
    "Use the input image only to preserve the exact player's facial identity, head shape, hairline, beard, expression and camera angle.",
    "Create a realistic black-and-white editorial football portrait that looks like every player in this series was photographed in the same session.",
    "Subject crop: face and neck only, almost no shoulders, no torso, no readable shirt, no badge, no logo, no text.",
    "Composition: tight head-and-neck close-up, the face fills the frame vertically, profile or three-quarter profile facing " +
      `${direction}, with permission to crop a little hair at the top for a stronger poster crop.`,
    "Lighting: hard stadium/editorial key light from upper left, deep shadows on the far side, bright gritty highlights, same exposure and same contrast across all players.",
    "Texture: heavy monochrome grain, scratched photocopy marks, halftone dirt, rough newspaper-print grunge, sharp facial detail with distressed edges.",
    "Color contract: the player must be pure grayscale only. The background must be perfectly flat solid #00ff00 chroma key, with no gradient, no texture and no shadow.",
    "Consistency contract: same brightness, contrast, shadow density, texture intensity, sharpness, focal length, crop and background treatment for every generated player.",
    "Do not beautify, do not cartoon, do not make a clean studio portrait, do not change the player into a different person, do not add jersey details.",
  ].join("\n");
}

module.exports = {
  TOP_SCORER_HIGGSFIELD_ASPECT_RATIO,
  TOP_SCORER_HIGGSFIELD_MODEL,
  TOP_SCORER_HIGGSFIELD_PRESET_VERSION,
  buildTopScorerHiggsfieldPrompt,
};
