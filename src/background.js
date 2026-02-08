/**
 * Instagram Profile Extractor → NotebookLM
 * Background Service Worker
 * 
 * Orquestra o pipeline completo:
 * 1. Recebe comandos do popup
 * 2. Comunica com content script para extração
 * 3. Gera documento Markdown para NotebookLM
 * 4. Gerencia downloads
 */

// ============================================================================
// ESTADO GLOBAL
// ============================================================================
let extractionState = {
  running: false,
  stage: 'idle', // idle, profile, posts, images, ocr, document, done, error
  progress: { current: 0, total: 0, message: '' },
  profileData: null,
  posts: [],
  config: {
    maxPosts: 0,
    includeOCR: false,  // OCR desabilitado por padrão (pesado no browser)
    downloadImages: false,
    format: 'markdown',
    chronologicalOrder: true,
  },
  error: null,
  startTime: null,
};

// ============================================================================
// MESSAGE HANDLERS
// ============================================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleBackgroundMessage(message, sender).then(sendResponse).catch(err => {
    sendResponse({ error: err.message });
  });
  return true;
});

async function handleBackgroundMessage(message, sender) {
  switch (message.action) {

    case 'GET_STATE':
      return { state: extractionState };

    case 'START_EXTRACTION':
      return startExtraction(message.config);

    case 'STOP_EXTRACTION':
      extractionState.running = false;
      extractionState.stage = 'idle';
      return { stopped: true };

    case 'PROGRESS_UPDATE':
      // Atualizar progresso (vem do content script)
      updateProgress(message);
      return { ok: true };

    case 'GENERATE_DOCUMENT':
      return generateNotebookLMDocument(message.profileData, message.posts, message.config);

    case 'DOWNLOAD_FILE':
      return downloadFile(message.content, message.filename, message.mimeType);

    default:
      return { error: `Unknown action: ${message.action}` };
  }
}

// ============================================================================
// PIPELINE DE EXTRAÇÃO
// ============================================================================

async function startExtraction(config) {
  if (extractionState.running) {
    return { error: 'Extração já em andamento' };
  }

  // Resetar estado
  extractionState = {
    running: true,
    stage: 'profile',
    progress: { current: 0, total: 0, message: 'Iniciando extração...' },
    profileData: null,
    posts: [],
    config: { ...extractionState.config, ...config },
    error: null,
    startTime: Date.now(),
  };

  broadcastState();

  try {
    // Obter tab ativa
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('Nenhuma tab ativa encontrada');

    // ============================
    // ETAPA 1: Extrair perfil
    // ============================
    extractionState.stage = 'profile';
    extractionState.progress.message = 'Extraindo dados do perfil...';
    broadcastState();

    const profileResult = await chrome.tabs.sendMessage(tab.id, {
      action: 'EXTRACT_PROFILE',
      username: config.username,
    });

    if (profileResult.error) throw new Error(profileResult.error);
    extractionState.profileData = profileResult.profile;

    if (profileResult.profile.is_private) {
      throw new Error('Perfil é privado. Apenas perfis públicos são suportados.');
    }

    // ============================
    // ETAPA 2: Extrair posts
    // ============================
    extractionState.stage = 'posts';
    extractionState.progress = {
      current: 0,
      total: config.maxPosts || profileResult.profile.total_posts || 0,
      message: 'Extraindo posts...',
    };
    broadcastState();

    const postsResult = await chrome.tabs.sendMessage(tab.id, {
      action: 'EXTRACT_POSTS',
      userId: profileResult.profile.user_id,
      username: config.username || profileResult.profile.username,
      maxPosts: config.maxPosts || 0,
      method: profileResult.profile.user_id ? 'api' : 'dom',
    });

    if (postsResult.error) throw new Error(postsResult.error);
    extractionState.posts = postsResult.posts || [];

    if (!extractionState.running) return { stopped: true };

    // ============================
    // ETAPA 3: Download de imagens (se habilitado)
    // ============================
    if (config.downloadImages && extractionState.posts.length > 0) {
      extractionState.stage = 'images';
      broadcastState();
      await downloadPostImages(tab.id);
    }

    // ============================
    // ETAPA 4: OCR (se habilitado)
    // ============================
    if (config.includeOCR && extractionState.posts.length > 0) {
      extractionState.stage = 'ocr';
      broadcastState();
      await processOCR(tab.id);
    }

    // ============================
    // ETAPA 5: Gerar documento
    // ============================
    extractionState.stage = 'document';
    extractionState.progress.message = 'Gerando documento para NotebookLM...';
    broadcastState();

    const document = generateMarkdownDocument(
      extractionState.profileData,
      extractionState.posts,
      extractionState.config
    );

    // ============================
    // ETAPA 6: Download automático
    // ============================
    const username = extractionState.profileData.username;
    const ext = config.format === 'markdown' ? 'md' : 'txt';
    const filename = `${username}_notebooklm.${ext}`;

    await downloadFile(document, filename, 'text/markdown');

    // Também salvar JSON completo
    const fullData = {
      perfil: extractionState.profileData,
      data_extracao: new Date().toISOString(),
      total_posts_perfil: extractionState.profileData.total_posts || 0,
      posts_extraidos: extractionState.posts.length,
      posts: extractionState.posts,
    };
    await downloadFile(
      JSON.stringify(fullData, null, 2),
      `${username}_full.json`,
      'application/json'
    );

    // Concluído
    extractionState.stage = 'done';
    const elapsed = ((Date.now() - extractionState.startTime) / 1000).toFixed(1);
    extractionState.progress.message = `Concluído! ${extractionState.posts.length} posts extraídos em ${elapsed}s`;
    extractionState.running = false;
    broadcastState();

    return {
      success: true,
      postsCount: extractionState.posts.length,
      filename: filename,
    };

  } catch (error) {
    extractionState.stage = 'error';
    extractionState.error = error.message;
    extractionState.running = false;
    extractionState.progress.message = `Erro: ${error.message}`;
    broadcastState();
    return { error: error.message };
  }
}

