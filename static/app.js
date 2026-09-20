const state = {
  file: null,
  selectedProfile: null,
  profiles: [],
  originalUrl: null,
  processedUrl: null,
  originalAudio: null,
  processedAudio: null,
  playingVersion: "processed",
  animationId: null,
  duration: 0,
  waveformCanvas: null,
  reverbWaveformCanvas: null,
  reverbAnimationId: null,
  reverbChoiceMade: false,
  presetSettings: null,
  presetMetadata: null,
  aiVersions: [],
  aiAudio: null,
  selectedAiVersionId: null,
  aiWaveformCanvas: null,
  aiAnimationId: null,
  aiDuration: 0,
  chatHistory: [],
  analysisOriginal: null,
  analysisProcessed: null,
  currentStep: "eq",
};

const els = {
  wizardNav: document.getElementById("wizard-nav"),
  stepEq: document.getElementById("step-eq"),
  stepEqResult: document.getElementById("step-eq-result"),
  stepReverb: document.getElementById("step-reverb"),
  stepAi: document.getElementById("step-ai"),
  dropzone: document.getElementById("dropzone"),
  fileInput: document.getElementById("file-input"),
  selectedFile: document.getElementById("selected-file"),
  profiles: document.getElementById("profiles"),
  processBtn: document.getElementById("process-btn"),
  status: document.getElementById("status"),
  analysis: document.getElementById("analysis"),
  playOriginal: document.getElementById("play-original"),
  playProcessed: document.getElementById("play-processed"),
  playPauseBtn: document.getElementById("play-pause-btn"),
  waveform: document.getElementById("waveform"),
  waveformCaption: document.getElementById("waveform-caption"),
  seekBar: document.getElementById("seek-bar"),
  currentTime: document.getElementById("current-time"),
  totalTime: document.getElementById("total-time"),
  profileApplied: document.getElementById("profile-applied"),
  continueToReverbBtn: document.getElementById("continue-to-reverb-btn"),
  backToEqBtn: document.getElementById("back-to-eq-btn"),
  reverbYesBtn: document.getElementById("reverb-yes-btn"),
  reverbNoBtn: document.getElementById("reverb-no-btn"),
  reverbStatus: document.getElementById("reverb-status"),
  reverbAnalysis: document.getElementById("reverb-analysis"),
  reverbPlayPauseBtn: document.getElementById("reverb-play-pause-btn"),
  reverbWaveform: document.getElementById("reverb-waveform"),
  reverbWaveformCaption: document.getElementById("reverb-waveform-caption"),
  reverbSeekBar: document.getElementById("reverb-seek-bar"),
  reverbCurrentTime: document.getElementById("reverb-current-time"),
  reverbTotalTime: document.getElementById("reverb-total-time"),
  reverbApplied: document.getElementById("reverb-applied"),
  continueToAiBtn: document.getElementById("continue-to-ai-btn"),
  backToEqResultBtn: document.getElementById("back-to-eq-result-btn"),
  backToReverbBtn: document.getElementById("back-to-reverb-btn"),
  chatLog: document.getElementById("chat-log"),
  chatForm: document.getElementById("chat-form"),
  chatInput: document.getElementById("chat-input"),
  chatSendBtn: document.getElementById("chat-send-btn"),
  aiVersions: document.getElementById("ai-versions"),
  aiPlayer: document.getElementById("ai-player"),
  aiAnalysis: document.getElementById("ai-analysis"),
  aiPlayPauseBtn: document.getElementById("ai-play-pause-btn"),
  aiDownloadBtn: document.getElementById("ai-download-btn"),
  aiWaveform: document.getElementById("ai-waveform"),
  aiSeekBar: document.getElementById("ai-seek-bar"),
  aiCurrentTime: document.getElementById("ai-current-time"),
  aiTotalTime: document.getElementById("ai-total-time"),
  aiVersionApplied: document.getElementById("ai-version-applied"),
  downloadProcessedBtn: document.getElementById("download-processed-btn"),
};

const WIZARD_STEPS = ["eq", "eq-result", "reverb", "ai"];

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function setStatus(message, type = "") {
  els.status.textContent = message;
  els.status.className = `status ${type}`.trim();
}

function setReverbStatus(message, type = "") {
  els.reverbStatus.textContent = message;
  els.reverbStatus.className = `reverb-status ${type}`.trim();
}

function showStep(step) {
  state.currentStep = step;
  const panels = {
    eq: els.stepEq,
    "eq-result": els.stepEqResult,
    reverb: els.stepReverb,
    ai: els.stepAi,
  };

  Object.entries(panels).forEach(([name, panel]) => {
    if (!panel) return;
    const active = name === step;
    panel.hidden = !active;
    panel.classList.toggle("active", active);
  });

  els.wizardNav.querySelectorAll(".wizard-step").forEach((item) => {
    const itemStep = item.dataset.step;
    const stepIndex = WIZARD_STEPS.indexOf(step);
    const itemIndex = itemStep === "eq" ? 0 : itemStep === "reverb" ? 2 : itemStep === "ai" ? 3 : -1;
    item.classList.toggle("active", itemStep === step || (itemStep === "eq" && step === "eq-result"));
    item.classList.toggle("complete", itemIndex >= 0 && itemIndex < stepIndex);
  });

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function updateProcessButton() {
  els.processBtn.disabled = !(state.file && state.selectedProfile);
}

function revokeUrls() {
  if (state.originalUrl) URL.revokeObjectURL(state.originalUrl);
  if (state.processedUrl) URL.revokeObjectURL(state.processedUrl);
  state.aiVersions.forEach((version) => {
    if (version.url) URL.revokeObjectURL(version.url);
  });
  state.originalUrl = null;
  state.processedUrl = null;
  state.aiVersions = [];
  state.selectedAiVersionId = null;
  state.aiWaveformCanvas = null;
  state.aiDuration = 0;
}

function base64ToBlobUrl(base64, mime = "audio/wav") {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return URL.createObjectURL(new Blob([bytes], { type: mime }));
}

async function loadProfiles() {
  const response = await fetch("/api/profiles");
  state.profiles = await response.json();
  renderProfiles();
}

function renderProfiles() {
  els.profiles.innerHTML = "";
  state.profiles.forEach((profile) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "profile-option";
    button.dataset.profile = profile.id;
    button.setAttribute("role", "radio");
    button.setAttribute("aria-checked", "false");
    button.innerHTML = `
      <span class="profile-label">${profile.label}</span>
      <span class="profile-desc">${profile.description}</span>
    `;
    button.addEventListener("click", () => selectProfile(profile.id));
    els.profiles.appendChild(button);
  });
}

