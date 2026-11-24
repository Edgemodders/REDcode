// @edgemodders/lipsync-core: the game's lip sync read through REDbridge, a head to play it on, and lip sync made
// from when each letter of a line is spoken. For REDcode's Lip Sync tab and its MCP server; pure Node, no VS Code.
// The research is REDcode's docs/research/lipsync.md, the design docs/design/lipsync.md.

export {
  callOf, lineOfClip, lineOfVoice, lipsyncCacheDir, lipsyncCharacter, lipsyncCharacters, lipsyncClip, lipsyncLines, lipsyncOfClip, lipsyncOfSet, lipsyncOfVoice, lipsyncSetLanguage, sampleTrack, setLipsyncCacheDir, trackGroups, voiceTags, DefaultLanguage, LipsyncError,
  type BridgeCall, type LipsyncCharacter, type LipsyncClip, type LipsyncLine, type LipsyncLines, type LipsyncPlace, type LipsyncScene, type LipsyncTrack, type TrackGroup,
} from "./lines";
export { mouthFeatureFields, MouthFeature, MouthShapes, type MouthShape } from "./shapes";
export { arkitClip, ArkitToPose, type ArkitOptions, type ShapeFrame } from "./arkit";
export { mouthEvents, shapeWeights, speechClip, DefaultSpeechTiming, type LineTimings, type MouthEvent, type SpeechTiming } from "./speech";
export { faceSetupCached, headModel, headOfRig, headParts, readFaceSetup, rigGender, DefaultHeads, type HeadModel, type HeadParts } from "./face";
export { boneToGltf, clipValues, faceSolver, type ClipTracks, type FaceChanges, type FacePart, type FaceSetup } from "./faceSolve";