// ============================================================================
// DOWNLOAD DE IMAGENS
// ============================================================================

async function downloadPostImages(tabId) {
  const posts = extractionState.posts;
  let downloaded = 0;
  let errors = 0;

  for (let i = 0; i < posts.length; i++) {
    if (!extractionState.running) break;

    const post = posts[i];
    const imageUrls = post.image_urls || [];
    
    for (let j = 0; j < imageUrls.length; j++) {
      try {
        const result = await chrome.tabs.sendMessage(tabId, {
          action: 'DOWNLOAD_IMAGE',
          url: imageUrls[j],
          forOCR: false,
        });

        if (result?.imageData) {
          // Guardar referência (não salva localmente, usa para OCR)
          if (!post._imageBlobs) post._imageBlobs = [];
          post._imageBlobs.push(result.imageData);
          downloaded++;
        } else {
          errors++;
        }
      } catch (e) {
        errors++;
      }

      // Delay
      await new Promise(r => setTimeout(r, 500 + Math.random() * 1500));
    }

    extractionState.progress = {
      current: i + 1,
      total: posts.length,
      message: `Baixando imagens: ${i + 1}/${posts.length} posts (${downloaded} imgs, ${errors} erros)`,
    };
    broadcastState();
  }
}

// ============================================================================
// OCR (Simplificado - usando Canvas no content script)
// ============================================================================

async function processOCR(tabId) {
  const posts = extractionState.posts;
  let processed = 0;
  let withText = 0;

  for (let i = 0; i < posts.length; i++) {
    if (!extractionState.running) break;

    const post = posts[i];
    const imageUrls = post.image_urls || [];
    const ocrTexts = [];

    for (const url of imageUrls) {
      try {
        // Baixar e pré-processar imagem no content script
        const result = await chrome.tabs.sendMessage(tabId, {
          action: 'DOWNLOAD_IMAGE',
          url: url,
          forOCR: true,
        });

        if (result?.imageData) {
          // OCR básico usando Canvas + heurísticas
          // Para OCR real, seria necessário Tesseract.js (muito pesado para extensão)
          // Por enquanto, usamos a accessibility_caption do Instagram como substituto
          const text = post.accessibility_caption || '';
          ocrTexts.push(text);
          if (text) withText++;
        } else {
          ocrTexts.push('');
        }
      } catch (e) {
        ocrTexts.push('');
      }

      await new Promise(r => setTimeout(r, 300));
    }

    post.ocr_texts = ocrTexts;
    processed++;

    if ((i + 1) % 10 === 0 || i === posts.length - 1) {
      extractionState.progress = {
        current: i + 1,
        total: posts.length,
        message: `OCR: ${i + 1}/${posts.length} posts (${withText} com texto)`,
      };
      broadcastState();
    }
  }
}

// ============================================================================
// GERAÇÃO DO DOCUMENTO MARKDOWN PARA NOTEBOOKLM
// ============================================================================