function selectProfile(profileId) {
  state.selectedProfile = profileId;
  els.profiles.querySelectorAll(".profile-option").forEach((btn) => {
    const selected = btn.dataset.profile === profileId;
    btn.classList.toggle("selected", selected);
    btn.setAttribute("aria-checked", selected ? "true" : "false");
  });
  updateProcessButton();
}

function handleFile(file) {
  if (!file) return;
  state.file = file;
  els.selectedFile.hidden = false;
  els.selectedFile.textContent = `Selected: ${file.name}`;
  updateProcessButton();
  setStatus("");
}

function setupDropzone() {
  els.dropzone.addEventListener("click", () => els.fileInput.click());
  els.dropzone.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      els.fileInput.click();
    }
  });

  els.fileInput.addEventListener("change", (event) => {
    handleFile(event.target.files[0]);
  });

  ["dragenter", "dragover"].forEach((type) => {
    els.dropzone.addEventListener(type, (event) => {
      event.preventDefault();
      els.dropzone.classList.add("dragover");
    });
  });

  ["dragleave", "drop"].forEach((type) => {
    els.dropzone.addEventListener(type, (event) => {
      event.preventDefault();
      els.dropzone.classList.remove("dragover");
    });
  });

  els.dropzone.addEventListener("drop", (event) => {
    const file = event.dataTransfer.files[0];
    handleFile(file);
  });
}

function renderAnalysis(version = state.playingVersion) {
  const analysis =
    version === "processed" ? state.analysisProcessed : state.analysisOriginal;
  if (!analysis) return;

  const { band_balance: bands, dynamic_range_db: dynamicRange, duration_seconds: duration } = analysis;
  const versionLabel = version === "processed" ? "Processed" : "Original";

  els.analysis.innerHTML = `
    <div class="stat stat-wide">
      <span class="stat-label">Now showing</span>
      <span class="stat-value">${versionLabel} version</span>
    </div>
    <div class="stat">
      <span class="stat-label">Duration</span>
      <span class="stat-value">${duration}s</span>
    </div>
    <div class="stat">
      <span class="stat-label">Dynamic range</span>
      <span class="stat-value">${dynamicRange} dB</span>
    </div>
    <div class="stat">
      <span class="stat-label">Bass energy</span>
      <span class="stat-value">${bands.bass}%</span>
    </div>
    <div class="stat">
      <span class="stat-label">Midrange energy</span>
      <span class="stat-value">${bands.midrange}%</span>
    </div>
    <div class="stat">
      <span class="stat-label">High energy</span>
      <span class="stat-value">${bands.highs}%</span>
    </div>
  `;

  if (state.presetMetadata) {
    els.profileApplied.textContent = `${state.presetMetadata.profile_label} — ${state.presetMetadata.profile_description}`;
  }
}

function renderReverbAnalysis() {
  const analysis = state.analysisProcessed;
  if (!analysis) return;

  const { band_balance: bands, dynamic_range_db: dynamicRange, duration_seconds: duration } = analysis;

  els.reverbAnalysis.innerHTML = `
    <div class="stat stat-wide">
      <span class="stat-label">Current version</span>
      <span class="stat-value">${state.presetSettings?.reverb_enabled ? "With reverb" : "Frequency adjusted"}</span>
    </div>
    <div class="stat">
      <span class="stat-label">Duration</span>
      <span class="stat-value">${duration}s</span>
    </div>
    <div class="stat">
      <span class="stat-label">Dynamic range</span>
      <span class="stat-value">${dynamicRange} dB</span>
    </div>
    <div class="stat">
      <span class="stat-label">Bass energy</span>
      <span class="stat-value">${bands.bass}%</span>
    </div>
    <div class="stat">
      <span class="stat-label">Midrange energy</span>
      <span class="stat-value">${bands.midrange}%</span>
    </div>
    <div class="stat">
      <span class="stat-label">High energy</span>
      <span class="stat-value">${bands.highs}%</span>
    </div>
  `;

  if (state.presetMetadata) {
    const reverbNote = state.presetSettings?.reverb_enabled ? " · Reverb applied" : "";
    els.reverbApplied.textContent = `${state.presetMetadata.profile_label}${reverbNote}`;
  }
}

function storeAnalysisPayload(payload) {
  state.analysisOriginal = payload.analysis_original || payload.analysis;
  state.analysisProcessed = payload.analysis_processed || payload.analysis;
}

