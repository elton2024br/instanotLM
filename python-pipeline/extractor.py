"""
ETAPA 1: Extração de posts do perfil Instagram usando Instaloader.

Instaloader é a biblioteca mais robusta e mantida para extração de dados
públicos do Instagram. Ele lida automaticamente com:
- Paginação (GraphQL API)
- Rate limiting
- Sessões autenticadas
- Metadados completos (legendas, datas, likes, etc.)
"""
import json
import logging
import time
import random
from datetime import datetime
from typing import Optional

import instaloader
from instaloader import Profile, Post
from instaloader.exceptions import (
    ProfileNotExistsException,
    PrivateProfileNotFollowedException,
    LoginRequiredException,
    ConnectionException,
    QueryReturnedBadRequestException,
)

from config import Config

logger = logging.getLogger(__name__)


class InstagramExtractor:
    """Extrai metadados de todos os posts de um perfil público."""

    def __init__(self, config: Config):
        self.config = config
        self.loader = self._create_loader()
        self.profile: Optional[Profile] = None

    def _create_loader(self) -> instaloader.Instaloader:
        """Configura o Instaloader com opções anti-detecção."""
        L = instaloader.Instaloader(
            download_pictures=False,  # controlaremos o download separadamente
            download_videos=False,
            download_video_thumbnails=False,
            download_geotags=False,
            download_comments=False,
            save_metadata=False,
            compress_json=False,
            request_timeout=self.config.request_timeout,
            max_connection_attempts=self.config.max_retries,
            user_agent=random.choice(self.config.user_agents),
        )

        # Carregar sessão autenticada se disponível
        if self.config.session_file:
            try:
                L.load_session_from_file(
                    self.config.instagram_user or "session",
                    self.config.session_file
                )
                logger.info("✅ Sessão autenticada carregada com sucesso")
            except Exception as e:
                logger.warning(f"⚠️ Falha ao carregar sessão: {e}. Continuando sem autenticação.")
        elif self.config.instagram_user and self.config.instagram_pass:
            try:
                L.login(self.config.instagram_user, self.config.instagram_pass)
                logger.info("✅ Login realizado com sucesso")
            except Exception as e:
                logger.warning(f"⚠️ Falha no login: {e}. Continuando sem autenticação.")

        return L

    def load_profile(self) -> dict:
        """
        Carrega o perfil e retorna metadados básicos.
        
        Returns:
            dict com informações do perfil
            
        Raises:
            SystemExit se o perfil não existir ou for privado
        """
        try:
            self.profile = Profile.from_username(
                self.loader.context, self.config.username
            )
        except ProfileNotExistsException:
            logger.error(f"❌ Perfil @{self.config.username} não existe.")
            raise SystemExit(1)
        except ConnectionException as e:
            logger.error(f"❌ Erro de conexão ao acessar @{self.config.username}: {e}")
            raise SystemExit(1)

        if self.profile.is_private:
            logger.error(
                f"🔒 Perfil @{self.config.username} é PRIVADO. "
                "Necessário sessão autenticada de um seguidor."
            )
            raise SystemExit(1)

        profile_data = {
            "username": self.profile.username,
            "full_name": self.profile.full_name,
            "biography": self.profile.biography,
            "external_url": self.profile.external_url,
            "followers": self.profile.followers,
            "following": self.profile.followees,
            "total_posts": self.profile.mediacount,
            "is_verified": self.profile.is_verified,
            "is_business": self.profile.is_business_account,
            "business_category": self.profile.business_category_name,
            "profile_pic_url": self.profile.profile_pic_url,
        }

        logger.info(
            f"📊 Perfil @{self.config.username}: "
            f"{profile_data['total_posts']} posts | "
            f"{profile_data['followers']} seguidores"
        )

        return profile_data

    def extract_posts(self) -> list[dict]:
        """
        Extrai metadados de todos os posts do perfil.
        
        Returns:
            Lista de dicts com dados de cada post
        """
        if not self.profile:
            self.load_profile()

        posts_data = []
        max_posts = self.config.max_posts or float("inf")
        
        logger.info(
            f"🔄 Iniciando extração de posts "
            f"(limite: {'todos' if max_posts == float('inf') else max_posts})..."
        )

        try:
            for i, post in enumerate(self.profile.get_posts()):
                if i >= max_posts:
                    break

                post_info = self._extract_post_data(post)
                posts_data.append(post_info)

                if (i + 1) % 10 == 0:
                    logger.info(f"  📝 {i + 1} posts extraídos...")

                # Delay anti-detecção
                delay = random.uniform(
                    self.config.min_delay * 0.3,  # extração de metadados é mais leve
                    self.config.max_delay * 0.5,
                )
                time.sleep(delay)

        except QueryReturnedBadRequestException:
            logger.warning(
                "⚠️ Instagram retornou BadRequest. Possível rate limit. "
                f"Salvando {len(posts_data)} posts extraídos até agora."
            )
        except LoginRequiredException:
            logger.warning(
                "⚠️ Instagram exige login para continuar. "
                "Configure sessão autenticada para extrair mais posts. "
                f"Salvando {len(posts_data)} posts extraídos até agora."
            )
        except ConnectionException as e:
            logger.warning(
                f"⚠️ Erro de conexão: {e}. "
                f"Salvando {len(posts_data)} posts extraídos até agora."
            )

        logger.info(f"✅ Total de posts extraídos: {len(posts_data)}")
        return posts_data

    def _extract_post_data(self, post: Post) -> dict:
        """Extrai dados detalhados de um único post."""
        
        # Coletar URLs de imagens (incluindo carrosséis)
        image_urls = []
        if post.typename == "GraphSidecar":  # Carrossel
            try:
                for node in post.get_sidecar_nodes():
                    if not node.is_video:
                        image_urls.append(node.display_url)
                    else:
                        # Para vídeos, pegar thumbnail
                        image_urls.append(node.display_url)
            except Exception as e:
                logger.debug(f"Erro ao processar carrossel {post.shortcode}: {e}")
                image_urls.append(post.url)
        elif not post.is_video:
            image_urls.append(post.url)
        else:
            # Vídeo: pegar thumbnail
            image_urls.append(post.url)

        # Dados do post
        data = {
            "shortcode": post.shortcode,
            "url": f"https://www.instagram.com/p/{post.shortcode}/",
            "typename": post.typename,  # GraphImage, GraphVideo, GraphSidecar
            "date_utc": post.date_utc.isoformat(),
            "date_local": post.date_local.isoformat() if post.date_local else None,
            "caption": post.caption or "",
            "caption_hashtags": list(post.caption_hashtags) if post.caption_hashtags else [],
            "caption_mentions": list(post.caption_mentions) if post.caption_mentions else [],
            "likes": post.likes,
            "comments_count": post.comments,
            "is_video": post.is_video,
            "video_view_count": post.video_view_count if post.is_video else None,
            "image_urls": image_urls,
            "location": None,
            "accessibility_caption": post.accessibility_caption,
            # Campos preenchidos nas etapas seguintes
            "local_images": [],
            "ocr_texts": [],
        }

        # Localização (se disponível)
        if post.location:
            data["location"] = {
                "name": post.location.name,
                "lat": post.location.lat,
                "lng": post.location.lng,
            }

        return data

    def save_posts(self, profile_data: dict, posts_data: list[dict]) -> str:
        """
        Salva os dados extraídos em JSON.
        
        Returns:
            Caminho do arquivo salvo
        """
        self.config.ensure_dirs()
        
        output = {
            "perfil": profile_data,
            "data_extracao": datetime.now().isoformat(),
            "total_posts_perfil": profile_data.get("total_posts", 0),
            "posts_extraidos": len(posts_data),
            "posts": posts_data,
        }

        output_path = self.config.posts_json
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(output, f, ensure_ascii=False, indent=2)

        logger.info(f"💾 Dados salvos em: {output_path}")
        return output_path

    def run(self) -> tuple[dict, list[dict]]:
        """
        Executa a extração completa.
        
        Returns:
            Tupla (profile_data, posts_data)
        """
        profile_data = self.load_profile()
        posts_data = self.extract_posts()
        self.save_posts(profile_data, posts_data)
        return profile_data, posts_data