function generateMarkdownDocument(profile, posts, config) {
  // Ordenar posts
  let sortedPosts = [...posts];
  if (config.chronologicalOrder) {
    sortedPosts.sort((a, b) => (a.date_utc || '').localeCompare(b.date_utc || ''));
  } else {
    sortedPosts.sort((a, b) => (b.date_utc || '').localeCompare(a.date_utc || ''));
  }

  const sections = [];

  // --- HEADER ---
  sections.push(generateHeader(profile, sortedPosts));

  // --- PERFIL ---
  sections.push(generateProfileSection(profile));

  // --- ESTATÍSTICAS ---
  sections.push(generateStatisticsSection(sortedPosts));

  // --- HASHTAGS ---
  sections.push(generateHashtagIndex(sortedPosts));

  // --- LOCALIZAÇÕES ---
  sections.push(generateLocationIndex(sortedPosts));

  // --- MENÇÕES ---
  sections.push(generateMentionIndex(sortedPosts));

  // --- TODOS OS POSTS ---
  sections.push(generatePostsSection(sortedPosts, config));

  // --- TIMELINE ---
  sections.push(generateTimelineSummary(sortedPosts));

  return sections.filter(s => s).join('\n\n');
}

function generateHeader(profile, posts) {
  const username = profile.username || 'unknown';
  const ocrCount = posts.filter(p => p.ocr_texts?.some(t => t)).length;
  const date = new Date().toISOString().slice(0, 19).replace('T', ' ');

  return [
    `# Perfil Instagram: @${username}`,
    `## Extração completa para análise no NotebookLM`,
    '',
    `- **Data da extração:** ${date}`,
    `- **Total de posts analisados:** ${posts.length}`,
    `- **Posts com texto nas imagens (OCR/alt):** ${ocrCount}`,
    `- **Fonte:** https://www.instagram.com/${username}/`,
    `- **Gerado por:** Instagram Profile Extractor → NotebookLM (Chrome Extension v1.0)`,
    '',
    '---',
  ].join('\n');
}

function generateProfileSection(profile) {
  const fields = [
    ['Nome completo', profile.full_name],
    ['Username', `@${profile.username || ''}`],
    ['Biografia', profile.biography],
    ['Site externo', profile.external_url],
    ['Seguidores', formatNumber(profile.followers)],
    ['Seguindo', formatNumber(profile.following)],
    ['Total de posts', formatNumber(profile.total_posts)],
    ['Verificado', profile.is_verified ? 'Sim ✅' : 'Não'],
    ['Conta business', profile.is_business ? 'Sim' : 'Não'],
    ['Categoria', profile.business_category],
  ];

  const lines = ['## Informações do Perfil\n'];
  for (const [label, value] of fields) {
    if (value) lines.push(`- **${label}:** ${value}`);
  }

  return lines.join('\n');
}

function generateStatisticsSection(posts) {
  if (!posts.length) return '';

  const totalLikes = posts.reduce((sum, p) => sum + (p.likes || 0), 0);
  const totalComments = posts.reduce((sum, p) => sum + (p.comments_count || 0), 0);
  const withOCR = posts.filter(p => p.ocr_texts?.some(t => t)).length;
  const withLocation = posts.filter(p => p.location?.name).length;
  const videos = posts.filter(p => p.is_video).length;
  const carousels = posts.filter(p => p.typename === 'GraphSidecar').length;
  const images = posts.length - videos - carousels;
  const avgLikes = Math.round(totalLikes / posts.length);
  const avgComments = Math.round(totalComments / posts.length);

  // Top 5 posts
  const topPosts = [...posts].sort((a, b) => (b.likes || 0) - (a.likes || 0)).slice(0, 5);

  const lines = [
    '## Estatísticas Agregadas\n',
    `- **Total de posts:** ${posts.length}`,
    `- **Imagens:** ${images} | **Vídeos:** ${videos} | **Carrosséis:** ${carousels}`,
    `- **Total de curtidas:** ${formatNumber(totalLikes)}`,
    `- **Total de comentários:** ${formatNumber(totalComments)}`,
    `- **Média de curtidas/post:** ${formatNumber(avgLikes)}`,
    `- **Média de comentários/post:** ${formatNumber(avgComments)}`,
    `- **Posts com texto nas imagens:** ${withOCR}`,
    `- **Posts com localização:** ${withLocation}`,
    '',
    '### Top 5 Posts (mais curtidos)\n',
  ];

  topPosts.forEach((p, i) => {
    const captionPreview = (p.caption || '').slice(0, 100);
    const ellipsis = (p.caption || '').length > 100 ? '...' : '';
    lines.push(
      `${i + 1}. [${p.shortcode}](${p.url}) — ${formatNumber(p.likes || 0)} curtidas | "${captionPreview}${ellipsis}"`
    );
  });

  // Posts com mais comentários
  const topCommented = [...posts].sort((a, b) => (b.comments_count || 0) - (a.comments_count || 0)).slice(0, 5);
  lines.push('', '### Top 5 Posts (mais comentados)\n');
  topCommented.forEach((p, i) => {
    const captionPreview = (p.caption || '').slice(0, 80);
    const ellipsis = (p.caption || '').length > 80 ? '...' : '';
    lines.push(
      `${i + 1}. [${p.shortcode}](${p.url}) — ${formatNumber(p.comments_count || 0)} comentários | "${captionPreview}${ellipsis}"`
    );
  });

  return lines.join('\n');
}