function appendChatMessage(role, content) {
  const bubble = document.createElement("div");
  bubble.className = `chat-message ${role}`;
  bubble.textContent = content;
  els.chatLog.appendChild(bubble);
  els.chatLog.scrollTop = els.chatLog.scrollHeight;
}

function resetChat() {
  state.chatHistory = [];
  stopAiPlaybackUi();
  state.aiVersions = [];
  state.selectedAiVersionId = null;
  state.aiWaveformCanvas = null;
  state.aiDuration = 0;
  els.chatLog.innerHTML = "";
  els.chatInput.value = "";
  els.aiPlayer.hidden = true;
  renderAiVersions();
}

function getLatestAiSettings() {
  if (state.aiVersions.length === 0) return state.presetSettings;
  return state.aiVersions[state.aiVersions.length - 1].settings;
}

function getSelectedAiVersion() {
  return state.aiVersions.find((item) => item.id === state.selectedAiVersionId) || null;
}

function renderAiAnalysis(version) {
  const analysis = version.analysisProcessed;
  if (!analysis) return;

  const { band_balance: bands, dynamic_range_db: dynamicRange, duration_seconds: duration } = analysis;

  els.aiAnalysis.innerHTML = `
    <div class="stat stat-wide">
      <span class="stat-label">Now showing</span>
      <span class="stat-value">AI Version ${version.id}</span>
    </div>
    <div class="stat">
      <span class="stat-label">Duration</span>
      <span class="stat-value">${duration}s</span>
    </div>
    <div class="stat">
      <span class="stat-label">Dynamic range</span>
      <span class="stat-value">${dynamicRange} dB</span>
    </div>
    <div class="stat">
      <span class="stat-label">Bass energy</span>
      <span class="stat-value">${bands.bass}%</span>
    </div>
    <div class="stat">
      <span class="stat-label">Midrange energy</span>
      <span class="stat-value">${bands.midrange}%</span>
    </div>
    <div class="stat">
      <span class="stat-label">High energy</span>
      <span class="stat-value">${bands.highs}%</span>
    </div>
  `;

  els.aiVersionApplied.textContent = version.description;
}

function stopAiPlaybackUi() {
  if (state.aiAudio) {
    state.aiAudio.pause();
    state.aiAudio = null;
  }
  if (state.aiAnimationId) {
    cancelAnimationFrame(state.aiAnimationId);
    state.aiAnimationId = null;
  }
  els.aiPlayPauseBtn.textContent = "▶ Play";
  renderAiVersions();
}

function stopAiPlayback() {
  stopAiPlaybackUi();
}

function getAiCurrentTime() {
  if (state.aiAudio && Number.isFinite(state.aiAudio.currentTime)) {
    return state.aiAudio.currentTime;
  }
  return 0;
}

function updateAiSeekUi(time) {
  const duration = state.aiDuration || state.aiAudio?.duration || 0;
  els.aiCurrentTime.textContent = formatTime(time);
  els.aiTotalTime.textContent = formatTime(duration);
  els.aiSeekBar.value = duration ? (time / duration) * 100 : 0;
  drawAiPlayhead(duration ? time / duration : 0);
}

function updateAiPlaybackUi() {
  if (!state.aiAudio) return;
  updateAiSeekUi(state.aiAudio.currentTime);
  state.aiAnimationId = requestAnimationFrame(updateAiPlaybackUi);
}

function drawAiPlayhead(ratio) {
  drawPlayheadOnCanvas(els.aiWaveform, state.aiWaveformCanvas, ratio);
}

const BAND_DEFINITIONS = [
  { label: "Low", color: "#5dd39e", filter: { type: "lowpass", freq: 250 } },
  { label: "Mid", color: "#6b9fff", filter: { type: "crossover-mid", low: 250, high: 2000 } },
  { label: "High", color: "#f0b429", filter: { type: "highpass", freq: 2000 } },
];

async function decodeAudioFromUrl(url) {
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  const audioContext = new AudioContext();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  await audioContext.close();
  return audioBuffer;
}

function connectBandFilter(offline, source, filterConfig) {
  if (filterConfig.type === "lowpass") {
    const filter = offline.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = filterConfig.freq;
    filter.Q.value = 0.707;
    source.connect(filter);
    filter.connect(offline.destination);
    return;
  }

  if (filterConfig.type === "highpass") {
    const filter = offline.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = filterConfig.freq;
    filter.Q.value = 0.707;
    source.connect(filter);
    filter.connect(offline.destination);
    return;
  }

  if (filterConfig.type === "crossover-mid") {
    const highPass = offline.createBiquadFilter();
    highPass.type = "highpass";
    highPass.frequency.value = filterConfig.low;
    highPass.Q.value = 0.707;
    const lowPass = offline.createBiquadFilter();
    lowPass.type = "lowpass";
    lowPass.frequency.value = filterConfig.high;
    lowPass.Q.value = 0.707;
    source.connect(highPass);
    highPass.connect(lowPass);
    lowPass.connect(offline.destination);
    return;
  }
}

async function splitIntoFrequencyBands(audioBuffer) {
  const bandData = [];

  for (const band of BAND_DEFINITIONS) {
    const offline = new OfflineAudioContext(
      audioBuffer.numberOfChannels,
      audioBuffer.length,
      audioBuffer.sampleRate
    );
    const source = offline.createBufferSource();
    source.buffer = audioBuffer;
    connectBandFilter(offline, source, band.filter);
    source.start(0);
    const rendered = await offline.startRendering();
    bandData.push({
      label: band.label,
      color: band.color,
      data: rendered.getChannelData(0),
    });
  }

  return bandData;
}

