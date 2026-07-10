async function transcribeAudio(audioBuffer) {
  const huggingFaceService = require('../huggingFaceService');
  return huggingFaceService.transcribeAudio(audioBuffer);
}

async function synthesizeSpeech(text) {
  const huggingFaceService = require('../huggingFaceService');
  return huggingFaceService.synthesizeSpeech(text);
}

module.exports = { transcribeAudio, synthesizeSpeech };
