const form = document.querySelector('#session-form');
const captureCard = document.querySelector('#capture-card');
const photoInput = document.querySelector('#photo-input');
const preview = document.querySelector('#preview');
const uploadButton = document.querySelector('#upload-button');
const exportButton = document.querySelector('#export-button');
const startCameraButton = document.querySelector('#start-camera');
const captureFrameButton = document.querySelector('#capture-frame');
const liveCamera = document.querySelector('#live-camera');
const video = document.querySelector('#camera-preview');
const overlapValue = document.querySelector('#overlap-value');
const overlapNote = document.querySelector('#overlap-note');
const result = document.querySelector('#result');
let session = null, pendingFiles = [], stream = null, previousAcceptedThumbnail = null, overlapAnimation = null;

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const ids = document.querySelector('#marker-ids').value.split(',').map((id) => Number(id.trim()));
  if (ids.some((id) => !Number.isInteger(id) || id < 0)) return showResult('Enter one or more non-negative integer marker IDs.', false);
  const payload = {specimen_label: document.querySelector('#specimen-label').value.trim(), marker_length_mm: Number(document.querySelector('#marker-length').value), expected_marker_ids: ids, aruco_dictionary: document.querySelector('#aruco-dictionary').value};
  try {
    const response = await fetch('/sessions', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)});
    const data = await responseData(response); if (!response.ok) throw new Error(serverMessage(response, data));
    session = data; document.querySelector('#session-label').textContent = session.specimen_label;
    captureCard.classList.remove('hidden'); document.querySelector('#setup-card').classList.add('hidden');
  } catch (error) { showResult(`Could not create session: ${error.message}`, false); }
});

photoInput.addEventListener('change', () => { pendingFiles = [...photoInput.files]; if (pendingFiles.length) showPending(`Ready to check ${pendingFiles.length} selected image(s).`); });

startCameraButton.addEventListener('click', async () => {
  if (!navigator.mediaDevices?.getUserMedia) return showResult('Live camera is unavailable in this browser. Use “Take / add photo files” instead.', false);
  try {
    stream?.getTracks().forEach((track) => track.stop());
    stream = await navigator.mediaDevices.getUserMedia({video: {facingMode: {ideal: 'environment'}, width: {ideal: 1920}, height: {ideal: 1080}}, audio: false});
    video.srcObject = stream; liveCamera.classList.remove('hidden'); captureFrameButton.classList.remove('hidden'); startCameraButton.textContent = 'Restart live camera'; updateOverlapGuide();
  } catch (error) { showResult(`Camera permission failed: ${error.message}. Use “Take / add photo files” instead.`, false); }
});

captureFrameButton.addEventListener('click', () => {
  if (!video.videoWidth) return showResult('Wait for the camera preview to start.', false);
  const canvas = document.createElement('canvas'); canvas.width = video.videoWidth; canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  canvas.toBlob((blob) => { if (!blob) return showResult('Could not capture the camera frame.', false); pendingFiles = [new File([blob], `capture-${Date.now()}.jpg`, {type: 'image/jpeg'})]; showPending('Frame captured. Check and save it, then capture the next frame.'); }, 'image/jpeg', .96);
});

uploadButton.addEventListener('click', async () => {
  if (!session || !pendingFiles.length) return;
  uploadButton.disabled = true; const acceptedFrames = [], messages = [];
  try {
    for (let index = 0; index < pendingFiles.length; index++) {
      const file = pendingFiles[index]; uploadButton.textContent = `Checking ${index + 1} of ${pendingFiles.length}…`;
      const formData = new FormData(); formData.append('image', file, file.name);
      const response = await fetch(`/sessions/${session.id}/images`, {method: 'POST', body: formData});
      const quality = await responseData(response); if (!response.ok) throw new Error(serverMessage(response, quality));
      messages.push(`${file.name}: ${quality.accepted ? 'accepted' : 'rejected'} (dictionary: ${quality.aruco_dictionary || 'none'}; markers: ${quality.marker_ids?.join(', ') || 'none'}; blur: ${quality.blur_variance}; brightness: ${quality.mean_brightness}). ${quality.reasons?.join(' ') || ''}`);
      if (quality.accepted) acceptedFrames.push(file);
    }
    if (acceptedFrames.length) {
      session.image_count += acceptedFrames.length; document.querySelector('#image-count').textContent = `${session.image_count} accepted`; exportButton.disabled = false;
      previousAcceptedThumbnail = await thumbnailFromFile(acceptedFrames.at(-1)); updateOverlapGuide();
    }
    showResult(messages.join('\n'), acceptedFrames.length === pendingFiles.length); pendingFiles = []; photoInput.value = ''; preview.classList.add('hidden');
  } catch (error) { showResult(`Upload failed: ${error.message}`, false); }
  finally { uploadButton.disabled = !pendingFiles.length; uploadButton.textContent = 'Check and save image(s)'; }
});

exportButton.addEventListener('click', () => { if (session?.image_count) window.location.assign(`/sessions/${session.id}/export.zip`); });
window.addEventListener('beforeunload', () => stream?.getTracks().forEach((track) => track.stop()));

function showPending(text) { preview.src = URL.createObjectURL(pendingFiles[0]); preview.classList.remove('hidden'); uploadButton.disabled = false; result.classList.add('hidden'); overlapNote.textContent = text; }
async function responseData(response) { const text = await response.text(); try { return text ? JSON.parse(text) : {}; } catch { return {raw: text.slice(0, 300)}; } }
function serverMessage(response, data) { return data.detail || data.raw || `Server returned HTTP ${response.status}. Check the Vercel Function logs.`; }
function showResult(message, accepted) { result.textContent = message; result.className = `result ${accepted ? 'accepted' : 'rejected'}`; }
async function thumbnailFromFile(file) {
  const image = await createImageBitmap(file), canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
  const context = canvas.getContext('2d', {willReadFrequently: true}); context.drawImage(image, 0, 0, 64, 64); const pixels = context.getImageData(0, 0, 64, 64).data, values = [];
  for (let i = 0; i < pixels.length; i += 4) values.push(pixels[i] * .299 + pixels[i + 1] * .587 + pixels[i + 2] * .114); image.close(); return values;
}
function updateOverlapGuide() {
  cancelAnimationFrame(overlapAnimation);
  const guide = () => {
    if (!previousAcceptedThumbnail || !video.videoWidth) overlapValue.textContent = previousAcceptedThumbnail ? 'Move slowly; target 70–80%' : 'Capture the first frame';
    else {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64; const context = canvas.getContext('2d', {willReadFrequently: true}); context.drawImage(video, 0, 0, 64, 64); const pixels = context.getImageData(0, 0, 64, 64).data; let difference = 0;
      for (let pixel = 0, index = 0; pixel < pixels.length; pixel += 4, index++) difference += Math.abs(previousAcceptedThumbnail[index] - (pixels[pixel] * .299 + pixels[pixel + 1] * .587 + pixels[pixel + 2] * .114));
      const similarity = Math.round(100 * (1 - difference / (64 * 64 * 255))); overlapValue.textContent = `Visual overlap guide: ~${similarity}%`; overlapNote.textContent = similarity < 60 ? 'Move back toward the previous view.' : similarity > 95 ? 'Move slightly around the specimen before capturing.' : 'Good visual continuity. Keep the marker visible.';
    }
    if (stream) overlapAnimation = requestAnimationFrame(guide);
  }; guide();
}