function peakAbs(channel) {
  let peak = 0;
  for (let i = 0; i < channel.length; i += 1) {
    peak = Math.max(peak, Math.abs(channel[i]));
  }
  return peak;
}

function updateWaveformCaption(version) {
  if (!els.waveformCaption) return;
  els.waveformCaption.textContent =
    version === "processed"
      ? "Showing: Processed — band lanes use a shared scale so removed bands appear flat"
      : "Showing: Original — full mix split into Low / Mid / High lanes";
}

function drawBandLane(ctx, channel, laneY, laneHeight, width, color, label, globalPeak) {
  ctx.fillStyle = "#9aa3b8";
  ctx.font = '600 10px "DM Sans", sans-serif';
  ctx.fillText(label, 8, laneY + 14);

  const step = Math.ceil(channel.length / width);
  const center = laneY + laneHeight / 2 + 6;
  const scale = globalPeak > 0 ? (laneHeight - 22) / 2 / globalPeak : (laneHeight - 22) / 2;
  const lanePeak = peakAbs(channel);
  const isRemoved = lanePeak < globalPeak * 0.04;

  if (isRemoved) {
    ctx.strokeStyle = "#3a4158";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, center);
    ctx.lineTo(width, center);
    ctx.stroke();
    ctx.fillStyle = "#6b738a";
    ctx.font = '500 10px "DM Sans", sans-serif';
    ctx.fillText("removed", 42, laneY + 14);
    return;
  }

  ctx.beginPath();
  for (let i = 0; i < width; i += 1) {
    let min = Infinity;
    let max = -Infinity;
    const start = i * step;
    for (let j = 0; j < step; j += 1) {
      const sample = channel[start + j] || 0;
      if (sample < min) min = sample;
      if (sample > max) max = sample;
    }
    if (!Number.isFinite(min)) {
      min = 0;
      max = 0;
    }
    if (i === 0) ctx.moveTo(i, center + min * scale);
    ctx.lineTo(i, center + min * scale);
    ctx.lineTo(i, center + max * scale);
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawPlayheadOnCanvas(canvas, offscreenCanvas, ratio) {
  if (!offscreenCanvas) return;

  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(offscreenCanvas, 0, 0, width, height);

  const x = Math.max(0, Math.min(1, ratio)) * width;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.lineTo(x, height);
  ctx.stroke();
}

async function drawMultiBandWaveform(canvas, url, playerKind) {
  const audioBuffer = await decodeAudioFromUrl(url);
  const bands = await splitIntoFrequencyBands(audioBuffer);
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.scale(dpr, dpr);

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#2a3044";
  ctx.fillRect(0, 0, width, height);

  const laneHeight = height / bands.length;
  const globalPeak = Math.max(0.001, ...bands.map((band) => peakAbs(band.data)));
  bands.forEach((band, index) => {
    const laneY = index * laneHeight;
    drawBandLane(ctx, band.data, laneY, laneHeight, width, band.color, band.label, globalPeak);
    if (index < bands.length - 1) {
      ctx.strokeStyle = "#1c2030";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, laneY + laneHeight);
      ctx.lineTo(width, laneY + laneHeight);
      ctx.stroke();
    }
  });

  const offscreen = document.createElement("canvas");
  offscreen.width = width;
  offscreen.height = height;
  offscreen
    .getContext("2d")
    .drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, width, height);

  if (playerKind === "ai") {
    state.aiWaveformCanvas = offscreen;
    const duration = state.aiDuration || audioBuffer.duration || 1;
    drawAiPlayhead(getAiCurrentTime() / duration);
  } else if (playerKind === "reverb") {
    state.reverbWaveformCanvas = offscreen;
    const duration = state.duration || audioBuffer.duration || 1;
    drawReverbPlayhead(getReverbCurrentTime() / duration);
  } else {
    state.waveformCanvas = offscreen;
    const duration = state.duration || audioBuffer.duration || 1;
    drawPlayhead(getCurrentTime() / duration);
  }
}

async function drawWaveformFromUrl(url) {
  await drawMultiBandWaveform(els.waveform, url, "preset");
}

async function drawReverbWaveformFromUrl(url) {
  await drawMultiBandWaveform(els.reverbWaveform, url, "reverb");
}

async function drawAiWaveformFromUrl(url) {
  await drawMultiBandWaveform(els.aiWaveform, url, "ai");
}

function seekAiTo(ratio, { keepPlaying = null } = {}) {
  const duration = state.aiDuration || state.aiAudio?.duration || 0;
  if (!duration || !state.aiAudio) return;

  const clampedRatio = Math.max(0, Math.min(1, ratio));
  const time = clampedRatio * duration;
  const wasPlaying = keepPlaying ?? (state.aiAudio.paused === false);

  state.aiAudio.currentTime = time;
  updateAiSeekUi(time);

  if (wasPlaying) {
    state.aiAudio.play().catch(() => {});
    els.aiPlayPauseBtn.textContent = "⏸ Pause";
    if (!state.aiAnimationId) updateAiPlaybackUi();
  }
}

