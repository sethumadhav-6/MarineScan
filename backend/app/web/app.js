const form = document.querySelector('#session-form');
const captureCard = document.querySelector('#capture-card');
const photoInput = document.querySelector('#photo-input');
const preview = document.querySelector('#preview');
const uploadButton = document.querySelector('#upload-button');
const exportButton = document.querySelector('#export-button');
const result = document.querySelector('#result');
let session = null;

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const ids = document.querySelector('#marker-ids').value.split(',').map((id) => Number(id.trim()));
  if (ids.some((id) => !Number.isInteger(id) || id < 0)) {
    showResult('Enter one or more non-negative integer marker IDs.', false);
    return;
  }
  const payload = {
    specimen_label: document.querySelector('#specimen-label').value.trim(),
    marker_length_mm: Number(document.querySelector('#marker-length').value),
    expected_marker_ids: ids,
  };
  try {
    const response = await fetch('/sessions', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)});
    if (!response.ok) throw new Error(await response.text());
    session = await response.json();
    document.querySelector('#session-label').textContent = session.specimen_label;
    captureCard.classList.remove('hidden');
    document.querySelector('#setup-card').classList.add('hidden');
  } catch (error) {
    showResult(`Could not create session: ${error.message}`, false);
  }
});

photoInput.addEventListener('change', () => {
  const [file] = photoInput.files;
  if (!file) return;
  preview.src = URL.createObjectURL(file);
  preview.classList.remove('hidden');
  uploadButton.disabled = false;
  result.classList.add('hidden');
});

uploadButton.addEventListener('click', async () => {
  const [file] = photoInput.files;
  if (!session || !file) return;
  uploadButton.disabled = true;
  uploadButton.textContent = 'Checking image…';
  const data = new FormData();
  data.append('image', file, file.name);
  try {
    const response = await fetch(`/sessions/${session.id}/images`, {method: 'POST', body: data});
    const quality = await response.json();
    if (!response.ok) throw new Error(quality.detail || JSON.stringify(quality));
    const accepted = quality.accepted;
    const reasons = accepted ? 'Image saved.' : quality.reasons.join(' ');
    showResult(`${accepted ? 'Accepted' : 'Rejected'} — markers: ${quality.marker_ids.join(', ') || 'none'}; blur score: ${quality.blur_variance}; brightness: ${quality.mean_brightness}. ${reasons}`, accepted);
    if (accepted) {
      document.querySelector('#image-count').textContent = `${++session.image_count} accepted`;
      exportButton.disabled = false;
      photoInput.value = '';
      preview.classList.add('hidden');
    }
  } catch (error) {
    showResult(`Upload failed: ${error.message}`, false);
  } finally {
    uploadButton.disabled = false;
    uploadButton.textContent = 'Check and save image';
  }
});

exportButton.addEventListener('click', () => {
  if (!session || session.image_count < 1) return;
  window.location.assign(`/sessions/${session.id}/export.zip`);
});

function showResult(message, accepted) {
  result.textContent = message;
  result.className = `result ${accepted ? 'accepted' : 'rejected'}`;
}
