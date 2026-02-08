/**
 * Instagram Profile Extractor → NotebookLM
 * Popup Script - Interface do usuário
 */

// ============================================================================
// DOM Elements
// ============================================================================
const elements = {
  // Status
  statusBar: document.getElementById('status-bar'),
  statusIcon: document.getElementById('status-icon'),
  statusText: document.getElementById('status-text'),
  
  // Sections
  notInstagram: document.getElementById('not-instagram'),
  profileDetected: document.getElementById('profile-detected'),
  configSection: document.getElementById('config-section'),
  actionSection: document.getElementById('action-section'),
  progressSection: document.getElementById('progress-section'),
  resultSection: document.getElementById('result-section'),
  errorSection: document.getElementById('error-section'),
  
  // Profile
  profileAvatar: document.getElementById('profile-avatar'),
  profileName: document.getElementById('profile-name'),
  profileUsername: document.getElementById('profile-username'),
  profileStats: document.getElementById('profile-stats'),
  
  // Config
  maxPosts: document.getElementById('max-posts'),
  chkOCR: document.getElementById('chk-ocr'),
  chkChrono: document.getElementById('chk-chrono'),
  formatSelect: document.getElementById('format-select'),
  
  // Buttons
  btnExtract: document.getElementById('btn-extract'),
  btnStop: document.getElementById('btn-stop'),
  btnRetry: document.getElementById('btn-retry'),
  btnOpenNotebookLM: document.getElementById('btn-open-notebooklm'),
  btnNewExtraction: document.getElementById('btn-new-extraction'),
  
  // Progress
  progressStage: document.getElementById('progress-stage'),
  progressCount: document.getElementById('progress-count'),
  progressBar: document.getElementById('progress-bar'),
  progressMessage: document.getElementById('progress-message'),
  
  // Steps
  stepProfile: document.getElementById('step-profile'),
  stepPosts: document.getElementById('step-posts'),
  stepDocument: document.getElementById('step-document'),
  stepDone: document.getElementById('step-done'),
  
  // Result
  resultSummary: document.getElementById('result-summary'),
  
  // Error
  errorMessage: document.getElementById('error-message'),
};

// ============================================================================
// STATE
// ============================================================================
let currentTab = null;
let currentUsername = null;
let pollingInterval = null;

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
  await initialize();
  setupEventListeners();
  loadSavedConfig();
  startStatePolling();
});

async function initialize() {
  try {
    // Obter tab ativa
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTab = tab;

    if (!tab?.url?.includes('instagram.com')) {
      showNotInstagram();
      return;
    }

    // Verificar se é página de perfil
    try {
      const response = await chrome.tabs.sendMessage(tab.id, { action: 'CHECK_PAGE' });
      
      if (response?.isProfile) {
        currentUsername = response.username;
        await showProfileDetected(response.username);
      } else {
        showNotInstagram();
      }
    } catch (e) {
      // Content script pode não estar carregado
      console.log('Content script não respondeu, injetando...');
      
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['src/content.js'],
        });
        
        // Tentar novamente
        await new Promise(r => setTimeout(r, 500));
        const response = await chrome.tabs.sendMessage(tab.id, { action: 'CHECK_PAGE' });
        
        if (response?.isProfile) {
          currentUsername = response.username;
          await showProfileDetected(response.username);
        } else {
          showNotInstagram();
        }
      } catch (injectError) {
        console.error('Falha ao injetar content script:', injectError);
        showNotInstagram();
      }
    }

    // Verificar se há extração em andamento
    try {
      const bgState = await chrome.runtime.sendMessage({ action: 'GET_STATE' });
      if (bgState?.state?.running) {
        updateUIFromState(bgState.state);
      }
    } catch (e) {}

  } catch (error) {
    console.error('Erro na inicialização:', error);
    showNotInstagram();
  }
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

function setupEventListeners() {
  // Botão Extrair
  elements.btnExtract.addEventListener('click', startExtraction);
  
  // Botão Parar
  elements.btnStop.addEventListener('click', stopExtraction);
  
  // Botão Retry
  elements.btnRetry.addEventListener('click', () => {
    hideSection('error');
    showSection('config');
    showSection('action');
  });
  
  // Botão NotebookLM
  elements.btnOpenNotebookLM.addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://notebooklm.google.com/' });
  });
  
  // Botão Nova Extração
  elements.btnNewExtraction.addEventListener('click', () => {
    hideSection('result');
    showSection('config');
    showSection('action');
    elements.btnExtract.classList.remove('hidden');
    elements.btnStop.classList.add('hidden');
    setStatus('idle', '⏸️', 'Pronto para nova extração');
  });

  // Salvar config automaticamente
  elements.maxPosts.addEventListener('change', saveConfig);
  elements.chkOCR.addEventListener('change', saveConfig);
  elements.chkChrono.addEventListener('change', saveConfig);
  elements.formatSelect.addEventListener('change', saveConfig);
}

// ============================================================================
// EXTRACTION FLOW
// ============================================================================

