/**
 * Instagram Profile Extractor - Content Script
 * 
 * Injeta no Instagram para extrair dados de perfis públicos.
 * Usa interceptação da API GraphQL + parsing do DOM.
 * 
 * Estratégia de extração:
 * 1. Perfil: SharedData ou meta tags + DOM parsing
 * 2. Posts: API GraphQL (/graphql/query) com paginação automática
 * 3. Detalhes: API de shortcode para dados completos de cada post
 */

(function() {
  'use strict';

  // ============================================================================
  // CONSTANTES
  // ============================================================================
  const IG_APP_ID = '936619743392459';
  const GRAPHQL_ENDPOINT = 'https://www.instagram.com/graphql/query/';
  
  // Query hashes conhecidos (Instagram muda periodicamente)
  const QUERY_HASHES = {
    // User posts timeline
    userPosts: '69cba40317214236af40e7efa697781d',
    // Alternativo
    userPosts2: 'e769aa130647d2571c27c44596cb68c6',
    // Post detail
    postDetail: '2efa04f61586458cef44571f5f3f229c',
    // Profile info
    profileInfo: 'c9100bf9110dd6361671f113dd02e7d6',
  };

  // Headers para parecer requisição legítima do Instagram
  const DEFAULT_HEADERS = {
    'X-IG-App-ID': IG_APP_ID,
    'X-Requested-With': 'XMLHttpRequest',
    'X-ASBD-ID': '129477',
    'Accept': '*/*',
    'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
  };

  // ============================================================================
  // UTILIDADES
  // ============================================================================

  /**
   * Delay com jitter aleatório para anti-detecção
   */
  function delay(minMs = 1000, maxMs = 3000) {
    const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Extrai CSRF token dos cookies
   */
  function getCsrfToken() {
    const match = document.cookie.match(/csrftoken=([^;]+)/);
    return match ? match[1] : '';
  }

  /**
   * Faz requisição autenticada à API do Instagram
   */
  async function igFetch(url, options = {}) {
    const csrfToken = getCsrfToken();
    const headers = {
      ...DEFAULT_HEADERS,
      'X-CSRFToken': csrfToken,
      ...options.headers,
    };

    const response = await fetch(url, {
      ...options,
      headers,
      credentials: 'include',
    });

    if (response.status === 429) {
      throw new Error('RATE_LIMIT');
    }
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  // ============================================================================
  // EXTRAÇÃO DO PERFIL
  // ============================================================================

  /**
   * Tenta extrair dados do perfil de várias fontes
   */
  async function extractProfileData(username) {
    // Tentativa 1: API web profile info
    try {
      const data = await igFetch(
        `https://www.instagram.com/api/v1/users/web_profile_info/?username=${username}`,
        { headers: { 'X-IG-App-ID': IG_APP_ID } }
      );
      
      if (data?.data?.user) {
        return parseProfileFromAPI(data.data.user);
      }
    } catch (e) {
      console.log('[IG Extractor] API v1 falhou, tentando alternativas...', e.message);
    }

    // Tentativa 2: Shared Data (embedded JSON)
    try {
      const scripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const script of scripts) {
        const json = JSON.parse(script.textContent);
        if (json['@type'] === 'ProfilePage') {
          return parseProfileFromLDJSON(json);
        }
      }
    } catch (e) {
      console.log('[IG Extractor] LD+JSON falhou', e.message);
    }

    // Tentativa 3: DOM parsing
    try {
      return parseProfileFromDOM(username);
    } catch (e) {
      console.log('[IG Extractor] DOM parsing falhou', e.message);
    }

    throw new Error(`Não foi possível extrair dados do perfil @${username}`);
  }

  /**
   * Parse do perfil a partir da API v1
   */
  function parseProfileFromAPI(user) {
    return {
      username: user.username,
      full_name: user.full_name || '',
      biography: user.biography || '',
      external_url: user.external_url || user.bio_links?.[0]?.url || '',
      followers: user.edge_followed_by?.count || user.follower_count || 0,
      following: user.edge_follow?.count || user.following_count || 0,
      total_posts: user.edge_owner_to_timeline_media?.count || user.media_count || 0,
      is_verified: user.is_verified || false,
      is_business: user.is_business_account || user.is_professional_account || false,
      business_category: user.business_category_name || user.category_name || '',
      profile_pic_url: user.profile_pic_url_hd || user.profile_pic_url || '',
      user_id: user.id || user.pk || '',
      is_private: user.is_private || false,
    };
  }

  /**
   * Parse do perfil a partir de LD+JSON
   */
  function parseProfileFromLDJSON(json) {
    return {
      username: json.alternateName?.replace('@', '') || '',
      full_name: json.name || '',
      biography: json.description || '',
      external_url: json.url || '',
      followers: parseInt(json.mainEntityofPage?.interactionStatistic?.find?.(
        s => s.interactionType === 'http://schema.org/FollowAction'
      )?.userInteractionCount || '0'),
      following: 0,
      total_posts: 0,
      is_verified: false,
      is_business: false,
      business_category: '',
      profile_pic_url: json.image || '',
      user_id: '',
      is_private: false,
    };
  }

  /**
   * Parse do perfil a partir do DOM
   */
  function parseProfileFromDOM(username) {
    const data = {
      username: username,
      full_name: '',
      biography: '',
      external_url: '',
      followers: 0,
      following: 0,
      total_posts: 0,
      is_verified: false,
      is_business: false,
      business_category: '',
      profile_pic_url: '',
      user_id: '',
      is_private: false,
    };

    // Nome completo - header do perfil
    const headerSection = document.querySelector('header section');
    if (headerSection) {
      const nameEl = headerSection.querySelector('span[class*="x1lliihq"]') || 
                     headerSection.querySelector('h2');
      if (nameEl) data.full_name = nameEl.textContent.trim();
    }

    // Contadores (posts, seguidores, seguindo) 
    const statLinks = document.querySelectorAll('header ul li');
    statLinks.forEach((li) => {
      const text = li.textContent.toLowerCase();
      const numEl = li.querySelector('span span') || li.querySelector('span');
      if (numEl) {
        const numText = numEl.textContent.replace(/[.,]/g, '').replace(/\s/g, '');
        let num = 0;
        if (numText.includes('k') || numText.includes('K')) {
          num = parseFloat(numText) * 1000;
        } else if (numText.includes('m') || numText.includes('M')) {
          num = parseFloat(numText) * 1000000;
        } else {
          num = parseInt(numText) || 0;
        }
        
        if (text.includes('post') || text.includes('publica')) {
          data.total_posts = num;
        } else if (text.includes('seguid') || text.includes('follower')) {
          data.followers = num;
        } else if (text.includes('seguindo') || text.includes('following')) {
          data.following = num;
        }
      }
    });

    // Bio
    const bioSection = document.querySelector('header section > div > span');
    if (bioSection) data.biography = bioSection.textContent.trim();

    // Foto de perfil
    const profileImg = document.querySelector('header img[alt*="foto"]') ||
                       document.querySelector('header img[alt*="profile"]') ||
                       document.querySelector('header img');
    if (profileImg) data.profile_pic_url = profileImg.src;

    // Verificado
    const verifiedBadge = document.querySelector('header [aria-label*="Verificad"]') ||
                          document.querySelector('header [title*="Verified"]');
    data.is_verified = !!verifiedBadge;

    return data;
  }

  // ============================================================================
  // EXTRAÇÃO DE POSTS - API GraphQL
  // ============================================================================

  /**
   * Extrai posts usando a API GraphQL do Instagram
   * Paginação automática via end_cursor
   */
  async function extractPosts(userId, maxPosts = 0, onProgress = null) {
    const posts = [];
    let hasNext = true;
    let endCursor = '';
    const batchSize = 12; // Instagram retorna 12 por página
    let pageCount = 0;

    while (hasNext) {
      if (maxPosts > 0 && posts.length >= maxPosts) break;

      try {
        let data;
        
        // Tentar API v1 primeiro (mais confiável)
        try {
          const params = new URLSearchParams({
            count: batchSize.toString(),
            max_id: endCursor || '',
          });
          
          data = await igFetch(
            `https://www.instagram.com/api/v1/feed/user/${userId}/?${params}`
          );
          
          if (data?.items) {
            const items = data.items;
            for (const item of items) {
              if (maxPosts > 0 && posts.length >= maxPosts) break;
              posts.push(parsePostFromV1API(item));
            }
            hasNext = data.more_available || false;
            endCursor = data.next_max_id || '';
          } else {
            throw new Error('V1 API returned no items');
          }
        } catch (v1Error) {
          // Fallback: GraphQL API
          console.log('[IG Extractor] V1 API falhou, tentando GraphQL...', v1Error.message);
          
          const variables = {
            id: userId,
            first: batchSize,
            after: endCursor || null,
          };

          const params = new URLSearchParams({
            query_hash: QUERY_HASHES.userPosts,
            variables: JSON.stringify(variables),
          });

          data = await igFetch(`${GRAPHQL_ENDPOINT}?${params}`);
          
          const timeline = data?.data?.user?.edge_owner_to_timeline_media;
          if (!timeline) {
            console.log('[IG Extractor] Sem dados de timeline, tentando hash alternativo...');
            
            const params2 = new URLSearchParams({
              query_hash: QUERY_HASHES.userPosts2,
              variables: JSON.stringify(variables),
            });
            data = await igFetch(`${GRAPHQL_ENDPOINT}?${params2}`);
            const timeline2 = data?.data?.user?.edge_owner_to_timeline_media;
            
            if (!timeline2) {
              throw new Error('GraphQL também falhou');
            }
            
            processGraphQLTimeline(timeline2, posts, maxPosts);
            hasNext = timeline2.page_info?.has_next_page || false;
            endCursor = timeline2.page_info?.end_cursor || '';
          } else {
            processGraphQLTimeline(timeline, posts, maxPosts);
            hasNext = timeline.page_info?.has_next_page || false;
            endCursor = timeline.page_info?.end_cursor || '';
          }
        }

        pageCount++;
        
        // Reportar progresso
        if (onProgress) {
          onProgress({
            type: 'posts',
            current: posts.length,
            total: maxPosts || '∞',
            page: pageCount,
          });
        }

        // Anti-detecção: delay entre páginas
        if (hasNext) {
          await delay(2000, 5000);
        }

      } catch (error) {
        if (error.message === 'RATE_LIMIT') {
          console.log('[IG Extractor] Rate limit atingido. Aguardando 60s...');
          if (onProgress) {
            onProgress({ type: 'rate_limit', current: posts.length, wait: 60 });
          }
          await delay(55000, 65000);
          continue;
        }
        
        console.error('[IG Extractor] Erro na extração:', error);
        // Salvar o que temos e parar
        break;
      }
    }

    return posts;
  }

  /**
   * Processa timeline do GraphQL API
   */
  function processGraphQLTimeline(timeline, posts, maxPosts) {
    const edges = timeline?.edges || [];
    for (const edge of edges) {
      if (maxPosts > 0 && posts.length >= maxPosts) break;
      posts.push(parsePostFromGraphQL(edge.node));
    }
  }

  /**
   * Parse de post da API v1
   */
  function parsePostFromV1API(item) {
    const imageUrls = [];
    
    if (item.carousel_media) {
      // Carrossel
      for (const media of item.carousel_media) {
        const candidates = media.image_versions2?.candidates || [];
        if (candidates.length > 0) {
          // Pegar a maior resolução
          const best = candidates.reduce((a, b) => 
            (a.width * a.height) > (b.width * b.height) ? a : b
          );
          imageUrls.push(best.url);
        }
      }
    } else if (item.image_versions2?.candidates) {
      const candidates = item.image_versions2.candidates;
      if (candidates.length > 0) {
        const best = candidates.reduce((a, b) => 
          (a.width * a.height) > (b.width * b.height) ? a : b
        );
        imageUrls.push(best.url);
      }
    }

    const caption = item.caption?.text || '';
    
    return {
      shortcode: item.code,
      url: `https://www.instagram.com/p/${item.code}/`,
      typename: item.carousel_media ? 'GraphSidecar' : 
                (item.media_type === 2 ? 'GraphVideo' : 'GraphImage'),
      date_utc: new Date((item.taken_at || 0) * 1000).toISOString(),
      date_local: null,
      caption: caption,
      caption_hashtags: extractHashtags(caption),
      caption_mentions: extractMentions(caption),
      likes: item.like_count || 0,
      comments_count: item.comment_count || 0,
      is_video: item.media_type === 2,
      video_view_count: item.view_count || item.play_count || null,
      image_urls: imageUrls,
      location: item.location ? {
        name: item.location.name || '',
        lat: item.location.lat || null,
        lng: item.location.lng || null,
      } : null,
      accessibility_caption: item.accessibility_caption || '',
      local_images: [],
      ocr_texts: [],
    };
  }

  /**
   * Parse de post da GraphQL API
   */
  function parsePostFromGraphQL(node) {
    const imageUrls = [];
    
    if (node.edge_sidecar_to_children?.edges) {
      // Carrossel
      for (const child of node.edge_sidecar_to_children.edges) {
        imageUrls.push(child.node.display_url);
      }
    } else {
      imageUrls.push(node.display_url);
    }

    const caption = node.edge_media_to_caption?.edges?.[0]?.node?.text || '';
    
    return {
      shortcode: node.shortcode,
      url: `https://www.instagram.com/p/${node.shortcode}/`,
      typename: node.__typename || 'GraphImage',
      date_utc: new Date((node.taken_at_timestamp || 0) * 1000).toISOString(),
      date_local: null,
      caption: caption,
      caption_hashtags: extractHashtags(caption),
      caption_mentions: extractMentions(caption),
      likes: node.edge_media_preview_like?.count || node.edge_liked_by?.count || 0,
      comments_count: node.edge_media_to_comment?.count || node.edge_media_preview_comment?.count || 0,
      is_video: node.is_video || false,
      video_view_count: node.video_view_count || null,
      image_urls: imageUrls,
      location: node.location ? {
        name: node.location.name || '',
        lat: node.location.lat || null,
        lng: node.location.lng || null,
      } : null,
      accessibility_caption: node.accessibility_caption || '',
      local_images: [],
      ocr_texts: [],
    };
  }

  // ============================================================================
  // EXTRAÇÃO DE POSTS VIA DOM (Fallback)
  // ============================================================================

  /**
   * Extrai posts via scroll infinito e parsing do DOM
   * Usado quando APIs falham
   */
  async function extractPostsFromDOM(username, maxPosts = 0, onProgress = null) {
    const posts = [];
    const seenShortcodes = new Set();
    let scrollAttempts = 0;
    const maxScrollAttempts = 200;
    let noNewPostsCount = 0;

    while (scrollAttempts < maxScrollAttempts) {
      if (maxPosts > 0 && posts.length >= maxPosts) break;

      // Encontrar links de posts na página
      const postLinks = document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]');
      let newFound = 0;

      for (const link of postLinks) {
        const href = link.getAttribute('href');
        const match = href.match(/\/(p|reel)\/([A-Za-z0-9_-]+)/);
        if (!match) continue;

        const shortcode = match[2];
        if (seenShortcodes.has(shortcode)) continue;
        seenShortcodes.add(shortcode);
        newFound++;

        if (maxPosts > 0 && posts.length >= maxPosts) break;

        // Extrair imagem do thumbnail se disponível
        const img = link.querySelector('img');
        const imageUrl = img?.src || '';

        posts.push({
          shortcode: shortcode,
          url: `https://www.instagram.com/p/${shortcode}/`,
          typename: match[1] === 'reel' ? 'GraphVideo' : 'GraphImage',
          date_utc: '',
          date_local: null,
          caption: '',
          caption_hashtags: [],
          caption_mentions: [],
          likes: 0,
          comments_count: 0,
          is_video: match[1] === 'reel',
          video_view_count: null,
          image_urls: imageUrl ? [imageUrl] : [],
          location: null,
          accessibility_caption: img?.alt || '',
          local_images: [],
          ocr_texts: [],
          _needs_detail: true, // Marcar para buscar detalhes depois
        });
      }

      if (newFound === 0) {
        noNewPostsCount++;
        if (noNewPostsCount >= 5) break; // Fim do feed
      } else {
        noNewPostsCount = 0;
      }

      // Reportar progresso
      if (onProgress) {
        onProgress({
          type: 'posts_dom',
          current: posts.length,
          total: maxPosts || '∞',
          scroll: scrollAttempts,
        });
      }

      // Scroll para baixo
      window.scrollTo(0, document.body.scrollHeight);
      await delay(1500, 3000);
      scrollAttempts++;
    }

    return posts;
  }

  /**
   * Busca detalhes de um post individual via API
   */
  async function fetchPostDetail(shortcode) {
    try {
      // Tentativa 1: API v1
      const data = await igFetch(
        `https://www.instagram.com/api/v1/media/${shortcode}/info/`
      );
      
      if (data?.items?.[0]) {
        return parsePostFromV1API(data.items[0]);
      }
    } catch (e) {
      // Tentativa 2: Página do post
      try {
        const response = await fetch(`https://www.instagram.com/p/${shortcode}/?__a=1&__d=dis`, {
          credentials: 'include',
          headers: DEFAULT_HEADERS,
        });
        const data = await response.json();
        if (data?.graphql?.shortcode_media) {
          return parsePostFromGraphQL(data.graphql.shortcode_media);
        }
      } catch (e2) {
        console.log(`[IG Extractor] Não foi possível obter detalhes de ${shortcode}`);
      }
    }
    return null;
  }

  /**
   * Enriquece posts que foram extraídos via DOM com dados completos
   */
  async function enrichPostsWithDetails(posts, onProgress = null) {
    const postsNeedingDetail = posts.filter(p => p._needs_detail);
    
    for (let i = 0; i < postsNeedingDetail.length; i++) {
      const post = postsNeedingDetail[i];
      
      try {
        const detail = await fetchPostDetail(post.shortcode);
        if (detail) {
          // Mesclar dados
          Object.assign(post, detail);
          delete post._needs_detail;
        }
      } catch (e) {
        console.log(`[IG Extractor] Erro ao enriquecer ${post.shortcode}:`, e.message);
      }

      if (onProgress && (i + 1) % 5 === 0) {
        onProgress({
          type: 'enriching',
          current: i + 1,
          total: postsNeedingDetail.length,
        });
      }

      // Delay anti-detecção
      await delay(1500, 4000);
    }

    return posts;
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  function extractHashtags(text) {
    if (!text) return [];
    const matches = text.match(/#(\w+)/g);
    return matches ? matches.map(h => h.substring(1)) : [];
  }

  function extractMentions(text) {
    if (!text) return [];
    const matches = text.match(/@(\w+)/g);
    return matches ? matches.map(m => m.substring(1)) : [];
  }

  /**
   * Detecta username da página atual
   */
  function detectCurrentUsername() {
    const path = window.location.pathname;
    const match = path.match(/^\/([A-Za-z0-9._]+)\/?$/);
    if (match && !['explore', 'reels', 'stories', 'direct', 'accounts', 'p'].includes(match[1])) {
      return match[1];
    }
    return null;
  }

  /**
   * Verifica se estamos em uma página de perfil
   */
  function isProfilePage() {
    return !!detectCurrentUsername();
  }

  // ============================================================================
  // DOWNLOAD DE IMAGENS (como blobs para uso local)
  // ============================================================================

  /**
   * Baixa uma imagem e retorna como base64 data URL
   */
  async function downloadImageAsBase64(url) {
    try {
      const response = await fetch(url, {
        credentials: 'include',
        headers: {
          'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
          'Referer': 'https://www.instagram.com/',
        },
      });
      
      if (!response.ok) return null;
      
      const blob = await response.blob();
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    } catch (e) {
      console.log('[IG Extractor] Erro ao baixar imagem:', e.message);
      return null;
    }
  }

  /**
   * Baixa imagem e retorna como Blob URL
   */
  async function downloadImageAsBlob(url) {
    try {
      const response = await fetch(url, {
        credentials: 'include',
        headers: {
          'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
          'Referer': 'https://www.instagram.com/',
        },
      });
      if (!response.ok) return null;
      const blob = await response.blob();
      return blob;
    } catch (e) {
      return null;
    }
  }

  // ============================================================================
  // OCR NO BROWSER (usando Canvas para preparação)
  // ============================================================================

  /**
   * Pré-processa imagem para OCR:
   * - Converte para grayscale
   * - Aumenta contraste
   * - Retorna ImageData
   */
  async function preprocessImageForOCR(imageBlob) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      const url = URL.createObjectURL(imageBlob);
      
      img.onload = () => {
        const canvas = document.createElement('canvas');
        
        // Limitar tamanho para performance
        const maxDim = 1500;
        let w = img.width;
        let h = img.height;
        if (Math.max(w, h) > maxDim) {
          const ratio = maxDim / Math.max(w, h);
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }
        
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        
        // Desenhar imagem
        ctx.drawImage(img, 0, 0, w, h);
        
        // Aumentar contraste
        ctx.filter = 'contrast(1.3) brightness(1.1)';
        ctx.drawImage(canvas, 0, 0);
        ctx.filter = 'none';
        
        // Converter para blob para enviar ao background
        canvas.toBlob((blob) => {
          URL.revokeObjectURL(url);
          resolve(blob);
        }, 'image/png');
      };
      
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to load image for OCR'));
      };
      
      img.src = url;
    });
  }

  // ============================================================================
  // MESSAGE HANDLER - Comunicação com popup/background
  // ============================================================================

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Usar padrão async
    handleMessage(message).then(sendResponse).catch(err => {
      sendResponse({ error: err.message });
    });
    return true; // Indica resposta assíncrona
  });

  async function handleMessage(message) {
    switch (message.action) {

      case 'CHECK_PAGE': {
        const username = detectCurrentUsername();
        return {
          isProfile: !!username,
          username: username,
          url: window.location.href,
        };
      }

      case 'EXTRACT_PROFILE': {
        const username = message.username || detectCurrentUsername();
        if (!username) throw new Error('Não está em uma página de perfil');
        
        const profile = await extractProfileData(username);
        return { profile };
      }

      case 'EXTRACT_POSTS': {
        const { userId, username, maxPosts, method } = message;
        
        let posts;
        const onProgress = (progress) => {
          chrome.runtime.sendMessage({
            action: 'PROGRESS_UPDATE',
            ...progress,
          });
        };

        if (method === 'dom' || !userId) {
          // Fallback: extração via DOM + scroll
          posts = await extractPostsFromDOM(username, maxPosts, onProgress);
          // Enriquecer com detalhes via API
          posts = await enrichPostsWithDetails(posts, onProgress);
        } else {
          // Preferido: API direta
          posts = await extractPosts(userId, maxPosts, onProgress);
        }

        return { posts };
      }

      case 'DOWNLOAD_IMAGE': {
        const blob = await downloadImageAsBlob(message.url);
        if (!blob) return { error: 'Download falhou' };
        
        // Se OCR solicitado, pré-processar
        if (message.forOCR) {
          const processed = await preprocessImageForOCR(blob);
          const base64 = await blobToBase64(processed);
          return { imageData: base64 };
        }
        
        const base64 = await blobToBase64(blob);
        return { imageData: base64 };
      }

      case 'PING':
        return { pong: true, isProfile: isProfilePage(), username: detectCurrentUsername() };

      default:
        return { error: `Ação desconhecida: ${message.action}` };
    }
  }

  function blobToBase64(blob) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  }

  // ============================================================================
  // INICIALIZAÇÃO
  // ============================================================================
  console.log('[IG Extractor] Content script carregado em', window.location.href);

})();