function generateHashtagIndex(posts) {
  const counter = {};
  for (const p of posts) {
    for (const tag of (p.caption_hashtags || [])) {
      const lower = tag.toLowerCase();
      counter[lower] = (counter[lower] || 0) + 1;
    }
  }

  const sorted = Object.entries(counter).sort((a, b) => b[1] - a[1]).slice(0, 30);
  if (!sorted.length) return '';

  const lines = ['## Índice de Hashtags (Top 30)\n'];
  for (const [tag, count] of sorted) {
    lines.push(`- **#${tag}** (${count}x)`);
  }

  return lines.join('\n');
}

function generateLocationIndex(posts) {
  const locations = {};
  for (const p of posts) {
    const loc = p.location;
    if (loc?.name) {
      if (!locations[loc.name]) locations[loc.name] = { count: 0, posts: [] };
      locations[loc.name].count++;
      locations[loc.name].posts.push(p.shortcode);
    }
  }

  const sorted = Object.entries(locations).sort((a, b) => b[1].count - a[1].count).slice(0, 20);
  if (!sorted.length) return '';

  const lines = ['## Localizações Mencionadas\n'];
  for (const [name, data] of sorted) {
    lines.push(`- **${name}** (${data.count}x)`);
  }

  return lines.join('\n');
}

function generateMentionIndex(posts) {
  const counter = {};
  for (const p of posts) {
    for (const mention of (p.caption_mentions || [])) {
      const lower = mention.toLowerCase();
      counter[lower] = (counter[lower] || 0) + 1;
    }
  }

  const sorted = Object.entries(counter).sort((a, b) => b[1] - a[1]).slice(0, 20);
  if (!sorted.length) return '';

  const lines = ['## Menções mais frequentes (Top 20)\n'];
  for (const [mention, count] of sorted) {
    lines.push(`- **@${mention}** (${count}x)`);
  }

  return lines.join('\n');
}

function generatePostsSection(posts, config) {
  const lines = [
    '## Todos os Posts\n',
    'Cada post inclui: data, legenda completa, texto extraído via OCR/accessibility (quando disponível), e métricas de engajamento.\n',
    '---\n',
  ];

  posts.forEach((post, i) => {
    lines.push(formatSinglePost(post, i + 1, config));
  });

  return lines.join('\n');
}

function formatSinglePost(post, number, config) {
  const shortcode = post.shortcode;
  const date = (post.date_utc || '').slice(0, 10);
  const typeMap = {
    'GraphImage': '📷 Imagem',
    'GraphVideo': '🎬 Vídeo',
    'GraphSidecar': '📑 Carrossel',
  };
  const tipo = typeMap[post.typename] || '📷 Post';

  const lines = [
    `### Post #${number}: ${shortcode}`,
    `- **Data:** ${date}`,
    `- **Tipo:** ${tipo}`,
    `- **URL:** ${post.url || ''}`,
    `- **Curtidas:** ${formatNumber(post.likes || 0)}`,
    `- **Comentários:** ${formatNumber(post.comments_count || 0)}`,
  ];

  if (post.is_video && post.video_view_count) {
    lines.push(`- **Views:** ${formatNumber(post.video_view_count)}`);
  }

  if (post.location?.name) {
    lines.push(`- **Local:** ${post.location.name}`);
    if (post.location.lat && post.location.lng) {
      lines.push(`- **Coordenadas:** ${post.location.lat}, ${post.location.lng}`);
    }
  }

  if (post.caption_hashtags?.length) {
    lines.push(`- **Hashtags:** ${post.caption_hashtags.map(t => '#' + t).join(', ')}`);
  }

  if (post.caption_mentions?.length) {
    lines.push(`- **Menções:** ${post.caption_mentions.map(m => '@' + m).join(', ')}`);
  }

  // Legenda completa
  if (post.caption) {
    const escapedCaption = post.caption.replace(/\n/g, '\n> ');
    lines.push(`\n**Legenda:**\n> ${escapedCaption}`);
  }

  // Texto OCR / Accessibility
  const ocrTexts = (post.ocr_texts || []).filter(t => t);
  if (ocrTexts.length > 0 && config.includeOCR !== false) {
    lines.push(`\n**Texto extraído da imagem (OCR/Alt):**\n\`\`\`\n${ocrTexts.join('\n---\n')}\n\`\`\``);
  }

  // Accessibility caption (descrição automática do Instagram)
  if (post.accessibility_caption && !ocrTexts.length) {
    lines.push(`\n**Descrição automática da imagem:** ${post.accessibility_caption}`);
  }

  // Imagens (URLs para referência)
  if (post.image_urls?.length > 1) {
    lines.push(`\n**Imagens no carrossel:** ${post.image_urls.length} imagens`);
  }

  lines.push('\n---\n');
  return lines.join('\n');
}