async function selectAiVersion(versionId, { autoplay = false } = {}) {
  const version = state.aiVersions.find((item) => item.id === versionId);
  if (!version) return;

  const currentTime = getAiCurrentTime();
  const wasPlaying = state.aiAudio && !state.aiAudio.paused;
  stopAiPlaybackUi();
  stopPlaybackUi();

  state.selectedAiVersionId = versionId;
  els.aiPlayer.hidden = false;
  renderAiVersions();
  renderAiAnalysis(version);

  state.aiAudio = createAudioElement(version.url);
  state.aiAudio.addEventListener("ended", () => {
    stopAiPlaybackUi();
    seekAiTo(0, { keepPlaying: false });
  });
  state.aiAudio.addEventListener("loadedmetadata", () => {
    if (Number.isFinite(state.aiAudio.duration) && state.aiAudio.duration > 0) {
      state.aiDuration = state.aiAudio.duration;
      els.aiTotalTime.textContent = formatTime(state.aiDuration);
    }
  });
  state.aiAudio.load();
  await waitForAudioReady(state.aiAudio);

  if (Number.isFinite(state.aiAudio.duration) && state.aiAudio.duration > 0) {
    state.aiDuration = state.aiAudio.duration;
  } else if (version.analysisProcessed?.duration_seconds) {
    state.aiDuration = version.analysisProcessed.duration_seconds;
  }

  await drawAiWaveformFromUrl(version.url);
  updateAiSeekUi(Math.min(currentTime, state.aiDuration || 0));
  els.aiPlayPauseBtn.textContent = "▶ Play";

  if (autoplay || wasPlaying) {
    await state.aiAudio.play();
    els.aiPlayPauseBtn.textContent = "⏸ Pause";
    if (!state.aiAnimationId) updateAiPlaybackUi();
  }
}

async function toggleAiPlayback() {
  const version = getSelectedAiVersion();
  if (!version) return;

  if (!state.aiAudio || state.selectedAiVersionId !== version.id) {
    await selectAiVersion(version.id, { autoplay: true });
    return;
  }

  if (!state.aiAudio.paused) {
    state.aiAudio.pause();
    els.aiPlayPauseBtn.textContent = "▶ Play";
    if (state.aiAnimationId) cancelAnimationFrame(state.aiAnimationId);
    state.aiAnimationId = null;
    renderAiVersions();
    return;
  }

  stopPlaybackUi();
  await waitForAudioReady(state.aiAudio);
  await state.aiAudio.play();
  els.aiPlayPauseBtn.textContent = "⏸ Pause";
  renderAiVersions();
  if (!state.aiAnimationId) updateAiPlaybackUi();
}

function downloadAiVersion() {
  const version = getSelectedAiVersion();
  if (!version) return;
  const link = document.createElement("a");
  link.href = version.url;
  link.download = `clarity-ai-version-${version.id}.wav`;
  link.click();
}

function renderAiVersions() {
  els.aiVersions.innerHTML = "";

  if (state.aiVersions.length === 0) {
    const empty = document.createElement("p");
    empty.className = "ai-versions-empty";
    empty.textContent = "No AI refinements yet. Send a message to create version 1.";
    els.aiVersions.appendChild(empty);
    els.aiPlayer.hidden = true;
    return;
  }

  const isAiPlaying = state.aiAudio && !state.aiAudio.paused;

  state.aiVersions.forEach((version) => {
    const card = document.createElement("article");
    card.className = "ai-version-card";
    if (state.selectedAiVersionId === version.id) {
      card.classList.add("selected");
    }
    if (isAiPlaying && state.selectedAiVersionId === version.id) {
      card.classList.add("playing");
    }
    card.innerHTML = `
      <span class="ai-version-label">Version ${version.id}</span>
      <span class="ai-version-request">You asked: “${version.userMessage}”</span>
      <p class="ai-version-desc">${version.assistantMessage}</p>
    `;

    card.addEventListener("click", () => {
      selectAiVersion(version.id).catch((error) => setStatus(error.message, "error"));
    });
    els.aiVersions.appendChild(card);
  });
}

function addAiVersion(userMessage, payload) {
  const version = {
    id: state.aiVersions.length + 1,
    userMessage,
    assistantMessage: payload.assistant_message,
    description: payload.metadata.profile_description,
    url: base64ToBlobUrl(payload.processed_audio),
    settings: payload.custom_settings,
    analysisProcessed: payload.analysis_processed,
  };
  state.aiVersions.push(version);
  renderAiVersions();
  selectAiVersion(version.id, { autoplay: false }).catch((error) => setStatus(error.message, "error"));
  return version;
}

function waitForAudioReady(audio) {
  if (audio.readyState >= 1) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const onReady = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("Processed audio failed to load"));
    };
    const cleanup = () => {
      audio.removeEventListener("loadedmetadata", onReady);
      audio.removeEventListener("error", onError);
    };
    audio.addEventListener("loadedmetadata", onReady);
    audio.addEventListener("error", onError);
  });
}

async function sendChatMessage(event) {
  event.preventDefault();
  const message = els.chatInput.value.trim();
  if (!message || !state.file || !state.selectedProfile || !state.presetSettings) return;

  appendChatMessage("user", message);
  state.chatHistory.push({ role: "user", content: message });
  els.chatInput.value = "";
  els.chatSendBtn.disabled = true;
  appendChatMessage("assistant", "Working on your adjustment…");
  const workingBubble = els.chatLog.lastChild;

  const formData = new FormData();
  formData.append("file", state.file);
  formData.append("profile", state.selectedProfile);
  formData.append("current_settings", JSON.stringify(getLatestAiSettings()));
  formData.append("message", message);
  formData.append("chat_history", JSON.stringify(state.chatHistory.slice(0, -1)));

  try {
    const response = await fetch("/api/refine", {
      method: "POST",
      body: formData,
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.detail || "AI refinement failed");
    }

    workingBubble?.remove();
    state.chatHistory.push({ role: "assistant", content: payload.assistant_message });
    appendChatMessage("assistant", payload.assistant_message);
    addAiVersion(message, payload);
  } catch (error) {
    workingBubble?.remove();
    appendChatMessage("assistant", `Sorry, I couldn't adjust the audio: ${error.message}`);
    state.chatHistory.push({
      role: "assistant",
      content: `Sorry, I couldn't adjust the audio: ${error.message}`,
    });
  } finally {
    els.chatSendBtn.disabled = false;
  }
}