async function startExtraction() {
  if (!currentUsername) {
    setStatus('error', '❌', 'Nenhum perfil detectado');
    return;
  }

  const config = {
    username: currentUsername,
    maxPosts: parseInt(elements.maxPosts.value) || 0,
    includeOCR: elements.chkOCR.checked,
    downloadImages: elements.chkOCR.checked,
    chronologicalOrder: elements.chkChrono.checked,
    format: elements.formatSelect.value,
  };

  // Atualizar UI
  elements.btnExtract.classList.add('hidden');
  elements.btnStop.classList.remove('hidden');
  hideSection('config');
  hideSection('result');
  hideSection('error');
  showSection('progress');
  setStatus('running', '🔄', 'Extração em andamento...');
  resetPipelineSteps();

  try {
    const result = await chrome.runtime.sendMessage({
      action: 'START_EXTRACTION',
      config: config,
    });

    if (result?.error) {
      showError(result.error);
    } else if (result?.success) {
      showResult(result);
    }
  } catch (error) {
    showError(error.message);
  }
}

async function stopExtraction() {
  try {
    await chrome.runtime.sendMessage({ action: 'STOP_EXTRACTION' });
    setStatus('idle', '⏹️', 'Extração interrompida');
    elements.btnExtract.classList.remove('hidden');
    elements.btnStop.classList.add('hidden');
    hideSection('progress');
    showSection('config');
    showSection('action');
  } catch (e) {
    console.error('Erro ao parar:', e);
  }
}

// ============================================================================
// STATE POLLING
// ============================================================================

function startStatePolling() {
  pollingInterval = setInterval(async () => {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'GET_STATE' });
      if (response?.state) {
        updateUIFromState(response.state);
      }
    } catch (e) {
      // Background pode estar dormindo
    }
  }, 500);
}

// Listen for state updates from background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'STATE_UPDATE') {
    updateUIFromState(message.state);
  }
  return false;
});

function updateUIFromState(state) {
  if (!state) return;

  // Atualizar barra de status
  if (state.running) {
    setStatus('running', '🔄', state.progress?.message || 'Processando...');
    showSection('progress');
    hideSection('config');
    elements.btnExtract.classList.add('hidden');
    elements.btnStop.classList.remove('hidden');
  }

  // Atualizar progresso
  if (state.progress) {
    const { current, total, message } = state.progress;
    elements.progressMessage.textContent = message || '';
    
    if (total && total !== '∞' && total > 0) {
      const percent = Math.min(100, (current / total) * 100);
      elements.progressBar.style.width = `${percent}%`;
      elements.progressCount.textContent = `${current}/${total}`;
    } else if (current > 0) {
      elements.progressBar.style.width = '50%';
      elements.progressCount.textContent = `${current}`;
    }
  }

  // Atualizar etapa do pipeline
  updatePipelineStep(state.stage);

  // Atualizar stage label
  const stageLabels = {
    profile: 'Extraindo perfil...',
    posts: 'Extraindo posts...',
    images: 'Baixando imagens...',
    ocr: 'Processando OCR...',
    document: 'Gerando documento...',
    done: 'Concluído!',
    error: 'Erro na extração',
  };
  elements.progressStage.textContent = stageLabels[state.stage] || state.stage;

  // Perfil detectado
  if (state.profileData && !currentUsername) {
    currentUsername = state.profileData.username;
    updateProfileCard(state.profileData);
  }

  // Concluído
  if (state.stage === 'done') {
    showResult({
      postsCount: state.postsCount,
      profileData: state.profileData,
    });
    setStatus('success', '✅', state.progress?.message || 'Extração concluída!');
    elements.btnExtract.classList.remove('hidden');
    elements.btnStop.classList.add('hidden');
  }

  // Erro
  if (state.stage === 'error' && state.error) {
    showError(state.error);
  }
}

// ============================================================================
// UI HELPERS
// ============================================================================

function setStatus(type, icon, text) {
  elements.statusBar.className = `status-bar status-${type}`;
  elements.statusIcon.textContent = icon;
  elements.statusText.textContent = text;
}

function showSection(id) {
  const map = {
    'not-instagram': elements.notInstagram,
    'profile': elements.profileDetected,
    'config': elements.configSection,
    'action': elements.actionSection,
    'progress': elements.progressSection,
    'result': elements.resultSection,
    'error': elements.errorSection,
  };
  const el = map[id];
  if (el) el.classList.remove('hidden');
}

function hideSection(id) {
  const map = {
    'not-instagram': elements.notInstagram,
    'profile': elements.profileDetected,
    'config': elements.configSection,
    'action': elements.actionSection,
    'progress': elements.progressSection,
    'result': elements.resultSection,
    'error': elements.errorSection,
  };
  const el = map[id];
  if (el) el.classList.add('hidden');
}

function showNotInstagram() {
  showSection('not-instagram');
  hideSection('profile');
  hideSection('config');
  hideSection('action');
  setStatus('idle', '⏸️', 'Navegue até um perfil do Instagram');
}

