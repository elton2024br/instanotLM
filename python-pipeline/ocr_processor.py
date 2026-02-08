"""
ETAPA 3: OCR (Reconhecimento Óptico de Caracteres) nas imagens.

Engines suportadas:
- EasyOCR (padrão): Melhor precisão, suporte nativo a múltiplos idiomas, GPU opcional
- Tesseract (fallback): Mais rápido, requer instalação separada

Para imagens do Instagram (posts gráficos, infográficos, flyers):
- EasyOCR geralmente tem performance superior
- Pré-processamento com Pillow melhora resultados em imagens com fundo complexo
"""
import json
import logging
import os
from typing import Optional

from PIL import Image, ImageEnhance, ImageFilter

from config import Config

logger = logging.getLogger(__name__)


class OCRProcessor:
    """Processa imagens com OCR para extração de texto."""

    def __init__(self, config: Config):
        self.config = config
        self._reader = None  # lazy init para EasyOCR
        self._processed = 0
        self._with_text = 0
        self._errors = 0

    def _init_easyocr(self):
        """Inicializa EasyOCR reader (lazy loading - demora na primeira vez)."""
        if self._reader is not None:
            return

        try:
            import easyocr
            logger.info("🔄 Inicializando EasyOCR (primeira vez pode demorar)...")
            self._reader = easyocr.Reader(
                self.config.ocr_languages,
                gpu=self.config.ocr_gpu,
                verbose=False,
            )
            logger.info("✅ EasyOCR inicializado")
        except ImportError:
            logger.error(
                "❌ EasyOCR não instalado. Instale com: pip install easyocr\n"
                "   Ou use --ocr-engine tesseract"
            )
            raise

    def _preprocess_image(self, image_path: str) -> Image.Image:
        """
        Pré-processa a imagem para melhorar resultados do OCR.
        
        Otimizado para posts do Instagram que frequentemente têm:
        - Texto sobre fotos/gradientes
        - Fontes decorativas
        - Baixo contraste texto/fundo
        """
        img = Image.open(image_path)

        # Converter para RGB se necessário
        if img.mode != "RGB":
            img = img.convert("RGB")

        # Redimensionar se muito grande (OCR não precisa de resolução extrema)
        max_dim = 2000
        if max(img.size) > max_dim:
            ratio = max_dim / max(img.size)
            new_size = (int(img.width * ratio), int(img.height * ratio))
            img = img.resize(new_size, Image.LANCZOS)

        # Aumentar contraste levemente
        enhancer = ImageEnhance.Contrast(img)
        img = enhancer.enhance(1.3)

        # Aumentar nitidez
        enhancer = ImageEnhance.Sharpness(img)
        img = enhancer.enhance(1.5)

        return img

    def ocr_easyocr(self, image_path: str) -> str:
        """
        Executa OCR usando EasyOCR.
        
        Returns:
            Texto extraído da imagem
        """
        self._init_easyocr()

        try:
            # EasyOCR aceita tanto path quanto numpy array
            results = self._reader.readtext(
                image_path,
                detail=1,  # retorna (bbox, text, confidence)
                paragraph=True,  # agrupar em parágrafos
            )

            # Filtrar por confiança mínima e juntar texto
            lines = []
            for detection in results:
                if len(detection) >= 3:
                    bbox, text, confidence = detection[0], detection[1], detection[2]
                elif len(detection) == 2:
                    text, confidence = detection[0], detection[1]
                else:
                    continue

                if confidence >= self.config.ocr_confidence_threshold:
                    lines.append(text.strip())

            return "\n".join(lines)

        except Exception as e:
            logger.debug(f"EasyOCR erro em {os.path.basename(image_path)}: {e}")
            return ""

    def ocr_tesseract(self, image_path: str) -> str:
        """
        Executa OCR usando Tesseract (fallback).
        
        Returns:
            Texto extraído da imagem
        """
        try:
            import pytesseract

            img = self._preprocess_image(image_path)

            text = pytesseract.image_to_string(
                img,
                lang=self.config.tesseract_languages,
                config="--psm 6",  # Assume bloco uniforme de texto
            )

            return text.strip()

        except ImportError:
            logger.error(
                "❌ pytesseract não instalado. Instale com: pip install pytesseract\n"
                "   E instale o Tesseract: sudo apt install tesseract-ocr tesseract-ocr-por"
            )
            return ""
        except Exception as e:
            logger.debug(f"Tesseract erro em {os.path.basename(image_path)}: {e}")
            return ""

    def process_image(self, image_path: str) -> str:
        """
        Processa uma única imagem com OCR.
        Usa engine configurada com fallback automático.
        
        Returns:
            Texto extraído (string vazia se sem texto)
        """
        if not os.path.exists(image_path):
            logger.debug(f"Arquivo não encontrado: {image_path}")
            return ""

        try:
            if self.config.ocr_engine == "easyocr":
                text = self.ocr_easyocr(image_path)
                # Fallback para Tesseract se EasyOCR retornar vazio
                if not text.strip():
                    text = self.ocr_tesseract(image_path)
            else:
                text = self.ocr_tesseract(image_path)
                if not text.strip():
                    try:
                        text = self.ocr_easyocr(image_path)
                    except Exception:
                        pass

            return text.strip()

        except Exception as e:
            logger.warning(f"⚠️ OCR falhou em {os.path.basename(image_path)}: {e}")
            self._errors += 1
            return ""

    def process_all_posts(self, posts: list[dict]) -> list[dict]:
        """
        Executa OCR em todas as imagens de todos os posts.
        
        Args:
            posts: Lista de dicts com dados dos posts (deve conter 'local_images')
            
        Returns:
            Lista atualizada com textos OCR
        """
        total_images = sum(len(p.get("local_images", [])) for p in posts)
        logger.info(
            f"🔍 Iniciando OCR em {total_images} imagens de {len(posts)} posts "
            f"(engine: {self.config.ocr_engine})..."
        )

        for i, post in enumerate(posts):
            local_images = post.get("local_images", [])
            ocr_texts = []

            for img_path in local_images:
                text = self.process_image(img_path)
                ocr_texts.append(text)
                self._processed += 1
                if text:
                    self._with_text += 1

            post["ocr_texts"] = ocr_texts

            if (i + 1) % 20 == 0 or (i + 1) == len(posts):
                logger.info(
                    f"  🔍 Progresso: {i + 1}/{len(posts)} posts | "
                    f"📝 {self._with_text}/{self._processed} com texto | "
                    f"❌ {self._errors} erros"
                )

        logger.info(
            f"✅ OCR concluído: {self._processed} imagens processadas, "
            f"{self._with_text} com texto detectado, {self._errors} erros"
        )

        return posts

    def save_ocr_results(self, posts: list[dict]) -> str:
        """
        Salva resultados OCR em arquivo JSON separado.
        
        Returns:
            Caminho do arquivo salvo
        """
        self.config.ensure_dirs()
        
        ocr_data = {}
        for post in posts:
            shortcode = post["shortcode"]
            texts = post.get("ocr_texts", [])
            combined = "\n---\n".join(t for t in texts if t)
            if combined:
                ocr_data[shortcode] = {
                    "texto_combinado": combined,
                    "textos_por_imagem": texts,
                    "num_imagens": len(texts),
                    "num_com_texto": sum(1 for t in texts if t),
                }

        output_path = self.config.ocr_json
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(ocr_data, f, ensure_ascii=False, indent=2)

        logger.info(f"💾 Resultados OCR salvos em: {output_path}")
        return output_path