function getActiveAudio() {
  return state.playingVersion === "processed" ? state.processedAudio : state.originalAudio;
}

function createAudioElement(url) {
  const audio = new Audio(url);
  audio.preload = "auto";
  return audio;
}

function teardownAudioElements() {
  [state.originalAudio, state.processedAudio].forEach((audio) => {
    if (!audio) return;
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
  });
  state.originalAudio = null;
  state.processedAudio = null;
}

function onAudioEnded() {
  stopPlaybackUi();
  seekTo(0, { keepPlaying: false });
}

function setupAudioElement(audio) {
  audio.addEventListener("ended", onAudioEnded);
  audio.addEventListener("loadedmetadata", () => {
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      state.duration = Math.max(state.duration, audio.duration);
      els.totalTime.textContent = formatTime(state.duration);
    }
  });
}

function prepareAudioPlayers() {
  teardownAudioElements();
  state.originalAudio = createAudioElement(state.originalUrl);
  state.processedAudio = createAudioElement(state.processedUrl);
  setupAudioElement(state.originalAudio);
  setupAudioElement(state.processedAudio);
  state.originalAudio.load();
  state.processedAudio.load();
  return Promise.all([
    waitForAudioReady(state.originalAudio),
    waitForAudioReady(state.processedAudio),
  ]);
}

function getCurrentTime() {
  const active = getActiveAudio();
  if (active && Number.isFinite(active.currentTime)) {
    return active.currentTime;
  }
  return 0;
}

function syncBothPlayersToTime(time) {
  [state.originalAudio, state.processedAudio].forEach((audio) => {
    if (audio && Number.isFinite(audio.duration)) {
      audio.currentTime = Math.min(time, audio.duration);
    } else if (audio) {
      audio.currentTime = time;
    }
  });
}

function updateSeekUi(time) {
  const duration = state.duration || getActiveAudio()?.duration || 0;
  els.currentTime.textContent = formatTime(time);
  els.totalTime.textContent = formatTime(duration);
  els.seekBar.value = duration ? (time / duration) * 100 : 0;
  drawPlayhead(duration ? time / duration : 0);
}

function seekTo(ratio, { keepPlaying = null } = {}) {
  const duration = state.duration || getActiveAudio()?.duration || 0;
  if (!duration) return;

  const clampedRatio = Math.max(0, Math.min(1, ratio));
  const time = clampedRatio * duration;
  const wasPlaying = keepPlaying ?? (getActiveAudio()?.paused === false);

  syncBothPlayersToTime(time);
  updateSeekUi(time);

  if (wasPlaying && getActiveAudio()) {
    getActiveAudio().play().catch(() => {});
    els.playPauseBtn.textContent = "⏸ Pause";
    if (!state.animationId) updatePlaybackUi();
  }
}

function drawPlayhead(ratio) {
  drawPlayheadOnCanvas(els.waveform, state.waveformCanvas, ratio);
}

function drawReverbPlayhead(ratio) {
  drawPlayheadOnCanvas(els.reverbWaveform, state.reverbWaveformCanvas, ratio);
}

function getReverbCurrentTime() {
  if (state.processedAudio && Number.isFinite(state.processedAudio.currentTime)) {
    return state.processedAudio.currentTime;
  }
  return 0;
}

function updateReverbSeekUi(time) {
  const duration = state.duration || state.processedAudio?.duration || 0;
  els.reverbCurrentTime.textContent = formatTime(time);
  els.reverbTotalTime.textContent = formatTime(duration);
  els.reverbSeekBar.value = duration ? (time / duration) * 100 : 0;
  drawReverbPlayhead(duration ? time / duration : 0);
}

function seekReverbTo(ratio, { keepPlaying = null } = {}) {
  const duration = state.duration || state.processedAudio?.duration || 0;
  if (!duration || !state.processedAudio) return;

  const clampedRatio = Math.max(0, Math.min(1, ratio));
  const time = clampedRatio * duration;
  const wasPlaying = keepPlaying ?? (state.processedAudio.paused === false);

  state.processedAudio.currentTime = time;
  updateReverbSeekUi(time);

  if (wasPlaying) {
    state.processedAudio.play().catch(() => {});
    els.reverbPlayPauseBtn.textContent = "⏸ Pause";
    if (!state.reverbAnimationId) updateReverbPlaybackUi();
  }
}

function stopReverbPlaybackUi() {
  if (state.processedAudio) state.processedAudio.pause();
  if (state.reverbAnimationId) {
    cancelAnimationFrame(state.reverbAnimationId);
    state.reverbAnimationId = null;
  }
  els.reverbPlayPauseBtn.textContent = "▶ Play";
}

function updateReverbPlaybackUi() {
  if (!state.processedAudio) return;
  updateReverbSeekUi(state.processedAudio.currentTime);
  state.reverbAnimationId = requestAnimationFrame(updateReverbPlaybackUi);
}

async function toggleReverbPlayback() {
  if (!state.processedAudio) return;
  stopPlaybackUi();
  stopAiPlayback();
  if (!state.processedAudio.paused) {
    state.processedAudio.pause();
    els.reverbPlayPauseBtn.textContent = "▶ Play";
    if (state.reverbAnimationId) cancelAnimationFrame(state.reverbAnimationId);
    state.reverbAnimationId = null;
    return;
  }
  await waitForAudioReady(state.processedAudio);
  await state.processedAudio.play();
  els.reverbPlayPauseBtn.textContent = "⏸ Pause";
  if (!state.reverbAnimationId) updateReverbPlaybackUi();
}

