#!/usr/bin/env python3
"""
Pipeline completo: Instagram → OCR → NotebookLM

Uso:
    python main.py --username prefeituraubatuba
    python main.py --username prefeituraubatuba --max-posts 50 --ocr-engine tesseract
    python main.py --username prefeituraubatuba --only-notebooklm
    python main.py --username prefeituraubatuba --skip-ocr
"""
import argparse
import json
import logging
import sys
from datetime import datetime

from config import Config
from extractor import InstagramExtractor
from downloader import ImageDownloader
from ocr_processor import OCRProcessor
from notebooklm_prep import NotebookLMPrep

# ============================================================================
# Configuração de logging
# ============================================================================
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(message)s",
    datefmt="%H:%M:%S",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler("pipeline.log", encoding="utf-8"),
    ],
)
logger = logging.getLogger(__name__)


def parse_args() -> argparse.Namespace:
    """Parse argumentos de linha de comando."""
    parser = argparse.ArgumentParser(
        description="Instagram Profile Extractor → NotebookLM Pipeline",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Exemplos:
  python main.py --username prefeituraubatuba
  python main.py --username prefeituraubatuba --max-posts 100
  python main.py --username prefeituraubatuba --only-notebooklm
  python main.py --username prefeituraubatuba --session-file session-myuser
  python main.py --username prefeituraubatuba --proxy-list proxies.txt
        """,
    )

    # Obrigatório
    parser.add_argument(
        "--username", "-u",
        required=True,
        help="Username do perfil Instagram (sem @)",
    )

    # Controle de etapas
    parser.add_argument("--skip-extract", action="store_true", help="Pular extração (usar JSON existente)")
    parser.add_argument("--skip-download", action="store_true", help="Pular download de imagens")
    parser.add_argument("--skip-ocr", action="store_true", help="Pular OCR nas imagens")
    parser.add_argument("--only-notebooklm", action="store_true", help="Apenas gerar documento NotebookLM de dados existentes")

    # Extração
    parser.add_argument("--max-posts", type=int, default=0, help="Máximo de posts (0=todos)")
    parser.add_argument("--no-reels", action="store_true", help="Excluir reels")

    # Anti-detecção
    parser.add_argument("--min-delay", type=float, default=3.0, help="Delay mínimo entre requests (segundos)")
    parser.add_argument("--max-delay", type=float, default=7.0, help="Delay máximo entre requests (segundos)")
    parser.add_argument("--proxy-list", type=str, help="Arquivo com lista de proxies (um por linha)")

    # Autenticação
    parser.add_argument("--session-file", type=str, help="Arquivo de sessão do Instaloader")
    parser.add_argument("--ig-user", type=str, help="Username Instagram para login")
    parser.add_argument("--ig-pass", type=str, help="Senha Instagram para login")

    # OCR
    parser.add_argument("--ocr-engine", choices=["easyocr", "tesseract"], default="easyocr", help="Engine OCR")
    parser.add_argument("--ocr-gpu", action="store_true", help="Usar GPU para EasyOCR")
    parser.add_argument("--ocr-langs", nargs="+", default=["pt", "en"], help="Idiomas OCR (ex: pt en es)")

    # NotebookLM
    parser.add_argument("--notebooklm-format", choices=["markdown", "text"], default="markdown")
    parser.add_argument("--no-ocr-in-doc", action="store_true", help="Excluir OCR do documento NotebookLM")
    parser.add_argument("--reverse-chrono", action="store_true", help="Posts em ordem mais recente primeiro")

    # Output
    parser.add_argument("--output-dir", type=str, default="data", help="Diretório base de saída")

    return parser.parse_args()


def build_config(args: argparse.Namespace) -> Config:
    """Constrói Config a partir dos argumentos CLI."""
    config = Config(
        username=args.username.lstrip("@").strip("/").split("/")[-1],  # limpar input
        base_dir=args.output_dir,
        max_posts=args.max_posts,
        include_reels=not args.no_reels,
        min_delay=args.min_delay,
        max_delay=args.max_delay,
        session_file=args.session_file,
        instagram_user=args.ig_user,
        instagram_pass=args.ig_pass,
        ocr_engine=args.ocr_engine,
        ocr_languages=args.ocr_langs,
        ocr_gpu=args.ocr_gpu,
        notebooklm_format=args.notebooklm_format,
        include_ocr_in_doc=not args.no_ocr_in_doc,
        chronological_order=not args.reverse_chrono,
    )

    # Carregar proxies se fornecido
    if args.proxy_list:
        try:
            with open(args.proxy_list) as f:
                config.proxy_list = [line.strip() for line in f if line.strip()]
            config.proxy_rotation = True
            logger.info(f"🔄 {len(config.proxy_list)} proxies carregados")
        except FileNotFoundError:
            logger.warning(f"⚠️ Arquivo de proxies não encontrado: {args.proxy_list}")

    return config


def run_pipeline(config: Config, args: argparse.Namespace):
    """Executa o pipeline completo."""
    config.ensure_dirs()

    start_time = datetime.now()
    logger.info(f"🚀 Pipeline iniciado para @{config.username}")
    logger.info(f"   Saída: {config.output_dir}")

    profile_data = {}
    posts = []

    # =====================================================================
    # ETAPA 1: Extração de posts
    # =====================================================================
    if not args.skip_extract and not args.only_notebooklm:
        logger.info("=" * 60)
        logger.info("📋 ETAPA 1: Extração de posts do perfil")
        logger.info("=" * 60)

        extractor = InstagramExtractor(config)
        profile_data, posts = extractor.run()
    else:
        # Carregar dados existentes
        try:
            with open(config.posts_json, "r", encoding="utf-8") as f:
                data = json.load(f)
            profile_data = data.get("perfil", {})
            posts = data.get("posts", [])
            logger.info(f"📂 Dados existentes carregados: {len(posts)} posts")
        except FileNotFoundError:
            logger.error(f"❌ Arquivo não encontrado: {config.posts_json}")
            logger.error("   Execute sem --skip-extract primeiro.")
            raise SystemExit(1)

    # =====================================================================
    # ETAPA 2: Download de imagens
    # =====================================================================
    if not args.skip_download and not args.only_notebooklm:
        logger.info("=" * 60)
        logger.info("📥 ETAPA 2: Download de imagens")
        logger.info("=" * 60)

        downloader = ImageDownloader(config)
        posts = downloader.download_all(posts)

        # Salvar progresso
        _save_full_data(config, profile_data, posts)

    # =====================================================================
    # ETAPA 3: OCR nas imagens
    # =====================================================================
    if not args.skip_ocr and not args.only_notebooklm:
        logger.info("=" * 60)
        logger.info("🔍 ETAPA 3: OCR nas imagens")
        logger.info("=" * 60)

        ocr = OCRProcessor(config)
        posts = ocr.process_all_posts(posts)
        ocr.save_ocr_results(posts)

        # Salvar progresso
        _save_full_data(config, profile_data, posts)

    # =====================================================================
    # ETAPA 4: Gerar documento para NotebookLM
    # =====================================================================
    logger.info("=" * 60)
    logger.info("📄 ETAPA 4: Geração do documento NotebookLM")
    logger.info("=" * 60)

    prep = NotebookLMPrep(config)

    if args.only_notebooklm:
        output_path = prep.generate_from_json(config.full_data_json)
    else:
        output_path = prep.generate(profile_data, posts)

    # =====================================================================
    # Resumo final
    # =====================================================================
    elapsed = datetime.now() - start_time
    logger.info("=" * 60)
    logger.info("🏁 PIPELINE CONCLUÍDO")
    logger.info("=" * 60)
    logger.info(f"   Perfil: @{config.username}")
    logger.info(f"   Posts processados: {len(posts)}")
    logger.info(f"   Tempo total: {elapsed}")
    logger.info(f"   📄 Documento NotebookLM: {output_path}")
    logger.info(f"   📊 Dados completos: {config.full_data_json}")
    logger.info("")
    logger.info("   👉 Faça upload do arquivo .md no Google NotebookLM:")
    logger.info("      https://notebooklm.google.com/")


def _save_full_data(config: Config, profile_data: dict, posts: list):
    """Salva dados completos (intermediário e final)."""
    output = {
        "perfil": profile_data,
        "data_extracao": datetime.now().isoformat(),
        "total_posts_perfil": profile_data.get("total_posts", 0),
        "posts_extraidos": len(posts),
        "posts": posts,
    }
    with open(config.full_data_json, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)


def main():
    args = parse_args()
    config = build_config(args)

    try:
        run_pipeline(config, args)
    except KeyboardInterrupt:
        logger.info("\n⏹️ Pipeline interrompido pelo usuário.")
        sys.exit(0)
    except SystemExit:
        raise
    except Exception as e:
        logger.exception(f"❌ Erro fatal: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