function generateTimelineSummary(posts) {
  if (!posts.length) return '';

  const monthly = {};
  for (const p of posts) {
    const month = (p.date_utc || '').slice(0, 7); // YYYY-MM
    if (!month || month.length < 7) continue;
    
    if (!monthly[month]) monthly[month] = { count: 0, likes: 0, comments: 0 };
    monthly[month].count++;
    monthly[month].likes += (p.likes || 0);
    monthly[month].comments += (p.comments_count || 0);
  }

  const months = Object.keys(monthly).sort();
  if (!months.length) return '';

  const lines = ['## Timeline: Posts por Mês\n'];
  for (const month of months) {
    const data = monthly[month];
    const avgLikes = Math.round(data.likes / data.count);
    lines.push(
      `- **${month}:** ${data.count} posts | ${formatNumber(data.likes)} curtidas (média: ${formatNumber(avgLikes)}) | ${formatNumber(data.comments)} comentários`
    );
  }

  // Resumo de frequência
  if (months.length >= 2) {
    const totalMonths = months.length;
    const totalPosts = posts.length;
    const avgPerMonth = (totalPosts / totalMonths).toFixed(1);
    lines.push('', `**Média de publicação:** ${avgPerMonth} posts/mês (${totalMonths} meses de atividade)`);
  }

  return lines.join('\n');
}

// ============================================================================
// UTILIDADES
// ============================================================================

function formatNumber(num) {
  if (typeof num !== 'number' || isNaN(num)) return '0';
  return num.toLocaleString('pt-BR');
}

function broadcastState() {
  chrome.runtime.sendMessage({
    action: 'STATE_UPDATE',
    state: {
      running: extractionState.running,
      stage: extractionState.stage,
      progress: extractionState.progress,
      error: extractionState.error,
      postsCount: extractionState.posts.length,
      profileData: extractionState.profileData,
    },
  }).catch(() => {}); // Popup pode estar fechado
}

function updateProgress(data) {
  if (data.type === 'posts' || data.type === 'posts_dom') {
    extractionState.progress = {
      current: data.current,
      total: data.total,
      message: `Extraindo posts: ${data.current}/${data.total}`,
    };
  } else if (data.type === 'enriching') {
    extractionState.progress = {
      current: data.current,
      total: data.total,
      message: `Enriquecendo dados: ${data.current}/${data.total} posts`,
    };
  } else if (data.type === 'rate_limit') {
    extractionState.progress.message = `Rate limit! Aguardando ${data.wait}s... (${data.current} posts salvos)`;
  }
  broadcastState();
}

async function downloadFile(content, filename, mimeType = 'text/plain') {
  try {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    
    await chrome.downloads.download({
      url: url,
      filename: filename,
      saveAs: false,
    });

    // Limpar URL após um tempo
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return { success: true, filename };
  } catch (error) {
    console.error('[IG Extractor] Erro no download:', error);
    return { error: error.message };
  }
}

// ============================================================================
// INSTALL HANDLER
// ============================================================================

chrome.runtime.onInstalled.addListener(() => {
  console.log('[IG Extractor] Extensão instalada/atualizada');
});

// Cleanup ao fechar
chrome.runtime.onSuspend?.addListener(() => {
  extractionState.running = false;
});