function stopPlaybackUi() {
  [state.originalAudio, state.processedAudio].forEach((audio) => {
    if (audio) audio.pause();
  });
  if (state.animationId) {
    cancelAnimationFrame(state.animationId);
    state.animationId = null;
  }
  els.playPauseBtn.textContent = "▶ Play";
}

function updatePlaybackUi() {
  const audio = getActiveAudio();
  if (!audio) return;
  updateSeekUi(audio.currentTime);
  state.animationId = requestAnimationFrame(updatePlaybackUi);
}

async function startPlayback() {
  stopAiPlayback();
  const audio = getActiveAudio();
  if (!audio) return;

  await waitForAudioReady(audio);
  await audio.play();
  els.playPauseBtn.textContent = "⏸ Pause";
  if (!state.animationId) updatePlaybackUi();
}

async function switchVersion(version) {
  stopAiPlayback();
  const currentTime = getCurrentTime();
  const wasPlaying = getActiveAudio()?.paused === false;

  if (wasPlaying) {
    getActiveAudio()?.pause();
  }

  state.playingVersion = version;
  els.playOriginal.classList.toggle("active", version === "original");
  els.playProcessed.classList.toggle("active", version === "processed");
  els.playOriginal.setAttribute("aria-pressed", version === "original" ? "true" : "false");
  els.playProcessed.setAttribute("aria-pressed", version === "processed" ? "true" : "false");

  syncBothPlayersToTime(currentTime);
  renderAnalysis(version);
  updateWaveformCaption(version);
  await drawWaveformFromUrl(version === "processed" ? state.processedUrl : state.originalUrl);
  updateSeekUi(currentTime);

  if (wasPlaying) {
    const audio = getActiveAudio();
    await waitForAudioReady(audio);
    await audio.play();
    els.playPauseBtn.textContent = "⏸ Pause";
    if (!state.animationId) updatePlaybackUi();
  }
}

async function applySettingsToFile(settings) {
  const formData = new FormData();
  formData.append("file", state.file);
  formData.append("settings", JSON.stringify(settings));

  const response = await fetch("/api/apply-settings", {
    method: "POST",
    body: formData,
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.detail || "Processing failed");
  }
  return payload;
}

async function updateProcessedFromPayload(payload) {
  if (state.processedUrl) URL.revokeObjectURL(state.processedUrl);
  state.processedUrl = base64ToBlobUrl(payload.processed_audio);
  state.presetSettings = payload.custom_settings;
  state.presetMetadata = payload.metadata;
  storeAnalysisPayload(payload);
  state.duration = (payload.analysis_processed || payload.analysis).duration_seconds;

  if (state.processedAudio) {
    state.processedAudio.pause();
    state.processedAudio.src = state.processedUrl;
    state.processedAudio.load();
    await waitForAudioReady(state.processedAudio);
  }
}

async function processFile() {
  if (!state.file || !state.selectedProfile) return;

  stopPlaybackUi();
  stopReverbPlaybackUi();
  stopAiPlayback();
  teardownAudioElements();
  revokeUrls();
  resetChat();
  state.reverbChoiceMade = false;
  els.processBtn.disabled = true;
  setStatus("Analyzing and processing your music…");

  const formData = new FormData();
  formData.append("file", state.file);
  formData.append("profile", state.selectedProfile);

  try {
    const response = await fetch("/api/process", {
      method: "POST",
      body: formData,
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.detail || "Processing failed");
    }

    state.originalUrl = base64ToBlobUrl(payload.original_audio);
    state.processedUrl = base64ToBlobUrl(payload.processed_audio);
    state.playingVersion = "processed";
    state.duration = (payload.analysis_processed || payload.analysis).duration_seconds;

    state.presetSettings = payload.custom_settings;
    state.presetMetadata = payload.metadata;
    storeAnalysisPayload(payload);

    await prepareAudioPlayers();
    renderAnalysis("processed");
    els.downloadProcessedBtn.disabled = false;
    els.playOriginal.classList.remove("active");
    els.playProcessed.classList.add("active");
    els.playOriginal.setAttribute("aria-pressed", "false");
    els.playProcessed.setAttribute("aria-pressed", "true");
    els.profileApplied.textContent = `${payload.metadata.profile_label} — ${payload.metadata.profile_description}`;

    els.totalTime.textContent = formatTime(state.duration);
    els.currentTime.textContent = "0:00";
    els.seekBar.value = 0;

    updateWaveformCaption("processed");
    await drawWaveformFromUrl(state.processedUrl);
    showStep("eq-result");
    setStatus("");
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    els.processBtn.disabled = !(state.file && state.selectedProfile);
  }
}

async function enterReverbStep() {
  stopPlaybackUi();
  showStep("reverb");
  els.continueToAiBtn.disabled = !state.reverbChoiceMade;
  setReverbStatus(
    state.reverbChoiceMade
      ? "You can preview your choice below or continue to AI refine."
      : "Choose whether to add reverb to your processed track."
  );
  renderReverbAnalysis();
  els.reverbTotalTime.textContent = formatTime(state.duration);
  els.reverbCurrentTime.textContent = "0:00";
  els.reverbSeekBar.value = 0;
  els.reverbWaveformCaption.textContent = state.presetSettings?.reverb_enabled
    ? "Showing: With reverb"
    : "Showing: Frequency adjusted";
  if (state.processedUrl) {
    await drawReverbWaveformFromUrl(state.processedUrl);
  }
}