async function showProfileDetected(username) {
  hideSection('not-instagram');
  showSection('profile');
  showSection('config');
  showSection('action');

  elements.profileUsername.textContent = `@${username}`;
  elements.profileName.textContent = username;
  setStatus('idle', '✅', `Perfil @${username} detectado`);

  // Tentar obter mais dados do perfil
  try {
    if (currentTab?.id) {
      const result = await chrome.tabs.sendMessage(currentTab.id, {
        action: 'EXTRACT_PROFILE',
        username: username,
      });

      if (result?.profile) {
        updateProfileCard(result.profile);
      }
    }
  } catch (e) {
    console.log('Não foi possível obter dados do perfil:', e.message);
  }
}

function updateProfileCard(profile) {
  elements.profileName.textContent = profile.full_name || profile.username;
  elements.profileUsername.textContent = `@${profile.username}`;
  
  const posts = formatNumber(profile.total_posts);
  const followers = formatNumber(profile.followers);
  elements.profileStats.innerHTML = `
    <span>📷 ${posts} posts</span>
    <span>👥 ${followers} seguidores</span>
  `;

  if (profile.profile_pic_url) {
    elements.profileAvatar.innerHTML = `<img src="${profile.profile_pic_url}" alt="Avatar">`;
  }
}

function showResult(result) {
  hideSection('progress');
  hideSection('error');
  showSection('result');

  const profile = result.profileData || {};
  const username = profile.username || currentUsername || '?';
  const ext = elements.formatSelect.value === 'markdown' ? 'md' : 'txt';

  elements.resultSummary.innerHTML = `
    <div>📊 <strong>${result.postsCount || 0}</strong> posts extraídos de @${username}</div>
    <div>📄 Arquivo: <strong>${username}_notebooklm.${ext}</strong></div>
    <div>💾 JSON: <strong>${username}_full.json</strong></div>
    <div style="margin-top: 8px; color: var(--text-muted); font-size: 11px;">
      Os arquivos foram baixados automaticamente para sua pasta de Downloads.
      Faça upload do arquivo .${ext} no Google NotebookLM para análise com IA.
    </div>
  `;

  elements.btnExtract.classList.remove('hidden');
  elements.btnStop.classList.add('hidden');
}

function showError(message) {
  hideSection('progress');
  showSection('error');
  elements.errorMessage.textContent = message;
  setStatus('error', '❌', 'Erro na extração');
  elements.btnExtract.classList.remove('hidden');
  elements.btnStop.classList.add('hidden');
}

function resetPipelineSteps() {
  ['step-profile', 'step-posts', 'step-document', 'step-done'].forEach(id => {
    const el = document.getElementById(id);
    el.classList.remove('active', 'completed');
  });
}

function updatePipelineStep(currentStage) {
  const stages = ['profile', 'posts', 'images', 'ocr', 'document', 'done'];
  const stageIndex = stages.indexOf(currentStage);
  
  const stepMap = {
    'profile': 'step-profile',
    'posts': 'step-posts',
    'images': 'step-posts',  // Images is part of posts step
    'ocr': 'step-posts',     // OCR is part of posts step  
    'document': 'step-document',
    'done': 'step-done',
  };

  // Reset all
  ['step-profile', 'step-posts', 'step-document', 'step-done'].forEach(id => {
    document.getElementById(id).classList.remove('active', 'completed');
  });

  // Mark completed and active
  const orderedSteps = ['step-profile', 'step-posts', 'step-document', 'step-done'];
  const currentStepId = stepMap[currentStage];
  const currentStepIndex = orderedSteps.indexOf(currentStepId);

  orderedSteps.forEach((id, index) => {
    const el = document.getElementById(id);
    if (index < currentStepIndex) {
      el.classList.add('completed');
    } else if (index === currentStepIndex) {
      if (currentStage === 'done') {
        el.classList.add('completed');
      } else {
        el.classList.add('active');
      }
    }
  });
}

// ============================================================================
// CONFIG PERSISTENCE
// ============================================================================

function saveConfig() {
  const config = {
    maxPosts: parseInt(elements.maxPosts.value) || 0,
    includeOCR: elements.chkOCR.checked,
    chronologicalOrder: elements.chkChrono.checked,
    format: elements.formatSelect.value,
  };
  chrome.storage.local.set({ extractorConfig: config });
}

function loadSavedConfig() {
  chrome.storage.local.get('extractorConfig', (data) => {
    if (data?.extractorConfig) {
      const config = data.extractorConfig;
      elements.maxPosts.value = config.maxPosts || 0;
      elements.chkOCR.checked = config.includeOCR || false;
      elements.chkChrono.checked = config.chronologicalOrder !== false;
      elements.formatSelect.value = config.format || 'markdown';
    }
  });
}

// ============================================================================
// UTILITIES
// ============================================================================

function formatNumber(num) {
  if (typeof num !== 'number' || isNaN(num)) return '0';
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toLocaleString('pt-BR');
}

// Cleanup on close
window.addEventListener('unload', () => {
  if (pollingInterval) clearInterval(pollingInterval);
});
