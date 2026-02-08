"""
ETAPA 2: Download de imagens dos posts com rate limiting e retry.

Baixa as imagens em alta resolução, suportando:
- Carrosséis (múltiplas imagens por post)
- Rate limiting com delay aleatório
- Retry com exponential backoff
- Rotação de User-Agent e proxy
- Detecção de HTTP 429 (rate limit)
"""
import logging
import os
import random
import time
from typing import Optional

import httpx
from PIL import Image

from config import Config

logger = logging.getLogger(__name__)


class ImageDownloader:
    """Faz download das imagens dos posts extraídos."""

    def __init__(self, config: Config):
        self.config = config
        self._proxy_index = 0
        self._download_count = 0
        self._error_count = 0

    def _get_headers(self) -> dict:
        """Gera headers realistas com User-Agent rotativo."""
        ua = random.choice(self.config.user_agents)
        return {
            "User-Agent": ua,
            "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
            "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
            "Accept-Encoding": "gzip, deflate, br",
            "Referer": "https://www.instagram.com/",
            "DNT": "1",
            "Connection": "keep-alive",
            "Sec-Fetch-Dest": "image",
            "Sec-Fetch-Mode": "no-cors",
            "Sec-Fetch-Site": "cross-site",
        }

    def _get_proxy(self) -> Optional[str]:
        """Retorna próximo proxy da lista (rotação round-robin)."""
        if not self.config.proxy_list:
            return None
        proxy = self.config.proxy_list[self._proxy_index % len(self.config.proxy_list)]
        self._proxy_index += 1
        return proxy

    def _download_single(self, url: str, filepath: str) -> bool:
        """
        Faz download de uma única imagem com retry e backoff.
        
        Returns:
            True se download bem-sucedido, False caso contrário
        """
        for attempt in range(self.config.max_retries):
            try:
                proxy = self._get_proxy()
                proxies = {"https://": proxy, "http://": proxy} if proxy else None

                with httpx.Client(
                    timeout=self.config.request_timeout,
                    follow_redirects=True,
                    proxies=proxies,
                ) as client:
                    response = client.get(url, headers=self._get_headers())

                    # Rate limit detectado
                    if response.status_code == 429:
                        wait = self.config.rate_limit_wait
                        logger.warning(
                            f"⏳ Rate limit (429). Aguardando {wait}s..."
                        )
                        time.sleep(wait)
                        continue

                    # Post excluído ou indisponível
                    if response.status_code in (404, 410):
                        logger.warning(f"🗑️ Imagem indisponível (HTTP {response.status_code}): {url[:80]}...")
                        return False

                    response.raise_for_status()

                    # Salvar imagem
                    with open(filepath, "wb") as f:
                        f.write(response.content)

                    # Validar que é uma imagem válida
                    try:
                        with Image.open(filepath) as img:
                            img.verify()
                    except Exception:
                        logger.warning(f"⚠️ Arquivo baixado não é uma imagem válida: {filepath}")
                        os.remove(filepath)
                        return False

                    self._download_count += 1
                    return True

            except httpx.TimeoutException:
                logger.warning(
                    f"⏰ Timeout na tentativa {attempt + 1}/{self.config.max_retries}: {url[:60]}..."
                )
            except httpx.HTTPStatusError as e:
                logger.warning(
                    f"❌ HTTP {e.response.status_code} na tentativa "
                    f"{attempt + 1}/{self.config.max_retries}: {url[:60]}..."
                )
            except Exception as e:
                logger.warning(
                    f"❌ Erro na tentativa {attempt + 1}/{self.config.max_retries}: {e}"
                )

            # Exponential backoff
            if attempt < self.config.max_retries - 1:
                wait = self.config.retry_backoff_base ** (attempt + 1)
                wait += random.uniform(0, 1)
                logger.debug(f"  Aguardando {wait:.1f}s antes de retry...")
                time.sleep(wait)

        self._error_count += 1
        return False

    def download_post_images(self, post: dict) -> list[str]:
        """
        Baixa todas as imagens de um post (incluindo carrossel).
        
        Args:
            post: dict com dados do post (deve conter 'image_urls' e 'shortcode')
            
        Returns:
            Lista de caminhos locais das imagens baixadas
        """
        self.config.ensure_dirs()
        local_paths = []
        image_urls = post.get("image_urls", [])
        shortcode = post["shortcode"]
        username = self.config.username

        for idx, url in enumerate(image_urls):
            # Nomenclatura: username_shortcode.jpg ou username_shortcode_1.jpg para carrossel
            if len(image_urls) == 1:
                filename = f"{username}_{shortcode}.jpg"
            else:
                filename = f"{username}_{shortcode}_{idx + 1}.jpg"

            filepath = os.path.join(self.config.images_dir, filename)

            # Pular se já existe
            if os.path.exists(filepath):
                logger.debug(f"⏭️ Já existe: {filename}")
                local_paths.append(filepath)
                continue

            success = self._download_single(url, filepath)
            if success:
                local_paths.append(filepath)
                logger.debug(f"✅ Baixado: {filename}")
            else:
                logger.debug(f"❌ Falha: {filename}")

        return local_paths

    def download_all(self, posts: list[dict]) -> list[dict]:
        """
        Baixa imagens de todos os posts.
        
        Args:
            posts: Lista de dicts com dados dos posts
            
        Returns:
            Lista atualizada com caminhos locais das imagens
        """
        total = len(posts)
        logger.info(f"📥 Iniciando download de imagens de {total} posts...")

        for i, post in enumerate(posts):
            # Pular vídeos sem thumbnail
            if not post.get("image_urls"):
                continue

            local_paths = self.download_post_images(post)
            post["local_images"] = local_paths

            if (i + 1) % 10 == 0 or (i + 1) == total:
                logger.info(
                    f"  📥 Progresso: {i + 1}/{total} posts | "
                    f"✅ {self._download_count} imagens | "
                    f"❌ {self._error_count} erros"
                )

            # Delay anti-detecção entre posts
            if i < total - 1:
                delay = random.uniform(self.config.min_delay, self.config.max_delay)
                time.sleep(delay)

        logger.info(
            f"✅ Download concluído: {self._download_count} imagens baixadas, "
            f"{self._error_count} erros"
        )

        return posts
