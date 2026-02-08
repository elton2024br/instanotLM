"""
ETAPA 4: Geração de documento consolidado para Google NotebookLM.

O NotebookLM aceita fontes de até ~500K palavras / 25MB por documento.
Este módulo gera um documento Markdown ou texto plano otimizado para:
- Máximo contexto por fonte
- Estrutura navegável (o LLM do NotebookLM entende markdown)
- Preservação de cronologia e metadados
- Separação clara entre legenda e texto OCR
- Índice temático por hashtags

FORMATO IDEAL: Markdown (.md) — o NotebookLM extrai significado semântico
melhor com estrutura de headers e listas do que com texto corrido.
"""
import json
import logging
import os
from collections import Counter
from datetime import datetime
from typing import Optional

from config import Config

logger = logging.getLogger(__name__)


class NotebookLMPrep:
    """Gera documento consolidado otimizado para upload no NotebookLM."""

    def __init__(self, config: Config):
        self.config = config

    def generate(
        self,
        profile_data: dict,
        posts: list[dict],
        extraction_date: Optional[str] = None,
    ) -> str:
        """
        Gera o documento principal para NotebookLM.
        
        Args:
            profile_data: Metadados do perfil
            posts: Lista completa de posts com OCR
            extraction_date: Data da extração (ISO format)
            
        Returns:
            Caminho do arquivo gerado
        """
        self.config.ensure_dirs()
        extraction_date = extraction_date or datetime.now().isoformat()

        # Ordenar posts cronologicamente se configurado
        if self.config.chronological_order:
            posts = sorted(posts, key=lambda p: p.get("date_utc", ""), reverse=False)

        # Construir documento
        sections = []
        sections.append(self._header_section(profile_data, posts, extraction_date))
        sections.append(self._profile_section(profile_data))
        sections.append(self._statistics_section(posts))
        sections.append(self._hashtag_index(posts))
        sections.append(self._location_index(posts))
        sections.append(self._posts_section(posts))
        sections.append(self._timeline_summary(posts))

        document = "\n\n".join(s for s in sections if s)

        # Verificar tamanho
        size_mb = len(document.encode("utf-8")) / (1024 * 1024)
        if size_mb > self.config.max_doc_size_mb:
            logger.warning(
                f"⚠️ Documento gerado ({size_mb:.1f}MB) excede limite do NotebookLM "
                f"({self.config.max_doc_size_mb}MB). Considere dividir em partes."
            )
            # Gerar versão dividida
            self._generate_split_documents(profile_data, posts, extraction_date)

        # Salvar
        output_path = self.config.notebooklm_file
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(document)

        logger.info(
            f"📄 Documento NotebookLM gerado: {output_path} ({size_mb:.1f}MB)"
        )
        return output_path

    def _header_section(self, profile: dict, posts: list, date: str) -> str:
        """Cabeçalho do documento."""
        username = profile.get("username", "unknown")
        return (
            f"# Perfil Instagram: @{username}\n"
            f"## Extração completa para análise\n\n"
            f"- **Data da extração:** {date}\n"
            f"- **Total de posts analisados:** {len(posts)}\n"
            f"- **Posts com texto OCR:** {sum(1 for p in posts if any(p.get('ocr_texts', [])))}\n"
            f"- **Fonte:** https://www.instagram.com/{username}/\n"
            f"\n---"
        )

    def _profile_section(self, profile: dict) -> str:
        """Seção de metadados do perfil."""
        lines = ["## Informações do Perfil\n"]

        fields = [
            ("Nome completo", profile.get("full_name")),
            ("Username", f"@{profile.get('username', '')}"),
            ("Biografia", profile.get("biography")),
            ("Site externo", profile.get("external_url")),
            ("Seguidores", f"{profile.get('followers', 0):,}"),
            ("Seguindo", f"{profile.get('following', 0):,}"),
            ("Total de posts", f"{profile.get('total_posts', 0):,}"),
            ("Verificado", "Sim" if profile.get("is_verified") else "Não"),
            ("Conta business", "Sim" if profile.get("is_business") else "Não"),
            ("Categoria", profile.get("business_category")),
        ]

        for label, value in fields:
            if value:
                lines.append(f"- **{label}:** {value}")

        return "\n".join(lines)

    def _statistics_section(self, posts: list) -> str:
        """Estatísticas agregadas."""
        if not posts:
            return ""

        total_likes = sum(p.get("likes", 0) for p in posts)
        total_comments = sum(p.get("comments_count", 0) for p in posts)
        posts_with_ocr = sum(1 for p in posts if any(t for t in p.get("ocr_texts", []) if t))
        posts_with_location = sum(1 for p in posts if p.get("location"))
        videos = sum(1 for p in posts if p.get("is_video"))
        carousels = sum(1 for p in posts if p.get("typename") == "GraphSidecar")
        images = len(posts) - videos - carousels

        avg_likes = total_likes / len(posts) if posts else 0
        avg_comments = total_comments / len(posts) if posts else 0

        # Posts com mais engajamento
        top_posts = sorted(posts, key=lambda p: p.get("likes", 0), reverse=True)[:5]

        lines = [
            "## Estatísticas Agregadas\n",
            f"- **Total de posts:** {len(posts)}",
            f"- **Imagens:** {images} | **Vídeos:** {videos} | **Carrosséis:** {carousels}",
            f"- **Total de curtidas:** {total_likes:,}",
            f"- **Total de comentários:** {total_comments:,}",
            f"- **Média de curtidas/post:** {avg_likes:,.0f}",
            f"- **Média de comentários/post:** {avg_comments:,.0f}",
            f"- **Posts com texto OCR detectado:** {posts_with_ocr}",
            f"- **Posts com localização:** {posts_with_location}",
            "",
            "### Top 5 Posts (mais curtidos)\n",
        ]

        for i, p in enumerate(top_posts, 1):
            caption_preview = (p.get("caption", "") or "")[:100]
            if len(p.get("caption", "") or "") > 100:
                caption_preview += "..."
            lines.append(
                f"{i}. [{p['shortcode']}]({p['url']}) — "
                f"{p.get('likes', 0):,} curtidas | "
                f"\"{caption_preview}\""
            )

        return "\n".join(lines)

    def _hashtag_index(self, posts: list) -> str:
        """Índice de hashtags mais usadas."""
        all_hashtags = []
        for p in posts:
            all_hashtags.extend(p.get("caption_hashtags", []))

        if not all_hashtags:
            return ""

        counter = Counter(all_hashtags)
        top_30 = counter.most_common(30)

        lines = ["## Índice de Hashtags (Top 30)\n"]
        for tag, count in top_30:
            lines.append(f"- **#{tag}** ({count}x)")

        return "\n".join(lines)

    def _location_index(self, posts: list) -> str:
        """Índice de localizações mencionadas."""
        locations = {}
        for p in posts:
            loc = p.get("location")
            if loc and loc.get("name"):
                name = loc["name"]
                if name not in locations:
                    locations[name] = {"count": 0, "posts": []}
                locations[name]["count"] += 1
                locations[name]["posts"].append(p["shortcode"])

        if not locations:
            return ""

        sorted_locs = sorted(locations.items(), key=lambda x: x[1]["count"], reverse=True)

        lines = ["## Localizações Mencionadas\n"]
        for name, data in sorted_locs[:20]:
            lines.append(f"- **{name}** ({data['count']}x)")

        return "\n".join(lines)

    def _posts_section(self, posts: list) -> str:
        """Seção principal com todos os posts detalhados."""
        lines = [
            "## Todos os Posts\n",
            "Cada post inclui: data, legenda completa, texto extraído via OCR (quando disponível), "
            "e métricas de engajamento.\n",
            "---\n",
        ]

        for i, post in enumerate(posts):
            lines.append(self._format_single_post(post, i + 1))

        return "\n".join(lines)

    def _format_single_post(self, post: dict, number: int) -> str:
        """Formata um único post para o documento."""
        shortcode = post["shortcode"]
        date = post.get("date_utc", "")[:10]  # Apenas data
        typename_map = {
            "GraphImage": "📷 Imagem",
            "GraphVideo": "🎬 Vídeo",
            "GraphSidecar": "📑 Carrossel",
        }
        tipo = typename_map.get(post.get("typename", ""), "📷 Post")

        lines = [
            f"### Post #{number}: {shortcode}",
            f"- **Data:** {date}",
            f"- **Tipo:** {tipo}",
            f"- **URL:** {post.get('url', '')}",
            f"- **Curtidas:** {post.get('likes', 0):,}",
            f"- **Comentários:** {post.get('comments_count', 0):,}",
        ]

        # Localização
        loc = post.get("location")
        if loc and loc.get("name"):
            lines.append(f"- **Local:** {loc['name']}")

        # Hashtags
        hashtags = post.get("caption_hashtags", [])
        if hashtags:
            lines.append(f"- **Hashtags:** {', '.join(f'#{t}' for t in hashtags)}")

        # Menções
        mentions = post.get("caption_mentions", [])
        if mentions:
            lines.append(f"- **Menções:** {', '.join(f'@{m}' for m in mentions)}")

        # Legenda
        caption = post.get("caption", "")
        if caption and self.config.include_captions_in_doc:
            lines.append(f"\n**Legenda:**\n> {caption.replace(chr(10), chr(10) + '> ')}")

        # Texto OCR
        ocr_texts = post.get("ocr_texts", [])
        combined_ocr = "\n".join(t for t in ocr_texts if t)
        if combined_ocr and self.config.include_ocr_in_doc:
            lines.append(f"\n**Texto extraído da imagem (OCR):**\n```\n{combined_ocr}\n```")

        # Descrição de acessibilidade (gerada pelo Instagram)
        accessibility = post.get("accessibility_caption")
        if accessibility:
            lines.append(f"\n**Descrição automática:** {accessibility}")

        lines.append("\n---\n")
        return "\n".join(lines)

    def _timeline_summary(self, posts: list) -> str:
        """Resumo cronológico por mês."""
        if not posts:
            return ""

        monthly = {}
        for p in posts:
            date = p.get("date_utc", "")[:7]  # YYYY-MM
            if date:
                if date not in monthly:
                    monthly[date] = {"count": 0, "likes": 0, "comments": 0}
                monthly[date]["count"] += 1
                monthly[date]["likes"] += p.get("likes", 0)
                monthly[date]["comments"] += p.get("comments_count", 0)

        lines = ["## Timeline: Posts por Mês\n"]
        for month in sorted(monthly.keys()):
            data = monthly[month]
            lines.append(
                f"- **{month}:** {data['count']} posts | "
                f"{data['likes']:,} curtidas | {data['comments']:,} comentários"
            )

        return "\n".join(lines)

    def _generate_split_documents(
        self, profile: dict, posts: list, date: str
    ):
        """Gera múltiplos documentos se o conteúdo exceder o limite."""
        chunk_size = 100  # posts por arquivo
        total_chunks = (len(posts) + chunk_size - 1) // chunk_size

        logger.info(f"📄 Dividindo em {total_chunks} partes de ~{chunk_size} posts...")

        for chunk_idx in range(total_chunks):
            start = chunk_idx * chunk_size
            end = min(start + chunk_size, len(posts))
            chunk_posts = posts[start:end]

            # Gerar documento parcial
            sections = []
            sections.append(
                f"# Perfil @{profile.get('username', '')} — Parte {chunk_idx + 1}/{total_chunks}\n"
                f"Posts {start + 1} a {end} de {len(posts)}\n\n---"
            )
            if chunk_idx == 0:
                sections.append(self._profile_section(profile))
                sections.append(self._statistics_section(posts))

            sections.append(self._posts_section(chunk_posts))

            document = "\n\n".join(s for s in sections if s)

            ext = "md" if self.config.notebooklm_format == "markdown" else "txt"
            output_path = os.path.join(
                self.config.output_dir,
                f"{self.config.username}_notebooklm_part{chunk_idx + 1}.{ext}",
            )

            with open(output_path, "w", encoding="utf-8") as f:
                f.write(document)

            size_mb = len(document.encode("utf-8")) / (1024 * 1024)
            logger.info(f"  📄 Parte {chunk_idx + 1}: {output_path} ({size_mb:.1f}MB)")

    def generate_from_json(self, json_path: str) -> str:
        """
        Gera documento NotebookLM a partir de um JSON já existente.
        
        Args:
            json_path: Caminho para o arquivo JSON completo
            
        Returns:
            Caminho do documento gerado
        """
        with open(json_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        return self.generate(
            profile_data=data.get("perfil", {}),
            posts=data.get("posts", []),
            extraction_date=data.get("data_extracao"),
        )