async function chooseReverb(enableReverb) {
  if (!state.file || !state.presetSettings) return;

  els.reverbYesBtn.disabled = true;
  els.reverbNoBtn.disabled = true;
  setReverbStatus(enableReverb ? "Applying reverb…" : "Keeping your current version…");

  try {
    if (enableReverb) {
      const settings = { ...state.presetSettings, reverb_enabled: true };
      const payload = await applySettingsToFile(settings);
      await updateProcessedFromPayload(payload);
      setReverbStatus("Reverb applied. Preview your track below.", "success");
      els.reverbWaveformCaption.textContent = "Showing: With reverb";
    } else {
      const settings = { ...state.presetSettings, reverb_enabled: false };
      if (state.presetSettings.reverb_enabled) {
        const payload = await applySettingsToFile(settings);
        await updateProcessedFromPayload(payload);
      }
      setReverbStatus("No reverb added. Preview your track below.", "success");
      els.reverbWaveformCaption.textContent = "Showing: Frequency adjusted";
    }

    state.reverbChoiceMade = true;
    renderReverbAnalysis();
    renderAnalysis(state.playingVersion);
    await drawReverbWaveformFromUrl(state.processedUrl);
    els.continueToAiBtn.disabled = false;
  } catch (error) {
    setReverbStatus(error.message, "error");
  } finally {
    els.reverbYesBtn.disabled = false;
    els.reverbNoBtn.disabled = false;
  }
}

function enterAiStep() {
  stopReverbPlaybackUi();
  showStep("ai");
  if (state.chatHistory.length === 0) {
    appendChatMessage(
      "assistant",
      "Tell me how you'd like to adjust your music. Each message creates a new version you can preview and download."
    );
    state.chatHistory.push({
      role: "assistant",
      content: "Tell me how you'd like to adjust your music. Each message creates a new version you can preview and download.",
    });
  }
}

function setupWizardControls() {
  els.continueToReverbBtn.addEventListener("click", () => {
    enterReverbStep().catch((error) => setReverbStatus(error.message, "error"));
  });
  els.backToEqBtn.addEventListener("click", () => {
    stopPlaybackUi();
    showStep("eq");
  });
  els.backToEqResultBtn.addEventListener("click", () => {
    stopReverbPlaybackUi();
    showStep("eq-result");
  });
  els.continueToAiBtn.addEventListener("click", enterAiStep);
  els.backToReverbBtn.addEventListener("click", () => {
    stopAiPlayback();
    enterReverbStep().catch((error) => setReverbStatus(error.message, "error"));
  });
  els.reverbYesBtn.addEventListener("click", () => {
    chooseReverb(true).catch((error) => setReverbStatus(error.message, "error"));
  });
  els.reverbNoBtn.addEventListener("click", () => {
    chooseReverb(false).catch((error) => setReverbStatus(error.message, "error"));
  });
}

function setupPlayerControls() {
  setupWizardControls();
  els.processBtn.addEventListener("click", processFile);

  els.playPauseBtn.addEventListener("click", async () => {
    if (!state.originalAudio) return;
    const audio = getActiveAudio();
    if (!audio.paused) {
      audio.pause();
      els.playPauseBtn.textContent = "▶ Play";
      if (state.animationId) cancelAnimationFrame(state.animationId);
      state.animationId = null;
      return;
    }
    await startPlayback();
  });

  els.playOriginal.addEventListener("click", () => switchVersion("original"));
  els.playProcessed.addEventListener("click", () => switchVersion("processed"));

  els.seekBar.addEventListener("input", () => {
    seekTo(Number(els.seekBar.value) / 100);
  });

  els.waveform.addEventListener("click", (event) => {
    if (!state.duration) return;
    const rect = els.waveform.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    seekTo(ratio);
  });

  els.chatForm.addEventListener("submit", sendChatMessage);

  els.aiPlayPauseBtn.addEventListener("click", () => {
    toggleAiPlayback().catch((error) => setStatus(error.message, "error"));
  });

  els.aiDownloadBtn.addEventListener("click", downloadAiVersion);

  els.aiSeekBar.addEventListener("input", () => {
    seekAiTo(Number(els.aiSeekBar.value) / 100);
  });

  els.aiWaveform.addEventListener("click", (event) => {
    if (!state.aiDuration) return;
    const rect = els.aiWaveform.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    seekAiTo(ratio);
  });

  els.downloadProcessedBtn.addEventListener("click", () => {
    if (!state.processedUrl) return;
    const link = document.createElement("a");
    link.href = state.processedUrl;
    link.download = state.presetSettings?.reverb_enabled
      ? "clarity-with-reverb.wav"
      : "clarity-processed.wav";
    link.click();
  });

  els.reverbPlayPauseBtn.addEventListener("click", () => {
    toggleReverbPlayback().catch((error) => setReverbStatus(error.message, "error"));
  });

  els.reverbSeekBar.addEventListener("input", () => {
    seekReverbTo(Number(els.reverbSeekBar.value) / 100);
  });

  els.reverbWaveform.addEventListener("click", (event) => {
    if (!state.duration) return;
    const rect = els.reverbWaveform.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    seekReverbTo(ratio);
  });
}

async function init() {
  setupDropzone();
  setupPlayerControls();
  await loadProfiles();
  if (state.profiles.length > 0) {
    selectProfile(state.profiles[0].id);
  }
  showStep("eq");
}

init();
